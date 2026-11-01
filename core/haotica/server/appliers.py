"""Применение настроек на лету: какие ключи что перестраивают.

Окно «Настройки», Haotica и команда `haotica settings set` пишут в один settings.toml;
здесь по списку изменённых ключей выбирается минимальный набор действий.
Системные изменения с паролем (локаль, часовой пояс, раскладка экрана входа) сюда
не входят — их явно вызывает окно «Настройки» через /api/system/*.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from .. import config, helper, paths, theme, util

log = logging.getLogger("haotica.apply")
H = paths.HOME

KDE_APPS = ["org.kde.dolphin", "org.kde.kate", "org.kde.gwenview", "org.kde.okular", "org.kde.ark",
            "org.kde.filelight", "org.kde.partitionmanager", "org.kde.kwrite", "kdesystemsettings",
            "org.kde.kinfocenter", "org.kde.kmenuedit", "qt6ct", "kvantummanager", "nvtop", "btop",
            "org.kde.plasma-systemmonitor"]
DEFAULT_MIME = {
    "browser": ["x-scheme-handler/http", "x-scheme-handler/https", "text/html"],
    "files": ["inode/directory"],
    "editor": ["text/plain", "text/markdown", "application/x-shellscript", "text/x-python", "application/json"],
    "viewer": ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml"],
    "player": ["video/mp4", "video/x-matroska", "video/webm", "audio/mpeg", "audio/flac", "audio/ogg"],
}


def _hit(keys: set[str], prefixes: tuple[str, ...]) -> bool:
    return any(k == p or k.startswith(p) for k in keys for p in prefixes)


class Applier:
    def __init__(self, core) -> None:
        self.core = core
        self._assets_task: asyncio.Task | None = None
        self._lid_inhibit: asyncio.subprocess.Process | None = None

    async def apply(self, keys: set[str], old: dict, new: dict) -> list[str]:
        did: list[str] = []
        if "appearance.ui_scale" in keys and config.get("display.scale", settings=new) != new["appearance"]["ui_scale"]:
            new = config.set_many({"display.scale": new["appearance"]["ui_scale"]})
            keys = keys | {"display.scale"}
        full_theme = _hit(keys, ("appearance.profile", "appearance.custom"))
        targets: set[str] = set()
        if full_theme:
            targets = {"runtime", "hyprland", "gtk", "qt", "apps", "shell"}
        else:
            if _hit(keys, ("appearance.", "effects.", "animations.")):
                targets |= {"runtime"}
            if _hit(keys, ("appearance.font", "appearance.icon_theme", "appearance.cursor")):
                targets |= {"gtk", "qt"}
            if _hit(keys, ("display.", "keyboard.repeat", "touchpad.", "locale.layouts", "locale.ru_variant",
                           "locale.switch", "animations.", "effects.blur", "effects.glow", "appearance.density",
                           "appearance.cursor")):
                targets |= {"hyprland"}
        if targets:
            await asyncio.to_thread(theme.apply, targets, new)
            did.append("тема: " + ", ".join(sorted(targets)))
            if "hyprland" in targets and self.core.hypr.available:
                await self.core.hypr.reload()
            self.core.publish_theme()
            if targets & {"gtk", "qt", "apps"}:
                await asyncio.to_thread(theme.reload_running)
        if full_theme:
            self._rebuild_assets(new)
            did.append("иконки, курсор и обои пересобираются")
        if _hit(keys, ("appearance.cursor",)):
            ap = new.get("appearance", {})
            await self.core.hypr.hyprctl("setcursor", ap.get("cursor_theme", "HAOTICA"), str(ap.get("cursor_size", 24)))
        if _hit(keys, ("power.profile_",)):
            await self.core.power_profile_for(self.core.metrics.data.get("on_battery", False), new)
            did.append("режим питания")
        if _hit(keys, ("power.conservation", "power.charge_limit")):
            pw = new.get("power", {})
            r = await helper.call("charge", "on" if pw.get("conservation", True) else "off", str(pw.get("charge_limit", 80)))
            did.append("порог заряда" if r.get("ok") else f"порог заряда: {r.get('error', 'ошибка')}")
        if _hit(keys, ("power.autolock", "power.screen_off", "power.suspend")):
            await self.write_hypridle(new)
            did.append("сон и блокировка")
        if _hit(keys, ("power.lid",)):
            await self.lid_policy(new)
        if _hit(keys, ("keyboard.backlight",)):
            await self.core.keyboard_light(new)
        if _hit(keys, ("display.night",)):
            await self.core.night_light_tick(force=True)
        if _hit(keys, ("gestures.enabled",)):
            on = config.get("gestures.enabled", False, new)
            await util.arun(["systemctl", "--user", "start" if on else "stop", "haotica-gestures.service"])
        if _hit(keys, ("apps.show_kde",)):
            await asyncio.to_thread(self.kde_visibility, config.get("apps.show_kde", False, new))
        if _hit(keys, ("apps.browser", "apps.files", "apps.editor", "apps.viewer", "apps.player", "apps.terminal")):
            await self.default_apps(new)
        if _hit(keys, ("locale.per_window_layout",)):
            self.core.hypr.per_window = bool(config.get("locale.per_window_layout", True, new))
        if _hit(keys, ("haotica.", "cloud.", "locale.haotica_language", "power.haotica_on_battery")):
            await self.core.haotica_call("POST", "/api/reload", {})
        if _hit(keys, ("network.",)):
            self.core.recon_reschedule()
        return did

    # ── ассеты в фоне (несколько секунд) ─────────────────────────
    def _rebuild_assets(self, s: dict) -> None:
        if self._assets_task and not self._assets_task.done():
            self._assets_task.cancel()

        async def job() -> None:
            from ..cli import build_assets
            p = theme.current_palette(s)
            await asyncio.to_thread(build_assets, p, s)
            ap = s.get("appearance", {})
            await self.core.hypr.hyprctl("setcursor", ap.get("cursor_theme", "HAOTICA"), str(ap.get("cursor_size", 24)))
            self.core.publish_theme()
            self.core.events.add("ok", f"PALETTE // {p.name} APPLIED")

        self._assets_task = asyncio.create_task(job())

    # ── простой и сон: hypridle ──────────────────────────────────
    async def write_hypridle(self, s: dict) -> None:
        pw = s.get("power", {})
        lock, off, sus = (int(pw.get(k, d)) for k, d in (("autolock_minutes", 10), ("screen_off_minutes", 15),
                                                          ("suspend_minutes", 30)))
        blocks = [
            "# Автоматически создано HAOTICA (Настройки → Питание)",
            "general {",
            "    lock_cmd = pidof qs >/dev/null && qs -p /usr/share/haotica/shell ipc call haotica lock",
            "    before_sleep_cmd = loginctl lock-session",
            "    after_sleep_cmd = hyprctl dispatch dpms on",
            "    ignore_dbus_inhibit = false",
            "}",
            "",
            "listener {",
            "    timeout = 150",
            "    on-timeout = brightnessctl -s set 30%",
            "    on-resume = brightnessctl -r",
            "}",
        ]
        if lock > 0:
            blocks += ["", "listener {", f"    timeout = {lock * 60}", "    on-timeout = loginctl lock-session", "}"]
        if off > 0:
            blocks += ["", "listener {", f"    timeout = {off * 60}", "    on-timeout = hyprctl dispatch dpms off",
                       "    on-resume = hyprctl dispatch dpms on", "}"]
        if sus > 0:
            blocks += ["", "listener {", f"    timeout = {sus * 60}", "    on-timeout = systemctl suspend", "}"]
        util.atomic_write(H / ".config/hypr/hypridle.conf", "\n".join(blocks) + "\n")
        await util.arun(["systemctl", "--user", "restart", "hypridle.service"])

    # ── крышка: если не «сон», держим блокировку logind и действуем сами ──
    async def lid_policy(self, s: dict) -> None:
        mode = config.get("power.lid", "suspend", s)
        if self._lid_inhibit and self._lid_inhibit.returncode is None:
            self._lid_inhibit.terminate()
            self._lid_inhibit = None
        if mode != "suspend" and util.which("systemd-inhibit"):
            self._lid_inhibit = await asyncio.create_subprocess_exec(
                "systemd-inhibit", "--what=handle-lid-switch", "--who=HAOTICA", f"--why=крышка: {mode}",
                "--mode=block", "sleep", "infinity", stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)

    # ── приложения ───────────────────────────────────────────────
    def kde_visibility(self, show: bool) -> None:
        apps = H / ".local/share/applications"
        apps.mkdir(parents=True, exist_ok=True)
        for name in KDE_APPS:
            src = Path("/usr/share/applications") / f"{name}.desktop"
            dst = apps / f"{name}.desktop"
            if show:
                if dst.exists() and "X-HAOTICA-Hidden=true" in dst.read_text(errors="ignore"):
                    dst.unlink()
            elif src.exists():
                text = src.read_text(errors="ignore")
                lines = [ln for ln in text.splitlines() if not ln.startswith("NoDisplay=")]
                out, inserted = [], False
                for ln in lines:
                    out.append(ln)
                    if ln.strip() == "[Desktop Entry]" and not inserted:
                        out += ["NoDisplay=true", "X-HAOTICA-Hidden=true"]
                        inserted = True
                dst.write_text("\n".join(out) + "\n")

    async def default_apps(self, s: dict) -> None:
        ap = s.get("apps", {})
        for role, mimes in DEFAULT_MIME.items():
            desktop = ap.get(role)
            if desktop:
                await util.arun(["xdg-mime", "default", desktop, *mimes])
        if ap.get("browser"):
            await util.arun(["xdg-settings", "set", "default-web-browser", ap["browser"]])
        term = ap.get("terminal")
        if term:
            util.atomic_write(H / ".config/xdg-terminals.list", term + "\n")
