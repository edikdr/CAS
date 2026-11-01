#!/usr/bin/env python3
"""Карта плотности для фона окна сеанса терминала: «Сотворение Адама» (две руки).

Эталон — точечная (stipple) картинка hands-reference.jpg. Точки превращаются в гладкую карту
плотности (размытие + нормировка), полоса с руками вырезается и сохраняется маленьким PNG в
оттенках серого — терминал рисует по ней руки живым кодом (apps/terminal/art.js). Заодно ищется
зазор между указательными пальцами: туда терминал ставит «искру».

Нужны numpy, opencv-python-headless, pillow (только для разработки).
Запуск: python3 tools/terminal-art/build.py
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).with_name("hands-reference.jpg")
OUT = ROOT / "apps" / "terminal" / "art"
CROP = (0, 196, 600, 420)        # x0, y0, x1, y1 — полоса с руками (руки входят с обоих краёв)
SCALE = 0.5                      # 600×224 → 300×112: одна клетка карты ≈ два пикселя эталона


def build() -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    g = np.asarray(Image.open(SRC).convert("L")).astype(np.float32) / 255.0
    x0, y0, x1, y1 = CROP
    band = g[y0:y1, x0:x1]
    dens = cv2.GaussianBlur(band, (0, 0), 2.2)
    top = float(np.percentile(dens[dens > 0.02], 99.5))
    dens = np.clip(dens / max(top, 1e-3), 0, 1) ** 0.8
    h, w = dens.shape
    small = cv2.resize(dens, (round(w * SCALE), round(h * SCALE)), interpolation=cv2.INTER_AREA)
    Image.fromarray((small * 255).astype(np.uint8), "L").save(OUT / "hands.png", optimize=True)
    # зазор между пальцами: в средней трети — колонка с минимумом плотности между двумя пиками
    sh, sw = small.shape
    mid = small[:, int(sw * 0.4):int(sw * 0.6)]
    colsum = cv2.GaussianBlur(mid.sum(0).reshape(1, -1), (0, 0), 1.5).ravel()
    gx = int(np.argmin(colsum)) + int(sw * 0.4)
    # высота искры — строка, где плотность по обе стороны зазора наибольшая
    left = small[:, max(0, gx - 6):gx].max(1)
    right = small[:, gx + 1:gx + 7].max(1)
    gy = int(np.argmax(np.minimum(left, right)))
    meta = {"w": sw, "h": sh, "spark": [gx, gy], "source": SRC.name}
    (OUT / "hands.json").write_text(json.dumps(meta))
    return meta


if __name__ == "__main__":
    print(build())
