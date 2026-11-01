"""`haotica open <приложение>`: передать аргументы запущенному окну или запустить его."""
from __future__ import annotations

import json
import socket

from . import paths, util
from .apps import registry


def open_app(name: str, args: list[str] | None = None) -> bool:
    args = list(args or [])
    app = registry.get(name)
    if app is None:
        print(f"нет приложения «{name}». Есть: {', '.join(registry.APPS)}")
        return False
    sock = paths.RUNTIME_DIR / f"app-{app.name}.sock"
    if sock.exists():
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                s.settimeout(2)
                s.connect(str(sock))
                s.sendall((json.dumps({"cmd": "open", "args": args}, ensure_ascii=False) + "\n").encode())
                if s.recv(16).startswith(b"ok"):
                    return True
        except OSError:
            pass
    util.spawn(["haotica-app", app.name, *[a for a in args if a != "--toggle"]])
    return True
