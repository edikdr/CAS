"""`haotica doctor` для Windows (HAOTICA Terminal): процессы, порты, llama-server и видеокарта, модели, речь,
диск, права, оболочки. checks() — список проверок (тот же список отдаёт ядро на /api/doctor для мастера)."""
from __future__ import annotations

import os
import platform
import shutil
import socket
import sys

from . import paths


def _port(port: int) -> bool:
    try:
        with socket.create_connection((paths.HOST, port), 0.5):
            return True
    except OSError:
        return False


def _gpu_devices(exe) -> list[str]:
    """Устройства, которые видит llama.cpp (Vulkan/HIP): `llama-server --list-devices`."""
    import subprocess
    try:
        r = subprocess.run([str(exe), "--list-devices"], capture_output=True, text=True, timeout=20,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.TimeoutExpired):
        return []
    out = (r.stdout + r.stderr).splitlines()
    return [ln.strip() for ln in out if ":" in ln and any(k in ln for k in ("Vulkan", "ROCm", "HIP", "Radeon", "AMD", "NVIDIA", "Intel"))]


def checks() -> list[dict]:
    res: list[dict] = []

    def add(name, status, info=""):
        res.append({"name": name, "status": status, "info": str(info)})
    if os.name == "nt":
        build = sys.getwindowsversion().build
        add("WINDOWS", "ok" if build >= 19041 else "warn", f"{'11' if build >= 22000 else '10'} · сборка {build}")
    else:
        add("ОС", "warn", platform.platform() + " (не Windows)")
    add("PYTHON", "ok", f"{platform.python_version()} {'(сборка)' if getattr(sys, 'frozen', False) else ''}")
    try:
        import PySide6
        ver = getattr(PySide6, "__version__", "") or "есть"
        add("QT / WEBENGINE", "ok", ver)
    except Exception:  # noqa: BLE001 — в консольном haotica.exe Qt нет: проверяет окно
        add("QT / WEBENGINE", "ok" if getattr(sys, "frozen", False) else "fail",
            "в составе HaoticaTerminal.exe" if getattr(sys, "frozen", False) else "PySide6 не установлен")
    try:
        import winpty  # noqa: F401
        add("CONPTY (pywinpty)", "ok")
    except ImportError:
        add("CONPTY (pywinpty)", "fail", "pip install pywinpty")
    from .apps import profiles
    pr = profiles.detect()
    add("ОБОЛОЧКИ", "ok" if pr else "fail", ", ".join(p["name"] for p in pr) or "нет")
    for name, port in (("ЯДРО", paths.PORT_CORE), ("HAOTICA", paths.PORT_HAOTICA), ("МОДЕЛЬ FAST", paths.PORT_LLM_FAST),
                       ("МОДЕЛЬ BASE", paths.PORT_LLM_BASE), ("МОДЕЛЬ DEEP", paths.PORT_LLM_DEEP), ("РЕЧЬ", paths.PORT_TTS)):
        up = _port(port)
        add(f"ПОРТ {name}", "ok" if up else ("fail" if port in (paths.PORT_CORE,) else "warn"), f"{port} {'слушает' if up else 'нет'}")
    from . import models
    exe = models.llama_server()
    add("LLAMA-SERVER", "ok" if exe else "fail", str(exe) if exe else "не установлен: haotica llama install")
    if exe:
        dev = _gpu_devices(exe)
        add("ВИДЕОКАРТА (llama.cpp)", "ok" if dev else "warn", "; ".join(dev[:2]) if dev else "GPU не виден — обновите драйвер AMD Adrenalin")
        try:
            from .llama_win import chosen
            add("БЭКЕНД", "ok" if chosen() else "warn", chosen() or "не выбран: haotica llama bench")
        except ImportError:
            pass
    try:
        for role, m in models.status().items():
            pct = int(100 * m["have"] / max(1, m["size"]))
            add(f"МОДЕЛЬ {role}", "ok" if m["ready"] else "warn",
                m["label"] if m["ready"] else (f"загрузка {pct}%" if m["have"] else "не скачана"))
    except Exception as e:  # noqa: BLE001
        add("МОДЕЛИ", "warn", e)
    from .tts import runtime
    add("СЛУЖБА РЕЧИ", "ok" if runtime.python() else "warn", str(runtime.python() or "не установлена: haotica voice install"))
    du = shutil.disk_usage(paths.DATA_DIR if paths.DATA_DIR.exists() else paths.HOME)
    free = du.free / 1e9
    add("ДИСК", "ok" if free > 60 else ("warn" if free > 20 else "fail"), f"свободно {free:.0f} ГБ (base ≈ 19 ГБ, deep ≈ 45 ГБ)")
    try:
        paths.ensure_dirs()
        t = paths.STATE_DIR / ".write-test"
        t.write_text("ok", encoding="utf-8")
        t.unlink()
        add("ПРАВА НА ЗАПИСЬ", "ok", str(paths.DATA_DIR.parent))
    except OSError as e:
        add("ПРАВА НА ЗАПИСЬ", "fail", e)
    from . import secrets
    add("КЛЮЧИ", "ok", secrets.backend())
    add("ЖУРНАЛЫ", "ok", str(paths.LOG_DIR))
    try:
        import psutil
        vm = psutil.virtual_memory()
        add("ПАМЯТЬ", "ok" if vm.total > 48e9 else "warn", f"{vm.total / 2 ** 30:.0f} ГиБ (видеокарте доступно ≈ половина)")
    except ImportError:
        pass
    return res


C = {"ok": "\033[38;2;127;178;106m", "warn": "\033[38;2;224;162;67m", "fail": "\033[38;2;224;112;90m",
     "dim": "\033[38;2;163;155;135m", "rst": "\033[0m"}


def run() -> int:
    if os.name == "nt":
        os.system("")                                   # включить VT-цвета в старой консоли
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    print(f"\n  {C['warn']}HAOTICA TERMINAL // DIAGNOSTICS{C['rst']}\n")
    fails = 0
    for c in checks():
        dots = "." * max(3, 30 - len(c["name"]))
        label = {"ok": "OK", "warn": "WARN", "fail": "FAIL"}[c["status"]]
        print(f"  > {c['name']} {C['dim']}{dots}{C['rst']} {C[c['status']]}{label}{C['rst']}  {C['dim']}{c['info']}{C['rst']}")
        fails += c["status"] == "fail"
    print(f"\n  {C['dim']}подробно: {paths.LOG_DIR}{C['rst']}\n")
    return 1 if fails else 0
