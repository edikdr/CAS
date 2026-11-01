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
