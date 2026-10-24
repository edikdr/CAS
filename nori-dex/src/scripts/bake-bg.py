#!/usr/bin/env python3
"""Bakes the page backdrop's colour grade into the image itself, so the browser
never runs a CSS filter on a full-screen animated layer.

    python3 scripts/bake-bg.py     # assets/src/art/keyart-kael.webp -> assets/bg.webp   (needs Pillow and numpy)

Filter order matches CSS: saturate -> brightness -> contrast, in sRGB.
The source is official studio art; it is only scaled and colour graded.
To use a different backdrop, change SOURCE and run the script again.
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SOURCE = os.path.join(ROOT, 'assets', 'src', 'art', 'keyart-kael.webp')
TARGET = os.path.join(ROOT, 'assets', 'bg.webp')
WIDTH = 1600
SATURATE, BRIGHTNESS, CONTRAST = 1.08, 0.62, 1.04

src = Image.open(SOURCE).convert('RGB')
if src.width > WIDTH:
    src = src.resize((WIDTH, round(src.height * WIDTH / src.width)), Image.LANCZOS)
a = np.asarray(src).astype(np.float32) / 255.0
s = SATURATE
M = np.array([[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
              [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
              [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]], dtype=np.float32)
b = np.clip(a @ M.T, 0, 1)
b = np.clip(b * BRIGHTNESS, 0, 1)
b = np.clip((b - 0.5) * CONTRAST + 0.5, 0, 1)
Image.fromarray((b * 255 + 0.5).astype(np.uint8)).save(TARGET, 'WEBP', quality=66, method=6)
print('assets/bg.webp', src.size, round(os.path.getsize(TARGET) / 1024, 1), 'KB')
