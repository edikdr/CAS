"""Общая подготовка процесса сборки: UTF-8 в консоли Windows и «пустые» потоки в оконном exe."""
import os
import sys


def setup() -> None:
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
            ctypes.windll.kernel32.SetConsoleCP(65001)
        except (AttributeError, OSError):
            pass
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name)
        if stream is None:                       # оконный exe (или служба без консоли): print() не должен падать
            setattr(sys, name, open(os.devnull, "w", encoding="utf-8"))  # noqa: SIM115
        else:
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (AttributeError, ValueError):
                pass
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
