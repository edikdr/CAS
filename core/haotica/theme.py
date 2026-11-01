"""Генераторы тем HAOTICA: из одной палитры — оформление всей системы.

Пользовательские цели пишутся в домашний каталог, системные (Plymouth, Chrome,
экран входа) — в каталог, который затем копирует установщик или helper от root.
"""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import zipfile
from pathlib import Path

from . import config, paths
from .palette import (Palette, argb_qt, build, css_rgba, hex_to_rgb, luminance, mix,
                      rgba_hypr, saturation)

H = paths.HOME
AUTOGEN = "Автоматически создано HAOTICA. Не редактируйте вручную — изменения пропадут."


def current_palette(settings: dict | None = None) -> Palette:
    s = settings or config.load()
    ap = s.get("appearance", {})
    return build(ap.get("profile", "MIX"), ap.get("custom", {}))


# ── runtime: theme.json для оболочки и приложений ────────────────
def terminal_colors(p: Palette) -> dict:
    return {
        "background": p["bg0"], "foreground": p["ink"], "cursor": p["accent"], "cursorAccent": p["bg0"],
        "selectionBackground": p["selection"], "selectionForeground": p["ink"],
        "black": "#000000", "red": p["coral"], "green": p["green"], "yellow": p["amber"],
        "blue": p["sky"], "magenta": p["violet"], "cyan": p["teal"], "white": p["dim"],
        "brightBlack": p["line_hi"], "brightRed": mix(p["coral"], "#FFFFFF", 0.25),
        "brightGreen": mix(p["green"], "#FFFFFF", 0.25), "brightYellow": mix(p["amber"], "#FFFFFF", 0.25),
        "brightBlue": mix(p["sky"], "#FFFFFF", 0.25), "brightMagenta": mix(p["violet"], "#FFFFFF", 0.2),
        "brightCyan": mix(p["teal"], "#FFFFFF", 0.25), "brightWhite": p["ink"],
    }


def runtime_theme(p: Palette, s: dict) -> dict:
    ap, fx, an = s.get("appearance", {}), s.get("effects", {}), s.get("animations", {})
    return {
        "profile": p.name,
        "label": p.label,
        "colors": p.all_colors(),
        "categories": {k: p.category_color(k) for k in p.categories},
        "terminal": terminal_colors(p),
        "fonts": {**p.fonts, "ui": ap.get("font_ui", p.fonts.get("ui")), "mono": ap.get("font_mono", p.fonts.get("mono")),
                  "term": ap.get("font_term", p.fonts.get("term")), "size": ap.get("font_size", 10.5),
                  "termSize": ap.get("term_font_size", 12)},
        "geometry": {**p.geometry, "chamfer": ap.get("chamfer", p.geometry.get("chamfer", 8)),
                     "radius": ap.get("radius", p.geometry.get("radius", 4))},
        "effects": fx,
        "animations": an,
        "liveliness": ap.get("liveliness", 0.65),
        "wallpaper": {"name": ap.get("wallpaper", "statue"), "live": ap.get("wallpaper_live", True),
                      "custom": ap.get("wallpaper_custom", "")},
    }


# ── Hyprland ─────────────────────────────────────────────────────
def hyprland_lua(p: Palette) -> str:
    lines = [f"-- {AUTOGEN}", f"-- Профиль: {p.name}", "return {"]
    for k, v in p.all_colors().items():
        lines.append(f'    {k} = "{rgba_hypr(v)}",')
    lines += [
        f'    border_active = "{rgba_hypr(p["accent"], 0.95)}",',
        f'    border_active2 = "{rgba_hypr(p["accent2"], 0.85)}",',
        f'    border_inactive = "{rgba_hypr(p["line"], 0.85)}",',
        f'    shadow_color = "{rgba_hypr("#000000", 0.6)}",',
        f'    glow_color = "{rgba_hypr(p["accent"], 0.18)}",',
        "}",
    ]
    return "\n".join(lines) + "\n"



