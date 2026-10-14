#!/usr/bin/env python3
"""
compute_offsets.py — find where each iTunes 30-second preview starts inside the full song.

For every {artist, title} in the input list:
  1. find the preview through the iTunes Search API and download it;
  2. transcribe it with Whisper, keeping per-word timestamps;
  3. fetch the time-synced lyrics (LRC) from LRCLIB;
  4. slide a window over the lyric words to find the stretch the preview sings,
     then offset = lyric time - preview time (weighted median over matched words);
  5. write offsets.json: { "Artist - Title": { "offset": 87.4, "confidence": 0.9 } }.
Results below --min-confidence are reported but not written.

Lyrics are only used in memory to compute the number; they are never saved.

Usage:
  pip install faster-whisper          # or: pip install openai-whisper
  python tools/compute_offsets.py tracks.json -o offsets.json
  # tracks.json: [{"artist": "...", "title": "..."}, ...]

Needs ffmpeg on PATH (both Whisper packages decode the .m4a with it).
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

MAX_LINE = 4.0          # same as the engine: words of a line spread over at most this
USER_AGENT = "lyrics-engine-offsets/1.0 (+https://github.com/)"

# --------------------------------------------------------------------------
# Text helpers (mirror lyrics-engine.js)
# --------------------------------------------------------------------------
APOS = re.compile(r"[‘’‚‛′ʼ`´]")
VERSION_WORDS = re.compile(r"\b(remaster(ed)?|live|version|edit|mix|remix|mono|stereo|demo|acoustic|bonus|deluxe|single|radio|explicit|anniversary)\b")


def fold(s: str) -> str:
    s = APOS.sub("'", s or "")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower()


def loose(s: str) -> str:
    s = fold(s).replace("'", "").replace("&", " and ")
    return re.sub(r"[\W_]+", " ", s).strip()


def clean_title(title: str) -> str:
    s = fold(title)
    m = re.search(r"\s[-–—]\s", s)
    if m and VERSION_WORDS.search(s[m.start():]):
        s = s[: m.start()]
    s = re.sub(r"[(\[{][^)\]}]*[)\]}]", " ", s)
    s = re.sub(r"\s(feat|ft|featuring)\.?\s.*$", " ", s)
    return loose(s)


def similar(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def track_key(artist: str, title: str) -> str:
    return f"{artist} - {title}"


def norm_token(word: str) -> str:
    return re.sub(r"[\W_]+", "", fold(word).replace("'", ""))


# --------------------------------------------------------------------------
# LRC
# --------------------------------------------------------------------------
STAMP = re.compile(r"^\s*\[(\d{1,3}):(\d{1,2})(?:[.:,](\d{1,3}))?\]")
WORD_STAMP = re.compile(r"<\d{1,3}:\d{1,2}(?:[.:,]\d{1,3})?>")


@dataclass
class Line:
    t: float
    text: str


def parse_lrc(text: str) -> list[Line]:
    out: list[tuple[float, int, str]] = []
    for row in (text or "").lstrip("﻿").splitlines():
        times, rest = [], row
        while True:
            m = STAMP.match(rest)
            if not m:
                break
            frac = int(m.group(3)) / 10 ** len(m.group(3)) if m.group(3) else 0.0
            times.append(int(m.group(1)) * 60 + int(m.group(2)) + frac)
            rest = rest[m.end():]
        if not times:
            continue
        line = re.sub(r"\s+", " ", WORD_STAMP.sub("", rest)).strip()
        for t in times:
            out.append((round(t, 3), len(out), line))
    out.sort()
    return [Line(t, s) for t, _, s in out]


def is_break(text: str) -> bool:
    return not re.search(r"[^\W_]", text or "")


@dataclass
class LyricWord:
    token: str
    t: float          # estimated time in the full song
    first: bool       # first word of its line (its time is exact)


def lyric_words(lines: list[Line]) -> list[LyricWord]:
    """Words with the same proportional timing the engine uses."""
    out: list[LyricWord] = []
    for i, line in enumerate(lines):
        if is_break(line.text):
            continue
        nxt = lines[i + 1].t if i + 1 < len(lines) else line.t + MAX_LINE
        span = max(0.0, min(nxt - line.t, MAX_LINE))
        words = line.text.split()
        total = sum(len(w) + 1 for w in words) or 1
        acc = 0
        first = True
        for w in words:
            tok = norm_token(w)
            if tok:
                out.append(LyricWord(tok, line.t + span * acc / total, first))
                first = False
            acc += len(w) + 1
    return out


# --------------------------------------------------------------------------
# Alignment
# --------------------------------------------------------------------------
@dataclass
class Match:
    offset: float
    confidence: float
    matched: int
    heard: int
    detail: str = ""


def _weighted_median(values: list[float], weights: list[float]) -> float:
    pairs = sorted(zip(values, weights))
    half = sum(weights) / 2
    acc = 0.0
    for v, w in pairs:
        acc += w
        if acc >= half:
            return v
    return pairs[-1][0]


def _snap(tokens: list[str], vocab: set[str]) -> list[str]:
    """Map Whisper's spellings onto the lyric vocabulary when they are close."""
    vlist = sorted(vocab)
    out = []
    for t in tokens:
        if t in vocab or len(t) < 3:
            out.append(t)
            continue
        best = difflib.get_close_matches(t, vlist, n=1, cutoff=0.8)
        out.append(best[0] if best else t)
    return out


