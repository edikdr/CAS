"""Терминальные сессии HAOTICA: Linux — pty.fork (pty_posix), Windows — ConPTY (pty_win).

Менеджер общий; страница видит одинаковый мост: ptySpawn/ptyWrite/ptyResize/ptyAck/ptyKill/ptyInfo.
"""
from __future__ import annotations

import os
import uuid

from . import profiles

if os.name == "nt":
    from .pty_win import Session
else:
    from .pty_posix import Session


class PtyManager:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}

    def spawn(self, bridge, cwd: str, cols: int, rows: int, command: str = "", profile: str = "") -> str:
        sid = uuid.uuid4().hex[:12]
        self.sessions[sid] = Session(sid, bridge, cwd, cols, rows, command, profile)
        return sid

    def write(self, sid: str, data: str) -> None:
        s = self.sessions.get(sid)
        if s:
            s.write(data)

    def resize(self, sid: str, cols: int, rows: int) -> None:
        s = self.sessions.get(sid)
        if s:
            s.resize(cols, rows)

    def ack(self, sid: str, chars: int) -> None:
        s = self.sessions.get(sid)
        if s:
            s.ack(chars)

    def info(self, sid: str) -> dict:
        s = self.sessions.get(sid)
        return s.info() if s else {}

    def busy(self) -> int:
        """Сколько вкладок сейчас выполняют программу (для подтверждения при закрытии окна)."""
        n = 0
        for s in self.sessions.values():
            try:
                n += 1 if s.alive and s.info().get("busy") else 0
            except Exception:  # noqa: BLE001
                pass
        return n

    def kill(self, sid: str) -> None:
        s = self.sessions.pop(sid, None)
        if s:
            s.kill()

    def kill_all(self) -> None:
        for sid in list(self.sessions):
            self.kill(sid)

    @staticmethod
    def profiles() -> dict:
        return profiles.public()
