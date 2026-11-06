"""Общий сервис метрик: данные собираются один раз и показываются везде (панель, HUD, терминал, монитор).

Пишет $XDG_RUNTIME_DIR/haotica/metrics.json и публикует тему «metrics» в шине.
Частота: 1 с от сети, 2 с от батареи или в игре. Медленные источники опрашиваются реже.
"""
from __future__ import annotations

import asyncio
import glob
import os
import logging
import socket
import time
from pathlib import Path

import psutil

from .. import paths, util

log = logging.getLogger("haotica.metrics")
GIB = 1024 ** 3
PROFILE_NAMES = {"low-power": "quiet", "quiet": "quiet", "cool": "quiet", "balanced": "balanced",
                 "balanced-performance": "balanced+", "performance": "performance", "custom": "custom"}


def find_amdgpu() -> Path | None:
    for card in sorted(glob.glob("/sys/class/drm/card[0-9]*")):
        dev = Path(card) / "device"
        try:
            if (dev / "driver").resolve().name == "amdgpu" and (dev / "gpu_busy_percent").exists():
                return dev
        except OSError:
            continue
    return None


def default_iface() -> str:
    if os.name == "nt":                      # Windows: активный интерфейс с наибольшим трафиком
        try:
            stats = psutil.net_if_stats()
            io = psutil.net_io_counters(pernic=True)
            up = [n for n, st in stats.items() if st.isup and "loopback" not in n.lower() and n in io]
            return max(up, key=lambda n: io[n].bytes_recv + io[n].bytes_sent) if up else ""
        except (OSError, ValueError):
            return ""
    try:
        for line in Path("/proc/net/route").read_text().splitlines()[1:]:
            f = line.split()
            if len(f) > 3 and f[1] == "00000000" and int(f[3], 16) & 2:
                return f[0]
    except OSError:
        pass
    return ""


