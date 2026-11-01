#!/usr/bin/env python3
"""Аудит симметрии и центровки иконок, монограмм и курсоров HAOTICA.

  python3 tools/audit_icons.py                 # проверка, код возврата 1 при ошибках
  python3 tools/audit_icons.py --sheet out/    # плюс контактные листы с осями для просмотра

Что проверяется:
  • пиктограммы 24×24: видимые границы (с учётом толщины линий) по центру (12, 12);
  • составные пиктограммы: содержимое по центру своей рамки и не прижато к краям
    (папки, геймпад, экраны, пузыри чатов…);
  • монограммы плиток: контур буквы по центру плитки 64×64;
  • курсоры: зеркальная/поворотная симметрия по таблице cursors.SYMMETRY на всех размерах.
Растр — через rsvg-convert (как в системе); без него — только геометрия путей.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "core"))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from haotica import cursors, icons, palette  # noqa: E402

TOL = 0.30          # допуск центровки, единиц сетки 24
MIN_GAP = 1.0       # минимальный зазор содержимого до внутреннего края рамки
STROKE = 1.6
PX = 20             # пикселей на единицу сетки при растеризации пиктограмм

# рамка (x0, y0, x1, y1) — область, по центру которой стоит содержимое (элементы после первого)
FOLDER_BODY = (3, 8, 21, 18)
CONTENT = {
    **{g: FOLDER_BODY for g in icons.GLYPHS if g.startswith("folder-")},
    "game": None,                       # рамка — сам корпус (границы первого элемента)
    "play": (3, 5, 21, 19), "terminal": (3, 5, 21, 19),
    "camera": (4, 7, 20, 19), "chat": (4, 4.08, 20, 15.08), "discord": (4, 5.1, 20, 15.1),
    "calc": (5, 3, 19, 21), "disk": (4, 4, 20, 20), "record": (3.5, 3.5, 20.5, 20.5),
}
# только «внутри и не прижато», без требования центра (крестовина и кнопки геймпада стоят в «ручках»)
CONTAIN_ONLY = {"game"}
# оптическая поправка: треугольник «play» визуально по центру, когда его рамка чуть правее
OPTICAL = {"play": (0.375, 0.0), "folder-video": (0.375, 0.0)}
# пары элементов, симметричных друг другу относительно центра корпуса (крестовина ↔ кнопки)
MIRROR_PAIRS = {"game": (1, 2)}


class Raster:
    def __init__(self) -> None:
        self.tool = shutil.which("rsvg-convert")
        self.tmp = Path(tempfile.mkdtemp(prefix="hy-audit-"))
        self.n = 0

    def alpha(self, svg: str, w: int, h: int | None = None) -> np.ndarray | None:
        if not self.tool:
            return None
        self.n += 1
        src, png = self.tmp / f"{self.n}.svg", self.tmp / f"{self.n}.png"
        src.write_text(svg)
        subprocess.run([self.tool, "-w", str(w), "-h", str(h or w), "-o", str(png), str(src)], check=True)
        return np.asarray(Image.open(png).convert("RGBA"))[..., 3].astype(np.float32) / 255

    def rgba(self, svg: str, w: int) -> Image.Image | None:
        if not self.tool:
            return None
        self.n += 1
        src, png = self.tmp / f"{self.n}.svg", self.tmp / f"{self.n}.png"
        src.write_text(svg)
        subprocess.run([self.tool, "-w", str(w), "-h", str(w), "-o", str(png), str(src)], check=True)
        return Image.open(png).convert("RGBA")


def elements(body: str) -> list[str]:
    return re.findall(r"<\w+[^>]*/>", body)


def glyph_doc(parts: list[str], px: int = PX) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="{24 * px}" height="{24 * px}" '
            f'fill="none" stroke="#fff" stroke-width="{STROKE}" stroke-linecap="square" stroke-linejoin="miter">'
            + "".join(parts) + "</svg>")


def vis_box(a: np.ndarray, per_unit: float, thr: float = 0.25) -> tuple[float, float, float, float] | None:
    ys, xs = np.nonzero(a > thr)
    if not len(xs):
        return None
    return xs.min() / per_unit, ys.min() / per_unit, (xs.max() + 1) / per_unit, (ys.max() + 1) / per_unit


def geo_box(parts: list[str]) -> tuple[float, float, float, float] | None:
    """Границы геометрии (без толщины линии) через fontTools — запасной путь без растра."""
    try:
        from fontTools.pens.boundsPen import BoundsPen
        from fontTools.svgLib.path import parse_path
    except ImportError:
        return None
    pen = BoundsPen(None)
    parse_path(icons.to_path_data("".join(parts)), pen)
    return pen.bounds


def center(b) -> tuple[float, float]:
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def box(r: Raster, parts: list[str]):
    a = r.alpha(glyph_doc(parts), 24 * PX)
    if a is not None:
        return vis_box(a, PX)
    b = geo_box(parts)
    return b and (b[0] - STROKE / 2, b[1] - STROKE / 2, b[2] + STROKE / 2, b[3] + STROKE / 2)


def audit_glyphs(r: Raster) -> list[str]:
    bad = []
    allg = {**icons.GLYPHS, **icons.GLYPHS_UI}
    for name, body in allg.items():
        parts = elements(body)
        b = box(r, parts)
        if not b:
            bad.append(f"glyph {name}: пусто")
            continue
        cx, cy = center(b)
        if abs(cx - 12) > TOL or abs(cy - 12) > TOL:
            bad.append(f"glyph {name}: центр ({cx:.2f}, {cy:.2f}), нужно (12, 12) ±{TOL}; "
                       f"исправление: icons.transform_body(body, 1, {12 - cx:.2f}, {12 - cy:.2f})")
        if b[0] < 0.5 or b[1] < 0.5 or b[2] > 23.5 or b[3] > 23.5:
            bad.append(f"glyph {name}: выходит к краю сетки {tuple(round(v, 2) for v in b)}")
        if name in CONTENT and len(parts) > 1:
            frame = CONTENT[name]
            if frame is None:     # рамка — геометрия первого элемента, внутренний край линии
                fb = box(r, parts[:1])
                frame = (fb[0] + STROKE / 2, fb[1] + STROKE / 2, fb[2] - STROKE / 2, fb[3] - STROKE / 2)
            cb = box(r, parts[1:])
            fx, fy = center(frame)
            ox, oy = OPTICAL.get(name, (0.0, 0.0))
            fx, fy = fx + ox, fy + oy
            ccx, ccy = center(cb)
            if name not in CONTAIN_ONLY and (abs(ccx - fx) > TOL or abs(ccy - fy) > TOL):
                bad.append(f"glyph {name}: содержимое в ({ccx:.2f}, {ccy:.2f}), центр рамки ({fx:.2f}, {fy:.2f})")
            inner = (frame[0] + STROKE / 2, frame[1] + STROKE / 2, frame[2] - STROKE / 2, frame[3] - STROKE / 2)
            gaps = (cb[0] - inner[0], cb[1] - inner[1], inner[2] - cb[2], inner[3] - cb[3])
            if min(gaps) < MIN_GAP:
                side = ("слева", "сверху", "справа", "снизу")[int(np.argmin(gaps))]
                bad.append(f"glyph {name}: содержимое прижато {side} (зазор {min(gaps):.2f} < {MIN_GAP})")
        if name in MIRROR_PAIRS:
            i, j = MIRROR_PAIRS[name]
            bi, bj = box(r, [parts[i]]), box(r, [parts[j]])
            fb = box(r, parts[:1])
            mid = center(fb)[0]
            ci, cj = center(bi), center(bj)
            if abs((ci[0] + cj[0]) / 2 - mid) > TOL or abs(ci[1] - cj[1]) > TOL:
                bad.append(f"glyph {name}: элементы {i} и {j} несимметричны: {ci} / {cj}, ось {mid:.2f}")
    return bad


def audit_monograms(r: Raster) -> list[str]:
    bad = []
    seen = set()
    for glyph, _cat in icons.APP_ICONS.values():
        if not glyph.startswith("«") or glyph in seen:
            continue
        seen.add(glyph)
        text = glyph.strip("«»")
        size = 26 if len(text) <= 2 else 19
        d = icons.monogram_path(text, size)
        if not d:
            bad.append(f"monogram {text}: нет шрифта IBM Plex Mono — монограммы рисуются запасным <text>")
            continue
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="640" height="640">'
               f'<path d="{d}" fill="#fff"/></svg>')
        a = r.alpha(svg, 640)
        b = vis_box(a, 10) if a is not None else None
        if b is None:
            continue
        cx, cy = center(b)
        if abs(cx - 32) > TOL or abs(cy - 32) > TOL:
            bad.append(f"monogram {text}: центр ({cx:.2f}, {cy:.2f}), нужно (32, 32)")
    # пиктограмма внутри плитки: центр 24-сетки должен попасть в центр плитки
    m = re.search(r"translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)", icons.tile_svg(palette.build("MIX"), "folder", "system"))
    if m:
        tx, ty, sc = map(float, m.groups())
        if abs(tx + 12 * sc - 32) > 0.01 or abs(ty + 12 * sc - 32) > 0.01:
            bad.append(f"tile: пиктограмма смещена: центр ({tx + 12 * sc:.2f}, {ty + 12 * sc:.2f})")
    return bad


def _sym_ops(a: np.ndarray) -> dict[str, np.ndarray]:
    return {"lr": a[:, ::-1], "tb": a[::-1, :], "rot": a[::-1, ::-1], "diag": a.T, "adiag": a[::-1, ::-1].T}


def audit_cursors(r: Raster, p) -> list[str]:
    """PNG (XCursor) проверяются такими, какими попадут в систему — после cursors.render();
    SVG для hyprcursor — с допуском на зерно сглаживания librsvg (до 1/8 пикселя)."""
    bad = []
    if not r.tool:
        return ["cursors: нет rsvg-convert — симметрия курсоров не проверена"]
    work = r.tmp / "cur"
    for name, ops in cursors.SYMMETRY.items():
        for size, snap in ((24, True), (32, True), (36, True), (40, True), (48, True), (64, True), (96, True), (24, False)):
            if snap:
                a = np.asarray(cursors.render(name, size, p, 0, work))[..., 3].astype(np.float32) / 255
                px, tol = size, 0.004
            else:
                px, tol = 240, 0.125
                a = r.alpha(cursors.to_svg(cursors.design(name, p, 0), size, snap=False), px)
            tag = f"{name}@{size}{'' if snap else '/svg'}"
            for op in ops:
                if op == "ring":
                    b = vis_box(a, px / 24, 0.05)
                    cx, cy = center(b)
                    if abs(cx - 12) > 0.05 or abs(cy - 12) > 0.05:
                        bad.append(f"cursor {tag}: кольцо смещено ({cx:.2f}, {cy:.2f})")
                    continue
                diff = np.abs(a - _sym_ops(a)[op])
                if diff.max() > tol:
                    ys, xs = np.unravel_index(diff.argmax(), diff.shape)
                    bad.append(f"cursor {tag}: нарушена симметрия {op}: Δ={diff.max():.3f} в ({xs}, {ys})")
    return bad


def contact_sheets(r: Raster, out: Path, p) -> list[Path]:
    """Увеличенные листы с осями и центрами — для глаз."""
    out.mkdir(parents=True, exist_ok=True)
    made = []
    cell, pad = 168, 26
    names = list({**icons.GLYPHS, **icons.GLYPHS_UI})
    cols = 10
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + pad)), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for k, name in enumerate(names):
        body = icons.GLYPHS.get(name) or icons.GLYPHS_UI[name]
        im = r.rgba(glyph_doc(elements(body), 6).replace('stroke="#fff"', 'stroke="#E8E6DF"'), 144)
        x, y = (k % cols) * cell + 12, (k // cols) * (cell + pad) + 12
        d.rectangle((x, y, x + 143, y + 143), outline=(40, 40, 40))
        d.line((x + 72, y, x + 72, y + 143), fill=(90, 30, 30))
        d.line((x, y + 72, x + 143, y + 72), fill=(90, 30, 30))
        sheet.paste(im, (x, y), im)
        d.text((x, y + 148), name, fill=(150, 150, 150))
    fn = out / "glyphs.png"
    sheet.save(fn)
    made.append(fn)
    # курсоры: увеличение ×8 без сглаживания, ось центра
    cur_names = list(cursors.ALIASES)
    sheet = Image.new("RGB", (len(cur_names) * 210, 2 * 230), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    for k, name in enumerate(cur_names):
        for row, size in enumerate((24, 48)):
            im = cursors.render(name, size, p, 0, r.tmp / "cur")
            big = im.resize((192, 192), Image.NEAREST)
            x, y = k * 210 + 9, row * 230 + 9
            bg = Image.new("RGBA", (192, 192), (70, 70, 70, 255))
            bg.alpha_composite(big)
            sheet.paste(bg.convert("RGB"), (x, y))
            d.line((x + 96, y, x + 96, y + 191), fill=(255, 60, 60))
            d.line((x, y + 96, x + 191, y + 96), fill=(255, 60, 60))
            hx, hy = cursors.hotspot(name)
            g = cursors.Grid(size, True)
            sx, sy = x + int(g.x(hx)) * 192 // size, y + int(g.x(hy)) * 192 // size
            d.rectangle((sx, sy, sx + 192 // size - 1, sy + 192 // size - 1), outline=(60, 220, 255))
            d.text((x, y + 196), f"{name} {size}", fill=(200, 200, 200))
    fn = out / "cursors.png"
    sheet.save(fn)
    made.append(fn)
    # плитки приложений
    apps = [a for a in icons.APP_ICONS if not a.startswith(("telegram", "steam-", "spotify-", "vscode", "visual"))][:48]
    cols = 12
    sheet = Image.new("RGB", (cols * 120, ((len(apps) + cols - 1) // cols) * 140), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for k, app in enumerate(apps):
        glyph, cat = icons.APP_ICONS[app]
        im = r.rgba(icons.tile_svg(p, glyph, cat), 96)
        x, y = (k % cols) * 120 + 12, (k // cols) * 140 + 8
        sheet.paste(im, (x, y), im)
        d.line((x + 48, y + 30, x + 48, y + 66), fill=(120, 30, 30))
        d.line((x + 30, y + 48, x + 66, y + 48), fill=(120, 30, 30))
        d.text((x, y + 104), app.replace("haotica-", "")[:16], fill=(150, 150, 150))
    fn = out / "tiles.png"
    sheet.save(fn)
    made.append(fn)
    # монограммы веб-приложений, крупно, с осями через центр плитки
    mons = [(a, g, c) for a, (g, c) in icons.APP_ICONS.items() if g.startswith("«")]
    sheet = Image.new("RGB", (len(mons) * 200, 230), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for k, (app, glyph, cat) in enumerate(mons):
        im = r.rgba(icons.tile_svg(p, glyph, cat), 192)
        x = k * 200 + 4
        sheet.paste(im, (x, 4), im)
        d.line((x + 96, 4, x + 96, 196), fill=(255, 40, 40))
        d.line((x, 100, x + 192, 100), fill=(255, 40, 40))
        d.text((x, 204), app.replace("haotica-web-", ""), fill=(160, 160, 160))
    fn = out / "monograms.png"
    sheet.save(fn)
    made.append(fn)
    return made


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", type=Path, help="каталог для контактных листов")
    ap.add_argument("--profile", default="MIX")
    a = ap.parse_args()
    p = palette.build(a.profile)
    r = Raster()
    problems = audit_glyphs(r) + audit_monograms(r) + audit_cursors(r, p)
    if a.sheet and r.tool:
        for f in contact_sheets(r, a.sheet, p):
            print(f"лист: {f}")
    shutil.rmtree(r.tmp, ignore_errors=True)
    if not r.tool:
        print("! rsvg-convert не найден: проверена только геометрия")
    for line in problems:
        print("✗", line)
    print(f"{'OK' if not problems else 'ОШИБОК: ' + str(len(problems))} · пиктограмм {len(icons.GLYPHS) + len(icons.GLYPHS_UI)}, "
          f"курсоров {len(cursors.SYMMETRY)} с симметрией")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
