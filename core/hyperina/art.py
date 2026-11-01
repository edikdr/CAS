"""Растровые ассеты HYPERINA: полутоновые обои со статуей, курсоры, картинки заставки.

Всё рисуется из палитры, поэтому при смене профиля ассеты пересобираются в его цветах.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import paths
from .palette import Palette, hex_to_rgb, mix

FONT_DIRS = [Path("/usr/share/fonts"), paths.HOME / ".local/share/fonts"]


def find_font(names: list[str]) -> str | None:
    for d in FONT_DIRS:
        if not d.exists():
            continue
        for n in names:
            hits = list(d.rglob(n))
            if hits:
                return str(hits[0])
    return None


def font(size: int, kind: str = "mono") -> ImageFont.ImageFont:
    names = {
        "mono": ["IBMPlexMono-Regular.ttf", "IBMPlexMono-Medium.ttf", "JetBrainsMono-Regular.ttf", "DejaVuSansMono.ttf"],
        "mono_bold": ["IBMPlexMono-SemiBold.ttf", "IBMPlexMono-Bold.ttf", "JetBrainsMono-Bold.ttf", "DejaVuSansMono-Bold.ttf"],
        "display": ["Unbounded-ExtraBold.ttf", "Unbounded-Bold.ttf", "Unbounded*.ttf", "IBMPlexSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
    }[kind]
    path = find_font(names)
    if path:
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()


# ── статуя: полутон ──────────────────────────────────────────────
def statue_grid(src: Path, height: int, cell: int) -> tuple["Image.Image", "Image.Image"]:
    """Вернуть (яркость по клеткам, маску силуэта) для исходного фото статуи на чёрном фоне."""
    im = Image.open(src).convert("L")
    bbox = im.point(lambda v: 255 if v > 28 else 0).getbbox()
    if bbox:
        pad = 10
        im = im.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(im.width, bbox[2] + pad), min(im.height, bbox[3] + pad)))
    w = round(im.width * height / im.height)
    gw, gh = max(1, w // cell), max(1, height // cell)
    small = im.resize((gw, gh), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))
    mask = im.resize((gw, gh), Image.BILINEAR).point(lambda v: 255 if v > 24 else 0)
    return small, mask


def render_statue_layer(p: Palette, src: Path, height: int, cell: int, phase: float) -> tuple["Image.Image", list]:
    """Слой статуи с альфой. phase сдвигает «дыхание» точек. Возвращает (картинка, точки кромки для камешков)."""
    g, mask = statue_grid(src, height, cell)
    gw, gh = g.size
    px, mk = g.load(), mask.load()
    ink = hex_to_rgb(p["ink"])
    hi = hex_to_rgb(mix(p["ink"], "#FFFFFF", 0.15))
    img = Image.new("RGBA", (gw * cell, gh * cell), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rmax = cell * 0.47
    for y in range(gh):
        for x in range(gw):
            v = px[x, y] / 255.0
            v = max(0.0, min(1.0, (v - 0.07) / 0.86)) ** 1.25
            # медленное «дыхание»: размер точек плавно колеблется по низкочастотному полю
            breath = 1.0 + 0.10 * math.sin(x * 0.21 + phase) * math.sin(y * 0.17 - phase * 0.8)
            r = rmax * v * breath
            if mk[x, y] and r < 0.45 and v > 0.0:
                continue
            if r >= 0.45:
                cx, cy = x * cell + cell / 2, y * cell + cell / 2
                col = hi if v > 0.92 else ink
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*col, 255))
    edges = []
    for y in range(gh // 3, gh - 2):
        for x in range(1, gw - 1):
            if mk[x, y] and not mk[x, y + 2] and px[x, y] > 70:
                edges.append([x * cell + cell // 2, y * cell + cell // 2])
    return img, edges[::3]


def render_wallpaper(p: Palette, out_dir: Path, size: tuple[int, int] = (2560, 1600), src: Path | None = None) -> dict:
    """Обои «statue»: фон с сеткой и рамками + 3 слоя статуи для дыхания + meta.json для живого слоя оболочки."""
    W, H = size
    out_dir.mkdir(parents=True, exist_ok=True)
    src = src or paths.ASSETS / "art/statue-source.png"
    bg0, line, dim, ink = (hex_to_rgb(p[k]) for k in ("bg0", "line", "dim", "ink"))
    base = Image.new("RGB", size, bg0)
    d = ImageDraw.Draw(base)
    # сетка точек в правой части
    step = 32
    dotc = tuple(int(c * 0.9) for c in line)
    for y in range(96, H - 64, step):
        for x in range(int(W * 0.38), W - 64, step):
            d.point((x, y), fill=dotc)
    # рамка вокруг статуи в духе референса Arch
    sh = int(H * 0.80)
    statue_h = sh
    sx, sy = int(W * 0.045), H - sh - int(H * 0.035)
    fx0, fy0, fx1, fy1 = sx - 18, sy + int(sh * 0.32), sx + int(sh * 0.48), H - int(H * 0.035) + 6
    d.rectangle((fx0, fy0, fx1, fy1), outline=line, width=1)
    d.line((fx1 - 140, fy0 - 120, fx1 - 140, fy0), fill=line, width=1)
    d.rectangle((fx1 - 22, fy0 + 16, fx1 - 12, fy0 + 26), fill=dim)
    d.rectangle((fx0 + 22, fy1 - 40, fx0 + 34, fy1 - 28), fill=dim)
    f_small = font(15)
    d.text((fx0 + 14, fy1 - 24), "///", font=f_small, fill=dim)
    # подписи
    f_lbl = font(18, "mono_bold")
    d.text((sx, int(H * 0.07)), "▌ HYPERINA", font=f_lbl, fill=ink)
    for i, word in enumerate(("SIMPLE", "FLEXIBLE", "YOURS")):
        d.text((sx + 4, int(H * 0.07) + 44 + i * 24), word, font=f_small, fill=dim)
    # вертикальная подпись вдоль правого края
    vt = Image.new("RGBA", (420, 24), (0, 0, 0, 0))
    ImageDraw.Draw(vt).text((0, 2), "SUBJECT // MARBLE-01 · HALFTONE · LIVE", font=f_small, fill=(*dim, 255))
    vt = vt.rotate(90, expand=True)
    base.paste(vt, (W - 56, int(H * 0.30)), vt)
    # кресты на пересечениях
    for (x, y) in ((int(W * 0.62), int(H * 0.86)), (int(W * 0.92), int(H * 0.18)), (int(W * 0.40), int(H * 0.12))):
        d.line((x - 7, y, x + 7, y), fill=dim)
        d.line((x, y - 7, x, y + 7), fill=dim)
    # лёгкое зерно
    noise = Image.effect_noise(size, 12).convert("L").point(lambda v: max(0, v - 120) // 9)
    base = Image.composite(Image.new("RGB", size, ink), base, noise)
    base.save(out_dir / "base.png", optimize=True)

    cell = 6 if W >= 2000 else 4
    edges_all: list = []
    layer_size = None
    for i, phase in enumerate((0.0, 2.1, 4.2)):
        layer, edges = render_statue_layer(p, src, statue_h, cell, phase)
        layer.save(out_dir / f"statue-{i}.png", optimize=True)
        layer_size = layer.size
        if i == 0:
            edges_all = edges
    meta = {
        "size": [W, H],
        "statue": {"x": sx, "y": sy, "w": layer_size[0], "h": layer_size[1], "layers": 3},
        "ground": fy1,
        "edges": [[sx + ex, sy + ey] for ex, ey in edges_all],
        "profile": p.name,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta))
    # тайл зерна для живого слоя (анимируется сдвигом)
    g = Image.effect_noise((256, 256), 60).convert("L")
    grain = Image.new("RGBA", (256, 256), (*ink, 0))
    grain.putalpha(g.point(lambda v: max(0, v - 150)))
    grain.save(out_dir / "grain.png")
    # статичная копия целиком: экран блокировки и запасной вариант без живого слоя
    full = base.copy().convert("RGBA")
    st = Image.open(out_dir / "statue-0.png")
    full.alpha_composite(st, (sx, sy))
    full.convert("RGB").save(out_dir / "full.png", optimize=True)
    return meta


# ── курсоры: см. cursors.py (SVG-геометрия, симметрия по построению) ──
def build_cursor_theme(p: Palette, dest: Path) -> Path | None:
    from . import cursors
    return cursors.build_cursor_theme(p, dest)


# ── заставка загрузки (Plymouth): картинки ───────────────────────
BOOT_LOG = [
    "> INITIALIZING CORE ................ OK",
    "> MOUNTING FILESYSTEMS ............. OK",
    "> GPU: RADEON 8060S // GTT ......... OK",
    "> RESTORING CHRONOLOGY ............. OK",
    "> LOADING NEURAL CORE .............. STANDBY",
    "> HAOTICA .......................... WAKING",
]


def render_plymouth(p: Palette, dest: Path) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    ink, dim, acc, line = (hex_to_rgb(p[k]) for k in ("ink", "dim", "accent", "line"))
    out = []
    big = font(86, "display")
    tmp = Image.new("RGBA", (10, 10))
    bb = ImageDraw.Draw(tmp).textbbox((0, 0), "HYPERINA", font=big)
    logo = Image.new("RGBA", (bb[2] + 8, bb[3] + 40), (0, 0, 0, 0))
    ld = ImageDraw.Draw(logo)
    ld.text((4, 0), "HYPERINA", font=big, fill=(*ink, 255))
    ld.text((8, bb[3] + 14), "// SYSTEM BOOT · SECURE ACCESS", font=font(18), fill=(*dim, 255))
    logo.save(dest / "logo.png"); out.append(dest / "logo.png")
    f = font(20)
    for i, txt in enumerate(BOOT_LOG):
        im = Image.new("RGBA", (760, 30), (0, 0, 0, 0))
        dd = ImageDraw.Draw(im)
        dd.text((0, 2), txt, font=f, fill=(*dim, 255))
        status = txt.split()[-1]
        sb = dd.textbbox((0, 2), txt, font=f)
        col = acc if status in ("STANDBY", "WAKING") else hex_to_rgb(p["green"])
        sw = dd.textlength(status, font=f)
        dd.text((sb[2] - sw, 2), status, font=f, fill=(*col, 255))
        im.save(dest / f"log{i}.png"); out.append(dest / f"log{i}.png")
    for name, col in (("seg_on", acc), ("seg_off", line)):
        im = Image.new("RGBA", (18, 8), (*col, 255))
        im.save(dest / f"{name}.png"); out.append(dest / f"{name}.png")
    im = Image.new("RGBA", (14, 14), (0, 0, 0, 0))
    ImageDraw.Draw(im).rectangle((2, 2, 11, 11), fill=(*ink, 255))
    im.save(dest / "bullet.png"); out.append(dest / "bullet.png")
    im = Image.new("RGBA", (520, 46), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    dd.rectangle((0, 0, 519, 45), outline=(*line, 255))
    im.save(dest / "entry.png"); out.append(dest / "entry.png")
    im = Image.new("RGBA", (520, 30), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((0, 2), "ПАРОЛЬ ДИСКА // DISK PASSPHRASE", font=font(20), fill=(*dim, 255))
    im.save(dest / "prompt.png"); out.append(dest / "prompt.png")
    return out
