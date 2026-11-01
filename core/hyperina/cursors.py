"""Курсоры HYPERINA: геометрия в SVG, симметрия по построению.

Каждый курсор описан примитивами в сетке 24×24 с центром (12, 12). Симметричные
фигуры строятся от центра, поэтому левая и правая (верхняя и нижняя) половины
совпадают точно. Из одного описания собираются:
  • тема hyprcursor (SVG, масштабируется без потерь — её рисует Hyprland);
  • тема XCursor (PNG через rsvg-convert, с привязкой к пиксельной сетке на каждом
    размере — для Xwayland-программ вроде Steam).
Проверка симметрии — tools/audit_icons.py.
"""
from __future__ import annotations

import math
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

from . import paths
from .palette import Palette

if TYPE_CHECKING:
    from PIL import Image

XCURSOR_SIZES = (24, 32, 36, 40, 48, 64, 72, 96)
FRAMES = 8           # кадры анимации ожидания
FRAME_MS = 90

# имя курсора → симметрия, которую проверяет аудит
#   lr — зеркало слева-направо, tb — сверху-вниз, rot — поворот на 180°,
#   diag — отражение по диагонали, ring — центрированное кольцо (кадры вращаются)
SYMMETRY = {
    "crosshair": ("lr", "tb", "diag"),
    "move": ("lr", "tb", "diag"),
    "grab": ("lr", "tb", "diag"),
    "text": ("lr", "tb"),
    "ns-resize": ("lr", "tb"),
    "ew-resize": ("lr", "tb"),
    "nwse-resize": ("rot", "diag", "adiag"),
    "nesw-resize": ("rot", "diag", "adiag"),
    "not-allowed": ("rot", "diag", "adiag"),
    "wait": ("ring",),
}

ALIASES = {
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
    "ns-resize": ["n-resize", "s-resize", "size_ver", "sb_v_double_arrow", "v_double_arrow", "row-resize", "top_side",
                  "bottom_side", "split_v", "00008160000006810000408080010102"],
    "ew-resize": ["e-resize", "w-resize", "size_hor", "sb_h_double_arrow", "h_double_arrow", "col-resize", "left_side",
                  "right_side", "split_h", "028006030e0e7ebffc7f7070c0600140"],
    "nwse-resize": ["nw-resize", "se-resize", "size_fdiag", "bd_double_arrow", "top_left_corner", "bottom_right_corner",
                    "c7088f0f3e6c8088236ef8e1e3e70000"],
    "nesw-resize": ["ne-resize", "sw-resize", "size_bdiag", "fd_double_arrow", "top_right_corner", "bottom_left_corner",
                    "fcf1c3c7cd4491d801f1e1c78f100000"],
    "help": ["question_arrow", "whats_this", "left_ptr_help", "d9ce0ab605698f320427677b458ad60b",
             "5c6cd98b3f3ebcb1f9c7f1c204630408"],
}

# остриё стрелки в сетке 24×24 (точка клика)
TIP = (4.0, 3.0)
HOTSPOT = {"default": TIP, "pointer": TIP, "help": TIP, "progress": TIP}

OUTLINE = 1.0   # ширина чёрной обводки снаружи фигуры, в единицах сетки


def _r(v: float) -> float:
    """Округление, симметричное относительно нуля (банковское: round(-x) == -round(x))."""
    return float(round(v))


@dataclass
class Grid:
    """Перевод единиц сетки 24×24 в пиксели размера size.

    snap=True — привязка к пиксельной сетке (для PNG): координаты округляются
    относительно центра, поэтому симметричные пары остаются симметричными.
    """
    size: int = 24
    snap: bool = False

    @property
    def s(self) -> float:
        return self.size / 24

    def x(self, u: float) -> float:
        v = (u - 12) * self.s
        return self.size / 2 + (_r(v) if self.snap else v)

    def len(self, u: float) -> float:
        v = u * self.s
        return max(1.0, math.floor(v + 0.5)) if self.snap else v

    def pt(self, x: float, y: float) -> str:
        return f"{self.x(x):g},{self.x(y):g}"


