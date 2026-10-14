#!/usr/bin/env python3
"""
Offline beat / onset analysis for 30-second previews.

Usage:
  python tools/analyze_beats.py <file-or-folder> <out_dir>

Needs: ffmpeg on PATH, numpy, scipy.   (pip install numpy scipy)
Writes one JSON per audio file:  <out_dir>/<stem>.json

Output shape (see docs/DATA_SCHEMA.md):
  { "file", "durationSec", "bpm", "bpmCandidates", "firstBeatSec",
    "beats": [sec, ...], "onsets": [{"t": sec, "s": 0..1}, ...],
    "method", "status": "auto-unverified" }

Notes
- Tempo is ambiguous by octave (half / double). The result lists candidates;
  a human must confirm by ear and set status to "verified".
- Times are relative to the START OF THE PREVIEW CLIP, same clock as
  <audio>.currentTime when the preview plays from 0.
- Only numbers are stored. Never commit audio.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import scipy.io.wavfile as wavfile
import scipy.signal as sig

SR, HOP, NFFT = 22050, 256, 1024
EXT = (".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg")


def decode(path):
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, "x.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path,
                        "-ac", "1", "-ar", str(SR), wav], check=True)
        sr, x = wavfile.read(wav)
    return sr, x.astype(np.float64) / 32768.0


def onset_envelope(x, sr):
    _, _, S = sig.stft(x, sr, nperseg=NFFT, noverlap=NFFT - HOP)
    M = np.log1p(10 * np.abs(S))
    flux = np.maximum(0, np.diff(M, axis=1)).sum(axis=0)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    return flux, sr / HOP


def tempo_candidates(flux, fr, k=4):
    ac = np.correlate(flux, flux, "full")[len(flux) - 1:]
    lags = np.arange(len(ac))
    bpm = 60 * fr / np.maximum(lags, 1)
    prior = np.exp(-0.5 * ((np.log2(bpm / 110)) / 0.9) ** 2)  # favour 70-180
    score = np.where((bpm >= 55) & (bpm <= 200), ac * prior, 0)
    out = []
    for i in np.argsort(score)[::-1]:
        b = round(float(bpm[i]), 1)
        if b > 0 and all(abs(b - q) > 4 for q in out):
            out.append(b)
        if len(out) == k:
            break
    return out


def analyze(path):
    sr, x = decode(path)
    dur = len(x) / sr
    flux, fr = onset_envelope(x, sr)
    cands = tempo_candidates(flux, fr)
    bpm = cands[0]
    period = fr * 60 / bpm
    p = int(round(period))
    phases = [flux[o::p].sum() for o in range(p)]
    first = int(np.argmax(phases)) / fr
    step = 60 / bpm
    beats = [round(first + i * step, 3) for i in range(int((dur - first) / step) + 1)]
    pk, _ = sig.find_peaks(flux, height=1.0, distance=int(fr * 0.12))
    mx = float(flux[pk].max()) if len(pk) else 1.0
    onsets = [{"t": round(float(i / fr), 3), "s": round(float(flux[i] / mx), 2)} for i in pk]
    return {
        "file": os.path.basename(path), "durationSec": round(dur, 2),
        "bpm": bpm, "bpmCandidates": cands, "firstBeatSec": round(first, 3),
        "beats": beats, "onsets": onsets,
        "method": "spectral-flux autocorrelation (analyze_beats.py)",
        "status": "auto-unverified",
    }


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    files = []
    if os.path.isdir(src):
        for r, _, fs in os.walk(src):
            files += [os.path.join(r, f) for f in sorted(fs) if f.lower().endswith(EXT)]
    else:
        files = [src]
    for f in files:
        res = analyze(f)
        stem = os.path.splitext(os.path.basename(f))[0]
        with open(os.path.join(out, stem + ".json"), "w") as fh:
            json.dump(res, fh, indent=1)
        print(f"{res['bpm']:>6} bpm  {len(res['beats']):>3} beats  {len(res['onsets']):>3} onsets  {f}")


if __name__ == "__main__":
    main()
