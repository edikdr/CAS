#!/usr/bin/env python3
"""Image pipeline: studio originals in assets/src/ -> web-ready WebP in assets/.

    python3 scripts/bake-images.py        (needs Pillow with WebP support)

Rules (budgets from the brief): every shipped image is WebP and under 250 KB,
hero art at most 1600 px wide (plus a 960 px copy for phones), portraits at
most 300 px. Originals are never modified, only scaled and re-encoded; they
stay in assets/src/, which the build does not ship.

To swap art: drop the new original into assets/src/<folder>/ with the same
name (or add a line to JOBS), run this script, then `npm run build`.
"""
import os
from PIL import Image

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
    ('logo/sky-project-logo-crop.png', 'logo/sky-project-logo', 865, 86, [432]),
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


def scaled(im, w):
    if im.width <= w:
        return im
    h = round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)


def main():
    for src, dst, maxw, q, extra in JOBS:
        im = Image.open(os.path.join(SRC, src))
        im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
        os.makedirs(os.path.dirname(os.path.join(OUT, dst)), exist_ok=True)
        for w, suffix in [(maxw, '')] + [(x, '-' + str(x)) for x in extra]:
            out = os.path.join(OUT, dst + suffix + '.webp')
            im2 = scaled(im, w)
            used = save(im2, out, q)
            kb = os.path.getsize(out) / 1024
            print('%-40s %4dx%-4d q%-3d %6.1f KB' % (os.path.relpath(out, OUT), im2.width, im2.height, used, kb))


if __name__ == '__main__':
    main()
