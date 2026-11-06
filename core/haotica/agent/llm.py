"""Локальные модели: клиент llama-server (OpenAI-совместимый, потоковый, с вызовом инструментов)
и жизненный цикл служб haotica-llm-* (загрузка по требованию, переключение base ⇄ deep, режим «Игра»).

Две основные модели работают по очереди — вместе они не помещаются в общую память:
  base — Qwen3.8-27B: терминал, команды, повседневное, инструменты, зрение;
  deep — Qwen3-Coder-Next 80B-A3B: длинные и глубокие задачи (код, анализ проектов, большие тексты).
Режим haotica.model_mode: auto (Haotica выбирает сама), base, deep. После глубокой задачи и
haotica.deep_idle_min минут простоя она возвращается на base. Облачные помощники (DeepSeek V4.1 Flash,
Claude Haiku 5.5) доступны обеим моделям одинаково — как инструмент cloud_ask (§15.5).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections.abc import AsyncIterator

import aiohttp

from .. import config, models, paths, services

log = logging.getLogger("haotica.llm")
UNIT = "haotica-llm-{}.service"
MAIN = models.MAIN_ROLES                       # ("base", "deep")
# признаки «глубокой» задачи: большой код, проект целиком, долгий разбор
DEEP_HINTS = re.compile(
    r"(рефактор|отрефактор|архитектур|весь проект|по всему проекту|репозитор|кодовой баз|напиши (программ|модул|сервис|приложени)"
    r"|разбери подробно|глубок|подумай как следует|deep|refactor|architecture|whole (repo|project|codebase)|code ?review"
    r"|implement|миграци|перепиши)", re.IGNORECASE)


BACK_TO_DEEP_S = 600                           # deep основная: base (после картинки) держим до 10 мин простоя


class LLM:
    def __init__(self) -> None:
        self.session: aiohttp.ClientSession | None = None
        self.state = {"base": "offline", "deep": "offline", "fast": "offline"}
        self.tps = 0.0
        self.last_used = {"base": 0.0, "deep": 0.0, "fast": 0.0}
        self.main = "base"                      # какая из основных сейчас выбрана
        self.switching = ""                     # куда переключаемся (для интерфейса)
        self.paused = False                     # режим «Игра»: основные модели выгружены
        self._starting: dict[str, asyncio.Task] = {}
        self._switch_lock = asyncio.Lock()
        self.errors: dict[str, str] = {}              # роль → почему не запустилась (показывается владельцу)

    async def start(self) -> None:
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, sock_connect=3))
        asyncio.create_task(self._watch())

    async def stop(self) -> None:
        if self.session:
            await self.session.close()

    def url(self, role: str) -> str:
        return f"http://{paths.HOST}:{models.PORTS[role]}"

    async def health(self, role: str) -> str:
        try:
            async with self.session.get(self.url(role) + "/health", timeout=aiohttp.ClientTimeout(total=2)) as r:
                if r.status == 200:
                    return "ready"
                return "loading" if r.status == 503 else "error"
        except (aiohttp.ClientError, asyncio.TimeoutError, OSError):
            return "offline"

    async def _watch(self) -> None:
        """Состояние моделей раз в 3 с; после глубокой задачи — возврат на base по простою."""
        while True:
            for role in self.state:
                self.state[role] = await self.health(role)
            ha = config.load().get("haotica", {})
            idle = float(ha.get("deep_idle_min", 10)) * 60
            if (ha.get("model_mode", "auto") == "auto" and self.prefer_deep(ha) and self.main == "base" and not self.paused
                    and not self.switching and self.state["base"] == "ready" and self._deep_ok()
                    and time.time() - self.last_used["base"] > BACK_TO_DEEP_S):
                log.info("base простаивает — возвращаюсь на основную deep")
                asyncio.create_task(self.use("deep"))
            if (ha.get("model_mode", "auto") == "auto" and self.main == "deep" and not self.paused
                    and not self.prefer_deep(ha)                             # deep основная — не гоняем туда-обратно
                    and self.state["deep"] == "ready" and time.time() - self.last_used["deep"] > idle):
                log.info("deep простаивает %.0f мин — возвращаюсь на base", idle / 60)
                asyncio.create_task(self.use("base"))
            await asyncio.sleep(3)

    # ── выбор модели ───────────────────────────────────────────
    @staticmethod
    def prefer_deep(ha: dict) -> bool:
        """deep — основная в «авто», если владелец включил haotica.prefer_deep (Настройки → «Deep (80B) — основная»).
        По умолчанию выключено: на 56 ГиБ deep (≈40 ГБ) + голос на процессоре + браузер оставляли ~1 ГБ."""
        return bool(ha.get("prefer_deep", False))

    def memory_for(self, role: str) -> tuple[bool, str]:
        """Хватит ли оперативной памяти поднять модель (с учётом той, что выгрузится при переключении)."""
        try:
            import psutil
            st = models.status()
        except Exception:  # noqa: BLE001
            return True, ""
        need = st.get(role, {}).get("size", 0) + 4 * 2 ** 30
        other = "base" if role == "deep" else "deep"
        freed = st.get(other, {}).get("size", 0) if self.state.get(other) in ("ready", "loading") else 0
        have = psutil.virtual_memory().available + freed
        if have >= need:
            return True, ""
        return False, (f"мало оперативной памяти для {role}: нужно ≈{need / 2 ** 30:.0f} ГиБ, свободно "
                       f"≈{have / 2 ** 30:.0f} ГиБ — закройте тяжёлые программы")

    def _deep_ok(self) -> bool:
        """deep можно брать: файл целиком и проверен, и она не падала при запуске в этом сеансе."""
        if "deep" in self.errors:
            return False
        try:
            st = models.status().get("deep", {})
        except Exception:  # noqa: BLE001
            return False
        return bool(st.get("ready") and st.get("verified"))

    def route(self, text: str = "", ctx_tokens: int = 0, source: str = "", want: str = "", images: bool = False) -> str:
        """Какая основная модель нужна для этого хода."""
        ha = config.load().get("haotica", {})
        mode = ha.get("model_mode", "auto")
        if mode in MAIN:
            return mode
        if want in MAIN:                          # явная просьба: /deep, /base, «подумай глубоко»
            return want
        if images:                                # зрение есть только у base
            return "base"
        if source in ("complete", "terminal_block", "shell"):
            return self.main if self.state.get(self.main) == "ready" else "base"   # не перегружать модель ради мелочи
        # Windows: deep (MoE, ~3B активных) отвечает в ~4 раза быстрее base (≈40 против ≈10 ток/с на Radeon 8060S)
        # и сильнее в коде — в режиме «авто» она основная, если скачана и проверена; base — для изображений
        if self.prefer_deep(ha) and self._deep_ok():
            # только что работала base (например, смотрела картинку) — текст отвечает она же: перезагрузка на deep
            # стоит 35–45 с, а туда-обратно на каждом сообщении — это и были «лаги». На deep — после простоя
            # (_watch) или для большой задачи.
            if (self.main == "base" and self.state.get("base") == "ready"
                    and time.time() - self.last_used["base"] < BACK_TO_DEEP_S and not DEEP_HINTS.search(text or "")):
                return "base"
            return "deep"
        base_ctx = min(int(ha.get("context_size", 131072)), 65536)
        if ctx_tokens > base_ctx * 0.75:          # длинный контекст — в deep (у него кэш дешевле)
            return "deep"
        if text and (DEEP_HINTS.search(text) or text.count("\n") > 120 or len(text) > 12000):
            return "deep"
        return self.main if self.main == "deep" and time.time() - self.last_used["deep"] < 120 else "base"

    async def use(self, role: str, timeout: float = 300) -> bool:
        """Переключить основную модель (остановить другую и дождаться освобождения памяти)."""
        if role not in MAIN:
            return await self.ensure(role, timeout)
        async with self._switch_lock:
            other = "deep" if role == "base" else "base"
            if self.main == role and await self.health(role) == "ready":
                return True
            fits, why = self.memory_for(role)
            explicit = config.get("haotica.model_mode", "auto") == role or self.prefer_deep(config.get("haotica", {}) or {})
            if not fits and not explicit:              # «авто» не валит систему; явный выбор владельца — пробуем
                log.warning(why)
                self.errors[role] = why
                return False
            if not fits:
                log.warning("%s — запускаю по выбору владельца", why)
            self.switching = role
            try:
                if await self.health(other) != "offline" or services.supervised():
                    await services.stop(f"llm-{other}")
                    self.state[other] = "sleep"
                self.main = role
                ok = await self.ensure(role, timeout)
                if not ok and role == "deep":
                    self.main = "base"                 # deep не поднялась — откат на base
                    asyncio.create_task(self.ensure("base", timeout))
                return ok
            finally:
                self.switching = ""

    async def ensure(self, role: str, timeout: float = 300) -> bool:
        """Запустить службу модели и дождаться готовности."""
        if await self.health(role) == "ready":
            return True
        if role in self._starting and not self._starting[role].done():
            return await self._starting[role]

        async def boot() -> bool:
            self.errors.pop(role, None)
            started, err = await services.start(f"llm-{role}")
            if not started and await self.health(role) == "offline":
                log.warning("не удалось запустить %s: %s", role, err[:200])
                self.state[role] = "error"
                self.errors[role] = err[:300]
                return False
            t0 = time.time()
            while time.time() - t0 < timeout:
                st = await self.health(role)
                self.state[role] = st if st != "offline" else "loading"
                if st == "ready":
                    return True
                why = services.error(f"llm-{role}")
                if why:                                 # супервизор сдался (память, файл) — не ждём 10 минут
                    log.warning("%s не поднялась: %s", role, why)
                    self.state[role] = "error"
                    self.errors[role] = why
                    return False
                await asyncio.sleep(1.5)
            self.errors[role] = f"не ответила за {int(timeout)} с"
            return False
        self._starting[role] = asyncio.create_task(boot())
        return await self._starting[role]

    async def unload(self, role: str) -> None:
        await services.stop(f"llm-{role}")
        self.state[role] = "sleep"

    async def pause(self, on: bool) -> None:
        """Режим «Игра»: основные модели выгружаются; после — возвращается base."""
        self.paused = on
        if on:
            for role in MAIN:
                await self.unload(role)
        else:
            self.main = "base"
            asyncio.create_task(self.ensure("base"))

    def status(self) -> dict:
        m = models.load_manifest()["models"]
        return {"main": self.main, "switching": self.switching, "paused": self.paused, "state": dict(self.state),
                "tps": self.tps, "labels": {r: m[r]["label"] for r in m}, "errors": dict(self.errors)}

    # ── генерация ──────────────────────────────────────────────
    async def chat(self, messages: list[dict], tools: list[dict] | None = None, role: str = "",
                   max_tokens: int = 2048, think: bool | None = None, stop: list[str] | None = None,
                   effort: str = "") -> AsyncIterator[dict]:
        """События: {'type':'delta','text'}, {'type':'reasoning','text'}, {'type':'tool_calls','calls':[...]},
        {'type':'done','usage','tps'}. Выборка — рекомендованная для модели (см. models.SAMPLING);
        у base «мысли» включаются только для сложных ходов (think=True), у deep их нет вовсе."""
        role = role or self.main
        self.last_used[role] = time.time()
        smp = dict(models.SAMPLING["base_think" if role == "base" and think else role])
        body: dict = {"model": role, "messages": messages, "stream": True, "max_tokens": max_tokens,
                      "cache_prompt": True, "stream_options": {"include_usage": True}, **smp}
        if role == "base":
            kw: dict = {"enable_thinking": bool(think)}
            body["chat_template_kwargs"] = kw
            if think and effort:
                body["reasoning_effort"] = effort
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"
            body["parallel_tool_calls"] = True
        if stop:
            body["stop"] = stop
        calls: dict[int, dict] = {}
        usage, timings = {}, {}
        async with self.session.post(self.url(role) + "/v1/chat/completions", json=body) as r:
            if r.status != 200:
                txt = await r.text()
                raise RuntimeError(f"llama-server {r.status}: {txt[:300]}")
            async for raw in r.content:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    ev = json.loads(data)
                except ValueError:
                    continue
                if ev.get("error"):                  # ошибка посреди потока — раньше молча превращалась в пустое «…»
                    err = ev["error"]
                    raise RuntimeError(f"llama-server: {err.get('message', err) if isinstance(err, dict) else err}"[:400])
                if ev.get("usage"):
                    usage = ev["usage"]
                if ev.get("timings"):
                    timings = ev["timings"]
                for ch in ev.get("choices", []):
                    d = ch.get("delta") or {}
                    if d.get("content"):
                        yield {"type": "delta", "text": d["content"]}
                    if d.get("reasoning_content"):
                        yield {"type": "reasoning", "text": d["reasoning_content"]}
                    for tc in d.get("tool_calls") or []:
                        i = tc.get("index", 0)
                        c = calls.setdefault(i, {"id": tc.get("id") or f"call_{i}", "name": "", "arguments": ""})
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            c["name"] += fn["name"]
                        if fn.get("arguments"):
                            c["arguments"] += fn["arguments"]
                        if tc.get("id"):
                            c["id"] = tc["id"]
        if calls:
            yield {"type": "tool_calls", "calls": [calls[i] for i in sorted(calls)]}
        if timings.get("predicted_per_second") and int(timings.get("predicted_n") or 0) >= 8:   # не по 1–2 токенам
            self.tps = round(float(timings["predicted_per_second"]), 1)
        yield {"type": "done", "usage": usage, "tps": self.tps, "timings": timings}

    async def complete(self, messages: list[dict], role: str = "fast", max_tokens: int = 48,
                       temperature: float | None = None, stop: list[str] | None = None, timeout: float = 4) -> str:
        """Короткий ответ без потока (подсказки, классификация, сводки)."""
        self.last_used[role] = time.time()
        smp = dict(models.SAMPLING.get(role, {}))
        if temperature is not None:
            smp["temperature"] = temperature
        body = {"model": role, "messages": messages, "stream": False, "max_tokens": max_tokens,
                "cache_prompt": True, **smp, **({"stop": stop} if stop else {})}
        if role == "base":
            body["chat_template_kwargs"] = {"enable_thinking": False}
        try:
            async with self.session.post(self.url(role) + "/v1/chat/completions", json=body,
                                         timeout=aiohttp.ClientTimeout(total=timeout)) as r:
                if r.status != 200:
                    return ""
                d = await r.json()
                return (d.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
            return ""
