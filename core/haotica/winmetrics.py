"""Метрики видеокарты на Windows через счётчики производительности (PDH, без сторонних пакетов).

\\GPU Engine(*engtype_3D)\\Utilization Percentage — загрузка 3D/Compute;
\\GPU Adapter Memory(*)\\Shared Usage / Dedicated Usage — память (у Radeon 8060S почти вся «общая»).
Счётчики собираются раз в цикл метрик; при любой ошибке возвращается пустой словарь.
"""
from __future__ import annotations

import ctypes
import logging
import os

log = logging.getLogger("haotica.winmetrics")
GIB = 1024 ** 3
PDH_FMT_DOUBLE = 0x00000200
PDH_MORE_DATA = 0x800007D2


class _Value(ctypes.Structure):
    _fields_ = [("CStatus", ctypes.c_ulong), ("doubleValue", ctypes.c_double)]


class _Item(ctypes.Structure):
    _fields_ = [("szName", ctypes.c_wchar_p), ("FmtValue", _Value)]


class GpuCounters:
    PATHS = {"engine": r"\GPU Engine(*)\Utilization Percentage",
             "shared": r"\GPU Adapter Memory(*)\Shared Usage",
             "dedicated": r"\GPU Adapter Memory(*)\Dedicated Usage"}

    def __init__(self) -> None:
        self.ok = False
        if os.name != "nt":
            return
        try:
            self.pdh = ctypes.WinDLL("pdh.dll")
            self.query = ctypes.c_void_p()
            if self.pdh.PdhOpenQueryW(None, None, ctypes.byref(self.query)) != 0:
                return
            self.counters = {}
            for key, path in self.PATHS.items():
                h = ctypes.c_void_p()
                if self.pdh.PdhAddEnglishCounterW(self.query, path, None, ctypes.byref(h)) == 0:
                    self.counters[key] = h
            self.pdh.PdhCollectQueryData(self.query)
            self.ok = bool(self.counters)
        except (OSError, AttributeError) as e:
            log.info("счётчики GPU недоступны: %s", e)

    def _array(self, h) -> list[tuple[str, float]]:
        size, count = ctypes.c_ulong(0), ctypes.c_ulong(0)
        rc = self.pdh.PdhGetFormattedCounterArrayW(h, PDH_FMT_DOUBLE, ctypes.byref(size), ctypes.byref(count), None)
        if rc != PDH_MORE_DATA or not size.value:
            return []
        buf = (ctypes.c_byte * size.value)()
        rc = self.pdh.PdhGetFormattedCounterArrayW(h, PDH_FMT_DOUBLE, ctypes.byref(size), ctypes.byref(count), buf)
        if rc != 0:
            return []
        items = ctypes.cast(buf, ctypes.POINTER(_Item))
        return [(items[i].szName or "", items[i].FmtValue.doubleValue) for i in range(count.value)]

    def sample(self) -> dict:
        if not self.ok:
            return {}
        try:
            if self.pdh.PdhCollectQueryData(self.query) != 0:
                return {}
            d: dict = {}
            if "engine" in self.counters:
                per_engine: dict[str, float] = {}
                for name, v in self._array(self.counters["engine"]):
                    if "engtype_3D" in name or "engtype_Compute" in name:
                        key = name.split("_eng_")[-1] if "_eng_" in name else name
                        per_engine[key] = per_engine.get(key, 0.0) + v
                if per_engine:
                    d["gpu"] = int(min(100, max(per_engine.values())))
            if "shared" in self.counters:
                d["gtt_used_gb"] = round(sum(v for _, v in self._array(self.counters["shared"])) / GIB, 1)
            if "dedicated" in self.counters:
                d["vram_used_gb"] = round(sum(v for _, v in self._array(self.counters["dedicated"])) / GIB, 2)
            return d
        except OSError:
            return {}


def shared_total_gb() -> float:
    """Сколько общей памяти может взять видеокарта: на Windows — половина ОЗУ (WDDM)."""
    try:
        import psutil
        return round(psutil.virtual_memory().total / 2 / GIB, 1)
    except ImportError:
        return 0.0
