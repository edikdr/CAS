"""API ядра: настройки (с отменой и историей), профили оформления, события, режим «Игра»,
экран (с откатом), системные действия через haotica-helper, сеть (Recon), секреты."""
from __future__ import annotations

import asyncio
import json
import re
import shutil
import time
from pathlib import Path

from aiohttp import web

from .. import __version__, config, helper, paths, secrets, theme, util
from .app import json_err, json_ok

SYSTEM_ACTIONS = {"locale", "timezone", "ntp", "keymap", "service", "firewall", "snapshot", "clean",
                  "hostname", "charge", "face"}
PROFILE_SECTIONS = ("appearance", "effects", "animations")
PROFILES = paths.CONFIG_DIR / "profiles"


async def _body(request: web.Request) -> dict:
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def setup(app: web.Application) -> None:
    core = app["core"]
    r = app.router

    # ── общее ──────────────────────────────────────────────────
    async def ping(_req):
        return json_ok({"version": __version__, "uptime": int(time.time() - core.started),
                        "hyprland": core.hypr.available})

    async def metrics(_req):
        return json_ok({"metrics": core.metrics.data})

    async def get_theme(_req):
        return json_ok({"theme": util.load_json(paths.RUNTIME_DIR / "theme.json", {})})

    r.add_get("/api/ping", ping)
    r.add_get("/api/stream", core.hub.stream)
    r.add_get("/api/metrics", metrics)
    r.add_get("/api/theme", get_theme)

    # ── настройки ──────────────────────────────────────────────
    async def get_settings(_req):
        return json_ok({"settings": config.load(), "defaults": config.load_defaults()})

    async def post_settings(req):
        b = await _body(req)
        changes = b.get("changes")
        if not isinstance(changes, dict) or not changes:
            return json_err("нужно поле changes: {ключ: значение}")
        res = await core.set_settings(changes, source=str(b.get("source", "settings"))[:20])
        return web.json_response(res, status=200 if res.get("ok") else 400)

    async def undo(req):
        b = await _body(req)
        return web.json_response(await core.undo(str(b.get("id", ""))))

    async def history(_req):
        return json_ok({"history": list(core.history)[::-1]})

    async def reset(req):
        b = await _body(req)
        section = b.get("section") or None
        old = config.load()
        new = config.reset(section)
        keys = {f"{section}."} if section else {f"{k}." for k in new}
        did = await core.applier.apply({k for k in keys}, old, new)
        return json_ok({"did": did})

    r.add_get("/api/settings", get_settings)
    r.add_post("/api/settings", post_settings)
    r.add_post("/api/settings/undo", undo)
    r.add_get("/api/settings/history", history)
    r.add_post("/api/settings/reset", reset)

    # ── профили оформления: сохранить вид целиком, переключить, экспорт/импорт ──
    def _safe(name: str) -> str:
        return re.sub(r"[^\w\- ]", "", name).strip()[:40]

    async def profiles_list(_req):
        PROFILES.mkdir(parents=True, exist_ok=True)
        items = []
        for f in sorted(PROFILES.glob("*.json")):
            d = util.load_json(f, {})
            items.append({"name": f.stem, "profile": d.get("appearance", {}).get("profile", ""), "saved": int(f.stat().st_mtime)})
        return json_ok({"profiles": items})

    async def profiles_save(req):
        b = await _body(req)
        name = _safe(str(b.get("name", "")))
        if not name:
            return json_err("имя профиля?")
        s = config.load()
        util.write_json(PROFILES / f"{name}.json", {k: s.get(k, {}) for k in PROFILE_SECTIONS})
        return json_ok({"name": name})

    async def profiles_apply(req):
        b = await _body(req)
        name = _safe(str(b.get("name", "")))
        data = b.get("data") if isinstance(b.get("data"), dict) else util.load_json(PROFILES / f"{name}.json", None)
        if not data:
            return json_err("профиль не найден", 404)
        flat = {}
        for sec in PROFILE_SECTIONS:
            for k, v in (data.get(sec) or {}).items():
                if isinstance(v, dict):
                    for kk, vv in v.items():
                        flat[f"{sec}.{k}.{kk}"] = vv
                else:
                    flat[f"{sec}.{k}"] = v
        return web.json_response(await core.set_settings(flat, source="profile"))

    async def profiles_delete(req):
        name = _safe(req.match_info["name"])
        (PROFILES / f"{name}.json").unlink(missing_ok=True)
        return json_ok()

    async def profiles_export(req):
        name = _safe(req.match_info["name"])
        data = util.load_json(PROFILES / f"{name}.json", None)
        if data is None:
            return json_err("профиль не найден", 404)
        return web.json_response({"haotica_profile": 1, "name": name, **data},
                                 headers={"Content-Disposition": f'attachment; filename="{name}.haotica.json"'})

    r.add_get("/api/settings/profiles", profiles_list)
    r.add_post("/api/settings/profiles", profiles_save)
    r.add_post("/api/settings/profiles/apply", profiles_apply)
    r.add_delete("/api/settings/profiles/{name}", profiles_delete)
    r.add_get("/api/settings/profiles/{name}/export", profiles_export)

    # ── события ────────────────────────────────────────────────
    async def events_get(req):
        return json_ok({"events": core.events.recent(int(req.query.get("n", 30)))})

    async def events_post(req):
        b = await _body(req)
        text = str(b.get("text", "")).strip()
        if not text:
            return json_err("text?")
        e = core.events.add(str(b.get("kind", "info")), text, notify=bool(b.get("notify")),
                            title=str(b.get("title", ""))[:60], sound=str(b.get("sound", ""))[:32])
        return json_ok({"event": e})

    r.add_get("/api/events", events_get)
    r.add_post("/api/events", events_post)

    # ── режим «Игра» ───────────────────────────────────────────
    async def game_get(_req):
        return json_ok(core.game.status())

    async def game_post(req):
        b = await _body(req)
        want = b.get("on")
        if want is None or b.get("toggle"):
            want = not core.game.on
        return json_ok(await core.game.set(bool(want)))

    r.add_get("/api/gamemode", game_get)
    r.add_post("/api/gamemode", game_post)

    # ── экран ──────────────────────────────────────────────────
    async def display_get(_req):
        mons = await core.hypr.monitors() if core.hypr.available else []
        return json_ok({"monitors": mons, "display": config.get("display", {})})

    async def display_apply(req):
        b = await _body(req)
        changes = {k: v for k, v in (b.get("changes") or {}).items() if k.startswith("display.")}
        if not changes:
            return json_err("изменений экрана нет")
        return web.json_response(await core.display_apply(changes, int(b.get("timeout", 15))))

    async def display_confirm(_req):
        return json_ok(core.display_confirm())

    async def display_revert(_req):
        return web.json_response(await core.display_revert())

    r.add_get("/api/display", display_get)
    r.add_post("/api/display/apply", display_apply)
    r.add_post("/api/display/confirm", display_confirm)
    r.add_post("/api/display/revert", display_revert)

    # ── крышка (вызывается привязкой Hyprland switch:Lid Switch) ──
    async def lid(req):
        b = await _body(req)
        if b.get("state") != "close":
            await core.hypr.hyprctl("dispatch", "dpms", "on")
            return json_ok()
        mode = config.get("power.lid", "suspend")
        if mode == "lock":
            util.spawn(["loginctl", "lock-session"])
        elif mode == "screen_off":
            await core.hypr.hyprctl("dispatch", "dpms", "off")
        return json_ok({"mode": mode})

    r.add_post("/api/lid", lid)

    # ── системные действия (пароль спросит окно polkit) ─────────
    async def system_action(req):
        action = req.match_info["action"]
        if action not in SYSTEM_ACTIONS:
            return json_err("действие не разрешено", 403)
        b = await _body(req)
        args = [str(a) for a in b.get("args", []) if isinstance(a, (str, int, float))]
        res = await helper.call(action, *args)
        if res.get("ok"):
            core.events.add("ok", f"SYSTEM // {action.upper()} APPLIED")
        return web.json_response(res, status=200 if res.get("ok") else 400)

    async def system_theme(_req):
        """Тема экрана входа, курсор и заставка — из текущей палитры (нужен пароль)."""
        from .. import art
        stage = paths.CACHE_DIR / "system-theme"
        shutil.rmtree(stage, ignore_errors=True)
        stage.mkdir(parents=True)
        s = config.load()
        p = theme.current_palette(s)
        util.write_json(stage / "theme.json", theme.runtime_theme(p, s))
        wall = paths.DATA_DIR / "wallpapers/current/full.png"
        if wall.exists():
            shutil.copyfile(wall, stage / "greeter-wallpaper.png")
        icons = paths.XDG_DATA / "icons/HAOTICA"
        if icons.exists():
            await asyncio.to_thread(shutil.copytree, icons, stage / "icons", symlinks=True)
        await asyncio.to_thread(art.render_plymouth, p, stage / "plymouth")
        res = await helper.call("system-theme", str(stage))
        return web.json_response(res, status=200 if res.get("ok") else 400)

    async def system_lists(req):
        what = req.match_info["what"]
        if what == "timezones":
            rc, out, _ = await util.arun(["timedatectl", "list-timezones"], 10)
            return json_ok({"items": out.split()})
        if what == "locales":
            items = []
            sup = Path("/usr/share/i18n/SUPPORTED")
            if sup.exists():
                items = sorted({ln.split()[0] for ln in sup.read_text().splitlines() if ln.endswith("UTF-8")})
            rc, out, _ = await util.arun(["localectl", "list-locales"], 10)
            return json_ok({"items": items, "installed": out.split()})
        if what == "status":
            rc, out, _ = await util.arun(["localectl", "status"], 5)
            rc2, out2, _ = await util.arun(["timedatectl", "show"], 5)
            td = dict(ln.split("=", 1) for ln in out2.splitlines() if "=" in ln)
            return json_ok({"localectl": out, "timezone": td.get("Timezone", ""), "ntp": td.get("NTP") == "yes"})
        return json_err("нет такого списка", 404)

    r.add_post("/api/system/theme", system_theme)
    r.add_get("/api/system/list/{what}", system_lists)
    r.add_post("/api/system/{action}", system_action)

    # ── сеть: Recon ────────────────────────────────────────────
    async def recon_get(_req):
        return json_ok(core.recon.summary())

    async def recon_scan(_req):
        return json_ok(await core.recon.sweep())

    async def recon_probe(req):
        b = await _body(req)
        return web.json_response(await core.recon.probe(str(b.get("ip", ""))))

    async def recon_label(req):
        b = await _body(req)
        return web.json_response(core.recon.label(str(b.get("key", "")), b.get("label"), b.get("known")))

    r.add_get("/api/recon", recon_get)
    r.add_post("/api/recon/scan", recon_scan)
    r.add_post("/api/recon/probe", recon_probe)
    r.add_post("/api/recon/label", recon_label)

    # ── секреты (связка ключей): значения наружу не отдаются, только маска ──
    async def secrets_get(_req):
        return json_ok({"secrets": await secrets.status()})

    async def secrets_post(req):
        b = await _body(req)
        name, value = str(b.get("name", "")), str(b.get("value", ""))
        if name not in secrets.NAMES:
            return json_err("неизвестный секрет")
        ok = await (secrets.store(name, value) if value else secrets.clear(name))
        if name.startswith(("openrouter", "elevenlabs")):
            await core.haotica_call("POST", "/api/reload", {})
        return json_ok({"stored": ok, "secrets": await secrets.status()})

    r.add_get("/api/secrets", secrets_get)
    r.add_post("/api/secrets", secrets_post)
