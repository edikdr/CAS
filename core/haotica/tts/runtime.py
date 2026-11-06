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


def _marker() -> Path:
    return Path(os.environ.get("HAOTICA_TTS_VENV", paths.OPT / "tts-venv")) / "haotica-engine.txt"


def installed() -> str:
    """Какой движок поставлен до конца (пакеты и веса) — '' если установки не было или она оборвалась."""
    try:
        return _marker().read_text(encoding="utf-8").strip() if python() else ""
    except OSError:
        return ""


def env() -> dict:
    return {"PYTHONPATH": str(paths.LIB_DIR), "HAOTICA_DEV_ROOT": os.environ.get("HAOTICA_DEV_ROOT", "")} \
        if os.environ.get("HAOTICA_DEV_ROOT") else {"PYTHONPATH": str(paths.LIB_DIR)}


# ── haotica voice install <движок> ───────────────────────────────
PACKAGES = {
    "piper": ["piper-tts", "onnxruntime"],
    "silero": ["torch", "omegaconf", "scipy"],
    # ≥0.1.7: зависит от spacy-pkuseg (есть колёса для Windows); без версии uv брал 0.1.3 с pkuseg,
    # который на Windows собирается из исходников и падает без компилятора C
    "chatterbox": ["chatterbox-tts>=0.1.7", "setuptools<81"],
    "xtts": ["coqui-tts[codec]", "six", "torch", "torchaudio"],
    "qwen3": ["qwen-tts", "torch", "torchaudio"],
    "f5": ["f5-tts", "torch", "torchaudio"],
}
BASE = ["aiohttp", "numpy", "num2words", "huggingface_hub", "soundfile"]
PIPER_VOICES = {"ru_RU-irina-medium": "ru/ru_RU/irina/medium", "en_US-amy-medium": "en/en_US/amy/medium",
                "de_DE-thorsten-medium": "de/de_DE/thorsten/medium"}


def find_uv() -> str:
    """uv: в PATH или там, куда его кладёт winget (PATH текущего процесса после установки не обновляется)."""
    import glob
    import shutil
    w = shutil.which("uv")
    if w:
        return w
    if os.name == "nt":
        la = os.environ.get("LOCALAPPDATA", "")
        for pat in (rf"{la}\Microsoft\WinGet\Links\uv.exe", rf"{la}\Microsoft\WinGet\Packages\astral-sh.uv_*\uv.exe",
                    rf"{os.environ.get('USERPROFILE', '')}\.local\bin\uv.exe", rf"{la}\Programs\uv\uv.exe"):
            hits = sorted(glob.glob(pat))
            if hits:
                return hits[-1]
    return ""


def ensure_uv() -> str:
    """Найти uv, а на Windows — поставить его через winget (официальный пакет astral-sh.uv, без прав администратора)."""
    import shutil
    import subprocess
    uv = find_uv()
    if uv or os.name != "nt":
        return uv
    wg = shutil.which("winget")
    if not wg:
        return ""
    print("  ↓ ставлю uv (winget install astral-sh.uv)…", flush=True)
    subprocess.run([wg, "install", "--id", "astral-sh.uv", "-e", "--scope", "user", "--silent", "--disable-interactivity",
                    "--accept-package-agreements", "--accept-source-agreements"], check=False,
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return find_uv()


# движок → как заранее скачать веса (чтобы первая фраза не ждала гигабайты с Hugging Face)
WARMUP = {
    "chatterbox": "from chatterbox.mtl_tts import ChatterboxMultilingualTTS as M; M.from_pretrained(device='cpu'); print('ok')",
}


def install(engine: str, gpu: bool = False) -> bool:
    """Окружение службы речи: uv создаёт venv (Python 3.11) и ставит пакеты движка, затем скачивает веса;
    голоса Piper — с Hugging Face. Прогресс — строками «шаг N/4» (их показывает мастер первого запуска)."""
    import shutil
    import subprocess
    if engine not in PACKAGES:
        print(f"неизвестный движок: {engine}. Есть: {', '.join(PACKAGES)}")
        return False
    print("  шаг 1/4: uv", flush=True)
    uv = ensure_uv()
    if not uv:
        print("✗ нужен uv: winget install astral-sh.uv  (или https://docs.astral.sh/uv/)")
        return False
    venv = Path(os.environ.get("HAOTICA_TTS_VENV", paths.OPT / "tts-venv"))
    venv.parent.mkdir(parents=True, exist_ok=True)
    nw = {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0)}
    print("  шаг 2/4: окружение Python 3.11", flush=True)
    if not python():
        if subprocess.run([uv, "venv", "--python", "3.11", str(venv)], check=False, **nw).returncode != 0:
            return False
    extra = [] if gpu else ["--extra-index-url", "https://download.pytorch.org/whl/cpu", "--index-strategy", "unsafe-best-match"]
    env = {**os.environ, "VIRTUAL_ENV": str(venv)}
    print(f"  шаг 3/4: пакеты {engine} (PyTorch {'GPU' if gpu else 'CPU'}), ~1 ГБ", flush=True)
    if subprocess.run([uv, "pip", "install", *extra, *BASE, *PACKAGES[engine]], env=env, check=False, **nw).returncode != 0:
        return False
    if engine in WARMUP:
        print("  шаг 4/4: веса модели с Hugging Face (несколько ГБ, один раз)", flush=True)
        import time
        for attempt in range(3):               # веса и словари качаются с HF и GitHub — обрывы бывают, повторяем
            r = subprocess.run([str(python()), "-W", "ignore", "-c", WARMUP[engine]],
                               env={**env, "PYTHONIOENCODING": "utf-8"}, check=False, **nw)
            if r.returncode == 0:
                break
            print(f"  ! обрыв при загрузке весов, повтор {attempt + 2}/3", flush=True)
            time.sleep(5)
        if r.returncode != 0:
            print("✗ веса модели не скачались — повторите: haotica voice install " + engine, flush=True)
            return False
    if engine == "piper":
        from huggingface_hub import hf_hub_download  # noqa: PLC0415 — есть в основном окружении сборки
        dst = Path(os.environ.get("HAOTICA_VOICES", str(paths.OPT / "voices")))
        dst.mkdir(parents=True, exist_ok=True)
        for name, rel in PIPER_VOICES.items():
            for ext in (".onnx", ".onnx.json"):
                f = hf_hub_download("rhasspy/piper-voices", f"{rel}/{name}{ext}")
                shutil.copy(f, dst / f"{name}{ext}")
    _marker().write_text(engine, encoding="utf-8")
    from .. import client
    if not client.core("POST", "/api/settings", {"changes": {"haotica.tts_engine": engine}, "source": "voice"}, timeout=5):
        from .. import config                              # ядро не запущено — пишем настройку сами
        try:
            config.set_many({"haotica.tts_engine": engine})
        except Exception:  # noqa: BLE001
            pass
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
