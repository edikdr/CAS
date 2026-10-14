"""
tools/cutout_guitar.py - builds the DOM guitar layers from the two catalogue photos.

    python3 tools/cutout_guitar.py [front.jpg] [back.jpg] [out_dir]
    defaults: assets/reference/guitar/front.jpg, .../back.jpg -> assets/guitar/dom/

Needs Pillow + numpy only (no ML model): the photos have an even white background, so the
background is the near-white region connected to the image border.

Writes WebP layers (each <= 58 KB, CONTRACT budget 60 KB) and manifest.json:
  canvas {w, h}           the front guitar's bounding box, every layer is positioned inside it
  layers [{name, src, x, y, w, h, z}]   z = translateZ depth in px at the reference height
  strings [{nut: [x, y], saddle: [x, y]}]   6 entries, low E first (left as seen from the front)
  soundhole {cx, cy, r}
Layers: body (soundhole cut out), neck (fretboard + headstock, raised), hole (interior, sunk),
bridge (raised), back (from back.jpg, shown when the guitar is flipped). The photo strings
between nut and saddle are painted out; core/guitar/strings.js draws vibrating ones instead.

Measured landmarks below are normalised to the photo size (front.jpg 768 x 1376), so an upscaled
copy of the same photo works unchanged. A different photo needs new measurements.
"""

import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
REF_W, REF_H = 768, 1376
NUT_Y, SADDLE_Y = 225 / REF_H, 1061 / REF_H
NUT_X = [361.5 / REF_W, 370.8 / REF_W, 380.5 / REF_W, 390.5 / REF_W, 400.3 / REF_W, 410.0 / REF_W]
SADDLE_X = [346.5 / REF_W, 361.5 / REF_W, 376.5 / REF_W, 391.5 / REF_W, 406.0 / REF_W, 421.25 / REF_W]
HOLE_GUESS = (384 / REF_W, 868 / REF_H, 95 / REF_W)        # search window for the soundhole
BRIDGE_BOX = (280 / REF_W, 1040 / REF_H, 490 / REF_W, 1104 / REF_H)
MAX_BYTES = 58 * 1024
Z = {'back': 0, 'hole': -10, 'body': 0, 'neck': 3, 'bridge': 4}


def load(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)


def background(rgb):
    """Near-white pixels connected to the border (iterative constrained dilation)."""
    lo, hi = rgb.min(axis=2), rgb.max(axis=2)
    cand = (lo > 214) & (hi - lo < 18)
    floor = int(rgb.shape[0] * 0.9)  # grey contact shadow under the guitar: neutral, darker than the wall
    cand[floor:] |= (hi[floor:] - lo[floor:] < 16) & (lo[floor:] > 120)
    bg = np.zeros_like(cand)
    bg[0, :], bg[-1, :], bg[:, 0], bg[:, -1] = cand[0, :], cand[-1, :], cand[:, 0], cand[:, -1]
    while True:
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]
        grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]
        grown[:, :-1] |= bg[:, 1:]
        grown &= cand
        if (grown == bg).all():
            return bg
        bg = grown


def soft_alpha(mask):
    """Hard mask -> alpha with the white fringe eroded and a ~1 px soft edge."""
    img = Image.fromarray((mask * 255).astype(np.uint8))
    img = img.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    return np.asarray(img, dtype=np.float32) / 255


def bbox(alpha, thresh=0.02):
    ys, xs = np.nonzero(alpha > thresh)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def paint_out_strings(rgb, w, h):
    """Replace a 5 px band around each string (nut -> saddle) with a horizontal blend of its sides."""
    out = rgb.copy()
    for y in range(int(NUT_Y * h) - 2, int(SADDLE_Y * h) + 2):
        f = min(1, max(0, (y / h - NUT_Y) / (SADDLE_Y - NUT_Y)))
        for nx, sx in zip(NUT_X, SADDLE_X):
            cx = (nx + (sx - nx) * f) * w
            left, right = int(round(cx)) - 3, int(round(cx)) + 3
            a, b = rgb[y, left], rgb[y, right]
            for x in range(left + 1, right):
                t = (x - left) / (right - left)
                out[y, x] = a * (1 - t) + b * t
    return out


def find_soundhole(rgb, w, h):
    gx, gy, gr = HOLE_GUESS[0] * w, HOLE_GUESS[1] * h, HOLE_GUESS[2] * w
    yy, xx = np.mgrid[0:h, 0:w]
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    dark = (lum < 60) & ((xx - gx) ** 2 + (yy - gy) ** 2 < gr ** 2)
    ys, xs = np.nonzero(dark)
    return xs.mean(), ys.mean(), float(np.sqrt(dark.sum() / np.pi)) + 1.5


def encode(rgb, alpha, box):
    x0, y0, x1, y1 = box
    rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    for scale in (1.0, 0.9, 0.8, 0.7):
        im = img if scale == 1 else img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        for q in (82, 76, 70, 64, 58):
            buf = io.BytesIO()
            im.save(buf, 'WEBP', quality=q, alpha_quality=80, method=6)
            if buf.tell() <= MAX_BYTES:
                return buf.getvalue(), q, scale
    raise SystemExit('layer does not fit the 58 KB budget even at 70 % size')


