"""Границы, которые не зависят от характера Haotica.

1. Фильтр опасных команд: такие команды выполняются только после явного подтверждения.
2. Вычищение секретов (пароли, токены, ключи) из всего, что уходит в любую модель.
3. Закрытые зоны файловой системы.
4. Проверка «брифа» для облачных помощников: в нём не должно быть личных данных.
"""
from __future__ import annotations

import os
import re
import shlex
import socket
from pathlib import Path

from .. import paths

# ── риск команд ──────────────────────────────────────────────────
READ_ONLY = {
    "ls", "ll", "la", "eza", "exa", "cat", "bat", "head", "tail", "less", "more", "wc", "file", "stat", "du", "df",
    "free", "uptime", "uname", "whoami", "id", "groups", "hostname", "date", "cal", "env", "printenv", "pwd", "which",
    "type", "whereis", "find", "fd", "rg", "grep", "egrep", "fgrep", "awk", "sed", "sort", "uniq", "cut", "tr", "diff",
    "cmp", "md5sum", "sha256sum", "lsblk", "blkid", "findmnt", "mount", "lspci", "lsusb", "lscpu", "lsmod", "dmesg",
    "journalctl", "systemctl", "ps", "pgrep", "top", "htop", "btop", "pstree", "ip", "ss", "ping", "traceroute",
    "tracepath", "mtr", "dig", "host", "nslookup", "nmcli", "iw", "iwctl", "curl", "wget", "pacman", "paru", "yay",
    "git", "python", "python3", "node", "npm", "jq", "yq", "tree", "realpath", "readlink", "basename", "dirname",
    "sensors", "nvme", "smartctl", "vulkaninfo", "glxinfo", "radeontop", "amdgpu_top", "hyprctl", "wpctl", "pactl",
    "bluetoothctl", "upower", "powerprofilesctl", "localectl", "timedatectl", "hostnamectl", "loginctl", "fastfetch",
    "neofetch", "inxi", "echo", "printf", "true", "test", "[", "xdg-mime", "gio", "haotica",
}
# подкоманды, которые у «читающих» программ всё-таки меняют систему
MUTATING_SUB = {
    "systemctl": {"start", "stop", "restart", "enable", "disable", "mask", "unmask", "kill", "reload", "isolate",
                  "poweroff", "reboot", "suspend", "hibernate", "set-default", "edit", "daemon-reload"},
    "pacman": {"-S", "-R", "-U", "-Sy", "-Syu", "-Rns", "-Rs", "-Sc", "-Scc", "-D"},
    "paru": {"-S", "-R", "-U", "-Syu", "-Sua", "-Rns", "-Rs"}, "yay": {"-S", "-R", "-U", "-Syu", "-Rns"},
    "git": {"push", "reset", "clean", "checkout", "rebase", "merge", "commit", "rm", "mv", "stash", "pull", "branch", "clone",
            "init", "config", "submodule", "worktree", "add", "fetch", "lfs",
            "tag", "restore", "switch", "cherry-pick", "revert", "am", "apply", "gc", "prune", "filter-branch"},
    "ip": {"add", "del", "delete", "set", "flush", "replace", "change"}, "nmcli": {"connect", "delete", "modify", "up",
           "down", "add", "radio", "disconnect", "reload"},
    "hyprctl": {"dispatch", "keyword", "eval", "reload", "kill", "setcursor", "switchxkblayout"},
    "bluetoothctl": {"pair", "remove", "connect", "disconnect", "power", "trust", "block"},
    "gio": {"trash", "rename", "remove", "move", "copy", "set", "mount"}, "npm": {"install", "i", "uninstall", "publish", "run"},
    "python": {"-c"}, "python3": {"-c"}, "node": {"-e"},
    "haotica": {"settings", "theme", "gamemode", "update", "models"},
    "pactl": {"set-sink-volume", "set-default-sink", "unload-module", "load-module", "set-sink-mute"},
    "wpctl": {"set-volume", "set-default", "set-mute"}, "powerprofilesctl": {"set"}, "localectl": {"set-locale", "set-keymap", "set-x11-keymap"},
    "timedatectl": {"set-time", "set-timezone", "set-ntp"}, "hostnamectl": {"set-hostname"}, "loginctl": {"terminate-session", "kill-user", "lock-session"},
    "sed": {"-i", "--in-place"}, "find": {"-delete", "-exec", "-execdir", "-ok"}, "curl": {"-o", "-O", "-T", "--upload-file", "-X", "-d", "--data"},
    "wget": {"-O", "-P"}, "xdg-mime": {"default"},
}
DANGER_PATTERNS = [
    (r"\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(/|~|\$HOME|/\*|\*)(\s|$)", "удаление корня или домашней папки"),
    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r", "рекурсивное удаление без вопросов"),
    (r"\b(mkfs(\.\w+)?|mkswap|wipefs|sgdisk|sfdisk|fdisk|parted|cfdisk|gdisk)\b", "разметка или форматирование диска"),
    (r"\bdd\b.*\bof=/dev/", "запись прямо на устройство"),
    (r">\s*/dev/(sd|nvme|mmcblk|vd)", "запись прямо на устройство"),
    (r"\b(shred|blkdiscard)\b", "безвозвратное стирание"),
    (r"\bchmod\s+(-R\s+)?[0-7]*7{2,3}\s+/", "открытие прав на системные папки"),
    (r"\bch(own|mod)\s+-R\s+\S+\s+/(\s|$|etc|usr|bin|boot|var)", "смена прав всей системы"),
    (r":\(\)\s*\{\s*:\|:&\s*\};:", "fork-бомба"),
    (r"\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|)sh\b", "запуск скрипта из интернета без проверки"),
    (r"\b(shutdown|poweroff|reboot|halt)\b|\bsystemctl\s+(poweroff|reboot|halt|kexec)", "выключение или перезагрузка"),
    (r"\bsystemctl\s+(stop|disable|mask)\s+(sddm|greetd|NetworkManager|systemd-\w+|dbus|polkit)", "остановка ключевой службы"),
    (r"\bpacman\s+-R\w*\s+.*\b(linux|systemd|pacman|glibc|base|sudo|mesa|hyprland|quickshell)\b", "удаление ключевого пакета"),
    (r"\bmv\s+.*\s+/dev/null\b", "уничтожение файла"),
    (r"\b(crontab\s+-r|history\s+-c)\b", "уничтожение настроек"),
    (r"/boot/|/etc/(fstab|passwd|shadow|sudoers|pam\.d)|/efi/|/boot/loader", "правка загрузчика или учётных записей"),
    (r"\bsudo\b|\bpkexec\b|\bdoas\b", "команда с правами администратора"),
    (r"\bgit\s+push\s+.*(--force|-f)\b", "принудительная отправка в git"),
    (r"\biptables\s+-F|\bufw\s+(disable|reset)|\bnft\s+flush", "отключение защиты сети"),
]


