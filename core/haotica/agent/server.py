"""HTTP-сервер Haotica: 127.0.0.1:47810, тот же токен, что у ядра (X-Haotica-Token или ?token=).

Приложения открыты с адреса ядра (127.0.0.1:47800), поэтому разрешён CORS только для него.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging

from aiohttp import web

from .. import client, models, paths, secrets
from .engine import Agent

log = logging.getLogger("haotica.agent.http")
ALLOWED_HOSTS = {f"127.0.0.1:{paths.PORT_HAOTICA}", f"localhost:{paths.PORT_HAOTICA}"}
ALLOWED_ORIGINS = {f"http://127.0.0.1:{paths.PORT_CORE}", f"http://localhost:{paths.PORT_CORE}"}
CORS_HEADERS = {"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, X-Haotica-Token", "Access-Control-Max-Age": "600"}


def _dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


def ok(data: dict | None = None, status: int = 200) -> web.Response:
    return web.json_response({"ok": True, **(data or {})}, status=status, dumps=_dumps)


def err(msg: str, status: int = 400, **kw) -> web.Response:
    return web.json_response({"ok": False, "error": msg, **kw}, status=status, dumps=_dumps)


def _cors(request: web.Request, resp: web.StreamResponse) -> None:
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers.update(CORS_HEADERS)


@web.middleware
async def guard(request: web.Request, handler):
    if request.host not in ALLOWED_HOSTS:
        return err("недопустимый Host", 403)
    origin = request.headers.get("Origin")
    if origin and origin not in ALLOWED_ORIGINS:
        return err("недопустимый Origin", 403)
    if request.method == "OPTIONS":
        resp = web.Response(status=204)
        _cors(request, resp)
        return resp
    tok = client.token()
    given = request.headers.get("X-Haotica-Token") or request.query.get("token", "")
    if not tok or not hmac.compare_digest(given.encode(), tok.encode()):
        resp = err("нет доступа", 401)
        _cors(request, resp)
        return resp
    try:
        resp = await handler(request)
    except web.HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("handler %s", request.path)
        resp = err(f"{type(e).__name__}: {e}", 500)
    if not resp.prepared:
        _cors(request, resp)
        resp.headers["Cache-Control"] = "no-store"
    return resp


async def _body(request: web.Request) -> dict:
    if not request.can_read_body:
        return {}
    try:
        d = await request.json()
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


def setup(app: web.Application) -> None:
    A = lambda r: r.app["agent"]  # noqa: E731
    R = app.router

    async def status(r):
        return ok(A(r).status())

    async def stream(r):
        return await A(r).hub.stream(r)

    async def chat(r):
        d = await _body(r)
        text = str(d.get("text", ""))
        args = (text, str(d.get("source") or "panel"), str(d.get("chat") or ""), d.get("context") or {})
        if d.get("wait", True):
            res = await A(r).ask(*args)
            return web.json_response(res, status=200, dumps=_dumps)
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
        await resp.prepare(r)
        try:
            async for ev in A(r).turn(*args):
                await resp.write(f"event: {ev['type']}\ndata: {_dumps(ev)}\n\n".encode())
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        return resp

    async def history(r):
        chat = r.query.get("chat", "panel")
        return ok({"chat": chat, "messages": A(r).memory.history(chat, int(r.query.get("n", 200))),
                   "chats": A(r).memory.chats(30), "cards": A(r).pending_cards()})

    async def clear(r):
        d = await _body(r)
        A(r).memory.clear(str(d.get("chat") or "panel"))
        return ok()

    async def card(r):
        accept = r.match_info["action"] == "accept"
        if not A(r).resolve_card(r.match_info["id"], accept):
            return err("карточка не найдена или уже решена", 404)
        return ok()

    async def event(r):
        return ok(await A(r).event(await _body(r)))

    async def reload(r):
        return ok(await A(r).reload())

    async def complete_shell(r):
        q = r.query.get("q", "")
        cwd = r.query.get("cwd", "~")
        if r.method == "POST":
            d = await _body(r)
            q, cwd = str(d.get("q", q)), str(d.get("cwd", cwd))
        try:
            s = await asyncio.wait_for(A(r).complete_shell(q, cwd), 0.9)
        except asyncio.TimeoutError:
            s = ""
        return web.Response(text=s, content_type="text/plain")

    async def terminal_block(r):
        return ok(await A(r).terminal_block(await _body(r)))

    async def memory_get(r):
        q = r.query.get("q")
        m = A(r).memory
        return ok({"facts": m.facts(500) if not q else [{"text": t} for t in m.recall(q, 20)]})

    async def memory_add(r):
        d = await _body(r)
        if not str(d.get("fact", "")).strip():
            return err("пустой факт")
        return ok({"id": A(r).memory.remember(str(d["fact"]))})

    async def memory_del(r):
        return ok({"deleted": A(r).memory.forget(int(r.match_info["id"]))})

    async def cloud_key_get(r):
        c = A(r).cloud
        if not c.key:
            await c.load_key()
        if not c.key:
            return ok({"set": False})
        info = await c.key_info() if r.query.get("check") else {}
        return ok({"set": True, "mask": secrets.mask(c.key), "info": info})

    async def cloud_key_set(r):
        d = await _body(r)
        key = str(d.get("key", "")).strip()
        if not key:
            return err("пустой ключ")
        if not await secrets.store("openrouter", key):
            return err("связка ключей недоступна (gnome-keyring / secret-tool)", 500)
        await A(r).cloud.load_key()
        return ok({"set": True, "mask": secrets.mask(key), "info": await A(r).cloud.key_info()})

    async def cloud_key_del(r):
        await secrets.clear("openrouter")
        A(r).cloud.key = ""
        return ok({"set": False})

    async def cloud_models(r):
        ms = await A(r).cloud.models(force=bool(r.query.get("force")))
        q = r.query.get("q", "").lower()
        if q:
            ms = [m for m in ms if q in m["id"].lower() or q in m["name"].lower()]
        return ok({"models": ms})

    async def cloud_ledger(r):
        return ok({"ledger": A(r).cloud.ledger(int(r.query.get("n", 200))), "budget": A(r).cloud.budget()})

    async def cloud_resolve(r):
        return ok(await A(r).cloud.resolve(r.query.get("id", "")))

    async def llm_status(r):
        return ok({**A(r).llm.status(), "models": models.status()})

    async def llm_use(r):
        d = await _body(r)
        role = str(d.get("role") or d.get("use") or "")
        if role not in models.MAIN_ROLES:
            return err("role: base или deep")
        A(r).bg(A(r).llm.use(role, 600))
        return ok({"switching": role})

    R.add_get("/api/status", status)
    R.add_get("/api/stream", stream)
    R.add_post("/api/chat", chat)
    R.add_get("/api/history", history)
    R.add_post("/api/clear", clear)
    R.add_post("/api/card/{id}/{action:accept|reject}", card)
    R.add_post("/api/event", event)
    R.add_post("/api/reload", reload)
    R.add_get("/api/complete/shell", complete_shell)
    R.add_post("/api/complete/shell", complete_shell)
    R.add_post("/api/terminal/block", terminal_block)
    R.add_get("/api/memory", memory_get)
    R.add_post("/api/memory", memory_add)
    R.add_delete("/api/memory/{id:\\d+}", memory_del)
    R.add_get("/api/cloud/key", cloud_key_get)
    R.add_post("/api/cloud/key", cloud_key_set)
    R.add_delete("/api/cloud/key", cloud_key_del)
    R.add_get("/api/cloud/models", cloud_models)
    R.add_get("/api/cloud/ledger", cloud_ledger)
    R.add_get("/api/cloud/resolve", cloud_resolve)
    R.add_get("/api/llm/status", llm_status)
    R.add_post("/api/llm/use", llm_use)
    R.add_route("OPTIONS", "/{tail:.*}", lambda r: web.Response(status=204))


async def _on_prepare(request: web.Request, response: web.StreamResponse) -> None:
    # SSE-ответ хаба готовится внутри Hub.stream — CORS-заголовки добавляем здесь
    if "Access-Control-Allow-Origin" not in response.headers:
        _cors(request, response)


def create_app(agent: Agent | None = None) -> web.Application:
    agent = agent or Agent()
    app = web.Application(middlewares=[guard], client_max_size=16 * 1024 * 1024)
    app["agent"] = agent
    setup(app)
    app.on_response_prepare.append(_on_prepare)

    async def on_startup(_app):
        await agent.start()

    async def on_cleanup(_app):
        await agent.stop()

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app
