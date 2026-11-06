"""Секреты в хранилище системы: Windows Credential Manager (через `keyring`) или libsecret (GNOME Keyring).

Ключи OpenRouter и ElevenLabs, пароль роутера. Значения не попадают в конфиги, логи
и контекст Haotica; наружу через API отдаётся только маска с последними 4 символами.
"""
from __future__ import annotations

import asyncio
import os

from . import util
from .platform import IS_WINDOWS

SERVICE = "HAOTICA"
NAMES = {
    "openrouter": "OpenRouter API key",
    "elevenlabs": "ElevenLabs API key",
    "router": "Пароль администратора роутера",
    "caldav": "Пароль календаря (CalDAV)",
}


def _keyring():
    """Модуль keyring с настоящим хранилищем (не «пустым» бэкендом) или None."""
    try:
        import keyring
        from keyring.backends import fail
    except ImportError:
        return None
    try:
        kr = keyring.get_keyring()
    except Exception:  # noqa: BLE001
        return None
    return None if isinstance(kr, fail.Keyring) else keyring


def _use_keyring() -> bool:
    return IS_WINDOWS and _keyring() is not None


def _attrs(name: str) -> list[str]:
    return ["service", "haotica", "key", name]


def _kr_set(name: str, value: str) -> bool:
    kr = _keyring()
    try:
        kr.set_password(SERVICE, name, value)
        return True
    except Exception:  # noqa: BLE001
        return False


def _kr_get(name: str) -> str:
    kr = _keyring()
    try:
        return kr.get_password(SERVICE, name) or ""
    except Exception:  # noqa: BLE001
        return ""


def _kr_del(name: str) -> bool:
    kr = _keyring()
    try:
        kr.delete_password(SERVICE, name)
        return True
    except Exception:  # noqa: BLE001 — ключа и не было
        return True


async def store(name: str, value: str) -> bool:
    if _use_keyring():
        return await asyncio.to_thread(_kr_set, name, value)
    rc, _, _ = await util.arun(["secret-tool", "store", f"--label=HAOTICA · {NAMES.get(name, name)}", *_attrs(name)],
                               10, input=value)
    return rc == 0


async def get(name: str) -> str:
    if _use_keyring():
        return await asyncio.to_thread(_kr_get, name)
    rc, out, _ = await util.arun(["secret-tool", "lookup", *_attrs(name)], 10)
    return out.strip() if rc == 0 else ""


def get_sync(name: str) -> str:
    if _use_keyring():
        return _kr_get(name)
    r = util.run(["secret-tool", "lookup", *_attrs(name)], 10)
    return r.stdout.strip() if r.returncode == 0 else ""


async def clear(name: str) -> bool:
    if _use_keyring():
        return await asyncio.to_thread(_kr_del, name)
    rc, _, _ = await util.arun(["secret-tool", "clear", *_attrs(name)], 10)
    return rc == 0


def env_key(*names: str) -> str:
    """Ключ из переменной окружения процесса, а на Windows — и из пользовательских/системных переменных реестра
    (заданных уже после запуска Haotica). Значение не логируется и не пишется в файлы."""
    for n in names:
        v = os.environ.get(n, "").strip()
        if v:
            return v
    if IS_WINDOWS:
        try:
            import winreg
            for root, sub in ((winreg.HKEY_CURRENT_USER, "Environment"),
                              (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment")):
                try:
                    with winreg.OpenKey(root, sub) as k:
                        for n in names:
                            try:
                                v = str(winreg.QueryValueEx(k, n)[0]).strip()
                            except OSError:
                                continue
                            if v:
                                return v
                except OSError:
                    continue
        except ImportError:
            pass
    return ""


def backend() -> str:
    return "Windows Credential Manager" if _use_keyring() else "libsecret (secret-tool)"


def mask(value: str) -> str:
    return ("•" * 8 + value[-4:]) if len(value) > 4 else ("•" * len(value))


async def status() -> dict:
    out = {}
    for name, label in NAMES.items():
        v = await get(name)
        out[name] = {"label": label, "set": bool(v), "mask": mask(v) if v else ""}
    return out


# ── haotica key: ключи из консоли (ввод скрыт, в историю оболочки не попадает) ──
def _cli(a) -> int:
    import getpass
    import sys
    if a.action == "status" or not a.name:
        print(f"  хранилище: {backend()}")
        for name, st in asyncio.run(status()).items():
            print(f"  {'✓' if st['set'] else '·'} {name:<11} {st['label']}  {st['mask']}")
        return 0
    if a.name not in NAMES:
        print(f"неизвестный ключ: {a.name}. Есть: {', '.join(NAMES)}", file=sys.stderr)
        return 2
    if a.action == "remove":
        ok = asyncio.run(clear(a.name))
    else:
        value = sys.stdin.readline().strip() if not sys.stdin.isatty() else getpass.getpass(f"{NAMES[a.name]}: ").strip()
        if not value:
            print("пусто — ничего не изменено", file=sys.stderr)
            return 1
        ok = asyncio.run(store(a.name, value))
    if not ok:
        print(f"✗ хранилище ключей недоступно ({backend()})", file=sys.stderr)
        return 1
    if a.name in ("openrouter", "elevenlabs"):
        from . import client
        client.haotica("POST", "/api/reload", {}, timeout=5)
    print(f"✓ {NAMES[a.name]}: {'удалён' if a.action == 'remove' else 'сохранён'}")
    return 0


def register(sub) -> None:
    p = sub.add_parser("key", help="API-ключи (OpenRouter, ElevenLabs…) в хранилище системы")
    p.add_argument("action", choices=["set", "remove", "status"])
    p.add_argument("name", nargs="?", default="", help=", ".join(NAMES))
    p.set_defaults(fn=_cli)
