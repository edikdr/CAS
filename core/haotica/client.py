"""Простой клиент API ядра и Haotica для командной строки и приложений (без asyncio)."""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from . import paths


def token() -> str:
    try:
        return paths.TOKEN_FILE.read_text().strip()
    except OSError:
        return ""


def call(method: str, path: str, body: dict | None = None, port: int = paths.PORT_CORE,
         timeout: float = 10) -> dict | None:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"http://{paths.HOST}:{port}{path}", data=data, method=method,
                                 headers={"X-Haotica-Token": token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read() or b"{}")
        except ValueError:
            return {"ok": False, "error": f"HTTP {e.code}"}
    except (urllib.error.URLError, TimeoutError, ConnectionError, ValueError):
        return None


def core(method: str, path: str, body: dict | None = None, timeout: float = 10) -> dict | None:
    return call(method, path, body, paths.PORT_CORE, timeout)


def haotica(method: str, path: str, body: dict | None = None, timeout: float = 30) -> dict | None:
    return call(method, path, body, paths.PORT_HAOTICA, timeout)
