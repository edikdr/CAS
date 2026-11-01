"""Система: досье, процессы, службы, приложения и веб-приложения, звук, Bluetooth, Wi-Fi,
хранилище, обновления, диагностика, буфер обмена, скриншоты."""
from __future__ import annotations

import asyncio
import json
import os
import platform
import re
import shutil
import signal
import tarfile
import time
from pathlib import Path

import psutil
from aiohttp import web

from .. import __version__, desktop, helper, paths, screenshot, util
from .app import json_err, json_ok

USER_UNITS = re.compile(r"^(haotica-[\w-]+|hypridle|hyprsunset|pipewire|wireplumber|xdg-desktop-portal[\w-]*)\.(service|target)$")
_updates_cache: dict = {"ts": 0, "data": None}
_du_cache: dict = {"ts": 0, "data": None}


def _install_env() -> dict:
    out = {}
    f = paths.SYSTEM_ETC / "install.env"
    if f.exists():
        for ln in f.read_text().splitlines():
            k, _, v = ln.partition("=")
            out[k] = v.strip("'\"")
    return out


def sysinfo() -> dict:
    cpu = ""
    for ln in Path("/proc/cpuinfo").read_text().splitlines():
        if ln.startswith("model name"):
            cpu = ln.split(":", 1)[1].strip()
            break
    gpu = ""
    r = util.run(["lspci", "-mm"], 5)
    for ln in r.stdout.splitlines():
        if '"VGA' in ln or '"Display' in ln:
            parts = re.findall(r'"([^"]*)"', ln)
            gpu = parts[2] if len(parts) > 2 else ln
    vm = psutil.virtual_memory()
    du = psutil.disk_usage("/")
    env = _install_env()
    product = util.read("/sys/class/dmi/id/product_version") or util.read("/sys/class/dmi/id/product_name")
    sb = util.run(["bootctl", "status"], 5).stdout
    return {
        "hostname": platform.node(), "user": os.environ.get("USER", ""), "kernel": platform.release(),
        "os": "Arch Linux · HAOTICA " + __version__, "device": product, "cpu": cpu, "cores": psutil.cpu_count(),
        "gpu": gpu, "ram_gb": round(vm.total / 1024 ** 3, 1), "disk_total_gb": round(du.total / 1e9),
        "disk_used_gb": round(du.used / 1e9), "install_date": env.get("INSTALL_DATE", ""),
        "uptime_s": int(time.time() - psutil.boot_time()), "secure_boot": "Secure Boot: enabled" in sb,
        "bios": util.read("/sys/class/dmi/id/bios_version"),
    }


