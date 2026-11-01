#!/usr/bin/env python3
"""Сборка анимируемого портрета Haotica из эталонной картинки.

Эталон (haotica-reference.png) нарисован с «зашитым» CRT: строки развёртки с шагом ~5.17 px и
сдвиг каналов (R влево ~2.3 px, B вправо ~2.0 px). Скрипт:
  1. сводит каналы обратно и убирает строки (поправка усиления по строкам + вертикальный ФНЧ
     с сохранением контуров), так что CRT потом накладывает уже сама система, ровно и без муара;
  2. убирает фон и шестерёнки (их рисует вектором avatar.js — они вращаются), восстанавливает
     внешний контур фигуры;
  3. режет фигуру на слои: голова (шея продлена под чокер), торс, брови, губы, радужки — чтобы
     аватар моргал, смотрел, говорил, двигал бровями и дышал, оставаясь «точь-в-точь» как эталон;
  4. пишет слои (WebP, масштаб SCALE) и геометрию (rig.js) в apps/_ui/avatar/.

Нужны numpy, opencv-python-headless, pillow (только для разработки, на ноутбуке не запускается).
Запуск: python3 tools/avatar/build.py [--preview DIR]
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).with_name("haotica-reference.png")
OUT = ROOT / "apps" / "_ui" / "avatar"
SCALE = 0.6  # слои хранятся в 0.6 от эталона (1214×1296): хватает и для HiDPI
SKIN = np.array([249, 184, 155], np.float32)
BROW = np.array([34, 11, 100], np.float32)
GEAR = np.array([244, 153, 45], np.float32)
# шестерёнки: центр, радиусы впадин/вершин зубьев, число зубьев, фаза (°), доли шага у основания и
# у вершины, толщина линии; кольца: (радиус, толщина). Подогнано по эталону (IoU 0.54…0.90).
GEARS = {
    "big": {
        "cx": 1060.0,
        "cy": 403.5,
        "r0": 171.5,
        "r1": 198.5,
        "n": 12,
        "ph": 24.5,
        "ab": 0.71,
        "at": 0.41,
        "w": 13.0,
        "rings": [(101.5, 13.0), (28.0, 11.0)],
    },
    "small": {
        "cx": 1121.6,
        "cy": 687.7,
        "r0": 54.0,
        "r1": 68.0,
        "n": 8,
        "ph": 3.25,
        "ab": 0.75,
        "at": 0.34,
        "w": 9.0,
        "rings": [(25.0, 8.5)],
    },
    "left": {
        "cx": 179.3,
        "cy": 973.4,
        "r0": 114.0,
        "r1": 134.5,
        "n": 10,
        "ph": 35.25,
        "ab": 0.73,
        "at": 0.35,
        "w": 11.0,
        "rings": [(59.5, 11.0)],
    },
}


# ---------------------------------------------------------------- 1. чистка CRT
def vblur(img: np.ndarray, s: float) -> np.ndarray:
    k = cv2.getGaussianKernel(int(s * 6) | 1, s)
    return cv2.sepFilter2D(img, -1, np.array([1.0]), k)


def clean(src: np.ndarray) -> np.ndarray:
    h, w, _ = src.shape
    out = src.copy()
    for ci, dx in ((0, 2.3), (2, -2.0)):
        m = np.float32([[1, 0, dx], [0, 1, 0]])
        out[:, :, ci] = cv2.warpAffine(
            src[:, :, ci],
            m,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
    out = np.clip(out, 0, 255).astype(np.float32)
    lum = out.mean(2).astype(np.float32)
    s3 = vblur(lum, 3.0)
    s6 = vblur(lum, 6.0)
    gx = np.abs(cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3))
    flat = (lum > 50) & (gx < 25) & (np.abs(s3 - s6) < 10)
    ratio = np.where(flat, lum / np.maximum(s3, 1), np.nan)
    with np.errstate(all="ignore"):
        gain = np.nanmedian(ratio, axis=1)
    idx = np.arange(h)
    ok = ~np.isnan(gain)
    gain = np.interp(idx, idx[ok], gain[ok]).astype(np.float32)
    out = np.clip(out / gain[:, None, None], 0, 255).astype(np.float32)
    v = vblur(out, 2.4)
    lum2 = vblur(out.mean(2).astype(np.float32), 3.0).astype(np.float32)
    gy = np.abs(cv2.Sobel(lum2, cv2.CV_32F, 0, 1, ksize=3))
    wgt = np.clip((gy - 30) / 60, 0, 1)[:, :, None]
    mix = v * (1 - wgt) + vblur(out, 1.1) * wgt
    sharp = mix + 0.45 * (mix - vblur(mix, 4.0))
    hb = cv2.GaussianBlur(sharp, (0, 0), sigmaX=1.0, sigmaY=0.01)
    return np.clip(sharp + 0.3 * (sharp - hb), 0, 255).astype(np.float32)


# ---------------------------------------------------------------- 2. фон и шестерёнки
def matte(img: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w]
    near = np.linalg.norm(img - GEAR, axis=2) < 95
    gear = np.zeros((h, w), bool)
    for g in GEARS.values():
        gear |= near & (np.hypot(xx - g["cx"], yy - g["cy"]) < g["r1"] + g["w"] / 2 + 6)
    hsv = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_RGB2HSV)
    hue = hsv[..., 0].astype(int)
    mx = img.max(2)
    fringe = ((hue <= 26) | (hue >= 170)) & (mx < 250)
    grown = cv2.dilate(
        gear.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    ).astype(bool)
    work = img.copy()
    work[gear | (grown & (fringe | (mx < 90)))] = 0
    dark = (work.max(2) < 60).astype(np.uint8)
    opened = cv2.morphologyEx(
        dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))
    )
    _n, lab = cv2.connectedComponents(opened, connectivity=8)
    border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    fig = ~np.isin(lab, list(border))
    nf, lf, st, _ = cv2.connectedComponentsWithStats(
        fig.astype(np.uint8), connectivity=8
    )
    fig = np.isin(lf, [i for i in range(1, nf) if st[i, 4] > 5000])
    hsvw = cv2.cvtColor(work.astype(np.uint8), cv2.COLOR_RGB2HSV)
    purple = (hsvw[..., 0] > 120) & (hsvw[..., 0] < 160) & (hsvw[..., 1] > 80)
    blob = np.zeros_like(fig)
    blob[495:545, 900:940] = True  # огрызок зуба шестерёнки у контура волос
    fig &= ~(blob & ~purple)
    t = 8.5  # толщина внешнего контура (внутренние линии ~7–8.5 px)
    k = int(2 * t) + 1
    full = cv2.dilate(
        fig.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    ).astype(bool)
    thin = (img.max(2) < 60) & fig
    core = thin & (cv2.distanceTransform(thin.astype(np.uint8), cv2.DIST_L2, 3) > 2)
    line = np.median(img[core], 0)
    rgb = work.copy()
    rgb[full & ~fig] = line
    alpha = np.clip(cv2.GaussianBlur(full.astype(np.float32), (0, 0), 0.8) * 1.05, 0, 1)
    return rgb, alpha


# ---------------------------------------------------------------- 3. слои
def fill_holes(m: np.ndarray) -> np.ndarray:
    inv = (1 - m).astype(np.uint8)
    mm = np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8)
    cv2.floodFill(inv, mm, (0, 0), 2)
    return (m | (inv == 1)).astype(np.uint8)


def eyes(rgb: np.ndarray) -> dict:
    h, w, _ = rgb.shape
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(2), rgb.min(2)
    skin = np.linalg.norm(rgb - SKIN, axis=2) < 38
    dark = mx < 75
    white = (mn > 185) & ((mx - mn) < 50)
    iris = (r > b + 60) & (g < r - 40) & ~skin & ~dark
    yy, xx = np.mgrid[0:h, 0:w]
    res = {}
    for side, (x0, x1, y0, y1, cx0, cy0) in {
        "l": (440, 600, 488, 578, 533, 540),
        "r": (626, 795, 488, 578, 700, 540),
    }.items():
        reg = np.zeros((h, w), bool)
        reg[y0:y1, x0:x1] = True
        n, lab, st, _ = cv2.connectedComponentsWithStats(
            (white & reg).astype(np.uint8), connectivity=8
        )
        wbig = np.isin(lab, [i for i in range(1, n) if st[i, 4] > 120])
        dd = np.hypot(xx - cx0, yy - cy0)
        disc = (dd < 28.5) & (iris | white | (dark & (dd < 15))) & (yy <= 560)
        o = ((wbig | disc) & reg).astype(np.uint8)
        o = cv2.morphologyEx(
            o, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        )
        o[y0 - 2 : y1 + 2, x0 - 2 : x1 + 2] = fill_holes(
            o[y0 - 2 : y1 + 2, x0 - 2 : x1 + 2]
        )
        # радужка: окружность по переходам «радужка/белок» в строках
        pts = []
        for y in range(cy0 - 14, cy0 + 16):
            row = np.nonzero(iris[y, cx0 - 40 : cx0 + 40])[0]
            if len(row) < 10:
                continue
            xl, xr = row.min() + cx0 - 40, row.max() + cx0 - 40
            if white[y, xl - 2] or white[y, xl - 3]:
                pts.append((xl - 0.5, y))
            if white[y, xr + 2] or white[y, xr + 3]:
                pts.append((xr + 0.5, y))
        p = np.array(pts, float)
        a = np.c_[2 * p[:, 0], 2 * p[:, 1], np.ones(len(p))]
        c, *_ = np.linalg.lstsq(a, p[:, 0] ** 2 + p[:, 1] ** 2, rcond=None)
        icx, icy = c[0], c[1]
        ir = float(math.sqrt(c[2] + icx**2 + icy**2))
        # по столбцам: верх/низ разреза глаза и полоса ресниц над ним
        cols = []
        for x in range(x0, x1):
            col = np.nonzero(o[:, x])[0]
            if len(col) == 0:
                continue
            top, bot = int(col.min()), int(col.max())
            yb, k = top - 1, 0
            while k < 4 and not dark[yb, x]:
                yb -= 1
                k += 1
            if not dark[yb, x]:
                cols.append((x, top, bot, np.nan, np.nan))
                continue
            ye = yb
            while dark[ye - 1, x]:
                ye -= 1
            cols.append((x, top, bot, ye, yb))
        cnts, _ = cv2.findContours(o, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cnt = max(cnts, key=cv2.contourArea)[:, 0, :].astype(float)
        res[side] = {
            "o": o,
            "iris": (float(icx), float(icy), ir),
            "cols": cols,
            "contour": cnt,
        }
    return res


def robust_smooth(
    v: np.ndarray, med: int = 5, avg: int = 5, tol: float | None = None
) -> np.ndarray:
    """Медиана (убирает выбросы) + скользящее среднее (убирает «пилу»), края — зеркально."""
    v = np.asarray(v, float)
    pad = med // 2
    vp = np.pad(v, pad, mode="edge")
    m = np.array([np.median(vp[i : i + med]) for i in range(len(v))])
    if tol is not None:
        v = np.where(np.abs(v - m) > tol, m, v)
    else:
        v = m
    k = np.ones(avg) / avg
    return np.convolve(np.pad(v, avg // 2, mode="edge"), k, mode="valid")


def soft_layer(rgb: np.ndarray, alpha: np.ndarray, box) -> tuple[Image.Image, list]:
    x0, y0, x1, y1 = box
    rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1, None] * 255])
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8)), [
        x0,
        y0,
        x1 - x0,
        y1 - y0,
    ]


def save_layer(img: Image.Image, name: str) -> str:
    w, h = img.size
    small = img.resize(
        (max(1, round(w * SCALE)), max(1, round(h * SCALE))), Image.LANCZOS
    )
    path = OUT / f"{name}.webp"
    small.save(path, "WEBP", quality=92, alpha_quality=100, method=6)
    return path.name


def smooth_path(pts: np.ndarray, closed: bool = True, eps: float = 0.7) -> str:
    """Контур → SVG-путь из квадратичных сглаженных отрезков (по серединам)."""
    p = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), eps, closed)[:, 0, :]
    if len(p) < 3:
        return ""
    mids = [(p[i] + p[(i + 1) % len(p)]) / 2 for i in range(len(p))]
    d = [f"M{mids[-1][0]:.1f} {mids[-1][1]:.1f}"]
    for i in range(len(p)):
        d.append(f"Q{p[i][0]:.1f} {p[i][1]:.1f} {mids[i][0]:.1f} {mids[i][1]:.1f}")
    return "".join(d) + "Z"


def build(preview: Path | None) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
    h, w, _ = src.shape
    img = clean(src)
    rgb, alpha = matte(img)
    yy, _xx = np.mgrid[0:h, 0:w]

    # --- брови: отделяем (с мягкой альфой «бровь поверх кожи»), на лице — заливка кожей
    v = BROW - SKIN
    t = np.clip(((rgb - SKIN) @ v) / (v @ v), 0, 1)
    brows = {}
    base = rgb.copy()
    hole = np.zeros((h, w), np.uint8)
    for side, (seed, box) in {
        "l": ((560, 470), (488, 440, 600, 498)),
        "r": ((700, 465), (640, 440, 790, 498)),
    }.items():
        x0, y0, x1, y1 = box
        m = np.zeros((h, w), np.uint8)
        bluish = (
            rgb[..., 2] - rgb[..., 0]
        ) > 30  # бровь сине-фиолетовая, контур — чёрный
        m[y0:y1, x0:x1] = ((t > 0.35) & bluish)[y0:y1, x0:x1].astype(np.uint8)
        n, lab = cv2.connectedComponents(m, connectivity=8)
        comp = lab == lab[seed[1], seed[0]]
        comp = (
            cv2.dilate(comp.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
            & (t > 0.03)
            & (rgb.max(2) > 70)
        )
        a = np.where(comp, t, 0).astype(np.float32)
        fg = np.where(
            a[..., None] > 0.05,
            (rgb - (1 - a[..., None]) * SKIN) / np.maximum(a[..., None], 0.05),
            BROW,
        )
        fg = np.clip(fg, 0, 255)
        ys, xs = np.nonzero(comp)
        bx = (
            int(xs.min()) - 3,
            int(ys.min()) - 3,
            int(xs.max()) + 4,
            int(ys.max()) + 4,
        )
        lay, rect = soft_layer(fg, np.clip(a * 1.04, 0, 1), bx)
        brows[side] = {
            "file": save_layer(lay, f"brow-{side}"),
            "rect": rect,
            "inner": [
                float(xs.max()) if side == "l" else float(xs.min()),
                float(ys[np.argmax(xs)] if side == "l" else ys[np.argmin(xs)]),
            ],
            "outer": [
                float(xs.min()) if side == "l" else float(xs.max()),
                float(ys[np.argmin(xs)] if side == "l" else ys[np.argmax(xs)]),
            ],
        }
        hole |= cv2.dilate(comp.astype(np.uint8), np.ones((5, 5), np.uint8))
        rest = np.zeros((h, w), np.uint8)  # остатки брови вне основной компоненты
        rest[y0:y1, x0:x1] = ((t > 0.15) & bluish)[y0:y1, x0:x1]
        hole |= cv2.dilate(rest, np.ones((5, 5), np.uint8))

    # --- губы
    x0, y0, x1, y1 = 560, 666, 676, 712
    dist = np.linalg.norm(rgb - SKIN, axis=2)
    lipm = np.zeros((h, w), bool)
    lipm[y0:y1, x0:x1] = dist[y0:y1, x0:x1] > 30
    n, lab, st, _ = cv2.connectedComponentsWithStats(
        lipm.astype(np.uint8), connectivity=8
    )
    lipm = np.isin(lab, [i for i in range(1, n) if st[i, 4] > 200])
    la = np.clip((dist - 12) / 40, 0, 1) * cv2.dilate(
        lipm.astype(np.uint8), np.ones((5, 5), np.uint8)
    )
    fg = np.where(
        la[..., None] > 0.05,
        (rgb - (1 - la[..., None]) * SKIN) / np.maximum(la[..., None], 0.05),
        rgb,
    )
    ys, xs = np.nonzero(la > 0.02)
    lb = (int(xs.min()) - 2, int(ys.min()) - 2, int(xs.max()) + 3, int(ys.max()) + 3)
    lay, lips_rect = soft_layer(np.clip(fg, 0, 255), la, lb)
    lips_file = save_layer(lay, "lips")
    # профиль губ по столбцам: верх, линия смыкания, низ (линия — по переходу тёмная/светлая губа
    # в средней части, к уголкам — плавно к точкам уголков)
    lip_cols = []
    red = rgb[..., 0]
    for x in range(569, 667, 2):
        c = np.nonzero(dist[664:714, x] > 45)[0]
        if len(c) == 0:
            continue
        top, bot = 664 + int(c.min()), 664 + int(c.max())
        g = np.diff(red[top : bot + 1, x])
        line = top + int(np.argmax(g)) + 1 if len(g) else top
        lip_cols.append([x, top, line, bot])
    mid = [c for c in lip_cols if 593 <= c[0] <= 637]
    mx_ = np.array([c[0] for c in mid], float)
    ml = robust_smooth([c[2] for c in mid], med=5, avg=3, tol=2.5)
    for c in lip_cols:
        if c[0] < mx_[0]:
            c[2] = float(np.interp(c[0], [569, mx_[0]], [685, ml[0]]))
        elif c[0] > mx_[-1]:
            c[2] = float(np.interp(c[0], [mx_[-1], 665], [ml[-1], 685]))
        else:
            c[2] = float(np.interp(c[0], mx_, ml))
    arr = np.array(lip_cols, float)
    arr[:, 1] = robust_smooth(arr[:, 1], med=3, avg=3)
    arr[:, 3] = robust_smooth(arr[:, 3], med=3, avg=3)
    lip_cols = [[int(r[0])] + [round(float(v), 1) for v in r[1:]] for r in arr]
    hole |= cv2.dilate((la > 0.02).astype(np.uint8), np.ones((5, 5), np.uint8))
    hole &= (rgb.max(2) > 70).astype(np.uint8)  # чёрный контур волос не трогаем
    base = cv2.inpaint(
        np.clip(base, 0, 255).astype(np.uint8), hole, 6, cv2.INPAINT_TELEA
    ).astype(np.float32)

    # --- глаза: разрез (клип), радужка-слой с достроенными скрытыми краями, полоса ресниц
    ey = eyes(rgb)
    eyes_out = {}
    for side, e in ey.items():
        icx, icy, ir = e["iris"]
        rr = ir + 2.5
        bx = (
            int(icx - rr) - 1,
            int(icy - rr) - 1,
            int(icx + rr) + 2,
            int(icy + rr) + 2,
        )
        x0, y0, x1, y1 = bx
        crop = rgb[y0:y1, x0:x1].astype(np.uint8)
        cy_, cx_ = np.mgrid[y0:y1, x0:x1]
        d = np.hypot(cx_ - icx, cy_ - icy)
        mxc, mnc = crop.max(2), crop.min(2)
        is_white = (mnc > 185) & ((mxc.astype(int) - mnc) < 50) & (d > ir - 6)
        known = (e["o"][y0:y1, x0:x1] > 0) & (d < ir - 0.8) & ~is_white
        unknown = ((d < rr) & ~known).astype(np.uint8)
        filled = cv2.inpaint(crop, unknown, 5, cv2.INPAINT_TELEA)
        ia = np.clip(ir + 0.4 - d, 0, 1)
        lay = Image.fromarray(np.dstack([filled, (ia * 255).astype(np.uint8)]))
        cols = e["cols"]
        # выбросы (полоса не нашлась или «съехала» на тёмное кольцо радужки) — выкинуть; где полосы
        # нет (у уголков), продолжить её по верхнему краю разреза; затем сгладить
        arr = np.array(cols, float)
        th = arr[:, 4] - arr[:, 3]
        ok = ~np.isnan(th)
        runmed = np.array(
            [
                np.nanmedian(arr[max(0, i - 4) : i + 5, 3])
                if ok[max(0, i - 4) : i + 5].any()
                else np.nan
                for i in range(len(arr))
            ]
        )
        good = (
            ok
            & (np.abs(th - np.nanmedian(th)) <= 4)
            & (np.abs(arr[:, 3] - runmed) <= 3)
        )
        gap = np.median(arr[good, 1] - 1 - arr[good, 4])
        gi = np.nonzero(good)[0]
        for i in np.nonzero(~good)[0]:
            if gi.min() < i < gi.max():  # внутри — интерполяция по соседям
                for jcol in (3, 4):
                    arr[i, jcol] = np.interp(arr[i, 0], arr[gi, 0], arr[gi, jcol])
            else:  # у уголков — продолжение по краю разреза
                near = gi[np.argmin(np.abs(gi - i))]
                arr[i, 4] = arr[i, 1] - 1 - gap
                arr[i, 3] = arr[i, 4] - (arr[near, 4] - arr[near, 3])
        cols = arr
        raw_top = cols[:, 3].copy()
        for j in (1, 2, 3, 4):
            cols[:, j] = robust_smooth(cols[:, j], med=5, avg=5)
        cols[:, 3] = np.minimum(cols[:, 3], raw_top)  # верх полосы — не ниже исходного
        cols = [[int(r[0])] + [round(float(v), 1) for v in r[1:]] for r in cols]
        # цвет века = кожа сразу над полосой ресниц (медиана, без складки века)
        samp = []
        for x_, _, _, bt_, _ in cols[4:-4:2]:
            for dy in (12, 14, 16):
                c_ = base[round(bt_) - dy, x_]
                if np.linalg.norm(c_ - SKIN) < 40:
                    samp.append(c_)
        lid = np.median(np.array(samp), 0) if samp else SKIN
        eyes_out[side] = {
            "lid": "#{:02x}{:02x}{:02x}".format(*tuple(round(v) for v in lid)),
            "iris": [round(icx, 2), round(icy, 2), round(ir, 2)],
            "file": save_layer(lay, f"iris-{side}"),
            "rect": [x0, y0, x1 - x0, y1 - y0],
            "clip": smooth_path(e["contour"]),
            # столбцы с шагом 2: x, верх и низ разреза, верх и низ полосы ресниц
            "cols": [[c[0], c[1], c[2], c[3], c[4]] for c in cols[::2]]
            + ([list(cols[-1])] if (len(cols) - 1) % 2 else []),
        }

    # --- кожа лица (клип для бровей и век: они не должны заезжать на волосы и контур)
    skin_m = (np.linalg.norm(base - SKIN, axis=2) < 60).astype(np.uint8)
    skin_m[:380] = 0
    skin_m[800:] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(skin_m, connectivity=4)
    face = (lab == lab[600, 617]).astype(np.uint8)
    face = cv2.morphologyEx(
        face, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    )
    face[380:800] = fill_holes(face[380:800])
    cnts, _ = cv2.findContours(face, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    face_clip = smooth_path(
        max(cnts, key=cv2.contourArea)[:, 0, :].astype(float), eps=1.0
    )

    # --- голова / торс: граница по верхнему краю чокера, шея продлена под него на 46 px
    mn = rgb.min(2)
    split = np.full(w, 845, np.int32)
    xs_c, tops = [], []
    for x in range(528, 724):
        col = np.nonzero(mn[820:900, x] > 200)[0]
        if len(col):
            xs_c.append(x)
            tops.append(820 + col.min() - 9)
    split[528:724] = np.interp(np.arange(528, 724), xs_c, tops).astype(np.int32)
    head_a = alpha * (yy < split[None, :])
    torso_a = alpha * (yy >= split[None, :])
    head_rgb = base.copy()
    for x in range(545, 705):
        s = split[x]
        src_row = s - 4
        if alpha[src_row, x] < 0.5:
            continue
        head_rgb[s : s + 46, x] = base[src_row, x]
        head_a[s : s + 46, x] = alpha[src_row, x]
    hb = np.nonzero(head_a.max(1) > 0.01)[0]
    hx = np.nonzero(head_a.max(0) > 0.01)[0]
    head_box = (int(hx.min()), int(hb.min()), int(hx.max()) + 1, int(hb.max()) + 1)
    lay, head_rect = soft_layer(head_rgb, head_a, head_box)
    head_file = save_layer(lay, "head")
    tb = np.nonzero(torso_a.max(1) > 0.01)[0]
    tx = np.nonzero(torso_a.max(0) > 0.01)[0]
    torso_box = (int(tx.min()), int(tb.min()), int(tx.max()) + 1, h)
    lay, torso_rect = soft_layer(base, torso_a, torso_box)
    torso_file = save_layer(lay, "torso")

    # --- линзы гогглов (для бликов)
    hsv = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
    teal = (
        (hsv[..., 0] > 80)
        & (hsv[..., 0] < 105)
        & (hsv[..., 1] > 120)
        & (hsv[..., 2] > 90)
    )
    n, lab, st, cen = cv2.connectedComponentsWithStats(teal.astype(np.uint8))
    lenses = []
    for i in np.argsort(-st[:, 4])[1:3]:
        x, _y, ww, hh, _ = st[i]
        lenses.append(
            [
                round(float(cen[i][0]), 1),
                round(float(cen[i][1]), 1),
                round((ww + hh) / 4 + 1, 1),
            ]
        )

    rig = {
        "size": [w, h],
        "scale": SCALE,
        "head": {"file": head_file, "rect": head_rect, "pivot": [617, 840]},
        "face": face_clip,
        "torso": {"file": torso_file, "rect": torso_rect},
        "chest": {"cx": 617, "cy": 1100, "rx": 140, "ry": 90, "anchor": [617, 1186]},
        "brows": brows,
        "lips": {
            "file": lips_file,
            "rect": lips_rect,
            "corners": [[568.5, 685.0], [666.0, 684.5]],
            "center": [617.3, 686.0],
            "cols": lip_cols,
        },
        "eyes": eyes_out,
        "lenses": sorted(lenses),
        "gears": GEARS,
        "colors": {
            "skin": "#{:02x}{:02x}{:02x}".format(*tuple(int(c) for c in SKIN)),
            "line": "#0a010b",
            "gear": "#f49a2e",
        },
    }
    js = (
        "// Сгенерировано tools/avatar/build.py — не править руками.\n"
        f"export const RIG = {json.dumps(rig, ensure_ascii=False, separators=(',', ':'))};\n"
    )
    (OUT / "rig.js").write_text(js)
    print(
        "rig.js:",
        len(js),
        "bytes;",
        ", ".join(
            f"{p.name} {p.stat().st_size // 1024}K" for p in sorted(OUT.glob("*.webp"))
        ),
    )
    if preview:
        preview.mkdir(parents=True, exist_ok=True)
        Image.fromarray(
            np.dstack([np.clip(base, 0, 255), alpha * 255]).astype(np.uint8)
        ).save(preview / "base.png")
        Image.fromarray(
            np.dstack([np.clip(head_rgb, 0, 255), head_a * 255]).astype(np.uint8)
        ).save(preview / "head.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", type=Path)
    build(ap.parse_args().preview)
