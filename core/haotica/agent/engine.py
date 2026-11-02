"""Движок Haotica: ход разговора, инструменты, карточки разрешений, состояние для оболочки.

Ход: системная инструкция (persona) + память + конспект + история → выбор модели (LLM.route) →
поток ответа → вызовы инструментов (Tools.run) → карточки [TAB]/[ESC] там, где нужно разрешение →
итоговый ответ в память. Всё, что уходит модели, проходит через safety.redact.
Без облачного ключа и без синтеза речи Haotica работает молча и полностью локально.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import mimetypes
import re
import time
import uuid
from collections import OrderedDict
from collections.abc import AsyncIterator
from pathlib import Path

from .. import config, models, paths, util
from ..server.hub import Hub
from . import persona, safety, tools
from .cloud import Cloud
from .llm import LLM
from .memory import Memory

log = logging.getLogger("haotica.engine")
MAX_ROUNDS = 10
HISTORY_TURNS = 40
SUMMARY_AT = 48
KEEP_AFTER_SUMMARY = 16
CARD_TIMEOUT = 600
STATE_FILE = "haotica.json"
WANT_RX = re.compile(r"^\s*/(deep|base)\b\s*", re.I)


class State:
    """Состояние для аватара и оболочки: hub «state» + $XDG_RUNTIME_DIR/haotica/haotica.json."""

    def __init__(self, agent: Agent) -> None:
        self.agent = agent
        self.value = "idle"
        self.line = ""
        self._last_written = ""

    def set(self, value: str, line: str | None = None) -> None:
        self.value = value
        if line is not None:
            self.line = line[:300]
        self.write()

    def snapshot(self) -> dict:
        a = self.agent
        llm = a.llm
        role = llm.switching or llm.main
        st = llm.state.get(role, "offline")
        dl = a.download_state(role)
        if dl and st != "ready":
            st = dl
        if llm.paused:
            st = "paused"
        labels = {}
        try:
            labels = {r: e["label"] for r, e in models.load_manifest()["models"].items()}
        except Exception:  # noqa: BLE001
            pass
        return {"state": self.value, "line": self.line, "llm_state": st, "llm_tps": llm.tps, "llm_role": role,
                "llm_model": labels.get(role, role), "switching": llm.switching,
                "cloud_assist": a.cloud.assist_active > 0, "busy": a.busy, "cards": len(a.cards), "ts": int(time.time())}

    def write(self) -> None:
        snap = self.snapshot()
        self.agent.hub.publish("state", snap)
        key = json.dumps({k: v for k, v in snap.items() if k != "ts"}, sort_keys=True, ensure_ascii=False)
        if key == self._last_written:
            return
        self._last_written = key
        try:
            paths.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
            util.write_json(paths.RUNTIME_DIR / STATE_FILE, snap)
        except OSError:
            log.warning("не удалось записать %s", STATE_FILE)


class Agent:
    def __init__(self) -> None:
        self.hub = Hub()
        self.llm = LLM()
        self.memory = Memory()
        self.cloud = Cloud(self.hub)
        self.state = State(self)
        self.tools = tools.Tools(self)
        self.voice = None
        self.cards: dict[str, dict] = {}
        self.busy = False
        self._turn_lock = asyncio.Lock()
        self._complete_cache: OrderedDict[str, str] = OrderedDict()
        self._unprompted: list[float] = []
        self._tasks: set[asyncio.Task] = set()
        self._dl_cache: tuple[float, dict] = (0.0, {})

    # ── жизненный цикл ─────────────────────────────────────────
    async def start(self) -> None:
        await self.llm.start()
        try:
            from .voice import Voice
            self.voice = Voice(self.hub, self.state)
        except Exception:  # noqa: BLE001 — без голоса работаем молча
            log.info("голос недоступен")
        self.bg(self._tick())
        self.bg(self.cloud.load_key())
        if config.get("haotica.enabled", True) and not self._game_on():
            self.bg(self._warmup())

    async def stop(self) -> None:
        for c in list(self.cards.values()):
            if not c["future"].done():
                c["future"].set_result(False)
        await self.llm.stop()

    def bg(self, coro) -> asyncio.Task:
        t = asyncio.create_task(coro)
        self._tasks.add(t)
        t.add_done_callback(self._tasks.discard)
        return t

    async def _tick(self) -> None:
        while True:
            try:
                self.state.write()
            except Exception:  # noqa: BLE001
                log.exception("state")
            await asyncio.sleep(3)

    async def _warmup(self) -> None:
        """Поднять base при старте, если файл модели уже скачан."""
        if self.download_state("base"):
            return
        try:
            await self.llm.ensure("base", 600)
        except Exception:  # noqa: BLE001
            log.warning("base не поднялась при старте")

    def _game_on(self) -> bool:
        m = util.load_json(paths.RUNTIME_DIR / "metrics.json", {}) or {}
        return bool(m.get("game_mode"))

    def download_state(self, role: str) -> str:
        """'' — модель на месте; иначе 'downloading 37%' / 'missing'."""
        now = time.time()
        if now - self._dl_cache[0] > 5:
            try:
                self._dl_cache = (now, models.status())
            except Exception:  # noqa: BLE001
                self._dl_cache = (now, {})
        st = self._dl_cache[1].get(role)
        if not st or st.get("ready"):
            return ""
        if st.get("have"):
            return f"downloading {int(100 * st['have'] / max(1, st['size']))}%"
        return "missing"

    # ── карточки разрешений ────────────────────────────────────
    def make_card(self, name: str, args: dict, risk: dict, chat: str, source: str) -> dict:
        cid = uuid.uuid4().hex[:12]
        kind = {"suggest_command": "command", "run_command": "run", "cloud_ask": "cloud"}.get(name, "action")
        title = {"command": "КОМАНДА", "run": "ВЫПОЛНИТЬ", "cloud": "CLOUD REQUEST"}.get(kind, "ДЕЙСТВИЕ")
        card = {"id": cid, "kind": kind, "tool": name, "title": title, "chat": chat, "source": source,
                "text": tools.describe(name, args), "command": str(args.get("command", "")),
                "why": str(args.get("reason") or args.get("why") or ""), "risk": risk,
                "args": {k: v for k, v in args.items() if k != "content"}, "ts": int(time.time())}
        if name == "write_file":
            card["preview"] = str(args.get("content", ""))[:2000]
        if name == "cloud_ask":
            card["question"] = safety.redact(str(args.get("question", "")))
            card["model"] = self.cloud.cfg().get("model", "")
        return card

    async def ask_card(self, card: dict) -> bool:
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self.cards[card["id"]] = {"card": card, "future": fut}
        self.hub.publish("card", card, keep=False)
        self.state.set("warning")
        try:
            return bool(await asyncio.wait_for(fut, CARD_TIMEOUT))
        except asyncio.TimeoutError:
            return False
        finally:
            self.cards.pop(card["id"], None)
            self.hub.publish("card_done", {"id": card["id"]}, keep=False)

    def resolve_card(self, cid: str, accept: bool) -> bool:
        c = self.cards.get(cid)
        if not c or c["future"].done():
            return False
        c["future"].set_result(accept)
        return True

    def pending_cards(self) -> list[dict]:
        return [c["card"] for c in self.cards.values()]

    # ── сборка запроса ─────────────────────────────────────────
    def build_messages(self, chat: str, text: str, context: dict) -> list[dict]:
        s = config.load()
        ctx = dict(context or {})
        ctx["metrics"] = util.load_json(paths.RUNTIME_DIR / "metrics.json", {}) or {}
        mems = self.memory.recall(text, 8) if s.get("haotica", {}).get("memory", True) else []
        sys = persona.system_prompt(s, ctx, [safety.redact(m) for m in mems])
        summ = self.memory.summary(chat)
        if summ:
            sys += "\n\nКонспект раннего разговора:\n" + safety.redact(summ)
        msgs = [{"role": "system", "content": sys}]
        for h in self.memory.history(chat, HISTORY_TURNS):
            if h["role"] in ("user", "assistant") and h["content"]:
                msgs.append({"role": h["role"], "content": safety.redact(h["content"])})
        msgs.append({"role": "user", "content": safety.redact(self._with_context(text, context or {}))})
        return msgs

    @staticmethod
    def _with_context(text: str, ctx: dict) -> str:
        extra = []
        for k in ("cmd", "code", "path", "selection", "output"):
            v = ctx.get(k)
            if v not in (None, ""):
                v = str(v)
                extra.append(f"{k}:\n```\n{v[-6000:]}\n```" if "\n" in v or len(v) > 120 else f"{k}: {v}")
        return text + ("\n\n[контекст]\n" + "\n".join(extra) if extra else "")

    # ── ход разговора ──────────────────────────────────────────
    async def turn(self, text: str, source: str = "panel", chat: str = "", context: dict | None = None) -> AsyncIterator[dict]:
        """События хода: delta, tool, card, error, done{text, role}."""
        chat = chat or source or "panel"
        context = context or {}
        want = ""
        m = WANT_RX.match(text)
        if m:
            want, text = m.group(1).lower(), text[m.end():]
        if not text.strip():
            if want:
                ok = await self.llm.use(want)
                msg = f"Модель: {want}" + ("" if ok else " — не удалось запустить")
                yield {"type": "done", "text": msg, "role": want}
                return
            yield {"type": "error", "error": "пустой запрос"}
            return
        if not config.get("haotica.enabled", True):
            yield {"type": "error", "error": "Haotica выключена в Настройках"}
            return
        if self.llm.paused:
            yield {"type": "error", "error": "режим «Игра»: модели выгружены, вернусь после игры"}
            return
        async with self._turn_lock:
            self.busy = True
            try:
                async for ev in self._turn(text, source, chat, context, want):
                    yield ev
            finally:
                self.busy = False
                self.state.set("idle")

    async def _turn(self, text, source, chat, context, want) -> AsyncIterator[dict]:
        self.memory.chat(chat, source)
        msgs = self.build_messages(chat, text, context)
        ctx_tokens = sum(len(x["content"]) for x in msgs) // 3
        role = self.llm.route(text, ctx_tokens, source, want)
        dl = self.download_state(role)
        if dl and role == "deep" and not self.download_state("base"):
            role, dl = "base", ""
        if dl:
            pct = dl.split()[-1] if dl.startswith("downloading") else ""
            err = f"модель ещё загружается ({pct})" if pct else "модель не скачана: Настройки → Haotica → Модели"
            self.state.set("sleep", err)
            yield {"type": "error", "error": err, "llm_state": dl}
            return
        self.memory.add(chat, "user", text, {"source": source})
        self.hub.publish("message", {"chat": chat, "role": "user", "text": text, "source": source}, keep=False)
        self.state.set("reading")
        if not await self.llm.use(role, 600):
            err = f"модель {role} не запустилась (journalctl --user -u haotica-llm-{role})"
            self.state.set("warning", err)
            yield {"type": "error", "error": err}
            return
        mode = config.get("haotica.mode", "copilot")
        schemas = tools.schemas(mode) if config.get("haotica.enabled", True) else None
        think = role == "base" and (len(text) > 400 or bool(re.search(r"(?i)подумай|почему|объясни|think", text)))
        final, used = "", []
        for _round in range(MAX_ROUNDS):
            self.state.set("thinking")
            buf, calls = "", []
            try:
                async for ev in self.llm.chat(msgs, schemas, role, max_tokens=4096 if role == "deep" else 2048,
                                              think=think):
                    if ev["type"] == "delta":
                        if not buf:
                            self.state.set("speaking")
                        buf += ev["text"]
                        self.hub.publish("message", {"chat": chat, "role": "assistant", "delta": ev["text"]}, keep=False)
                        yield {"type": "delta", "text": ev["text"]}
                    elif ev["type"] == "tool_calls":
                        calls = ev["calls"]
            except Exception as e:  # noqa: BLE001
                log.exception("llm")
                err = f"ошибка модели: {e}"
                self.state.set("warning", err)
                yield {"type": "error", "error": err}
                return
            buf = _strip_think(buf)
            if not calls:
                final = buf
                break
            msgs.append({"role": "assistant", "content": buf or None, "tool_calls": [
                {"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": c["arguments"] or "{}"}}
                for c in calls]})
            for c in calls:
                res = await self._call_tool(c, chat, source, context)
                used.append(c["name"])
                yield {"type": "tool", "name": c["name"], "ok": "error" not in res}
                msgs.append({"role": "tool", "tool_call_id": c["id"], "name": c["name"],
                             "content": safety.redact(json.dumps(res, ensure_ascii=False, default=str))[:24000]})
        else:
            final = final or "Слишком много шагов подряд — остановилась. Уточни задачу."
        final = final.strip() or "…"
        self.memory.add(chat, "assistant", final, {"role": role, "tools": used})
        self.hub.publish("message", {"chat": chat, "role": "assistant", "text": final, "final": True, "model": role},
                         keep=False)
        self.state.set("idle", final.splitlines()[0] if final else "")
        if self.voice and source not in ("cli", "complete") and len(final) < 500:
            self.bg(self._say(final))
        self.bg(self._maybe_summarize(chat))
        yield {"type": "done", "text": final, "role": role, "tools": used}

    async def _call_tool(self, c: dict, chat: str, source: str, context: dict) -> dict:
        name = c["name"]
        try:
            args = json.loads(c.get("arguments") or "{}")
            if not isinstance(args, dict):
                raise ValueError
        except ValueError:
            return {"error": "аргументы не в JSON"}
        if name not in tools.NAMES:
            return {"error": f"нет инструмента {name}"}
        need, risk = self.tools.needs_card(name, args)
        if need:
            card = self.make_card(name, args, risk, chat, source)
            ok = await self.ask_card(card)
            self.state.set("thinking")
            if not ok:
                return {"error": "владелец отклонил"}
            if name == "suggest_command":
                return {"ok": True, "note": "владелец принял команду; она вставлена в строку терминала"}
        return await self.tools.run(name, args, {"cwd": context.get("cwd") or str(paths.HOME), "chat": chat,
                                                 "source": source})

    async def _say(self, text: str) -> None:
        try:
            await self.voice.say(re.sub(r"```.*?```", "", text, flags=re.S)[:400])
        except Exception:  # noqa: BLE001 — нет TTS — молчим
            pass

    async def _maybe_summarize(self, chat: str) -> None:
        hist = self.memory.history(chat, SUMMARY_AT + 1)
        if len(hist) <= SUMMARY_AT:
            return
        old = hist[:-KEEP_AFTER_SUMMARY]
        prev = self.memory.summary(chat)
        dump = "\n".join(f"{h['role']}: {h['content'][:800]}" for h in old)
        txt = await self.llm.complete([
            {"role": "system", "content": "Сожми разговор в конспект на 10–15 пунктов: факты, решения, открытые задачи. "
             "Без секретов."},
            {"role": "user", "content": safety.redact((prev + "\n" if prev else "") + dump)[-30000:]}],
            role=self.llm.main, max_tokens=700, timeout=120)
        if txt:
            self.memory.set_summary(chat, _strip_think(txt), KEEP_AFTER_SUMMARY)

    async def ask(self, text: str, source: str = "panel", chat: str = "", context: dict | None = None) -> dict:
        out: dict = {"ok": False}
        async for ev in self.turn(text, source, chat, context):
            if ev["type"] == "done":
                out = {"ok": True, "text": ev["text"], "model": ev.get("role"), "tools": ev.get("tools", [])}
            elif ev["type"] == "error":
                out = {"ok": False, "error": ev["error"], **({"llm_state": ev["llm_state"]} if "llm_state" in ev else {})}
        return out

    # ── инструменты, которым нужен сам агент ───────────────────
    async def vision(self, path: Path, question: str) -> dict:
        if path.stat().st_size > 12 * 1024 * 1024:
            return {"error": "изображение слишком большое (>12 МБ)"}
        st = models.status().get("base", {})
        if not st.get("vision"):
            return {"error": "у основной модели нет зрения"}
        mime = mimetypes.guess_type(str(path))[0] or "image/png"
        data = base64.b64encode(await asyncio.to_thread(path.read_bytes)).decode()
        msgs = [{"role": "user", "content": [{"type": "text", "text": question},
                                             {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}]}]
        if self.llm.main != "base":
            return {"error": "зрение есть только у base; сейчас загружена deep"}
        text = ""
        async for ev in self.llm.chat(msgs, None, "base", max_tokens=800):
            if ev["type"] == "delta":
                text += ev["text"]
        return {"answer": _strip_think(text)}

    async def cloud_request(self, question: str, why: str, effort: str, ctx: dict) -> dict:
        c = self.cloud.cfg()
        if not c.get("enabled") or not c.get("model"):
            return {"error": "облако выключено или модель не выбрана (Настройки → Haotica → Облако)"}
        b = self.cloud.budget()
        if b["day"] >= float(b["limit_day"]) or b["month"] >= float(b["limit_month"]):
            return {"error": "облачный бюджет исчерпан"}
        q = safety.redact(question)
        r = await self.cloud.chat(c["model"], [{"role": "user", "content": q}], effort or c.get("effort", ""),
                                  max_tokens=2000, kind="cloud", note=why)
        if not r.get("ok"):
            return {"error": r.get("error", "облако недоступно")}
        if r.get("refused"):
            return {"refused": True, "note": "облако отказалось отвечать; не переформулируй запрос, продолжай сама"}
        return {"answer": r["text"], "cost": r.get("cost")}

    # ── подсказки в терминале и разбор ошибок ──────────────────
    async def complete_shell(self, prefix: str, cwd: str) -> str:
        if len(prefix) < 3 or self.llm.paused or self.llm.state.get("fast") != "ready":
            return ""
        key = prefix
        if key in self._complete_cache:
            self._complete_cache.move_to_end(key)
            return self._complete_cache[key]
        if safety.redact(prefix) != prefix:
            return ""
        out = await self.llm.complete([
            {"role": "system", "content": persona.SHELL_COMPLETE},
            {"role": "user", "content": f"cwd: {cwd}\ninput: {prefix}"}], role="fast", max_tokens=48, timeout=0.7,
            stop=["\n"])
        out = _strip_think(out).strip().strip("`").strip()
        if not out.startswith(prefix) or out == prefix or "\n" in out:
            out = ""
        self._complete_cache[key] = out
        while len(self._complete_cache) > 500:
            self._complete_cache.popitem(last=False)
        return out

    def _may_speak_unprompted(self) -> bool:
        ha = config.get("haotica", {}) or {}
        if ha.get("proactive", "sometimes") == "never" or not ha.get("enabled", True):
            return False
        now = time.time()
        self._unprompted = [t for t in self._unprompted if now - t < 3600]
        return len(self._unprompted) < int(ha.get("max_unprompted_per_hour", 6))

    async def terminal_block(self, b: dict) -> dict:
        code = int(b.get("code") or 0)
        if code in (0, 130, 141, 148) or not str(b.get("cmd", "")).strip():
            return {"ok": True, "skipped": "код не требует разбора"}
        if self.busy or self.llm.state.get(self.llm.main) != "ready" or self.llm.main != "base":
            return {"ok": True, "skipped": "модель занята или не загружена"}
        if not self._may_speak_unprompted():
            return {"ok": True, "skipped": "лимит подсказок"}
        self._unprompted.append(time.time())
        self.bg(self._analyze_block(b))
        return {"ok": True, "queued": True}

    async def _analyze_block(self, b: dict) -> None:
        out = safety.redact(str(b.get("output", ""))[-4000:])
        prompt = (f"Команда `{safety.redact(str(b['cmd']))}` в папке {b.get('cwd', '~')} завершилась с кодом {b.get('code')}.\n"
                  f"Вывод:\n```\n{out}\n```\nОдной-двумя фразами: причина и как исправить. Если есть команда-исправление — "
                  "дай её последней строкой в блоке кода.")
        text = await self.llm.complete([
            {"role": "system", "content": persona.system_prompt(config.load(), {"source": "terminal", "cwd": b.get("cwd", "~")}, [])},
            {"role": "user", "content": prompt}], role="base", max_tokens=300, timeout=60)
        text = _strip_think(text).strip()
        if not text:
            return
        self.memory.chat("terminal", "terminal")
        self.memory.add("terminal", "assistant", text, {"proactive": True, "cmd": b.get("cmd")})
        self.hub.publish("message", {"chat": "terminal", "role": "assistant", "text": text, "final": True,
                                     "proactive": True}, keep=False)
        self.state.set("idle", text.splitlines()[0])
        m = re.findall(r"```(?:\w+)?\n(.+?)\n```", text, re.S)
        if m and "\n" not in m[-1].strip():
            cmd = m[-1].strip()
            card = self.make_card("suggest_command", {"command": cmd, "reason": "исправление ошибки"},
                                  safety.classify(cmd), "terminal", "terminal")
            self.bg(self.ask_card(card))

    # ── события ядра ───────────────────────────────────────────
    async def event(self, ev: dict) -> dict:
        name = ev.get("event", "")
        if name == "game_mode":
            await self.llm.pause(bool(ev.get("on")))
            self.state.set("sleep" if ev.get("on") else "idle")
        elif name == "battery_low":
            if self.voice:
                self.bg(self._line("battery_low"))
            self.state.set("warning", f"Батарея {ev.get('level', '?')}%")
        elif name in ("wake", "login"):
            if self.voice:
                self.bg(self._line("greeting"))
        return {"ok": True}

    async def _line(self, name: str) -> None:
        try:
            await self.voice.line(name)
        except Exception:  # noqa: BLE001
            pass

    async def reload(self) -> dict:
        await self.cloud.load_key()
        self._dl_cache = (0.0, {})
        self.state.write()
        return {"ok": True}

    def status(self) -> dict:
        try:
            mstat = models.status()
        except Exception:  # noqa: BLE001
            mstat = {}
        return {"ok": True, **self.state.snapshot(), "llm": self.llm.status(),
                "models": {r: {k: v.get(k) for k in ("label", "size", "have", "ready")} for r, v in mstat.items()},
                "cloud": {"enabled": bool(self.cloud.cfg().get("enabled")), "key": bool(self.cloud.key),
                          "budget": self.cloud.budget()},
                "voice": bool(self.voice), "cards": self.pending_cards()}


def _strip_think(text: str) -> str:
    return re.sub(r"(?s)<think>.*?</think>\s*", "", text or "").strip()