# ── Windows: PowerShell и cmd ────────────────────────────────────
# Глаголы PowerShell, которые только читают; всё остальное (Set/New/Remove/Start/Invoke…) — изменения
PS_READ_VERBS = {"get", "test", "resolve", "select", "measure", "where", "sort", "group", "compare", "find", "search",
                 "show", "read", "convertto", "convertfrom", "format", "out", "write", "trace", "wait", "debug", "join",
                 "split", "confirm", "use", "enter", "exit", "push", "pop"}
PS_WRITE_EXCEPTIONS = {"format-volume", "format-hex", "out-file", "write-eventlog", "out-printer"}  # format-hex — чтение, но редко
PS_ALIASES = {
    "ls": "get-childitem", "dir": "get-childitem", "gci": "get-childitem", "cat": "get-content", "gc": "get-content",
    "type": "get-content", "gi": "get-item", "pwd": "get-location", "gl": "get-location", "ps": "get-process",
    "gps": "get-process", "gsv": "get-service", "gcm": "get-command", "help": "get-help", "man": "get-help",
    "sls": "select-string", "measure": "measure-object", "select": "select-object", "where": "where-object",
    "?": "where-object", "sort": "sort-object", "group": "group-object", "fl": "format-list", "ft": "format-table",
    "fw": "format-wide", "echo": "write-output", "write": "write-output", "cd": "set-location", "chdir": "set-location",
    "sl": "set-location", "rm": "remove-item", "del": "remove-item", "erase": "remove-item", "rd": "remove-item",
    "rmdir": "remove-item", "ri": "remove-item", "mv": "move-item", "move": "move-item", "mi": "move-item",
    "cp": "copy-item", "copy": "copy-item", "cpi": "copy-item", "ren": "rename-item", "rni": "rename-item",
    "ni": "new-item", "md": "new-item", "mkdir": "new-item", "sc": "set-content", "ac": "add-content",
    "iex": "invoke-expression", "iwr": "invoke-webrequest", "irm": "invoke-restmethod", "curl": "invoke-webrequest",
    "wget": "invoke-webrequest", "saps": "start-process", "start": "start-process", "kill": "stop-process",
    "spps": "stop-process", "%": "foreach-object", "foreach": "foreach-object", "icm": "invoke-command",
    "clc": "clear-content", "cli": "clear-item", "clear": "clear-host", "cls": "clear-host", "h": "get-history",
    "history": "get-history", "gm": "get-member", "gal": "get-alias", "gdr": "get-psdrive", "diff": "compare-object",
}
PS_SAFE_NONVERB = {"clear-host", "set-location", "push-location", "pop-location", "foreach-object", "invoke-webrequest",
                   "invoke-restmethod", "where-object", "select-object", "sort-object", "tee-object"}
