"""Профили оболочек терминала и подключение интеграции (блоки команд, текущая папка).

Windows: PowerShell 7 (pwsh), Windows PowerShell 5.1, cmd, дистрибутивы WSL (по `wsl -l -q`), Git Bash.
Linux: оболочка пользователя (zsh/bash) и остальные из /etc/shells.
Свои профили — в настройках `terminal.profiles` (список {id, name, command, cwd, env}).
"""
from __future__ import annotations

import base64
import os
import shlex
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path

from .. import config, paths
from ..platform import IS_WINDOWS

INTEGRATION = paths.APPS_DIR / "terminal" / "shell"
CMD_PROMPT = "$E]7;file://{host}/$P$E\\$E]133;A$E\\$P$G$E]133;B$E\\"


def _exists(p: str | Path) -> bool:
    try:
        return Path(p).is_file()
    except OSError:
        return False


_WSL: dict = {"names": None, "t": 0.0, "busy": False}
_WSL_LOCK = threading.Lock()


def _wsl_query() -> list[str]:
    exe = shutil.which("wsl.exe") or shutil.which("wsl")
    if not exe:
        return []
    try:
        r = subprocess.run([exe, "-l", "-q"], capture_output=True, timeout=6,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.TimeoutExpired):
        return []
    raw = r.stdout
    text = raw.decode("utf-16-le", "ignore") if raw[:2] != b"" and b"\x00" in raw[:8] else raw.decode("utf-8", "ignore")
    names = [ln.strip().strip("\x00") for ln in text.splitlines()]
    return [n for n in names if n and not n.startswith("docker-desktop")]


def _wsl_refresh() -> None:
    names = _wsl_query()
    with _WSL_LOCK:
        _WSL.update(names=names, t=time.monotonic(), busy=False)


def wsl_distros(wait: bool = False) -> list[str]:
    """Имена дистрибутивов WSL. `wsl -l -q` пишет в UTF-16LE и без установленного WSL висит до тайм-аута,
    поэтому опрос — в фоне и с кэшем на 5 минут: запуск вкладки не ждёт его (раньше 8 вкладок × 6 с = минута
    чёрного окна). wait=True — подождать ответа (явно выбран профиль WSL)."""
    with _WSL_LOCK:
        names, fresh = _WSL["names"], time.monotonic() - _WSL["t"] < 300
        start = not _WSL["busy"] and (names is None or not fresh)
        if start:
            _WSL["busy"] = True
    if start:
        if wait or names is None and not IS_WINDOWS:
            _wsl_refresh()
        else:
            threading.Thread(target=_wsl_refresh, name="wsl-list", daemon=True).start()
    elif wait and names is None:
        for _ in range(70):
            time.sleep(0.1)
            if _WSL["names"] is not None:
                break
    return list(_WSL["names"] or [])


def win_to_wsl(path: str) -> str:
    """C:\\Users\\x → /mnt/c/Users/x (точка монтирования WSL по умолчанию)."""
    p = str(path).replace("\\", "/")
    if len(p) > 1 and p[1] == ":":
        return f"/mnt/{p[0].lower()}{p[2:]}"
    return p


def _git_bash() -> str:
    for c in (os.path.expandvars(r"%ProgramFiles%\Git\bin\bash.exe"), os.path.expandvars(r"%LOCALAPPDATA%\Programs\Git\bin\bash.exe")):
        if _exists(c):
            return c
    g = shutil.which("git")
    if g:
        c = Path(g).resolve().parent.parent / "bin" / "bash.exe"
        if c.is_file():
            return str(c)
    return ""


def _pwsh() -> str:
    for c in (shutil.which("pwsh"), os.path.expandvars(r"%ProgramFiles%\PowerShell\7\pwsh.exe")):
        if c and _exists(c):
            return c
    return ""


