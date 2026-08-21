#!/usr/bin/env python3
"""
Build the burnt ransom-note letter tiles for the hover state.

Reads the scans in letters/<set>/ and writes letters/burnt-<set>/. It never
writes to what it reads, so it is safe to re-run after tweaking any constant
below — the burn never compounds on itself.

The plain tiles keep the white scanner frame they were scanned with. The
burnt ones must not: a pristine white border sitting inside a charred edge
reads as a mistake. So the frame is cropped off first, and the tile is then
padded by PAD_FRAC of clean paper for the fire to consume — a flame that
starts on the printed letter eats the letter.

That leaves the burnt tile a different fraction of the plain one for each
letter, since the frames vary in thickness: the hover image is sized by a
single --burnt-scale in css/style.css, set to the median printed by this
script, so a letter may change size by a couple of percent as it catches.
That was a deliberate trade for keeping the burnt edge clean.

Run: python3 tools/gen_letters.py
"""
import pathlib
import shutil
import zlib

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
LETTERS = ROOT / 'assets' / 'letters'
SETS = ('mono', 'warm')

FRAME_L = 244        # a border row this bright is scanner frame, not stock
TRANSITION = 2       # anti-aliased pixels between the frame and the paper
MAX_FRAC = 0.18      # never treat more than this much of a side as frame
PAD_FRAC = 0.14      # clean paper added on each side, for the fire to eat
SUP = 6              # supersample factor while computing the burn
SCALE = 3            # delivered size, over the source scan


def _fbm(shape, rng, octaves=4, base=5, gain=0.52):
    """Fractal value noise in 0..1, stacked from smoothed random grids."""
    h, w = shape
    total = np.zeros(shape, np.float32)
    amp, norm, cells = 1.0, 0.0, base
    for _ in range(octaves):
        cy = max(2, int(cells * h / max(h, w)))
        cx = max(2, int(cells * w / max(h, w)))
        g = rng.random((cy, cx)).astype(np.float32)
        total += np.asarray(
            Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
            np.float32) / 255.0 * amp
        norm += amp
        amp *= gain
        cells *= 2
    total /= norm
    lo, hi = float(total.min()), float(total.max())
    return np.clip((total - lo) / max(1e-6, hi - lo), 0, 1)


def _blur(a, r):
    return np.asarray(
        Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
        .filter(ImageFilter.GaussianBlur(r)), np.float32) / 255.0