@dataclass
class Shape:
    """Фигура: заливка (rect/poly/path) или линия (stroke)."""
    kind: str                 # rect | poly | path | circle
    geo: tuple
    color: str
    stroke: float = 0.0       # >0 — линия этой ширины (в единицах сетки) вместо заливки
    cap: str = "butt"
    outline: bool = True
    opacity: float = 1.0


@dataclass
class Cursor:
    shapes: list[Shape] = field(default_factory=list)
    rotate: float = 0.0       # поворот всей фигуры вокруг центра

    def add(self, *a, **kw) -> "Cursor":
        self.shapes.append(Shape(*a, **kw))
        return self


def _geom(sh: Shape, g: Grid) -> str:
    if sh.kind == "rect":
        x0, y0, x1, y1 = sh.geo
        X0, Y0, X1, Y1 = g.x(x0), g.x(y0), g.x(x1), g.x(y1)
        return f'<rect x="{X0:g}" y="{Y0:g}" width="{X1 - X0:g}" height="{Y1 - Y0:g}"'
    if sh.kind == "poly":
        return '<polygon points="' + " ".join(g.pt(x, y) for x, y in sh.geo) + '"'
    if sh.kind == "circle":
        cx, cy, r = sh.geo
        return f'<circle cx="{g.x(cx):g}" cy="{g.x(cy):g}" r="{g.len(r):g}"'
    if sh.kind == "path":
        # дуги и наклонные линии не привязываем к сетке: концы дуги должны лежать на окружности
        return f'<path d="{_scale_path(sh.geo[0], Grid(g.size, False))}"'
    raise ValueError(sh.kind)


def _scale_path(d: str, g: Grid) -> str:
    """Пути пишутся в абсолютных командах M/L/A/Z — переводим координаты в пиксели."""
    out, tok = [], d.replace(",", " ").split()
    i, cmd = 0, ""
    while i < len(tok):
        t = tok[i]
        if t.isalpha():
            cmd = t
            out.append(t)
            i += 1
            continue
        if cmd in ("M", "L"):
            out.append(f"{g.x(float(tok[i])):g} {g.x(float(tok[i + 1])):g}")
            i += 2
        elif cmd == "A":          # rx ry rot large sweep x y
            rx, ry = g.len(float(tok[i])), g.len(float(tok[i + 1]))
            out.append(f"{rx:g} {ry:g} {tok[i + 2]} {tok[i + 3]} {tok[i + 4]} "
                       f"{g.x(float(tok[i + 5])):g} {g.x(float(tok[i + 6])):g}")
            i += 7
        else:
            raise ValueError(f"команда пути {cmd!r} не поддерживается")
    return " ".join(out)


def to_svg(cur: Cursor, size: int = 24, snap: bool = False) -> str:
    g = Grid(size, snap)
    o = g.len(OUTLINE) if snap else OUTLINE * g.s
    under, over = [], []
    for sh in cur.shapes:
        geo = _geom(sh, g)
        op = f' opacity="{sh.opacity:g}"' if sh.opacity < 1 else ""
        if sh.stroke:
            w = g.len(sh.stroke) if snap else sh.stroke * g.s
            line = f'fill="none" stroke-linecap="{sh.cap}" stroke-linejoin="round"'
            if sh.outline:
                under.append(f'{geo} {line} stroke="#000" stroke-width="{w + 2 * o:g}"/>')
            over.append(f'{geo} {line} stroke="{sh.color}" stroke-width="{w:g}"{op}/>')
        else:
            if sh.outline:
                under.append(f'{geo} fill="#000" stroke="#000" stroke-width="{2 * o:g}" stroke-linejoin="round"/>')
            over.append(f'{geo} fill="{sh.color}"{op}/>')
    body = "\n  ".join(under + over)
    if cur.rotate:
        c = size / 2
        body = f'<g transform="rotate({cur.rotate:g} {c:g} {c:g})">\n  {body}\n</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
            f'viewBox="0 0 {size} {size}" shape-rendering="geometricPrecision">\n  {body}\n</svg>\n')


