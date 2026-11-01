"""Тема иконок HYPERINA: линейные пиктограммы в рамках со скосами, цвет — по категории.

Генерируется из палитры. Всё, чего нет в наборе, берётся из Papirus-Dark.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from .palette import Palette

# Пиктограммы в сетке 24×24, линии толщиной 1.6
GLYPHS: dict[str, str] = {
    "terminal": '<rect x="3" y="5" width="18" height="14"/><path d="M7 10l3 2-3 2M12 15h5"/>',
    "folder": '<path d="M3 7h6l2 2h10v10H3z"/>',
    "home": '<path d="M4 11l8-7 8 7v9H4zM10 20v-5h4v5"/>',
    "settings": '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    "haotica": '<path d="M12 3l7 9-7 9-7-9z"/><path d="M12 8.5l2.7 3.5-2.7 3.5-2.7-3.5z"/>',
    "globe": '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.8" ry="8.5"/><path d="M3.5 12h17"/>',
    "chat": '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
    "plane": '<path d="M3 11l18-7-4 16-6-5-3 4v-5l9-6"/>',
    "game": '<path d="M7 9h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5 2l-1-1H9l-1 1a3 3 0 0 1-5-2v-1a4 4 0 0 1 4-4zM8 11v4M6 13h4"/><path d="M15.5 12.4h.01M17.6 14.4h.01"/>',
    "discord": '<path d="M4 6h16v10h-9l-4 3v-3H4z"/><path d="M9.2 11h.01M14.8 11h.01"/>',
    "music": '<path d="M5 9c5-2 10-2 14 0M6 12.5c4-1.5 8-1.5 12 0M7.5 16c3-1 6-1 9 0"/>',
    "code": '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>',
    "crystal": '<path d="M12 3l6 6-2 10-4 2-4-2-2-10z"/><path d="M12 3v18M6 9l6 3 6-3"/>',
    "key": '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M15 12v2"/>',
    "download": '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    "record": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
    "play": '<rect x="3" y="5" width="18" height="14"/><path d="M10 9l5 3-5 3z"/>',
    "doc": '<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 15h7M9 18h4"/>',
    "calc": '<rect x="5" y="3" width="14" height="18"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h4"/>',
    "calendar": '<rect x="4" y="5" width="16" height="15"/><path d="M4 9h16M8 3v4M16 3v4M8 13h3M13 13h3M8 16.5h3"/>',
    "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
    "notes": '<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/>',
    "weather": '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.3A3.5 3.5 0 0 0 7 18z"/>',
    "sysmon": '<rect x="3" y="4" width="18" height="13"/><path d="M8 21h8M12 17v4M6 13l3-3 3 2 4-5"/>',
    "camera": '<path d="M4 8h4l2-2h4l2 2h4v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    "clipboard": '<path d="M8 4h8v3H8zM8 5.5H5V21h14V5.5h-3M8 12h8M8 16h5"/>',
    "picker": '<path d="M14 4l6 6-9 9H5v-6zM12 6l6 6"/>',
    "archive": '<path d="M4 4h16v4H4zM5 8v12h14V8M10 12h4"/>',
    "disk": '<rect x="4" y="4" width="16" height="16"/><circle cx="12" cy="12" r="4.2"/><path d="M12 12h.01M16.5 7.5h.01"/>',
    "image": '<rect x="3" y="5" width="18" height="14"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
    "store": '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    "radar": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/><path d="M15.5 14.5h.01"/>',
    "cloud": '<path d="M7 17h10a4 4 0 0 0 0-8 6 6 0 0 0-11.4 1.3A3.5 3.5 0 0 0 7 17z"/><path d="M12 11v6M9.8 14.8L12 17l2.2-2.2"/>',
    "shield": '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    "power": '<path d="M12 3v8M7 6.5a7 7 0 1 0 10 0"/>',
    "trash": '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
    "pawn": '<path d="M10 6a2 2 0 1 1 4 0 2 2 0 1 1-4 0M9.5 10h5M10.5 10l-1 7h5l-1-7M7 20h10l-1-3H8z"/>',
    "sparkle": '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>',
    "wifi": '<path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0"/><path d="M12 19.5h.01"/>',
    "folder-doc": '<path d="M3 7h6l2 2h10v10H3z"/><path d="M8 13h8M8 16h5"/>',
    "folder-down": '<path d="M3 7h6l2 2h10v10H3z"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/>',
    "folder-music": '<path d="M3 7h6l2 2h10v10H3z"/><path d="M11 17a1.6 1.6 0 1 1-1.6-1.6H11v-4.4l4-1v4.2"/>',
    "folder-image": '<path d="M3 7h6l2 2h10v10H3z"/><path d="M6 17l4-3.5 3 2.5 2-1.6 3 2.6"/>',
    "folder-video": '<path d="M3 7h6l2 2h10v10H3z"/><path d="M10 11.5l4.5 2.5-4.5 2.5z"/>',
    "folder-ai": '<path d="M3 7h6l2 2h10v10H3z"/><path d="M12 11l2.5 3-2.5 3-2.5-3z"/>',
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


def tile_svg(p: Palette, glyph: str, cat: str, tile: bool = True) -> str:
    color = p.category_color(cat)
    ink, line, bg = p["ink"], p["line"], p["bg1"]
    if glyph.startswith("«"):
        text = glyph.strip("«»")
        size = 26 if len(text) <= 2 else 19
        body = (f'<text x="32" y="{37 if len(text) <= 2 else 36}" text-anchor="middle" font-family="IBM Plex Mono, monospace" '
                f'font-weight="600" font-size="{size}" fill="{color}" letter-spacing="0.5">{text}</text>')
    else:
        body = (f'<g transform="translate(13 13) scale(1.58)" fill="none" stroke="{color}" stroke-width="1.6" '
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
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{p[color_key]}" '
            f'stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter">{GLYPHS[glyph]}</svg>\n')
