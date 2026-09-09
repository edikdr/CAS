#!/usr/bin/env python3
"""
Make the warm copy of the bone frame that the panels are bordered with.

    python3 tools/tint_frame.py

assets/boneframe.webp is white bone on transparent, which is right for
the WebGL modal — that one is lit, and its colour comes from the lamps in
js/boneframe.js. The CSS border-image around the track panel is not lit
by anything, so it needs its warmth baked in or it sits on the page as a
white cut-out with nothing to do with the artwork behind it.

The tint is a two-point ramp on luminance rather than a flat multiply:
the brightest strokes stay near bone, and everything below them falls
towards the dried red of the backdrop. A flat multiply darkens the
highlights along with the rest and the frame goes muddy.
"""
import os
import numpy as np
from PIL import Image

SRC, DST, WIDTH = 'assets/boneframe.webp', 'assets/boneframe-warm.webp', 1100

# Both ends deliberately low. The frame is a border, not a subject; at
# the brighter values it was the lightest thing on the page and pulled
# the eye off the song it is supposed to be framing.
BONE = np.array([132, 116, 104], np.float32)     # a lit rib
DEEP = np.array([46, 17, 18], np.float32)        # the same rib in blood shadow

im = Image.open(SRC).convert('RGBA')
im = im.resize((WIDTH, round(WIDTH * im.height / im.width)), Image.LANCZOS)

a = np.asarray(im).astype(np.float32)
rgb, alpha = a[..., :3], a[..., 3:]
lum = rgb.mean(axis=2, keepdims=True) / 255.0

# gamma just under 1 keeps the midtones from lifting; the point here is
# a frame that recedes, not one that glows
out = DEEP + (BONE - DEEP) * (lum ** 0.92)

Image.fromarray(np.concatenate([out, alpha], axis=2).clip(0, 255).astype(np.uint8), 'RGBA') \
     .save(DST, 'WEBP', quality=80, method=6)
print(f'{DST}  {os.path.getsize(DST) // 1024} KB')