# программы Windows, которые только читают (с изменяющими подкомандами — ниже)
CMD_READ = {"dir", "type", "echo", "where", "where.exe", "whoami", "hostname", "ver", "vol", "systeminfo", "tasklist",
            "ipconfig", "ping", "tracert", "pathping", "nslookup", "netstat", "arp", "route", "findstr", "find", "more",
            "tree", "fc", "comp", "cd", "chdir", "cls", "chcp", "path", "set", "assoc", "ftype", "sort", "wmic", "reg",
            "sc", "sc.exe", "schtasks", "winget", "choco", "scoop", "pip", "pip3", "py", "dotnet", "code", "nvidia-smi",
            "powercfg", "driverquery", "getmac", "qwinsta", "query", "certutil", "wsl", "wsl.exe", "cmd", "exit",
            "vulkaninfo", "vulkaninfosdk", "llama-server", "llama-cli", "get-filehash"}
WIN_MUTATING_SUB = {
    "reg": {"add", "delete", "import", "copy", "restore", "load", "unload", "save"},
    "sc": {"stop", "start", "delete", "config", "create", "pause", "failure", "sdset"},
    "sc.exe": {"stop", "start", "delete", "config", "create", "pause", "failure", "sdset"},
    "schtasks": {"/create", "/delete", "/change", "/run", "/end"},
    "wmic": {"call", "delete", "set", "create"}, "winget": {"install", "uninstall", "upgrade", "import", "source",
    "settings", "configure", "pin", "repair"}, "choco": {"install", "uninstall", "upgrade", "pin", "source"},
    "scoop": {"install", "uninstall", "update", "reset", "bucket", "cleanup"}, "pip": {"install", "uninstall"},
    "pip3": {"install", "uninstall"}, "py": {"-c", "-m"}, "dotnet": {"new", "add", "remove", "build", "run", "publish",
    "tool", "workload", "restore", "test"}, "powercfg": {"/setactive", "-setactive", "/change", "-change", "/delete",
    "/import", "/hibernate", "-h"}, "certutil": {"-addstore", "-delstore", "-urlcache", "-decode", "-encode", "-f"},
    "wsl": {"--install", "--unregister", "--shutdown", "--terminate", "--import", "--export", "--set-default",
    "--set-version", "--update", "-t", "-s", "--mount", "--unmount"}, "set": {"="}, "assoc": {"="}, "ftype": {"="},
}
WIN_DANGER_PATTERNS = [
    (r"(?i)\b(format-volume|clear-disk|initialize-disk|remove-partition|set-partition|resize-partition|"
     r"new-partition|diskpart|format(\.com)?\s+[a-z]:)", "разметка или форматирование диска"),
    (r"(?i)\b(stop-computer|restart-computer)\b|\bshutdown(\.exe)?\s+[/-][srpfhg]", "выключение или перезагрузка"),
    (r"(?i)\bset-executionpolicy\b", "смена политики запуска скриптов"),
    (r"(?i)\breg(\.exe)?\s+delete\b|\bremove-item(property)?\b[^|;\n]*\bhk(lm|cu|cr|u|cc)[:\\]", "удаление из реестра"),
    (r"(?i)\b(iex|invoke-expression)\b[^\n]*\b(iwr|irm|invoke-webrequest|invoke-restmethod|downloadstring|"
     r"net\.webclient|curl|wget|start-bitstransfer)\b|\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget)\b[^\n]*\|\s*"
     r"(iex|invoke-expression)\b|\[scriptblock\]::create\([^)]*(download|iwr|irm)", "запуск скрипта из интернета без проверки"),
    (r"(?i)\s-(e|enc|encodedcommand|ec)\s+[a-z0-9+/=]{16,}", "закодированная команда PowerShell"),
    (r"(?i)\b(del|erase)\b[^|&\n]*\s/s\b|\b(rd|rmdir)\b[^|&\n]*\s/s\b", "рекурсивное удаление (cmd)"),
    (r"(?i)\b(bcdedit|bootrec|bcdboot|bootsect)\b", "правка загрузчика"),
    (r"(?i)\bvssadmin\b[^\n]*\b(delete|resize)\b|\bwbadmin\b[^\n]*\bdelete\b|\bcipher\b[^\n]*\s/w", "уничтожение резервных копий"),
    (r"(?i)\b(set-mppreference|add-mppreference)\b[^\n]*-(disable|exclusion)|\bnetsh\b[^\n]*firewall[^\n]*\b(off|disable)\b|"
     r"\bset-netfirewallprofile\b[^\n]*-enabled\s+(\$false|false|0)", "отключение защиты"),
    (r"(?i)\bstart-process\b[^\n]*-verb\s+runas|\brunas(\.exe)?\b|\bgsudo\b", "команда с правами администратора"),
    (r"(?i)\bwsl(\.exe)?\s+--unregister\b", "удаление дистрибутива WSL"),
    (r"(?i)\bclear-recyclebin\b", "очистка корзины без возврата"),
    (r"(?i)\b(remove-localuser|disable-localuser)\b|\bnet\s+user\s+\S+\s+/del", "удаление учётной записи"),
    (r"(?i)\b(taskkill|stop-process)\b[^\n]*\b(lsass|csrss|wininit|winlogon|smss|services|svchost)\b", "остановка системного процесса"),
    (r"(?i)\btakeown\b[^\n]*\s/r\b|\bicacls\b[^\n]*\b(everyone|все)\b[^\n]*:\(?(f|m)", "смена прав на файлы"),
    (r"(?i)(?:^|[\s'\"])[a-z]:\\windows\\(system32|syswow64|winsxs)\b[^\n]*\b(remove-item|del|erase|rd|rmdir|move-item|ren)\b|"
     r"\b(remove-item|del|erase|rd|rmdir)\b[^\n]*[a-z]:\\windows\b", "изменение системной папки Windows"),
]
REMOVE_ALIASES = {"remove-item", "rm", "del", "erase", "rd", "rmdir", "ri"}
INTERPRETERS = {"python", "python3", "py", "node", "pwsh", "powershell", "bash", "sh", "zsh", "cmd", "deno", "bun", "ruby",
                "perl"}


