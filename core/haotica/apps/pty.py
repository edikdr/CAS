"""Терминальные сессии (PTY) для терминала HAOTICA.

Оболочка запускается в псевдотерминале; вывод склеивается пачками раз в ~8 мс и уходит
в страницу сигналом ptyData. Есть обратное давление: если страница не успевает
отрисовывать (не подтверждает ptyAck), чтение из PTY приостанавливается.
Интеграция с zsh (блоки команд OSC 133, текущая папка OSC 7) — через свой ZDOTDIR.
"""
from __future__ import annotations

import codecs
import errno
import fcntl
import os
import pty
import pwd
import shlex
import signal
import struct
import termios
import uuid
from pathlib import Path

from PySide6.QtCore import QObject, QSocketNotifier, QTimer

from .. import __version__, paths

INTEGRATION = paths.APPS_DIR / "terminal" / "shell"
PAUSE_AT, RESUME_AT = 4_000_000, 1_000_000


def user_shell() -> str:
    try:
        sh = pwd.getpwuid(os.getuid()).pw_shell
    except KeyError:
        sh = ""
    return sh if sh and os.path.exists(sh) else "/bin/bash"


class Session(QObject):
    def __init__(self, sid: str, bridge, cwd: str, cols: int, rows: int, command: str) -> None:
        super().__init__()
        self.sid, self.bridge = sid, bridge
        self.decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self.buf: list[str] = []
        self.unacked = 0
        self.alive = True
        shell = user_shell()
        env = dict(os.environ)
        env.update({"TERM": "xterm-256color", "COLORTERM": "truecolor", "TERM_PROGRAM": "haotica",
                    "TERM_PROGRAM_VERSION": __version__, "HAOTICA_TERM_SESSION": sid})
        env.pop("HAOTICA_DEBUG", None)
        argv = [shell, "-l"]
        name = os.path.basename(shell)
        if name == "zsh" and (INTEGRATION / "zsh/.zshrc").exists():
            env["HAOTICA_USER_ZDOTDIR"] = env.get("ZDOTDIR", str(paths.HOME))
            env["ZDOTDIR"] = str(INTEGRATION / "zsh")
        elif name == "bash" and (INTEGRATION / "bash/haotica.bash").exists():
            argv = [shell, "--rcfile", str(INTEGRATION / "bash/haotica.bash"), "-i"]
        if command:
            env["HAOTICA_RUN"] = command          # интеграция выполнит команду после первого приглашения
        cwd = os.path.expanduser(cwd or "~")
        if not os.path.isdir(cwd):
            cwd = str(paths.HOME)
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
        return {"pid": self.pid, "fg": fg, "name": name, "cwd": cwd, "busy": fg != self.pid}

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


class PtyManager:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}

    def spawn(self, bridge, cwd: str, cols: int, rows: int, command: str = "") -> str:
        sid = uuid.uuid4().hex[:12]
        self.sessions[sid] = Session(sid, bridge, cwd, cols, rows, command)
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

    def kill(self, sid: str) -> None:
        s = self.sessions.pop(sid, None)
        if s:
            s.kill()

    def kill_all(self) -> None:
        for sid in list(self.sessions):
            self.kill(sid)


def quote(cmd: str) -> str:
    return shlex.quote(cmd)
