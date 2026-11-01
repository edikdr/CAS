#!/usr/bin/env python3
"""HYPERINA: подготовка системных звуков.

Берёт сырые файлы из генератора, обрезает тишину в начале, ограничивает длину
под длительность анимации, добавляет короткое затухание и выравнивает громкость
под роль звука. На выходе: моно, 48 кГц, Ogg Vorbis (формат звуковых тем freedesktop).

Запуск:  python3 -I sfx_process.py <папка-с-сырыми> <папка-вывода> [манифест.tsv]
Манифест: имя<TAB>макс_длина_сек<TAB>целевая_громкость_LUFS
"""
import pathlib
import re
import subprocess
import sys
import tempfile

# роль звука → (максимальная длина, целевая громкость)
DEFAULTS = {
    "win_open":  (0.75, -22.0),  # совпадает с анимацией открытия ~0.72 с
    "win_close": (0.65, -23.0),  # анимация закрытия ~0.63 с
    "notify":    (1.20, -19.0),
    "error":     (0.70, -17.0),
    "access":    (1.20, -18.0),
}
FADE = 0.10      # затухание в конце, с
PEAK_CEIL = -1.0  # потолок пика, дБFS


def ffmpeg(*args: str) -> str:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-800:])
    return r.stderr


def measure(path: pathlib.Path) -> tuple[float | None, float]:
    """Интегральная громкость (может не определиться у очень коротких клипов) и пик."""
    log = ffmpeg("-i", str(path), "-af", "ebur128,volumedetect", "-f", "null", "-")
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", log)
    lufs = float(m[-1]) if m else None
    if lufs is not None and lufs < -69:
        lufs = None
    peak = float(re.findall(r"max_volume: (-?[\d.]+) dB", log)[-1])
    return lufs, peak


def role_of(name: str) -> str:
    return next((k for k in DEFAULTS if name.startswith(k)), "notify")


def process(src: pathlib.Path, dst: pathlib.Path, max_len: float, target: float) -> dict:
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td) / "cut.wav"
        ffmpeg("-i", str(src), "-af",
               "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01,"
               f"atrim=0:{max_len},asetpts=N/SR/TB,"
               "silenceremove=stop_periods=-1:stop_threshold=-55dB:stop_duration=0.15",
               "-ac", "1", "-ar", "48000", str(tmp))
        dur = float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(tmp)],
            capture_output=True, text=True).stdout.strip() or 0)
        lufs, peak = measure(tmp)
        gain = (target - lufs) if lufs is not None else (target + 8 - peak)
        gain = min(gain, PEAK_CEIL - peak)
        fade_st = max(0.0, dur - FADE)
        ffmpeg("-i", str(tmp), "-af",
               f"volume={gain:.2f}dB,afade=t=in:d=0.004,afade=t=out:st={fade_st:.3f}:d={FADE}",
               "-c:a", "libvorbis", "-q:a", "6", str(dst))
        out_lufs, out_peak = measure(dst)
    return {"dur": dur, "gain": gain, "lufs": out_lufs, "peak": out_peak}


def main() -> None:
    src_dir, out_dir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    if len(sys.argv) > 3:
        for line in pathlib.Path(sys.argv[3]).read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#"):
                n, ml, t = line.split("\t")
                manifest[n] = (float(ml), float(t))
    for src in sorted(src_dir.glob("*.mp3")):
        name = src.stem
        max_len, target = manifest.get(name, DEFAULTS[role_of(name)])
        info = process(src, out_dir / f"{name}.ogg", max_len, target)
        lufs = f"{info['lufs']:.1f}" if info["lufs"] is not None else "n/a"
        print(f"{name:14s} {info['dur']:.2f}s  gain {info['gain']:+.1f} dB  "
              f"→ {lufs} LUFS, peak {info['peak']:.1f} dB")


if __name__ == "__main__":
    main()
