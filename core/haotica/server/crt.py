"""Экранный CRT — лёгкий эффект кинескопа на весь экран (интерфейс и все окна).

Шейдер decoration:screen_shader пишет theme.apply (~/.config/hypr/haotica/crt.frag, сила —
effects.crt_screen). Здесь решается, должен ли он быть включён прямо сейчас: на время режима
«Игра» и (effects.crt_fullscreen_off) пока на видимом рабочем столе есть полноэкранное окно —
видео, игра, презентация — шейдер снимается: картинка чистая и работает прямой вывод на экран.
Терминал добавляет поверх свой, более сильный CRT.
"""
from __future__ import annotations

import asyncio
import json
import logging

from .. import config, paths

log = logging.getLogger("haotica.crt")
SHADER = paths.HOME / ".config/hypr/haotica/crt.frag"
EVENTS = {"fullscreen", "workspacev2", "focusedmonv2", "activewindowv2", "closewindow", "movewindowv2",
          "configreloaded"}


class ScreenCrt:
    def __init__(self, core) -> None:
        self.core = core
        self.applied: str | None = None
        self.fullscreen = False
        self._pending: asyncio.TimerHandle | None = None
        core.hypr.listeners.append(self.on_event)

    def wanted(self, s: dict | None = None) -> str:
        fx = (s or config.load()).get("effects", {})
        if float(fx.get("crt_screen", 0.35) or 0) <= 0 or self.core.game.on:
            return ""
        if fx.get("crt_fullscreen_off", True) and self.fullscreen:
            return ""
        return str(SHADER) if SHADER.exists() else ""

    async def update(self, force: bool = False) -> None:
        if not self.core.hypr.available:
            return
        want = self.wanted()
        if want == self.applied and not force:
            return
        rc, out = await self.core.hypr.eval_lua(f"hl.config({{ decoration = {{ screen_shader = {json.dumps(want)} }} }})")
        if rc == 0:
            self.applied = want
        else:
            log.warning("screen_shader: %s", out)

    async def _check_fullscreen(self) -> None:
        ws = await self.core.hypr.query("activeworkspace") or {}
        full = bool(ws.get("hasfullscreen"))
        if full != self.fullscreen:
            self.fullscreen = full
            await self.update()

    def on_event(self, ev: str, _data: str) -> None:
        if ev not in EVENTS:
            return
        loop = asyncio.get_running_loop()
        if ev == "configreloaded":            # reload перечитал look.lua — вернуть нужное состояние
            loop.create_task(self.update(force=True))
            return
        if self._pending:
            self._pending.cancel()
        self._pending = loop.call_later(0.12, lambda: loop.create_task(self._check_fullscreen()))
