"""Терминальные сессии Windows: ConPTY (conpty.ConPtyProcess) + доставка в страницу через Qt.

Поток чтения отдаёт данные сигналом Qt (очередь в главный поток), там они склеиваются пачками
раз в ~8 мс, как в Linux-версии. Команда при запуске (`--run`) вводится страницей после первого
приглашения (OSC 133 A), поэтому здесь не нужна.
"""
from __future__ import annotations

import logging
import time

from PySide6.QtCore import QObject, QTimer, Signal

from . import profiles
from .conpty import ConPtyProcess, hexcode

log = logging.getLogger("haotica.pty")


class Session(QObject):
    _data = Signal(str)
    _exit = Signal(int)

    def __init__(self, sid: str, bridge, cwd: str, cols: int, rows: int, command: str, profile: str = "") -> None:
        super().__init__()
        self.sid, self.bridge = sid, bridge
        self.buf: list[str] = []
        self.alive = True
        self.size = (cols, rows)
        self.tried: list[str] = []
        argv, env, cwd, self.profile = profiles.build(profile, cwd, sid)
        self.timer = QTimer(self)
        self.timer.setSingleShot(True)
        self.timer.setInterval(8)
        self.timer.timeout.connect(self.flush)
        self._data.connect(self._on_data)
        self._exit.connect(self._on_exit)
        self.p = self._start(argv, env, cwd)
        self.pid = self.p.pid

    def _start(self, argv, env, cwd) -> ConPtyProcess:
        self.tried.append(self.profile["id"])
        self.t0 = time.monotonic()
        log.info("оболочка %s: %s (cwd %s)", self.profile["id"],
                 [a if len(a) <= 200 else a[:40] + f"…({len(a)} симв.)" for a in argv], cwd)
        return ConPtyProcess(argv, env, cwd, self.size[0], self.size[1], self._emit_data, self._emit_exit)

    # поток чтения может закончиться уже после закрытия окна, когда объект Qt удалён — это не ошибка
    def _emit_data(self, text: str) -> None:
        try:
            self._data.emit(text)
        except RuntimeError:
            pass

    def _emit_exit(self, code: int) -> None:
        try:
            self._exit.emit(code)
        except RuntimeError:
            pass

    def _fallback(self, code: int) -> bool:
        """Оболочка упала сразу при старте (до 5 с, не 0) — пробуем следующий профиль, чтобы терминал не был мёртвым."""
        if code == 0 or time.monotonic() - self.t0 > 5 or len(self.tried) >= 3:
            return False
        log.warning("оболочка %s завершилась при старте, код %s", self.profile["id"], hexcode(code))
        for p in profiles.detect():
            if p["id"] in self.tried or p["kind"] not in ("pwsh", "cmd"):
                continue
            try:
                failed = self.profile["name"]
                argv, env, cwd, self.profile = profiles.build(p["id"], "", self.sid)
                self.bridge.ptyData.emit(self.sid, f"\x1b[33m[HAOTICA] {failed} не запустилась (код {hexcode(code)}), "
                                                   f"открываю {self.profile['name']}\x1b[0m\r\n")
                self.p = self._start(argv, env, cwd)
                self.pid = self.p.pid
                return True
            except Exception:  # noqa: BLE001
                log.exception("запасной профиль %s", p["id"])
        return False

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
        if self._fallback(code):
            return
        self.alive = False
        self.flush()
        if code:
            log.warning("оболочка %s завершилась с кодом %s", self.profile["id"], hexcode(code))
            self.bridge.ptyData.emit(self.sid, f"\r\n\x1b[31m[HAOTICA] {self.profile['name']}: код {hexcode(code)}. "
                                               f"Подробнее: haotica doctor\x1b[0m\r\n")
        self.bridge.ptyExit.emit(self.sid, code)
