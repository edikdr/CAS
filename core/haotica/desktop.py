"""Записи .desktop: список приложений для лаунчера, «Магазина» и настроек; веб-приложения."""
from __future__ import annotations

import configparser
import os
import re
import urllib.parse
from pathlib import Path

from . import config, paths

APP_DIRS = [paths.XDG_DATA / "applications"] + [
    Path(d) / "applications" for d in os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share").split(":") if d]
AUTOSTART = paths.XDG_CONFIG / "autostart"
WEB_PREFIX = "haotica-web-"


def _read(path: Path) -> dict | None:
    cp = configparser.RawConfigParser(interpolation=None, strict=False)
    cp.optionxform = str
    try:
        cp.read(path, encoding="utf-8")
    except (configparser.Error, UnicodeDecodeError):
        return None
    if not cp.has_section("Desktop Entry"):
        return None
    return dict(cp.items("Desktop Entry"))


def _loc(e: dict, key: str, lang: str) -> str:
    return e.get(f"{key}[{lang}]") or e.get(key, "")


def entries(include_hidden: bool = False) -> list[dict]:
    lang = config.get("locale.ui_language", "ru")
    seen: dict[str, dict] = {}
    for d in APP_DIRS:
        if not d.is_dir():
            continue
        for f in sorted(d.glob("*.desktop")):
            app_id = f.stem
            if app_id in seen:
                continue
            e = _read(f)
            if not e or e.get("Type", "Application") != "Application":
                seen[app_id] = {}
                continue
            hidden = e.get("NoDisplay") == "true" or e.get("Hidden") == "true"
            seen[app_id] = {
                "id": app_id, "file": str(f), "name": _loc(e, "Name", lang), "generic": _loc(e, "GenericName", lang),
                "comment": _loc(e, "Comment", lang), "icon": e.get("Icon", ""), "exec": e.get("Exec", ""),
                "categories": [c for c in e.get("Categories", "").split(";") if c],
                "keywords": [k for k in _loc(e, "Keywords", lang).split(";") if k],
                "terminal": e.get("Terminal") == "true", "hidden": hidden,
                "haotica": app_id.startswith("haotica-"), "web": app_id.startswith(WEB_PREFIX),
                "wmclass": e.get("StartupWMClass", ""), "mime": [m for m in e.get("MimeType", "").split(";") if m],
                "user": str(f).startswith(str(paths.XDG_DATA)),
                "kde_fallback": "X-HAOTICA-Hidden" in e,
            }
    out = [v for v in seen.values() if v and (include_hidden or not v["hidden"])]
    out.sort(key=lambda x: x["name"].lower())
    return out


def autostart_list() -> list[dict]:
    items = []
    for d in (AUTOSTART, Path("/etc/xdg/autostart")):
        for f in sorted(d.glob("*.desktop")) if d.is_dir() else []:
            e = _read(f) or {}
            if any(i["id"] == f.stem for i in items):
                continue
            items.append({"id": f.stem, "name": e.get("Name", f.stem), "enabled": e.get("Hidden") != "true"
                          and e.get("X-GNOME-Autostart-enabled", "true") != "false", "user": d == AUTOSTART})
    return items


def autostart_set(app_id: str, enabled: bool) -> None:
    AUTOSTART.mkdir(parents=True, exist_ok=True)
    dst = AUTOSTART / f"{app_id}.desktop"
    src = next((d / f"{app_id}.desktop" for d in [Path("/etc/xdg/autostart")] + APP_DIRS
                if (d / f"{app_id}.desktop").exists()), None)
    if src is None and not dst.exists():
        return
    text = (dst if dst.exists() else src).read_text(errors="ignore")
    text = re.sub(r"(?m)^Hidden=.*\n?", "", text)
    if not enabled:
        text = text.replace("[Desktop Entry]\n", "[Desktop Entry]\nHidden=true\n", 1)
    dst.write_text(text)


def chrome_app_id(url: str) -> str:
    """app_id окна Chrome в режиме --app (так его видят Hyprland и док)."""
    u = urllib.parse.urlparse(url)
    path = (u.path or "/").rstrip("/").replace("/", "_")
    return f"chrome-{u.netloc}__{path.lstrip('_')}-Default".replace("___", "__")


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:32] or "site"


