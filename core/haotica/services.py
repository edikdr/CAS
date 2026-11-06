"""Управление службами HAOTICA: systemd --user (HAOTICA OS) или встроенный супервизор (Windows).

Имена: llm-base, llm-deep, llm-fast, tts. На Linux можно включить супервизор вместо systemd
(HAOTICA_SUPERVISE=1) — так проверяются Windows-пути запуска моделей без Windows.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

from . import paths, util

log = logging.getLogger("haotica.services")


def supervised() -> bool:
    return os.name == "nt" or os.environ.get("HAOTICA_SUPERVISE") == "1"


def _llm_service(role: str):
    from . import models, supervisor
    sup = supervisor.get()
    argv = models.server_args(role)

    def on_exit(svc, code: int) -> None:
        """Упал при запуске: по журналу — нехватка памяти (контекст меньше), драфт (без него), испорченный файл.
        Безнадёжный случай — без бесконечных перезапусков, причина видна в интерфейсе."""
        if code == 0 or time.time() - svc.started > 180:
            return
        why = models.on_start_failure(role, _tail(svc.log_file))
        if why in ("oom", "spec"):
            svc.argv = models.server_args(role)
            svc.error = ""
            log.info("llm-%s: %s — перезапуск с %s", role, why,
                     "меньшим контекстом" if why == "oom" else "без драфта")
        elif why == "oom-final":
            svc.wanted, svc.error = False, "не хватает памяти видеокарты даже с контекстом 16K — закройте тяжёлые " \
                                           "программы или выберите вариант модели легче (Настройки → Модели)"
        elif why == "file":
            svc.wanted, svc.error = False, "файл модели повреждён — haotica models verify, затем download"
        elif svc.failures >= 4:
            svc.wanted, svc.error = False, f"llama-server падает при запуске (код {code}), журнал: {svc.log_file}"
    return sup.add(f"llm-{role}", argv, port=models.PORTS[role], on_exit=on_exit)


def _tail(p, n: int = 16384) -> str:
    try:
        with open(p, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - n))
            return f.read().decode("utf-8", "replace")
    except OSError:
        return ""


def error(name: str) -> str:
    """Последняя причина, по которой служба не поднялась (для сообщения владельцу)."""
    if not supervised():
        return ""
    from . import supervisor
    svc = supervisor.get().services.get(name)
    return getattr(svc, "error", "") if svc else ""


def _tts_service():
    from . import supervisor
    from .tts import runtime
    argv = runtime.argv()
    if not argv:
        return None
    svc = supervisor.get().add("tts", argv, env=runtime.env(), port=paths.PORT_TTS)
    svc.low_priority = True          # Chatterbox на процессоре занимает все ядра — окно и браузер важнее
    svc.before_restart = lambda s: runtime.python()      # перед повтором — проверить и починить Python окружения
    return svc


def _resolve(name: str):
    if name.startswith("llm-"):
        return _llm_service(name[4:])
    if name == "tts":
        return _tts_service()
    return None


async def start(name: str) -> tuple[bool, str]:
    if not supervised():
        rc, _, err = await util.arun(["systemctl", "--user", "start", f"haotica-{name}.service"], 30)
        return rc == 0, err.strip()[:300]
    try:
        svc = await asyncio.to_thread(_resolve, name)
    except SystemExit as e:                  # нет llama-server или файла модели
        return False, str(e)
    except Exception as e:  # noqa: BLE001
        return False, f"{type(e).__name__}: {e}"
    if svc is None:
        return False, f"{name}: не установлено"
    from . import supervisor
    ok = await asyncio.to_thread(supervisor.get().start, name)
    return ok, "" if ok else f"{name}: не запустился (журнал {svc.log_file})"


async def stop(name: str) -> None:
    if not supervised():
        await util.arun(["systemctl", "--user", "stop", f"haotica-{name}.service"], 60)
        return
    from . import supervisor
    await asyncio.to_thread(supervisor.get().stop, name, 20)


def status() -> dict:
    if not supervised():
        return {}
    from . import supervisor
    return supervisor.get().status()