def _runs_code(prog: str, args: list[str]) -> bool:
    """python script.py / node app.js / pwsh -File x — исполняет произвольный код (≥ write)."""
    if prog not in INTERPRETERS:
        return False
    info = {"--version", "-v", "-V", "--help", "-h", "/?", "-version"}
    return any(a not in info for a in args)


def _ps_name(tok: str) -> str:
    t = tok.lower().strip("&'\"(){}")
    t = t.rsplit("\\", 1)[-1].rsplit("/", 1)[-1]
    return PS_ALIASES.get(t, t)


def _ps_remove_danger(seg: list[str]) -> str:
    """Remove-Item -Recurse (с -Force или без) и удаление корня диска/профиля — опасно."""
    if not seg or _ps_name(seg[0]) != "remove-item":
        return ""
    low = [a.lower() for a in seg[1:]]
    rec = any(a.startswith("-r") and "-recurse".startswith(a.split(":")[0]) and len(a) > 1 for a in low)
    roots = any(re.fullmatch(r"['\"]?([a-z]:\\?|~|\$home|\$env:userprofile|c:\\users\\?[^\\]*\\?|\\\\.*)['\"]?", a) for a in low)
    if rec:
        return "рекурсивное удаление"
    if roots:
        return "удаление корня диска или профиля"
    return ""