def webapp_create(name: str, url: str, category: str = "social", isolated: bool = False,
                  monogram: str = "") -> dict:
    from . import icons, theme
    if not re.match(r"^https?://", url):
        url = "https://" + url
    slug = slugify(name)
    app_id = f"{WEB_PREFIX}{slug}"
    chrome = "google-chrome-stable"
    flags = [f"--app={url}"]
    if isolated:
        prof = paths.DATA_DIR / f"chrome-{slug}"
        flags += [f"--user-data-dir={prof}", "--disable-extensions", "--no-first-run"]
    desktop = paths.XDG_DATA / "applications" / f"{app_id}.desktop"
    desktop.parent.mkdir(parents=True, exist_ok=True)
    desktop.write_text("\n".join([
        "[Desktop Entry]", "Type=Application", f"Name={name}", f"Comment={url}",
        f"Exec={chrome} {' '.join(flags)}", f"Icon={app_id}", f"StartupWMClass={chrome_app_id(url)}",
        "Categories=Network;WebBrowser;", f"X-HAOTICA-Category={category}", f"X-HAOTICA-URL={url}",
        f"X-HAOTICA-Isolated={'true' if isolated else 'false'}", ""]))
    p = theme.current_palette()
    mono = monogram or re.sub(r"[^A-Za-z0-9А-Яа-я]", "", name)[:2].upper() or "W"
    icon_dir = paths.XDG_DATA / "icons/HAOTICA/scalable/apps"
    icon_dir.mkdir(parents=True, exist_ok=True)
    (icon_dir / f"{app_id}.svg").write_text(icons.tile_svg(p, f"«{mono}»", category))
    return {"id": app_id, "file": str(desktop), "url": url}


def webapp_delete(app_id: str) -> bool:
    if not app_id.startswith(WEB_PREFIX):
        return False
    f = paths.XDG_DATA / "applications" / f"{app_id}.desktop"
    (paths.XDG_DATA / "icons/HAOTICA/scalable/apps" / f"{app_id}.svg").unlink(missing_ok=True)
    if f.exists():
        f.unlink()
        return True
    return False


# ── установка: .desktop собственных приложений и запасные программы по умолчанию ──
FALLBACK_MIME = {
    "x-scheme-handler/http": "google-chrome.desktop", "x-scheme-handler/https": "google-chrome.desktop",
    "text/html": "google-chrome.desktop", "inode/directory": "haotica-files.desktop",
    "application/pdf": "org.kde.okular.desktop", "application/epub+zip": "org.kde.okular.desktop",
    "text/plain": "org.kde.kate.desktop", "text/markdown": "org.kde.kate.desktop",
    "application/x-shellscript": "org.kde.kate.desktop", "text/x-python": "org.kde.kate.desktop",
    "application/json": "org.kde.kate.desktop", "application/toml": "org.kde.kate.desktop",
    "image/png": "org.kde.gwenview.desktop", "image/jpeg": "org.kde.gwenview.desktop",
    "image/webp": "org.kde.gwenview.desktop", "image/gif": "org.kde.gwenview.desktop",
    "image/avif": "org.kde.gwenview.desktop", "image/svg+xml": "org.kde.gwenview.desktop",
    "video/mp4": "mpv.desktop", "video/x-matroska": "mpv.desktop", "video/webm": "mpv.desktop",
    "video/quicktime": "mpv.desktop", "audio/mpeg": "mpv.desktop", "audio/flac": "mpv.desktop",
    "audio/ogg": "mpv.desktop", "audio/x-wav": "mpv.desktop",
    "application/zip": "org.kde.ark.desktop", "application/x-tar": "org.kde.ark.desktop",
    "application/x-7z-compressed": "org.kde.ark.desktop", "application/vnd.rar": "org.kde.ark.desktop",
}


# предустановленные веб-приложения (окно Chrome --app) и Claude Code; иконки уже есть в теме HAOTICA
PRESET_WEBAPPS = [
    # id, имя, адрес, категория (для лаунчера)
    ("chatgpt", "ChatGPT", "https://chatgpt.com/", "ai"),
    ("gemini", "Gemini", "https://gemini.google.com/app", "ai"),
    ("grok", "Grok", "https://grok.com/", "ai"),
    ("chess", "Chess.com", "https://www.chess.com/", "media"),
    ("github", "GitHub", "https://github.com/", "dev"),
]


