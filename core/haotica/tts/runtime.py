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


# ── haotica voice install <движок> ───────────────────────────────
PACKAGES = {
    "piper": ["piper-tts", "onnxruntime"],
    "silero": ["torch", "omegaconf", "scipy"],
    "chatterbox": ["chatterbox-tts", "setuptools<81"],
    "xtts": ["coqui-tts[codec]", "six", "torch", "torchaudio"],
    "qwen3": ["qwen-tts", "torch", "torchaudio"],
    "f5": ["f5-tts", "torch", "torchaudio"],
}
BASE = ["aiohttp", "numpy", "num2words", "huggingface_hub", "soundfile"]
PIPER_VOICES = {"ru_RU-irina-medium": "ru/ru_RU/irina/medium", "en_US-amy-medium": "en/en_US/amy/medium",
                "de_DE-thorsten-medium": "de/de_DE/thorsten/medium"}


def install(engine: str, gpu: bool = False) -> bool:
    """Окружение службы речи: uv создаёт venv (Python 3.11) и ставит пакеты движка; голоса Piper — с Hugging Face."""
    import shutil
    import subprocess
    if engine not in PACKAGES:
        print(f"неизвестный движок: {engine}. Есть: {', '.join(PACKAGES)}")
        return False
    uv = shutil.which("uv")
    if not uv:
        print("✗ нужен uv: winget install astral-sh.uv  (или https://docs.astral.sh/uv/)")
        return False
    venv = Path(os.environ.get("HAOTICA_TTS_VENV", paths.OPT / "tts-venv"))
    venv.parent.mkdir(parents=True, exist_ok=True)
    if not python():
        if subprocess.run([uv, "venv", "--python", "3.11", str(venv)], check=False).returncode != 0:
            return False
    extra = [] if gpu else ["--extra-index-url", "https://download.pytorch.org/whl/cpu", "--index-strategy", "unsafe-best-match"]
    env = {**os.environ, "VIRTUAL_ENV": str(venv)}
    if subprocess.run([uv, "pip", "install", *extra, *BASE, *PACKAGES[engine]], env=env, check=False).returncode != 0:
        return False
    if engine == "piper":
        from huggingface_hub import hf_hub_download  # noqa: PLC0415 — есть в основном окружении сборки
        dst = Path(os.environ.get("HAOTICA_VOICES", str(paths.OPT / "voices")))
        dst.mkdir(parents=True, exist_ok=True)
        for name, rel in PIPER_VOICES.items():
            for ext in (".onnx", ".onnx.json"):
                f = hf_hub_download("rhasspy/piper-voices", f"{rel}/{name}{ext}")
                shutil.copy(f, dst / f"{name}{ext}")
    from .. import client
    client.core("POST", "/api/settings", {"changes": {"haotica.tts_engine": engine}, "source": "voice"}, timeout=5)
    print(f"✓ служба речи: {engine} → {venv}. Перезапуск: Настройки → Haotica → «Перезапустить голос»")
    return True


def _cli(a) -> int:
    if a.action == "install":
        return 0 if install(a.engine or "piper", a.gpu) else 1
    print(f"  окружение: {python() or 'не установлено'}")
    return 0


def register(sub) -> None:
    p = sub.add_parser("voice", help="служба речи: haotica voice install <движок>")
    p.add_argument("action", choices=["install", "status"])
    p.add_argument("engine", nargs="?", default="")
    p.add_argument("--gpu", action="store_true", help="PyTorch с GPU (ROCm/CUDA) вместо CPU-сборки")
    p.set_defaults(fn=_cli)
