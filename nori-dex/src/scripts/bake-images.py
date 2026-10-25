#!/usr/bin/env python3
"""Image pipeline: studio originals in assets/src/ -> web-ready WebP in assets/.

    python3 scripts/bake-images.py        (needs Pillow with WebP support, and numpy)
    python3 scripts/bake-images.py nori/  (only the jobs whose output path contains one of the arguments)

Rules (budgets from the brief): every shipped image is WebP and under 250 KB,
hero art at most 1600 px wide (plus a 960 px copy for phones), portraits at
most 300 px (the HUD portraits are also cropped square about their round rim). Originals are never modified, only scaled, cropped and re-encoded; they
stay in assets/src/, which the build does not ship. The one other change: the studio's logo only exists as a rectangular crop of the key art, so
its pale sky backdrop is keyed out along the logo's own black outline (see cut_out_logo) and the result gets a transparent margin.

To swap art: drop the new original into assets/src/<folder>/ with the same
name (or add a line to JOBS), run this script, then `npm run build`.
"""
import os
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'src')
OUT = os.path.join(ROOT, 'assets')
LIMIT = 250 * 1024

# (source path in assets/src, output path in assets without extension, max width, quality, extra widths)
JOBS = [
    ('art/keyart-kael.webp', 'art/keyart-kael', 1600, 74, [960]),
    ('art/splash-clean.webp', 'art/splash-clean', 1600, 74, [960]),
    ('art/splash-with-logo.webp', 'art/splash-with-logo', 1600, 74, [960]),
    ('shots/celestial-observatory.webp', 'shots/celestial-observatory', 1600, 72, [960]),
    ('shots/overgrown-ruins.webp', 'shots/overgrown-ruins', 1600, 70, [960]),
    ('logo/sky-project-logo-crop.png', 'logo/sky-project-logo', 913, 86, [456]),
    ('logo/enthariel-games-logo.png', 'logo/enthariel-games-logo', 256, 88, []),
    ('nori/hud-kael.png', 'nori/hud-kael', 300, 86, []),
    ('nori/hud-zer.png', 'nori/hud-zer', 300, 86, []),
    ('nori/hud-saltu.png', 'nori/hud-saltu', 300, 86, []),
    ('nori/hud-corivel.png', 'nori/hud-corivel', 300, 86, []),
    ('nori/hud-denal.png', 'nori/hud-denal', 300, 86, []),
    ('nori/hud-garnia.png', 'nori/hud-garnia', 300, 86, []),
]


def save(im, path, q):
    """Encode as WebP; lower the quality step by step until it fits the budget."""
    while True:
        im.save(path, 'WEBP', quality=q, method=6)
        if os.path.getsize(path) <= LIMIT or q <= 40:
            return q
        q -= 4


def fit_rim(im):
    """Find the round white rim of a HUD portrait: (centre x, centre y, radius) in pixels, or None.

    Points on the left arc (the first white pixel of every row) and on the top arc (the first white pixel
    of every column) are fitted with a circle; the right and bottom of the rim may be cut off by the
    studio's crop, so they are not used. Outliers (white parts of the creature) are dropped and the fit repeated."""
    a = np.asarray(im.convert('RGBA')).astype(int)
    white = (a[..., 0] > 225) & (a[..., 1] > 225) & (a[..., 2] > 225) & (a[..., 3] > 128)
    pts = [(np.flatnonzero(white[y])[0], y) for y in range(white.shape[0]) if white[y].any()]
    pts += [(x, np.flatnonzero(white[:, x])[0]) for x in range(white.shape[1]) if white[:, x].any()]
    if len(pts) < 40:
        return None
    pts = np.array(pts, float)
    for _ in range(4):
        A = np.c_[pts[:, 0], pts[:, 1], np.ones(len(pts))]
        b = -(pts[:, 0] ** 2 + pts[:, 1] ** 2)
        (c1, c2, c3), *_ = np.linalg.lstsq(A, b, rcond=None)
        cx, cy = -c1 / 2, -c2 / 2
        r = (cx * cx + cy * cy - c3) ** 0.5
        res = np.abs(np.hypot(pts[:, 0] - cx, pts[:, 1] - cy) - r)
        keep = res < max(2.0, 2 * np.median(res))
        if keep.all():
            break
        pts = pts[keep]
    return cx, cy, r


