#!/usr/bin/env python3
"""HYPERINA: подготовка системных звуков и реплик Haotica.

Берёт сырые файлы из генератора, обрезает тишину, ограничивает длину под
длительность анимации, добавляет короткое затухание и выравнивает громкость
под роль звука. Системные звуки дополнительно смягчаются: срезаются резкие
верха, а у сильно усиленных исходников подавляется шум.
На выходе: моно, 48 кГц, Ogg Vorbis (формат звуковых тем freedesktop).

Запуск:
  python3 -I sfx_process.py <сырые> <вывод>                # системные звуки
  python3 -I sfx_process.py <сырые> <вывод> --role voice   # реплики и эмоции
"""
import argparse
import pathlib
import re
import subprocess
import tempfile

# роль системного звука → (макс. длина, целевая громкость LUFS)
# Значения «приглушённые»: звуки не должны отвлекать от работы.
UI_ROLES = {
    "win_open":  (0.75, -28.0),  # совпадает с анимацией открытия ~0.72 с
    "win_close": (0.65, -29.0),  # анимация закрытия ~0.63 с
    "notify":    (1.20, -25.0),
    "error":     (0.70, -23.0),
    "access":    (1.20, -24.0),
}
VOICE = (12.0, -20.0)
SOFTEN = "lowpass=f=7000:poles=2,highshelf=f=3500:g=-3"  # мягче, без «звона»
DENOISE_ABOVE_DB = 12.0   # при усилении сильнее этого включается шумоподавление
FADE = 0.10
PEAK_CEIL = -1.0


def run(cmd: list[str]) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-800:])
    return r.stderr + r.stdout


def ffmpeg(*args: str) -> str:
    return run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args])


def duration(path: pathlib.Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(out.strip() or 0)


def measure(path: pathlib.Path) -> tuple[float | None, float]:
    log = ffmpeg("-i", str(path), "-af", "ebur128,volumedetect", "-f", "null", "-")
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", log)
    lufs = float(m[-1]) if m else None
    if lufs is not None and lufs < -69:
        lufs = None
    peak = float(re.findall(r"max_volume: (-?[\d.]+) dB", log)[-1])
    return lufs, peak


def process(src: pathlib.Path, dst: pathlib.Path, max_len: float, target: float, ui: bool) -> dict:
    with tempfile.TemporaryDirectory() as td:
        cut = pathlib.Path(td) / "cut.wav"
        ffmpeg("-i", str(src), "-af",
               "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01,"
               f"atrim=0:{max_len},asetpts=N/SR/TB,"
               "areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse",
               "-ac", "1", "-ar", "48000", str(cut))
        lufs, peak = measure(cut)
        gain = (target - lufs) if lufs is not None else (target + 8 - peak)
        chain = []
        if ui and gain > DENOISE_ABOVE_DB:
            chain.append("afftdn=nr=18:nf=-45")
        if ui:
            chain.append(SOFTEN)
        if chain:
            shaped = pathlib.Path(td) / "shaped.wav"
            ffmpeg("-i", str(cut), "-af", ",".join(chain), str(shaped))
            cut = shaped
            lufs, peak = measure(cut)
            gain = (target - lufs) if lufs is not None else (target + 8 - peak)
        gain = min(gain, PEAK_CEIL - peak)
        dur = duration(cut)
        fade_st = max(0.0, dur - FADE)
        ffmpeg("-i", str(cut), "-af",
               f"volume={gain:.2f}dB,afade=t=in:d=0.004,afade=t=out:st={fade_st:.3f}:d={FADE}",
               "-c:a", "libvorbis", "-q:a", "6", str(dst))
        out_lufs, out_peak = measure(dst)
    return {"dur": dur, "gain": gain, "lufs": out_lufs, "peak": out_peak, "denoise": ui and gain > DENOISE_ABOVE_DB}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--role", choices=["ui", "voice"], default="ui")
    ap.add_argument("--only", nargs="*", help="обработать только эти имена (без расширения)")
    a = ap.parse_args()
    src_dir, out_dir = pathlib.Path(a.src), pathlib.Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for src in sorted(src_dir.glob("*.mp3")):
        name = src.stem
        if a.only and name not in a.only:
            continue
        if a.role == "voice":
            max_len, target = VOICE
        else:
            role = next((k for k in UI_ROLES if name.startswith(k)), "notify")
            max_len, target = UI_ROLES[role]
        info = process(src, out_dir / f"{name}.ogg", max_len, target, a.role == "ui")
        lufs = f"{info['lufs']:.1f}" if info["lufs"] is not None else "n/a"
        print(f"{name:20s} {info['dur']:.2f}s  gain {info['gain']:+.1f} dB  → {lufs} LUFS, "
              f"peak {info['peak']:.1f} dB{'  [шумоподавление]' if info['denoise'] else ''}")


if __name__ == "__main__":
    main()