def main():
    args = sys.argv[1:]
    front_path = Path(args[0]) if len(args) > 0 else ROOT / 'assets/reference/guitar/front.jpg'
    back_path = Path(args[1]) if len(args) > 1 else ROOT / 'assets/reference/guitar/back.jpg'
    out = Path(args[2]) if len(args) > 2 else ROOT / 'assets/guitar/dom'
    out.mkdir(parents=True, exist_ok=True)

    rgb = load(front_path)
    h, w = rgb.shape[:2]
    alpha = soft_alpha(~background(rgb))
    cx0, cy0, cx1, cy1 = bbox(alpha)
    clean = paint_out_strings(rgb, w, h)

    # body/neck split: first row (below the headstock) where the guitar is > 2.5x the neck width
    widths = (alpha > 0.5).sum(axis=1)
    neck_w = np.median(widths[int(0.3 * h):int(0.4 * h)])
    joint = next(y for y in range(int(0.3 * h), h) if widths[y] > 2.5 * neck_w)
    hx, hy, hr = find_soundhole(rgb, w, h)
    fret_end = int(hy - hr - 6)
    yy, xx = np.mgrid[0:h, 0:w]
    hole = ((xx - hx) ** 2 + (yy - hy) ** 2) <= hr ** 2
    hole_soft = np.asarray(Image.fromarray((hole * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255
    # fretboard trapezoid: outermost strings + 7 % of the string spread on each side
    f = np.clip((yy / h - NUT_Y) / (SADDLE_Y - NUT_Y), 0, 1)
    left = (NUT_X[0] + (SADDLE_X[0] - NUT_X[0]) * f) * w
    right = (NUT_X[-1] + (SADDLE_X[-1] - NUT_X[-1]) * f) * w
    pad = (right - left) * 0.12 + 3
    fretboard = (xx > left - pad) & (xx < right + pad) & (yy < fret_end)

    bx0, by0, bx1, by1 = [round(v * s) for v, s in zip(BRIDGE_BOX, (w, h, w, h))]
    bridge = np.zeros_like(alpha)
    bridge[by0:by1, bx0:bx1] = 1
    lum = clean @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    bridge *= ((lum < 95) | (clean.min(axis=2) > 200)).astype(np.float32)  # dark wood, white saddle/pins
    bridge = np.asarray(Image.fromarray((bridge * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255

    layers = {
        'hole': (clean, hole_soft * alpha),
        'body': (clean, alpha * (yy >= joint) * (1 - hole_soft)),
        'neck': (clean, alpha * ((yy < joint) | fretboard)),
        'bridge': (clean, bridge * alpha),
    }

    # back photo: same height as the front guitar, centred on it
    brgb = load(back_path)
    balpha = soft_alpha(~background(brgb))
    bx0_, by0_, bx1_, by1_ = bbox(balpha)
    scale = (cy1 - cy0) / (by1_ - by0_)
    bw, bh = round((bx1_ - bx0_) * scale), cy1 - cy0
    crop = lambda a: np.asarray(Image.fromarray(a[by0_:by1_, bx0_:bx1_]).resize((bw, bh), Image.LANCZOS), dtype=np.float32)
    back_rgb = crop(brgb.astype(np.uint8))
    back_a = crop((balpha * 255).astype(np.uint8)) / 255
    canvas_w = cx1 - cx0
    ox = round((canvas_w - bw) / 2)

    manifest = {'canvas': {'w': int(canvas_w), 'h': int(cy1 - cy0)}, 'layers': [], 'strings': [], 'soundhole': {}}
    total = 0

    def write(name, data, box, q, s):
        nonlocal total
        (out / f'{name}.webp').write_bytes(data)
        total += len(data)
        x0, y0, x1, y1 = box
        manifest['layers'].append({'name': name, 'src': f'assets/guitar/dom/{name}.webp', 'x': int(x0), 'y': int(y0),
                                   'w': int(x1 - x0), 'h': int(y1 - y0), 'z': Z[name]})
        print(f'  {name:7s} {len(data) / 1024:5.1f} KB  q{q} x{s}  {x1 - x0}x{y1 - y0}')

    data, q, s = encode(back_rgb, back_a, (0, 0, bw, bh))
    write('back', data, (ox, 0, ox + bw, bh), q, s)
    for name in ('hole', 'body', 'neck', 'bridge'):
        img, a = layers[name]
        box = bbox(a)
        data, q, s = encode(img, a, box)
        write(name, data, (box[0] - cx0, box[1] - cy0, box[2] - cx0, box[3] - cy0), q, s)

    for nx, sx in zip(NUT_X, SADDLE_X):
        manifest['strings'].append({'nut': [round(nx * w - cx0, 1), round(NUT_Y * h - cy0, 1)],
                                    'saddle': [round(sx * w - cx0, 1), round(SADDLE_Y * h - cy0, 1)]})
    manifest['soundhole'] = {'cx': round(hx - cx0, 1), 'cy': round(hy - cy0, 1), 'r': round(hr, 1)}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(f'total {total / 1024:.1f} KB in {len(manifest["layers"])} layers -> {out}')


if __name__ == '__main__':
    main()