# ── рисунки ─────────────────────────────────────────────────────
def _arrow_pts() -> list[tuple[float, float]]:
    tx, ty = TIP
    pts = [(0, 0), (0, 15.5), (4.1, 11.9), (6.9, 18.3), (9.6, 17.1), (6.9, 10.9), (12.3, 10.9)]
    return [(tx + x, ty + y) for x, y in pts]


def _spinner(cur: Cursor, cx: float, cy: float, r: float, w: float, frame: int, p: Palette, n: int = 8) -> None:
    """Кольцо из n сегментов; «голова» из трёх сегментов движется по кадрам."""
    step = 360 / n
    gap = step * 0.22
    for i in range(n):
        a0, a1 = math.radians(i * step - 90 + gap / 2), math.radians((i + 1) * step - 90 - gap / 2)
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        k = (frame - i) % n          # 0 — ведущий сегмент, 1–2 — шлейф
        col, op = (p["ink"], 1.0) if k == 0 else (p["accent"], 1.0) if k < 3 else (p["ink"], 0.4)
        cur.add("path", (f"M {x0:.4f} {y0:.4f} A {r:g} {r:g} 0 0 1 {x1:.4f} {y1:.4f}",), col,
                stroke=w, opacity=op)


QUESTION = (
    ".###.",
    "#...#",
    "....#",
    "...#.",
    "..#..",
    ".....",
    "..#..",
)


def _bitmap(cur: Cursor, rows: tuple[str, ...], x0: float, y0: float, color: str) -> None:
    """Пиксельный знак: горизонтальные серии «#» склеиваются в прямоугольники."""
    for j, row in enumerate(rows):
        i = 0
        while i < len(row):
            if row[i] != "#":
                i += 1
                continue
            k = i
            while k < len(row) and row[k] == "#":
                k += 1
            cur.add("rect", (x0 + i, y0 + j, x0 + k, y0 + j + 1), color)
            i = k


def _double_arrow(color: str) -> Cursor:
    """Вертикальная двусторонняя стрелка; диагональные — она же, повёрнутая вокруг центра."""
    c = Cursor()
    c.add("rect", (11, 7.5, 13, 16.5), color)
    c.add("poly", ((12, 2.5), (16, 7.5), (8, 7.5)), color)
    c.add("poly", ((12, 21.5), (8, 16.5), (16, 16.5)), color)
    return c