def setup(app: web.Application) -> None:
    r = app.router
    core = app["core"]

    async def body(req) -> dict:
        try:
            b = await req.json()
            return b if isinstance(b, dict) else {}
        except ValueError:
            return {}

    # ── досье и процессы ───────────────────────────────────────
    async def info(_req):
        return json_ok({"info": await asyncio.to_thread(sysinfo)})

    async def procs(req):
        key = req.query.get("sort", "cpu")

        def collect() -> list[dict]:
            out = []
            for p in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_info", "cmdline",
                                          "status", "create_time", "num_threads"]):
                i = p.info
                mem = i["memory_info"].rss if i.get("memory_info") else 0
                out.append({"pid": i["pid"], "name": i["name"], "user": i["username"], "cpu": i["cpu_percent"] or 0,
                            "mem_mb": round(mem / 1048576, 1), "cmd": " ".join(i["cmdline"] or [])[:200],
                            "status": i["status"], "threads": i["num_threads"], "started": int(i["create_time"] or 0),
                            "mine": i["username"] == os.environ.get("USER")})
            out.sort(key=lambda x: x["mem_mb"] if key == "mem" else x["cpu"], reverse=True)
            return out[:250]
        return json_ok({"procs": await asyncio.to_thread(collect)})

    async def kill(req):
        b = await body(req)
        sig = {"term": signal.SIGTERM, "kill": signal.SIGKILL, "stop": signal.SIGSTOP, "cont": signal.SIGCONT}.get(
            str(b.get("signal", "term")), signal.SIGTERM)
        try:
            p = psutil.Process(int(b.get("pid", 0)))
            if p.uids().real != os.getuid():
                return json_err("чужой процесс — завершить нельзя", 403)
            p.send_signal(sig)
        except (psutil.Error, ValueError) as e:
            return json_err(str(e))
        return json_ok()

    async def services(_req):
        rc, out, _ = await util.arun(["systemctl", "--user", "list-units", "--all", "--output=json",
                                      "haotica-*", "hypridle.service", "hyprsunset.service"], 10)
        units = json.loads(out) if rc == 0 and out.strip().startswith("[") else []
        return json_ok({"units": units})

    async def service(req):
        b = await body(req)
        unit, action = str(b.get("unit", "")), str(b.get("action", ""))
        if not USER_UNITS.match(unit) or action not in ("start", "stop", "restart"):
            return json_err("недопустимо", 403)
        rc, _, err = await util.arun(["systemctl", "--user", action, unit], 30)
        return json_ok() if rc == 0 else json_err(err.strip())

    r.add_get("/api/sys/info", info)
    r.add_get("/api/sys/procs", procs)
    r.add_post("/api/sys/kill", kill)
    r.add_get("/api/sys/services", services)
    r.add_post("/api/sys/service", service)

    # ── приложения ─────────────────────────────────────────────
    async def apps(req):
        return json_ok({"apps": await asyncio.to_thread(desktop.entries, req.query.get("all") == "1")})

    async def launch(req):
        b = await body(req)
        app_id = re.sub(r"[^\w.\-]", "", str(b.get("id", "")))
        if app_id.startswith("haotica-") and not app_id.startswith(desktop.WEB_PREFIX):
            util.spawn(["haotica", "open", app_id.removeprefix("haotica-")])
        else:
            util.spawn(["gtk-launch", app_id])
        return json_ok()

    async def autostart(req):
        if req.method == "POST":
            b = await body(req)
            await asyncio.to_thread(desktop.autostart_set, str(b.get("id", "")), bool(b.get("enabled")))
        return json_ok({"items": await asyncio.to_thread(desktop.autostart_list)})

    async def webapps(req):
        if req.method == "POST":
            b = await body(req)
            name, url = str(b.get("name", "")).strip(), str(b.get("url", "")).strip()
            if not name or not url:
                return json_err("нужны имя и адрес сайта")
            res = await asyncio.to_thread(desktop.webapp_create, name, url, str(b.get("category", "social")),
                                          bool(b.get("isolated")), str(b.get("monogram", ""))[:3])
            await util.arun(["update-desktop-database", str(paths.XDG_DATA / "applications")], 20)
            return json_ok(res)
        if req.method == "DELETE":
            ok = desktop.webapp_delete(req.query.get("id", ""))
            return json_ok({"deleted": ok})
        items = [a for a in await asyncio.to_thread(desktop.entries, True) if a["web"]]
        return json_ok({"webapps": items})

    r.add_get("/api/apps", apps)
    r.add_post("/api/apps/launch", launch)
    r.add_route("*", "/api/apps/autostart", autostart)
    r.add_route("*", "/api/webapps", webapps)

    # ── звук (PipeWire через pactl) ─────────────────────────────
    def _vol(x: dict) -> float:
        pct = [int(str(v.get("value_percent", "0%")).rstrip("%") or 0) for v in (x.get("volume") or {}).values()]
        return round(max(pct) / 100, 2) if pct else 0.0

    async def audio_get(_req):
        res = {}
        for what in ("sinks", "sources", "sink-inputs"):
            rc, out, _ = await util.arun(["pactl", "-f", "json", "list", what], 8)
            try:
                items = json.loads(out) if rc == 0 else []
            except ValueError:
                items = []
            res[what.replace("-", "_")] = [
                {"id": x.get("index"), "name": x.get("name"),
                 "description": x.get("description") or x.get("properties", {}).get("application.name", ""),
                 "volume": _vol(x), "mute": x.get("mute", False),
                 "app": x.get("properties", {}).get("application.name", ""),
                 "icon": x.get("properties", {}).get("application.icon_name", "")}
                for x in items if not str(x.get("name", "")).endswith(".monitor")]
        for k, cmd in (("default_sink", "get-default-sink"), ("default_source", "get-default-source")):
            rc, out, _ = await util.arun(["pactl", cmd], 5)
            res[k] = out.strip()
        return json_ok(res)

    async def audio_post(req):
        b = await body(req)
        act, target = str(b.get("action", "")), str(b.get("target", ""))
        if not re.match(r"^[\w.\-:@]+$", target or "x"):
            return json_err("цель?")
        cmd = {
            "default-sink": ["pactl", "set-default-sink", target],
            "default-source": ["pactl", "set-default-source", target],
            "sink-volume": ["pactl", "set-sink-volume", target, f"{int(float(b.get('value', 0.5)) * 100)}%"],
            "source-volume": ["pactl", "set-source-volume", target, f"{int(float(b.get('value', 0.5)) * 100)}%"],
            "app-volume": ["pactl", "set-sink-input-volume", target, f"{int(float(b.get('value', 0.5)) * 100)}%"],
            "sink-mute": ["pactl", "set-sink-mute", target, "toggle"],
            "source-mute": ["pactl", "set-source-mute", target, "toggle"],
            "app-mute": ["pactl", "set-sink-input-mute", target, "toggle"],
        }.get(act)
        if not cmd:
            return json_err("действие?")
        rc, _, err = await util.arun(cmd, 5)
        return json_ok() if rc == 0 else json_err(err.strip())

    r.add_get("/api/audio", audio_get)
    r.add_post("/api/audio", audio_post)

    # ── Bluetooth ──────────────────────────────────────────────
    async def bt_get(_req):
        rc, out, _ = await util.arun(["bluetoothctl", "show"], 5)
        powered = "Powered: yes" in out
        devs = []
        rc, out, _ = await util.arun(["bluetoothctl", "devices"], 5)
        for ln in out.splitlines():
            m = re.match(r"Device ([0-9A-F:]{17}) (.*)", ln)
            if not m:
                continue
            rc2, inf, _ = await util.arun(["bluetoothctl", "info", m.group(1)], 5)
            def g(k: str, inf: str = inf) -> str:
                m2 = re.search(rf"{k}: (.*)", inf)
                return m2.group(1).strip() if m2 else ""
            bat = re.search(r"Battery Percentage: 0x[0-9a-f]+ \((\d+)\)", inf)
            devs.append({"mac": m.group(1), "name": m.group(2), "paired": g("Paired") == "yes",
                         "connected": g("Connected") == "yes", "trusted": g("Trusted") == "yes",
                         "icon": g("Icon"), "battery": int(bat.group(1)) if bat else None})
        return json_ok({"powered": powered, "devices": devs})

    async def bt_post(req):
        b = await body(req)
        act, mac = str(b.get("action", "")), str(b.get("mac", ""))
        if act in ("power-on", "power-off"):
            rc, _, err = await util.arun(["bluetoothctl", "power", act.split("-")[1]], 10)
        elif act == "scan":
            rc, _, err = await util.arun(["bluetoothctl", "--timeout", "12", "scan", "on"], 20)
        elif act in ("pair", "connect", "disconnect", "remove", "trust", "untrust") and re.match(r"^[0-9A-F:]{17}$", mac):
            rc, _, err = await util.arun(["bluetoothctl", act, mac], 40)
        else:
            return json_err("действие?")
        return json_ok() if rc == 0 else json_err(err.strip() or "не получилось")

    r.add_get("/api/bt", bt_get)
    r.add_post("/api/bt", bt_post)

    # ── Wi-Fi и VPN (NetworkManager) ────────────────────────────
    def _nm_split(line: str) -> list[str]:
        return [x.replace("\\:", ":") for x in re.split(r"(?<!\\):", line)]

    async def wifi_get(req):
        if req.query.get("rescan") == "1":
            await util.arun(["nmcli", "device", "wifi", "rescan"], 15)
        rc, out, _ = await util.arun(["nmcli", "-t", "-f", "IN-USE,SSID,BSSID,SIGNAL,SECURITY,CHAN,FREQ,RATE",
                                      "device", "wifi", "list"], 15)
        nets, seen = [], set()
        for ln in out.splitlines():
            f = _nm_split(ln)
            if len(f) < 8 or not f[1] or f[1] in seen:
                continue
            seen.add(f[1])
            nets.append({"active": f[0] == "*", "ssid": f[1], "bssid": f[2], "signal": int(f[3] or 0),
                         "security": f[4], "channel": f[5], "freq": f[6], "rate": f[7]})
        rc, radio, _ = await util.arun(["nmcli", "radio", "wifi"], 5)
        rc, conns, _ = await util.arun(["nmcli", "-t", "-f", "NAME,UUID,TYPE,ACTIVE", "connection", "show"], 5)
        saved = []
        for ln in conns.splitlines():
            f = _nm_split(ln)
            if len(f) >= 4:
                saved.append({"name": f[0], "uuid": f[1], "type": f[2], "active": f[3] == "yes"})
        return json_ok({"radio": radio.strip() == "enabled", "networks": nets, "connections": saved})

    async def wifi_post(req):
        b = await body(req)
        act = str(b.get("action", ""))
        if act == "connect":
            cmd = ["nmcli", "device", "wifi", "connect", str(b.get("ssid", ""))]
            if b.get("password"):
                cmd += ["password", str(b["password"])]
        elif act in ("up", "down", "delete"):
            cmd = ["nmcli", "connection", act, "uuid", str(b.get("uuid", ""))]
        elif act in ("radio-on", "radio-off"):
            cmd = ["nmcli", "radio", "wifi", act.split("-")[1]]
        else:
            return json_err("действие?")
        rc, out, err = await util.arun(cmd, 45)
        if rc == 0 and act == "connect":
            core.events.add("net", f"LINK // {str(b.get('ssid', ''))[:40]} CONNECTED", sound="net_up")
        return json_ok({"info": out.strip()}) if rc == 0 else json_err((err or out).strip())

    r.add_get("/api/wifi", wifi_get)
    r.add_post("/api/wifi", wifi_post)

    # ── хранилище и очистка ─────────────────────────────────────
    def _dir_size(p: Path) -> int:
        total = 0
        for root, _dirs, files in os.walk(p, onerror=lambda e: None):
            for f in files:
                try:
                    total += os.lstat(os.path.join(root, f)).st_size
                except OSError:
                    pass
        return total

    async def storage(_req):
        def collect() -> dict:
            disks = []
            for part in psutil.disk_partitions():
                if part.fstype in ("squashfs", "tmpfs", "overlay") or part.mountpoint.startswith("/var/lib/docker"):
                    continue
                try:
                    u = psutil.disk_usage(part.mountpoint)
                except OSError:
                    continue
                disks.append({"mount": part.mountpoint, "device": part.device, "fs": part.fstype,
                              "total": u.total, "used": u.used, "free": u.free})
            sizes = {
                "cache": _dir_size(paths.XDG_CACHE), "thumbs": _dir_size(paths.CACHE_DIR / "thumbs"),
                "trash": _dir_size(paths.XDG_DATA / "Trash"), "models": _dir_size(paths.MODELS_DIR),
                "pacman": _dir_size(Path("/var/cache/pacman/pkg")),
            }
            return {"disks": disks, "sizes": sizes}
        if time.time() - _du_cache["ts"] > 120 or _du_cache["data"] is None:
            _du_cache.update(ts=time.time(), data=await asyncio.to_thread(collect))
        rc, out, _ = await util.arun(["journalctl", "--disk-usage"], 10)
        m = re.search(r"take up ([\d.]+\s*\w+)", out)
        return json_ok({**_du_cache["data"], "journal": m.group(1) if m else ""})

    async def storage_clean(req):
        b = await body(req)
        what = str(b.get("what", ""))
        if what == "thumbs":
            shutil.rmtree(paths.CACHE_DIR / "thumbs", ignore_errors=True)
        elif what == "cache":
            for sub in paths.XDG_CACHE.iterdir() if paths.XDG_CACHE.exists() else []:
                if sub.name in ("haotica",) or sub.name.startswith("."):
                    continue
                shutil.rmtree(sub, ignore_errors=True) if sub.is_dir() else sub.unlink(missing_ok=True)
        elif what == "trash":
            await util.arun(["gio", "trash", "--empty"], 120)
        elif what in ("pacman", "journal", "coredumps"):
            res = await helper.call("clean", what)
            if not res.get("ok"):
                return json_err(res.get("error", "ошибка"))
        else:
            return json_err("что чистить?")
        _du_cache["ts"] = 0
        core.events.add("ok", f"STORAGE // {what.upper()} CLEANED")
        return json_ok()

    r.add_get("/api/storage", storage)
    r.add_post("/api/storage/clean", storage_clean)

    # ── обновления ─────────────────────────────────────────────
    async def updates(req):
        if req.query.get("refresh") == "1" or time.time() - _updates_cache["ts"] > 1800:
            rc, out, _ = await util.arun(["checkupdates"], 120)
            repo = [ln for ln in out.splitlines() if " -> " in ln]
            aur = []
            if util.which("paru"):
                rc2, out2, _ = await util.arun(["paru", "-Qua"], 120)
                aur = [ln for ln in out2.splitlines() if " -> " in ln]
            rc3, out3, _ = await util.arun(["flatpak", "remote-ls", "--updates", "--columns=application"], 60)
            flat = [ln for ln in out3.splitlines() if ln.strip()] if rc3 == 0 else []
            _updates_cache.update(ts=time.time(), data={"repo": repo, "aur": aur, "flatpak": flat})
        d = _updates_cache["data"]
        return json_ok({**d, "count": sum(len(v) for v in d.values()), "checked": int(_updates_cache["ts"])})

    async def updates_run(_req):
        util.spawn(["haotica", "open", "terminal", "--run", "haotica update"])
        return json_ok()

    async def models_status(_req):
        from .. import models as _m
        st = await asyncio.to_thread(_m.status)
        for role, v in st.items():
            v["role"] = role
        return json_ok({"models": st, "engine": str(_m.llama_server() or "")})

    r.add_get("/api/models", models_status)
    r.add_get("/api/updates", updates)
    r.add_post("/api/updates/run", updates_run)

    # ── диагностика: один архив для отправки разработчику ─────────
    async def diag(_req):
        stamp = time.strftime("%Y%m%d-%H%M%S")
        outdir = paths.HOME / "Desktop" if (paths.HOME / "Desktop").is_dir() else paths.HOME
        work = paths.CACHE_DIR / f"diag-{stamp}"
        work.mkdir(parents=True, exist_ok=True)
        cmds = {
            "journal-user.txt": ["journalctl", "--user", "-b", "-n", "3000", "--no-pager"],
            "journal-system.txt": ["journalctl", "-b", "-p", "warning", "-n", "3000", "--no-pager"],
            "hyprland.txt": ["hyprctl", "rollinglog"],
            "hypr-config-errors.txt": ["hyprctl", "configerrors"],
            "lspci.txt": ["lspci", "-nnk"], "lsusb.txt": ["lsusb"], "sensors.txt": ["sensors"],
            "services.txt": ["systemctl", "--user", "--no-pager", "status", "haotica-*"],
            "failed.txt": ["systemctl", "--failed", "--no-pager"], "uname.txt": ["uname", "-a"],
            "pacman-haotica.txt": ["pacman", "-Q"], "audio.txt": ["pactl", "info"],
        }
        for name, cmd in cmds.items():
            rc, out, err = await util.arun(cmd, 30)
            (work / name).write_text(out + ("\n" + err if err else ""))
        for f in (paths.SETTINGS_FILE, Path("/var/lib/haotica/install.state"), Path("/var/lib/haotica/hardware.env"),
                  paths.SYSTEM_ETC / "install.env"):
            if f.exists():
                shutil.copy(f, work / f.name)
        logs = paths.LOG_DIR
        if logs.exists():
            shutil.copytree(logs, work / "logs", dirs_exist_ok=True)
        # вычистить похожее на ключи и токены
        rx = re.compile(r"(sk-[\w-]{16,}|sk-or-[\w-]{16,}|ghp_\w{20,}|xox[bap]-[\w-]+|[A-Za-z0-9_\-]{32,}(?=\s|$))")
        for f in work.rglob("*"):
            if f.is_file() and f.stat().st_size < 20 * 1024 * 1024:
                try:
                    f.write_text(rx.sub("[REDACTED]", f.read_text(errors="replace")))
                except OSError:
                    pass
        target = outdir / f"haotica-report-{stamp}.tar.gz"
        with tarfile.open(target, "w:gz") as tar:
            tar.add(work, arcname=f"haotica-report-{stamp}")
        shutil.rmtree(work, ignore_errors=True)
        core.events.add("ok", "DIAGNOSTICS // REPORT READY")
        return json_ok({"file": str(target)})

    r.add_post("/api/diag", diag)

    # ── буфер обмена (cliphist) ─────────────────────────────────
    pins_file = paths.STATE_DIR / "clipboard-pins.json"

    async def clip_get(_req):
        rc, out, _ = await util.arun(["cliphist", "list"], 10)
        items = []
        for ln in out.splitlines()[:150]:
            cid, _, text = ln.partition("\t")
            items.append({"id": cid, "text": text[:300], "image": text.startswith("[[ binary data")})
        return json_ok({"items": items, "pins": util.load_json(pins_file, []) or []})

    async def clip_post(req):
        b = await body(req)
        act, cid = str(b.get("action", "")), str(b.get("id", ""))
        if act == "copy" and cid.isdigit():
            await util.arun(["sh", "-c", f"cliphist decode {cid} | wl-copy"], 10)
        elif act == "delete" and cid.isdigit():
            await util.arun(["sh", "-c", f"cliphist list | grep -m1 '^{cid}\t' | cliphist delete"], 10)
        elif act == "wipe":
            await util.arun(["cliphist", "wipe"], 10)
        elif act == "pin":
            rc, out, _ = await util.arun(["cliphist", "decode", cid], 10) if cid.isdigit() else (1, "", "")
            pins = util.load_json(pins_file, []) or []
            text = out if rc == 0 else str(b.get("text", ""))
            if text and text not in pins:
                pins.insert(0, text[:20000])
            util.write_json(pins_file, pins[:50], 0o600)
        elif act == "unpin":
            pins = [p for p in (util.load_json(pins_file, []) or []) if p != b.get("text")]
            util.write_json(pins_file, pins, 0o600)
        elif act == "copy-text":
            await util.arun(["wl-copy"], 5, input=str(b.get("text", "")))
        else:
            return json_err("действие?")
        return json_ok()

    r.add_get("/api/clipboard", clip_get)
    r.add_post("/api/clipboard", clip_post)

    # ── скриншоты и запись ─────────────────────────────────────
    async def shot(req):
        b = await body(req)
        if b.get("record"):
            return json_ok({"state": await asyncio.to_thread(screenshot.record_toggle, str(b.get("mode", "screen")),
                                                             bool(b.get("audio")))})
        f = await asyncio.to_thread(screenshot.shot, str(b.get("mode", "screen")), bool(b.get("edit")))
        return json_ok({"file": str(f) if f else ""})

    r.add_post("/api/screenshot", shot)
