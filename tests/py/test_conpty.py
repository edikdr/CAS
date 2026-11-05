"""ConPTY + интеграция PowerShell/cmd: блоки команд (OSC 133), папка (OSC 7), коды выхода. Только Windows."""
import os
import threading
import time

import pytest

pytestmark = pytest.mark.skipif(os.name != "nt", reason="ConPTY — только Windows")


class Collector:
    """Мини-«терминал»: копит вывод и, как xterm.js, отвечает на запрос позиции курсора (DSR, ESC[6n)."""

    def __init__(self):
        self.buf = ""
        self.lock = threading.Lock()
        self.code = None
        self.proc = None

    def data(self, s):
        with self.lock:
            self.buf += s
        if "\x1b[6n" in s and self.proc is not None:
            self.proc.write("\x1b[1;1R")

    def exit(self, c):
        self.code = c

    def wait(self, needle, t=40):
        t0 = time.time()
        while time.time() - t0 < t:
            with self.lock:
                if needle in self.buf:
                    return True
            time.sleep(0.1)
        return False


def _spawn(profile_kind):
    from haotica.apps import profiles
    from haotica.apps.conpty import ConPtyProcess
    pr = [p for p in profiles.detect() if p["kind"] == profile_kind]
    if not pr:
        pytest.skip(f"нет профиля {profile_kind}")
    argv, env, cwd, _p = profiles.build(pr[0]["id"], os.path.expanduser("~"), "t")
    c = Collector()
    proc = ConPtyProcess(argv, env, cwd, 120, 30, c.data, c.exit)
    c.proc = proc
    if "\x1b[6n" in c.buf:
        proc.write("\x1b[1;1R")
    return proc, c


def test_pwsh_blocks_and_exit_codes():
    proc, c = _spawn("pwsh")
    try:
        assert c.wait("\x1b]133;A"), "приглашение с OSC 133 A: " + repr(c.buf[-400:])
        assert "\x1b]7;file://" in c.buf
        proc.write("Write-Output haotica-ok\r")
        assert c.wait("haotica-ok"), "нет вывода после ввода: " + repr(c.buf[-600:])
        assert c.wait("\x1b]133;D;0"), repr(c.buf[-400:])
        assert "\x1b]7777;cmd=" in c.buf and "\x1b]133;C" in c.buf
        proc.write("cmd /c exit 3\r")
        assert c.wait("\x1b]133;D;3"), repr(c.buf[-400:])
        proc.write("Write-Output 'привет мир'\r")
        assert c.wait("привет мир"), "UTF-8"
    finally:
        proc.kill()
    t0 = time.time()
    while c.code is None and time.time() - t0 < 10:
        time.sleep(0.1)
    assert c.code is not None


def test_cmd_cwd():
    proc, c = _spawn("cmd")
    try:
        assert c.wait("\x1b]7;file://"), repr(c.buf[-300:])
        proc.write("echo haotica-cmd\r")
        assert c.wait("haotica-cmd")
    finally:
        proc.kill()


def test_backpressure_and_kill_tree():
    proc, c = _spawn("pwsh")
    try:
        assert c.wait("\x1b]133;A")
        proc.write("1..20000 | ForEach-Object { \"line $_\" }\r")
        assert c.wait("line 20000", 90), repr(c.buf[-600:])
        proc.write("Start-Sleep 60\r")
        time.sleep(2)
        assert proc.info()["busy"]
    finally:
        kids = proc.children()
        proc.kill()
    time.sleep(1.5)
    import psutil
    assert not any(psutil.pid_exists(k.pid) and k.is_running() and k.status() != psutil.STATUS_ZOMBIE for k in kids)
