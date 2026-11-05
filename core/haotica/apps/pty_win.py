"""Терминальные сессии Windows: ConPTY (conpty.ConPtyProcess) + доставка в страницу через Qt.

Поток чтения отдаёт данные сигналом Qt (очередь в главный поток), там они склеиваются пачками
раз в ~8 мс, как в Linux-версии. Команда при запуске (`--run`) вводится страницей после первого
приглашения (OSC 133 A), поэтому здесь не нужна.
"""
from __future__ import annotations

from PySide6.QtCore import QObject, QTimer, Signal

from . import profiles
from .conpty import ConPtyProcess


class Session(QObject):
    _data = Signal(str)
    _exit = Signal(int)

    def __init__(self, sid: str, bridge, cwd: str, cols: int, rows: int, command: str, profile: str = "") -> None:
        super().__init__()
        self.sid, self.bridge = sid, bridge
        self.buf: list[str] = []
        self.alive = True
        argv, env, cwd, self.profile = profiles.build(profile, cwd, sid)
        self.timer = QTimer(self)
        self.timer.setSingleShot(True)
        self.timer.setInterval(8)
        self.timer.timeout.connect(self.flush)
        self._data.connect(self._on_data)
        self._exit.connect(self._on_exit)
        self.p = ConPtyProcess(argv, env, cwd, cols, rows, self._data.emit, self._exit.emit)
        self.pid = self.p.pid

    def _on_data(self, text: str) -> None:
        self.buf.append(text)
        if sum(len(x) for x in self.buf) > 262144:
            self.flush()
        elif not self.timer.isActive():
            self.timer.start()

    def flush(self) -> None:
        if self.buf:
            chunk = "".join(self.buf)
            self.buf.clear()
            self.bridge.ptyData.emit(self.sid, chunk)

    def ack(self, chars: int) -> None:
        self.p.ack(chars)

    def write(self, data: str) -> None:
        self.p.write(data)

    def resize(self, cols: int, rows: int) -> None:
        self.p.resize(cols, rows)

    def info(self) -> dict:
        return {**self.p.info(), "profile": self.profile["id"], "kind": self.profile["kind"]}

    def kill(self) -> None:
        self.p.kill()

    def _on_exit(self, code: int) -> None:
        if not self.alive:
            return
        self.alive = False
        self.flush()
        self.bridge.ptyExit.emit(self.sid, code)