def _classify_windows(cmd: str, shell: str) -> dict | None:
    """Классификация для PowerShell/cmd: None — пусть решает общий (bash) разбор."""
    reasons = [why for rx, why in WIN_DANGER_PATTERNS if re.search(rx, cmd)]
    segs = _segments(cmd)
    for seg in segs:
        r = _ps_remove_danger(seg) if shell != "cmd" else ""
        if r:
            reasons.append(r)
    if reasons:
        return {"level": "danger", "reasons": sorted(set(reasons))}
    if shell == "cmd" and re.search(r"(?<![<>&|\d])>{1,2}(?!&)", cmd):
        return {"level": "write", "reasons": ["запись в файл"]}
    if shell == "pwsh" and re.search(r"(?<![<>&|\d\w])>{1,2}(?![&>])|\b(out-file|set-content|add-content|tee-object)\b", cmd, re.I):
        return {"level": "write", "reasons": ["запись в файл"]}
    for argv in segs:
        argv = [a for a in argv if a not in ("{", "}", "(", ")")]
        if not argv:
            continue
        name = _ps_name(argv[0]) if shell == "pwsh" else argv[0].lower().removesuffix(".exe")
        if shell == "pwsh" and "-" in name and name[0].isalpha():
            verb = name.split("-", 1)[0]
            if name in PS_WRITE_EXCEPTIONS or (verb not in PS_READ_VERBS and name not in PS_SAFE_NONVERB):
                return {"level": "write", "reasons": [f"{argv[0]} изменяет систему"]}
            if name in ("invoke-webrequest", "invoke-restmethod") and any(a.lower().startswith(("-outf", "-o", "-method", "-body", "-infile"))
                                                                           for a in argv[1:]):
                return {"level": "write", "reasons": [f"{argv[0]} с записью или отправкой данных"]}
            if name == "foreach-object" or name == "where-object":
                inner = " ".join(argv[1:])
                if re.search(r"(?i)\b(remove|set|new|move|rename|copy|clear|stop|start|invoke|add|install)-\w+|\b(rm|del|mv|cp|ni|kill)\b", inner):
                    return {"level": "write", "reasons": [f"{argv[0]} с изменяющими командами"]}
            continue
        prog = os.path.basename(name.replace("\\", "/")).removesuffix(".exe")
        if _runs_code(prog, argv[1:]):
            return {"level": "write", "reasons": [f"{prog} выполняет код"]}
        if prog in READ_ONLY or prog in CMD_READ or name in PS_SAFE_NONVERB:
            mut = WIN_MUTATING_SUB.get(prog, set()) | MUTATING_SUB.get(prog, set())
            low = [a.lower() for a in argv[1:]]
            if prog in ("set", "assoc", "ftype") and any("=" in a for a in low):
                return {"level": "write", "reasons": [f"{prog} меняет переменные/ассоциации"]}
            if any(a in mut or any(a.startswith(m) for m in mut if m.startswith(("-", "/")) and len(m) > 2) for a in low):
                return {"level": "write", "reasons": [f"{prog} с изменяющими параметрами"]}
            continue
        return {"level": "write", "reasons": [f"{prog} может изменять систему"]}
    return {"level": "read", "reasons": []}


