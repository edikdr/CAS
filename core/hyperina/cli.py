"""Команда `hyperina` — управление системой из терминала (то же, что окно «Настройки»)."""
from __future__ import annotations

import argparse
import json
import os
import secrets
import subprocess
import sys
from pathlib import Path

from . import __version__, config, paths


def ensure_token() -> str:
    paths.STATE_DIR.mkdir(parents=True, exist_ok=True)
    if paths.TOKEN_FILE.exists():
        tok = paths.TOKEN_FILE.read_text().strip()
        if tok:
            return tok
    tok = secrets.token_urlsafe(32)
    paths.TOKEN_FILE.write_text(tok + "\n")
    paths.TOKEN_FILE.chmod(0o600)
    return tok


def _parse_value(v: str):
    try:
        return json.loads(v)
    except json.JSONDecodeError:
        return v


def cmd_theme(a: argparse.Namespace) -> int:
    from . import art, icons, theme
    if a.profile:
        config.set_many({"appearance.profile": a.profile.upper()})
    s = config.load()
    p = theme.current_palette(s)
    if a.action == "apply":
        targets = set(a.only.split(",")) if a.only else None
        done = theme.apply(targets, s)
        for k, v in done.items():
            print(f"✓ {k}: {len(v)}")
        if a.assets:
            build_assets(p, s)
        if not a.no_reload:
            theme.reload_running()
    elif a.action == "assets":
        build_assets(p, s)
    elif a.action == "export-system":
        for f in theme.export_system(Path(a.dir), s):
            print(f)
    elif a.action == "plymouth":
        art.render_plymouth(p, Path(a.dir))
    elif a.action == "icons":
        icons.build_icon_theme(p, Path(a.dir or paths.XDG_DATA / "icons/HYPERINA"))
    elif a.action == "check":
        from .palette import check_contrast
        for w in check_contrast(p) or ["контраст в норме"]:
            print(w)
    return 0


def build_assets(p, s) -> None:
    from . import art, icons
    icon_dir = paths.XDG_DATA / "icons/HYPERINA"
    icons.build_icon_theme(p, icon_dir)
    print(f"✓ иконки: {icon_dir}")
    if art.build_cursor_theme(p, icon_dir):
        print("✓ курсор")
    wall = paths.DATA_DIR / "wallpapers" / p.name
    if not (wall / "meta.json").exists():
        art.render_wallpaper(p, wall)
    link = paths.DATA_DIR / "wallpapers/current"
    if link.is_symlink() or link.exists():
        link.unlink()
    link.symlink_to(wall)
    print(f"✓ обои: {wall}")


def cmd_settings(a: argparse.Namespace) -> int:
    if a.action == "get":
        v = config.get(a.key) if a.key else config.load()
        print(json.dumps(v, ensure_ascii=False, indent=1))
    elif a.action == "set":
        config.set_many({a.key: _parse_value(a.value)})
        print(f"✓ {a.key} = {a.value}")
    elif a.action == "reset":
        config.reset(a.key or None)
        print("✓ сброшено" + (f": {a.key}" if a.key else ""))
    elif a.action == "export":
        print(config.export_runtime())
    return 0


def cmd_token(a: argparse.Namespace) -> int:
    ensure_token()
    print(paths.TOKEN_FILE)
    return 0


def cmd_open(a: argparse.Namespace) -> int:
    """Открыть приложение HYPERINA через хост приложений (или запустить его)."""
    from .apps_client import open_app
    return 0 if open_app(a.app, a.args) else 1


def cmd_dev(a: argparse.Namespace) -> int:
    print(json.dumps({"version": __version__, "share": str(paths.SHARE), "runtime": str(paths.RUNTIME_DIR)}, indent=1))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="hyperina", description="HYPERINA — управление системой")
    ap.add_argument("--version", action="version", version=f"HYPERINA {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("theme", help="темы и палитра")
    t.add_argument("action", choices=["apply", "assets", "export-system", "plymouth", "icons", "check"])
    t.add_argument("dir", nargs="?", default="")
    t.add_argument("--profile")
    t.add_argument("--only", help="цели через запятую: runtime,hyprland,gtk,qt,apps,shell")
    t.add_argument("--assets", action="store_true", help="заодно пересобрать обои, иконки и курсор")
    t.add_argument("--no-reload", action="store_true")
    t.set_defaults(fn=cmd_theme)

    s = sub.add_parser("settings", help="настройки")
    s.add_argument("action", choices=["get", "set", "reset", "export"])
    s.add_argument("key", nargs="?", default="")
    s.add_argument("value", nargs="?", default="")
    s.set_defaults(fn=cmd_settings)

    k = sub.add_parser("token", help="создать токен доступа к API")
    k.set_defaults(fn=cmd_token)

    o = sub.add_parser("open", help="открыть приложение HYPERINA")
    o.add_argument("app")
    o.add_argument("args", nargs="*")
    o.set_defaults(fn=cmd_open)

    d = sub.add_parser("info", help="пути и версия")
    d.set_defaults(fn=cmd_dev)

    # подкоманды других модулей регистрируются сами
    for mod in ("doctor", "models", "gamemode", "sounds", "haotica_cli"):
        try:
            m = __import__(f"hyperina.{mod}", fromlist=["register"])
            m.register(sub)
        except ImportError:
            pass

    a = ap.parse_args(argv)
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())
