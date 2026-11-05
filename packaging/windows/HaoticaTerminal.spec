# PyInstaller (onedir): HaoticaTerminal.exe (окно, без консоли) + haotica.exe (консоль), общий _internal.
#   pyinstaller packaging/windows/HaoticaTerminal.spec --noconfirm
import os
from pathlib import Path

ROOT = Path(SPECPATH).resolve().parents[1]
datas = [
    (str(ROOT / "apps"), "apps"),
    (str(ROOT / "assets" / "palette.toml"), "assets"),
    (str(ROOT / "assets" / "sounds"), "assets/sounds"),
    (str(ROOT / "core" / "haotica"), "core/haotica"),          # исходники — для окружения службы речи
    (str(ROOT / "core" / "haotica" / "defaults.toml"), "haotica"),
    (str(ROOT / "VERSION"), "."),
]
# pywinpty 3: conpty.dll запускает OpenConsole.exe из своей папки. PyInstaller сам берёт только .pyd/.dll —
# без OpenConsole.exe любая оболочка умирает при старте с 0xC000013A. Кладём всю папку пакета, кроме .py.
import winpty as _wp  # noqa: E402
_wpdir = Path(_wp.__file__).parent
_wp_bins = [(str(f), "winpty") for f in _wpdir.iterdir() if f.suffix.lower() in (".exe", ".dll")]
assert any(f.name.lower() == "openconsole.exe" for f in _wpdir.iterdir()), "в pywinpty нет OpenConsole.exe"
for extra in ("icons", "fonts", "avatar"):
    p = ROOT / "assets" / extra
    if p.exists():
        datas.append((str(p), f"assets/{extra}"))
hidden = ["haotica.apps.ptyprobe", "haotica.server.__main__", "haotica.agent.__main__", "haotica.tts.server", "winpty", "keyring.backends.Windows",
          "send2trash", "psutil", "num2words", "aiohttp", "PySide6.QtWebEngineWidgets", "PySide6.QtWebChannel"]
excludes = ["tkinter", "torch", "matplotlib", "IPython", "pytest"]
icon = str(ROOT / "assets" / "icons" / "haotica.ico") if (ROOT / "assets" / "icons" / "haotica.ico").exists() else None

a1 = Analysis([str(ROOT / "packaging/windows/entry_terminal.py")], pathex=[str(ROOT / "core"), str(ROOT / "packaging/windows")], datas=datas,
              hiddenimports=hidden, excludes=excludes)
a2 = Analysis([str(ROOT / "packaging/windows/entry_cli.py")], pathex=[str(ROOT / "core"), str(ROOT / "packaging/windows")], hiddenimports=hidden,
              excludes=excludes + ["PySide6"])
pyz1, pyz2 = PYZ(a1.pure), PYZ(a2.pure)
exe1 = EXE(pyz1, a1.scripts, [], exclude_binaries=True, name="HaoticaTerminal", console=False, icon=icon,
           version=None, uac_admin=False)
exe2 = EXE(pyz2, a2.scripts, [], exclude_binaries=True, name="haotica", console=True, icon=icon, uac_admin=False)
coll = COLLECT(exe1, a1.binaries + _wp_bins, a1.datas, exe2, a2.binaries, a2.datas, name="HaoticaTerminal")
