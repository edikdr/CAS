"""Платформа: Linux (HAOTICA OS на Arch) или Windows (HAOTICA Terminal).

Функции, которых на платформе нет, отключаются флагами: ядро отвечает 501 на их маршруты,
интерфейс скрывает соответствующие плитки и страницы (GET /api/platform).
"""
from __future__ import annotations

import os
import shutil
import sys

IS_WINDOWS = os.name == "nt"
IS_LINUX = sys.platform.startswith("linux")
NAME = "windows" if IS_WINDOWS else "linux" if IS_LINUX else sys.platform

# маршруты ядра, которые есть только в HAOTICA OS (systemd, PipeWire, NetworkManager, BlueZ, Hyprland…)
LINUX_ONLY_ROUTES = (
    "/api/sys/services", "/api/sys/service", "/api/audio", "/api/bt", "/api/wifi", "/api/updates",
    "/api/gamemode", "/api/display", "/api/lid", "/api/system/", "/api/recon", "/api/storage/clean",
    "/api/apps/launch", "/api/screenshot", "/api/clipboard",
)


def features() -> dict:
    """Что доступно на этой машине (для интерфейса)."""
    linux = IS_LINUX
    return {
        "platform": NAME,
        "hyprland": linux and bool(os.environ.get("HYPRLAND_INSTANCE_SIGNATURE")),
        "systemd": linux and bool(shutil.which("systemctl")),
        "audio": linux and bool(shutil.which("pactl") or shutil.which("wpctl")),
        "wifi": linux and bool(shutil.which("nmcli")),
        "bluetooth": linux and bool(shutil.which("bluetoothctl")),
        "power_profiles": linux and bool(shutil.which("powerprofilesctl")),
        "gamemode": linux,
        "recon": linux,
        "updates": linux,
        "screen_crt": linux,
        "trash": True,
        "wsl": IS_WINDOWS and bool(shutil.which("wsl.exe") or shutil.which("wsl")),
        "credential_manager": IS_WINDOWS,
        "temps": linux,
    }


def route_supported(path: str) -> bool:
    if not IS_WINDOWS:
        return True
    return not any(path == p or path.startswith(p.rstrip("/") + "/") or (p.endswith("/") and path.startswith(p))
                   for p in LINUX_ONLY_ROUTES)


def creationflags_detached() -> int:
    """Флаги CreateProcess для фоновых процессов без консольного окна."""
    if not IS_WINDOWS:
        return 0
    import subprocess
    return subprocess.CREATE_NEW_PROCESS_GROUP | getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
