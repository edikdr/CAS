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
    for unit in ("haotica-core", "haotica-shell", "haotica-agent", "haotica-llm-base", "haotica-llm-fast",
                 "haotica-tts"):
        r = util.run(["systemctl", "--user", "is-active", f"{unit}.service"], 5)
        st = r.stdout.strip()
        line(f"SERVICE {unit}", "ok" if st == "active" else ("warn" if st in ("inactive", "activating") else "fail"), st)
    for name, port in (("CORE API", paths.PORT_CORE), ("HAOTICA API", paths.PORT_HAOTICA),
                       ("LLM BASE", paths.PORT_LLM_BASE), ("LLM FAST", paths.PORT_LLM_FAST), ("VOICE", paths.PORT_TTS)):
        line(f"PORT {name}", "ok" if port_open(port) else "warn", str(port))
    r = util.run(["pactl", "info"], 5)
    sink = next((ln.split(":", 1)[1].strip() for ln in r.stdout.splitlines() if ln.startswith("Default Sink")), "")
    line("AUDIO OUTPUT", "ok" if sink and "auto_null" not in sink else "fail", sink or "нет устройства вывода")
    cams = sorted(glob.glob("/dev/video*"))
    line("CAMERA", "ok" if cams else "warn", f"{len(cams)} устройств")
    ir = any("IR" in util.read(f"/sys/class/video4linux/{Path(c).name}/name") or
             "Infrared" in util.read(f"/sys/class/video4linux/{Path(c).name}/name") for c in cams)
    line("IR CAMERA", "ok" if ir else "warn", "для входа по лицу" if ir else "не найдена — лицо по обычной камере")
    manifest = util.load_json(paths.MODELS_DIR / "manifest.json", {}) or {}
    for role, m in (manifest.get("models") or {}).items():
        f = paths.MODELS_DIR / m.get("file", "")
        line(f"MODEL {role}", "ok" if f.is_file() else "fail", f.name if f.is_file() else "файл не загружен")
        fails += 0 if f.is_file() else 1
    st = os.statvfs(str(paths.HOME))
    free = st.f_bavail * st.f_frsize / 1e9
    line("DISK FREE", "ok" if free > 40 else ("warn" if free > 10 else "fail"), f"{free:.0f} ГБ")
    charge = util.run(["/usr/lib/haotica/bin/haotica-charge-limit", "status"], 5).stdout.strip()
    line("CHARGE LIMIT", "ok" if charge and charge != "нет" else "warn", charge or "нет управления")
    print()
    return 1 if fails else 0
