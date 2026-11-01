"""Вызов hyperina-helper через pkexec (пароль спрашивает окно polkit оболочки HYPERINA)."""
from __future__ import annotations

import json

from . import util

HELPER = "/usr/lib/hyperina/bin/hyperina-helper"


async def call(action: str, *args: str, timeout: float = 300) -> dict:
    rc, out, err = await util.arun(["pkexec", HELPER, action, *args], timeout=timeout)
    if rc in (126, 127) and not out:
        return {"ok": False, "error": "отменено" if rc == 126 else (err.strip() or "pkexec недоступен"), "cancelled": rc == 126}
    try:
        return json.loads(out.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {"ok": rc == 0, "error": (err or out).strip()[:300]}
