"""Локальные модели: клиент llama-server (OpenAI-совместимый, потоковый, с вызовом инструментов)
и жизненный цикл служб hyperina-llm-* (загрузка по требованию, выгрузка в простое, режим «Игра»)."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator

import aiohttp

from .. import models, paths, util

log = logging.getLogger("haotica.llm")
UNIT = "hyperina-llm-{}.service"


class LLM:
    def __init__(self) -> None:
        self.session: aiohttp.ClientSession | None = None
        self.state = {"main": "offline", "fast": "offline", "vision": "offline"}
        self.tps = 0.0
        self.last_used = {"main": 0.0, "fast": 0.0, "vision": 0.0}
        self._starting: dict[str, asyncio.Task] = {}

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
        """Состояние моделей раз в 3 с; модель зрения выгружается после 5 минут простоя."""
        while True:
            for role in ("main", "fast", "vision"):
                self.state[role] = await self.health(role)
            if self.state["vision"] == "ready" and time.time() - self.last_used["vision"] > 300:
                await util.arun(["systemctl", "--user", "stop", UNIT.format("vision")], 20)
            await asyncio.sleep(3)

    async def ensure(self, role: str, timeout: float = 240) -> bool:
        """Запустить службу модели и дождаться готовности."""
        if await self.health(role) == "ready":
            return True
        if role in self._starting and not self._starting[role].done():
            return await self._starting[role]

        async def boot() -> bool:
            await util.arun(["systemctl", "--user", "start", UNIT.format(role)], 30)
            t0 = time.time()
            while time.time() - t0 < timeout:
                st = await self.health(role)
                self.state[role] = st if st != "offline" else "loading"
                if st == "ready":
                    return True
                await asyncio.sleep(1.5)
            return False
        self._starting[role] = asyncio.create_task(boot())
        return await self._starting[role]

    async def unload(self, role: str) -> None:
        await util.arun(["systemctl", "--user", "stop", UNIT.format(role)], 30)
        self.state[role] = "sleep"

    # ── генерация ──────────────────────────────────────────────
    async def chat(self, messages: list[dict], tools: list[dict] | None = None, role: str = "main",
                   max_tokens: int = 2048, temperature: float = 0.7, stop: list[str] | None = None) -> AsyncIterator[dict]:
        """События: {'type':'delta','text'}, {'type':'tool_calls','calls':[...]}, {'type':'done','usage','tps'}."""
        self.last_used[role] = time.time()
        body: dict = {"model": role, "messages": messages, "stream": True, "max_tokens": max_tokens,
                      "temperature": temperature, "top_p": 0.9, "cache_prompt": True,
                      "stream_options": {"include_usage": True}}
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
        if timings.get("predicted_per_second"):
            self.tps = round(float(timings["predicted_per_second"]), 1)
        yield {"type": "done", "usage": usage, "tps": self.tps, "timings": timings}

    async def complete(self, messages: list[dict], role: str = "fast", max_tokens: int = 48,
                       temperature: float = 0.2, stop: list[str] | None = None, timeout: float = 4) -> str:
        """Короткий ответ без потока (подсказки, классификация, сводки)."""
        self.last_used[role] = time.time()
        body = {"model": role, "messages": messages, "stream": False, "max_tokens": max_tokens,
                "temperature": temperature, "cache_prompt": True, **({"stop": stop} if stop else {})}
        try:
            async with self.session.post(self.url(role) + "/v1/chat/completions", json=body,
                                         timeout=aiohttp.ClientTimeout(total=timeout)) as r:
                if r.status != 200:
                    return ""
                d = await r.json()
                return (d.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
            return ""
