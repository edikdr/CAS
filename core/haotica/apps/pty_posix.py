"""Терминальные сессии Linux: оболочка в псевдотерминале (pty.fork).

Вывод склеивается пачками раз в ~8 мс и уходит в страницу сигналом ptyData. Обратное давление:
если страница не успевает отрисовывать (не подтверждает ptyAck), чтение приостанавливается.
Интеграция с оболочкой (блоки OSC 133, папка OSC 7) — profiles.build.
"""
from __future__ import annotations

import codecs
import errno
import fcntl
import os
import pty
import signal
import struct
import termios
from pathlib import Path

from PySide6.QtCore import QObject, QSocketNotifier, QTimer

from . import profiles

PAUSE_AT, RESUME_AT = 4_000_000, 1_000_000


class Session(QObject):
    def __init__(self, sid: str, bridge, cwd: str, cols: int, rows: int, command: str, profile: str = "") -> None:
        super().__init__()
        self.sid, self.bridge = sid, bridge
        self.decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self.buf: list[str] = []
        self.unacked = 0
        self.alive = True
        self.running = False
        argv, env, cwd, self.profile = profiles.build(profile, cwd, sid)
        if command:
            env["HAOTICA_RUN"] = command          # интеграция выполнит команду после первого приглашения
        pid, fd = pty.fork()
        if pid == 0:                                # дочерний процесс
            try:
                os.chdir(cwd)
                os.execvpe(argv[0], argv, env)
            finally:
                os._exit(127)
        self.pid, self.fd = pid, fd
        self.resize(cols, rows)
        os.set_blocking(fd, False)
        self.notifier = QSocketNotifier(fd, QSocketNotifier.Type.Read, self)
        self.notifier.activated.connect(self._read)
        self.timer = QTimer(self)
        self.timer.setSingleShot(True)
        self.timer.setInterval(8)
        self.timer.timeout.connect(self.flush)

    def _read(self) -> None:
        try:
            data = os.read(self.fd, 131072)
        except BlockingIOError:
            return
        except OSError as e:
            if e.errno in (errno.EIO, errno.EBADF):
                data = b""
            else:
                raise
        if not data:
            self._finish()
            return
        text = self.decoder.decode(data)
        if "\x1b]133;" in text:
            c, d = text.rfind("\x1b]133;C"), max(text.rfind("\x1b]133;D"), text.rfind("\x1b]133;A"))
            if c != d:
                self.running = c > d
        if text:
            self.buf.append(text)
            self.unacked += len(text)
            if sum(len(x) for x in self.buf) > 262144:
                self.flush()
            elif not self.timer.isActive():
                self.timer.start()
        if self.unacked > PAUSE_AT:
            self.notifier.setEnabled(False)

    def flush(self) -> None:
        if self.buf:
            chunk = "".join(self.buf)
            self.buf.clear()
            self.bridge.ptyData.emit(self.sid, chunk)

    def ack(self, chars: int) -> None:
        self.unacked = max(0, self.unacked - chars)
        if self.alive and self.unacked < RESUME_AT and not self.notifier.isEnabled():
            self.notifier.setEnabled(True)

    def write(self, data: str) -> None:
        if not self.alive:
            return
        raw = data.encode("utf-8", "replace")
        while raw:
            try:
                n = os.write(self.fd, raw)
                raw = raw[n:]
            except BlockingIOError:
                import select
                select.select([], [self.fd], [], 0.5)
            except OSError:
                return

    def resize(self, cols: int, rows: int) -> None:
        cols, rows = max(2, min(1000, cols)), max(1, min(500, rows))
        try:
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        except OSError:
            pass

    def info(self) -> dict:
        """Текущий процесс на переднем плане и его папка — для заголовка вкладки и файловой панели."""
        try:
            fg = os.tcgetpgrp(self.fd)
        except OSError:
            fg = self.pid
        name, cwd = "", ""
        try:
            name = Path(f"/proc/{fg}/comm").read_text().strip()
            cwd = os.readlink(f"/proc/{fg}/cwd")
        except OSError:
            pass
        return {"pid": self.pid, "fg": fg, "name": name, "cwd": cwd, "busy": fg != self.pid or self.running,
                "profile": self.profile["id"], "kind": self.profile["kind"]}

    def kill(self) -> None:
        if not self.alive:
            return
        try:
            os.killpg(os.getpgid(self.pid), signal.SIGHUP)
        except OSError:
            pass
        self._finish()

    def _finish(self) -> None:
        if not self.alive:
            return
        self.alive = False
        self.flush()
        self.notifier.setEnabled(False)
        code = 0
        try:
            _pid, status = os.waitpid(self.pid, os.WNOHANG)
            code = os.waitstatus_to_exitcode(status) if _pid else 0
        except ChildProcessError:
            pass
        try:
            os.close(self.fd)
        except OSError:
            pass
        self.bridge.ptyExit.emit(self.sid, code)
