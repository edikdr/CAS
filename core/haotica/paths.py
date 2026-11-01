"""Пути и адреса HAOTICA. Единое место — меняйте здесь, а не по коду."""
from __future__ import annotations

import os
from pathlib import Path

HOME = Path.home()
XDG_CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config"))
XDG_DATA = Path(os.environ.get("XDG_DATA_HOME", HOME / ".local/share"))
XDG_STATE = Path(os.environ.get("XDG_STATE_HOME", HOME / ".local/state"))
XDG_CACHE = Path(os.environ.get("XDG_CACHE_HOME", HOME / ".cache"))
RUNTIME_BASE = Path(os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}"))

CONFIG_DIR = XDG_CONFIG / "haotica"
SETTINGS_FILE = CONFIG_DIR / "settings.toml"
STATE_DIR = XDG_STATE / "haotica"
DATA_DIR = XDG_DATA / "haotica"
CACHE_DIR = XDG_CACHE / "haotica"
RUNTIME_DIR = RUNTIME_BASE / "haotica"
TOKEN_FILE = STATE_DIR / "token"
MODELS_DIR = DATA_DIR / "models"
MEMORY_DB = DATA_DIR / "memory.db"
LOG_DIR = STATE_DIR / "logs"

# Режим разработки: HAOTICA_DEV_ROOT указывает на корень репозитория
DEV_ROOT = os.environ.get("HAOTICA_DEV_ROOT")
if DEV_ROOT:
    _root = Path(DEV_ROOT)
    SHARE = _root
    ASSETS = _root / "assets"
    SHELL_DIR = _root / "shell"
    APPS_DIR = _root / "apps"
    LIB_DIR = _root / "core"
else:
    SHARE = Path(os.environ.get("HAOTICA_SHARE", "/usr/share/haotica"))
    ASSETS = SHARE / "assets"
    SHELL_DIR = SHARE / "shell"
    APPS_DIR = SHARE / "apps"
    LIB_DIR = Path("/usr/lib/haotica")

PALETTE_FILE = ASSETS / "palette.toml"
DEFAULTS_FILE = Path(__file__).with_name("defaults.toml")
SYSTEM_ETC = Path("/etc/haotica")
OPT = Path("/opt/haotica")

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
    try:
        RUNTIME_DIR.chmod(0o700)
    except OSError:
        pass
