"""Инструменты Haotica: что она может делать и с каким уровнем разрешения.

Чтение (файлы, система, сеть, память, поиск) выполняется само. Изменения уходят карточкой
владельцу — [TAB] принять / [ESC] отклонить — либо выполняются сами, если так разрешено
в Настройках (режим «агент» и автономия «safe»). Опасные команды подтверждаются всегда.
Всё, что возвращается модели, проходит через вычищение секретов.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import shlex
import time
from pathlib import Path

from .. import client, config, paths, util
from . import safety

READ_LIMIT = 24_000


def _fn(name: str, desc: str, props: dict, required: list[str] | None = None) -> dict:
    return {"type": "function", "function": {"name": name, "description": desc, "parameters": {
        "type": "object", "properties": props, "required": required or []}}}


S = {"type": "string"}
I = {"type": "integer"}
B = {"type": "boolean"}

SCHEMAS = [
    _fn("list_dir", "Список файлов в папке.", {"path": S, "show_hidden": B}, ["path"]),
    _fn("read_file", "Прочитать текстовый файл (с номерами строк).", {"path": S, "start_line": I, "max_lines": I}, ["path"]),
    _fn("search_files", "Найти файлы по имени или тексту внутри.", {"query": S, "path": S, "content": B}, ["query"]),
    _fn("file_info", "Сведения о файле: размер, тип, даты, теги.", {"path": S}, ["path"]),
    _fn("system_status", "Состояние ноутбука: нагрузка, память GPU, температуры, батарея, сеть.", {}),
    _fn("processes", "Самые тяжёлые процессы.", {"sort": {"type": "string", "enum": ["cpu", "mem"]}, "limit": I}),
    _fn("network_devices", "Устройства в своей локальной сети (Network Recon).", {"rescan": B}),
    _fn("probe_device", "Глубокий осмотр устройства своей сети: открытые порты, службы, ОС.", {"ip": S}, ["ip"]),
    _fn("wifi_networks", "Доступные сети Wi-Fi и текущее подключение.", {}),
    _fn("router_status", "Роутер: модель, внешний IP, Wi-Fi, подключённые устройства.", {}),
    _fn("router_action", "Изменить настройку роутера (перед изменением делается резервная копия). "
        "Действия: wifi_on, wifi_off, reconnect, reboot, block_device, unblock_device.",
        {"action": S, "params": {"type": "object"}, "reason": S}, ["action", "reason"]),
    _fn("run_command", "Выполнить команду в фоне и получить вывод. Изменяющие систему — только с подтверждения.",
        {"command": S, "cwd": S, "reason": S}, ["command", "reason"]),
    _fn("terminal_run", "Выполнить команду в настоящей вкладке терминала HAOTICA (владелец видит её и вывод). Возвращает "
        "код выхода, папку и хвост вывода. По одной команде на шаг; команды — для текущей оболочки. Изменения "
        "подтверждает владелец, опасные — всегда отдельно.",
        {"command": S, "reason": S, "tab": {"type": "string", "enum": ["haotica", "active"]},
         "timeout": {"type": "integer", "description": "секунд ждать (по умолчанию 120); дольше — terminal_poll"}},
        ["command", "reason"]),
    _fn("terminal_poll", "Дождаться долгой команды, запущенной terminal_run (по exec_id).", {"exec_id": S}, ["exec_id"]),
    _fn("terminal_read", "Посмотреть на терминал: последние строки экрана, недавние команды с кодами выхода, папку и "
        "оболочку. Используй, когда владелец говорит «посмотри», «что за ошибка», «что там в терминале».",
        {"tab": {"type": "string", "enum": ["active", "haotica"]}, "lines": {"type": "integer", "description": "строк (до 400)"}}),
    _fn("suggest_command", "Предложить команду владельцу в терминал (вставляется в строку, не выполняется).",
        {"command": S, "reason": S}, ["command", "reason"]),
    _fn("write_file", "Записать файл (покажется владельцу на подтверждение).", {"path": S, "content": S, "append": B}, ["path", "content"]),
    _fn("trash_file", "Переместить файл в корзину (с подтверждением).", {"path": S, "reason": S}, ["path"]),
    _fn("get_setting", "Прочитать настройку системы (например appearance.ui_scale).", {"key": S}, ["key"]),
    _fn("set_setting", "Изменить настройку системы (например appearance.profile = \"SPACE\").", {"key": S, "value": {}, "reason": S}, ["key", "value"]),
    _fn("open_app", "Открыть приложение Haotica: files, editor, settings, calendar, netrecon, terminal…", {"name": S, "args": {"type": "array", "items": S}}, ["name"]),
    _fn("calendar_list", "События календаря на ближайшие дни.", {"days": I}),
    _fn("add_calendar_event", "Добавить событие в календарь (ISO-время, например 2026-11-06T15:00).",
        {"summary": S, "start": S, "end": S, "location": S, "alarm_minutes": I}, ["summary", "start"]),
    _fn("analyze_image", "Посмотреть на изображение и ответить на вопрос о нём (локальная модель зрения).",
        {"path": S, "question": S}, ["path"]),
    _fn("web_search", "Поиск и разбор ПУБЛИЧНОЙ информации в интернете через помощников. В задаче не должно быть "
        "ничего личного: только что найти, ограничения и формат.", {"task": S, "careful": B}, ["task"]),
    _fn("cloud_ask", "Спросить облачную модель (второе мнение). Нужен запрос разрешения у владельца.",
        {"question": S, "why": S, "effort": S}, ["question", "why"]),
    _fn("remember", "Запомнить факт о владельце (предпочтения, проекты, привычки).", {"fact": S}, ["fact"]),
    _fn("recall", "Вспомнить, что известно по теме.", {"query": S}, ["query"]),
    _fn("forget", "Забыть факт по номеру.", {"id": I}, ["id"]),
    _fn("notify", "Показать уведомление.", {"title": S, "body": S}, ["title"]),
]
NAMES = {s["function"]["name"] for s in SCHEMAS}
READ_ONLY = {"list_dir", "read_file", "search_files", "file_info", "system_status", "processes", "network_devices",
             "wifi_networks", "router_status", "get_setting", "calendar_list", "recall", "analyze_image", "web_search",
             "probe_device", "terminal_poll", "terminal_read"}
SAFE_ACTIONS = {"open_app", "remember", "forget", "notify", "suggest_command", "set_setting", "add_calendar_event"}


# интерактивные и полноэкранные программы: их вывод модели не нужен, запуск — только с вопросом
INTERACTIVE = {"vim", "nvim", "vi", "nano", "micro", "emacs", "less", "more", "most", "man", "top", "htop", "btop", "btm",
               "mc", "ranger", "lf", "nnn", "fzf", "tmux", "screen", "ssh", "telnet", "ftp", "sftp", "mysql", "psql",
               "sqlite3", "ipython", "edit", "notepad", "wsl", "bash", "zsh", "pwsh", "powershell", "cmd", "python",
               "python3", "py", "node", "irb", "lazygit", "tig", "k9s", "btop4win", "ntop", "glances", "watch"}


def interactive(cmd: str) -> bool:
    """Программа без аргументов (python, pwsh, wsl) или заведомо полноэкранная (vim, less, htop)."""
    import re as _re
    first = _re.split(r"\s*(?:&&|\|\||;|\|)\s*", cmd.strip())[0].split()
    if not first:
        return False
    prog = os.path.basename(first[0].replace("\\", "/")).lower().removesuffix(".exe")
    if prog in ("python", "python3", "py", "node", "bash", "zsh", "pwsh", "powershell", "cmd", "wsl", "ssh", "mysql", "psql", "sqlite3"):
        return len(first) == 1 or (prog == "ssh" and len(first) == 2)
    return prog in INTERACTIVE


def schemas(mode: str, terminal: bool = False) -> list[dict]:
    """terminal — открыт терминал HAOTICA: команды идут в него (terminal_run), фоновый run_command не нужен."""
    if mode == "observer":
        return [s for s in SCHEMAS if s["function"]["name"] in READ_ONLY | {"remember", "recall", "suggest_command", "notify"}]
    skip = {"run_command"} if terminal else {"terminal_run", "terminal_poll", "terminal_read"}
    return [s for s in SCHEMAS if s["function"]["name"] not in skip]


def _read_lines(p, start: int, n: int) -> str:
    out, size = [], 0
    with open(p, encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f, 1):
            if i < start:
                continue
            if len(out) >= n or size > READ_LIMIT:
                out.append(f"… (дальше есть ещё; читай с start_line={i})")
                break
            out.append(f"{i:5d}  {line.rstrip()}")
            size += len(line)
    return "\n".join(out)


def _append(p, text: str) -> None:
    with open(p, "a", encoding="utf-8") as f:
        f.write(text)


class Tools:
    def __init__(self, agent) -> None:
        self.agent = agent

    def cfg(self) -> dict:
        return config.get("haotica", {}) or {}

    def _path(self, p: str, cwd: str = "", must_exist: bool = True) -> Path:
        """Путь из запроса модели: ~, %VAR%, $env:VAR и $HOME раскрываются, относительный — от папки терминала.
        Несуществующий путь — «не найден» с подсказкой, а не «запрещён»: иначе модель просила владельца менять
        настройки доступа, хотя просто угадала не то имя пользователя."""
        s = str(p or "").strip().strip('"').strip("'")
        s = re.sub(r"(?i)\$env:(\w+)", lambda m: os.environ.get(m.group(1), m.group(0)), s)
        s = re.sub(r"(?i)\$home\b", lambda m: str(paths.HOME), s)
        s = os.path.expandvars(os.path.expanduser(s))
        if s and not os.path.isabs(s) and cwd:
            s = os.path.join(os.path.expanduser(cwd), s)
        if must_exist and s and not os.path.exists(s):
            raise FileNotFoundError(f"{s} (домашняя папка владельца: {paths.HOME})")
        ok, why = safety.path_allowed(s, self.cfg().get("folders_allowed", ["~"]), self.cfg().get("folders_denied", []))
        if not ok:
            raise PermissionError(why)
        return Path(s).resolve()

    def needs_card(self, name: str, args: dict, ctx: dict | None = None) -> tuple[bool, dict]:
        """(нужно ли подтверждение, оценка риска). Опасное — всегда карточкой; закрытые зоны — отказ."""
        ha = self.cfg()
        mode, autonomy = ha.get("mode", "copilot"), ha.get("autonomy", "readonly")
        ctx = ctx or {}
        if name in ("run_command", "terminal_run"):
            cmd = str(args.get("command", ""))
            shell = str(ctx.get("shell") or "")
            if name == "run_command" and os.name == "nt":
                shell = "cmd"                       # фоновый запуск на Windows — через cmd /c
            risk = safety.classify(cmd, shell)
            if risk["level"] in ("danger", "denied"):
                return True, risk
            if name == "terminal_run" and interactive(cmd):
                return True, {"level": "write", "reasons": ["интерактивная программа — запустить?"], "interactive": True}
            if risk["level"] == "read" and autonomy in ("readonly", "safe"):
                return False, risk
            return True, risk
        if name in READ_ONLY:
            return False, {"level": "read", "reasons": []}
        if name == "suggest_command":
            return True, safety.classify(str(args.get("command", "")), str(ctx.get("shell") or ""))
        if name in SAFE_ACTIONS and mode == "agent" and autonomy == "safe":
            return False, {"level": "write", "reasons": []}
        if name in ("open_app", "remember", "recall", "forget", "notify"):
            return False, {"level": "write", "reasons": []}
        if name == "cloud_ask":
            return True, {"level": "cloud", "reasons": ["данные уйдут в облако"]}
        return True, {"level": "write", "reasons": []}

    async def run(self, name: str, args: dict, ctx: dict) -> dict:
        fn = getattr(self, f"t_{name}", None)
        if fn is None:
            return {"error": f"нет инструмента {name}"}
        try:
            res = await fn(args, ctx)
        except PermissionError as e:
            return {"error": f"доступ запрещён: {e}"}
        except FileNotFoundError as e:
            return {"error": f"не найдено: {e}"}
        except Exception as e:  # noqa: BLE001 — ошибка инструмента уходит модели текстом
            return {"error": f"{type(e).__name__}: {e}"}
        return res

    # ── файлы ──────────────────────────────────────────────────
    async def t_list_dir(self, a, ctx):
        p = self._path(a.get("path") or ctx.get("cwd") or "~", ctx.get("cwd", ""))
        items = []
        for e in sorted(os.scandir(p), key=lambda x: (not x.is_dir(), x.name.lower()))[:400]:
            if e.name.startswith(".") and not a.get("show_hidden"):
                continue
            try:
                st = e.stat()
            except OSError:
                continue
            items.append(f"{'d' if e.is_dir() else '-'} {util.human_bytes(st.st_size) if not e.is_dir() else '':>9}  "
                         f"{time.strftime('%Y-%m-%d', time.localtime(st.st_mtime))}  {e.name}{'/' if e.is_dir() else ''}")
        return {"path": str(p), "entries": items, "count": len(items)}

    async def t_read_file(self, a, ctx):
        p = self._path(a["path"], ctx.get("cwd") or "~")
        start = max(1, int(a.get("start_line") or 1))
        n = min(800, int(a.get("max_lines") or 300))
        return {"path": str(p), "text": await asyncio.to_thread(_read_lines, p, start, n)}

    async def t_search_files(self, a, ctx):
        root = self._path(a.get("path") or ctx.get("cwd") or "~", ctx.get("cwd", ""))
        r = client.core("GET", f"/api/fs/search?q={_q(a['query'])}&path={_q(str(root))}&content={'1' if a.get('content') else '0'}&limit=60")
        res = (r or {}).get("results", [])
        return {"results": [x.get("path", x) if isinstance(x, dict) and "line" not in x else x for x in res][:60]}

    async def t_file_info(self, a, ctx):
        p = self._path(a["path"], ctx.get("cwd", ""))
        r = client.core("GET", f"/api/fs/stat?path={_q(str(p))}")
        return (r or {}).get("entry", {"error": "нет данных"})

    async def t_write_file(self, a, ctx):
        p = self._path(a["path"], ctx.get("cwd", ""), must_exist=False)
        p.parent.mkdir(parents=True, exist_ok=True)
        if a.get("append"):
            await asyncio.to_thread(_append, p, a["content"])
        else:
            util.atomic_write(p, a["content"])
        return {"ok": True, "path": str(p), "bytes": len(a["content"].encode())}

    async def t_trash_file(self, a, ctx):
        p = self._path(a["path"], ctx.get("cwd", ""))
        if os.name == "nt":
            from send2trash import send2trash
            await asyncio.to_thread(send2trash, str(p))
            return {"ok": True, "path": str(p)}
        rc, _, err = await util.arun(["gio", "trash", str(p)], 30)
        return {"ok": rc == 0, "error": err.strip()} if rc else {"ok": True, "path": str(p)}

    # ── система ────────────────────────────────────────────────
    async def t_system_status(self, a, ctx):
        m = util.load_json(paths.RUNTIME_DIR / "metrics.json", {}) or {}
        keys = ("cpu", "gpu", "ram_used_gb", "ram_total_gb", "gtt_used_gb", "gtt_total_gb", "temp_cpu", "temp_gpu", "fan_rpm",
                "power_profile", "battery", "charging", "on_battery", "battery_minutes", "net_name", "net_ip", "net_ping_ms",
                "game_mode", "llm_state", "llm_tps", "uptime_hours", "disk_free_gb")
        return {k: m.get(k) for k in keys if k in m}

    async def t_processes(self, a, ctx):
        r = client.core("GET", f"/api/sys/procs?sort={a.get('sort', 'cpu')}")
        lim = min(25, int(a.get("limit") or 10))
        return {"processes": [{k: p[k] for k in ("pid", "name", "cpu", "mem_mb", "user")} for p in (r or {}).get("procs", [])[:lim]]}

    async def t_run_command(self, a, ctx):
        cmd = str(a["command"])
        cwd = os.path.expanduser(a.get("cwd") or ctx.get("cwd") or "~")
        if not os.path.isdir(cwd):
            cwd = str(paths.HOME)
        kw = {"creationflags": 0x08000000} if os.name == "nt" else {}          # CREATE_NO_WINDOW
        proc = await asyncio.create_subprocess_shell(cmd, cwd=cwd, stdout=asyncio.subprocess.PIPE,
                                                     stderr=asyncio.subprocess.STDOUT, env={**os.environ, "TERM": "dumb"}, **kw)
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), 120)
        except asyncio.TimeoutError:
            proc.kill()
            return {"exit": -1, "output": "превышено время (120 с)"}
        text = out.decode("utf-8", "replace")
        if len(text) > 12000:
            text = text[:4000] + f"\n… ({len(text) - 10000} символов пропущено) …\n" + text[-6000:]
        return {"exit": proc.returncode, "output": text}

    async def t_terminal_run(self, a, ctx):
        return await self.agent.terminal_exec(a, ctx)

    async def t_terminal_poll(self, a, ctx):
        return await self.agent.terminal_poll(str(a.get("exec_id", "")))

    async def t_terminal_read(self, a, ctx):
        return await self.agent.terminal_read(a, ctx)

    async def t_suggest_command(self, a, ctx):
        return {"ok": True, "note": "команда вставлена в строку терминала; владелец решит, запускать ли её"}

    async def t_get_setting(self, a, ctx):
        return {"key": a["key"], "value": config.get(a["key"])}

    async def t_set_setting(self, a, ctx):
        r = client.core("POST", "/api/settings", {"changes": {a["key"]: a["value"]}, "source": "haotica"})
        return r or {"error": "ядро не отвечает"}

    async def t_open_app(self, a, ctx):
        if os.name == "nt":
            from .. import supervisor
            util.spawn([*supervisor.python_argv("haotica.apps"), str(a["name"]), *[str(x) for x in a.get("args") or []]])
            return {"ok": True}
        util.spawn(["haotica", "open", str(a["name"]), *[str(x) for x in a.get("args") or []]])
        return {"ok": True}

    async def t_notify(self, a, ctx):
        util.notify(str(a["title"])[:80], str(a.get("body", ""))[:300], icon="haotica-assistant")
        return {"ok": True}

    # ── сеть и роутер ──────────────────────────────────────────
    async def t_network_devices(self, a, ctx):
        if a.get("rescan"):
            client.core("POST", "/api/recon/scan", {}, timeout=240)
        r = client.core("GET", "/api/recon") or {}
        devs = [{k: d.get(k) for k in ("ip", "mac", "vendor", "hostname", "type", "known", "label", "last_seen", "os")}
                for d in r.get("devices", [])]
        return {"subnet": r.get("subnet"), "gateway": r.get("gateway"), "devices": devs, "router": r.get("router", {})}

    async def t_probe_device(self, a, ctx):
        r = client.core("POST", "/api/recon/probe", {"ip": a["ip"]}, timeout=240)
        return r or {"error": "ядро не отвечает"}

    async def t_wifi_networks(self, a, ctx):
        r = client.core("GET", "/api/wifi?rescan=1", timeout=30) or {}
        return {"radio": r.get("radio"), "networks": r.get("networks", [])[:25]}

    async def t_router_status(self, a, ctx):
        from .router import adapter
        ad = await adapter()
        if not ad:
            return {"error": "роутер не подключён (Настройки → Сеть → Роутер)"}
        return await ad.status()

    async def t_router_action(self, a, ctx):
        from .router import adapter
        ad = await adapter()
        if not ad:
            return {"error": "роутер не подключён"}
        backup = await ad.backup()
        res = await ad.action(str(a["action"]), a.get("params") or {})
        return {**res, "backup": str(backup) if backup else "резервная копия недоступна для этой модели"}

    # ── календарь, зрение, поиск, облако, память ─────────────────
    async def t_calendar_list(self, a, ctx):
        import datetime as dt
        now = dt.datetime.now(dt.timezone.utc).astimezone().replace(tzinfo=None)   # местное время
        to = now + dt.timedelta(days=min(60, int(a.get("days") or 7)))
        r = client.core("GET", f"/api/calendar?from={now.isoformat(timespec='minutes')}&to={to.isoformat(timespec='minutes')}") or {}
        return {"events": [{k: e[k] for k in ("summary", "start", "end", "location", "allday")} for e in r.get("events", [])[:40]]}

    async def t_add_calendar_event(self, a, ctx):
        r = client.core("POST", "/api/calendar", {k: v for k, v in a.items() if v not in (None, "")})
        return r or {"error": "ядро не отвечает"}

    async def t_analyze_image(self, a, ctx):
        p = self._path(a["path"], ctx.get("cwd", ""))
        return await self.agent.vision(p, a.get("question") or "Опиши, что на изображении.")

    async def t_web_search(self, a, ctx):
        return await self.agent.cloud.assist(str(a["task"]), careful=bool(a.get("careful")))

    async def t_cloud_ask(self, a, ctx):
        return await self.agent.cloud_request(str(a["question"]), str(a.get("why", "")), str(a.get("effort", "")), ctx)

    async def t_remember(self, a, ctx):
        return {"ok": True, "id": self.agent.memory.remember(str(a["fact"]))}

    async def t_recall(self, a, ctx):
        return {"facts": self.agent.memory.recall(str(a["query"]), 10)}

    async def t_forget(self, a, ctx):
        return {"ok": self.agent.memory.forget(int(a["id"]))}


def _q(s: str) -> str:
    import urllib.parse
    return urllib.parse.quote(s, safe="")


def describe(name: str, args: dict) -> str:
    """Короткая подпись карточки для владельца."""
    if name in ("run_command", "suggest_command", "terminal_run"):
        return str(args.get("command", ""))
    if name == "write_file":
        return f"Записать {args.get('path')} ({len(str(args.get('content', '')))} символов)"
    if name == "trash_file":
        return f"В корзину: {args.get('path')}"
    if name == "set_setting":
        return f"{args.get('key')} = {json.dumps(args.get('value'), ensure_ascii=False)}"
    if name == "router_action":
        return f"Роутер: {args.get('action')} {json.dumps(args.get('params') or {}, ensure_ascii=False)}"
    if name == "add_calendar_event":
        return f"Событие: {args.get('summary')} · {args.get('start')}"
    return f"{name} {json.dumps(args, ensure_ascii=False)[:200]}"


def shell_quote(s: str) -> str:
    return shlex.quote(s)
