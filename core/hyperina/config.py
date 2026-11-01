"""Настройки HYPERINA: значения по умолчанию + пользовательский settings.toml.

Пользовательский файл хранит только изменённые значения. Запись атомарная,
после каждой записи обновляется $XDG_RUNTIME_DIR/hyperina/settings.json для оболочки.
"""
from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
import tomllib
from pathlib import Path
from typing import Any

from . import paths

try:
    import tomli_w
except ImportError:  # pragma: no cover - на целевой системе пакет есть
    tomli_w = None

_lock = threading.RLock()


def _deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def _diff(full: dict, base: dict) -> dict:
    """Оставить только значения, отличающиеся от умолчаний."""
    out: dict = {}
    for k, v in full.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            d = _diff(v, base[k])
            if d:
                out[k] = d
        elif base.get(k, object()) != v:
            out[k] = v
    return out


def load_defaults() -> dict:
    with open(paths.DEFAULTS_FILE, "rb") as f:
        return tomllib.load(f)


def load_user(path: Path | None = None) -> dict:
    p = path or paths.SETTINGS_FILE
    if not p.exists():
        return {}
    try:
        with open(p, "rb") as f:
            return tomllib.load(f)
    except (tomllib.TOMLDecodeError, OSError):
        # повреждённый файл не должен ломать систему: сохраняем копию и работаем с умолчаниями
        bad = p.with_suffix(".toml.broken")
        try:
            p.replace(bad)
        except OSError:
            pass
        return {}


def load() -> dict:
    with _lock:
        return _deep_merge(load_defaults(), load_user())


def _atomic_write(path: Path, data: bytes, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def atomic_write_text(path: Path, text: str, mode: int = 0o644) -> None:
    _atomic_write(path, text.encode("utf-8"), mode)


def atomic_write_json(path: Path, obj: Any) -> None:
    _atomic_write(path, json.dumps(obj, ensure_ascii=False, indent=1).encode("utf-8"))


def _dump_toml(obj: dict) -> str:
    if tomli_w is not None:
        return tomli_w.dumps(obj)
    # запасной сериализатор для простых типов
    lines: list[str] = []

    def val(v: Any) -> str:
        if isinstance(v, bool):
            return "true" if v else "false"
        if isinstance(v, (int, float)):
            return repr(v)
        if isinstance(v, list):
            return "[" + ", ".join(val(x) for x in v) + "]"
        return json.dumps(str(v), ensure_ascii=False)

    def walk(d: dict, prefix: str) -> None:
        scalars = {k: v for k, v in d.items() if not isinstance(v, dict)}
        tables = {k: v for k, v in d.items() if isinstance(v, dict)}
        if prefix and scalars:
            lines.append(f"[{prefix}]")
        for k, v in scalars.items():
            lines.append(f"{k} = {val(v)}")
        if scalars:
            lines.append("")
        for k, v in tables.items():
            walk(v, f"{prefix}.{k}" if prefix else k)

    walk(obj, "")
    return "\n".join(lines)


def save(full: dict) -> None:
    with _lock:
        user = _diff(full, load_defaults())
        _atomic_write(paths.SETTINGS_FILE, _dump_toml(user).encode("utf-8"))
        export_runtime(full)


def get(key: str, default: Any = None, settings: dict | None = None) -> Any:
    cur: Any = settings if settings is not None else load()
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def set_many(changes: dict[str, Any]) -> dict:
    """Применить {"appearance.profile": "SPACE", ...} и сохранить. Возвращает новые настройки."""
    with _lock:
        full = load()
        for key, value in changes.items():
            parts = key.split(".")
            cur = full
            for part in parts[:-1]:
                cur = cur.setdefault(part, {})
            cur[parts[-1]] = value
        save(full)
        return full


def reset(section: str | None = None) -> dict:
    with _lock:
        if section is None:
            user: dict = {}
        else:
            user = load_user()
            user.pop(section, None)
        _atomic_write(paths.SETTINGS_FILE, _dump_toml(user).encode("utf-8"))
        full = load()
        export_runtime(full)
        return full


# Ключи, которые нужны оболочке (остальное ей не нужно знать)
_SHELL_SECTIONS = ("appearance", "effects", "animations", "sound", "locale", "display",
                   "desktop", "notifications", "gamemode", "haotica", "power", "keyboard")


def export_runtime(full: dict | None = None) -> Path:
    full = full if full is not None else load()
    out = {k: full.get(k, {}) for k in _SHELL_SECTIONS}
    out["haotica"] = {k: v for k, v in out.get("haotica", {}).items() if k in ("enabled", "mode", "voice", "avatar")}
    paths.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    target = paths.RUNTIME_DIR / "settings.json"
    atomic_write_json(target, out)
    return target