def _segments(cmd: str) -> list[list[str]]:
    parts = re.split(r"\s*(?:&&|\|\||;|\||\n)\s*", cmd)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        try:
            out.append(shlex.split(p))
        except ValueError:
            out.append(p.split())
    return out


def classify(cmd: str, shell: str = "") -> dict:
    """{'level': 'read' | 'write' | 'danger' | 'denied', 'reasons': [...]}.

    shell: bash/zsh (по умолчанию на Linux), pwsh (PowerShell, по умолчанию на Windows), cmd.
    'denied' — команда касается закрытых зон (ключи, браузерные профили, банк): не выполняется вообще.
    Опасные шаблоны всех оболочек проверяются всегда — на случай, если оболочка определена неверно.
    """
    shell = (shell or ("pwsh" if os.name == "nt" else "bash")).lower()
    shell = {"powershell": "pwsh", "windows powershell": "pwsh", "zsh": "bash", "sh": "bash", "wsl": "bash"}.get(shell, shell)
    zone = denied_in_command(cmd)
    if zone:
        return {"level": "denied", "reasons": [f"закрытая зона: {zone}"]}
    if shell in ("pwsh", "cmd"):
        res = _classify_windows(cmd, shell)
        bash_danger = [why for rx, why in DANGER_PATTERNS if re.search(rx, cmd) and "администратора" not in why
                       and "загрузчика" not in why]
        if bash_danger and res["level"] != "danger":
            return {"level": "danger", "reasons": sorted(set(bash_danger))}
        if res["level"] == "danger" and bash_danger:
            res["reasons"] = sorted(set(res["reasons"] + bash_danger))
        return res
    win = [why for rx, why in WIN_DANGER_PATTERNS if re.search(rx, cmd)]
    win += [r for r in (_ps_remove_danger(seg) for seg in _segments(cmd) if seg and seg[0].lower() == "remove-item") if r]
    reasons = [why for rx, why in DANGER_PATTERNS if re.search(rx, cmd)] + win
    if reasons:
        return {"level": "danger", "reasons": sorted(set(reasons))}
    if re.search(r"(?<![<>&|\d])>{1,2}(?!&)|\btee\b", cmd):
        return {"level": "write", "reasons": ["запись в файл"]}
    for argv in _segments(cmd):
        while argv and re.match(r"^\w+=", argv[0]):
            argv = argv[1:]
        if not argv:
            continue
        prog = os.path.basename(argv[0])
        if _runs_code(prog, argv[1:]):
            return {"level": "write", "reasons": [f"{prog} выполняет код"]}
        if prog not in READ_ONLY:
            return {"level": "write", "reasons": [f"{prog} может изменять систему"]}
        mut = MUTATING_SUB.get(prog, set())
        if any(a in mut or any(a.startswith(m) for m in mut if m.startswith("-") and len(m) > 2) for a in argv[1:]):
            return {"level": "write", "reasons": [f"{prog} с изменяющими параметрами"]}
    return {"level": "read", "reasons": []}