def design(name: str, p: Palette, frame: int = 0) -> Cursor:
    ink, acc, cor = p["ink"], p["accent"], p["coral"]
    c = Cursor()
    if name in ("default", "pointer", "help", "progress"):
        c.add("poly", tuple(_arrow_pts()), acc if name == "pointer" else ink)
        if name == "default":
            tx, ty = TIP
            c.add("rect", (tx, ty + 18.4, tx + 3, ty + 19.8), acc)          # фирменная «метка» под стрелкой
        if name == "help":
            _bitmap(c, QUESTION, 16, 15, acc)            # пиксельный «?» в духе ретро-шрифта
        if name == "progress":
            _spinner(c, 18.3, 18.3, 3.4, 1.7, frame, p)
        return c
    if name == "crosshair":
        for a, b in ((2, 8.5), (15.5, 22)):
            c.add("rect", (11, a, 13, b), ink)          # вертикальные плечи
            c.add("rect", (a, 11, b, 13), ink)          # горизонтальные плечи
        c.add("rect", (10.25, 10.25, 13.75, 13.75), acc)  # центральный квадрат
        return c
    if name == "text":
        c.add("rect", (11.25, 4.5, 12.75, 19.5), ink)
        c.add("rect", (8.5, 3.25, 15.5, 5.25), ink)
        c.add("rect", (8.5, 18.75, 15.5, 20.75), ink)
        return c
    if name in ("move", "grab"):
        col = ink if name == "move" else acc
        c.add("rect", (11, 6, 13, 18), col)
        c.add("rect", (6, 11, 18, 13), col)
        for tip, base_a, base_b in (((12, 1.5), (15.5, 6), (8.5, 6)), ((12, 22.5), (8.5, 18), (15.5, 18)),
                                    ((1.5, 12), (6, 8.5), (6, 15.5)), ((22.5, 12), (18, 15.5), (18, 8.5))):
            c.add("poly", (tip, base_a, base_b), col)
        c.add("rect", (10.25, 10.25, 13.75, 13.75), acc if name == "move" else ink, outline=False)
        return c
    if name == "ns-resize":
        return _double_arrow(ink)
    if name == "ew-resize":
        d = _double_arrow(ink)
        d.rotate = 90
        return d
    if name == "nwse-resize":
        d = _double_arrow(ink)
        d.rotate = -45
        return d
    if name == "nesw-resize":
        d = _double_arrow(ink)
        d.rotate = 45
        return d
    if name == "not-allowed":
        c.add("circle", (12, 12, 7.4), cor, stroke=2.2)
        k = 7.4 * math.cos(math.radians(45))
        c.add("path", (f"M {12 - k:.4f} {12 + k:.4f} L {12 + k:.4f} {12 - k:.4f}",), cor, stroke=2.2)
        return c
    if name == "wait":
        _spinner(c, 12, 12, 7.2, 2.6, frame, p)
        return c
    return design("default", p)


def hotspot(name: str) -> tuple[float, float]:
    """Точка клика в единицах сетки."""
    return HOTSPOT.get(name, (12.0, 12.0))


def frames(name: str) -> int:
    return FRAMES if name in ("wait", "progress") else 1


# ── сборка тем ──────────────────────────────────────────────────
def _rasterize(svg: str, png: Path, size: int) -> None:
    src = png.with_suffix(".svg")
    src.write_text(svg)
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(png), str(src)], check=True)


_OPS = {
    "lr": lambda a: a[:, ::-1],
    "tb": lambda a: a[::-1, :],
    "rot": lambda a: a[::-1, ::-1],
    "diag": lambda a: a.transpose(1, 0, 2),
    "adiag": lambda a: a[::-1, ::-1].transpose(1, 0, 2),
}


def symmetrize(img: "Image.Image", ops: tuple[str, ...]) -> "Image.Image":
    """Усреднить картинку по группе симметрий (в premultiplied-альфе).

    Геометрия и так симметрична; растеризатор librsvg даёт на наклонных краях
    расхождение сглаживания до 1/15 пикселя — после усреднения PNG симметричны точно.
    """
    import numpy as np
    from PIL import Image

    ops = tuple(o for o in ops if o in _OPS)
    if not ops:
        return img
    a = np.asarray(img.convert("RGBA")).astype(np.float64) / 255
    a[..., :3] *= a[..., 3:4]
    orbit = {a.tobytes(): a}
    frontier = [a]
    while frontier:
        nxt = []
        for x in frontier:
            for o in ops:
                y = np.ascontiguousarray(_OPS[o](x))
                key = y.tobytes()
                if key not in orbit:
                    orbit[key] = y
                    nxt.append(y)
        frontier = nxt
    m = sum(orbit.values()) / len(orbit)
    alpha = m[..., 3:4]
    rgb = np.where(alpha > 1e-6, m[..., :3] / np.maximum(alpha, 1e-6), 0)
    out = np.concatenate([rgb, alpha], axis=2)
    return Image.fromarray(np.clip(np.rint(out * 255), 0, 255).astype(np.uint8), "RGBA")


