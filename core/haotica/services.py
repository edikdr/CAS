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
        # драфт (спекулятивное декодирование) не поддержан сборкой llama.cpp — запуск без него
        if code != 0 and "--spec-type" in svc.argv and time.time() - svc.started < 90:
            paths.STATE_DIR.mkdir(parents=True, exist_ok=True)
            (paths.STATE_DIR / f"llm-{role}.nospec").write_text(f"llama-server: код {code} с драфтом\n",
                                                                 encoding="utf-8")
            svc.argv = models.server_args(role, spec=False)
            log.info("llm-%s: перезапуск без драфта", role)
    return sup.add(f"llm-{role}", argv, port=models.PORTS[role], on_exit=on_exit)


def _tts_service():
    from . import supervisor
    from .tts import runtime
    argv = runtime.argv()
    if not argv:
        return None
    return supervisor.get().add("tts", argv, env=runtime.env(), port=paths.PORT_TTS)


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
