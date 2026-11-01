"""Команда `haotica` — управление системой из терминала (то же, что окно «Настройки»)."""
from __future__ import annotations

import argparse
import json
import secrets
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
        icons.build_icon_theme(p, Path(a.dir or paths.XDG_DATA / "icons/HAOTICA"))
    elif a.action == "portrait":
        out = export_portraits(Path(a.dir) if a.dir else None)
        print(f"✓ портрет: {out}" if out else "✗ портрет не получился (нужен PySide6 и ядро)")
    elif a.action == "check":
        from .palette import check_contrast
        for w in check_contrast(p) or ["контраст в норме"]:
            print(w)
    return 0


PORTRAIT_STATES = ["idle", "reading", "thinking", "speaking", "happy", "warning", "sleep"]


def export_portraits(out_dir: Path | None = None) -> Path | None:
    """Портрет Haotica во всех состояниях → PNG для оболочки (рисует хост приложений без окна)."""
    import os
    import subprocess
    import tempfile
    out_dir = out_dir or paths.DATA_DIR / "avatar"
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        sheet = Path(tmp) / "sheet.png"
        env = {**os.environ, "HAOTICA_SNAPSHOT": str(sheet), "HAOTICA_SNAPSHOT_DELAY": "3500", "QT_QPA_PLATFORM": "offscreen",
               "QTWEBENGINE_CHROMIUM_FLAGS": os.environ.get("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu")}
        cmd = [sys.executable, "-m", "haotica.apps", "portrait"]
        try:
            subprocess.run(cmd, env=env, timeout=90, capture_output=True)
        except subprocess.TimeoutExpired:
            return None
        if not sheet.exists():
            return None
        from PIL import Image
        im = Image.open(sheet).convert("RGBA")
        cw = im.width // len(PORTRAIT_STATES)
        for i, name in enumerate(PORTRAIT_STATES):
            im.crop((i * cw, 0, (i + 1) * cw, im.height)).save(out_dir / f"{name}.png", optimize=True)
    return out_dir


def build_assets(p, s) -> None:
    from . import art, icons
    icon_dir = paths.XDG_DATA / "icons/HAOTICA"
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
    link.symlink_to(wall.name)          # относительная: переживает перенос домашней папки
    print(f"✓ обои: {wall}")
    if export_portraits():
        print("✓ портрет Haotica")


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
    """Открыть приложение HAOTICA через хост приложений (или запустить его)."""
    from .apps_client import open_app
    return 0 if open_app(a.app, a.args) else 1


def cmd_dev(a: argparse.Namespace) -> int:
    print(json.dumps({"version": __version__, "share": str(paths.SHARE), "runtime": str(paths.RUNTIME_DIR)}, indent=1))
    return 0


def cmd_gamemode(a: argparse.Namespace) -> int:
    from . import client
    body = {"toggle": True} if a.action == "toggle" else ({} if a.action == "status" else {"on": a.action == "on"})
    res = client.core("GET" if a.action == "status" else "POST", "/api/gamemode", None if a.action == "status" else body)
    if res is None:
        print("ядро HAOTICA не отвечает (systemctl --user status haotica-core)")
        return 1
    print("РЕЖИМ «ИГРА»:", "ВКЛ" if res.get("on") else "ВЫКЛ")
    return 0


def cmd_screenshot(a: argparse.Namespace) -> int:
    from . import screenshot
    f = screenshot.shot(a.mode, edit=a.edit)
    if f:
        print(f)
    return 0 if f else 1


def cmd_record(a: argparse.Namespace) -> int:
    from . import screenshot
    print(screenshot.record_toggle(a.mode, a.audio))
    return 0