def preset_texts() -> dict[str, str]:
    """Тексты .desktop предустановленных веб-приложений и лаунчера Claude Code."""
    out = {}
    for slug, name, url, cat in PRESET_WEBAPPS:
        out[f"{WEB_PREFIX}{slug}.desktop"] = "\n".join([
            "[Desktop Entry]", "Type=Application", f"Name={name}", f"Comment={url}",
            f"Exec=google-chrome-stable --app={url}", f"Icon={WEB_PREFIX}{slug}",
            f"StartupWMClass={chrome_app_id(url)}", "Categories=Network;WebBrowser;",
            f"X-HAOTICA-Category={cat}", f"X-HAOTICA-URL={url}", "X-HAOTICA-Isolated=false", ""])
    out["haotica-claude-code.desktop"] = "\n".join([
        "[Desktop Entry]", "Type=Application", "Name=Claude Code", "Comment=Claude Code в терминале HAOTICA",
        "Exec=haotica-app terminal --run claude", "Icon=haotica-web-claude", "StartupWMClass=haotica-terminal",
        "Categories=Development;", "Keywords=claude;ai;code;", "X-HAOTICA-Category=ai", ""])
    return out


def existing_apps(apps_dir: Path | None = None) -> list:
    """Приложения реестра, у которых есть интерфейс (apps/<имя>/index.html)."""
    from .apps import registry
    root = apps_dir or paths.APPS_DIR
    return [a for a in registry.APPS.values() if (root / a.name / "index.html").is_file()]


def desktop_text(app) -> str:
    lines = ["[Desktop Entry]", "Type=Application", f"Name={app.en}", f"Name[ru]={app.ru}", f"Name[de]={app.en}",
             f"Comment={app.comment}", f"Exec=haotica-app {app.name} %U", f"Icon=haotica-{app.name}",
             f"StartupWMClass=haotica-{app.name}", f"Categories={app.xdg}", "Terminal=false"]
    if app.mime:
        lines.append("MimeType=" + ";".join(app.mime) + ";")
    if app.keywords:
        lines.append("Keywords=" + app.keywords)
    if app.hidden:
        lines.append("NoDisplay=true")
    return "\n".join(lines) + "\n"


def install_entries(dest: Path, apps_dir: Path | None = None, mimeapps: Path | None = None) -> list[str]:
    """Записать haotica-<имя>.desktop только для существующих приложений; убрать устаревшие;
    mimeapps.list: свои приложения там, где они есть, иначе — запасные (Chrome, mpv, KDE)."""
    dest.mkdir(parents=True, exist_ok=True)
    apps = existing_apps(apps_dir)
    presets = preset_texts()
    names = {f"haotica-{a.name}.desktop" for a in apps} | set(presets)
    for old in dest.glob("haotica-*.desktop"):
        if old.name not in names and not old.name.startswith(WEB_PREFIX):
            old.unlink()
    for a in apps:
        (dest / f"haotica-{a.name}.desktop").write_text(desktop_text(a), encoding="utf-8")
    for fname, text in presets.items():
        (dest / fname).write_text(text, encoding="utf-8")
    if mimeapps:
        own = {"inode/directory": "haotica-files.desktop"} if any(a.name == "files" for a in apps) else {}
        mime = {**FALLBACK_MIME, **own}
        mimeapps.parent.mkdir(parents=True, exist_ok=True)
        mimeapps.write_text("[Default Applications]\n" + "".join(f"{k}={v}\n" for k, v in sorted(mime.items())),
                            encoding="utf-8")
    return sorted(names)


def _cli(a) -> int:
    out = install_entries(Path(a.dest), Path(a.apps) if a.apps else None, Path(a.mimeapps) if a.mimeapps else None)
    print("\n".join(out))
    return 0


def register(sub) -> None:
    p = sub.add_parser("desktop", help="создать .desktop-файлы приложений HAOTICA")
    p.add_argument("--dest", default=str(paths.XDG_DATA / "applications"))
    p.add_argument("--apps", default="", help="папка приложений (по умолчанию установленная)")
    p.add_argument("--mimeapps", default="", help="куда записать mimeapps.list")
    p.set_defaults(fn=_cli)
