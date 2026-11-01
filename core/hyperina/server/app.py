"""HTTP-сервер ядра: 127.0.0.1:47800.

Доступ к /api/* — только с токеном (заголовок X-Hyperina-Token или ?token=): токен лежит
в ~/.local/state/hyperina/token (0600), его видят только программы пользователя.
Проверка заголовка Host защищает от DNS-rebinding из браузера.
Без токена открыты только стартовая страница Chrome (/newtab) и её публичные данные.
"""
from __future__ import annotations

import hmac
import logging
import mimetypes
from pathlib import Path

from aiohttp import web

from .. import paths

log = logging.getLogger("hyperina.http")
ALLOWED_HOSTS = {f"127.0.0.1:{paths.PORT_CORE}", f"localhost:{paths.PORT_CORE}"}
PUBLIC_PREFIXES = ("/newtab", "/api/public/", "/ui/", "/favicon.ico")

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")


def json_ok(data=None, status: int = 200) -> web.Response:
    return web.json_response({"ok": True, **(data or {})} if isinstance(data, dict) or data is None else data,
                             status=status, dumps=_dumps)


def json_err(msg: str, status: int = 400, **kw) -> web.Response:
    return web.json_response({"ok": False, "error": msg, **kw}, status=status, dumps=_dumps)


def _dumps(obj) -> str:
    import json
    return json.dumps(obj, ensure_ascii=False, default=str)


@web.middleware
async def guard(request: web.Request, handler):
    if request.host not in ALLOWED_HOSTS:
        return json_err("недопустимый Host", 403)
    path = request.path
    if path.startswith("/api/") and not path.startswith(PUBLIC_PREFIXES):
        token = request.headers.get("X-Hyperina-Token") or request.query.get("token", "")
        if not hmac.compare_digest(token.encode(), request.app["core"].token.encode()):
            return json_err("нет доступа", 401)
    try:
        resp = await handler(request)
    except web.HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("handler %s", path)
        return json_err(f"{type(e).__name__}: {e}", 500)
    if path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def _static(prefix: str, root: Path):
    """Статика без листинга каталогов, с защитой от выхода за корень."""
    async def handler(request: web.Request) -> web.StreamResponse:
        rel = request.match_info.get("path", "") or "index.html"
        f = (root / rel).resolve()
        if not str(f).startswith(str(root.resolve())) or not f.is_file():
            if (root / rel / "index.html").is_file():
                f = (root / rel / "index.html").resolve()
            else:
                raise web.HTTPNotFound()
        resp = web.FileResponse(f)
        resp.headers["Cache-Control"] = "no-cache"
        return resp
    return handler


def create_app(core) -> web.Application:
    from . import routes_core, routes_fs, routes_misc, routes_sys
    app = web.Application(middlewares=[guard], client_max_size=64 * 1024 * 1024)
    app["core"] = core
    routes_core.setup(app)
    routes_fs.setup(app)
    routes_sys.setup(app)
    routes_misc.setup(app)
    apps_root = paths.APPS_DIR
    app.router.add_get("/ui/{path:.*}", _static("/ui", apps_root / "_ui"))
    app.router.add_get("/apps/{path:.*}", _static("/apps", apps_root))
    app.router.add_get("/newtab", _static("/newtab", apps_root / "newtab"))
    app.router.add_get("/newtab/{path:.*}", _static("/newtab", apps_root / "newtab"))

    async def on_startup(_app: web.Application) -> None:
        await core.start()

    async def on_cleanup(_app: web.Application) -> None:
        await core.stop()

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app