def detect() -> list[dict]:
    """Доступные профили; первый — по умолчанию, если в настройках не выбран другой."""
    out: list[dict] = []
    if IS_WINDOWS:
        pw = _pwsh()
        if pw:
            out.append({"id": "pwsh", "name": "PowerShell 7", "kind": "pwsh", "exe": pw})
        win_ps = os.path.expandvars(r"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
        if _exists(win_ps) or shutil.which("powershell"):
            out.append({"id": "powershell", "name": "Windows PowerShell", "kind": "pwsh",
                        "exe": win_ps if _exists(win_ps) else shutil.which("powershell")})
        cmd = os.environ.get("ComSpec") or shutil.which("cmd") or r"C:\Windows\System32\cmd.exe"
        out.append({"id": "cmd", "name": "Командная строка", "kind": "cmd", "exe": cmd})
        for d in wsl_distros():
            out.append({"id": f"wsl:{d}", "name": f"WSL · {d}", "kind": "wsl", "distro": d,
                        "exe": shutil.which("wsl.exe") or "wsl.exe"})
        gb = _git_bash()
        if gb:
            out.append({"id": "gitbash", "name": "Git Bash", "kind": "bash", "exe": gb, "msys": True})
    else:
        seen = set()
        try:
            import pwd
            own = pwd.getpwuid(os.getuid()).pw_shell
        except (ImportError, KeyError):
            own = ""
        cands = [own] if own else []
        try:
            cands += [ln.strip() for ln in Path("/etc/shells").read_text().splitlines() if ln.startswith("/")]
        except OSError:
            cands += ["/bin/bash"]
        for sh in cands:
            name = os.path.basename(sh)
            if name in seen or name not in ("zsh", "bash", "fish", "sh") or not _exists(sh):
                continue
            seen.add(name)
            out.append({"id": name, "name": name, "kind": name if name in ("zsh", "bash") else "plain", "exe": sh})
        if not out:
            out.append({"id": "bash", "name": "bash", "kind": "bash", "exe": "/bin/bash"})
    for p in config.get("terminal.profiles", []) or []:
        if isinstance(p, dict) and p.get("id") and p.get("command"):
            out.append({"id": str(p["id"]), "name": str(p.get("name") or p["id"]), "kind": "custom",
                        "command": str(p["command"]), "cwd": str(p.get("cwd", "")),
                        "env": {str(k): str(v) for k, v in (p.get("env") or {}).items()}})
    return out


def default_id(profiles: list[dict]) -> str:
    want = str(config.get("terminal.default_profile", "") or "")
    if want and any(p["id"] == want for p in profiles):
        return want
    return profiles[0]["id"] if profiles else ""


def public(profiles: list[dict] | None = None) -> dict:
    profiles = profiles if profiles is not None else detect()
    return {"profiles": [{"id": p["id"], "name": p["name"], "kind": p["kind"],
                          **({"distro": p["distro"]} if p.get("distro") else {})} for p in profiles],
            "default": default_id(profiles)}


def build(profile_id: str, cwd: str, sid: str) -> tuple[list[str], dict, str, dict]:
    """(argv, env, cwd, профиль) для запуска оболочки с интеграцией HAOTICA."""
    from .. import __version__
    if profile_id.startswith("wsl:"):
        wsl_distros(wait=True)
    profiles = detect()
    prof = next((p for p in profiles if p["id"] == profile_id), None) or \
        next((p for p in profiles if p["id"] == default_id(profiles)), profiles[0])
    env = dict(os.environ)
    env.update({"TERM": "xterm-256color", "COLORTERM": "truecolor", "TERM_PROGRAM": "haotica",
                "TERM_PROGRAM_VERSION": __version__, "HAOTICA_TERM_SESSION": sid})
    for k in ("HAOTICA_DEBUG", "HAOTICA_LOG_TO_STDERR"):
        env.pop(k, None)
    env.update(prof.get("env") or {})
    cwd = os.path.expanduser(cwd or prof.get("cwd") or "~")
    if not os.path.isdir(cwd):
        cwd = str(paths.HOME)
    kind = prof["kind"]
    if kind == "custom":
        argv = _split(prof["command"])
    elif kind == "pwsh":
        argv = [prof["exe"], "-NoLogo", "-NoExit"]
        code = pwsh_integration()
        if code:
            # интеграция — текстом команды (-EncodedCommand), а не файлом .ps1: при политике Restricted
            # (Windows 11 по умолчанию) файл не загружается, и Haotica не видела бы конца команд.
            # Политика запуска не меняется: скрипты пользователя в этой вкладке подчиняются ей как везде.
            argv += ["-EncodedCommand", base64.b64encode(code.encode("utf-16-le")).decode("ascii")]
    elif kind == "cmd":
        env["PROMPT"] = CMD_PROMPT.format(host=socket.gethostname())
        argv = [prof["exe"], "/K", "chcp 65001>nul"]
    elif kind == "wsl":
        rc = INTEGRATION / "bash" / "haotica.bash"
        argv = [prof["exe"], "-d", prof["distro"], "--cd", cwd if os.path.isdir(cwd) else "~"]
        if rc.is_file():
            argv += ["--", "bash", "--rcfile", win_to_wsl(str(rc)), "-i"]
        env["WSLENV"] = ":".join(x for x in (env.get("WSLENV", ""), "TERM_PROGRAM/u", "HAOTICA_TERM_SESSION/u",
                                             "COLORTERM/u") if x)
    elif kind == "bash":
        rc = INTEGRATION / "bash" / "haotica.bash"
        argv = [prof["exe"], "--rcfile", str(rc), "-i"] if rc.is_file() else [prof["exe"], "-l"]
        if prof.get("msys"):
            env.update({"CHERE_INVOKING": "1", "MSYSTEM": env.get("MSYSTEM", "MINGW64")})
    elif kind == "zsh":
        argv = [prof["exe"], "-l"]
        if (INTEGRATION / "zsh/.zshrc").exists():
            env["HAOTICA_USER_ZDOTDIR"] = env.get("ZDOTDIR", str(paths.HOME))
            env["ZDOTDIR"] = str(INTEGRATION / "zsh")
    else:
        argv = [prof["exe"], "-l"] if not IS_WINDOWS else [prof["exe"]]
    return argv, env, cwd, prof


def _ps_quote(s: str) -> str:
    return s.replace("'", "''")


_PWSH_CODE: dict[str, str] = {}


def pwsh_integration() -> str:
    """Текст интеграции PowerShell (OSC 133/7/7777) для -EncodedCommand: без комментариев и пустых строк,
    чтобы командная строка была короче (предел Windows — 32 767 символов)."""
    script = INTEGRATION / "pwsh" / "haotica.ps1"
    key = str(script)
    if key not in _PWSH_CODE:
        try:
            lines = script.read_text(encoding="utf-8-sig").splitlines()
        except OSError:
            return ""
        _PWSH_CODE[key] = "\n".join(ln for ln in lines if ln.strip() and not ln.lstrip().startswith("#"))
    return _PWSH_CODE[key]


def _split(command: str) -> list[str]:
    if IS_WINDOWS:                             # правила Windows: обратные слэши — не экранирование
        parts = shlex.split(command, posix=False)
        return [p[1:-1] if len(p) > 1 and p[0] == p[-1] == '"' else p for p in parts]
    return shlex.split(command)


def quote_for(kind: str, path: str) -> str:
    """Путь в кавычках по правилам оболочки (перетаскивание, «вставить путь»)."""
    if kind == "pwsh":
        return path if all(c.isalnum() or c in "\\/:._-" for c in path) else "'" + path.replace("'", "''") + "'"
    if kind == "cmd":
        return path if " " not in path and not any(c in path for c in "&()[]{}^=;!'+,`~") else f'"{path}"'
    if kind in ("wsl",):
        path = win_to_wsl(path)
    return path if all(c.isalnum() or c in "/._-~+@%=:," for c in path) else "'" + path.replace("'", "'\\''") + "'"
