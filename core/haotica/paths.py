"""Пути и адреса HAOTICA. Единое место — меняйте здесь, а не по коду.

Linux (Arch, systemd): XDG-каталоги. Windows: конфиг — %APPDATA%\\Haotica, данные и модели —
%LOCALAPPDATA%\\Haotica\\data, состояние/токен — …\\state, живые JSON — …\\run, журналы — …\\logs,
тяжёлые компоненты (llama.cpp, окружение речи) — …\\opt. HAOTICA_DEV_ROOT — корень репозитория
для разработки (ресурсы берутся из него), HAOTICA_HOME — один общий корень для всех каталогов
состояния (тесты и «портативный» режим).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

IS_WINDOWS = os.name == "nt"
HOME = Path.home()
_HOME_OVERRIDE = os.environ.get("HAOTICA_HOME")
# XDG-каталоги (на Windows нужны только старому Linux-коду: иконки, корзина, кэш)
XDG_CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config"))
XDG_DATA = Path(os.environ.get("XDG_DATA_HOME", HOME / ".local/share"))
XDG_STATE = Path(os.environ.get("XDG_STATE_HOME", HOME / ".local/state"))
XDG_CACHE = Path(os.environ.get("XDG_CACHE_HOME", HOME / ".cache"))
RUNTIME_BASE = Path(os.environ.get("XDG_RUNTIME_DIR") or
                    (f"/run/user/{os.getuid()}" if hasattr(os, "getuid") else HOME / "AppData/Local/Temp"))

if _HOME_OVERRIDE:                                   # всё состояние в одном каталоге (тесты, портативный режим)
    _base = Path(_HOME_OVERRIDE)
    CONFIG_DIR = _base / "config"
    DATA_DIR = _base / "data"
    STATE_DIR = _base / "state"
    CACHE_DIR = _base / "cache"
    RUNTIME_DIR = _base / "run"
    LOG_DIR = _base / "logs"
    OPT = Path(os.environ.get("HAOTICA_OPT", _base / "opt"))
elif IS_WINDOWS:
    _roaming = Path(os.environ.get("APPDATA") or HOME / "AppData/Roaming")
    _local = Path(os.environ.get("LOCALAPPDATA") or HOME / "AppData/Local") / "Haotica"
    CONFIG_DIR = _roaming / "Haotica"
    DATA_DIR = _local / "data"
    STATE_DIR = _local / "state"
    CACHE_DIR = _local / "cache"
    RUNTIME_DIR = _local / "run"
    LOG_DIR = _local / "logs"
    OPT = Path(os.environ.get("HAOTICA_OPT", _local / "opt"))
else:
    CONFIG_DIR = XDG_CONFIG / "haotica"
    DATA_DIR = XDG_DATA / "haotica"
    STATE_DIR = XDG_STATE / "haotica"
    CACHE_DIR = XDG_CACHE / "haotica"
    RUNTIME_DIR = RUNTIME_BASE / "haotica"
    LOG_DIR = STATE_DIR / "logs"
    OPT = Path(os.environ.get("HAOTICA_OPT", "/opt/haotica"))

SETTINGS_FILE = CONFIG_DIR / "settings.toml"
TOKEN_FILE = STATE_DIR / "token"
MODELS_DIR = DATA_DIR / "models"
MEMORY_DB = DATA_DIR / "memory.db"

# Ресурсы (apps, assets, shell): репозиторий в разработке, папка установки — иначе
DEV_ROOT = os.environ.get("HAOTICA_DEV_ROOT")
_FROZEN = getattr(sys, "frozen", False)              # сборка PyInstaller (Windows-установщик)
if DEV_ROOT:
    SHARE = Path(DEV_ROOT)
    LIB_DIR = SHARE / "core"
elif _FROZEN or IS_WINDOWS:
    # PyInstaller onedir: ресурсы рядом с exe в _internal; без сборки — корень репозитория над core/
    SHARE = Path(os.environ.get("HAOTICA_SHARE") or (Path(getattr(sys, "_MEIPASS", "")) if _FROZEN
                                                     else Path(__file__).resolve().parents[2]))
    LIB_DIR = SHARE / "core"
else:
    SHARE = Path(os.environ.get("HAOTICA_SHARE", "/usr/share/haotica"))
    LIB_DIR = Path("/usr/lib/haotica")
ASSETS = SHARE / "assets"
SHELL_DIR = SHARE / "shell"
APPS_DIR = SHARE / "apps"

PALETTE_FILE = ASSETS / "palette.toml"
DEFAULTS_FILE = Path(__file__).with_name("defaults.toml")
SYSTEM_ETC = Path("/etc/haotica") if not IS_WINDOWS else CONFIG_DIR / "system"

HOST = "127.0.0.1"
PORT_CORE = 47800
PORT_HAOTICA = 47810
PORT_LLM_BASE = 47821
PORT_LLM_FAST = 47822
PORT_LLM_DEEP = 47824
PORT_TTS = 47830
PORT_SEARXNG = 47840


def ensure_dirs() -> None:
    for d in (CONFIG_DIR, STATE_DIR, DATA_DIR, CACHE_DIR, RUNTIME_DIR, LOG_DIR):
        d.mkdir(parents=True, exist_ok=True)
    if not IS_WINDOWS:
        try:
            RUNTIME_DIR.chmod(0o700)
        except OSError:
            pass