def _lua(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return json.dumps(str(v), ensure_ascii=False)


def hyprland_settings_lua(s: dict, p: Palette) -> str:
    """Параметры Hyprland из настроек (экран, ввод, анимации, плотность)."""
    ap, fx, an = s.get("appearance", {}), s.get("effects", {}), s.get("animations", {})
    disp, loc, kb, tp = s.get("display", {}), s.get("locale", {}), s.get("keyboard", {}), s.get("touchpad", {})
    gaps = {"compact": (3, 6), "normal": (6, 12), "airy": (10, 18)}.get(ap.get("density", "normal"), (6, 12))
    layouts = loc.get("layouts", ["de", "ru"])
    variants = ["phonetic" if (lay == "ru" and loc.get("ru_variant") == "phonetic") else "" for lay in layouts]
    switch = {"alt_shift": "grp:alt_shift_toggle", "super_space": "grp:win_space_toggle",
              "caps": "grp:caps_toggle"}.get(loc.get("switch", "alt_shift"), "grp:alt_shift_toggle")
    vals = {
        "scale": disp.get("scale", 1.6), "refresh": disp.get("refresh", 165), "vrr": disp.get("vrr", True),
        "bitdepth": disp.get("bitdepth", 10), "hdr": disp.get("hdr", False),
        "cursor_theme": ap.get("cursor_theme", "HAOTICA"), "cursor_size": ap.get("cursor_size", 24),
        "gaps_in": gaps[0], "gaps_out": gaps[1], "window_radius": p.geometry.get("window_radius", 6),
        "glow": float(fx.get("glow", 0.25)), "blur": bool(fx.get("blur", True)),
        "reduce_motion": bool(an.get("reduce_motion", False)), "anim_speed": float(an.get("speed", 1.0)) or 1.0,
        "window_speed": float(an.get("window", 0.7)) or 0.7,
        "kb_layout": ",".join(layouts), "kb_variant": ",".join(variants), "kb_options": switch,
        "repeat_delay": kb.get("repeat_delay", 300), "repeat_rate": kb.get("repeat_rate", 35),
        "sensitivity": float(tp.get("speed", 0.0)), "natural_scroll": tp.get("natural_scroll", True),
        "tap_to_click": tp.get("tap_to_click", True), "disable_while_typing": tp.get("disable_while_typing", True),
    }
    body = "\n".join(f"    {k} = {_lua(v)}," for k, v in vals.items())
    return f"-- {AUTOGEN}\nreturn {{\n{body}\n}}\n"


# ── GTK (adw-gtk3 и libadwaita) ──────────────────────────────────
def gtk_css(p: Palette) -> str:
    c = p
    defs = {
        "accent_color": c["accent"], "accent_bg_color": c["accent"], "accent_fg_color": "#000000",
        "destructive_color": c["coral"], "destructive_bg_color": c["coral"], "destructive_fg_color": "#000000",
        "success_color": c["green"], "success_bg_color": c["green"], "success_fg_color": "#000000",
        "warning_color": c["amber"], "warning_bg_color": c["amber"], "warning_fg_color": "#000000",
        "error_color": c["coral"], "error_bg_color": c["coral"], "error_fg_color": "#000000",
        "window_bg_color": c["bg1"], "window_fg_color": c["ink"],
        "view_bg_color": c["bg0"], "view_fg_color": c["ink"],
        "headerbar_bg_color": c["bg1"], "headerbar_fg_color": c["ink"],
        "headerbar_border_color": c["line"], "headerbar_backdrop_color": c["bg1"],
        "headerbar_shade_color": "rgba(0, 0, 0, 0.36)", "headerbar_darker_shade_color": "rgba(0, 0, 0, 0.9)",
        "sidebar_bg_color": c["bg1"], "sidebar_fg_color": c["ink"], "sidebar_backdrop_color": c["bg1"],
        "sidebar_shade_color": "rgba(0, 0, 0, 0.36)", "sidebar_border_color": c["line"],
        "secondary_sidebar_bg_color": c["bg2"], "secondary_sidebar_fg_color": c["ink"],
        "card_bg_color": c["bg2"], "card_fg_color": c["ink"], "card_shade_color": "rgba(0, 0, 0, 0.36)",
        "dialog_bg_color": c["bg2"], "dialog_fg_color": c["ink"],
        "popover_bg_color": c["bg2"], "popover_fg_color": c["ink"], "popover_shade_color": "rgba(0, 0, 0, 0.25)",
        "thumbnail_bg_color": c["bg2"], "thumbnail_fg_color": c["ink"],
        "shade_color": "rgba(0, 0, 0, 0.36)", "scrollbar_outline_color": "rgba(0, 0, 0, 0.5)",
    }
    out = [f"/* {AUTOGEN} */", f"/* Профиль: {p.name} */"]
    out += [f"@define-color {k} {v};" for k, v in defs.items()]
    out += [
        "",
        "/* HAOTICA: строгие углы и тонкие рамки */",
        "window, .background { background-color: @window_bg_color; }",
        "headerbar { border-bottom: 1px solid @headerbar_border_color; }",
        f"selection, *:selected {{ background-color: {css_rgba(c['accent'], 0.28)}; color: @window_fg_color; }}",
        "",
    ]
    return "\n".join(out)


def gtk_settings(p: Palette, s: dict, gtk4: bool = False) -> str:
    ap = s.get("appearance", {})
    lines = [
        "[Settings]",
        "gtk-application-prefer-dark-theme=1",
        f"gtk-icon-theme-name={ap.get('icon_theme', 'HAOTICA')}",
        f"gtk-cursor-theme-name={ap.get('cursor_theme', 'HAOTICA')}",
        f"gtk-cursor-theme-size={ap.get('cursor_size', 24)}",
        f"gtk-font-name={ap.get('font_ui', 'IBM Plex Sans')} {ap.get('font_size', 10.5)}",
        "gtk-sound-theme-name=haotica",
        "gtk-enable-event-sounds=1",
        "gtk-decoration-layout=:",
    ]
    if not gtk4:
        lines.insert(1, "gtk-theme-name=adw-gtk3-dark")
    return "\n".join(lines) + "\n"


# ── Qt: qt6ct, Kvantum, kdeglobals ───────────────────────────────
QT_ROLES = ["WindowText", "Button", "Light", "Midlight", "Dark", "Mid", "Text", "BrightText", "ButtonText",
            "Base", "Window", "Shadow", "Highlight", "HighlightedText", "Link", "LinkVisited",
            "AlternateBase", "NoRole", "ToolTipBase", "ToolTipText", "PlaceholderText", "Accent"]


def qt_palette_colors(p: Palette, state: str = "active") -> str:
    ink = p["ink"] if state != "disabled" else mix(p["bg1"], p["ink"], 0.45)
    m = {
        "WindowText": ink, "Button": p["bg2"], "Light": p["line_hi"], "Midlight": p["line"], "Dark": "#000000",
        "Mid": p["line"], "Text": ink, "BrightText": "#FFFFFF", "ButtonText": ink, "Base": p["bg0"],
        "Window": p["bg1"], "Shadow": "#000000", "Highlight": p["accent"], "HighlightedText": "#000000",
        "Link": p["teal"], "LinkVisited": p["violet"], "AlternateBase": p["bg2"], "NoRole": p["bg1"],
        "ToolTipBase": p["bg2"], "ToolTipText": p["ink"], "PlaceholderText": p["dim"], "Accent": p["accent"],
    }
    return ", ".join(argb_qt(m[r]) for r in QT_ROLES)


def qt6ct_colors(p: Palette) -> str:
    return (f"# {AUTOGEN}\n[ColorScheme]\nactive_colors={qt_palette_colors(p)}\n"
            f"disabled_colors={qt_palette_colors(p, 'disabled')}\ninactive_colors={qt_palette_colors(p)}\n")


def qt6ct_conf(p: Palette, s: dict) -> str:
    ap = s.get("appearance", {})
    ui, mono, size = ap.get("font_ui", "IBM Plex Sans"), ap.get("font_mono", "IBM Plex Mono"), round(float(ap.get("font_size", 10.5)))
    return f"""[Appearance]
color_scheme_path={H}/.config/qt6ct/colors/HAOTICA.conf
custom_palette=true
icon_theme={ap.get('icon_theme', 'HAOTICA')}
standard_dialogs=xdgdesktopportal
style=kvantum

[Fonts]
fixed="{mono},{size},-1,5,400,0,0,0,0,0,0,0,0,0,0,1"
general="{ui},{size},-1,5,400,0,0,0,0,0,0,0,0,0,0,1"

[Interface]
activate_item_on_single_click=0
dialog_buttons_have_icons=0
menus_have_icons=true
show_shortcuts_in_context_menus=true
"""


def kdeglobals(p: Palette, s: dict) -> str:
    def rgb(c: str) -> str:
        return ",".join(str(x) for x in hex_to_rgb(c))

    groups = {
        "View": (p["bg0"], p["bg2"]), "Window": (p["bg1"], p["bg2"]), "Button": (p["bg2"], p["bg1"]),
        "Selection": (p["accent"], p["accent_dim"]), "Tooltip": (p["bg2"], p["bg1"]),
        "Complementary": (p["bg1"], p["bg2"]), "Header": (p["bg1"], p["bg2"]),
    }
    out = [f"# {AUTOGEN}", "[General]", "ColorScheme=HAOTICA", f"font={s['appearance'].get('font_ui', 'IBM Plex Sans')},10,-1,5,400,0,0,0,0,0",
           f"fixed={s['appearance'].get('font_mono', 'IBM Plex Mono')},10,-1,5,400,0,0,0,0,0", "",
           "[Icons]", f"Theme={s['appearance'].get('icon_theme', 'HAOTICA')}", "", "[KDE]", "widgetStyle=kvantum", ""]
    for g, (bg, alt) in groups.items():
        fg = "#000000" if g == "Selection" else p["ink"]
        out += [f"[Colors:{g}]", f"BackgroundNormal={rgb(bg)}", f"BackgroundAlternate={rgb(alt)}",
                f"ForegroundNormal={rgb(fg)}", f"ForegroundInactive={rgb(p['dim'])}",
                f"ForegroundActive={rgb(p['accent'])}", f"ForegroundLink={rgb(p['teal'])}",
                f"ForegroundVisited={rgb(p['violet'])}", f"ForegroundNegative={rgb(p['coral'])}",
                f"ForegroundNeutral={rgb(p['amber'])}", f"ForegroundPositive={rgb(p['green'])}",
                f"DecorationFocus={rgb(p['accent'])}", f"DecorationHover={rgb(p['line_hi'])}", ""]
    out += ["[WM]", f"activeBackground={rgb(p['bg1'])}", f"activeForeground={rgb(p['ink'])}",
            f"inactiveBackground={rgb(p['bg1'])}", f"inactiveForeground={rgb(p['dim'])}", ""]
    return "\n".join(out)


_HEX = re.compile(r"#([0-9a-fA-F]{6})\b")


def kvantum_recolor_svg(svg: str, p: Palette) -> str:
    """Перекрасить базовую тему Kvantum: серые → шкала HAOTICA, цветные → акцент. Углы — без скругления."""
    ramp = [(0.0, "#000000"), (0.012, p["bg0"]), (0.03, p["bg1"]), (0.06, p["bg2"]), (0.14, p["line"]),
            (0.32, p["line_hi"]), (0.55, p["dim"]), (1.0, p["ink"])]

    def map_grey(lum: float) -> str:
        for (l0, c0), (l1, c1) in zip(ramp, ramp[1:]):
            if lum <= l1:
                t = 0 if l1 == l0 else (lum - l0) / (l1 - l0)
                return mix(c0, c1, max(0.0, min(1.0, t)))
        return p["ink"]

    def repl(m: re.Match) -> str:
        col = "#" + m.group(1)
        if saturation(col) > 0.25:
            return p["accent"] if luminance(col) > 0.08 else p["accent_dim"]
        return map_grey(luminance(col))

    svg = _HEX.sub(repl, svg)
    svg = re.sub(r'\b(rx|ry)="[0-9.]+"', r'\1="0"', svg)
    return svg


def kvantum_config(base_cfg: str, p: Palette) -> str:
    colors = {
        "window.color": p["bg1"], "base.color": p["bg0"], "alt.base.color": p["bg2"], "button.color": p["bg2"],
        "light.color": p["line_hi"], "mid.light.color": p["line"], "dark.color": "#000000", "mid.color": p["line"],
        "highlight.color": p["accent"], "inactive.highlight.color": p["accent_dim"], "tooltip.base.color": p["bg2"],
        "text.color": p["ink"], "window.text.color": p["ink"], "button.text.color": p["ink"],
        "disabled.text.color": mix(p["bg1"], p["ink"], 0.45), "tooltip.text.color": p["ink"],
        "highlight.text.color": "#000000", "link.color": p["teal"], "link.visited.color": p["violet"],
        "progress.indicator.text.color": "#000000",
    }
    out, in_colors = [], False
    seen = set()
    for line in base_cfg.splitlines():
        if line.strip().startswith("["):
            if in_colors:
                for k, v in colors.items():
                    if k not in seen:
                        out.append(f"{k}={v}")
            in_colors = line.strip() == "[GeneralColors]"
            out.append(line)
            continue
        if in_colors and "=" in line:
            k = line.split("=", 1)[0].strip()
            if k in colors:
                out.append(f"{k}={colors[k]}")
                seen.add(k)
                continue
        out.append(line)
    return "\n".join(out) + "\n"


def write_kvantum(p: Palette, base_dir: Path = Path("/usr/share/Kvantum/KvSimplicityDark")) -> list[Path]:
    name = base_dir.name
    svg_src, cfg_src = base_dir / f"{name}.svg", base_dir / f"{name}.kvconfig"
    if not svg_src.exists():
        return []
    dst = H / ".config/Kvantum/HAOTICA"
    dst.mkdir(parents=True, exist_ok=True)
    (dst / "HAOTICA.svg").write_text(kvantum_recolor_svg(svg_src.read_text(), p))
    (dst / "HAOTICA.kvconfig").write_text(kvantum_config(cfg_src.read_text(), p))
    main = H / ".config/Kvantum/kvantum.kvconfig"
    main.write_text("[General]\ntheme=HAOTICA\n")
    return [dst / "HAOTICA.svg", dst / "HAOTICA.kvconfig", main]


# ── приложения ───────────────────────────────────────────────────
def vscode_theme(p: Palette) -> dict:
    c = p
    return {
        "name": "HAOTICA", "type": "dark",
        "colors": {
            "editor.background": c["bg0"], "editor.foreground": c["ink"], "editorCursor.foreground": c["accent"],
            "editor.lineHighlightBackground": c["ink_faint"], "editor.selectionBackground": c["selection"],
            "editorLineNumber.foreground": c["line_hi"], "editorLineNumber.activeForeground": c["ink"],
            "editorIndentGuide.background1": c["line"], "editorWhitespace.foreground": c["line"],
            "sideBar.background": c["bg1"], "sideBar.foreground": c["ink"], "sideBarSectionHeader.background": c["bg1"],
            "activityBar.background": c["bg1"], "activityBar.foreground": c["ink"], "activityBarBadge.background": c["accent"],
            "activityBarBadge.foreground": "#000000", "titleBar.activeBackground": c["bg1"], "titleBar.activeForeground": c["ink"],
            "statusBar.background": c["bg1"], "statusBar.foreground": c["dim"], "statusBar.border": c["line"],
            "tab.activeBackground": c["bg0"], "tab.inactiveBackground": c["bg1"], "tab.activeBorderTop": c["accent"],
            "tab.border": c["line"], "editorGroupHeader.tabsBackground": c["bg1"], "panel.background": c["bg1"],
            "panel.border": c["line"], "terminal.background": c["bg0"], "terminal.foreground": c["ink"],
            "focusBorder": c["accent"], "button.background": c["ink"], "button.foreground": "#000000",
            "input.background": c["bg0"], "input.border": c["line"], "list.activeSelectionBackground": c["selection"],
            "list.hoverBackground": c["hover"], "badge.background": c["accent"], "badge.foreground": "#000000",
            "textLink.foreground": c["teal"], "errorForeground": c["coral"], "editorError.foreground": c["coral"],
            "editorWarning.foreground": c["amber"], "gitDecoration.modifiedResourceForeground": c["amber"],
            "gitDecoration.untrackedResourceForeground": c["green"], "scrollbarSlider.background": css_rgba(c["ink"], 0.12),
        },
        "tokenColors": [
            {"scope": ["comment", "punctuation.definition.comment"], "settings": {"foreground": c["dim"], "fontStyle": "italic"}},
            {"scope": ["keyword", "storage", "storage.type"], "settings": {"foreground": c["amber"]}},
            {"scope": ["string", "string.quoted"], "settings": {"foreground": c["green"]}},
            {"scope": ["constant.numeric", "constant.language", "constant.character"], "settings": {"foreground": c["coral"]}},
            {"scope": ["entity.name.function", "support.function"], "settings": {"foreground": c["teal"]}},
            {"scope": ["entity.name.type", "entity.name.class", "support.type", "support.class"], "settings": {"foreground": c["sky"]}},
            {"scope": ["variable.parameter", "variable.other.property"], "settings": {"foreground": c["ink"]}},
            {"scope": ["entity.name.tag", "meta.tag"], "settings": {"foreground": c["violet"]}},
            {"scope": ["entity.other.attribute-name"], "settings": {"foreground": c["amber"]}},
            {"scope": ["markup.heading"], "settings": {"foreground": c["accent"], "fontStyle": "bold"}},
        ],
    }


def write_vscode(p: Palette) -> list[Path]:
    ext = H / ".vscode/extensions/haotica.haotica-theme-1.0.0"
    (ext / "themes").mkdir(parents=True, exist_ok=True)
    pkg = {"name": "haotica-theme", "displayName": "HAOTICA", "publisher": "haotica", "version": "1.0.0",
           "engines": {"vscode": "^1.80.0"}, "categories": ["Themes"],
           "contributes": {"themes": [{"label": "HAOTICA", "uiTheme": "vs-dark", "path": "./themes/haotica.json"}]}}
    (ext / "package.json").write_text(json.dumps(pkg, indent=2))
    (ext / "themes/haotica.json").write_text(json.dumps(vscode_theme(p), indent=2, ensure_ascii=False))
    settings_file = H / ".config/Code/User/settings.json"
    data = {}
    if settings_file.exists():
        try:
            data = json.loads(settings_file.read_text() or "{}")
        except json.JSONDecodeError:
            data = None  # не трогаем повреждённый/с комментариями файл
    if data is not None:
        data.setdefault("workbench.colorTheme", "HAOTICA")
        data.setdefault("editor.fontFamily", "'JetBrains Mono', 'IBM Plex Mono', monospace")
        data.setdefault("window.titleBarStyle", "custom")
        settings_file.parent.mkdir(parents=True, exist_ok=True)
        settings_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return [ext]


def vesktop_css(p: Palette) -> str:
    c = p
    return f"""/**
 * @name HAOTICA
 * @description {AUTOGEN}
 * @author HAOTICA
 * @version 1.0.0
 */
:root, .theme-dark, .theme-darker, .theme-midnight {{
  --background-primary: {c['bg0']};
  --background-secondary: {c['bg1']};
  --background-secondary-alt: {c['bg2']};
  --background-tertiary: {c['bg1']};
  --background-floating: {c['bg2']};
  --background-modifier-hover: {css_rgba(c['ink'], 0.06)};
  --background-modifier-selected: {css_rgba(c['accent'], 0.18)};
  --background-modifier-accent: {c['line']};
  --channeltextarea-background-color: {c['bg1']};
  --text-normal: {c['ink']};
  --text-muted: {c['dim']};
  --header-primary: {c['ink']};
  --header-secondary: {c['dim']};
  --interactive-normal: {c['dim']};
  --interactive-hover: {c['ink']};
  --interactive-active: {c['accent']};
  --brand-experiment: {c['accent']};
  --brand-500: {c['accent']};
  --text-link: {c['teal']};
  --status-danger: {c['coral']};
  --status-positive: {c['green']};
  --status-warning: {c['amber']};
  --font-primary: '{c.fonts.get('ui', 'IBM Plex Sans')}', sans-serif;
  --font-code: '{c.fonts.get('mono', 'IBM Plex Mono')}', monospace;
  --radius-sm: 2px; --radius-md: 4px; --radius-lg: 4px;
}}
"""


def write_vesktop(p: Palette) -> list[Path]:
    themes = H / ".config/vesktop/themes"
    themes.mkdir(parents=True, exist_ok=True)
    f = themes / "haotica.theme.css"
    f.write_text(vesktop_css(p))
    sf = H / ".config/vesktop/settings/settings.json"
    try:
        data = json.loads(sf.read_text()) if sf.exists() else {}
    except json.JSONDecodeError:
        data = None
    if data is not None:
        enabled = data.setdefault("enabledThemes", [])
        if "haotica.theme.css" not in enabled:
            enabled.append("haotica.theme.css")
        sf.parent.mkdir(parents=True, exist_ok=True)
        sf.write_text(json.dumps(data, indent=2))
    return [f]


def mangohud_conf(p: Palette) -> str:
    h = lambda c: c.lstrip("#").upper()  # noqa: E731
    return f"""# {AUTOGEN}
legacy_layout=false
horizontal
hud_compact
font_size=18
font_file=/usr/share/fonts/TTF/IBMPlexMono-Medium.ttf
background_alpha=0.55
background_color={h(p['bg1'])}
text_color={h(p['ink'])}
gpu_color={h(p['coral'])}
cpu_color={h(p['sky'])}
vram_color={h(p['violet'])}
ram_color={h(p['teal'])}
engine_color={h(p['amber'])}
frametime_color={h(p['green'])}
round_corners=0
gpu_stats
gpu_temp
cpu_stats
cpu_temp
ram
vram
fps
frametime
frame_timing=1
toggle_hud=Shift_R+F12
position=top-left
"""


def btop_theme(p: Palette) -> str:
    c = p
    keys = {
        "main_bg": c["bg0"], "main_fg": c["ink"], "title": c["ink"], "hi_fg": c["accent"], "selected_bg": c["selection"],
        "selected_fg": c["ink"], "inactive_fg": c["line_hi"], "graph_text": c["dim"], "meter_bg": c["line"],
        "proc_misc": c["teal"], "cpu_box": c["line"], "mem_box": c["line"], "net_box": c["line"], "proc_box": c["line"],
        "div_line": c["line"], "temp_start": c["green"], "temp_mid": c["amber"], "temp_end": c["coral"],
        "cpu_start": c["sky"], "cpu_mid": c["teal"], "cpu_end": c["amber"], "free_start": c["green"], "free_mid": c["teal"],
        "free_end": c["sky"], "cached_start": c["violet"], "cached_mid": c["sky"], "cached_end": c["teal"],
        "available_start": c["green"], "available_mid": c["teal"], "available_end": c["sky"], "used_start": c["amber"],
        "used_mid": c["coral"], "used_end": c["coral"], "download_start": c["teal"], "download_mid": c["sky"],
        "download_end": c["violet"], "upload_start": c["amber"], "upload_mid": c["coral"], "upload_end": c["coral"],
        "process_start": c["teal"], "process_mid": c["amber"], "process_end": c["coral"],
    }
    return f"# {AUTOGEN}\n" + "\n".join(f'theme[{k}]="{v}"' for k, v in keys.items()) + "\n"


def spicetify_theme(p: Palette) -> tuple[str, str]:
    h = lambda c: c.lstrip("#").lower()  # noqa: E731
    ini = f"""[HAOTICA]
text               = {h(p['ink'])}
subtext            = {h(p['dim'])}
main               = {h(p['bg0'])}
sidebar            = {h(p['bg1'])}
player             = {h(p['bg1'])}
card               = {h(p['bg2'])}
shadow             = 000000
selected-row       = {h(p['ink'])}
button             = {h(p['accent'])}
button-active      = {h(p['accent'])}
button-disabled    = {h(p['line_hi'])}
tab-active         = {h(p['bg2'])}
notification       = {h(p['teal'])}
notification-error = {h(p['coral'])}
misc               = {h(p['line'])}
"""
    css = f"/* {AUTOGEN} */\n* {{ border-radius: 2px !important; }}\n.main-rootlist-rootlist {{ border-right: 1px solid #{h(p['line'])}; }}\n"
    return ini, css


def telegram_theme_zip(p: Palette) -> bytes:
    c = p
    keys = {
        "windowBg": c["bg1"], "windowFg": c["ink"], "windowBgOver": c["bg2"], "windowBgRipple": c["line"],
        "windowFgOver": c["ink"], "windowSubTextFg": c["dim"], "windowSubTextFgOver": c["dim"],
        "windowBoldFg": c["ink"], "windowActiveTextFg": c["accent"], "windowBgActive": c["accent"],
        "windowFgActive": "#000000", "activeButtonBg": c["accent"], "activeButtonFg": "#000000",
        "lightButtonBg": c["bg1"], "lightButtonFg": c["accent"], "dialogsBg": c["bg1"], "dialogsNameFg": c["ink"],
        "dialogsTextFg": c["dim"], "dialogsBgActive": c["selection"], "dialogsNameFgActive": c["ink"],
        "dialogsTextFgActive": c["ink"], "historyTextInFg": c["ink"], "historyTextOutFg": c["ink"],
        "msgInBg": c["bg2"], "msgOutBg": mix(c["bg2"], c["accent"], 0.18), "msgInBgSelected": c["selection"],
        "msgOutBgSelected": c["selection"], "historyLinkInFg": c["teal"], "historyLinkOutFg": c["teal"],
        "msgServiceBg": c["bg2"], "msgServiceFg": c["dim"], "titleBg": c["bg1"], "titleFg": c["ink"],
        "titleBgActive": c["bg1"], "titleFgActive": c["ink"], "menuBg": c["bg2"], "menuBgOver": c["line"],
        "sideBarBg": c["bg0"], "sideBarBgActive": c["bg2"], "sideBarTextFg": c["dim"], "sideBarTextFgActive": c["ink"],
        "attentionButtonFg": c["coral"], "scrollBarBg": css_rgba(c["ink"], 0.2), "filterInputActiveBg": c["bg0"],
        "filterInputInactiveBg": c["bg0"], "historyComposeAreaBg": c["bg1"], "historyComposeAreaFg": c["ink"],
        "emojiPanBg": c["bg2"], "boxBg": c["bg2"], "boxTitleFg": c["ink"], "boxTextFg": c["ink"],
    }
    text = "// " + AUTOGEN + "\n" + "\n".join(f"{k}: {v};" for k, v in keys.items()) + "\n"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("colors.tdesktop-theme", text)
    return buf.getvalue()


def obsidian_css(p: Palette) -> str:
    c = p
    return f"""/* {AUTOGEN}
   Как включить: скопируйте файл в <хранилище>/.obsidian/snippets/ и включите в Настройки → Оформление → CSS-фрагменты. */
.theme-dark {{
  --background-primary: {c['bg0']}; --background-secondary: {c['bg1']}; --background-modifier-border: {c['line']};
  --text-normal: {c['ink']}; --text-muted: {c['dim']}; --text-accent: {c['accent']}; --interactive-accent: {c['accent']};
  --text-on-accent: #000000; --link-color: {c['teal']}; --font-text-theme: '{c.fonts.get('ui')}'; --font-monospace-theme: '{c.fonts.get('mono')}';
  --radius-s: 2px; --radius-m: 4px; --radius-l: 4px;
}}
"""


def shell_colors_zsh(p: Palette) -> str:
    c = p
    return f"""# {AUTOGEN}
export HAOTICA_PROFILE={p.name}
export FZF_DEFAULT_OPTS="--color=bg:-1,bg+:{c['bg2']},fg:{c['ink']},fg+:{c['ink']},hl:{c['accent']},hl+:{c['accent']},info:{c['dim']},prompt:{c['teal']},pointer:{c['accent']},marker:{c['green']},spinner:{c['violet']},header:{c['dim']},border:{c['line']} --border=sharp --prompt='❯ ' --pointer='▸' --marker='+'"
export HY_C_INK='{c['ink']}' HY_C_DIM='{c['dim']}' HY_C_ACCENT='{c['accent']}' HY_C_TEAL='{c['teal']}' HY_C_CORAL='{c['coral']}' HY_C_GREEN='{c['green']}' HY_C_VIOLET='{c['violet']}' HY_C_LINE='{c['line']}'
"""


# ── системные цели (пишутся от root установщиком/helper) ─────────
def chrome_policy(p: Palette) -> dict:
    return {
        "BrowserThemeColor": p["bg1"],
        "NewTabPageLocation": f"http://{paths.HOST}:{paths.PORT_CORE}/newtab",
        "BrowserSignin": 1,
        "BackgroundModeEnabled": False,
    }


def system_targets(p: Palette, s: dict) -> dict[str, str]:
    """Содержимое системных файлов. Ключ — абсолютный путь."""
    return {
        "/etc/opt/chrome/policies/managed/haotica.json": json.dumps(chrome_policy(p), indent=2),
        "/etc/haotica/theme.json": json.dumps(runtime_theme(p, s), ensure_ascii=False, indent=1),
    }


# ── применение ───────────────────────────────────────────────────
def _write(path: Path, text: str | bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(text, bytes):
        path.write_bytes(text)
    else:
        config.atomic_write_text(path, text)
    return path


def apply(targets: set[str] | None = None, settings: dict | None = None) -> dict[str, list[str]]:
    """Пересобрать пользовательские темы. targets=None — все."""
    s = settings or config.load()
    p = current_palette(s)
    want = (lambda t: targets is None or t in targets)
    done: dict[str, list[str]] = {}

    def mark(t: str, *files: Path) -> None:
        done.setdefault(t, []).extend(str(f) for f in files)

    if want("runtime"):
        paths.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
        rt = runtime_theme(p, s)
        config.atomic_write_json(paths.RUNTIME_DIR / "theme.json", rt)
        config.atomic_write_json(paths.CONFIG_DIR / "theme.json", rt)  # переживает перезагрузку
        config.export_runtime(s)
        mark("runtime", paths.RUNTIME_DIR / "theme.json")
    if want("hyprland"):
        mark("hyprland", _write(H / ".config/hypr/haotica/theme.lua", hyprland_lua(p)),
             _write(H / ".config/hypr/haotica/settings.lua", hyprland_settings_lua(s, p)))
    if want("gtk"):
        css = gtk_css(p)
        mark("gtk", _write(H / ".config/gtk-3.0/gtk.css", css), _write(H / ".config/gtk-4.0/gtk.css", css),
             _write(H / ".config/gtk-3.0/settings.ini", gtk_settings(p, s)),
             _write(H / ".config/gtk-4.0/settings.ini", gtk_settings(p, s, gtk4=True)))
    if want("qt"):
        mark("qt", _write(H / ".config/qt6ct/colors/HAOTICA.conf", qt6ct_colors(p)),
             _write(H / ".config/qt6ct/qt6ct.conf", qt6ct_conf(p, s)),
             _write(H / ".config/kdeglobals", kdeglobals(p, s)), *write_kvantum(p))
    if want("apps"):
        mark("apps", *write_vscode(p), *write_vesktop(p),
             _write(H / ".config/MangoHud/MangoHud.conf", mangohud_conf(p)),
             _write(H / ".config/btop/themes/haotica.theme", btop_theme(p)))
        ini, css = spicetify_theme(p)
        mark("apps", _write(H / ".config/spicetify/Themes/HAOTICA/color.ini", ini),
             _write(H / ".config/spicetify/Themes/HAOTICA/user.css", css))
        docs = H / "Documents/HAOTICA"
        mark("apps", _write(docs / "haotica.tdesktop-theme", telegram_theme_zip(p)),
             _write(docs / "obsidian-haotica.css", obsidian_css(p)))
    if want("shell"):
        mark("shell", _write(H / ".config/haotica/shell-colors.zsh", shell_colors_zsh(p)))
    return done


def export_system(out_dir: Path, settings: dict | None = None) -> list[Path]:
    """Записать системные файлы в out_dir с сохранением абсолютных путей (для копирования от root)."""
    s = settings or config.load()
    p = current_palette(s)
    written = []
    for abs_path, content in system_targets(p, s).items():
        dst = out_dir / abs_path.lstrip("/")
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(content)
        written.append(dst)
    return written


def reload_running() -> None:
    """Попросить запущенные программы подхватить тему."""
    cmds = [["hyprctl", "reload"], ["qs", "ipc", "call", "haotica", "reloadTheme"]]
    for cmd in cmds:
        if shutil.which(cmd[0]):
            os.spawnvp(os.P_NOWAIT, cmd[0], cmd)
