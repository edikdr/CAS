"""Журнал событий: короткие строки для HUD/дашборда, важные — ещё и уведомлением."""
from __future__ import annotations

import time
from collections import deque

from .. import paths, util

KINDS = {"info", "ok", "warn", "error", "haotica", "net", "power", "security", "game", "update"}
NOTIFY = {"error": "critical", "warn": "normal", "security": "critical"}


class EventLog:
    def __init__(self, hub, size: int = 60) -> None:
        self.hub = hub
        self.items: deque[dict] = deque(maxlen=size)
        self.file = paths.RUNTIME_DIR / "events.json"
        old = util.load_json(self.file, [])
        for e in old[-size:] if isinstance(old, list) else []:
            self.items.append(e)

    def add(self, kind: str, text: str, notify: bool = False, title: str = "", sound: str = "") -> dict:
        kind = kind if kind in KINDS else "info"
        e = {"time": util.now_hm(), "ts": int(time.time()), "kind": kind, "text": text[:160]}
        if sound:
            e["sound"] = sound
        self.items.append(e)
        util.write_json(self.file, list(self.items))
        self.hub.publish("events", e, keep=False)
        if notify:
            util.notify(title or "HYPERINA", text, NOTIFY.get(kind, "normal"))
        return e

    def recent(self, n: int = 20) -> list[dict]:
        return list(self.items)[-n:]
