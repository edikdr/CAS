#!/usr/bin/env python3
"""Запекает CSS-фильтр фона в саму картинку (раньше: filter: saturate(1.12) brightness(.8) contrast(1.06) на
анимированном слое во весь экран — браузер пересчитывал его на каждом кадре).
    python3 scripts/bake-bg.py     # assets/src/bg-original.jpg → assets/bg.jpg   (нужны Pillow и numpy)
Порядок фильтров такой же, как в CSS: saturate → brightness → contrast, в sRGB."""
import io
import numpy as np
from PIL import Image

src = Image.open('assets/src/bg-original.jpg').convert('RGB')
a = np.asarray(src).astype(np.float32) / 255.0
s = 1.12
M = np.array([[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
              [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
              [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]], dtype=np.float32)
b = np.clip(a @ M.T, 0, 1)
b = np.clip(b * 0.8, 0, 1)
b = np.clip((b - 0.5) * 1.06 + 0.5, 0, 1)
Image.fromarray((b * 255 + 0.5).astype(np.uint8)).save('assets/bg.jpg', 'JPEG', quality=84, subsampling=2, optimize=True, progressive=True)
