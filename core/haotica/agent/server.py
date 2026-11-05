"""HTTP-сервер Haotica: 127.0.0.1:47810, тот же токен, что у ядра (X-Haotica-Token или ?token=).

Приложения открыты с адреса ядра (127.0.0.1:47800), поэтому разрешён CORS только для него.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import os
import logging
import shutil
import time

import aiohttp
from aiohttp import web

from .. import client, models, paths, secrets, services, util
from .engine import Agent

log = logging.getLogger("haotica.agent.http")
ALLOWED_HOSTS = {f"127.0.0.1:{paths.PORT_HAOTICA}", f"localhost:{paths.PORT_HAOTICA}"}
ALLOWED_ORIGINS = {f"http://127.0.0.1:{paths.PORT_CORE}", f"http://localhost:{paths.PORT_CORE}"}
CORS_HEADERS = {"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
        args = (text, str(d.get("source") or "panel"), str(d.get("chat") or ""), d.get("context") or {}, bool(d.get("retry")))
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
        m = A(r).memory
        if "before" in r.query or "limit" in r.query:          # порции для бесконечной прокрутки вверх
            before = int(r.query.get("before") or 0) or None
            pg = m.page(chat, before, int(r.query.get("limit", 50)))
            return ok({"chat": chat, **pg, "info": m.get_chat(chat), "cards": A(r).pending_cards() if not before else []})
        pg = m.page(chat, None, int(r.query.get("n", 200)))
        return ok({"chat": chat, "messages": pg["messages"], "more": pg["more"], "info": m.get_chat(chat),
                   "chats": m.chats(30), "cards": A(r).pending_cards()})

    async def chats_list(r):
        return ok({"chats": A(r).memory.chats(int(r.query.get("limit", 100)), r.query.get("q", ""))})

    async def chats_new(r):
        d = await _body(r)
        return ok({"chat": A(r).memory.new_chat(str(d.get("source") or "panel"), str(d.get("title") or ""))})

    async def chats_patch(r):
        d = await _body(r)
        cid = r.match_info["id"]
        if not A(r).memory.get_chat(cid):
            return err("нет такого чата", 404)
        c = A(r).memory.update_chat(cid, title=str(d["title"]).strip() if "title" in d else None,
                                    pinned=bool(d["pinned"]) if "pinned" in d else None)
        return ok({"chat": c})

    async def chats_delete(r):
        return ok({"deleted": A(r).memory.delete_chat(r.match_info["id"])})

    async def chats_search(r):
        return ok({"results": A(r).memory.search(r.query.get("q", ""), int(r.query.get("limit", 40)))})

    async def chats_export(r):
        fmt = r.query.get("format", "md")
        cid = r.match_info["id"]
        text = A(r).memory.export(cid, "json" if fmt == "json" else "md")
        c = A(r).memory.get_chat(cid) or {}
        name = "".join(ch for ch in (c.get("title") or cid) if ch.isalnum() or ch in " -_")[:50].strip() or cid
        return web.Response(text=text, content_type="application/json" if fmt == "json" else "text/markdown",
                            charset="utf-8", headers={"Content-Disposition":
                                                      f"attachment; filename*=UTF-8''{__import__('urllib.parse').parse.quote(name)}.{'json' if fmt == 'json' else 'md'}"})

    async def stop(r):
        d = await _body(r)
        return ok(A(r).stop_turn(str(d.get("chat") or "")))

    async def terminal_result(r):
        d = await _body(r)
        if not A(r).terminal_result(d):
            return err("команда не найдена или уже завершена", 404)
        return ok()

    async def clear(r):
        d = await _body(r)
        A(r).memory.clear(str(d.get("chat") or "panel"))
        return ok()

    async def card(r):
        act = r.match_info["action"]
        accept = "plan" if act == "plan" else act == "accept"
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
    R.add_post("/api/card/{id}/{action:accept|reject|plan}", card)
    R.add_get("/api/chats", chats_list)
    R.add_post("/api/chats", chats_new)
    R.add_get("/api/chats/search", chats_search)
    R.add_route("PATCH", "/api/chats/{id}", chats_patch)
    R.add_delete("/api/chats/{id}", chats_delete)
    R.add_get("/api/chats/{id}/export", chats_export)
    R.add_post("/api/stop", stop)
    R.add_post("/api/terminal/result", terminal_result)
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
    async def models_get(r):
        return ok({"models": models.status(), "engine": str(models.llama_server() or ""),
                   "verify": r.app.get("verify", {})})

    async def models_download(r):
        d = await _body(r)
        roles = [x for x in (d.get("roles") or [d.get("role")]) if x in models.CATALOG]
        if os.name == "nt" or services.supervised():      # Windows: загрузка — фоновый процесс под супервизором
            from .. import supervisor
            name = "models-" + ("-".join(roles) or "all")
            sup = supervisor.get()
            sup.add(name, [*supervisor.python_argv("haotica.cli"), "models", "download", *roles], restart=False)
            sup.start(name)
            if os.name == "nt" and not models.llama_server():
                sup.add("llama-install", [*supervisor.python_argv("haotica.cli"), "llama", "install", "vulkan"], restart=False)
                sup.start("llama-install")
            return ok({"started": roles or "all"})
        if not roles:
            rc, _, _e = await util.arun(["systemctl", "--user", "start", "--no-block", "haotica-models.service"], 15)
            if rc == 0:
                return ok({"started": "all"})
        cmd = ["haotica", "models", "download", *roles]
        if shutil.which("systemd-run"):
            cmd = ["systemd-run", "--user", "--collect", f"--unit=haotica-models-{'-'.join(roles) or 'all'}",
                   "-p", "Nice=10", *cmd]
        rc, _, e = await util.arun(cmd, 15)
        if rc != 0 and "already" not in e and "loaded" not in e:
            util.spawn(["haotica", "models", "download", *roles])
        return ok({"started": roles or "all"})

    async def models_verify(r):
        async def run():
            r.app["verify"] = {"running": True}
            from .. import supervisor
            rc, out, e = await util.arun([*supervisor.python_argv("haotica.cli"), "models", "verify"], 7200)
            r.app["verify"] = {"running": False, "ok": rc == 0, "output": (out or e)[-2000:], "ts": int(time.time())}
        A(r).bg(run())
        return ok({"running": True})

    R.add_get("/api/models", models_get)
    R.add_post("/api/models/download", models_download)
    R.add_post("/api/models/verify", models_verify)
    async def voice_test(r):
        d = await _body(r)
        a = A(r)
        engine = ""
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2)) as sess, \
                    sess.get(f"http://{paths.HOST}:{paths.PORT_TTS}/health") as h:
                engine = (await h.json(content_type=None)).get("engine", "")
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
            pass
        if not a.voice:
            return err("голос недоступен")
        text = str(d.get("text") or "Привет. Это мой голос. Если звучит странно — это не я, это колонки.")
        played = await a.voice.say(text[:300])
        return ok({"played": played, "engine": engine or ("elevenlabs" if played else "")})

    R.add_post("/api/voice/test", voice_test)

    async def voice_restart(r):
        from .. import services
        await services.stop("tts")
        started, e = await services.start("tts")
        return ok({"started": started}) if started else err(e or "служба голоса не установлена")
    R.add_post("/api/voice/restart", voice_restart)

    async def voice_stop(r):
        if A(r).voice:
            await A(r).voice.stop()
        return ok()
    R.add_post("/api/voice/stop", voice_stop)
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
        if os.name == "nt":                     # начатые загрузки моделей продолжаются сами после перезапуска
            try:
                left = models.unfinished()
                if left:
                    from .. import supervisor
                    sup = supervisor.get()
                    for role in left:
                        sup.add(f"models-{role}", [*supervisor.python_argv("haotica.cli"), "models", "download", role],
                                restart=False)
                        sup.start(f"models-{role}")
                    log.info("продолжаю загрузку моделей: %s", ", ".join(left))
            except Exception:  # noqa: BLE001
                log.exception("докачка моделей")

    async def on_cleanup(_app):
        await agent.stop()

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app
