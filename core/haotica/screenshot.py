"""Скриншоты и запись экрана: grim + slurp, wf-recorder. Работает и без ядра (из привязок Hyprland)."""
from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from pathlib import Path

from . import paths, util

REC_PID = paths.RUNTIME_DIR / "recorder.pid"


def _dir(kind: str) -> Path:
    base = {"shot": "XDG_PICTURES_DIR", "rec": "XDG_VIDEOS_DIR"}[kind]
    d = None
    cfg = paths.HOME / ".config/user-dirs.dirs"
    if cfg.exists():
        for ln in cfg.read_text().splitlines():
            if ln.startswith(base + "="):
                d = Path(ln.split("=", 1)[1].strip('"').replace("$HOME", str(paths.HOME)))
    d = (d or paths.HOME / ("Pictures" if kind == "shot" else "Videos")) / ("Screenshots" if kind == "shot" else "Recordings")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _active_window_geom() -> str:
    r = util.run(["hyprctl", "-j", "activewindow"], 3)
    try:
        w = json.loads(r.stdout or "{}")
        (x, y), (wd, ht) = w["at"], w["size"]
        return f"{x},{y} {wd}x{ht}"
    except (ValueError, KeyError, TypeError):
        return ""


def _geometry(mode: str) -> str | None:
    """'' — весь экран, None — отмена выбора."""
    if mode == "area":
        r = util.run(["slurp", "-d", "-b", "#00000088", "-c", "#E0A243ff", "-w", "2"], 120)
        return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else None
    if mode == "window":
        return _active_window_geom() or None
    return ""


def shot(mode: str = "screen", edit: bool = False, copy: bool = True) -> Path | None:
    geom = _geometry(mode)
    if geom is None:
        return None
    out = _dir("shot") / time.strftime("HAOTICA_%Y-%m-%d_%H-%M-%S.png")
    cmd = ["grim"] + (["-g", geom] if geom else []) + [str(out)]
    if util.run(cmd, 20).returncode != 0:
        util.notify("Скриншот не удался", "grim вернул ошибку", "critical")
        return None
    if copy and util.which("wl-copy"):
        with open(out, "rb") as f:
            subprocess.run(["wl-copy", "--type", "image/png"], stdin=f, timeout=5, check=False)
    sound = paths.SHARE / "sounds/ui/screenshot.ogg"
    if sound.exists():
        util.spawn(["pw-play", "--volume", "0.45", str(sound)])
    if edit:
        util.spawn(["haotica", "open", "screenshot", "--edit", str(out)])
    else:
        util.spawn(["notify-send", "-a", "HAOTICA", "-i", str(out), "Скриншот сохранён",
                    f"{out.name} · скопирован в буфер"])
    return out


def recording() -> int:
    try:
        pid = int(REC_PID.read_text())
        os.kill(pid, 0)
        return pid
    except (OSError, ValueError):
        return 0


def record_toggle(mode: str = "screen", audio: bool = False) -> str:
    pid = recording()
    if pid:
        os.kill(pid, signal.SIGINT)
        REC_PID.unlink(missing_ok=True)
        util.notify("Запись остановлена", str(_dir("rec")))
        return "stopped"
    geom = _geometry(mode)
    if geom is None:
        return "cancelled"
    out = _dir("rec") / time.strftime("HAOTICA_%Y-%m-%d_%H-%M-%S.mp4")
    cmd = ["wf-recorder", "-f", str(out), "-c", "h264_vaapi", "-d", "/dev/dri/renderD128"]
    if geom:
        cmd += ["-g", geom]
    if audio:
        cmd.append("--audio")
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    REC_PID.parent.mkdir(parents=True, exist_ok=True)
    REC_PID.write_text(str(p.pid))
    util.notify("Идёт запись экрана", "Повторное нажатие остановит запись")
    return "recording"
