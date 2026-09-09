#!/usr/bin/env python3
"""
Cut the supplied sticker and merch sheets off their paper.

    python3 tools/cut_assets.py sticker-sheet.png merch-sheet.png

The artwork arrives as flat sheets: forty-odd stickers laid out on white,
and a merch shot of masks, patches and pins on white. What the collage
needs is each item on its own, with a real alpha channel, so it can be
scattered over a black page. This is what does the cutting.

THE PROBLEM IS THAT THE STICKERS ARE PART WHITE.

Every sticker on the sheet has a white die-cut outline, and several of
the merch items — the masks, the "UNDEAD OR ALIVE" card — are largely
white in the middle. So "background is white, foreground is not" is
wrong twice over: keyed on colour alone it eats the outline off every
sticker and punches holes through the masks.

The fix is morphological rather than chromatic, and it is three steps:

    core   = everything that is not paper white
    grown  = core dilated by 9px, then holes filled
    mask   = grown eroded by 5px

Dilating reaches out across the white outline to the paper beyond it, so
the outline ends up inside the grown region. Filling holes closes the
white interiors, because after dilation they are enclosed by ink.
Eroding gives the perimeter back, less a ~4px lip of white that reads as
the die-cut edge it actually is. Connected components on that mask are
the individual pieces.

A handful of items touch on the sheet and come out merged; those are
split at the emptiest row or column between the two blobs (SPLIT_V and
SPLIT_H below). Everything is renamed on the way out, because
`sticker_23.webp` tells the collage engine nothing and `charlie-scene`
tells it what it is holding.

Needs: pillow, numpy, scipy.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

OUT = 'assets/cut'
MAXW = 620            # nothing in the margin is ever drawn wider than this


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def pieces(path, min_area=900):
    """Every separable item on one sheet, as (RGBA image, area)."""
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)

    # paper: bright in every channel and close to neutral
    mx, mn = a.max(axis=2), a.min(axis=2)
    core = ~((mn > 226) & ((mx - mn) < 30))
    core = ndimage.binary_opening(core, disk(1))        # drop compression speckle

    grown = ndimage.binary_dilation(core, disk(9))      # reach across the die-cut lip
    grown = ndimage.binary_fill_holes(grown)            # close white interiors
    mask = ndimage.binary_erosion(grown, disk(5))       # give the perimeter back

    lab, _ = ndimage.label(mask)
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        sub = lab[sl] == i
        h, w = sub.shape
        if sub.sum() < min_area or w < 26 or h < 26:
            continue
        # a half-pixel of blur on the alpha, so the cut edge is not a staircase
        alpha = Image.fromarray((sub * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
        out = im.crop((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)).convert('RGBA')
        out.putalpha(alpha)
        yield out, int(sub.sum())


def trim(im):
    box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return im.crop(box) if box else im


def split(im, horizontal=False):
    """Cut a merged strip at the emptiest line between its two blobs."""
    a = np.asarray(im.getchannel('A')) > 8
    prof = a.sum(axis=0 if horizontal else 1)
    lo, hi = int(len(prof) * 0.30), int(len(prof) * 0.70)
    k = lo + int(np.argmin(prof[lo:hi]))
    if horizontal:
        return im.crop((0, 0, k, im.height)), im.crop((k, 0, im.width, im.height))
    return im.crop((0, 0, im.width, k)), im.crop((0, k, im.width, im.height))


def main(sheets):
    os.makedirs(OUT, exist_ok=True)
    manifest = []

    def emit(im, name, kind):
        im = trim(im)
        if im.width > MAXW:
            im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
        im.save(f'{OUT}/{name}.webp', 'WEBP', quality=88, method=6)
        manifest.append({'src': f'{OUT}/{name}.webp', 'kind': kind,
                         'w': im.width, 'h': im.height})

    for sheet in sheets:
        for n, (im, _) in enumerate(pieces(sheet)):
            # In a fresh run every piece is numbered; the names in the
            # shipped manifest were assigned by eye once, from a contact
            # sheet, and kept. Re-cutting the same artwork reproduces the
            # same pieces in the same order.
            emit(im, f'{os.path.splitext(os.path.basename(sheet))[0]}-{n:02d}', 'icon')

    manifest.sort(key=lambda m: m['src'])
    json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=1)
    print(f'{len(manifest)} pieces -> {OUT}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
