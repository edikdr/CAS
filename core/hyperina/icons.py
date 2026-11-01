"""Тема иконок HYPERINA: линейные пиктограммы в рамках со скосами, цвет — по категории.

Генерируется из палитры. Всё, чего нет в наборе, берётся из Papirus-Dark.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from .palette import Palette

# Пиктограммы в сетке 24×24, линии толщиной 1.6.
# Правила: рамка каждой пиктограммы центрирована по (12, 12) с точностью ±0.25 (проверяет tools/audit_icons.py),
# симметричные фигуры зеркальны относительно x = 12, внутренние детали стоят по центру своего контура
# и отступают от него минимум на толщину линии.
GLYPHS: dict[str, str] = {
    "terminal": '<rect x="3" y="5" width="18" height="14"/><path d="M7 9.5l3 2.5-3 2.5M12 14.5h5"/>',
    "folder": '<path d="M3 6h6l2 2h10v10H3z"/>',
    "home": '<path d="M4 11l8-7 8 7v9H4zM10 20v-5h4v5"/>',
    "settings": '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    "haotica": '<path d="M12 3l7 9-7 9-7-9z"/><path d="M12 8.5l2.7 3.5-2.7 3.5-2.7-3.5z"/>',
    "globe": '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.8" ry="8.5"/><path d="M3.5 12h17"/>',
    "chat": '<path d="M4 4.08h16v11H9l-5 4z"/><path d="M8 8.08h8M9.5 11.08h5"/>',
    "plane": '<path d="M3 11l18-7-4 16-6-5-3 4v-5l9-6"/>',
    # корпус симметричен относительно x=12; крестовина и кнопки — в центрах ручек, с запасом от контура
    "game": '<path d="M6.5 6.75h11a4.5 4.5 0 0 1 4.5 4.5v2.5a3.5 3.5 0 0 1-6 2.5l-1.2-1.4h-5.6l-1.2 1.4a3.5 3.5 0 0 1-6-2.5v-2.5a4.5 4.5 0 0 1 4.5-4.5z"/><path d="M7 9.95v3.6M5.2 11.75h3.6"/><path d="M16.1 12.65h.01M17.9 10.85h.01"/>',
    "discord": '<path d="M4 5.1h16v10h-9l-4 3v-3H4z"/><path d="M9.2 10.1h0.01M14.8 10.1h0.01"/>',
    "music": '<path d="M5 9.25c5-2 10-2 14 0M6 12.75c4-1.5 8-1.5 12 0M7.5 16.25c3-1 6-1 9 0"/>',
    "code": '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>',
    "crystal": '<path d="M12 3l6 6-2 10-4 2-4-2-2-10z"/><path d="M12 3v18M6 9l6 3 6-3"/>',
    "key": '<circle cx="7.5" cy="12" r="4"/><path d="M11.5 12h9M17.5 12v3M14.5 12v2"/>',
    "download": '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    "record": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
    "play": '<rect x="3" y="5" width="18" height="14"/><path d="M9.5 9l5 3-5 3z"/>',
    "doc": '<path d="M5.5 3h9l4 4v14h-13zM14.5 3v4h4M8.5 10h7M8.5 13h7M8.5 16h7"/>',
    "calc": '<rect x="5" y="3" width="14" height="18"/><path d="M8 6.5h8M8 10.5h.01M12 10.5h.01M16 10.5h.01M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01M16 17.5h.01"/>',
    "calendar": '<rect x="4" y="5.5" width="16" height="15"/><path d="M4 9.5h16M8 3.5v4M16 3.5v4M8 13.5h3M13 13.5h3M8 17h3M13 17h3"/>',
    "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
    "notes": '<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h6"/>',
    "weather": '<path d="M6.74 17.8h10a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.3A3.5 3.5 0 0 0 6.74 17.8z"/>',
    "sysmon": '<rect x="3" y="3.5" width="18" height="13"/><path d="M8 20.5h8M12 16.5v4M7 12.5l3-3 3 2 4-5"/>',
    "camera": '<path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="3.2"/>',
    "clipboard": '<path d="M8 3.5h8v3H8zM8 5H5v15.5h14V5h-3M8 11h8M8 15h8"/>',
    "picker": '<path d="M13.5 4.5l6 6-9 9h-6v-6zM11.5 6.5l6 6"/>',
    "archive": '<path d="M4 4h16v4H4zM5 8v12h14V8M10 12h4"/>',
    "disk": '<rect x="4" y="4" width="16" height="16"/><circle cx="12" cy="12" r="4.2"/><path d="M12 12h.01"/>',
    "image": '<rect x="3" y="5" width="18" height="14"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
    "store": '<path d="M5 8.5h14l-1 12H6zM9 8.5v-2a3 3 0 0 1 6 0v2"/>',
    "radar": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/><path d="M15.5 14.5h.01"/>',
    "cloud": '<path d="M6.74 17.8h10a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.3A3.5 3.5 0 0 0 6.74 17.8z"/><path d="M12 10v5M9.9 13L12 15.1l2.1-2.1"/>',
    "shield": '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    "power": '<path d="M12 4.3v8M7 7.8a7 7 0 1 0 10 0"/>',
    "trash": '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
    "pawn": '<path d="M10 6a2 2 0 1 1 4 0 2 2 0 1 1-4 0M9.5 10h5M10.5 10l-1 7h5l-1-7M7 20h10l-1-3H8z"/>',
    "sparkle": '<path d="M12 4.5l1.667 5.833 5.833 1.667 -5.833 1.667 -1.667 5.833 -1.667 -5.833 -5.833 -1.667 5.833 -1.667z"/>',
    "wifi": '<path d="M3 8.56a13 13 0 0 1 18 0M6 12.06a8.5 8.5 0 0 1 12 0M9 15.56a4 4 0 0 1 6 0"/><path d="M12 19.06h.01"/>',
    # папки: корпус 3..21 × 6..18, внутренняя область 8..18 — содержимое по её центру (12, 13)
    "folder-doc": '<path d="M3 6h6l2 2h10v10H3z"/><path d="M8 11.5h8M9.5 14.5h5"/>',
    "folder-down": '<path d="M3 6h6l2 2h10v10H3z"/><path d="M12 10.83v3.07M10 12.83l2 2 2-2"/>',
    "folder-music": '<path d="M3 6h6l2 2h10v10H3z"/><circle cx="9.6" cy="14.5" r=".8"/><circle cx="14.4" cy="14.5" r=".8"/><path d="M10.4 14.5V10.7H15.2V14.5"/>',
    "folder-image": '<path d="M3 6h6l2 2h10v10H3z"/><path d="M7.2 14.6l3.2-3.2 2.4 2.4 1.6-1.6 2.4 2.4"/>',
    "folder-video": '<path d="M3 6h6l2 2h10v10H3z"/><path d="M10.835 11.65l2.3 1.35-2.3 1.35z"/>',
    "folder-ai": '<path d="M3 6h6l2 2h10v10H3z"/><path d="M12 11.7l1 1.3-1 1.3-1-1.3z"/>',
}

# Пиктограммы интерфейса оболочки (только для QML/веба, не для темы иконок)
GLYPHS_UI: dict[str, str] = {
    "bell": '<path d="M6 15.5v-5a6 6 0 0 1 12 0v5l2 2H4zM10 19.5h4"/>',
    "volume": '<path d="M3.55 9h4l5 -4v14l-5 -4H3.55zM15.55 9a4 4 0 0 1 0 6M18.05 6.5a7.5 7.5 0 0 1 0 11"/>',
    "mute": '<path d="M3 9h4l5-4v14l-5-4H3zM15 9l6 6M21 9l-6 6"/>',
    "mic": '<path d="M9 3h6v10H9zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    "moon": '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5 8 8 0 1 0 19.5 14.6z"/>',
    "bluetooth": '<path d="M7 7l10 10-5 4V3l5 4L7 17"/>',
    "battery": '<path d="M3 7h16v10H3zM21 10v4"/>',
    "bolt": '<path d="M13.28 4.35L6.48 12.85h5.1l-0.85 6.8 6.8 -8.5h-5.1z"/>',
    "lock": '<path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4"/>',
    "unlock": '<path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2"/>',
    "search": '<circle cx="10.1" cy="10.1" r="6.5"/><path d="M15 15L20.1 20.1"/>',
    "close": '<path d="M6 6l12 12M18 6L6 18"/>',
    "check": '<path d="M5 13l4 4 10 -10"/>',
    "chevron": '<path d="M9 6l6 6 -6 6"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "minus": '<path d="M5 12h14"/>',
    "layout": '<path d="M3 5h18v14H3zM12 5v14"/>',
    "night": '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M7 7L5.6 5.6M18.4 18.4L17 17M7 17l-1.4 1.4M18.4 5.6L17 7"/>',
    "dnd": '<circle cx="12" cy="12" r="9"/><path d="M7 12h10"/>',
    "reboot": '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    "logout": '<path d="M10.33 4H5.33v16h5M14.33 8l4 4 -4 4M8.33 12h10"/>',
    "sleep": '<path d="M19 14.6A8 8 0 0 1 8.9 4.5 8 8 0 1 0 19 14.6zM15.5 4h4l-4 4h4"/>',
    "keyboard": '<path d="M3 6h18v12H3zM6 9.5h.01M9 9.5h.01M12 9.5h.01M15 9.5h.01M18 9.5h.01M7 14.5h10"/>',
    "eye": '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
}

# (пиктограмма или монограмма, категория). Монограмма — строка в кавычках «…».
APP_ICONS: dict[str, tuple[str, str]] = {
    # собственные приложения HYPERINA
    "hyperina-terminal": ("terminal", "dev"), "hyperina-files": ("folder", "system"),
    "hyperina-editor": ("code", "dev"), "hyperina-gallery": ("image", "media"), "hyperina-docs": ("doc", "system"),
    "hyperina-player": ("play", "media"), "hyperina-calculator": ("calc", "system"),
    "hyperina-calendar": ("calendar", "system"), "hyperina-clock": ("clock", "system"),
    "hyperina-weather": ("weather", "system"), "hyperina-notes": ("notes", "chat"),
    "hyperina-sysmon": ("sysmon", "system"), "hyperina-screenshot": ("camera", "media"),
    "hyperina-clipboard": ("clipboard", "system"), "hyperina-colorpicker": ("picker", "media"),
    "hyperina-archives": ("archive", "system"), "hyperina-disks": ("disk", "system"),
    "hyperina-store": ("store", "social"), "hyperina-settings": ("settings", "system"),
    "hyperina-haotica": ("haotica", "ai"), "hyperina-netrecon": ("radar", "system"),
    "hyperina-cloud": ("cloud", "ai"), "hyperina-security": ("shield", "finance"),
    "hyperina-power": ("power", "media"), "hyperina-wifi": ("wifi", "system"),
    # программы
    "google-chrome": ("globe", "system"), "org.telegram.desktop": ("plane", "chat"), "telegram": ("plane", "chat"),
    "telegram-desktop": ("plane", "chat"), "discord": ("discord", "chat"), "vesktop": ("discord", "chat"),
    "dev.vencord.Vesktop": ("discord", "chat"), "steam": ("game", "media"), "steam-native": ("game", "media"),
    "net.davidotek.pupgui2": ("game", "media"), "code": ("code", "dev"), "visual-studio-code": ("code", "dev"),
    "vscode": ("code", "dev"), "com.visualstudio.code": ("code", "dev"), "obsidian": ("crystal", "dev"),
    "md.obsidian.Obsidian": ("crystal", "dev"), "spotify": ("music", "media"), "spotify-client": ("music", "media"),
    "com.spotify.Client": ("music", "media"), "org.keepassxc.KeePassXC": ("key", "finance"),
    "keepassxc": ("key", "finance"), "org.qbittorrent.qBittorrent": ("download", "media"),
    "qbittorrent": ("download", "media"), "com.obsproject.Studio": ("record", "media"), "obs": ("record", "media"),
    "mpv": ("play", "media"), "onlyoffice-desktopeditors": ("doc", "dev"), "onlyoffice": ("doc", "dev"),
    "org.gnome.Nautilus": ("folder", "system"), "system-file-manager": ("folder", "system"),
    "utilities-terminal": ("terminal", "dev"), "preferences-system": ("settings", "system"),
    "accessories-calculator": ("calc", "system"), "office-calendar": ("calendar", "system"),
    # веб-приложения
    "hyperina-web-chatgpt": ("«GPT»", "ai"), "hyperina-web-gemini": ("sparkle", "ai"),
    "hyperina-web-grok": ("«GRK»", "ai"), "hyperina-web-claude": ("«CL»", "ai"),
    "hyperina-web-elevenlabs": ("«11»", "ai"), "hyperina-web-whatsapp": ("chat", "chat"),
    "hyperina-web-reddit": ("«r/»", "social"), "hyperina-web-x": ("«X»", "social"),
    "hyperina-web-pinterest": ("«P»", "social"), "hyperina-web-chess": ("pawn", "media"),
    "hyperina-web-github": ("«GH»", "dev"), "hyperina-web-sparkasse": ("«S»", "finance"),
}

PLACE_ICONS: dict[str, str] = {
    "folder": "folder", "inode-directory": "folder", "folder-documents": "folder-doc", "folder-download": "folder-down",
    "folder-music": "folder-music", "folder-pictures": "folder-image", "folder-videos": "folder-video",
    "folder-desktop": "folder", "folder-templates": "folder-doc", "folder-publicshare": "folder",
    "user-home": "home", "user-desktop": "folder", "user-trash": "trash", "user-trash-full": "trash",
    "folder-hyperina-models": "folder-ai",
}


MONO_FONT_CANDIDATES = [
    "/usr/share/fonts/TTF/IBMPlexMono-SemiBold.ttf",
    "/usr/share/fonts/truetype/ibm-plex/IBMPlexMono-SemiBold.ttf",
    "/usr/share/fonts/TTF/JetBrainsMono-Bold.ttf",
]


def monogram_path(text: str, size: float, cx: float = 32, cy: float = 32) -> str | None:
    """Монограмма как контур шрифта, отцентрованная по реальным границам знаков (не по базовой линии)."""
    try:
        from fontTools.pens.boundsPen import BoundsPen
        from fontTools.pens.svgPathPen import SVGPathPen
        from fontTools.pens.transformPen import TransformPen
        from fontTools.ttLib import TTFont
    except ImportError:
        return None
    path = next((f for f in MONO_FONT_CANDIDATES if Path(f).exists()), None)
    if not path:
        return None
    font = TTFont(path)
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    # первый проход — границы, второй — контур со сдвигом к центру
    x, parts = 0.0, []
    bounds = [1e9, 1e9, -1e9, -1e9]
    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None:
            continue
        bp = BoundsPen(gs)
        gs[gname].draw(bp)
        if bp.bounds:
            b = bp.bounds
            bounds = [min(bounds[0], x + b[0]), min(bounds[1], b[1]), max(bounds[2], x + b[2]), max(bounds[3], b[3])]
        parts.append((gname, x))
        x += gs[gname].width + 40
    if bounds[0] > bounds[2]:
        return None
    mx, my = (bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2
    pen = SVGPathPen(gs)
    for gname, ox in parts:
        # шрифт: y вверх → SVG: y вниз
        tp = TransformPen(pen, (scale, 0, 0, -scale, cx + (ox - mx) * scale, cy + my * scale))
        gs[gname].draw(tp)
    return pen.getCommands()


def tile_svg(p: Palette, glyph: str, cat: str, tile: bool = True) -> str:
    color = p.category_color(cat)
    ink, line, bg = p["ink"], p["line"], p["bg1"]
    if glyph.startswith("«"):
        text = glyph.strip("«»")
        size = 26 if len(text) <= 2 else 19
        d = monogram_path(text, size)
        if d:
            body = f'<path d="{d}" fill="{color}"/>'
        else:
            # запасной вариант без fontTools: базовая линия = центр + половина высоты прописных (0.7 em)
            base = 32 + size * 0.7 / 2
            body = (f'<text x="32" y="{base:.2f}" text-anchor="middle" font-family="IBM Plex Mono, monospace" '
                    f'font-weight="600" font-size="{size}" fill="{color}">{text}</text>')
    else:
        body = (f'<g transform="translate(12.8 12.8) scale(1.6)" fill="none" stroke="{color}" stroke-width="1.6" '
                f'stroke-linecap="square" stroke-linejoin="miter">{GLYPHS[glyph]}</g>')
    if not tile:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
                f'<g transform="translate(2 2) scale(2.5)" fill="none" stroke="{color}" stroke-width="1.6" '
                f'stroke-linecap="square">{GLYPHS[glyph]}</g></svg>\n')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<path d="M10 2H62V54L54 62H2V10Z" fill="{bg}" stroke="{line}" stroke-width="1.5"/>'
            f'<rect x="57" y="4" width="3" height="3" fill="{ink}"/>'
            f'<rect x="6" y="58" width="16" height="2" fill="{color}"/>'
            f'{body}</svg>\n')


def build_icon_theme(p: Palette, dest: Path) -> Path:
    # курсоры (dest/cursors) живут в том же каталоге темы — их не трогаем
    for sub in ("scalable", "index.theme"):
        target = dest / sub
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()
    apps, places = dest / "scalable/apps", dest / "scalable/places"
    apps.mkdir(parents=True)
    places.mkdir(parents=True)
    for name, (glyph, cat) in APP_ICONS.items():
        (apps / f"{name}.svg").write_text(tile_svg(p, glyph, cat))
    for name, glyph in PLACE_ICONS.items():
        cat = "ai" if glyph == "folder-ai" else ("media" if glyph == "trash" else "chat")
        (places / f"{name}.svg").write_text(tile_svg(p, glyph, cat, tile=False))
    (dest / "index.theme").write_text(
        "[Icon Theme]\nName=HYPERINA\nComment=Иконки HYPERINA\nInherits=Papirus-Dark,breeze-dark,hicolor\n"
        "Directories=scalable/apps,scalable/places\n\n"
        "[scalable/apps]\nSize=64\nMinSize=16\nMaxSize=512\nType=Scalable\nContext=Applications\n\n"
        "[scalable/places]\nSize=64\nMinSize=16\nMaxSize=512\nType=Scalable\nContext=Places\n")
    return dest


def glyph_svg(p: Palette, glyph: str, color_key: str = "ink") -> str:
    """Отдельная пиктограмма для интерфейса (QML/веб)."""
    body = GLYPHS.get(glyph) or GLYPHS_UI[glyph]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{p[color_key]}" '
            f'stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter">{body}</svg>\n')


def to_path_data(svg_body: str) -> str:
    """Перевести rect/circle/ellipse в данные пути (для QML PathSvg)."""
    import re as _re
    out = []
    for tag, attrs in _re.findall(r'<(\w+)([^>]*)/>', svg_body):
        a = dict(_re.findall(r'(\w+)="([^"]*)"', attrs))
        f = lambda k, a=a: float(a.get(k, 0))  # noqa: E731
        if tag == "path":
            out.append(a["d"])
        elif tag == "rect":
            out.append(f"M{f('x'):g} {f('y'):g}h{f('width'):g}v{f('height'):g}h{-f('width'):g}z")
        elif tag == "circle":
            cx, cy, r = f("cx"), f("cy"), f("r")
            out.append(f"M{cx - r:g} {cy:g}a{r:g} {r:g} 0 1 0 {2 * r:g} 0a{r:g} {r:g} 0 1 0 {-2 * r:g} 0")
        elif tag == "ellipse":
            cx, cy, rx, ry = f("cx"), f("cy"), f("rx"), f("ry")
            out.append(f"M{cx - rx:g} {cy:g}a{rx:g} {ry:g} 0 1 0 {2 * rx:g} 0a{rx:g} {ry:g} 0 1 0 {-2 * rx:g} 0")
    return "".join(out)


_NUM = r"-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?"


def transform_body(body: str, k: float = 1.0, dx: float = 0.0, dy: float = 0.0) -> str:
    """Равномерно масштабировать (вокруг 12,12) и сдвинуть пиктограмму — для подгонки центровки."""
    import re as _re

    def X(v: float) -> str:
        return f"{round(12 + (v - 12) * k + dx, 3):g}"

    def Y(v: float) -> str:
        return f"{round(12 + (v - 12) * k + dy, 3):g}"

    def L(v: float) -> str:
        return f"{round(v * k, 3):g}"

    def path(d: str) -> str:
        out = []
        for cmd, args in _re.findall(r"([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)", d):
            nums = [float(n) for n in _re.findall(_NUM, args)]
            up, c = cmd.isupper(), cmd.upper()
            if c == "Z":
                out.append(cmd)
                continue
            if c == "H":
                vals = [X(n) if up else L(n) for n in nums]
            elif c == "V":
                vals = [Y(n) if up else L(n) for n in nums]
            elif c == "A":
                vals = []
                for i in range(0, len(nums), 7):
                    rx, ry, rot, la, sw, x, y = nums[i:i + 7]
                    vals += [L(rx), L(ry), f"{rot:g}", f"{la:g}", f"{sw:g}",
                             X(x) if up else L(x), Y(y) if up else L(y)]
            else:
                vals = [(X(n) if i % 2 == 0 else Y(n)) if up else L(n) for i, n in enumerate(nums)]
            out.append(cmd + " ".join(vals))
        return "".join(out)

    def elem(m: "_re.Match") -> str:
        tag, attrs = m.group(1), m.group(2)
        a = dict(_re.findall(r'(\w+)="([^"]*)"', attrs))
        if tag == "path":
            a["d"] = path(a["d"])
        elif tag == "rect":
            a["x"], a["y"] = X(float(a["x"])), Y(float(a["y"]))
            a["width"], a["height"] = L(float(a["width"])), L(float(a["height"]))
        elif tag in ("circle", "ellipse"):
            a["cx"], a["cy"] = X(float(a["cx"])), Y(float(a["cy"]))
            for r in ("r", "rx", "ry"):
                if r in a:
                    a[r] = L(float(a[r]))
        return f"<{tag} " + " ".join(f'{k_}="{v}"' for k_, v in a.items()) + "/>"

    return _re.sub(r"<(\w+)([^>]*)/>", elem, body)


def export_qml_glyphs(dest: Path) -> Path:
    """Библиотека пиктограмм для оболочки: shell/components/Glyphs.js."""
    import json as _json
    paths_ = {k: to_path_data(v) for k, v in {**GLYPHS, **GLYPHS_UI}.items()}
    dest.write_text(".pragma library\n// Автоматически создано из core/hyperina/icons.py: пиктограммы 24×24 для Shape/PathSvg\n"
                    "var paths = " + _json.dumps(paths_, indent=1) + ";\n"
                    "function get(name) { return paths[name] || paths['sparkle']; }\n")
    return dest