def cmd_keyboard(a: argparse.Namespace) -> int:
    import subprocess
    step = {"up": "+1", "down": "1-"}.get(a.value, a.value)
    r = subprocess.run(["brightnessctl", "--device=*::kbd_backlight", "-m", "set", step], capture_output=True, text=True)
    try:
        cur, mx = int(r.stdout.split(",")[2]), int(r.stdout.split(",")[4])
    except (IndexError, ValueError):
        return 1
    level = cur / mx if mx else 0
    subprocess.run(["qs", "-p", str(paths.SHELL_DIR), "ipc", "call", "haotica", "osd", "keyboard", f"{level:.2f}"],
                   capture_output=True)
    config.set_many({"keyboard.backlight_brightness": cur})
    return 0


def cmd_lid(a: argparse.Namespace) -> int:
    from . import client
    client.core("POST", "/api/lid", {"state": a.state})
    return 0


def cmd_update(_a: argparse.Namespace) -> int:
    """Обновление системы в терминале: пакеты, AUR, Flatpak, прошивки."""
    import shutil
    import subprocess
    steps = []
    if shutil.which("paru"):
        steps.append(["paru", "-Syu", "--sudoloop"])
    else:
        steps.append(["sudo", "pacman", "-Syu"])
    if shutil.which("flatpak"):
        steps.append(["flatpak", "update", "-y"])
    for cmd in steps:
        print(f"\033[38;2;224;162;67m> {' '.join(cmd)}\033[0m")
        if subprocess.run(cmd).returncode != 0:
            print("Шаг завершился с ошибкой — Haotica может разобрать вывод выше.")
            return 1
    if shutil.which("fwupdmgr"):
        subprocess.run(["fwupdmgr", "get-updates"])
    print("\033[38;2;95;168;160m✓ система обновлена\033[0m")
    if shutil.which("haotica"):
        subprocess.run(["haotica", "theme", "apply", "--no-reload"], capture_output=True)
    return 0


def cmd_doctor(_a: argparse.Namespace) -> int:
    from . import doctor
    return doctor.run()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="haotica", description="HAOTICA — управление системой")
    ap.add_argument("--version", action="version", version=f"HAOTICA {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("theme", help="темы и палитра")
    t.add_argument("action", choices=["apply", "assets", "export-system", "plymouth", "icons", "check", "portrait"])
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

    o = sub.add_parser("open", help="открыть приложение HAOTICA")
    o.add_argument("app")
    o.add_argument("args", nargs="*")
    o.set_defaults(fn=cmd_open)

    d = sub.add_parser("info", help="пути и версия")
    d.set_defaults(fn=cmd_dev)

    g = sub.add_parser("gamemode", help="режим «Игра»")
    g.add_argument("action", choices=["on", "off", "toggle", "status"])
    g.set_defaults(fn=cmd_gamemode)

    sc = sub.add_parser("screenshot", help="скриншот")
    sc.add_argument("mode", nargs="?", default="screen", choices=["screen", "area", "window"])
    sc.add_argument("--edit", action="store_true", help="открыть разметку")
    sc.set_defaults(fn=cmd_screenshot)

    rc = sub.add_parser("record", help="запись экрана (повтор — стоп)")
    rc.add_argument("mode", nargs="?", default="screen", choices=["screen", "area", "window"])
    rc.add_argument("--audio", action="store_true")
    rc.set_defaults(fn=cmd_record)

    kb = sub.add_parser("keyboard", help="подсветка клавиатуры")
    kb.add_argument("what", choices=["brightness"])
    kb.add_argument("value", help="up, down или число")
    kb.set_defaults(fn=cmd_keyboard)

    ld = sub.add_parser("lid", help="событие крышки (из Hyprland)")
    ld.add_argument("state", choices=["close", "open"])
    ld.set_defaults(fn=cmd_lid)

    up = sub.add_parser("update", help="обновить систему")
    up.set_defaults(fn=cmd_update)

    dc = sub.add_parser("doctor", help="проверка системы")
    dc.set_defaults(fn=cmd_doctor)

    # подкоманды других модулей регистрируются сами
    for mod in ("models", "sounds", "agent_cli"):
        try:
            m = __import__(f"haotica.{mod}", fromlist=["register"])
            m.register(sub)
        except ImportError:
            pass

    a = ap.parse_args(argv)
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())