def _smooth(e0, e1, x):
    t = np.clip((x - e0) / max(1e-6, e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def _frame_depth(lines):
    n = 0
    for ln in lines:
        if float(np.median(ln.mean(1))) >= FRAME_L:
            n += 1
        else:
            break
    return n


def _frame_box(a):
    """Thickness of the white scanner frame per side — they are not centred."""
    h, w = a.shape[:2]
    cy, cx = int(h * MAX_FRAC), int(w * MAX_FRAC)
    return (min(_frame_depth([a[:, i] for i in range(w)]) + TRANSITION, cx),
            min(_frame_depth([a[i] for i in range(h)]) + TRANSITION, cy),
            min(_frame_depth([a[:, w - 1 - i] for i in range(w)]) + TRANSITION, cx),
            min(_frame_depth([a[h - 1 - i] for i in range(h)]) + TRANSITION, cy))


def _prepare(im, rng):
    """
    Crop the scanner frame off, then pad by PAD_FRAC with the tile's own paper.

    Padding is reflected, so the stock's grain carries on rather than smearing
    into streaks, then pulled toward the tile's paper colour as it goes out —
    otherwise a glyph close to the edge is mirrored back out into the margin
    and the fire leaves a stray fragment of it standing.
    """
    a = np.asarray(im, np.float32)
    h, w = a.shape[:2]
    left, top, right, bottom = _frame_box(a)
    inner = a[top:h - bottom, left:w - right]
    ih, iw = inner.shape[:2]

    px, py = max(2, round(iw * PAD_FRAC)), max(2, round(ih * PAD_FRAC))
    out = np.pad(inner, ((py, py), (px, px), (0, 0)), mode='reflect')

    H, W = out.shape[:2]
    yy = np.arange(H)[:, None]
    xx = np.arange(W)[None, :]
    # 0 over the printed area, 1 at the outer edge of the padding
    ry = np.maximum((py - yy) / py, (yy - (H - 1 - py)) / py)
    rx = np.maximum((px - xx) / px, (xx - (W - 1 - px)) / px)
    ramp = np.clip(np.maximum(ry, rx), 0, 1) ** 0.75

    flat = inner.reshape(-1, 3)
    # bias to the lighter half: on a dark tile the median is ink, and padding
    # a letter with ink would read as a blot rather than as more stock
    light = flat[flat.mean(1) > inner.mean()]
    paper = np.median(light if len(light) > 32 else flat, axis=0)

    out = out * (1 - ramp[..., None] * 0.8) + paper[None, None, :] * (ramp[..., None] * 0.8)
    out += rng.normal(0, 3.0, out.shape).astype(np.float32) * ramp[..., None]
    return np.clip(out, 0, 255)


def burn(im, seed, *, depth, rough, char_w, scorch_w, ember, ash, holes, sides):
    """
    Burn one tile.

    Everything is driven off a single signed distance to the burn front, so
    the three things that happen at different depths from it — destroyed,
    charred, scorched — stay registered to each other however ragged the
    noise makes the edge.
    """
    rng = np.random.default_rng(seed)
    padded = _prepare(im, rng)
    h0, w0 = padded.shape[:2]
    W, H = w0 * SUP, h0 * SUP
    base = np.asarray(
        Image.fromarray(padded.astype(np.uint8)).resize((W, H), Image.LANCZOS), np.float32)

    # distance to the tile edge: 0 at the edge, 1 as deep as the centre
    yy = np.linspace(0, 1, H)[:, None] * np.ones((1, W), np.float32)
    xx = np.linspace(0, 1, W)[None, :] * np.ones((H, 1), np.float32)
    top, right, bottom, left = sides
    half = min(W, H) / 2.0
    dist = np.minimum(
        np.minimum(yy * H / half / max(top, 1e-3), (1 - yy) * H / half / max(bottom, 1e-3)),
        np.minimum(xx * W / half / max(left, 1e-3), (1 - xx) * W / half / max(right, 1e-3)))

    # coarse noise wanders the front; fine noise gives it a torn fibre edge
    coarse = _fbm((H, W), rng, octaves=4, base=5)
    fine = _fbm((H, W), rng, octaves=4, base=22)
    front = dist - depth * (0.45 + rough * (coarse * 0.85 + fine * 0.35))

    alpha = _smooth(0.0, 0.010, front)
    if holes:
        pit = _fbm((H, W), rng, octaves=3, base=18)
        near = 1 - _smooth(0.0, char_w * 1.5, front)
        alpha *= 1 - _smooth(0.62, 0.80, pit) * near * holes
    alpha = np.clip(alpha, 0, 1)

    char = (1 - _smooth(0.0, char_w, front)) * alpha
    scorch = 1 - _smooth(0.0, scorch_w, front)
    grain = _fbm((H, W), rng, octaves=4, base=20)
    rgb = base.copy()

    # scorch: paper cooking brown. Multiplied, so the print and the paper
    # grain keep showing through instead of being painted over.
    s = np.clip(scorch ** 1.7 * (0.80 + 0.40 * grain), 0, 1)
    tint = np.array([0.72, 0.50, 0.33], np.float32)
    rgb = rgb * ((1 - s[..., None]) + tint[None, None, :] * s[..., None])
    rgb -= (s * 16)[..., None]

    # char: carbon, near-black but blotchy — burnt paper never goes flat
    c = char ** 0.85
    carbon = np.array([26, 20, 18], np.float32) * (0.55 + 0.9 * grain)[..., None]
    rgb = rgb * (1 - c[..., None]) + carbon * c[..., None]

    if ash:  # pale powder clinging to the char
        a_m = (1 - _smooth(0.0, char_w * 2.1, front)) * _smooth(0.55, 0.85, grain) * alpha * ash
        rgb += (np.array([168, 158, 148], np.float32)[None, None, :] - rgb) * (a_m * 0.55)[..., None]
    rgb = np.clip(rgb, 0, 255)

    if ember:  # coals still alive along the front
        band = (1 - _smooth(0.0, char_w * 0.85, front)) * alpha
        spot = _smooth(0.52, 0.88, _fbm((H, W), rng, octaves=3, base=16))
        e = band * spot * ember
        glow = _blur(e, SUP * 1.6) * 0.85 + e
        rgb = np.clip(rgb + np.array([255, 138, 46], np.float32)[None, None, :]
                      * np.clip(glow, 0, 1.4)[..., None], 0, 255)

    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA').resize((w0 * SCALE, h0 * SCALE), Image.LANCZOS)
    # black out RGB where the matte is empty: lossy webp leaves a little alpha
    # behind, and paper-coloured residue would ghost around the silhouette
    q = np.asarray(img, np.uint8).copy()
    q[..., :3][q[..., 3] < 6] = 0
    return Image.fromarray(q, 'RGBA')


def burn_params(key):
    """Per-letter variation, seeded by name so a rebuild reproduces it."""
    # crc32, not hash(): the built-in is salted per process, which would hand
    # every rebuild a different alphabet
    rng = np.random.default_rng(zlib.crc32(key.encode()))
    # two adjacent sides take the worst of it, as if the tile lay in the flame
    s = [0.30, 0.30, 0.30, 0.30]
    first = int(rng.integers(0, 4))
    s[first] = 1.0
    s[(first + 1) % 4] = float(rng.uniform(0.55, 0.95))
    s[(first + 2) % 4] = float(rng.uniform(0.25, 0.45))
    s[(first + 3) % 4] = float(rng.uniform(0.30, 0.70))
    return dict(
        seed=int(rng.integers(0, 2 ** 31)),
        depth=float(rng.uniform(0.28, 0.36)),
        rough=float(rng.uniform(0.62, 0.82)),
        char_w=float(rng.uniform(0.10, 0.15)),
        scorch_w=float(rng.uniform(0.30, 0.42)),
        ember=float(rng.uniform(0.45, 0.95)),
        ash=float(rng.uniform(0.40, 0.70)),
        holes=float(rng.uniform(0.35, 0.60)),
        sides=tuple(s),
    )


def main():
    total = 0
    ratios = []
    for st in SETS:
        src_dir = LETTERS / st
        out_dir = LETTERS / f'burnt-{st}'
        if not src_dir.is_dir():
            raise SystemExit(f'missing letter set at {src_dir}')
        shutil.rmtree(out_dir, ignore_errors=True)
        out_dir.mkdir(parents=True, exist_ok=True)
        n = 0
        for src in sorted(src_dir.glob('*.webp')):
            plain = Image.open(src).convert('RGB')
            img = burn(plain, **burn_params(f'{st}/{src.stem}'))
            img.save(out_dir / src.name, 'WEBP', quality=88, method=6)
            total += (out_dir / src.name).stat().st_size
            ratios.append(img.width / (plain.width * SCALE))
            ratios.append(img.height / (plain.height * SCALE))
            n += 1
        print(f'  burnt-{st}: {n} tiles')
    r = sorted(ratios)
    med = r[len(r) // 2]
    print(f'done — {total/1024:.0f} KB. Burnt/plain size ratio: median {med:.3f}, '
          f'range {r[0]:.3f}-{r[-1]:.3f}\n'
          f'  -> set --burnt-scale in css/style.css to {med:.2f}')


if __name__ == '__main__':
    main()
