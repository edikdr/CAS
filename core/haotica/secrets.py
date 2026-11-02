"""Секреты в связке ключей системы (libsecret: GNOME Keyring).

Ключи OpenRouter и ElevenLabs, пароль роутера. Значения не попадают в конфиги, логи
и контекст Haotica; наружу через API отдаётся только маска с последними 4 символами.
"""
from __future__ import annotations

from . import util

NAMES = {
    "openrouter": "OpenRouter API key",
    "elevenlabs": "ElevenLabs API key",
    "router": "Пароль администратора роутера",
    "caldav": "Пароль календаря (CalDAV)",
}


def _attrs(name: str) -> list[str]:
    return ["service", "haotica", "key", name]


async def store(name: str, value: str) -> bool:
    rc, _, _ = await util.arun(["secret-tool", "store", f"--label=HAOTICA · {NAMES.get(name, name)}", *_attrs(name)],
                               10, input=value)
    return rc == 0


async def get(name: str) -> str:
    rc, out, _ = await util.arun(["secret-tool", "lookup", *_attrs(name)], 10)
    return out.strip() if rc == 0 else ""


def get_sync(name: str) -> str:
    r = util.run(["secret-tool", "lookup", *_attrs(name)], 10)
    return r.stdout.strip() if r.returncode == 0 else ""


async def clear(name: str) -> bool:
    rc, _, _ = await util.arun(["secret-tool", "clear", *_attrs(name)], 10)
    return rc == 0


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
    import asyncio
    import getpass
    import sys
    if a.action == "status" or not a.name:
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
        print("✗ связка ключей недоступна (нужны gnome-keyring и secret-tool)", file=sys.stderr)
        return 1
    if a.name in ("openrouter", "elevenlabs"):
        from . import client
        client.haotica("POST", "/api/reload", {}, timeout=5)
    print(f"✓ {NAMES[a.name]}: {'удалён' if a.action == 'remove' else 'сохранён'}")
    return 0


def register(sub) -> None:
    p = sub.add_parser("key", help="API-ключи (OpenRouter, ElevenLabs…) в связке ключей")
    p.add_argument("action", choices=["set", "remove", "status"])
    p.add_argument("name", nargs="?", default="", help=", ".join(NAMES))
    p.set_defaults(fn=_cli)
