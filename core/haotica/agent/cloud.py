"""Облачный канал OpenRouter: «второе мнение» с разрешения владельца и помощники для публичного поиска.

- Ключ — только в связке ключей; в логах, конфигах и контексте моделей его нет.
- Каждый запрос пишется в журнал: время, модель, effort, токены, стоимость, что отправлено.
- Бюджеты: на запрос, день и месяц; для помощников — свои лимиты и не больше N запросов в час.
- Помощникам уходит только бриф без личных данных (safety.brief_check) и фрагменты публичных страниц.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time

import aiohttp

from .. import config, paths, secrets, util
from . import safety
from .search import Search

log = logging.getLogger("haotica.cloud")
API = "https://openrouter.ai/api/v1"
MODELS_CACHE = paths.STATE_DIR / "openrouter-models.json"
LEDGER = paths.STATE_DIR / "cloud-ledger.jsonl"
HEADERS = {"HTTP-Referer": "https://haotica.local", "X-Title": "HAOTICA"}


def _day() -> str:
    return time.strftime("%Y-%m-%d")


class Cloud:
    def __init__(self, hub) -> None:
        self.hub = hub
        self.search = Search()
        self.assist_active = 0
        self.key = ""

    async def load_key(self) -> str:
        """Ключ из хранилища (Credential Manager); если там пусто — из переменной окружения OPENROUTER_API_KEY
        (в том числе заданной для пользователя позже запуска), и тогда он переносится в хранилище."""
        self.key = await secrets.get("openrouter")
        if not self.key:
            env = secrets.env_key("OPENROUTER_API_KEY", "OPENROUTER_KEY", "OPEN_ROUTER_API_KEY")
            if env:
                self.key = env
                if await secrets.store("openrouter", env):
                    log.info("ключ OpenRouter взят из переменной окружения и сохранён в хранилище")
        return self.key

    def available(self) -> bool:
        """Облако можно использовать: есть ключ и модель (выключатель cloud.enabled — явный запрет владельца)."""
        c = self.cfg()
        return bool(self.key) and c.get("enabled", True) is not False and bool(c.get("model") or c.get("helper_fast"))

    def cfg(self) -> dict:
        return config.get("cloud", {}) or {}

    async def _req(self, method: str, path: str, body: dict | None = None, timeout: float = 60) -> tuple[int, dict]:
        if not self.key:
            await self.load_key()
        if not self.key:
            return 401, {"error": "нет ключа OpenRouter (Cloud Link → ключ)"}
        hdr = {"Authorization": f"Bearer {self.key}", **HEADERS}
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as s:
                async with s.request(method, API + path, json=body, headers=hdr) as r:
                    try:
                        data = await r.json(content_type=None)
                    except ValueError:
                        data = {"error": (await r.text())[:300]}
                    return r.status, data
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            return 0, {"error": f"нет связи с OpenRouter: {type(e).__name__}"}

    # ── ключ, баланс, модели ───────────────────────────────────
    async def key_info(self) -> dict:
        st, d = await self._req("GET", "/key", timeout=15)
        if st != 200:
            return {"ok": False, "status": st, "error": (d.get("error") if isinstance(d.get("error"), str) else
                                                         (d.get("error") or {}).get("message", "ключ не принят"))}
        info = d.get("data", {})
        st2, c = await self._req("GET", "/credits", timeout=15)
        credits = c.get("data", {}) if st2 == 200 else {}
        return {"ok": True, "label": info.get("label", ""), "limit": info.get("limit"), "usage": info.get("usage"),
                "limit_remaining": info.get("limit_remaining"), "free_tier": info.get("is_free_tier"),
                "credits": credits.get("total_credits"), "spent": credits.get("total_usage")}

    async def models(self, force: bool = False) -> list[dict]:
        cache = util.load_json(MODELS_CACHE, None)
        if cache and not force and time.time() - cache.get("ts", 0) < 86400:
            return cache["models"]
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as s:
                async with s.get(API + "/models") as r:
                    d = await r.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
            return cache["models"] if cache else []
        out = []
        for m in d.get("data", []):
            pr = m.get("pricing", {})
            sp = set(m.get("supported_parameters") or [])
            arch = m.get("architecture", {})
            mid = m.get("id", "")
            efforts = []
            if "reasoning" in sp or "include_reasoning" in sp:
                efforts = ["low", "medium", "high"]
                if mid.startswith(("openai/gpt-5", "openai/o")):
                    efforts = ["minimal", *efforts]
            out.append({
                "id": mid, "name": m.get("name", mid), "context": m.get("context_length", 0),
                "in": float(pr.get("prompt") or 0) * 1e6, "out": float(pr.get("completion") or 0) * 1e6,
                "reasoning": bool(efforts), "efforts": efforts, "tools": "tools" in sp,
                "vision": "image" in (arch.get("input_modalities") or []), "created": m.get("created", 0),
            })
        out.sort(key=lambda x: x["id"])
        util.write_json(MODELS_CACHE, {"ts": time.time(), "models": out})
        return out

    async def resolve(self, wanted: str) -> dict:
        """Найти модель по id; если её нет — предложить ближайшую по семейству."""
        ms = await self.models()
        exact = next((m for m in ms if m["id"] == wanted), None)
        if exact:
            return {"ok": True, "model": exact}
        fam = re.sub(r"[-_.]?\d+(\.\d+)*", "", wanted.split("/")[-1]).lower()
        cands = [m for m in ms if m["id"].split("/")[0] == wanted.split("/")[0] and fam.split("-")[0] in m["id"].lower()]
        cands.sort(key=lambda m: m.get("created", 0), reverse=True)
        return {"ok": False, "wanted": wanted, "suggest": [c["id"] for c in cands[:5]]}

    # ── журнал и бюджеты ───────────────────────────────────────
    def ledger(self, limit: int = 200) -> list[dict]:
        if not LEDGER.exists():
            return []
        lines = LEDGER.read_text(encoding="utf-8").splitlines()[-limit:]
        return [json.loads(x) for x in lines if x.strip()][::-1]

    def _write(self, entry: dict) -> None:
        LEDGER.parent.mkdir(parents=True, exist_ok=True)
        with open(LEDGER, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        LEDGER.chmod(0o600)

    def spent(self, kind: str | None = None, period: str = "day") -> float:
        key = _day() if period == "day" else time.strftime("%Y-%m")
        total = 0.0
        for e in self.ledger(5000):
            if (period == "day" and e.get("day") == key) or (period == "month" and e.get("day", "").startswith(key)):
                if kind is None or e.get("kind") == kind:
                    total += float(e.get("cost") or 0)
        return round(total, 6)

    def helper_calls_last_hour(self) -> int:
        cutoff = time.time() - 3600
        return sum(1 for e in self.ledger(500) if e.get("kind") == "helper" and e.get("ts", 0) > cutoff)

    def budget(self) -> dict:
        c = self.cfg()
        return {"day": self.spent("cloud"), "month": self.spent("cloud", "month"), "helpers_day": self.spent("helper"),
                "limit_day": c.get("budget_day_usd", 2.0), "limit_month": c.get("budget_month_usd", 20.0),
                "limit_request": c.get("budget_request_usd", 0.5), "helpers_limit_day": c.get("helpers_day_usd", 1.0),
                "helpers_per_hour": c.get("helpers_per_hour", 30), "helpers_used_hour": self.helper_calls_last_hour()}

    def estimate(self, model: dict, messages: list[dict], max_out: int = 1500) -> dict:
        chars = sum(len(json.dumps(m.get("content", ""), ensure_ascii=False)) for m in messages)
        tin = chars // 3
        cost = tin * model.get("in", 0) / 1e6 + max_out * model.get("out", 0) / 1e6
        return {"tokens_in": tin, "tokens_out_max": max_out, "cost_max": round(cost, 5)}

    # ── запросы ────────────────────────────────────────────────
    async def chat(self, model: str, messages: list[dict], effort: str = "", max_tokens: int = 2000,
                   kind: str = "cloud", note: str = "", extra: dict | None = None) -> dict:
        body: dict = {"model": model, "messages": messages, "max_tokens": max_tokens, "usage": {"include": True},
                      **(extra or {})}
        if effort and effort != "off":
            body["reasoning"] = {"effort": effort} if not effort.isdigit() else {"max_tokens": int(effort)}
        t0 = time.time()
        st, d = await self._req("POST", "/chat/completions", body, timeout=180)
        usage = d.get("usage") or {}
        text, notes = "", []
        if st == 200:
            msg = (d.get("choices") or [{}])[0].get("message") or {}
            text = msg.get("content") or ""
            notes = [a.get("url_citation", {}) for a in (msg.get("annotations") or []) if a.get("type") == "url_citation"]
        cost = float(usage.get("cost") or 0)
        sent = json.dumps(messages, ensure_ascii=False)
        self._write({"ts": int(t0), "day": _day(), "kind": kind, "model": model, "effort": effort, "status": st,
                     "tokens_in": usage.get("prompt_tokens"), "tokens_out": usage.get("completion_tokens"),
                     "cost": cost, "ms": int((time.time() - t0) * 1000), "note": note[:120],
                     "sent": sent[:20000], "reply": text[:4000]})
        self.hub.publish("cloud", {"budget": self.budget(), "last": {"model": model, "cost": cost, "kind": kind}}, keep=True)
        if st != 200:
            err = d.get("error")
            return {"ok": False, "status": st, "error": err.get("message") if isinstance(err, dict) else str(err)}
        return {"ok": True, "text": text, "cost": cost, "usage": usage, "refused": safety.looks_like_refusal(text),
                "citations": [{"title": c.get("title", ""), "url": c.get("url", "")} for c in notes if c.get("url")]}

    async def web_answer(self, clean: str, careful: bool) -> dict:
        """Поиск без SearXNG (Windows): модель OpenRouter со встроенным веб-поиском (plugins: web). Уходит только
        обезличенный бриф; ответ — с источниками."""
        c = self.cfg()
        model = (c.get("helper_careful") if careful else c.get("helper_fast")) or c.get("model", "")
        a = await self.chat(model, [
            {"role": "system", "content": "Search the web and answer the task. Reply as JSON: "
             '{"answer": str, "facts": [{"claim": str, "url": str}], "confidence": 0..1, "gaps": str}. '
             "Answer in the language of the task."},
            {"role": "user", "content": clean}], max_tokens=900, kind="helper", note="web",
            extra={"plugins": [{"id": "web", "max_results": 5}]})
        if not a.get("ok"):
            return {"ok": False, "error": a.get("error", "помощник недоступен")}
        if a.get("refused"):
            return {"ok": False, "refused": True, "error": "помощник отказался отвечать — продолжаю локально"}
        try:
            parsed = json.loads(re.search(r"\{.*\}", a["text"], re.S).group(0))
        except (AttributeError, ValueError):
            parsed = {"answer": a["text"], "facts": [], "confidence": 0.5}
        return {"ok": True, "answer": parsed.get("answer", ""), "facts": parsed.get("facts", []),
                "confidence": parsed.get("confidence"), "gaps": parsed.get("gaps", ""),
                "sources": a.get("citations", []), "models": [model], "cost": a.get("cost", 0)}

    # ── помощники: поиск и разбор публичной информации без разрешения ──
    async def assist(self, brief: str, careful: bool = False, max_pages: int = 5) -> dict:
        c = self.cfg()
        if not c.get("helpers_enabled", True):
            return {"ok": False, "error": "автоматические помощники выключены (Cloud Link)"}
        if self.helper_calls_last_hour() >= int(c.get("helpers_per_hour", 30)):
            return {"ok": False, "error": "лимит запросов помощников в час исчерпан"}
        if self.spent("helper") >= float(c.get("helpers_day_usd", 1.0)):
            return {"ok": False, "error": "дневной бюджет помощников исчерпан"}
        clean, removed = safety.brief_check(brief)
        fast, careful_model = c.get("helper_fast", ""), c.get("helper_careful", "")
        task_budget = float(c.get("helpers_task_usd", 0.05))
        spent_task = 0.0
        self.assist_active += 1
        self.hub.publish("assist", {"active": self.assist_active, "budget": self.budget()})
        try:
            # без локального SearXNG (Windows) или по настройке — поиск силами OpenRouter
            if c.get("search_backend") == "openrouter" or not await self.search.available():
                res = await self.web_answer(clean, careful)
                return {**res, "removed": removed} if res.get("ok") else res
            # 1) запросы для поиска — быстрая модель
            q = await self.chat(fast, [
                {"role": "system", "content": "Return 2-4 web search queries for the task as a JSON array of strings. No prose."},
                {"role": "user", "content": clean}], max_tokens=200, kind="helper", note="queries")
            if not q.get("ok"):
                return {"ok": False, "error": q.get("error", "помощник недоступен")}
            spent_task += q.get("cost", 0)
            try:
                queries = json.loads(re.search(r"\[.*\]", q["text"], re.S).group(0))[:4]
            except (AttributeError, ValueError):
                queries = [clean[:200]]
            # 2) поиск и загрузка страниц — локально
            results: list[dict] = []
            for qq in queries:
                results += await self.search.searx(str(qq), n=5)
            seen, top = set(), []
            for r in results:
                if r["url"] not in seen:
                    seen.add(r["url"])
                    top.append(r)
            pages = await asyncio.gather(*(self.search.fetch(r["url"], 5000) for r in top[:max_pages]))
            sources = [p for p in pages if p.get("text")]
            if not sources:
                return {"ok": False, "error": "поиск ничего не дал (SearXNG запущен?)", "queries": queries}
            # 3) разбор — аккуратная модель (или быстрая для массового поиска)
            model = careful_model if careful else fast
            ctx = "\n\n".join(f"[{i + 1}] {s['title']} — {s['url']}\n{s['text']}" for i, s in enumerate(sources))
            if spent_task >= task_budget:
                return {"ok": False, "error": "бюджет задачи исчерпан"}
            a = await self.chat(model, [
                {"role": "system", "content": "Answer the task using ONLY the numbered sources. Reply as JSON: "
                 '{"answer": str, "facts": [{"claim": str, "source": int}], "confidence": 0..1, "gaps": str}.'},
                {"role": "user", "content": f"TASK: {clean}\n\nSOURCES:\n{ctx[:24000]}"}], max_tokens=900, kind="helper",
                note="analysis")
            if not a.get("ok"):
                return {"ok": False, "error": a.get("error")}
            if a.get("refused"):
                return {"ok": False, "refused": True, "error": "помощник отказался отвечать — продолжаю локально"}
            try:
                parsed = json.loads(re.search(r"\{.*\}", a["text"], re.S).group(0))
            except (AttributeError, ValueError):
                parsed = {"answer": a["text"], "facts": [], "confidence": 0.5}
            for f in parsed.get("facts", []):
                i = int(f.get("source", 0) or 0) - 1
                f["url"] = sources[i]["url"] if 0 <= i < len(sources) else ""
            alive = await asyncio.gather(*(self.search.exists(s["url"]) for s in sources))
            return {"ok": True, "answer": parsed.get("answer", ""), "facts": parsed.get("facts", []),
                    "confidence": parsed.get("confidence"), "gaps": parsed.get("gaps", ""),
                    "sources": [{"title": s["title"], "url": s["url"], "alive": ok} for s, ok in zip(sources, alive, strict=False)],
                    "removed": removed, "models": [fast, model], "cost": round(spent_task + a.get("cost", 0), 5)}
        finally:
            self.assist_active -= 1
            self.hub.publish("assist", {"active": self.assist_active, "budget": self.budget()})

