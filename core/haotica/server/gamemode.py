"""Режим «Игра»: память и производительность отдаются игре.

Включается сам, когда появляется окно игры Steam (класс steam_app_*), или вручную
(Super+G, плитка в центре управления, `haotica gamemode on`). При включении:
выгружается основная модель Haotica (base ~19 ГБ или deep ~43 ГБ возвращаются системе), на паузу встают
жесты, фоновые сканы сети и декоративные анимации, снимается экранный CRT,
питание — «производительность».
После выхода всё возвращается.
"""
from __future__ import annotations

import asyncio
import logging

from .. import config, util

log = logging.getLogger("haotica.game")
LLM_UNITS = ("haotica-llm-base.service", "haotica-llm-deep.service")


class GameMode:
    def __init__(self, core) -> None:
        self.core = core
        self.on = False
        self.manual = False
        self._prev_profile = ""
        self._off_timer: asyncio.TimerHandle | None = None
        self._lock = asyncio.Lock()

    def games_changed(self, running: bool) -> None:
        """Сигнал от Hyprland: игровые окна появились или все закрылись."""
        loop = asyncio.get_running_loop()
        if self._off_timer:
            self._off_timer.cancel()
            self._off_timer = None
        if running:
            loop.create_task(self.set(True, auto=True))
        elif not self.manual:
            # игры часто пересоздают окно при запуске — ждём, чтобы не мигать
            self._off_timer = loop.call_later(12, lambda: loop.create_task(self.set(False, auto=True)))

    async def set(self, on: bool, auto: bool = False) -> dict:
        async with self._lock:
            if on == self.on:
                if not auto:
                    self.manual = on
                return self.status()
            if not auto:
                self.manual = on
            s = config.load()
            gm = s.get("gamemode", {})
            self.on = on
            self.core.metrics.extra["game_mode"] = on
            if on:
                self._prev_profile = self.core.metrics.data.get("power_profile", "")
                if gm.get("unload_llm", True):
                    await util.arun(["systemctl", "--user", "stop", *LLM_UNITS, "haotica-tts.service"], 30)
                if gm.get("pause_gestures", True):
                    await util.arun(["systemctl", "--user", "stop", "haotica-gestures.service"], 10)
                self.core.recon_paused = bool(gm.get("pause_recon", True))
                await util.arun(["powerprofilesctl", "set", "performance"], 5)
                self.core.events.add("game", "GAME MODE // ENGAGED — NEURAL CORE RELEASED")
                await self.core.haotica_call("POST", "/api/event", {"event": "game_mode", "on": True})
            else:
                self.core.recon_paused = False
                await self.core.power_profile_for(self.core.metrics.data.get("on_battery", False), s)
                if s.get("haotica", {}).get("enabled", True):
                    await util.arun(["systemctl", "--user", "start", "haotica-llm-base.service", "haotica-tts.service"], 10)
                if s.get("gestures", {}).get("enabled", False):
                    await util.arun(["systemctl", "--user", "start", "haotica-gestures.service"], 10)
                self.core.events.add("game", "GAME MODE // OFF — NEURAL CORE RELOADING")
                await self.core.haotica_call("POST", "/api/event", {"event": "game_mode", "on": False})
            await self.core.crt.update()          # экранный CRT снимается на время игры
            self.core.hub.publish("gamemode", self.status())
            return self.status()

    def status(self) -> dict:
        return {"on": self.on, "manual": self.manual, "games": list(self.core.hypr.games.values())}
