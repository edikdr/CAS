"""Растровые ассеты HYPERINA: полутоновые обои со статуей, курсоры, картинки заставки.

Всё рисуется из палитры, поэтому при смене профиля ассеты пересобираются в его цветах.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
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


# ── курсоры ──────────────────────────────────────────────────────
CURSOR_SIZES = (24, 36, 48, 64)

CURSOR_ALIASES = {
    "default": ["left_ptr", "arrow", "top_left_arrow", "x-cursor", "X_cursor", "context-menu", "copy", "alias",
                "dnd-copy", "dnd-link", "dnd-move", "dnd-none", "dnd-ask", "move-arrow"],
    "pointer": ["hand1", "hand2", "pointing_hand", "hand", "e29285e634086352946a0e7090d73106", "9d800788f1b08800ae810202380a0822"],
    "text": ["xterm", "ibeam", "vertical-text"],
    "crosshair": ["cross", "tcross", "cell", "plus", "color-picker", "pencil"],
    "wait": ["watch", "busy"],
    "progress": ["left_ptr_watch", "half-busy", "08e8e1c95fe2fc01f976f1e063a24ccd", "3ecb610c1bf2410f44200f48c40d3599"],
    "not-allowed": ["crossed_circle", "no-drop", "forbidden", "circle", "03b6e0fcb3499374a867c041f52298f0"],
    "move": ["all-scroll", "fleur", "size_all", "grabbing", "closedhand", "dnd-move-hand"],
    "grab": ["openhand", "pointer-move"],
    "ns-resize": ["n-resize", "s-resize", "size_ver", "sb_v_double_arrow", "v_double_arrow", "row-resize", "top_side", "bottom_side", "split_v", "00008160000006810000408080010102"],
    "ew-resize": ["e-resize", "w-resize", "size_hor", "sb_h_double_arrow", "h_double_arrow", "col-resize", "left_side", "right_side", "split_h", "028006030e0e7ebffc7f7070c0600140"],
    "nwse-resize": ["nw-resize", "se-resize", "size_fdiag", "bd_double_arrow", "top_left_corner", "bottom_right_corner", "c7088f0f3e6c8088236ef8e1e3e70000"],
    "nesw-resize": ["ne-resize", "sw-resize", "size_bdiag", "fd_double_arrow", "top_right_corner", "bottom_left_corner", "fcf1c3c7cd4491d801f1e1c78f100000"],
    "help": ["question_arrow", "whats_this", "left_ptr_help", "d9ce0ab605698f320427677b458ad60b", "5c6cd98b3f3ebcb1f9c7f1c204630408"],
}


def _arrow(d: ImageDraw.ImageDraw, s: float, fill, outline) -> None:
    pts = [(1, 1), (1, 17), (5.2, 13.2), (8.2, 20), (11, 18.8), (8.2, 12.4), (14, 12.4)]
    pts = [(x * s, y * s) for x, y in pts]
    d.polygon(pts, fill=fill, outline=outline)
    d.line(pts + [pts[0]], fill=outline, width=max(1, round(s * 1.1)), joint="curve")


def _draw_cursor(name: str, size: int, p: Palette, frame: int = 0) -> tuple["Image.Image", int, int]:
    s = size / 24
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ink, acc, cor, blk = (*hex_to_rgb(p["ink"]), 255), (*hex_to_rgb(p["accent"]), 255), (*hex_to_rgb(p["coral"]), 255), (0, 0, 0, 255)
    w = max(1, round(1.6 * s))
    c = size / 2
    if name in ("default", "help", "progress"):
        _arrow(d, s, ink, blk)
        d.rectangle((1 * s, 19.5 * s, 4 * s, 21 * s), fill=acc)
        if name == "help":
            d.text((14 * s, 12 * s), "?", fill=acc, font=font(max(8, round(10 * s)), "mono_bold"))
        if name == "progress":
            _segments(d, 17 * s, 18 * s, 5.2 * s, frame, ink, acc, s)
        return img, round(s), round(s)
    if name == "pointer":
        _arrow(d, s, acc, blk)
        return img, round(s), round(s)
    if name == "text":
        for col, ww in ((blk, w + 2), (ink, w)):
            d.line((c, 4 * s, c, 20 * s), fill=col, width=ww)
            d.line((c - 3.5 * s, 4 * s, c + 3.5 * s, 4 * s), fill=col, width=ww)
            d.line((c - 3.5 * s, 20 * s, c + 3.5 * s, 20 * s), fill=col, width=ww)
        return img, round(c), round(c)
    if name == "crosshair":
        for col, ww in ((blk, w + 2), (ink, w)):
            d.line((c, 2 * s, c, 9 * s), fill=col, width=ww); d.line((c, 15 * s, c, 22 * s), fill=col, width=ww)
            d.line((2 * s, c, 9 * s, c), fill=col, width=ww); d.line((15 * s, c, 22 * s, c), fill=col, width=ww)
        d.rectangle((c - 1.2 * s, c - 1.2 * s, c + 1.2 * s, c + 1.2 * s), fill=acc)
        return img, round(c), round(c)
    if name == "wait":
        _segments(d, c, c, 8 * s, frame, ink, acc, s)
        return img, round(c), round(c)
    if name == "not-allowed":
        r = 8 * s
        d.ellipse((c - r, c - r, c + r, c + r), outline=blk, width=w + 2)
        d.ellipse((c - r, c - r, c + r, c + r), outline=cor, width=w)
        d.line((c - r * 0.7, c + r * 0.7, c + r * 0.7, c - r * 0.7), fill=cor, width=w)
        return img, round(c), round(c)
    if name in ("move", "grab"):
        L = 8 * s
        for col, ww in ((blk, w + 2), (ink if name == "move" else acc, w)):
            d.line((c - L, c, c + L, c), fill=col, width=ww); d.line((c, c - L, c, c + L), fill=col, width=ww)
            for ax, ay, bx, by in ((c - L, c, c - L + 3 * s, c - 3 * s), (c - L, c, c - L + 3 * s, c + 3 * s),
                                   (c + L, c, c + L - 3 * s, c - 3 * s), (c + L, c, c + L - 3 * s, c + 3 * s),
                                   (c, c - L, c - 3 * s, c - L + 3 * s), (c, c - L, c + 3 * s, c - L + 3 * s),
                                   (c, c + L, c - 3 * s, c + L - 3 * s), (c, c + L, c + 3 * s, c + L - 3 * s)):
                d.line((ax, ay, bx, by), fill=col, width=ww)
        return img, round(c), round(c)
    if name.endswith("-resize"):
        ang = {"ns-resize": 90, "ew-resize": 0, "nwse-resize": 45, "nesw-resize": 135}[name]
        L = 8 * s
        dx, dy = math.cos(math.radians(ang)) * L, math.sin(math.radians(ang)) * L
        a, b = (c - dx, c - dy), (c + dx, c + dy)
        for col, ww in ((blk, w + 2), (ink, w)):
            d.line((a, b), fill=col, width=ww)
            for (px, py), sign in ((a, 1), (b, -1)):
                for off in (-35, 35):
                    t = math.radians(ang + off)
                    d.line((px, py, px + sign * math.cos(t) * 4 * s, py + sign * math.sin(t) * 4 * s), fill=col, width=ww)
        return img, round(c), round(c)
    _arrow(d, s, ink, blk)
    return img, round(s), round(s)


def _segments(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, frame: int, ink, acc, s: float) -> None:
    for i in range(8):
        a0 = math.radians(i * 45 + 6)
        a1 = math.radians(i * 45 + 39)
        col = acc if (i - frame) % 8 in (0, 1, 2) else (*ink[:3], 110)
        d.arc((cx - r, cy - r, cx + r, cy + r), math.degrees(a0), math.degrees(a1), fill=(0, 0, 0, 255), width=max(2, round(3.4 * s)))
        d.arc((cx - r, cy - r, cx + r, cy + r), math.degrees(a0), math.degrees(a1), fill=col, width=max(1, round(2.2 * s)))


def build_cursor_theme(p: Palette, dest: Path) -> Path | None:
    """Собрать курсоры XCursor в dest/cursors (dest — каталог темы HYPERINA). Нужен xcursorgen."""
    if not shutil.which("xcursorgen"):
        return None
    work = paths.CACHE_DIR / "cursor-build"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    cursors = dest / "cursors"
    shutil.rmtree(cursors, ignore_errors=True)
    cursors.mkdir(parents=True)
    for name in CURSOR_ALIASES:
        frames = 8 if name in ("wait", "progress") else 1
        cfg_lines = []
        for size in CURSOR_SIZES:
            for fr in range(frames):
                img, hx, hy = _draw_cursor(name, size, p, fr)
                fn = work / f"{name}-{size}-{fr}.png"
                img.save(fn)
                cfg_lines.append(f"{size} {hx} {hy} {fn}" + (" 90" if frames > 1 else ""))
        cfg = work / f"{name}.cfg"
        cfg.write_text("\n".join(cfg_lines) + "\n")
        subprocess.run(["xcursorgen", str(cfg), str(cursors / name)], check=True)
        for alias in CURSOR_ALIASES[name]:
            link = cursors / alias
            if not link.exists():
                link.symlink_to(name)
    if not (dest / "index.theme").exists():
        (dest / "index.theme").write_text("[Icon Theme]\nName=HYPERINA\nComment=HYPERINA\nInherits=Adwaita\n")
    shutil.rmtree(work, ignore_errors=True)
    return dest


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
