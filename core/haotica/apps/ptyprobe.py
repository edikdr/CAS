"""Самопроверка терминала: каждая оболочка запускается ровно так, как в окне (с интеграцией HAOTICA), в ConPTY,
получает команду и должна ответить и остаться живой. Запуск: `HaoticaTerminal.exe --module haotica.apps.ptyprobe out.json`
(оконный exe без консоли — как у пользователя; результат в файл) или `python -m haotica.apps.ptyprobe`."""
from __future__ import annotations

import json
import sys
import threading
import time

from . import profiles
from .conpty import ConPtyProcess, hexcode


def check(profile_id: str, wait: float = 15.0, backend: str = "") -> dict:
    argv, env, cwd, prof = profiles.build(profile_id, "", "probe")
    chunks: list[str] = []
    exited: list[int] = []
    ev = threading.Event()
    p = ConPtyProcess(argv, env, cwd, 120, 30, chunks.append, lambda c: (exited.append(c), ev.set()), backend)
    res = {"id": profile_id + (f"/{backend}" if backend else ""), "exe": prof.get("exe", ""), "argv": argv}
    res["env_extra"] = sorted(k for k in env if k.startswith(("_PYI", "_MEI", "PYTHON")))
    t0 = time.monotonic()
    while time.monotonic() - t0 < wait and not ev.is_set():          # ждём приглашение или падение
        if any(m in "".join(chunks) for m in ("\x1b]133;A", "> ", ">")):
            break
        time.sleep(0.1)
    if ev.is_set():
        res.update(ok=False, why=f"завершилась при старте: код {hexcode(exited[0])}", reader_end=getattr(p, "end", ""),
                   out="".join(chunks)[-300:])
        return res
    p.write("echo haotica-ok\r")
    t1 = time.monotonic()
    while time.monotonic() - t1 < 12 and "haotica-ok" not in "".join(chunks)[-400:].replace("echo haotica-ok", "") \
            and not ev.is_set():
        time.sleep(0.1)
    out = "".join(chunks)
    ok = "haotica-ok" in out.split("echo haotica-ok", 1)[-1] and not ev.is_set()
    res.update(ok=ok, why="" if ok else (f"закрылась: код {hexcode(exited[0])}" if exited else "не ответила"), out=out[-300:])
    p.kill()
    return res


def main() -> int:
    rows = []
    try:
        import winpty
        import os
        info = {"winpty": getattr(winpty, "__version__", "?"), "file": getattr(winpty, "__file__", "?"),
                "frozen": getattr(sys, "frozen", False), "files": sorted(os.listdir(os.path.dirname(winpty.__file__)))}
    except Exception as e:  # noqa: BLE001
        info = {"winpty": f"{type(e).__name__}: {e}"}
    rows.append({"id": "_info", "ok": True, **info})
    for prof in profiles.detect():
        if prof["kind"] in ("pwsh", "cmd", "bash"):
            try:
                rows.append(check(prof["id"]))
            except Exception as e:  # noqa: BLE001
                rows.append({"id": prof["id"], "ok": False, "why": f"{type(e).__name__}: {e}"})
    for be in ("ConPTY", "WinPTY"):                                # какая из подсистем консоли работает в этой сборке
        try:
            rows.append(check("cmd", backend=be))
        except Exception as e:  # noqa: BLE001
            rows.append({"id": f"cmd/{be}", "ok": False, "why": f"{type(e).__name__}: {e}"})
    text = json.dumps(rows, ensure_ascii=False, indent=1)
    if len(sys.argv) > 1:
        open(sys.argv[1], "w", encoding="utf-8").write(text)
    else:
        print(text)
    return 0 if len(rows) > 1 and all(r["ok"] for r in rows) else 1


if __name__ == "__main__":
    sys.exit(main())