class Metrics:
    def __init__(self, core) -> None:
        self.core = core
        self.file = paths.RUNTIME_DIR / "metrics.json"
        self.gpu_dev = find_amdgpu() if os.name != "nt" else None
        self.win_gpu = None
        if os.name == "nt":
            from ..winmetrics import GpuCounters, shared_total_gb
            self.win_gpu = GpuCounters()
            self.win_gtt_total = shared_total_gb()
        self.data: dict = {}
        self._net_prev: tuple[float, int, int] | None = None
        self._tick = 0
        self.extra: dict = {}            # другие модули дописывают сюда (recon, game_mode…)
        psutil.cpu_percent(None)

    # ── источники ──────────────────────────────────────────────
    def _fast(self) -> dict:
        d: dict = {"cpu": round(psutil.cpu_percent(None), 1)}
        vm = psutil.virtual_memory()
        d["ram_used_gb"] = round((vm.total - vm.available) / GIB, 1)
        d["ram_total_gb"] = round(vm.total / GIB, 1)
        if self.gpu_dev:
            g = self.gpu_dev
            d["gpu"] = util.read_int(g / "gpu_busy_percent")
            d["gtt_used_gb"] = round(util.read_int(g / "mem_info_gtt_used") / GIB, 1)
            d["gtt_total_gb"] = round(util.read_int(g / "mem_info_gtt_total") / GIB, 1)
            d["vram_used_gb"] = round(util.read_int(g / "mem_info_vram_used") / GIB, 2)
            d["vram_total_gb"] = round(util.read_int(g / "mem_info_vram_total") / GIB, 2)
        elif self.win_gpu is not None:
            d.update(self.win_gpu.sample())
            from ..winmetrics import shared_total_gb
            self.win_gtt_total = max(self.win_gtt_total, shared_total_gb(d.get("gtt_used_gb", 0.0)))
            d["gtt_total_gb"] = self.win_gtt_total
        iface = default_iface()
        d["net_iface"] = iface
        if iface:
            c = psutil.net_io_counters(pernic=True).get(iface)
            now = time.monotonic()
            if c:
                if self._net_prev and self._net_prev[0] < now:
                    dt = now - self._net_prev[0]
                    d["net_down_kbs"] = round(max(0, c.bytes_recv - self._net_prev[1]) / 1024 / dt, 1)
                    d["net_up_kbs"] = round(max(0, c.bytes_sent - self._net_prev[2]) / 1024 / dt, 1)
                self._net_prev = (now, c.bytes_recv, c.bytes_sent)
        return d

    def _thermal(self) -> dict:
        d: dict = {}
        try:
            temps = psutil.sensors_temperatures()
        except (OSError, AttributeError):
            temps = {}
        for name, key in (("k10temp", "temp_cpu"), ("zenpower", "temp_cpu"), ("amdgpu", "temp_gpu")):
            for t in temps.get(name, []):
                if key == "temp_cpu" and t.label not in ("Tctl", "Tdie", ""):
                    continue
                if key == "temp_gpu" and t.label not in ("edge", ""):
                    continue
                d[key] = round(t.current)
                break
        nvme = temps.get("nvme", [])
        if nvme:
            d["temp_ssd"] = round(nvme[0].current)
        try:
            fans = psutil.sensors_fans()
        except (OSError, AttributeError):
            fans = {}
        rpm = [f.current for lst in fans.values() for f in lst if f.current]
        d["fan_rpm"] = int(max(rpm)) if rpm else 0
        d["fans"] = sorted(int(x) for x in rpm)[:4]
        return d

    def _power(self) -> dict:
        d: dict = {}
        prof = util.read("/sys/firmware/acpi/platform_profile")
        d["power_profile"] = PROFILE_NAMES.get(prof, prof or "balanced")
        b = None
        try:
            b = psutil.sensors_battery()
        except (OSError, AttributeError):
            pass
        if b:
            d["battery"] = round(b.percent)
            d["on_battery"] = not b.power_plugged
            status = ""
            for bat in glob.glob("/sys/class/power_supply/BAT*/status"):
                status = util.read(bat)
            d["charging"] = status == "Charging" if status else bool(b.power_plugged and b.percent < 100)
            d["battery_status"] = status.lower()
            if b.secsleft not in (psutil.POWER_TIME_UNLIMITED, psutil.POWER_TIME_UNKNOWN) and b.secsleft > 0:
                d["battery_minutes"] = int(b.secsleft // 60)
            for bat in glob.glob("/sys/class/power_supply/BAT*"):
                pw = util.read_int(Path(bat) / "power_now")
                if pw:
                    d["battery_watts"] = round(pw / 1e6, 1)
        else:
            d["battery"] = -1
            d["on_battery"] = False
            d["charging"] = False
        try:
            du = psutil.disk_usage(str(paths.HOME))
            d["disk_free_gb"] = round(du.free / 1e9)
            d["disk_total_gb"] = round(du.total / 1e9)
        except OSError:
            pass
        sw = psutil.swap_memory()
        d["zram_used_gb"] = round(sw.used / GIB, 2)
        d["zram_total_gb"] = round(sw.total / GIB, 1)
        d["uptime_days"] = int((time.time() - psutil.boot_time()) // 86400)
        d["uptime_hours"] = int((time.time() - psutil.boot_time()) // 3600)
        return d

    async def _network(self, iface: str) -> dict:
        d: dict = {"net_ip": "", "net_name": "", "net_type": ""}
        if iface:
            for a in psutil.net_if_addrs().get(iface, []):
                if a.family == socket.AF_INET:
                    d["net_ip"] = a.address
        if os.name == "nt":
            if iface and d["net_ip"]:
                d["net_name"] = iface
                d["net_type"] = "wifi" if any(w in iface.lower() for w in ("wi-fi", "wlan", "wireless")) else "ethernet"
            return d
        rc, out, _ = await util.arun(["nmcli", "-t", "-f", "NAME,DEVICE,TYPE", "connection", "show", "--active"], 5)
        if rc == 0:
            for line in out.splitlines():
                parts = line.rsplit(":", 2)
                if len(parts) == 3 and parts[1] == iface:
                    d["net_name"] = parts[0].replace("\\:", ":")
                    d["net_type"] = "wifi" if "wireless" in parts[2] else ("vpn" if "vpn" in parts[2] else "ethernet")
        return d

    async def _ping(self) -> int:
        t0 = time.perf_counter()
        try:
            _r, w = await asyncio.wait_for(asyncio.open_connection("1.1.1.1", 443), 2.5)
            w.close()
            return int((time.perf_counter() - t0) * 1000)
        except (OSError, asyncio.TimeoutError):
            return -1

    def _llm(self) -> dict:
        h = util.load_json(paths.RUNTIME_DIR / "haotica.json", {}) or {}
        return {"llm_state": h.get("llm_state", "offline"), "llm_tps": h.get("llm_tps", 0),
                "llm_model": h.get("llm_model", ""), "llm_role": h.get("llm_role", "base")}

    # ── цикл ───────────────────────────────────────────────────
    async def _slow(self) -> None:
        """Сеть раз в 10 с, пинг раз в 20 с — отдельно, чтобы не задерживать быстрые метрики."""
        n = 0
        while True:
            try:
                self.data.update(await self._network(default_iface()))
                if n % 2 == 0:
                    self.data["net_ping_ms"] = await self._ping()
            except Exception:
                log.exception("slow metrics")
            n += 1
            await asyncio.sleep(10)

    async def run(self) -> None:
        asyncio.create_task(self._slow())
        while True:
            t0 = time.monotonic()
            try:
                d = self._fast()
                if self._tick % 2 == 0:
                    d.update(self._thermal())
                if self._tick % 5 == 0:
                    d.update(self._power())
                    d.update(self._llm())
                self.data.update(d)
                self.data["kb_layout"] = self.core.hypr.layout if self.core.hypr else "DE"
                self.data.update(self.extra)
                self.data["ts"] = int(time.time())
                util.write_json(self.file, self.data)
                self.core.hub.publish("metrics", self.data)
                self.core.on_metrics(self.data)
            except Exception:
                log.exception("metrics tick")
            self._tick += 1
            slow = self.data.get("on_battery") or self.extra.get("game_mode")
            await asyncio.sleep(max(0.2, (2.0 if slow else 1.0) - (time.monotonic() - t0)))
