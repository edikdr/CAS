"""Общие помощники: запуск процессов, атомарная запись, чтение sysfs."""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any


def which(name: str) -> str | None:
    return shutil.which(name)


def read(path: str | Path, default: str = "") -> str:
    try:
        return Path(path).read_text().strip()
    except OSError:
        return default


def read_int(path: str | Path, default: int = 0) -> int:
    try:
        return int(read(path) or default)
    except ValueError:
        return default


def atomic_write(path: Path, data: str | bytes, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = data.encode("utf-8") if isinstance(data, str) else data
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_json(path: Path, obj: Any, mode: int = 0o644) -> None:
    atomic_write(path, json.dumps(obj, ensure_ascii=False, separators=(",", ":")), mode)


def load_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def run(cmd: list[str], timeout: float = 10, check: bool = False, input: str | None = None,
        env: dict | None = None) -> subprocess.CompletedProcess:
    """Синхронный запуск с таймаутом; отсутствующая программа → код 127, без исключения."""
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=check, input=input,
                              env={**os.environ, **env} if env else None)
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, 127, "", f"{cmd[0]}: не найдено")
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, "", f"{cmd[0]}: превышено время ожидания")


async def arun(cmd: list[str], timeout: float = 15, input: str | None = None,
               env: dict | None = None) -> tuple[int, str, str]:
    """Асинхронный запуск: (код, stdout, stderr)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdin=asyncio.subprocess.PIPE if input is not None else asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            env={**os.environ, **env} if env else None)
    except FileNotFoundError:
        return 127, "", f"{cmd[0]}: не найдено"
    try:
        out, err = await asyncio.wait_for(proc.communicate(input.encode() if input is not None else None), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return 124, "", f"{cmd[0]}: превышено время ожидания"
    return proc.returncode or 0, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")


def spawn(cmd: list[str], env: dict | None = None) -> None:
    """Запустить и забыть (без зомби: двойной fork через setsid)."""
    try:
        subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True, env={**os.environ, **env} if env else None)
    except FileNotFoundError:
        pass


def notify(title: str, body: str = "", urgency: str = "normal", icon: str = "haotica-assistant",
           app: str = "HAOTICA") -> None:
    if which("notify-send"):
        spawn(["notify-send", "-a", app, "-u", urgency, "-i", icon, title, body])


def now_hm() -> str:
    return time.strftime("%H:%M")


def human_bytes(n: float) -> str:
    for unit in ("Б", "КБ", "МБ", "ГБ", "ТБ"):
        if abs(n) < 1024 or unit == "ТБ":
            return f"{n:.0f} {unit}" if unit == "Б" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} ТБ"