def centre_on_rim(im, name=''):
    """The studio's HUD portraits are round, but their crops leave the rim about 2 % off centre (and clip it at the
    right edge). Cropped square about the rim's centre, the avatar sits in the middle of the round frames the site
    puts around it. Only a crop: no pixel is repainted. Where the canvas ends before the rim does (Kael's bottom),
    the crop stops at the canvas."""
    rim = fit_rim(im)
    if not rim:
        return im
    cx, cy, r = rim
    W, H = im.size
    half = min(cx, W - cx)                       # the widest square that stays on the canvas, centred on the rim
    x0, x1 = round(cx - half), round(cx + half)
    y0, y1 = round(cy - half), min(H, round(cy + half))
    y0 = max(0, y0)
    out = im.crop((x0, y0, x1, y1))
    after = fit_rim(out)
    print('  centred %-22s rim centre %+5.1f, %+5.1f px off the middle  ->  %+4.1f, %+4.1f' % (
        name, cx - W / 2, cy - H / 2, (after[0] - out.width / 2) if after else float('nan'), (after[1] - out.height / 2) if after else float('nan')))
    return out


def components(mask, conn8=True):
    """Label the True pixels of a 2-D bool array. Returns (labels, sizes, touches_border), index 0 = background."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    nbr = [(-1, 0), (1, 0), (0, -1), (0, 1)] + ([(-1, -1), (-1, 1), (1, -1), (1, 1)] if conn8 else [])
    sizes, border = [0], [False]
    n = 0
    for y0, x0 in zip(*[v.tolist() for v in np.nonzero(mask)]):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        size, touch = 0, False
        while q:
            y, x = q.popleft()
            size += 1
            touch = touch or y in (0, h - 1) or x in (0, w - 1)
            for dy, dx in nbr:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
        sizes.append(size)
        border.append(touch)
    return lab, sizes, border


def grow(mask, r):
    return np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(2 * r + 1))) > 0


def cut_out_logo(im, pad=(24, 16)):
    """The studio's logo only exists as a rectangular crop of the key art: the logo on its pale sky, with the clouds
    behind it and the wing tips a few pixels from the edge. Its black outline is a closed line, so the logo is
    what that outline encloses; the sky outside it becomes transparent. The thin white rim the studio draws round the
    outline stays (pale pixels within 3 px of the shape, set to white so no sky colour is left in it). The letters, wings and
    halo are not repainted. A transparent margin (pad = x, y in px) keeps the rim and any shadow from touching the edge."""
    a = np.asarray(im.convert('RGB')).astype(float)
    dark = (a @ [0.299, 0.587, 0.114]) < 80
    lab, sizes, border = components(dark)
    keep = np.zeros_like(dark)
    for i in range(1, len(sizes)):
        if sizes[i] >= 20 and not border[i]:       # the outline and the lettering; stray background strokes touch the edge
            keep |= lab == i
    shape = grow(keep, 1)                          # close hairline gaps between the outline pieces
    ext, _, _ = components(~shape, conn8=False)    # what is not enclosed is reached from the edge of the picture
    outside = np.isin(ext, np.unique(np.concatenate([ext[0], ext[-1], ext[:, 0], ext[:, -1]]))) & (ext > 0)
    inside = ~outside
    ring = grow(inside, 3) & ~inside & (a.min(axis=2) > 200)
    a[ring] = 255
    alpha = Image.fromarray(((inside | ring) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    out = Image.fromarray(a.astype(np.uint8)).convert('RGBA')
    out.putalpha(alpha)
    px, py = pad
    canvas = Image.new('RGBA', (out.width + 2 * px, out.height + 2 * py), (255, 255, 255, 0))
    canvas.paste(out, (px, py))
    return canvas


def scaled(im, w):
    if im.width <= w:
        return im
    h = round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)


def main():
    only = sys.argv[1:]
    for src, dst, maxw, q, extra in JOBS:
        if only and not any(o in dst for o in only):
            continue
        im = Image.open(os.path.join(SRC, src))
        im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
        if os.path.basename(src).startswith('hud-'):
            im = centre_on_rim(im, os.path.basename(src))
        elif os.path.basename(src).startswith('sky-project-logo'):
            im = cut_out_logo(im)
        os.makedirs(os.path.dirname(os.path.join(OUT, dst)), exist_ok=True)
        for w, suffix in [(maxw, '')] + [(x, '-' + str(x)) for x in extra]:
            out = os.path.join(OUT, dst + suffix + '.webp')
            im2 = scaled(im, w)
            used = save(im2, out, q)
            kb = os.path.getsize(out) / 1024
            print('%-40s %4dx%-4d q%-3d %6.1f KB' % (os.path.relpath(out, OUT), im2.width, im2.height, used, kb))


if __name__ == '__main__':
    main()
