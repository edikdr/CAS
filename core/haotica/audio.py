"""Звук без внешних программ: чтение OGG/MP3/WAV в WAV PCM16 (готовые реплики Сары, образцы голоса).

На Windows ffmpeg обычно нет — читаем через soundfile (libsndfile: OGG Vorbis/Opus, MP3, FLAC, WAV),
передискретизация — numpy. Если есть ffmpeg, он тоже годится (Linux-сборка HAOTICA OS).
"""
from __future__ import annotations

import io
import subprocess
import wave
from pathlib import Path

from . import util


def _pcm16(a, sr: int) -> bytes:
    import numpy as np
    pcm = (np.clip(a, -1.0, 1.0) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def resample(a, sr_in: int, sr_out: int):
    """Передискретизация для речи: окно-сглаживание перед прореживанием и линейная интерполяция."""
    import numpy as np
    a = np.asarray(a, dtype=np.float32)
    if sr_in == sr_out or a.size == 0:
        return a
    if sr_out < sr_in:                                   # простой ФНЧ: скользящее среднее против наложения частот
        k = max(1, int(round(sr_in / sr_out)))
        if k > 1:
            a = np.convolve(a, np.ones(k, dtype=np.float32) / k, mode="same")
    n = int(round(a.size * sr_out / sr_in))
    return np.interp(np.linspace(0, a.size - 1, n), np.arange(a.size), a).astype(np.float32)


def read(path: str | Path, sr: int = 24000, max_s: float = 0.0):
    """Файл → (моно float32, sr). Сначала soundfile, затем ffmpeg. None — прочитать нечем."""
    try:
        import numpy as np
        import soundfile as sf
        data, rate = sf.read(str(path), dtype="float32", always_2d=True)
        a = data.mean(axis=1) if data.shape[1] > 1 else data[:, 0]
        if max_s:
            a = a[: int(rate * max_s)]
        return resample(np.ascontiguousarray(a), int(rate), sr), sr
    except Exception:  # noqa: BLE001 — нет soundfile/numpy или формат не поддержан
        pass
    if util.which("ffmpeg"):
        cut = ["-t", f"{max_s:.2f}"] if max_s else []
        r = subprocess.run(["ffmpeg", "-v", "quiet", "-i", str(path), *cut, "-f", "s16le", "-ac", "1", "-ar", str(sr), "-"],
                           capture_output=True, check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if r.returncode == 0 and r.stdout:
            try:
                import numpy as np
                return np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32) / 32768, sr
            except ImportError:
                return None
    return None


def to_wav(path: str | Path, sr: int = 24000, max_s: float = 0.0, fade_s: float = 0.4) -> bytes:
    """OGG/MP3/WAV → WAV PCM16 моно (с плавным затуханием, если файл обрезан). b'' — не получилось."""
    got = read(path, sr, max_s)
    if got is None:
        return b""
    a, sr = got
    if max_s and fade_s and a.size:
        import numpy as np
        n = min(a.size, int(sr * fade_s))
        a = a.copy()
        a[-n:] *= np.linspace(1.0, 0.0, n, dtype=np.float32)
    return _pcm16(a, sr)
