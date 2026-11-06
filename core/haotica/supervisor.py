"""Супервизор процессов HAOTICA (вместо systemd на Windows; на Linux — для разработки и тестов).

Запускает дочерние процессы (ядро, агент, llama-server, синтез речи), перезапускает упавшие
с нарастающей паузой, пишет их вывод в журналы (paths.LOG_DIR/<имя>.log). На Windows все
процессы попадают в Job Object с KILL_ON_JOB_CLOSE: закрылось окно терминала (или упал хост) —
система сама завершает всё дерево, «висящих» llama-server не остаётся.
"""
from __future__ import annotations

import atexit
import logging
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from . import paths

log = logging.getLogger("haotica.supervisor")
IS_WINDOWS = os.name == "nt"


# ── Job Object (Windows) ─────────────────────────────────────────
class Job:
    """Задача Windows, которая при закрытии последнего дескриптора завершает все свои процессы."""

    def __init__(self) -> None:
        self.handle = None
        if not IS_WINDOWS:
            return
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self.k32 = k32

        class IoCounters(ctypes.Structure):
            _fields_ = [(n, ctypes.c_ulonglong) for n in ("ReadOperationCount", "WriteOperationCount",
                                                          "OtherOperationCount", "ReadTransferCount",
                                                          "WriteTransferCount", "OtherTransferCount")]

        class BasicLimit(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_longlong), ("PerJobUserTimeLimit", ctypes.c_longlong),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class ExtendedLimit(ctypes.Structure):
            _fields_ = [("BasicLimitInformation", BasicLimit), ("IoInfo", IoCounters),
                        ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        k32.CreateJobObjectW.restype = wintypes.HANDLE
        h = k32.CreateJobObjectW(None, None)
        if not h:
            log.warning("CreateJobObject: %s", ctypes.get_last_error())
            return
        info = ExtendedLimit()
        info.BasicLimitInformation.LimitFlags = 0x2000 | 0x400 | 0x800   # KILL_ON_JOB_CLOSE | DIE_ON_UNHANDLED_EXCEPTION | BREAKAWAY_OK
        ok = k32.SetInformationJobObject(h, 9, ctypes.byref(info), ctypes.sizeof(info))  # ExtendedLimitInformation
        if not ok:
            log.warning("SetInformationJobObject: %s", ctypes.get_last_error())
        self.handle = h

    def assign_pid(self, pid: int) -> bool:
        if not self.handle:
            return False
        h = self.k32.OpenProcess(0x0001 | 0x0100, False, pid)      # PROCESS_TERMINATE | PROCESS_SET_QUOTA
        if not h:
            return False
        try:
            return bool(self.k32.AssignProcessToJobObject(self.handle, h))
        finally:
            self.k32.CloseHandle(h)

    def assign_self(self) -> bool:
        if not self.handle:
            return False
        return bool(self.k32.AssignProcessToJobObject(self.handle, self.k32.GetCurrentProcess()))


_JOB: Job | None = None


def adopt_job() -> Job | None:
    """Поместить текущий процесс (и всех будущих потомков) в общую задачу. Безопасно вызывать много раз."""
    global _JOB
    if _JOB is None and IS_WINDOWS:
        _JOB = Job()
        if not _JOB.assign_self():
            log.info("процесс уже в задаче другого родителя — потомки будут добавляться по одному")
    return _JOB


# ── службы ───────────────────────────────────────────────────────
def python_argv(module: str) -> list[str]:
    """Как запустить модуль haotica тем же интерпретатором (или собранным HaoticaTerminal.exe)."""
    if getattr(sys, "frozen", False):          # сборка: службы запускает HaoticaTerminal.exe --module …
        exe = Path(sys.executable).with_name("HaoticaTerminal.exe")
        exe_s = str(exe if exe.exists() else sys.executable)
        if module == "haotica.apps":          # окна: HaoticaTerminal.exe <приложение> … (точка входа окна)
            return [exe_s]
        return [exe_s, "--module", module]
    exe = sys.executable
    if IS_WINDOWS and exe.lower().endswith("pythonw.exe"):
        exe = exe[:-5] + ".exe"   # pythonw → python: у служб нет окна (CREATE_NO_WINDOW), но нужны std-потоки
    return [exe, "-m", module]


def _short(arg: str) -> str:
    return arg if len(arg) <= 200 else arg[:60] + f"…({len(arg)} симв.)"


def port_open(port: int, host: str = paths.HOST, timeout: float = 0.3) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


@dataclass
class Service:
    name: str
    argv: list[str]
    env: dict = field(default_factory=dict)
    cwd: str = ""
    restart: bool = True
    port: int = 0
    proc: subprocess.Popen | None = None
    started: float = 0.0
    failures: int = 0
    wanted: bool = False
    next_try: float = 0.0
    on_exit: object = None           # колбэк (service, code) — например, откат без драфта у llama-server
    log_file: Path | None = None
    error: str = ""                  # почему служба остановлена без перезапуска (для интерфейса)
    low_priority: bool = False       # фоновая тяжёлая работа (синтез речи на CPU) не должна тормозить окно

    def running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None


class Supervisor:
    def __init__(self) -> None:
        self.services: dict[str, Service] = {}
        self.lock = threading.RLock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        adopt_job()
        atexit.register(self.stop_all)

    def add(self, name: str, argv: list[str], env: dict | None = None, cwd: str = "", restart: bool = True,
            port: int = 0, on_exit=None) -> Service:
        with self.lock:
            svc = self.services.get(name)
            if svc and svc.running():
                svc.argv, svc.env, svc.restart, svc.on_exit = argv, env or {}, restart, on_exit
                return svc
            svc = Service(name, argv, env or {}, cwd, restart, port, on_exit=on_exit,
                          log_file=paths.LOG_DIR / f"{name}.log")
            self.services[name] = svc
            return svc

    def _spawn(self, svc: Service) -> None:
        paths.LOG_DIR.mkdir(parents=True, exist_ok=True)
        try:                                           # журнал не растёт бесконечно: больше 5 МБ — в <имя>.log.1
            if svc.log_file.stat().st_size > 5_000_000:
                svc.log_file.replace(svc.log_file.with_name(svc.log_file.name + ".1"))
        except OSError:
            pass
        logf = open(svc.log_file, "ab", buffering=0)  # noqa: SIM115 — живёт вместе с процессом
        logf.write(f"\n── {time.strftime('%Y-%m-%d %H:%M:%S')} start: {' '.join(_short(a) for a in svc.argv)}\n".encode())
        kw: dict = {}
        if IS_WINDOWS:
            kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | getattr(subprocess, "CREATE_NO_WINDOW", 0) | \
                (getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0x4000) if svc.low_priority else 0)
        else:
            kw["start_new_session"] = True
            if svc.low_priority:
                kw["preexec_fn"] = lambda: os.nice(10)
        # stderr процесса уже идёт в этот журнал — сам процесс второй раз в файл не пишет (иначе строки перемешиваются)
        env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", "HAOTICA_LOG_TO_STDERR": "1", **svc.env}
        svc.proc = subprocess.Popen(svc.argv, stdin=subprocess.DEVNULL, stdout=logf, stderr=subprocess.STDOUT,
                                    cwd=svc.cwd or None, env=env, **kw)
        logf.close()
        svc.started = time.time()
        if _JOB is not None and _JOB.handle:
            _JOB.assign_pid(svc.proc.pid)     # на случай, если сам процесс в задачу не попал
        log.info("%s запущен (pid %s)", svc.name, svc.proc.pid)

    def start(self, name: str) -> bool:
        with self.lock:
            svc = self.services.get(name)
            if not svc:
                return False
            svc.wanted = True
            if not svc.running():
                try:
                    self._spawn(svc)
                except OSError as e:
                    log.warning("%s не запустился: %s", name, e)
                    svc.failures += 1
                    return False
        self._ensure_thread()
        return True

    def stop(self, name: str, timeout: float = 10) -> None:
        with self.lock:
            svc = self.services.get(name)
            if not svc:
                return
            svc.wanted = False
            proc = svc.proc
        if proc is None or proc.poll() is not None:
            return
        try:
            if IS_WINDOWS:
                proc.terminate()
            else:
                os.killpg(proc.pid, signal.SIGTERM)
        except OSError:
            pass
        try:
            proc.wait(timeout)
        except subprocess.TimeoutExpired:
            try:
                proc.kill() if IS_WINDOWS else os.killpg(proc.pid, signal.SIGKILL)
            except OSError:
                pass
            proc.wait(5)
        log.info("%s остановлен", name)

    def state(self, name: str) -> str:
        svc = self.services.get(name)
        if not svc:
            return "missing"
        if svc.running():
            return "active"
        return "failed" if svc.wanted and svc.failures else "inactive"

    def status(self) -> dict:
        return {n: {"state": self.state(n), "pid": s.proc.pid if s.running() else None, "failures": s.failures,
                    "log": str(s.log_file)} for n, s in self.services.items()}

    def stop_all(self) -> None:
        self._stop.set()
        for name in list(self.services):
            try:
                self.stop(name, 5)
            except Exception:  # noqa: BLE001
                pass

    def _ensure_thread(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._watch, name="haotica-supervisor", daemon=True)
        self._thread.start()

    def _watch(self) -> None:
        while not self._stop.wait(0.5):
            with self.lock:
                for svc in self.services.values():
                    if not svc.wanted or svc.proc is None:
                        continue
                    code = svc.proc.poll()
                    if code is None:
                        if time.time() - svc.started > 60:
                            svc.failures = 0
                        continue
                    if svc.next_try == 0:
                        log.warning("%s завершился с кодом %s", svc.name, code)
                        if callable(svc.on_exit):
                            try:
                                svc.on_exit(svc, code)
                            except Exception:  # noqa: BLE001
                                log.exception("on_exit %s", svc.name)
                        if not svc.restart:
                            svc.wanted = False
                            continue
                        svc.failures += 1
                        svc.next_try = time.time() + min(30.0, 2 ** min(svc.failures, 5) * 0.5)
                    if svc.wanted and time.time() >= svc.next_try:
                        svc.next_try = 0
                        try:
                            self._spawn(svc)
                        except OSError as e:
                            log.warning("%s: перезапуск не удался: %s", svc.name, e)
                            svc.next_try = time.time() + 30


_SUP: Supervisor | None = None


def get() -> Supervisor:
    global _SUP
    if _SUP is None:
        _SUP = Supervisor()
    return _SUP


def ensure_backend(wait: float = 6.0, with_agent: bool = True) -> Supervisor | None:
    """Поднять ядро и агента, если они ещё не слушают порты (окно терминала на Windows, разработка)."""
    need = [("core", "haotica.server", paths.PORT_CORE)]
    if with_agent:
        need.append(("agent", "haotica.agent", paths.PORT_HAOTICA))
    missing = [x for x in need if not port_open(x[2])]
    if not missing:
        return None
    sup = get()
    env = {}
    if not getattr(sys, "frozen", False):
        env["PYTHONPATH"] = os.pathsep.join(x for x in (str(paths.LIB_DIR), os.environ.get("PYTHONPATH", "")) if x)
    for name, module, port in missing:
        sup.add(name, python_argv(module), env=env, port=port)
        sup.start(name)
    t0 = time.time()
    while time.time() - t0 < wait and not port_open(paths.PORT_CORE):
        time.sleep(0.1)
    return sup
