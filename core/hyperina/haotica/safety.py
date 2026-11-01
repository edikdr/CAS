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
    "neofetch", "inxi", "echo", "printf", "true", "test", "[", "xdg-mime", "gio", "hyperina",
}
# подкоманды, которые у «читающих» программ всё-таки меняют систему
MUTATING_SUB = {
    "systemctl": {"start", "stop", "restart", "enable", "disable", "mask", "unmask", "kill", "reload", "isolate",
                  "poweroff", "reboot", "suspend", "hibernate", "set-default", "edit", "daemon-reload"},
    "pacman": {"-S", "-R", "-U", "-Sy", "-Syu", "-Rns", "-Rs", "-Sc", "-Scc", "-D"},
    "paru": {"-S", "-R", "-U", "-Syu", "-Sua", "-Rns", "-Rs"}, "yay": {"-S", "-R", "-U", "-Syu", "-Rns"},
    "git": {"push", "reset", "clean", "checkout", "rebase", "merge", "commit", "rm", "mv", "stash", "pull", "branch",
            "tag", "restore", "switch", "cherry-pick", "revert", "am", "apply", "gc", "prune", "filter-branch"},
    "ip": {"add", "del", "delete", "set", "flush", "replace", "change"}, "nmcli": {"connect", "delete", "modify", "up",
           "down", "add", "radio", "disconnect", "reload"},
    "hyprctl": {"dispatch", "keyword", "eval", "reload", "kill", "setcursor", "switchxkblayout"},
    "bluetoothctl": {"pair", "remove", "connect", "disconnect", "power", "trust", "block"},
    "gio": {"trash", "rename", "remove", "move", "copy", "set", "mount"}, "npm": {"install", "i", "uninstall", "publish", "run"},
    "python": {"-c"}, "python3": {"-c"}, "node": {"-e"},
    "hyperina": {"settings", "theme", "gamemode", "update", "models"},
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


def classify(cmd: str) -> dict:
    """{'level': 'read' | 'write' | 'danger', 'reasons': [...]}"""
    reasons = [why for rx, why in DANGER_PATTERNS if re.search(rx, cmd)]
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
            text = text.replace(t, "[HYPERINA_TOKEN]")
    except OSError:
        pass
    return text


# ── закрытые зоны ────────────────────────────────────────────────
ALWAYS_DENIED = [paths.HOME / ".ssh", paths.HOME / ".gnupg", paths.HOME / ".local/share/keyrings",
                 paths.HOME / ".password-store", paths.DATA_DIR / "chrome-sparkasse", paths.DATA_DIR / "web",
                 paths.HOME / ".config/google-chrome", paths.HOME / ".mozilla", paths.STATE_DIR / "token",
                 Path("/etc/shadow"), Path("/etc/gshadow"), Path("/etc/sudoers")]


def path_allowed(p: str | Path, allowed: list[str], denied: list[str]) -> tuple[bool, str]:
    try:
        rp = Path(os.path.expanduser(str(p))).resolve()
    except (OSError, RuntimeError):
        return False, "путь не найден"
    deny = ALWAYS_DENIED + [Path(os.path.expanduser(d)).resolve() for d in denied]
    for d in deny:
        if rp == d or d in rp.parents:
            return False, f"закрытая зона: {d}"
    allow = [Path(os.path.expanduser(a)).resolve() for a in allowed] or [paths.HOME]
    if any(rp == a or a in rp.parents for a in allow) or str(rp).startswith(("/tmp/", "/usr/share/", "/etc/", "/proc/")):
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
