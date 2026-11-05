"""Демо голоса Сары с просодией: текст ответа Haotica → план (паузы, интонация, темп, эмоции) → один файл.

    python tools/tts_samples/demo.py --engine chatterbox --out samples/tts/demo_sarah.ogg [--text "…"]

Запускать в окружении движка (как gen.py). Паузы — тишина, эмоции — записи Сары (assets/sounds/voice/emo_*.ogg).
"""
from __future__ import annotations

import argparse
import io
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "core"))
import os  # noqa: E402

os.environ.setdefault("HAOTICA_DEV_ROOT", str(ROOT))
from haotica.tts import engines, prosody  # noqa: E402
from haotica.tts.normalize import normalize  # noqa: E402

TEXT = ("Готово! Сборка прошла… но есть нюанс. *хмыкает* Два теста упали — оба из-за старого пути к конфигу.\n\n"
        "Осторожно: следующая команда удалит папку build без возврата. Если согласен — жми «выполнить».\n\n"
        "А пока — хочешь, я сама поправлю путь, запущу тесты в отдельной вкладке и коротко расскажу, что вышло? "
        "*смеётся* Обещаю не трогать твой профиль PowerShell.")
SR = 24000


def pcm(wav: bytes):
    import numpy as np
    with wave.open(io.BytesIO(wav)) as w:
        sr, n = w.getframerate(), w.getnframes()
        a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    if sr != SR:
        a = np.interp(np.arange(0, len(a), sr / SR), np.arange(len(a)), a).astype(np.float32)
    return a


def ogg_pcm(path: Path, max_ms: int = 0):
    import numpy as np
    cut = ["-t", f"{max_ms / 1000:.2f}", "-af", f"afade=t=out:st={max(0, max_ms / 1000 - 0.4):.2f}:d=0.4"] if max_ms else []
    raw = subprocess.run(["ffmpeg", "-v", "quiet", "-i", str(path), *cut, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768 * 0.8


def main() -> None:
    import numpy as np
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="chatterbox")
    ap.add_argument("--out", default=str(ROOT / "samples/tts/demo_sarah.ogg"))
    ap.add_argument("--text", default=TEXT)
    a = ap.parse_args()
    eng = engines.ENGINES[a.engine]()
    parts = []
    for seg in prosody.plan(a.text):
        if seg.kind == "pause":
            parts.append(np.zeros(int(SR * seg.ms / 1000), dtype=np.float32))
        elif seg.kind == "sound":
            f = ROOT / "assets/sounds/voice" / f"{seg.sound}.ogg"
            if f.exists():
                parts.append(ogg_pcm(f, seg.ms))
        else:
            wav = eng.synth(normalize(seg.text, seg.lang), seg.lang, seg.speed, seg.exaggeration, seg.cfg, seg.temperature)
            parts.append(pcm(wav))
            print(f"{seg.tags or ['—']} ex={seg.exaggeration} cfg={seg.cfg} sp={seg.speed}: {seg.text}", flush=True)
    audio = np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32)
    tmp = Path(tempfile.gettempdir()) / "demo_sarah.wav"
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(tmp), "-af", "loudnorm=I=-20:TP=-2", "-ar", "48000", "-ac", "1",
                    "-c:a", "libopus", "-b:a", "48k", a.out], check=True)
    print(a.out, f"{len(audio) / SR:.1f} с")


if __name__ == "__main__":
    main()