def locate_offset(lines: list[Line], heard: list[tuple[str, float]], min_pairs: int = 4) -> Match | None:
    """
    lines: parsed LRC of the full song.
    heard: [(word, start_seconds_in_preview)] from speech recognition.
    Returns the offset (song time = preview time + offset) and a 0..1 confidence.
    """
    lw = lyric_words(lines)
    asr = [(norm_token(w), s) for w, s in heard]
    asr = [(t, s) for t, s in asr if t]
    if len(lw) < min_pairs or len(asr) < min_pairs:
        return None
    vocab = {w.token for w in lw}
    a_tok = _snap([t for t, _ in asr], vocab)
    a_time = [s for _, s in asr]
    n = len(a_tok)
    width = int(n * 1.4) + 4
    l_tok = [w.token for w in lw]

    windows = []  # (score, offset, pairs)
    for start in range(0, max(1, len(lw) - max(2, n // 3))):
        sm = difflib.SequenceMatcher(None, a_tok, l_tok[start:start + width], autojunk=False)
        pairs = []
        for blk in sm.get_matching_blocks():
            for k in range(blk.size):
                pairs.append((blk.a + k, start + blk.b + k))
        if len(pairs) < min_pairs:
            continue
        offs = [lw[j].t - a_time[i] for i, j in pairs]
        wts = [3.0 if lw[j].first else 1.0 for _, j in pairs]
        windows.append((len(pairs), _weighted_median(offs, wts), pairs, offs))
    if not windows:
        return None

    windows.sort(key=lambda w: -w[0])
    best_score, offset, pairs, offs = windows[0]
    rival = max((w[0] for w in windows if abs(w[1] - offset) > 3.0), default=0)

    consistent = sum(1 for o in offs if abs(o - offset) <= 1.0) / len(offs)
    coverage = min(1.0, len(pairs) / n)
    ambiguity = 1.0 if not rival else max(0.0, min(1.0, (best_score - rival) / max(1.0, 0.15 * best_score)))
    confidence = round((coverage ** 0.5) * consistent * ambiguity, 3)
    detail = f"matched {len(pairs)}/{n} heard words, {consistent:.0%} consistent"
    if rival:
        detail += f", rival window {rival}"
    return Match(round(offset, 2), confidence, len(pairs), n, detail)


# --------------------------------------------------------------------------
# Network
# --------------------------------------------------------------------------
def get_json(url: str, retries: int = 3):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code < 500 or attempt == retries - 1:
                raise
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
        time.sleep(2 ** attempt)
    return None


def itunes_lookup(artist: str, title: str, country: str | None):
    q = urllib.parse.urlencode({"term": f"{artist} {clean_title(title)}", "media": "music", "entity": "song", "limit": 25,
                                **({"country": country} if country else {})})
    data = get_json("https://itunes.apple.com/search?" + q) or {}
    best, best_score = None, 0.0
    for it in data.get("results", []):
        if not it.get("previewUrl"):
            continue
        ts = similar(clean_title(title), clean_title(it.get("trackName", "")))
        as_ = similar(loose(artist), loose(it.get("artistName", "")))
        if ts < 0.6 or as_ < 0.5:
            continue
        score = 0.6 * ts + 0.4 * as_
        if re.search(r"karaoke|instrumental|tribute|cover", fold(it.get("trackName", "") + " " + it.get("artistName", ""))):
            score -= 0.3
        if score > best_score:
            best, best_score = it, score
    return best


def lrclib_lookup(artist: str, title: str, album: str | None, duration: float | None):
    base = "https://lrclib.net/api"
    params = {"artist_name": artist, "track_name": title}
    if album:
        params["album_name"] = album
    if duration:
        params["duration"] = round(duration)
    try:
        rec = get_json(base + "/get?" + urllib.parse.urlencode(params))
    except urllib.error.HTTPError:
        rec = None
    if rec and rec.get("syncedLyrics"):
        return rec
    lst = get_json(base + "/search?" + urllib.parse.urlencode({"artist_name": artist, "track_name": title})) or []
    lst = [r for r in lst if r.get("syncedLyrics")
           and similar(clean_title(title), clean_title(r.get("trackName", ""))) >= 0.6
           and similar(loose(artist), loose(r.get("artistName", ""))) >= 0.5]
    if not lst:
        return None
    if duration:
        lst.sort(key=lambda r: abs((r.get("duration") or 0) - duration))
    return lst[0]


def download(url: str, folder: str) -> str:
    path = os.path.join(folder, re.sub(r"[^\w.]+", "_", url.rsplit("/", 1)[-1])[-80:] or "preview.m4a")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


# --------------------------------------------------------------------------
# Speech recognition
# --------------------------------------------------------------------------
class Transcriber:
    def __init__(self, model: str, backend: str, language: str | None, device: str):
        self.language = language
        self.kind = None
        if backend in ("auto", "faster-whisper"):
            try:
                from faster_whisper import WhisperModel  # type: ignore
                self.model = WhisperModel(model, device=device, compute_type="auto")
                self.kind = "faster-whisper"
            except ImportError:
                if backend == "faster-whisper":
                    raise
        if self.kind is None:
            import whisper  # type: ignore  (pip install openai-whisper)
            self.model = whisper.load_model(model, device=None if device == "auto" else device)
            self.kind = "whisper"

    def words(self, path: str) -> list[tuple[str, float]]:
        if self.kind == "faster-whisper":
            segs, _ = self.model.transcribe(path, word_timestamps=True, language=self.language, vad_filter=False)
            return [(w.word, float(w.start)) for s in segs for w in (s.words or [])]
        res = self.model.transcribe(path, word_timestamps=True, language=self.language)
        return [(w["word"], float(w["start"])) for s in res.get("segments", []) for w in s.get("words", [])]


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help='JSON list: [{"artist": "...", "title": "...", "album"?: "..."}]')
    ap.add_argument("-o", "--out", default="offsets.json")
    ap.add_argument("--min-confidence", type=float, default=0.6)
    ap.add_argument("--model", default="small", help="Whisper model (tiny/base/small/medium/large-v3)")
    ap.add_argument("--backend", choices=["auto", "faster-whisper", "whisper"], default="auto")
    ap.add_argument("--device", default="auto", help="auto/cpu/cuda")
    ap.add_argument("--language", default=None, help="force language, e.g. en")
    ap.add_argument("--country", default=None, help="iTunes store country, e.g. US, DE")
    ap.add_argument("--no-merge", action="store_true", help="overwrite the output instead of updating it")
    ap.add_argument("--keep-audio", default=None, help="folder to keep downloaded previews in")
    args = ap.parse_args(argv)

    with open(args.input, encoding="utf-8") as f:
        tracks = json.load(f)
    result = {}
    if not args.no_merge and os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as f:
            result = json.load(f)

    asr = Transcriber(args.model, args.backend, args.language, args.device)
    tmp = args.keep_audio or tempfile.mkdtemp(prefix="le-previews-")
    os.makedirs(tmp, exist_ok=True)
    written = skipped = 0

    for item in tracks:
        artist, title = item["artist"], item["title"]
        key = track_key(artist, title)
        try:
            it = itunes_lookup(artist, title, args.country)
            if not it:
                print(f"skip  {key}: no iTunes preview")
                skipped += 1
                continue
            duration = (it.get("trackTimeMillis") or 0) / 1000 or None
            rec = lrclib_lookup(artist, title, item.get("album") or it.get("collectionName"), duration)
            if not rec:
                print(f"skip  {key}: no synced lyrics on LRCLIB")
                skipped += 1
                continue
            lines = parse_lrc(rec["syncedLyrics"])
            audio = download(it["previewUrl"], tmp)
            heard = asr.words(audio)
            m = locate_offset(lines, heard)
            if not m:
                print(f"skip  {key}: nothing recognisable in the preview ({len(heard)} words)")
                skipped += 1
                continue
            status = "write" if m.confidence >= args.min_confidence else "low  "
            print(f"{status} {key}: offset {m.offset:.2f}s confidence {m.confidence:.2f} ({m.detail})")
            if m.confidence >= args.min_confidence:
                result[key] = {"offset": m.offset, "confidence": m.confidence}
                written += 1
            else:
                skipped += 1
        except Exception as e:  # keep going with the rest of the list
            print(f"error {key}: {e}", file=sys.stderr)
            skipped += 1

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)
    print(f"\n{written} written, {skipped} skipped → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
