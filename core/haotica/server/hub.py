"""Шина событий для приложений: Server-Sent Events по темам (metrics, theme, settings, events, …)."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from aiohttp import web


class Hub:
    def __init__(self) -> None:
        self._subs: set[tuple[asyncio.Queue, frozenset[str]]] = set()
        self.last: dict[str, Any] = {}

    def publish(self, topic: str, payload: Any, keep: bool = True) -> None:
        if keep:
            self.last[topic] = payload
        msg = f"event: {topic}\ndata: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        for q, topics in list(self._subs):
            if topics and topic not in topics:
                continue
            if q.full():           # медленный клиент: выбрасываем старое, держим свежее
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(msg)

    async def stream(self, request: web.Request) -> web.StreamResponse:
        topics = frozenset(t for t in request.query.get("topics", "").split(",") if t)
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache",
                                           "X-Accel-Buffering": "no"})
        await resp.prepare(request)
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        sub = (q, topics)
        self._subs.add(sub)
        try:
            for t, payload in self.last.items():      # сразу отдать последнее состояние
                if not topics or t in topics:
                    await resp.write(f"event: {t}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode())
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), 20)
                except asyncio.TimeoutError:
                    msg = ": ping\n\n"
                await resp.write(msg.encode())
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            self._subs.discard(sub)
        return resp
