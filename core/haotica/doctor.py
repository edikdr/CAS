"""`haotica doctor` — проверка системы в стиле досье: ядро, GPU, службы, звук, камера, модели."""
from __future__ import annotations

import glob
import os
import platform
import shutil
import socket
from pathlib import Path

from . import paths, util

C = {"ok": "\033[38;2;127;178;106m", "warn": "\033[38;2;224;162;67m", "fail": "\033[38;2;224;112;90m",
     "dim": "\033[38;2;163;155;135m", "rst": "\033[0m"}


def line(name: str, status: str, info: str = "") -> None:
    dots = "." * max(3, 34 - len(name))
    label = {"ok": "OK", "warn": "WARN", "fail": "FAIL"}[status]
    print(f"  > {name} {C['dim']}{dots}{C['rst']} {C[status]}{label}{C['rst']}  {C['dim']}{info}{C['rst']}")


def port_open(port: int) -> bool:
    try:
        with socket.create_connection((paths.HOST, port), 0.5):
            return True
    except OSError:
        return False


def run() -> int:
    print(f"\n  {C['warn']}HAOTICA // SYSTEM DIAGNOSTICS{C['rst']}\n")
    fails = 0
    rel = platform.release()
    major = tuple(int(x) for x in rel.split("-")[0].split(".")[:2] if x.isdigit())
    line("KERNEL", "ok" if major >= (6, 18) else "warn", rel)
    cmdline = util.read("/proc/cmdline")
    for param in ("ttm.pages_limit", "iommu=pt", "amd_pstate=active"):
        line(f"PARAM {param}", "ok" if param in cmdline else "warn", "" if param in cmdline else "нет в /proc/cmdline")
    gpu = next((Path(c) / "device" for c in glob.glob("/sys/class/drm/card[0-9]*")
                if (Path(c) / "device/mem_info_gtt_total").exists()), None)
    if gpu:
        gtt = util.read_int(gpu / "mem_info_gtt_total") / 1024 ** 3
        line("GPU GTT POOL", "ok" if gtt >= 40 else "warn", f"{gtt:.1f} ГиБ")
    else:
        line("GPU amdgpu", "fail", "драйвер не найден")
        fails += 1
    if shutil.which("vulkaninfo"):
        r = util.run(["vulkaninfo", "--summary"], 15)
        ok = "RADV" in r.stdout
        line("VULKAN RADV", "ok" if ok else "fail", "Radeon 8060S" if ok else "нет устройства Vulkan")
        fails += 0 if ok else 1
    full = not paths.DEV_ROOT                 # полная система HAOTICA; в «терминальной» версии (Ubuntu) нет greetd и оболочки
    if full:
        r = util.run(["systemctl", "is-enabled", "greetd.service"], 5)
        line("GREETER greetd", "ok" if r.stdout.strip() == "enabled" else "fail", r.stdout.strip() or "нет")
        fails += 0 if r.stdout.strip() == "enabled" else 1
    for unit, need in (("haotica-core", True), ("haotica-shell", full), ("haotica-agent", True),
                       ("haotica-llm-base", False), ("haotica-llm-fast", False), ("haotica-models", False)):
        if unit == "haotica-shell" and not full:
            continue
        r = util.run(["systemctl", "--user", "is-active", f"{unit}.service"], 5)
        st = r.stdout.strip() or "нет сеанса"
        bad = need and st not in ("active", "activating")
        line(f"SERVICE {unit}", "ok" if st == "active" else ("fail" if bad and st == "failed" else "warn"), st)
        fails += 1 if bad and st == "failed" else 0
    for name, port in (("CORE API", paths.PORT_CORE), ("HAOTICA API", paths.PORT_HAOTICA),
                       ("LLM BASE", paths.PORT_LLM_BASE), ("LLM FAST", paths.PORT_LLM_FAST),
                       ("LLM DEEP", paths.PORT_LLM_DEEP)):
        line(f"PORT {name}", "ok" if port_open(port) else "warn", str(port))
    from . import models
    exe = models.llama_server()
    line("LLAMA-SERVER", "ok" if exe else "fail", str(exe) if exe else "не собран (./install.sh --only 50 --force)")
    fails += 0 if exe else 1
    r = util.run(["pactl", "info"], 5)
    sink = next((ln.split(":", 1)[1].strip() for ln in r.stdout.splitlines() if ln.startswith("Default Sink")), "")
    line("AUDIO OUTPUT", "ok" if sink and "auto_null" not in sink else "fail", sink or "нет устройства вывода")
    cams = sorted(glob.glob("/dev/video*"))
    line("CAMERA", "ok" if cams else "warn", f"{len(cams)} устройств")
    ir = any("IR" in util.read(f"/sys/class/video4linux/{Path(c).name}/name") or
             "Infrared" in util.read(f"/sys/class/video4linux/{Path(c).name}/name") for c in cams)
    line("IR CAMERA", "ok" if ir else "warn", "для входа по лицу" if ir else "не найдена — лицо по обычной камере")
    try:
        mstat = models.status()
    except Exception:  # noqa: BLE001
        mstat = {}
    for role, m in mstat.items():
        pct = int(100 * m["have"] / max(1, m["size"]))
        line(f"MODEL {role}", "ok" if m["ready"] else "warn",
             m["label"] if m["ready"] else (f"загрузка {pct}%" if m["have"] else "не скачана (haotica models download)"))
    st = os.statvfs(str(paths.HOME))
    free = st.f_bavail * st.f_frsize / 1e9
    line("DISK FREE", "ok" if free > 40 else ("warn" if free > 10 else "fail"), f"{free:.0f} ГБ")
    if full:
        charge = util.run(["/usr/lib/haotica/bin/haotica-charge-limit", "status"], 5).stdout.strip()
        line("CHARGE LIMIT", "ok" if charge and charge != "нет" else "warn", charge or "нет управления")
    print()
    return 1 if fails else 0
