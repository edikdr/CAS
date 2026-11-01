"""Связь с Hyprland: события сокета socket2, раскладка для каждого окна, поиск игровых окон."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections.abc import Callable
from pathlib import Path

from .. import paths, util

log = logging.getLogger("hyperina.hypr")

# описание раскладки xkb → короткий код (для панели) и обратно
XKB_NAMES = {
    "de": "German", "ru": "Russian", "us": "English (US)", "gb": "English (UK)", "ua": "Ukrainian",
    "fr": "French", "es": "Spanish", "it": "Italian", "pl": "Polish", "by": "Belarusian", "kz": "Kazakh",
    "tr": "Turkish", "cz": "Czech", "jp": "Japanese",
}
GAME_CLASS = re.compile(r"^(steam_app_\d+|gamescope|steam_proton|.*\.exe)$", re.I)


def _addr(raw: str) -> str:
    """В событиях адрес без «0x», в JSON клиентов — с ним; приводим к одному виду."""
    raw = raw.strip()
    return "0x" + raw.removeprefix("0x") if raw else ""


def layout_code(desc: str) -> str:
    for code, name in XKB_NAMES.items():
        if desc.startswith(name):
            return code.upper()
    return (desc[:2] or "??").upper()


class Hypr:
    def __init__(self) -> None:
        sig = os.environ.get("HYPRLAND_INSTANCE_SIGNATURE", "")
        base = paths.RUNTIME_BASE / "hypr" / sig
        self.sock = base / ".socket.sock"
        self.sock2 = base / ".socket2.sock"
        self.available = bool(sig) and self.sock.exists()
        self.listeners: list[Callable[[str, str], None]] = []
        self.layout = "DE"
        self.layouts: list[str] = ["de", "ru"]
        self.per_window = True
        self._win_layout: dict[str, int] = {}
        self._active = ""
        self._switching = False
        self.games: dict[str, str] = {}        # адрес → класс
        self.on_games_changed: Callable[[bool], None] | None = None

    # ── запросы ────────────────────────────────────────────────
    async def request(self, cmd: str) -> str:
        if not self.sock.exists():
            return ""
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_unix_connection(str(self.sock)), 2)
            writer.write(cmd.encode())
            await writer.drain()
            data = await asyncio.wait_for(reader.read(), 5)
            writer.close()
            return data.decode("utf-8", "replace")
        except (OSError, asyncio.TimeoutError) as e:
            log.debug("hypr request %s: %s", cmd, e)
            return ""

    async def query(self, what: str):
        raw = await self.request(f"j/{what}")
        try:
            return json.loads(raw) if raw else None
        except ValueError:
            return None

    async def hyprctl(self, *args: str) -> tuple[int, str]:
        rc, out, err = await util.arun(["hyprctl", *args], timeout=8)
        return rc, (out or err).strip()

    async def eval_lua(self, code: str) -> tuple[int, str]:
        return await self.hyprctl("eval", code)

    async def reload(self) -> None:
        await self.hyprctl("reload")

    async def monitors(self) -> list[dict]:
        return await self.query("monitors all") or []

    async def clients(self) -> list[dict]:
        return await self.query("clients") or []

    # ── события ────────────────────────────────────────────────
    async def run(self) -> None:
        if not self.available:
            log.info("Hyprland не найден — события окон отключены")
            return
        await self._init_layout()
        for c in await self.clients():
            self._maybe_game(c.get("address", ""), c.get("class", ""))
        while True:
            try:
                reader, writer = await asyncio.open_unix_connection(str(self.sock2))
                while True:
                    line = await reader.readline()
                    if not line:
                        break
                    ev, _, data = line.decode("utf-8", "replace").rstrip("\n").partition(">>")
                    self._handle(ev, data)
                    for cb in self.listeners:
                        try:
                            cb(ev, data)
                        except Exception:  # noqa: BLE001 — слушатель не должен ронять цикл
                            log.exception("listener")
                writer.close()
            except OSError as e:
                log.debug("socket2: %s", e)
            await asyncio.sleep(2)

    async def _init_layout(self) -> None:
        devs = await self.query("devices") or {}
        for kb in devs.get("keyboards", []):
            if kb.get("main"):
                self.layout = layout_code(kb.get("active_keymap", ""))
                if kb.get("layout"):
                    self.layouts = [x.strip() for x in kb["layout"].split(",") if x.strip()]

    def _layout_index(self, desc: str) -> int:
        for i, code in enumerate(self.layouts):
            if desc.startswith(XKB_NAMES.get(code, "~")):
                return i
        return 0

    def _handle(self, ev: str, data: str) -> None:
        if ev == "activelayout":
            _kb, _, desc = data.rpartition(",")
            self.layout = layout_code(desc)
            if self._active and not self._switching:
                self._win_layout[self._active] = self._layout_index(desc)
        elif ev == "activewindowv2":
            addr = _addr(data)
            if addr == self._active:
                return
            self._active = addr
            if self.per_window and addr:
                want = self._win_layout.get(addr, 0)
                asyncio.get_running_loop().create_task(self._switch(want))
        elif ev == "openwindow":
            parts = data.split(",", 3)
            if len(parts) >= 3:
                self._maybe_game(_addr(parts[0]), parts[2])
        elif ev == "closewindow":
            addr = _addr(data)
            self._win_layout.pop(addr, None)
            if self.games.pop(addr, None) is not None and not self.games and self.on_games_changed:
                self.on_games_changed(False)

    async def _switch(self, index: int) -> None:
        cur = self._layout_index(XKB_NAMES.get(self.layout.lower(), ""))
        if cur == index:
            return
        self._switching = True
        try:
            await self.hyprctl("switchxkblayout", "all", str(index))
        finally:
            await asyncio.sleep(0.05)
            self._switching = False

    def _maybe_game(self, addr: str, cls: str) -> None:
        if addr and GAME_CLASS.match(cls or ""):
            first = not self.games
            self.games[addr] = cls
            if first and self.on_games_changed:
                self.on_games_changed(True)


def hypr_env_ok() -> bool:
    return bool(os.environ.get("HYPRLAND_INSTANCE_SIGNATURE")) and Path(
        paths.RUNTIME_BASE / "hypr").exists()
