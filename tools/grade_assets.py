#!/usr/bin/env python3
"""
Grade the cut-out artwork into the site's palette.

    python3 tools/grade_assets.py

The stickers and merch arrive in their own colours — full-colour masks, a
photographic hoodie, black-and-white logos, several different reds. Pasted
straight onto the page they read as a pile of clip art sitting on top of a
design rather than as part of it.

So each piece is remapped through a four-stop luminance ramp built from
the palette in css/style.css, and which ramp it gets depends on what it
is. Skulls, masks and merch take the STEEL ramp — the colour of the
dagger — and wordmarks, logos and glyphs take the BLOOD ramp. That gives
the background two families instead of forty, both of them made of
colours the page already contains, and it keeps every silhouette exactly
as it was: luminance in, luminance out, only the hue is replaced.

Alpha is untouched, so the cuts stay cut.

NOT IDEMPOTENT — it reads colour and writes colour, so running it twice
grades an already-graded piece. Re-cut from the source sheets first
(tools/cut_assets.py) if you need to start over.

Needs: pillow, numpy.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

OUT = 'assets/cut'

# Four stops each: deep shadow, shadow, body, highlight. Four rather than
# two because a duotone on a black page collapses the midtones and every
# piece comes out as a silhouette.
RAMPS = {
    'steel': [(0x0d, 0x10, 0x0d), (0x3a, 0x3f, 0x3b), (0x8f, 0x93, 0x8e), (0xdc, 0xdc, 0xd6)],
    'blood': [(0x0d, 0x0a, 0x0b), (0x45, 0x11, 0x1a), (0xa5, 0x2a, 0x2f), (0xff, 0x5c, 0x52)],
}
FAMILY = {'skull': 'steel', 'relic': 'steel', 'mark': 'blood', 'icon': 'blood'}


def ramp(name):
    """The four stops, interpolated to a 256-entry lookup table."""
    stops = np.array(RAMPS[name], np.float32)
    x = np.linspace(0, 1, len(stops))
    t = np.linspace(0, 1, 256)
    return np.stack([np.interp(t, x, stops[:, c]) for c in range(3)], axis=1)


def grade(path, family):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3:]

    # Rec. 709 luma, not a flat mean: a flat mean turns the reds in the
    # source artwork the same value as mid grey and the logos lose their
    # figure/ground entirely.
    lum = (rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722)
    # A gentle S-curve first, so the mid-grey body of a mask does not sit
    # in the flattest part of the ramp.
    n = np.clip(lum / 255.0, 0, 1)
    n = n * n * (3 - 2 * n)

    out = ramp(family)[(n * 255).astype(np.uint8)]
    graded = Image.fromarray(
        np.concatenate([out, alpha], axis=2).clip(0, 255).astype(np.uint8), 'RGBA')
    graded = with_shadow(graded)
    graded.save(path, 'WEBP', quality=88, method=6)
    return graded.size


# The shadow is baked, not filtered.
#
# Each piece used to carry `filter: drop-shadow(...)` in the stylesheet,
# and ninety-six live drop-shadows is ninety-six gaussian blurs per
# composite. Measured, it took the page from 46 fps to 14. The shadow is
# the same shadow either way, so it is drawn into the asset here, once,
# and the runtime filter is gone.
SHADOW_BLUR = 9
SHADOW_DROP = 11
SHADOW_ALPHA = 0.62


def with_shadow(im):
    """A soft dark copy of the silhouette, offset down, under the piece."""
    pad = SHADOW_BLUR * 3
    w, h = im.width + pad * 2, im.height + pad * 2 + SHADOW_DROP

    shade = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    mask = im.getchannel('A').filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    mask = mask.point(lambda v: int(v * SHADOW_ALPHA))
    # 6,4,4 rather than pure black: the page's shadows sit on a very dark
    # red-green ink, and a neutral black hole in the middle of it reads
    # as a cut rather than as a shadow.
    shade.paste((6, 4, 4, 255), (pad, pad + SHADOW_DROP), mask)

    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(shade)
    out.alpha_composite(im, (pad, pad))
    return out


def main():
    manifest = json.load(open(f'{OUT}/manifest.json'))
    done = {}
    for row in manifest:
        family = FAMILY.get(row.get('kind'), 'blood')
        row['w'], row['h'] = grade(row['src'], family)
        row['family'] = family
        done[family] = done.get(family, 0) + 1
    json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=1)
    kb = sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT)) // 1024
    print(f'graded {len(manifest)} pieces  ' +
          '  '.join(f'{k}:{v}' for k, v in done.items()) + f'   {kb} KB')


if __name__ == '__main__':
    main()
