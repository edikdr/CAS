"""Палитра HAOTICA: профили, токены и цветовые утилиты."""
from __future__ import annotations

import colorsys
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from . import paths

PROFILE_ORDER = ["MIX", "HYPERION", "SUBJECT", "ESCAPE", "ARCH", "RIDER", "SPACE"]
TOKENS = ("bg0", "bg1", "bg2", "line", "ink", "dim", "accent", "accent2")
SEMANTIC = ("teal", "amber", "coral", "green", "violet", "sky")


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in rgb)


def mix(a: str, b: str, t: float) -> str:
    """Смешать цвета: t=0 → a, t=1 → b."""
    ra, rb = hex_to_rgb(a), hex_to_rgb(b)
    return rgb_to_hex(tuple(ra[i] + (rb[i] - ra[i]) * t for i in range(3)))


def lighten(c: str, t: float) -> str:
    return mix(c, "#FFFFFF", t)


def darken(c: str, t: float) -> str:
    return mix(c, "#000000", t)


def luminance(c: str) -> float:
    def ch(v: int) -> float:
        s = v / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = hex_to_rgb(c)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def saturation(c: str) -> float:
    r, g, b = (x / 255 for x in hex_to_rgb(c))
    return colorsys.rgb_to_hls(r, g, b)[2]


def rgba_hypr(c: str, alpha: float = 1.0) -> str:
    """Формат Hyprland: rgba(rrggbbaa)."""
    return f"rgba({c.lstrip('#').lower()}{round(alpha * 255):02x})"


def argb_qt(c: str, alpha: float = 1.0) -> str:
    """Формат Qt: #AARRGGBB."""
    return f"#{round(alpha * 255):02x}{c.lstrip('#').lower()}"


def css_rgba(c: str, alpha: float) -> str:
    r, g, b = hex_to_rgb(c)
    return f"rgba({r}, {g}, {b}, {alpha:g})"


@dataclass
class Palette:
    name: str
    label: str
    tokens: dict[str, str]
    semantic: dict[str, str]
    categories: dict[str, str]
    fonts: dict[str, str]
    geometry: dict[str, int]
    extra: dict[str, str] = field(default_factory=dict)

    def __getitem__(self, k: str) -> str:
        if k in self.tokens:
            return self.tokens[k]
        if k in self.semantic:
            return self.semantic[k]
        return self.extra[k]

    def all_colors(self) -> dict[str, str]:
        return {**self.tokens, **self.semantic, **self.extra}

    def category_color(self, cat: str) -> str:
        return self.semantic.get(self.categories.get(cat, "sky"), self.semantic["sky"])


def load_raw(path: Path | None = None) -> dict:
    with open(path or paths.PALETTE_FILE, "rb") as f:
        return tomllib.load(f)


def build(profile: str = "MIX", custom: dict | None = None, raw: dict | None = None) -> Palette:
    raw = raw or load_raw()
    profiles = raw["profiles"]
    base_name = profile if profile in profiles else "MIX"
    prof = dict(profiles[base_name])
    if profile == "CUSTOM" and custom:
        prof.update({k: v for k, v in custom.items() if k in TOKENS})
    tokens = {k: prof[k] for k in TOKENS}
    semantic = dict(raw["semantic"])
    if profile == "CUSTOM" and custom:
        semantic.update({k: v for k, v in custom.items() if k in SEMANTIC})
    # производные оттенки: слабые заливки и состояния
    extra = {
        "ink_faint": mix(tokens["bg1"], tokens["ink"], 0.08),
        "ink_soft": mix(tokens["bg1"], tokens["ink"], 0.18),
        "line_hi": mix(tokens["line"], tokens["ink"], 0.35),
        "accent_dim": mix(tokens["bg1"], tokens["accent"], 0.35),
        "hover": mix(tokens["bg2"], tokens["ink"], 0.06),
        "selection": mix(tokens["bg1"], tokens["accent"], 0.28),
        "shadow": "#000000",
    }
    return Palette(
        name=profile if profile in profiles or profile == "CUSTOM" else "MIX",
        label=prof.get("label", profile),
        tokens=tokens,
        semantic=semantic,
        categories=dict(raw.get("categories", {})),
        fonts=dict(raw.get("fonts", {})),
        geometry={k: int(v) for k, v in raw.get("geometry", {}).items()},
        extra=extra,
    )


def check_contrast(p: Palette) -> list[str]:
    """Предупреждения о плохой читаемости (для своего профиля в Настройках)."""
    warn = []
    if contrast(p["ink"], p["bg1"]) < 7:
        warn.append(f"Основной текст на фоне панели: контраст {contrast(p['ink'], p['bg1']):.1f}:1 (нужно ≥ 7)")
    if contrast(p["dim"], p["bg1"]) < 4.5:
        warn.append(f"Второстепенный текст: контраст {contrast(p['dim'], p['bg1']):.1f}:1 (нужно ≥ 4.5)")
    for k in SEMANTIC:
        if contrast(p[k], p["bg0"]) < 4.5:
            warn.append(f"Цвет {k} плохо виден на чёрном: {contrast(p[k], p['bg0']):.1f}:1")
    return warn