# ── секреты ──────────────────────────────────────────────────────
SECRET_PATTERNS = [
    (re.compile(r"sk-or-v1-[A-Za-z0-9]{20,}"), "[OPENROUTER_KEY]"),
    (re.compile(r"\bsk-(?:proj-|ant-)?[A-Za-z0-9_\-]{20,}"), "[API_KEY]"),
    (re.compile(r"\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}"), "[GITHUB_TOKEN]"),
    (re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}"), "[SLACK_TOKEN]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[AWS_KEY]"),
    (re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"), "[GOOGLE_KEY]"),
    (re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"), "[JWT]"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"), "[PRIVATE_KEY]"),
    (re.compile(r"(?i)\b(password|passwd|pwd|pass|secret|token|api[_-]?key|apikey|auth|bearer|пароль)\b(\s*[:=]\s*|\s+)(['\"]?)([^\s'\"]{4,})\3"),
     None),
    (re.compile(r"(?i)authorization:\s*(bearer|basic)\s+[A-Za-z0-9._\-+/=]{8,}"), "Authorization: [REDACTED]"),
    (re.compile(r"\b[0-9a-f]{40,64}\b(?=.*(?:key|token|secret))", re.I), "[HEX_SECRET]"),
]


def redact(text: str) -> str:
    if not text:
        return text
    for rx, repl in SECRET_PATTERNS:
        if repl is None:
            text = rx.sub(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED]", text)
        else:
            text = rx.sub(repl, text)
    hy_token = paths.TOKEN_FILE
    try:
        t = hy_token.read_text().strip()
        if t:
            text = text.replace(t, "[HAOTICA_TOKEN]")
    except OSError:
        pass
    return text


# ── закрытые зоны ────────────────────────────────────────────────
ALWAYS_DENIED = [paths.HOME / ".ssh", paths.HOME / ".gnupg", paths.HOME / ".local/share/keyrings",
                 paths.HOME / ".password-store", paths.DATA_DIR / "chrome-sparkasse", paths.DATA_DIR / "web",
                 paths.HOME / ".config/google-chrome", paths.HOME / ".mozilla", paths.STATE_DIR / "token",
                 Path("/etc/shadow"), Path("/etc/gshadow"), Path("/etc/sudoers")]
if os.name == "nt":
    _ad = Path(os.environ.get("APPDATA") or paths.HOME / "AppData/Roaming")
    _la = Path(os.environ.get("LOCALAPPDATA") or paths.HOME / "AppData/Local")
    ALWAYS_DENIED += [
        _ad / "Microsoft/Credentials", _la / "Microsoft/Credentials", _ad / "Microsoft/Protect",
        _ad / "Microsoft/Vault", _la / "Microsoft/Vault", _ad / "Microsoft/Crypto", _la / "Google/Chrome/User Data",
        _la / "Microsoft/Edge/User Data", _la / "BraveSoftware", _ad / "Mozilla", _ad / "Opera Software",
        _la / "Vivaldi/User Data", Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32/config",
        paths.DATA_DIR / "sparkasse", paths.CONFIG_DIR / "sparkasse",
    ]
# те же зоны в тексте команды: имена, которые однозначно указывают на ключи, пароли и банковский профиль
DENIED_TEXT = [
    r"chrome-sparkasse", r"sparkasse[\\/]", r"\\microsoft\\(credentials|protect|vault|crypto)\b",
    r"/microsoft/(credentials|protect|vault|crypto)\b", r"(google[\\/]chrome|microsoft[\\/]edge|bravesoftware[\\/][^\\/]+)[\\/]user data",
    r"\b(login data|web data|cookies\.sqlite|key[34]\.db|logins\.json)\b", r"[\\/]\.ssh([\\/]|\b)", r"[\\/]\.gnupg\b",
    r"\bcmdkey\b[^\n]*/(list|generic|delete)", r"\bvaultcmd\b", r"\b(get-storedcredential|get-secret)\b",
    r"\bsystem32[\\/]config[\\/](sam|security|system)\b", r"\bmimikatz\b|\bsekurlsa\b|\blsadump\b",
    r"haotica[\\/]state[\\/]token\b", r"\.local/state/haotica/token\b",
]


