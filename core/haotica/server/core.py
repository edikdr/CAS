"""Ядро HAOTICA: связывает метрики, настройки, события, Hyprland, режим «Игра» и расписания."""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections import deque

import aiohttp

from .. import config, paths, platform, recon, theme, util
from ..cli import ensure_token
from .appliers import Applier
from .crt import ScreenCrt
from .events import EventLog
from .gamemode import GameMode
from .hub import Hub
from .hypr import Hypr
from .metrics import Metrics

log = logging.getLogger("haotica.core")
PPD = {"performance": "performance", "balanced": "balanced", "quiet": "power-saver", "power-saver": "power-saver"}
# ключи, которые можно менять, даже если их нет в defaults.toml (словари с произвольными именами)
FREE_SECTIONS = ("sound.events.", "gestures.bindings.", "appearance.custom.", "router.", "apps.autostart.", "terminal.keys.")


def _flatten(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, key + "."))
        else:
            out[key] = v
    return out


def _in_window(start: str, end: str, now_min: int) -> bool:
    def m(s: str) -> int:
        h, _, mm = (s or "00:00").partition(":")
        return int(h) * 60 + int(mm or 0)
    a, b = m(start), m(end)
    return a <= now_min < b if a <= b else (now_min >= a or now_min < b)


class Core:
    def __init__(self) -> None:
        paths.ensure_dirs()
        self.token = ensure_token()
        self.hub = Hub()
        self.events = EventLog(self.hub)
        self.hypr = Hypr()
        self.metrics = Metrics(self)
        self.applier = Applier(self)
        self.game = GameMode(self)
        self.recon = recon.Recon(self)
        self.recon_paused = False
        self.history: deque[dict] = deque(maxlen=60)
        self._display_revert: asyncio.TimerHandle | None = None
        self._display_prev: dict | None = None
        self._last_power: dict = {}
        self._night_on: bool | None = None
        self._session: aiohttp.ClientSession | None = None
        self.hypr.on_games_changed = self.game.games_changed
        self.crt = ScreenCrt(self)
        self.hypr.per_window = bool(config.get("locale.per_window_layout", True))
        self.started = time.time()

    # ── жизненный цикл ─────────────────────────────────────────
    async def start(self) -> None:
        self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=6))
        s = config.load()
        if not (paths.RUNTIME_DIR / "theme.json").exists():
            await asyncio.to_thread(theme.apply, {"runtime"}, s)
        else:
            config.export_runtime(s)
        self.publish_theme()
        self.hub.publish("settings", self.shell_settings(s))
        if platform.IS_WINDOWS:                    # HAOTICA Terminal: без Hyprland, systemd и сканера сети
            asyncio.create_task(self.metrics.run())
            self.events.add("ok", "CORE // ONLINE")
            return
        if not (paths.HOME / ".config/hypr/hypridle.conf").exists():
            await self.applier.write_hypridle(s)
        await self.applier.lid_policy(s)
        await self.crt.update(force=True)
        for coro in (self.metrics.run(), self.hypr.run(), self._scheduler(), self.recon.run()):
            asyncio.create_task(coro)
        self.events.add("ok", "CORE // ONLINE")

    async def stop(self) -> None:
        if self._session:
            await self._session.close()

    # ── тема и настройки ───────────────────────────────────────
    def publish_theme(self) -> None:
        t = util.load_json(paths.RUNTIME_DIR / "theme.json", None)
        if t:
            self.hub.publish("theme", t)

    @staticmethod
    def shell_settings(s: dict | None = None) -> dict:
        return util.load_json(paths.RUNTIME_DIR / "settings.json", {}) or {}

    def validate(self, changes: dict) -> dict:
        known = _flatten(config.load_defaults())
        bad = {}
        for k, v in changes.items():
            if k in known:
                dv = known[k]
                if isinstance(dv, bool) and not isinstance(v, bool):
                    bad[k] = "нужно да/нет"
                elif isinstance(dv, (int, float)) and not isinstance(dv, bool) and not isinstance(v, (int, float)):
                    bad[k] = "нужно число"
                elif isinstance(dv, list) and not isinstance(v, list):
                    bad[k] = "нужен список"
            elif not k.startswith(FREE_SECTIONS):
                bad[k] = "неизвестный параметр"
        return bad

    async def set_settings(self, changes: dict, source: str = "settings") -> dict:
        bad = self.validate(changes)
        if bad:
            return {"ok": False, "errors": bad}
        old = config.load()
        old_flat = _flatten(old)
        new = config.set_many(changes)
        new_flat = _flatten(new)
        changed = {k for k in set(old_flat) | set(new_flat) if old_flat.get(k) != new_flat.get(k)}
        if not changed:
            return {"ok": True, "changed": [], "did": []}
        entry = {"id": uuid.uuid4().hex[:10], "ts": int(time.time()), "source": source,
                 "changes": {k: [old_flat.get(k), new_flat.get(k)] for k in sorted(changed)}}
        self.history.append(entry)
        util.write_json(paths.STATE_DIR / "settings-history.json", list(self.history))
        try:
            did = await self.applier.apply(changed, old, new)
        except Exception as e:
            log.exception("apply")
            did = [f"ошибка применения: {e}"]
        self.hub.publish("settings", self.shell_settings(new))
        return {"ok": True, "changed": sorted(changed), "did": did, "undo": entry["id"]}

    async def undo(self, entry_id: str) -> dict:
        for e in reversed(self.history):
            if e["id"] == entry_id:
                return await self.set_settings({k: v[0] for k, v in e["changes"].items() if v[0] is not None},
                                               source="undo")
        return {"ok": False, "error": "нечего отменять"}

    # ── экран: изменение с автоматическим откатом через 15 с ────
    async def display_apply(self, changes: dict, confirm_timeout: int = 15) -> dict:
        self._display_prev = {k: config.get(k) for k in changes}
        r = await self.set_settings(changes, source="display")
        if self._display_revert:
            self._display_revert.cancel()
        loop = asyncio.get_running_loop()
        self._display_revert = loop.call_later(confirm_timeout, lambda: loop.create_task(self.display_revert()))
        return {**r, "revert_in": confirm_timeout}

    async def display_revert(self) -> dict:
        self._display_revert = None
        if not self._display_prev:
            return {"ok": False}
        prev, self._display_prev = self._display_prev, None
        self.events.add("warn", "DISPLAY // CHANGE REVERTED")
        return await self.set_settings(prev, source="display-revert")

    def display_confirm(self) -> dict:
        if self._display_revert:
            self._display_revert.cancel()
            self._display_revert = None
        self._display_prev = None
        return {"ok": True}

    def monitor_lua(self, refresh: int | None = None, s: dict | None = None) -> str:
        d = (s or config.load()).get("display", {})
        r = refresh or d.get("refresh", 165)
        parts = ['output = "eDP-1"', f'mode = "2560x1600@{r}"', 'position = "0x0"',
                 f'scale = {d.get("scale", 1.6)}', f'bitdepth = {d.get("bitdepth", 10)}',
                 f'vrr = {2 if d.get("vrr", True) else 0}']
        if d.get("hdr"):
            parts.append('cm = "hdr"')
        return "hl.monitor({ " + ", ".join(parts) + " })"

    # ── питание ─────────────────────────────────────────────────
    async def power_profile_for(self, on_battery: bool, s: dict | None = None) -> None:
        pw = (s or config.load()).get("power", {})
        want = PPD.get(pw.get("profile_battery" if on_battery else "profile_ac", "balanced"), "balanced")
        if self.game.on:
            want = "performance"
        await util.arun(["powerprofilesctl", "set", want], 5)

    def on_metrics(self, d: dict) -> None:
        prev, self._last_power = self._last_power, {k: d.get(k) for k in ("on_battery", "battery", "charging")}
        if not prev or d.get("battery", -1) < 0:
            return
        loop = asyncio.get_running_loop()
        if prev.get("on_battery") != d.get("on_battery"):
            onb = bool(d.get("on_battery"))
            self.events.add("power", "POWER // BATTERY" if onb else "POWER // AC CONNECTED",
                            sound="power_unplug" if onb else "power_plug")
            loop.create_task(self.power_profile_for(onb))
            loop.create_task(self._battery_refresh(onb))
        b, pb = d.get("battery", 100), prev.get("battery", 100)
        if d.get("on_battery") and pb is not None:
            for th, kind, text in ((20, "warn", "BATTERY // 20% — LOW"), (10, "error", "BATTERY // 10% — CRITICAL"),
                                   (5, "error", "BATTERY // 5% — SHUTDOWN SOON")):
                if b <= th < pb:
                    self.events.add(kind, text, notify=True, title="Батарея", sound="battery_low" if th == 20 else "battery_critical")
                    if th == 20:
                        loop.create_task(self.haotica_call("POST", "/api/event", {"event": "battery_low", "level": b}))

    async def _battery_refresh(self, on_battery: bool) -> None:
        d = config.get("display", {}) or {}
        br, r = int(d.get("battery_refresh", 60)), int(d.get("refresh", 165))
        if not self.hypr.available or br >= r:
            return
        await self.hypr.eval_lua(self.monitor_lua(br if on_battery else r))

    async def keyboard_light(self, s: dict | None = None, state: str = "") -> None:
        kb = (s or config.load()).get("keyboard", {})
        mode = kb.get("backlight", "palette")
        level = int(kb.get("backlight_brightness", 2))
        if util.which("brightnessctl"):
            await util.arun(["brightnessctl", "--device=*::kbd_backlight", "set", str(0 if mode == "off" else level)], 5)
        if mode == "off" or not util.which("openrgb"):
            return
        p = theme.current_palette(s)
        color = {"palette": p["accent"], "static": kb.get("backlight_color", "#E0A243")}.get(mode, p["accent"])
        if mode == "haotica":
            color = {"thinking": p["violet"], "speaking": p["teal"], "warning": p["coral"],
                     "happy": p["green"], "sleep": p["line"]}.get(state, p["accent"])
        await util.arun(["openrgb", "--noautoconnect", "--mode", "static", "--color", color.lstrip("#")], 20)

    # ── расписания: ночной режим, сеть ──────────────────────────
    async def night_light_tick(self, force: bool = False) -> None:
        d = config.get("display", {}) or {}
        now = time.localtime()
        want = bool(d.get("night_light")) and _in_window(d.get("night_start", "22:00"), d.get("night_end", "07:00"),
                                                          now.tm_hour * 60 + now.tm_min)
        if want == self._night_on and not force:
            return
        self._night_on = want
        if want:
            await util.arun(["hyprctl", "hyprsunset", "temperature", str(int(d.get("night_temperature", 4500)))], 5)
        else:
            await util.arun(["hyprctl", "hyprsunset", "identity"], 5)

    async def _scheduler(self) -> None:
        while True:
            try:
                await self.night_light_tick()
            except Exception:
                log.exception("scheduler")
            await asyncio.sleep(30)

    def recon_reschedule(self) -> None:
        self.recon.reschedule()

    # ── связь с Haotica ─────────────────────────────────────────
    async def haotica_call(self, method: str, path: str, body: dict | None = None) -> dict | None:
        if not self._session:
            return None
        url = f"http://{paths.HOST}:{paths.PORT_HAOTICA}{path}"
        try:
            async with self._session.request(method, url, json=body,
                                             headers={"X-Haotica-Token": self.token}) as r:
                txt = await r.text()
                return json.loads(txt) if txt else {}
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
            return None
