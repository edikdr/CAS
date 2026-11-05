"""ConPTY (Windows): оболочка в псевдоконсоли через pywinpty — без Qt, чтобы проверять тестами.

Чтение блокирующее — в отдельном потоке; данные отдаются колбэком on_data(str) пачками.
Обратное давление как у Linux-сессии: при PAUSE_AT неподтверждённых символов поток чтения
ждёт, пока страница не подтвердит отрисовку (ack) до RESUME_AT. kill() завершает всё дерево
процессов оболочки (psutil), а не только её саму.
"""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable

log = logging.getLogger("haotica.conpty")
PAUSE_AT, RESUME_AT = 4_000_000, 1_000_000


class ConPtyProcess:
    def __init__(self, argv: list[str], env: dict, cwd: str, cols: int, rows: int,
                 on_data: Callable[[str], None], on_exit: Callable[[int], None]) -> None:
        from winpty import PtyProcess
        self.on_data, self.on_exit = on_data, on_exit
        cols, rows = max(2, min(1000, cols)), max(1, min(500, rows))
        # список, а не строка: pywinpty сам соберёт командную строку (list2cmdline) и найдёт exe
        self.proc = PtyProcess.spawn(list(argv), cwd=cwd, env=env, dimensions=(rows, cols))
        self.pid = self.proc.pid
        self.unacked = 0
        self.lock = threading.Lock()
        self.resume = threading.Event()
        self.resume.set()
        self.alive = True
        self.running = False                     # по OSC 133: команда выполняется (в т. ч. встроенная, без процесса)
        self.thread = threading.Thread(target=self._reader, name=f"conpty-{self.pid}", daemon=True)
        self.thread.start()

    def _reader(self) -> None:
        while self.alive:
            self.resume.wait()
            try:
                data = self.proc.read(65536)
            except EOFError:
                break
            except OSError:
                break
            if not data:
                if not self.proc.isalive():
                    break
                time.sleep(0.005)
                continue
            if "\x1b]133;" in data:                 # блоки команд: C — выполняется, D/A — закончилась
                last_c, last_d = data.rfind("\x1b]133;C"), max(data.rfind("\x1b]133;D"), data.rfind("\x1b]133;A"))
                if last_c > last_d:
                    self.running = True
                elif last_d > last_c:
                    self.running = False
            with self.lock:
                self.unacked += len(data)
                if self.unacked > PAUSE_AT:
                    self.resume.clear()
            try:
                self.on_data(data)
            except Exception:  # noqa: BLE001
                log.exception("on_data")
        self._finish()

    def ack(self, chars: int) -> None:
        with self.lock:
            self.unacked = max(0, self.unacked - chars)
            if self.unacked < RESUME_AT:
                self.resume.set()

    def write(self, data: str) -> None:
        if self.alive:
            try:
                self.proc.write(data)
            except (OSError, EOFError):
                pass

    def resize(self, cols: int, rows: int) -> None:
        try:
            self.proc.setwinsize(max(1, min(500, rows)), max(2, min(1000, cols)))
        except (OSError, EOFError):
            pass

    def children(self) -> list:
        try:
            import psutil
            return [c for c in psutil.Process(self.pid).children(recursive=True)
                    if c.name().lower() not in ("conhost.exe", "openconsole.exe")]
        except Exception:  # noqa: BLE001
            return []

    def info(self) -> dict:
        kids = self.children()
        name = ""
        if kids:
            try:
                name = max(kids, key=lambda c: c.create_time()).name()
            except Exception:  # noqa: BLE001
                name = ""
        return {"pid": self.pid, "fg": kids[-1].pid if kids else self.pid, "name": name.removesuffix(".exe") or
                ("команда" if self.running else ""), "cwd": "", "busy": bool(kids) or self.running}

    def kill(self) -> None:
        if not self.alive:
            return
        self.alive = False
        self.resume.set()
        for c in reversed(self.children()):
            try:
                c.kill()
            except Exception:  # noqa: BLE001
                pass
        try:
            self.proc.terminate(force=True)
        except Exception:  # noqa: BLE001
            pass

    def _finish(self) -> None:
        self.alive = False
        code = 0
        for _ in range(50):
            try:
                if not self.proc.isalive():
                    break
            except Exception:  # noqa: BLE001
                break
            time.sleep(0.02)
        try:
            code = int(self.proc.exitstatus or 0)
        except (TypeError, ValueError, AttributeError):
            code = 0
        try:
            self.proc.close(force=True)
        except Exception:  # noqa: BLE001
            pass
        try:
            self.on_exit(code)
        except Exception:  # noqa: BLE001
            log.exception("on_exit")


def hexcode(code: int) -> str:
    """Код выхода Windows: отрицательное → NTSTATUS в шестнадцатеричном виде (-1073741502 → 0xC0000142)."""
    return f"{code} (0x{code & 0xFFFFFFFF:08X})" if code < 0 or code > 0xFFFF else str(code)


def probe(argv: list[str], env: dict | None = None, cwd: str | None = None, timeout: float = 10.0) -> tuple[int, str]:
    """Запустить argv в ConPTY, дождаться выхода: (код, вывод). Для doctor — проверка, что оболочка вообще стартует."""
    import os as _os
    chunks: list[str] = []
    done = threading.Event()
    code = [-1]

    def on_exit(c: int) -> None:
        code[0] = c
        done.set()
    p = ConPtyProcess(argv, env or dict(_os.environ), cwd or _os.path.expanduser("~"), 120, 30, chunks.append, on_exit)
    if not done.wait(timeout):
        p.kill()
        return -2, "".join(chunks)
    return code[0], "".join(chunks)