def render(name: str, size: int, p: Palette, frame: int = 0, work: Path | None = None) -> "Image.Image":
    """Готовый кадр курсора для XCursor: SVG с привязкой к сетке → PNG → точная симметрия."""
    from PIL import Image

    work = work or paths.CACHE_DIR / "cursor-build"
    work.mkdir(parents=True, exist_ok=True)
    png = work / f"r-{name}-{size}-{frame}.png"
    _rasterize(to_svg(design(name, p, frame), size, snap=True), png, size)
    img = Image.open(png).convert("RGBA")
    img.load()
    return symmetrize(img, SYMMETRY.get(name, ()))


def build_xcursor(p: Palette, dest: Path, work: Path) -> bool:
    if not (shutil.which("xcursorgen") and shutil.which("rsvg-convert")):
        return False
    cursors = dest / "cursors"
    shutil.rmtree(cursors, ignore_errors=True)
    cursors.mkdir(parents=True)
    for name in ALIASES:
        cfg = []
        hx, hy = hotspot(name)
        for size in XCURSOR_SIZES:
            g = Grid(size, snap=True)
            for fr in range(frames(name)):
                png = work / f"x-{name}-{size}-{fr}.png"
                render(name, size, p, fr, work).save(png)
                X, Y = int(min(size - 1, g.x(hx))), int(min(size - 1, g.x(hy)))
                cfg.append(f"{size} {X} {Y} {png}" + (f" {FRAME_MS}" if frames(name) > 1 else ""))
        (work / f"{name}.cfg").write_text("\n".join(cfg) + "\n")
        subprocess.run(["xcursorgen", str(work / f"{name}.cfg"), str(cursors / name)], check=True)
        for alias in ALIASES[name]:
            if not (cursors / alias).exists():
                (cursors / alias).symlink_to(name)
    return True


def build_hyprcursor(p: Palette, dest: Path, work: Path) -> bool:
    if not shutil.which("hyprcursor-util"):
        return False
    src = work / "hypr-src"
    shapes = src / "hyprcursors"
    shapes.mkdir(parents=True)
    (src / "manifest.hl").write_text(
        "name = HYPERINA\ndescription = HYPERINA cursors\nversion = 1.0\ncursors_directory = hyprcursors\n")
    for name in ALIASES:
        d = shapes / name
        d.mkdir()
        hx, hy = hotspot(name)
        meta = [
            "resize_algorithm = bilinear",
            f"hotspot_x = {hx / 24:.4f}",
            f"hotspot_y = {hy / 24:.4f}",
            "nominal_size = 1.0",
            f"define_override = {name}",
            *[f"define_override = {a}" for a in ALIASES[name]],
        ]
        for fr in range(frames(name)):
            fn = f"{name}-{fr}.svg"
            (d / fn).write_text(to_svg(design(name, p, fr), 24))
            meta.append(f"define_size = 0, {fn}" + (f", {FRAME_MS}" if frames(name) > 1 else ""))
        (d / "meta.hl").write_text("\n".join(meta) + "\n")
    out = work / "hypr-out"
    out.mkdir()                       # hyprcursor-util создаёт только theme_* внутри
    subprocess.run(["hyprcursor-util", "--create", str(src), "--output", str(out)], check=True,
                   stdout=subprocess.DEVNULL)
    built = next(out.glob("theme_*"), None)
    if not built:
        return False
    shutil.rmtree(dest / "hyprcursors", ignore_errors=True)
    shutil.copytree(built / "hyprcursors", dest / "hyprcursors")
    shutil.copy2(built / "manifest.hl", dest / "manifest.hl")
    return True


def build_cursor_theme(p: Palette, dest: Path) -> Path | None:
    """Собрать обе темы курсора в dest (каталог темы HYPERINA)."""
    work = paths.CACHE_DIR / "cursor-build"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    dest.mkdir(parents=True, exist_ok=True)
    ok_x = build_xcursor(p, dest, work)
    ok_h = build_hyprcursor(p, dest, work)
    if not (dest / "index.theme").exists():
        (dest / "index.theme").write_text("[Icon Theme]\nName=HYPERINA\nComment=HYPERINA\nInherits=Adwaita\n")
    shutil.rmtree(work, ignore_errors=True)
    return dest if (ok_x or ok_h) else None
