"""Где живёт служба синтеза речи: отдельное окружение Python (у движков тяжёлые зависимости).

Windows: %LOCALAPPDATA%\\Haotica\\opt\\tts-venv; Linux: /opt/haotica/tts-venv. Код haotica берётся
из paths.LIB_DIR (в сборке — копия исходников core/ рядом с exe).
"""
from __future__ import annotations

import os
from pathlib import Path

from .. import paths


def python() -> Path | None:
    venv = Path(os.environ.get("HAOTICA_TTS_VENV", paths.OPT / "tts-venv"))
    exe = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    return exe if exe.exists() else None


def argv() -> list[str]:
    py = python()
    return [str(py), "-m", "haotica.tts"] if py else []


def env() -> dict:
    return {"PYTHONPATH": str(paths.LIB_DIR), "HAOTICA_DEV_ROOT": os.environ.get("HAOTICA_DEV_ROOT", "")} \
        if os.environ.get("HAOTICA_DEV_ROOT") else {"PYTHONPATH": str(paths.LIB_DIR)}