def denied_in_command(cmd: str) -> str:
    """Зона из ALWAYS_DENIED, которой касается команда (или '' — не касается)."""
    low = cmd.lower()
    norm = os.path.expandvars(cmd) if os.name == "nt" else cmd
    norm = re.sub(r"(?i)\$env:(\w+)", lambda m: os.environ.get(m.group(1), m.group(0)), norm)
    norm = norm.replace("~", str(paths.HOME)).lower().replace("/", "\\") if os.name == "nt" else norm
    for d in ALWAYS_DENIED:
        ds = str(d).lower().replace("/", "\\") if os.name == "nt" else str(d)
        if len(ds) > 6 and ds in norm:
            return str(d)
    for rx in DENIED_TEXT:
        m = re.search(rx, low)
        if m:
            return m.group(0)
    return ""


def path_allowed(p: str | Path, allowed: list[str], denied: list[str]) -> tuple[bool, str]:
    try:
        rp = Path(os.path.expanduser(str(p))).resolve()
    except (OSError, RuntimeError):
        return False, "путь не найден"
    deny = ALWAYS_DENIED + [Path(os.path.expanduser(d)).resolve() for d in denied]
    for d in deny:
        try:
            d = d.resolve()
        except (OSError, RuntimeError):
            pass
        if rp == d or d in rp.parents:
            return False, f"закрытая зона: {d}"
    allow = [Path(os.path.expanduser(a)).resolve() for a in allowed] or [paths.HOME]
    if any(rp == a or a in rp.parents for a in allow) or str(rp).startswith(("/tmp/", "/usr/share/", "/etc/", "/proc/")):
        return True, ""
    tmp = Path(os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp").resolve() if os.name == "nt" else None
    if tmp and (rp == tmp or tmp in rp.parents):
        return True, ""
    return False, "папка не в списке разрешённых (Настройки → Haotica → Доступ к папкам)"


# ── бриф для облачных помощников ─────────────────────────────────
def brief_check(text: str) -> tuple[str, list[str]]:
    """Убрать из задачи для облака всё личное: пути, имена, адреса, ключи. Возвращает (текст, что убрано)."""
    removed = []
    out = redact(text)
    if out != text:
        removed.append("секреты")
    user = os.environ.get("USER", "")
    host = socket.gethostname()
    for word, label in ((user, "имя пользователя"), (host, "имя компьютера"), (str(paths.HOME), "домашняя папка")):
        if word and len(word) > 2 and word in out:
            out = out.replace(word, "[…]")
            removed.append(label)
    rules = [
        (r"(?:~|/home/\w+|/root|/etc|/var|/mnt|/run/media)(?:/[^\s,;'\"]+)+", "пути к файлам"),
        (r"\b[\w.+-]+@[\w-]+\.[\w.]+\b", "адреса почты"),
        (r"\+?\d[\d\s\-()]{8,}\d", "номера телефонов"),
        (r"\b(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b", "адреса локальной сети"),
        (r"\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b", "MAC-адреса"),
        (r"\bDE\d{20}\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", "банковские реквизиты"),
    ]
    for rx, label in rules:
        new = re.sub(rx, "[…]", out, flags=re.I)
        if new != out:
            removed.append(label)
            out = new
    return out, sorted(set(removed))


REFUSAL_RX = re.compile(r"(?i)\b(i can(?:no|')t (?:help|assist|provide)|i'?m (?:sorry|unable)|as an ai|i won'?t|"
                        r"not able to (?:help|assist)|against (?:my|our) (?:policy|guidelines)|"
                        r"не могу (?:помочь|с этим)|извините, но я не|я не буду)\b")


def looks_like_refusal(text: str) -> bool:
    head = (text or "")[:400]
    return bool(REFUSAL_RX.search(head)) and len(text or "") < 1500
