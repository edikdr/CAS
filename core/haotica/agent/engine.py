"""Движок Haotica: ход разговора, инструменты, карточки разрешений, состояние для оболочки.

Ход: системная инструкция (persona) + память + конспект + история → выбор модели (LLM.route) →
поток ответа → вызовы инструментов (Tools.run) → карточки [TAB]/[ESC] там, где нужно разрешение →
итоговый ответ в память. Всё, что уходит модели, проходит через safety.redact.
Без облачного ключа и без синтеза речи Haotica работает молча и полностью локально.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import mimetypes
import os
import re
import time
import uuid
from collections import OrderedDict
from collections.abc import AsyncIterator
from pathlib import Path

from .. import config, models, paths, util
from ..server.hub import Hub
from . import persona, safety, tools
from .cloud import Cloud
from .llm import LLM
from .memory import Memory

log = logging.getLogger("haotica.engine")
MAX_ROUNDS = 12                 # шагов инструментов за ход (цепочка команд в терминале)
EXEC_TIMEOUT = 120              # сек ожидания команды в терминале по умолчанию; дольше — «запустить и опрашивать»
OUTPUT_LIMIT = 12_000           # символов вывода команды, которые уходят модели
HISTORY_TURNS = 40
SUMMARY_AT = 48
KEEP_AFTER_SUMMARY = 16
CARD_TIMEOUT = 600
STATE_FILE = "haotica.json"
WANT_RX = re.compile(r"^\s*/(deep|base)\b\s*", re.I)


class State:
    """Состояние для аватара и оболочки: hub «state» + $XDG_RUNTIME_DIR/haotica/haotica.json."""

    def __init__(self, agent: Agent) -> None:
        self.agent = agent
        self.value = "idle"
        self.line = ""
        self._last_written = ""

    def set(self, value: str, line: str | None = None) -> None:
        self.value = value
        if line is not None:
            self.line = line[:300]
        self.write()

    def snapshot(self) -> dict:
        a = self.agent
        llm = a.llm
        role = llm.switching or llm.main
        st = llm.state.get(role, "offline")
        dl = a.download_state(role)
        if dl and st != "ready":
            st = dl
        if llm.paused:
            st = "paused"
        labels = {}
        try:
            labels = {r: e["label"] for r, e in models.load_manifest()["models"].items()}
        except Exception:  # noqa: BLE001
            pass
        return {"state": self.value, "line": self.line, "text": self.line, "llm_state": st, "llm_tps": llm.tps, "llm_role": role,
                "llm_model": labels.get(role, role), "switching": llm.switching,
                "cloud_assist": a.cloud.assist_active > 0, "busy": a.busy, "cards": len(a.cards), "ts": int(time.time())}

    def write(self) -> None:
        snap = self.snapshot()
        self.agent.hub.publish("state", snap)
        key = json.dumps({k: v for k, v in snap.items() if k != "ts"}, sort_keys=True, ensure_ascii=False)
        if key == self._last_written:
            return
        self._last_written = key
        try:
            paths.RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
            util.write_json(paths.RUNTIME_DIR / STATE_FILE, snap)
        except OSError:
            log.warning("не удалось записать %s", STATE_FILE)


class Agent:
    def __init__(self) -> None:
        self.hub = Hub()
        self.llm = LLM()
        self.memory = Memory()
        self.cloud = Cloud(self.hub)
        self.state = State(self)
        self.tools = tools.Tools(self)
        self.voice = None
        self.cards: dict[str, dict] = {}
        self.busy = False
        self._turn_lock = asyncio.Lock()
        self._complete_cache: OrderedDict[str, str] = OrderedDict()
        self._unprompted: list[float] = []
        self._tasks: set[asyncio.Task] = set()
        self._dl_cache: tuple[float, dict] = (0.0, {})
        self.cancels: dict[str, asyncio.Event] = {}     # чат → «стоп»
        self.plan_ok: dict[str, bool] = {}              # чат → владелец разрешил весь план (кроме опасного)
        self.execs: dict[str, asyncio.Future] = {}      # exec_id → результат команды из терминала
        self.exec_meta: dict[str, dict] = {}
        self.terminal_seen = 0.0                        # когда терминал последний раз подтвердил подписку

    # ── жизненный цикл ─────────────────────────────────────────
    async def start(self) -> None:
        await self.llm.start()
        try:
            from .voice import Voice
            self.voice = Voice(self.hub, self.state)
        except Exception:  # noqa: BLE001 — без голоса работаем молча
            log.info("голос недоступен")
        self.bg(self._tick())
        self.bg(self.cloud.load_key())
        if config.get("haotica.enabled", True) and not self._game_on():
            self.bg(self._warmup())
        self.bg(self._voice_up())

    async def _voice_up(self) -> None:
        """Windows: служба речи поднимается вместе с Haotica, если голос поставлен и включён (раньше — только
        кнопкой «Перезапустить голос», и Сара молчала после каждого запуска)."""
        from .. import services
        from ..tts import runtime
        if not services.supervised() or not runtime.installed() or not config.get("haotica.voice", True):
            return
        started, e = await services.start("tts")
        if not started:
            log.warning("служба речи не запустилась: %s", e)

    async def stop(self) -> None:
        for c in list(self.cards.values()):
            if not c["future"].done():
                c["future"].set_result(False)
        await self.llm.stop()

    def bg(self, coro) -> asyncio.Task:
        t = asyncio.create_task(coro)
        self._tasks.add(t)
        t.add_done_callback(self._tasks.discard)
        return t

    async def _tick(self) -> None:
        n = 0
        while True:
            try:
                self.state.write()
                n += 1
                if n % 10 == 0 and config.get("haotica.enabled", True) and not self.llm.paused and not self._game_on():
                    await self._warmup(quick=True)
            except Exception:  # noqa: BLE001
                log.exception("state")
            await asyncio.sleep(3)

    async def _warmup(self, quick: bool = False) -> None:
        """Поднять основную модель (по режиму: base или deep) и fast, когда их файлы скачаны."""
        main = self.llm.main
        if not quick and main == "base" and self.llm.route("", 0, "panel", "") == "deep":
            main = self.llm.main = "deep"            # в «авто» на Windows основная — deep: сразу её, без base
        for role in ("fast", main if main in models.MAIN_ROLES else "base"):
            if self.download_state(role) or self.llm.state.get(role) not in ("offline", "sleep"):
                continue
            if quick and self.llm.state.get(role) == "sleep":
                continue                      # выгружена намеренно (deep ⇄ base) — не трогаем
            try:
                if quick:
                    self.bg(self.llm.ensure(role, 600))
                elif await self.llm.ensure(role, 600) and role in models.MAIN_ROLES:
                    self.bg(self._prefill(role))
            except Exception:  # noqa: BLE001
                log.warning("%s не поднялась", role)

    async def _prefill(self, role: str) -> None:
        """Прогреть кэш промпта: системная инструкция и описания инструментов (~3,5 тыс. токенов, ~20 с на base)
        считаются сразу после загрузки модели, а не на первом вопросе владельца."""
        try:
            await asyncio.sleep(4)                      # окно терминала успевает подписаться на exec
            from ..apps import profiles
            pr = profiles.detect()
            dp = next((p for p in pr if p["id"] == profiles.default_id(pr)), {}) if pr else {}
            ctx = {"source": "terminal", "shell": dp.get("kind", ""), "shell_name": dp.get("name", ""),
                   "os": "windows" if os.name == "nt" else "linux"}
            sys_msg = self.build_messages("__prefill__", ".", ctx)[0]
            schemas = tools.schemas(config.get("haotica.mode", "copilot"), terminal=self.hub_has_exec_listener())
            t0 = time.time()
            async for _ev in self.llm.chat([sys_msg, {"role": "user", "content": "."}], schemas, role, max_tokens=1):
                pass
            log.info("кэш промпта %s прогрет за %.1f с", role, time.time() - t0)
        except Exception as e:  # noqa: BLE001 — не вышло — первый вопрос просто будет дольше
            log.info("прогрев кэша %s: %s", role, e)

    def _game_on(self) -> bool:
        m = util.load_json(paths.RUNTIME_DIR / "metrics.json", {}) or {}
        return bool(m.get("game_mode"))

    def download_state(self, role: str) -> str:
        """'' — модель на месте; иначе 'downloading 37%' / 'missing'."""
        now = time.time()
        if now - self._dl_cache[0] > 5:
            try:
                self._dl_cache = (now, models.status())
            except Exception:  # noqa: BLE001
                self._dl_cache = (now, {})
        st = self._dl_cache[1].get(role)
        if not st or st.get("ready") or self.llm.state.get(role) == "ready":   # сервер модели уже отвечает
            return ""
        if st.get("have"):
            return f"downloading {int(100 * st['have'] / max(1, st['size']))}%"
        return "missing"

    # ── карточки разрешений ────────────────────────────────────
    def make_card(self, name: str, args: dict, risk: dict, chat: str, source: str) -> dict:
        cid = uuid.uuid4().hex[:12]
        kind = {"suggest_command": "command", "run_command": "run", "terminal_run": "run", "cloud_ask": "cloud"}.get(name, "action")
        title = {"command": "КОМАНДА", "run": "ВЫПОЛНИТЬ", "cloud": "CLOUD REQUEST"}.get(kind, "ДЕЙСТВИЕ")
        card = {"id": cid, "kind": kind, "tool": name, "title": title, "chat": chat, "source": source,
                "text": tools.describe(name, args), "command": str(args.get("command", "")),
                "why": str(args.get("reason") or args.get("why") or ""), "risk": risk,
                "args": {k: v for k, v in args.items() if k != "content"}, "ts": int(time.time()),
                "plan": name == "terminal_run" and risk.get("level") != "danger"}
        if name == "write_file":
            card["preview"] = str(args.get("content", ""))[:2000]
        if name == "cloud_ask":
            card["question"] = safety.redact(str(args.get("question", "")))
            card["model"] = self.cloud.cfg().get("model", "")
        return card

    async def ask_card(self, card: dict) -> bool:
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self.cards[card["id"]] = {"card": card, "future": fut}
        self.hub.publish("card", card, keep=False)
        self.hub.publish("message", {"chat": card.get("chat"), "role": "card", "card": card}, keep=False)
        self.state.set("warning")
        cancel = self.cancels.get(card.get("chat", ""))
        try:
            waiters = [fut] + ([asyncio.ensure_future(cancel.wait())] if cancel else [])
            done, pending = await asyncio.wait(waiters, timeout=CARD_TIMEOUT, return_when=asyncio.FIRST_COMPLETED)
            for p in pending:
                if p is not fut:
                    p.cancel()
            if fut in done:
                res = fut.result()
                if res == "plan":                       # «выполнить весь план»: дальше изменения без карточек
                    self.plan_ok[card.get("chat", "")] = True
                    return True
                return bool(res)
            return False
        finally:
            self.cards.pop(card["id"], None)
            self.hub.publish("card_done", {"id": card["id"]}, keep=False)

    def resolve_card(self, cid: str, accept: bool | str) -> bool:
        c = self.cards.get(cid)
        if not c or c["future"].done():
            return False
        if accept == "plan" and not c["card"].get("plan"):
            accept = True                               # опасное «планом» не разрешается
        c["future"].set_result(accept)
        return True

    # ── стоп и команды в терминале ─────────────────────────────
    def stop_turn(self, chat: str = "") -> dict:
        """Кнопка «стоп» / Esc: прервать ход, отклонить ожидающие карточки, Ctrl+C команде в терминале."""
        chats = [chat] if chat else list(self.cancels)
        if self.voice:
            self.bg(self.voice.stop())
        for c in chats:
            ev = self.cancels.get(c)
            if ev:
                ev.set()
        for c in list(self.cards.values()):
            if (not chat or c["card"].get("chat") == chat) and not c["future"].done():
                c["future"].set_result(False)
        for eid, meta in list(self.exec_meta.items()):
            if (not chat or meta.get("chat") == chat) and eid in self.execs and not self.execs[eid].done():
                self.hub.publish("exec_cancel", {"id": eid}, keep=False)
        return {"stopped": chats}

    async def terminal_exec(self, args: dict, ctx: dict) -> dict:
        """terminal_run: команда уходит в настоящую вкладку терминала (событие exec), результат — POST /api/terminal/result."""
        cmd = str(args.get("command", "")).strip()
        if not cmd:
            return {"error": "пустая команда"}
        if not self.hub_has_exec_listener():
            return {"error": "терминал HAOTICA не открыт — открой его, чтобы я могла выполнять команды"}
        eid = uuid.uuid4().hex[:12]
        timeout = max(5, min(1800, int(args.get("timeout") or EXEC_TIMEOUT)))
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self.execs[eid] = fut
        tab = str(args.get("tab") or config.get("terminal.haotica_tab", "separate") or "separate")
        meta = {"id": eid, "chat": ctx.get("chat", ""), "command": cmd, "reason": str(args.get("reason", "")),
                "tab": tab, "timeout": timeout, "pane": ctx.get("pane", ""), "win": ctx.get("win", ""), "ts": time.time()}
        self.exec_meta[eid] = meta
        self.hub.publish("exec", meta, keep=False)
        self.state.set("speaking", f"$ {cmd[:120]}")
        cancel = self.cancels.get(meta["chat"])
        waiters = [fut] + ([asyncio.ensure_future(cancel.wait())] if cancel else [])
        done, pending = await asyncio.wait(waiters, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
        for p in pending:
            if p is not fut:
                p.cancel()
        if fut not in done:
            if cancel and cancel.is_set():
                self.hub.publish("exec_cancel", {"id": eid}, keep=False)
                return {"exec_id": eid, "status": "cancelled", "note": "владелец остановил"}
            return {"exec_id": eid, "status": "running",
                    "note": f"команда выполняется дольше {timeout} с; проверь позже инструментом terminal_poll"}
        return self._exec_result(eid, fut.result())

    def hub_has_exec_listener(self) -> bool:
        """Открыт ли терминал, который принимает команды Haotica (подписан на тему exec)."""
        try:
            return any("exec" in topics for _q, topics in list(self.hub._subs))
        except Exception:  # noqa: BLE001
            return False

    def terminal_claim(self, eid: str, win: str) -> bool:
        """Команду (или чтение экрана) берёт ровно одно окно терминала — первое, кто попросил."""
        meta = self.exec_meta.get(eid)
        if not meta or eid not in self.execs or self.execs[eid].done():
            return False
        if meta.get("claimed") and meta["claimed"] != win:
            return False
        meta["claimed"] = win or "?"
        return True

    async def terminal_read(self, args: dict, ctx: dict) -> dict:
        """terminal_read: что сейчас на экране терминала — последние строки и блоки команд (с кодами выхода)."""
        if not self.hub_has_exec_listener():
            return {"error": "терминал HAOTICA не открыт"}
        eid = uuid.uuid4().hex[:12]
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self.execs[eid] = fut
        tab = "haotica" if str(args.get("tab") or "") == "haotica" else "active"
        self.exec_meta[eid] = {"id": eid, "kind": "read", "win": ctx.get("win", ""), "ts": time.time()}
        self.hub.publish("term_read", {"id": eid, "tab": tab, "lines": int(args.get("lines") or 80),
                                       "win": ctx.get("win", "")}, keep=False)
        try:
            r = await asyncio.wait_for(asyncio.shield(fut), 8)
        except asyncio.TimeoutError:
            return {"error": "терминал не ответил"}
        finally:
            self.execs.pop(eid, None)
            self.exec_meta.pop(eid, None)
        if r.get("error"):
            return {"error": str(r["error"])[:300]}
        screen = safety.redact(str(r.get("screen", "") or ""))
        if len(screen) > OUTPUT_LIMIT:
            screen = "…\n" + screen[-OUTPUT_LIMIT:]
        if r.get("alt"):
            screen = "[полноэкранная программа: содержимое экрана не передаётся]"
        blocks = [{"cmd": safety.redact(str(b.get("cmd", "")))[:300], "exit": b.get("exit"), "ms": b.get("ms"),
                   "cwd": b.get("cwd", ""), "by_haotica": bool(b.get("by_haotica"))} for b in (r.get("blocks") or [])[:8]]
        return {"tab": str(r.get("tab", ""))[:60], "shell": r.get("shell", ""), "cwd": r.get("cwd", ""),
                "running": safety.redact(str(r.get("running", "")))[:200], "screen": screen, "blocks": blocks,
                "tabs": [str(t)[:40] for t in (r.get("tabs") or [])[:20]]}

    def _exec_result(self, eid: str, r: dict) -> dict:
        out = safety.redact(str(r.get("output_tail", "") or ""))
        if len(out) > OUTPUT_LIMIT:
            out = "…\n" + out[-OUTPUT_LIMIT:]
        if r.get("alt"):
            out = "[полноэкранная программа: вывод не передаётся]"
        res = {"exec_id": eid, "exit": r.get("exit"), "duration_ms": r.get("duration"), "cwd": r.get("cwd", ""),
               "output_tail": out}
        if r.get("error"):
            res["error"] = str(r["error"])[:300]
        meta = self.exec_meta.get(eid, {})
        self._journal({"ts": int(time.time()), "chat": meta.get("chat"), "command": meta.get("command"),
                       "exit": res.get("exit"), "ms": res.get("duration_ms"), "cwd": res.get("cwd"),
                       "error": res.get("error", "")})
        return res

    async def terminal_poll(self, eid: str, wait: float = 30) -> dict:
        fut = self.execs.get(eid)
        if not fut:
            return {"error": "нет такой команды"}
        try:
            r = await asyncio.wait_for(asyncio.shield(fut), wait)
        except asyncio.TimeoutError:
            return {"exec_id": eid, "status": "running"}
        return self._exec_result(eid, r)

    def terminal_result(self, d: dict) -> bool:
        eid = str(d.get("exec_id", ""))
        fut = self.execs.get(eid)
        if not fut or fut.done():
            return False
        fut.set_result(d)
        self.bg(self._forget_exec(eid))
        return True

    async def _forget_exec(self, eid: str) -> None:
        await asyncio.sleep(3600)
        self.execs.pop(eid, None)
        self.exec_meta.pop(eid, None)

    def _journal(self, rec: dict) -> None:
        try:
            paths.LOG_DIR.mkdir(parents=True, exist_ok=True)
            with open(paths.LOG_DIR / "agent-steps.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        except OSError:
            pass

    def pending_cards(self) -> list[dict]:
        return [c["card"] for c in self.cards.values()]

    # ── сборка запроса ─────────────────────────────────────────
    def build_messages(self, chat: str, text: str, context: dict) -> list[dict]:
        s = config.load()
        ctx = dict(context or {})
        ctx["metrics"] = util.load_json(paths.RUNTIME_DIR / "metrics.json", {}) or {}
        mems = self.memory.recall(text, 8) if s.get("haotica", {}).get("memory", True) else []
        # начало промпта (инструкция, инструменты, история) не меняется от хода к ходу — llama-server берёт его
        # из кэша; время, метрики, папка и воспоминания по теме — в конце последнего сообщения
        sys = persona.system_prompt(s, ctx, [], dynamic=False)
        summ = self.memory.summary(chat)
        if summ:
            sys += "\n\nКонспект раннего разговора:\n" + safety.redact(summ)
        msgs = [{"role": "system", "content": sys}]
        for h in self.memory.history(chat, HISTORY_TURNS):
            if h["role"] in ("user", "assistant") and h["content"]:
                msgs.append({"role": h["role"], "content": safety.redact(h["content"])})
        att_text, images = self._attachments(context or {})
        note = persona.context_note(s, ctx, [safety.redact(m) for m in mems])
        user_text = safety.redact(self._with_context(text, context or {}) + att_text) + \
            ("\n\n[обстановка — для справки, не отвечай на неё]\n" + safety.redact(note) if note else "")
        if images:                      # изображения — частями сообщения (зрение у base)
            msgs.append({"role": "user", "content": [{"type": "text", "text": user_text}, *images]})
        else:
            msgs.append({"role": "user", "content": user_text})
        return msgs

    def _attachments(self, ctx: dict) -> tuple[str, list[dict]]:
        """Вложения из чата: текст (до 20 КБ, секреты вычищаются), изображения (для base), папки — листингом."""
        files = [str(f) for f in (ctx.get("files") or [])][:8]
        if not files:
            return "", []
        ha = config.get("haotica", {}) or {}
        parts, images = [], []
        for f in files:
            ok, why = safety.path_allowed(f, ha.get("folders_allowed", ["~"]), ha.get("folders_denied", []))
            if not ok:
                parts.append(f"[вложение {f}: недоступно — {why}]")
                continue
            p = Path(f)
            try:
                if p.is_dir():
                    names = sorted(x.name + ("/" if x.is_dir() else "") for x in list(p.iterdir())[:300])
                    parts.append(f"Папка {p}:\n" + "\n".join(names[:200]))
                elif p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp") and p.stat().st_size < 12 * 2 ** 20:
                    mime = mimetypes.guess_type(str(p))[0] or "image/png"
                    images.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,"
                                                                    + base64.b64encode(p.read_bytes()).decode()}})
                    parts.append(f"[изображение {p.name}]")
                else:
                    raw = p.read_bytes()[:20_000]
                    if b"\x00" in raw[:4000]:
                        parts.append(f"[{p.name}: двоичный файл, {p.stat().st_size} байт]")
                    else:
                        parts.append(f"Файл {p}:\n```\n{raw.decode('utf-8', 'replace')}\n```")
            except OSError as e:
                parts.append(f"[вложение {f}: {e}]")
        return "\n\n[вложения]\n" + "\n\n".join(parts), images

    @staticmethod
    def _with_context(text: str, ctx: dict) -> str:
        extra = []
        for k in ("cmd", "code", "path", "selection", "output"):
            v = ctx.get(k)
            if v not in (None, ""):
                v = str(v)
                extra.append(f"{k}:\n```\n{v[-6000:]}\n```" if "\n" in v or len(v) > 120 else f"{k}: {v}")
        return text + ("\n\n[контекст]\n" + "\n".join(extra) if extra else "")

    # ── ход разговора ──────────────────────────────────────────
    async def turn(self, text: str, source: str = "panel", chat: str = "", context: dict | None = None,
                   retry: bool = False) -> AsyncIterator[dict]:
        """События хода: delta, tool, step, card, error, done{text, role}. retry — ответить заново на последний вопрос."""
        chat = chat or source or "panel"
        context = context or {}
        if retry:
            last = self.memory.last_user(chat)
            if not last:
                yield {"type": "error", "error": "нечего повторять"}
                return
            self.memory.drop_after(chat, last["id"])
            text = last["content"]
        want = ""
        m = WANT_RX.match(text)
        if m:
            want, text = m.group(1).lower(), text[m.end():]
        if not text.strip():
            if want:
                ok = await self.llm.use(want)
                msg = f"Модель: {want}" + ("" if ok else " — не удалось запустить")
                yield {"type": "done", "text": msg, "role": want}
                return
            yield {"type": "error", "error": "пустой запрос"}
            return
        if not config.get("haotica.enabled", True):
            yield {"type": "error", "error": "Haotica выключена в Настройках"}
            return
        if self.llm.paused:
            yield {"type": "error", "error": "режим «Игра»: модели выгружены, вернусь после игры"}
            return
        if self.voice:                       # владелец заговорил — Haotica замолкает
            self.bg(self.voice.stop())
        async with self._turn_lock:
            self.busy = True
            self.cancels[chat] = asyncio.Event()
            self.plan_ok.pop(chat, None)
            try:
                async for ev in self._turn(text, source, chat, context, want, retry):
                    yield ev
            finally:
                self.busy = False
                self.cancels.pop(chat, None)
                self.plan_ok.pop(chat, None)
                self.state.set("idle")

    async def _turn(self, text, source, chat, context, want, retry=False) -> AsyncIterator[dict]:
        self.memory.chat(chat, source)
        msgs = self.build_messages(chat, text, context)
        ctx_tokens = sum(len(x["content"]) if isinstance(x["content"], str) else 2000 for x in msgs) // 3
        role = self.llm.route(text, ctx_tokens, source, want, images=not isinstance(msgs[-1]["content"], str))
        dl = self.download_state(role)
        if dl and role == "deep" and not self.download_state("base"):
            role, dl = "base", ""
        if dl:
            pct = dl.split()[-1] if dl.startswith("downloading") else ""
            err = f"модель ещё загружается ({pct})" if pct else "модель не скачана: Настройки → Haotica → Модели"
            self.state.set("sleep", err)
            yield {"type": "error", "error": err, "llm_state": dl}
            return
        if not retry:
            self.memory.add(chat, "user", text, {"source": source})
            self.hub.publish("message", {"chat": chat, "role": "user", "text": text, "source": source}, keep=False)
        else:   # build_messages уже содержит вопрос из истории — убираем дубль
            last = msgs[-1]["content"] if isinstance(msgs[-1]["content"], str) else ""
            if len(msgs) >= 2 and msgs[-2].get("role") == "user" and isinstance(msgs[-2]["content"], str) \
                    and last.startswith(msgs[-2]["content"]):
                msgs.pop(-2)
        self.state.set("reading")
        if not await self.llm.use(role, 600):
            why = self.llm.errors.get(role, "")
            where = (f"журнал {paths.LOG_DIR / f'llm-{role}.log'}" if os.name == "nt"
                     else f"journalctl --user -u haotica-llm-{role}")
            err = f"модель {role} не запустилась: {why or where}"
            if role == "deep" and await self.llm.use("base", 600):    # deep не поднялась — отвечает base
                note = f"_({err}; отвечает base)_\n\n"
                self.hub.publish("message", {"chat": chat, "role": "assistant", "delta": note}, keep=False)
                yield {"type": "delta", "text": note}
                role = "base"
            else:
                self.state.set("warning", err)
                yield {"type": "error", "error": err}
                return
        mode = config.get("haotica.mode", "copilot")
        schemas = tools.schemas(mode, terminal=self.hub_has_exec_listener()) if config.get("haotica.enabled", True) else None
        think = role == "base" and (len(text) > 400 or bool(re.search(r"(?i)подумай|почему|объясни|think", text)))
        final, used, steps = "", [], []
        cancel = self.cancels.get(chat)
        recent: list[str] = []
        stopped = False
        for _round in range(MAX_ROUNDS):
            if cancel and cancel.is_set():
                stopped = True
                break
            self.state.set("thinking")
            buf, calls = "", []
            try:
                async for ev in self.llm.chat(msgs, schemas, role, max_tokens=4096 if role == "deep" else 2048,
                                              think=think):
                    if cancel and cancel.is_set():
                        stopped = True
                        break
                    if ev["type"] == "delta":
                        if not buf:
                            self.state.set("speaking")
                        buf += ev["text"]
                        self.hub.publish("message", {"chat": chat, "role": "assistant", "delta": ev["text"]}, keep=False)
                        yield {"type": "delta", "text": ev["text"]}
                    elif ev["type"] == "tool_calls":
                        calls = ev["calls"]
            except Exception as e:  # noqa: BLE001
                log.exception("llm")
                err = f"ошибка модели: {e}"
                self.state.set("warning", err)
                yield {"type": "error", "error": err}
                return
            buf = _strip_think(buf)
            if stopped:
                final = (buf + "\n\n" if buf else "") + "⏹ Остановлено."
                break
            if not calls:
                final = buf
                break
            msgs.append({"role": "assistant", "content": buf or None, "tool_calls": [
                {"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": c["arguments"] or "{}"}}
                for c in calls]})
            for c in calls:
                if cancel and cancel.is_set():
                    res = {"error": "владелец остановил"}
                    stopped = True
                else:
                    sig = c["name"] + (c.get("arguments") or "")
                    recent.append(sig)
                    if recent[-3:].count(sig) == 3:          # одно и то же трижды подряд — зацикливание
                        res = {"error": "зацикливание: этот шаг уже был трижды подряд, остановись и объясни владельцу"}
                    else:
                        res = await self._call_tool(c, chat, source, context)
                used.append(c["name"])
                step = self._step(c, res)
                steps.append(step)
                self.hub.publish("message", {"chat": chat, "role": "step", "step": step}, keep=False)
                yield {"type": "tool", "name": c["name"], "ok": "error" not in res}
                yield {"type": "step", "step": step}
                msgs.append({"role": "tool", "tool_call_id": c["id"], "name": c["name"],
                             "content": safety.redact(json.dumps(res, ensure_ascii=False, default=str))[:24000]})
            if stopped:
                final = "⏹ Остановлено."
                break
        else:
            final = final or "Слишком много шагов подряд — остановилась. Уточни задачу."
        final = final.strip() or "…"
        mid = self.memory.add(chat, "assistant", final, {"role": role, "tools": used, "steps": steps})
        self.hub.publish("message", {"chat": chat, "role": "assistant", "text": final, "final": True, "model": role,
                                     "id": mid, "steps": steps}, keep=False)
        self.state.set("idle", final.splitlines()[0] if final else "")
        if self.voice and source not in ("cli", "complete") and not final.startswith("⏹"):
            self.bg(self._say(final))
        self.bg(self._maybe_summarize(chat))
        self.bg(self._autotitle(chat))
        yield {"type": "done", "text": final, "role": role, "tools": used, "steps": steps, "id": mid}

    @staticmethod
    def _step(c: dict, res: dict) -> dict:
        try:
            a = json.loads(c.get("arguments") or "{}")
        except ValueError:
            a = {}
        st = {"tool": c["name"], "ok": "error" not in res, "ts": int(time.time())}
        if a.get("command"):
            st["command"] = str(a["command"])[:400]
        if "exit" in res:
            st["exit"] = res.get("exit")
        if res.get("duration_ms") is not None:
            st["ms"] = res.get("duration_ms")
        if res.get("status"):
            st["status"] = res["status"]
        if res.get("error"):
            st["error"] = str(res["error"])[:200]
        return st

    async def _autotitle(self, chat: str) -> None:
        """Название чата быстрой моделью после первого ответа (если человек не назвал его сам)."""
        c = self.memory.get_chat(chat)
        if not c or c.get("titled") or self.llm.state.get("fast") != "ready":
            return
        hist = self.memory.history(chat, 4)
        if not hist:
            return
        dump = "\n".join(f"{h['role']}: {h['content'][:300]}" for h in hist)
        t = await self.llm.complete([
            {"role": "system", "content": "Придумай название чата: 2–5 слов, без кавычек и точки. Только название."},
            {"role": "user", "content": safety.redact(dump)}], role="fast", max_tokens=16, timeout=6)
        t = _strip_think(t).strip().strip('"«»').splitlines()[0][:60] if t else ""
        if t:
            self.memory.update_chat(chat, title=t, auto=True)
            self.hub.publish("message", {"chat": chat, "role": "title", "title": t}, keep=False)

    async def _call_tool(self, c: dict, chat: str, source: str, context: dict) -> dict:
        name = c["name"]
        try:
            args = json.loads(c.get("arguments") or "{}")
            if not isinstance(args, dict):
                raise ValueError
        except ValueError:
            return {"error": "аргументы не в JSON"}
        if name not in tools.NAMES:
            return {"error": f"нет инструмента {name}"}
        tool_ctx = {"cwd": context.get("cwd") or str(paths.HOME), "chat": chat, "source": source,
                    "shell": context.get("shell", ""), "pane": context.get("pane", ""), "win": context.get("win", "")}
        need, risk = self.tools.needs_card(name, args, tool_ctx)
        if risk.get("level") == "denied":
            return {"error": "отказано: " + ", ".join(risk.get("reasons", [])) + " — эта зона закрыта для Haotica всегда"}
        if need and self.plan_ok.get(chat) and risk.get("level") in ("write", "read") and name == "terminal_run":
            need = False                       # владелец разрешил весь план; опасное всё равно спрашиваем
        if need:
            card = self.make_card(name, args, risk, chat, source)
            ok = await self.ask_card(card)
            self.state.set("thinking")
            if not ok:
                return {"error": "владелец отклонил"}
            if name == "suggest_command":
                return {"ok": True, "note": "владелец принял команду; она вставлена в строку терминала"}
        return await self.tools.run(name, args, tool_ctx)

    async def _say(self, text: str) -> None:
        try:
            await self.voice.say(text, "warning" if self.state.value == "warning" else "neutral")
        except Exception:  # noqa: BLE001 — нет TTS — молчим
            pass

    async def _maybe_summarize(self, chat: str) -> None:
        hist = self.memory.history(chat, SUMMARY_AT + 1)
        if len(hist) <= SUMMARY_AT:
            return
        old = hist[:-KEEP_AFTER_SUMMARY]
        prev = self.memory.summary(chat)
        dump = "\n".join(f"{h['role']}: {h['content'][:800]}" for h in old)
        txt = await self.llm.complete([
            {"role": "system", "content": "Сожми разговор в конспект на 10–15 пунктов: факты, решения, открытые задачи. "
             "Без секретов."},
            {"role": "user", "content": safety.redact((prev + "\n" if prev else "") + dump)[-30000:]}],
            role=self.llm.main, max_tokens=700, timeout=120)
        if txt:
            self.memory.set_summary(chat, _strip_think(txt), KEEP_AFTER_SUMMARY)

    async def ask(self, text: str, source: str = "panel", chat: str = "", context: dict | None = None,
                  retry: bool = False) -> dict:
        out: dict = {"ok": False}
        async for ev in self.turn(text, source, chat, context, retry):
            if ev["type"] == "done":
                out = {"ok": True, "text": ev["text"], "model": ev.get("role"), "tools": ev.get("tools", []),
                       "steps": ev.get("steps", []), "id": ev.get("id")}
            elif ev["type"] == "error":
                out = {"ok": False, "error": ev["error"], **({"llm_state": ev["llm_state"]} if "llm_state" in ev else {})}
        return out

    # ── инструменты, которым нужен сам агент ───────────────────
    async def vision(self, path: Path, question: str) -> dict:
        if path.stat().st_size > 12 * 1024 * 1024:
            return {"error": "изображение слишком большое (>12 МБ)"}
        st = models.status().get("base", {})
        if not st.get("vision"):
            return {"error": "у основной модели нет зрения"}
        mime = mimetypes.guess_type(str(path))[0] or "image/png"
        data = base64.b64encode(await asyncio.to_thread(path.read_bytes)).decode()
        msgs = [{"role": "user", "content": [{"type": "text", "text": question},
                                             {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}]}]
        if self.llm.main != "base":
            return {"error": "зрение есть только у base; сейчас загружена deep"}
        text = ""
        async for ev in self.llm.chat(msgs, None, "base", max_tokens=800):
            if ev["type"] == "delta":
                text += ev["text"]
        return {"answer": _strip_think(text)}

    async def cloud_request(self, question: str, why: str, effort: str, ctx: dict) -> dict:
        c = self.cloud.cfg()
        if not c.get("enabled") or not c.get("model"):
            return {"error": "облако выключено или модель не выбрана (Настройки → Haotica → Облако)"}
        b = self.cloud.budget()
        if b["day"] >= float(b["limit_day"]) or b["month"] >= float(b["limit_month"]):
            return {"error": "облачный бюджет исчерпан"}
        q = safety.redact(question)
        r = await self.cloud.chat(c["model"], [{"role": "user", "content": q}], effort or c.get("effort", ""),
                                  max_tokens=2000, kind="cloud", note=why)
        if not r.get("ok"):
            return {"error": r.get("error", "облако недоступно")}
        if r.get("refused"):
            return {"refused": True, "note": "облако отказалось отвечать; не переформулируй запрос, продолжай сама"}
        return {"answer": r["text"], "cost": r.get("cost")}

    # ── подсказки в терминале и разбор ошибок ──────────────────
    async def complete_shell(self, prefix: str, cwd: str) -> str:
        if len(prefix) < 3 or self.llm.paused or self.llm.state.get("fast") != "ready":
            return ""
        key = prefix
        if key in self._complete_cache:
            self._complete_cache.move_to_end(key)
            return self._complete_cache[key]
        if safety.redact(prefix) != prefix:
            return ""
        out = await self.llm.complete([
            {"role": "system", "content": persona.SHELL_COMPLETE},
            {"role": "user", "content": f"cwd: {cwd}\ninput: {prefix}"}], role="fast", max_tokens=48, timeout=0.7,
            stop=["\n"])
        out = _strip_think(out).strip().strip("`").strip()
        if not out.startswith(prefix) or out == prefix or "\n" in out:
            out = ""
        self._complete_cache[key] = out
        while len(self._complete_cache) > 500:
            self._complete_cache.popitem(last=False)
        return out

    def _may_speak_unprompted(self) -> bool:
        ha = config.get("haotica", {}) or {}
        if ha.get("proactive", "sometimes") == "never" or not ha.get("enabled", True):
            return False
        now = time.time()
        self._unprompted = [t for t in self._unprompted if now - t < 3600]
        return len(self._unprompted) < int(ha.get("max_unprompted_per_hour", 6))

    async def terminal_block(self, b: dict) -> dict:
        code = int(b.get("code") or 0)
        if code in (0, 130, 141, 148) or not str(b.get("cmd", "")).strip():
            return {"ok": True, "skipped": "код не требует разбора"}
        if self.busy or self.llm.state.get(self.llm.main) != "ready" or self.llm.main != "base":
            return {"ok": True, "skipped": "модель занята или не загружена"}
        if not self._may_speak_unprompted():
            return {"ok": True, "skipped": "лимит подсказок"}
        self._unprompted.append(time.time())
        self.bg(self._analyze_block(b))
        return {"ok": True, "queued": True}

    async def _analyze_block(self, b: dict) -> None:
        out = safety.redact(str(b.get("output", ""))[-4000:])
        prompt = (f"Команда `{safety.redact(str(b['cmd']))}` в папке {b.get('cwd', '~')} завершилась с кодом {b.get('code')}.\n"
                  f"Вывод:\n```\n{out}\n```\nОдной-двумя фразами: причина и как исправить. Если есть команда-исправление — "
                  "дай её последней строкой в блоке кода.")
        text = await self.llm.complete([
            {"role": "system", "content": persona.system_prompt(config.load(), {"source": "terminal", "cwd": b.get("cwd", "~")}, [])},
            {"role": "user", "content": prompt}], role="base", max_tokens=300, timeout=60)
        text = _strip_think(text).strip()
        if not text:
            return
        self.memory.chat("terminal", "terminal")
        self.memory.add("terminal", "assistant", text, {"proactive": True, "cmd": b.get("cmd")})
        self.hub.publish("message", {"chat": "terminal", "role": "assistant", "text": text, "final": True,
                                     "proactive": True}, keep=False)
        self.state.set("idle", text.splitlines()[0])
        m = re.findall(r"```(?:\w+)?\n(.+?)\n```", text, re.S)
        if m and "\n" not in m[-1].strip():
            cmd = m[-1].strip()
            card = self.make_card("suggest_command", {"command": cmd, "reason": "исправление ошибки"},
                                  safety.classify(cmd), "terminal", "terminal")
            self.bg(self.ask_card(card))

    # ── события ядра ───────────────────────────────────────────
    async def event(self, ev: dict) -> dict:
        name = ev.get("event", "")
        if name == "game_mode":
            await self.llm.pause(bool(ev.get("on")))
            self.state.set("sleep" if ev.get("on") else "idle")
        elif name == "battery_low":
            if self.voice:
                self.bg(self._line("battery_low"))
            self.state.set("warning", f"Батарея {ev.get('level', '?')}%")
        elif name in ("wake", "login"):
            if self.voice:
                self.bg(self._line("greeting"))
        return {"ok": True}

    async def _line(self, name: str) -> None:
        try:
            await self.voice.line(name)
        except Exception:  # noqa: BLE001
            pass

    async def reload(self) -> dict:
        await self.cloud.load_key()
        self._dl_cache = (0.0, {})
        self.state.write()
        return {"ok": True}

    def status(self) -> dict:
        try:
            mstat = models.status()
        except Exception:  # noqa: BLE001
            mstat = {}
        return {"ok": True, **self.state.snapshot(), "llm": self.llm.status(),
                "models": {r: {k: v.get(k) for k in ("label", "size", "have", "ready")} for r, v in mstat.items()},
                "cloud": {"enabled": bool(self.cloud.cfg().get("enabled")), "key": bool(self.cloud.key),
                          "budget": self.cloud.budget()},
                "voice": bool(self.voice), "cards": self.pending_cards()}


def _strip_think(text: str) -> str:
    return re.sub(r"(?s)<think>.*?</think>\s*", "", text or "").strip()
