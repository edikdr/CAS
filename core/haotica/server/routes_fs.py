"""Файлы: список, превью, миниатюры, теги (xattr), поиск, корзина, чтение и запись.

Общий API для «Файлов», файловой панели терминала, «Редактора» и «Галереи».
"""
from __future__ import annotations

import asyncio
import hashlib
import html
import mimetypes
import os
import shutil
import stat
import urllib.parse
from pathlib import Path

from aiohttp import web

from .. import paths, util
from .app import json_err, json_ok

THUMBS = paths.CACHE_DIR / "thumbs"
TAGS_FILE = paths.CONFIG_DIR / "tags.json"
TAG_INDEX = paths.STATE_DIR / "tags-index.json"
XATTR = "user.haotica.tags"
TEXT_LIMIT = 256 * 1024
READ_LIMIT = 8 * 1024 * 1024

CATEGORIES = {
    "code": {"py", "js", "ts", "tsx", "jsx", "rs", "go", "c", "h", "cpp", "hpp", "cs", "java", "kt", "rb", "php",
             "sh", "bash", "zsh", "fish", "lua", "qml", "sql", "swift", "dart", "zig", "nim", "vue", "svelte",
             "css", "scss", "html", "htm", "xml", "toml", "yaml", "yml", "ini", "conf", "cfg", "json", "jsonc",
             "mk", "cmake", "dockerfile", "nix", "gradle"},
    "doc": {"md", "txt", "pdf", "doc", "docx", "odt", "rtf", "epub", "tex", "org", "rst", "pptx", "odp", "xlsx",
            "ods", "csv", "djvu"},
    "image": {"png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg", "tif", "tiff", "heic", "ico", "psd", "kra",
              "xcf", "jxl"},
    "video": {"mp4", "mkv", "webm", "mov", "avi", "m4v", "flv", "wmv", "ts"},
    "audio": {"mp3", "flac", "ogg", "opus", "wav", "m4a", "aac", "wma", "aiff"},
    "archive": {"zip", "tar", "gz", "tgz", "xz", "zst", "bz2", "7z", "rar", "iso", "deb", "rpm", "pkg", "apk",
                "appimage"},
    "model": {"gguf", "safetensors", "onnx", "pt", "pth", "ckpt", "bin"},
    "font": {"ttf", "otf", "woff", "woff2"},
}
EXT_CAT = {e: c for c, exts in CATEGORIES.items() for e in exts}
TEXT_EXT = CATEGORIES["code"] | {"md", "txt", "csv", "log", "tex", "org", "rst", "env", "gitignore", "service",
                                 "desktop", "rules", "patch", "diff"}


def resolve(p: str) -> Path:
    p = (p or "~").strip()
    if p.startswith("file://"):
        p = urllib.parse.unquote(p[7:])
    return Path(os.path.expanduser(p)).resolve()


def category(path: Path, is_dir: bool = False) -> str:
    if is_dir:
        return "dir"
    name = path.name.lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else name
    if name in ("makefile", "dockerfile", "pkgbuild", "cmakelists.txt", "justfile"):
        return "code"
    return EXT_CAT.get(ext, "other")


def get_tags(path: Path) -> list[str]:
    try:
        raw = os.getxattr(path, XATTR, follow_symlinks=False).decode()
        return [t for t in raw.split(",") if t]
    except OSError:
        return []


def set_tags(path: Path, tags: list[str]) -> None:
    clean = sorted({t.strip()[:24] for t in tags if t.strip()})
    if clean:
        os.setxattr(path, XATTR, ",".join(clean).encode(), follow_symlinks=False)
    else:
        try:
            os.removexattr(path, XATTR, follow_symlinks=False)
        except OSError:
            pass
    idx = util.load_json(TAG_INDEX, {}) or {}
    sp = str(path)
    for t in list(idx):
        idx[t] = [x for x in idx[t] if x != sp]
        if not idx[t]:
            del idx[t]
    for t in clean:
        idx.setdefault(t, []).append(sp)
    util.write_json(TAG_INDEX, idx)


def entry(p: Path, st: os.stat_result | None = None) -> dict:
    try:
        st = st or p.lstat()
    except OSError:
        return {"name": p.name, "path": str(p), "type": "missing"}
    is_link = stat.S_ISLNK(st.st_mode)
    is_dir = p.is_dir()
    mime = "inode/directory" if is_dir else (mimetypes.guess_type(p.name)[0] or "")
    return {
        "name": p.name or str(p), "path": str(p), "type": "dir" if is_dir else ("link" if is_link else "file"),
        "size": st.st_size if not is_dir else 0, "mtime": int(st.st_mtime), "mode": stat.filemode(st.st_mode),
        "mime": mime, "category": category(p, is_dir), "hidden": p.name.startswith("."),
        "tags": get_tags(p), "link": is_link, "exec": bool(st.st_mode & 0o111) and not is_dir,
    }


def _highlight(text: str, filename: str) -> tuple[str, str]:
    try:
        from pygments import highlight
        from pygments.formatters import HtmlFormatter
        from pygments.lexers import TextLexer, guess_lexer_for_filename
        try:
            lexer = guess_lexer_for_filename(filename, text[:4000])
        except Exception:  # noqa: BLE001 — неизвестный тип: без подсветки
            lexer = TextLexer()
        fmt = HtmlFormatter(nowrap=False, classprefix="hl-", linenos="table", lineanchors="L", anchorlinenos=True)
        return highlight(text, lexer, fmt), lexer.name
    except ImportError:
        return f"<pre>{html.escape(text)}</pre>", "text"


async def thumbnail(p: Path, size: int = 256, page: int = 1) -> Path | None:
    st = p.stat()
    key = hashlib.sha1(f"{p}:{st.st_mtime_ns}:{size}:{page}".encode()).hexdigest()
    out = THUMBS / f"{key}.png"
    if out.exists():
        return out
    THUMBS.mkdir(parents=True, exist_ok=True)
    cat = category(p)
    if cat == "image" and p.suffix.lower() != ".svg":
        def make() -> bool:
            from PIL import Image, ImageOps
            try:
                with Image.open(p) as im:
                    im = ImageOps.exif_transpose(im)
                    im.thumbnail((size, size))
                    im.save(out, "PNG")
                return True
            except OSError:
                return False
        return out if await asyncio.to_thread(make) else None
    if cat == "video" and util.which("ffmpegthumbnailer"):
        rc, _, _ = await util.arun(["ffmpegthumbnailer", "-i", str(p), "-o", str(out), "-s", str(size), "-t", "15%"], 20)
        return out if rc == 0 and out.exists() else None
    if p.suffix.lower() == ".pdf" and util.which("pdftoppm"):
        base = out.with_suffix("")
        rc, _, _ = await util.arun(["pdftoppm", "-png", "-singlefile", "-f", str(page), "-l", str(page),
                                    "-scale-to", str(size), str(p), str(base)], 20)
        return out if rc == 0 and out.exists() else None
    return None


async def preview(p: Path) -> dict:
    if p.is_dir():
        try:
            items = list(os.scandir(p))
        except OSError as e:
            return {"kind": "error", "error": str(e)}
        cats: dict[str, int] = {}
        for it in items:
            c = category(Path(it.name), it.is_dir())
            cats[c] = cats.get(c, 0) + 1
        return {"kind": "dir", "count": len(items), "categories": cats}
    st = p.stat()
    cat = category(p)
    ext = p.suffix.lower().lstrip(".")
    base = {"size": st.st_size, "mtime": int(st.st_mtime), "category": cat, "name": p.name}
    if cat == "image":
        info: dict = {}
        if ext != "svg":
            def dims() -> dict:
                from PIL import Image
                try:
                    with Image.open(p) as im:
                        return {"width": im.width, "height": im.height, "format": im.format}
                except OSError:
                    return {}
            info = await asyncio.to_thread(dims)
        return {**base, "kind": "image", **info}
    if ext == "pdf":
        rc, out, _ = await util.arun(["pdfinfo", str(p)], 10)
        meta = dict(ln.split(":", 1) for ln in out.splitlines() if ":" in ln) if rc == 0 else {}
        return {**base, "kind": "pdf", "pages": int((meta.get("Pages") or "0").strip() or 0),
                "title": (meta.get("Title") or "").strip()}
    if cat in ("video", "audio"):
        rc, out, _ = await util.arun(["mediainfo", "--Output=JSON", str(p)], 15)
        tracks = []
        if rc == 0:
            import json as _json
            try:
                for t in _json.loads(out).get("media", {}).get("track", []):
                    tracks.append({k: t.get(k) for k in ("@type", "Format", "Duration", "Width", "Height",
                                                          "FrameRate", "BitRate", "Channels", "SamplingRate", "Title",
                                                          "Performer", "Album") if t.get(k)})
            except ValueError:
                pass
        return {**base, "kind": cat, "tracks": tracks}
    if cat == "archive" and util.which("bsdtar"):
        rc, out, _ = await util.arun(["bsdtar", "-tvf", str(p)], 20)
        lines = out.splitlines()
        return {**base, "kind": "archive", "entries": lines[:400], "total": len(lines)}
    if cat == "model":
        return {**base, "kind": "model"}
    # текст?
    try:
        with open(p, "rb") as f:
            raw = f.read(TEXT_LIMIT)
    except OSError as e:
        return {**base, "kind": "error", "error": str(e)}
    if b"\x00" in raw[:8192] and ext not in TEXT_EXT:
        return {**base, "kind": "binary", "hex": raw[:512].hex(" ", 1)}
    text = raw.decode("utf-8", "replace")
    truncated = st.st_size > TEXT_LIMIT
    if ext == "md":
        try:
            import markdown
            body = markdown.markdown(text, extensions=["fenced_code", "tables", "toc", "sane_lists"])
        except ImportError:
            body = f"<pre>{html.escape(text)}</pre>"
        return {**base, "kind": "markdown", "html": body, "truncated": truncated}
    hl, lang = await asyncio.to_thread(_highlight, text, p.name)
    return {**base, "kind": "code" if cat == "code" else "text", "html": hl, "language": lang,
            "lines": text.count("\n") + 1, "truncated": truncated}


def xdg_places() -> list[dict]:
    home = paths.HOME
    dirs = {}
    cfg = home / ".config/user-dirs.dirs"
    if cfg.exists():
        for ln in cfg.read_text().splitlines():
            if ln.startswith("XDG_") and "=" in ln:
                k, v = ln.split("=", 1)
                dirs[k[4:-4].lower()] = Path(v.strip('"').replace("$HOME", str(home)))
    order = [("home", home, "home")] + [(k, v, f"folder-{k}") for k, v in dirs.items() if v.exists() and v != home]
    places = [{"name": n, "path": str(p), "icon": i, "kind": "place"} for n, p, i in order]
    bm = home / ".config/gtk-3.0/bookmarks"
    if bm.exists():
        for ln in bm.read_text().splitlines():
            uri, _, label = ln.partition(" ")
            if uri.startswith("file://"):
                pth = resolve(uri)
                places.append({"name": label or pth.name, "path": str(pth), "icon": "folder", "kind": "bookmark"})
    try:
        import psutil
        for part in psutil.disk_partitions(all=False):
            if part.mountpoint.startswith(("/run/media", "/media", "/mnt")) or part.mountpoint == "/":
                u = psutil.disk_usage(part.mountpoint)
                places.append({"name": "Система" if part.mountpoint == "/" else Path(part.mountpoint).name,
                               "path": part.mountpoint, "icon": "disk", "kind": "drive",
                               "used": u.used, "total": u.total, "fs": part.fstype})
    except (ImportError, OSError):
        pass
    places.append({"name": "Корзина", "path": "trash://", "icon": "trash", "kind": "trash"})
    return places


def trash_list() -> list[dict]:
    base = paths.XDG_DATA / "Trash"
    out = []
    for info in sorted((base / "info").glob("*.trashinfo"), key=lambda f: f.stat().st_mtime, reverse=True):
        meta = dict(ln.split("=", 1) for ln in info.read_text(errors="ignore").splitlines() if "=" in ln)
        f = base / "files" / info.stem
        out.append({"name": info.stem, "path": str(f), "original": urllib.parse.unquote(meta.get("Path", "")),
                    "deleted": meta.get("DeletionDate", ""), **({"size": f.stat().st_size} if f.is_file() else {})})
    return out


def setup(app: web.Application) -> None:
    r = app.router
    core = app["core"]

    async def body(req) -> dict:
        try:
            b = await req.json()
            return b if isinstance(b, dict) else {}
        except ValueError:
            return {}

    async def ls(req):
        if req.query.get("path", "").startswith("trash:"):
            return json_ok({"path": "trash://", "entries": trash_list()})
        p = resolve(req.query.get("path", "~"))
        if not p.is_dir():
            return json_err("это не папка", 404)
        show_hidden = req.query.get("hidden") == "1"
        try:
            items = [entry(Path(e.path)) for e in os.scandir(p) if show_hidden or not e.name.startswith(".")]
        except PermissionError:
            return json_err("нет доступа", 403)
        key = req.query.get("sort", "name")
        rev = req.query.get("desc") == "1"
        if key == "mtime":
            items.sort(key=lambda e: e.get("mtime", 0), reverse=not rev)
        elif key == "size":
            items.sort(key=lambda e: e.get("size", 0), reverse=not rev)
        else:
            items.sort(key=lambda e: (e.get("type") != "dir", e["name"].lower()), reverse=rev)
        parent = str(p.parent) if p != p.parent else ""
        return json_ok({"path": str(p), "parent": parent, "entries": items})

    async def fstat(req):
        p = resolve(req.query.get("path", ""))
        if not p.exists():
            return json_err("не найдено", 404)
        return json_ok({"entry": entry(p)})

    async def places(_req):
        return json_ok({"places": await asyncio.to_thread(xdg_places)})

    async def prev(req):
        p = resolve(req.query.get("path", ""))
        if not p.exists():
            return json_err("не найдено", 404)
        return json_ok({"path": str(p), "preview": await preview(p)})

    async def raw(req):
        p = resolve(req.query.get("path", ""))
        if not p.is_file():
            raise web.HTTPNotFound()
        resp = web.FileResponse(p)
        if p.suffix.lower() == ".svg":      # SVG из файлов — только как картинка, без скриптов
            resp.headers["Content-Security-Policy"] = "script-src 'none'"
        return resp

    async def thumb(req):
        p = resolve(req.query.get("path", ""))
        if not p.is_file():
            raise web.HTTPNotFound()
        t = await thumbnail(p, min(1024, int(req.query.get("size", 256))), int(req.query.get("page", 1)))
        if not t:
            raise web.HTTPNotFound()
        return web.FileResponse(t, headers={"Cache-Control": "max-age=3600"})

    async def read(req):
        p = resolve(req.query.get("path", ""))
        if not p.is_file():
            return json_err("не найдено", 404)
        if p.stat().st_size > READ_LIMIT:
            return json_err("файл слишком большой для редактора", 413)
        data = p.read_bytes()
        return json_ok({"path": str(p), "text": data.decode("utf-8", "replace"), "mtime": p.stat().st_mtime,
                        "binary": b"\x00" in data[:8192]})

    async def write(req):
        b = await body(req)
        p = resolve(str(b.get("path", "")))
        if p.exists() and b.get("mtime") and abs(p.stat().st_mtime - float(b["mtime"])) > 0.001 and not b.get("force"):
            return json_err("файл изменился на диске", 409, mtime=p.stat().st_mtime)
        text = b.get("text")
        if not isinstance(text, str):
            return json_err("text?")
        mode = p.stat().st_mode & 0o777 if p.exists() else 0o644
        util.atomic_write(p, text, mode)
        return json_ok({"mtime": p.stat().st_mtime})

    async def open_(req):
        b = await body(req)
        p = resolve(str(b.get("path", "")))
        if not p.exists():
            return json_err("не найдено", 404)
        if b.get("line") and category(p) in ("code", "doc", "other"):
            util.spawn(["haotica", "open", "editor", f"{p}:{int(b['line'])}"])
        else:
            util.spawn(["gio", "open", str(p)])
        return json_ok()

    async def reveal(req):
        b = await body(req)
        util.spawn(["haotica", "open", "files", "--select", str(resolve(str(b.get("path", "~"))))])
        return json_ok()

    async def trash(req):
        b = await body(req)
        done, failed = [], []
        for x in b.get("paths", []):
            rc, _, err = await util.arun(["gio", "trash", str(resolve(str(x)))], 30)
            (done if rc == 0 else failed).append(x if rc == 0 else {"path": x, "error": err.strip()})
        if done:
            core.events.add("info", f"TRASH // {len(done)} ITEM(S)", sound="trash")
        return json_ok({"done": done, "failed": failed})

    async def trash_empty(_req):
        rc, _, err = await util.arun(["gio", "trash", "--empty"], 120)
        if rc == 0:
            core.events.add("info", "TRASH // EMPTIED", sound="trash_empty")
        return json_ok() if rc == 0 else json_err(err.strip())

    async def trash_restore(req):
        b = await body(req)
        base = paths.XDG_DATA / "Trash"
        restored = []
        for name in b.get("names", []):
            info = base / "info" / f"{Path(str(name)).name}.trashinfo"
            src = base / "files" / Path(str(name)).name
            if not info.exists() or not src.exists():
                continue
            meta = dict(ln.split("=", 1) for ln in info.read_text(errors="ignore").splitlines() if "=" in ln)
            dst = Path(urllib.parse.unquote(meta.get("Path", "")))
            if not dst.is_absolute() or dst.exists():
                dst = paths.HOME / "Restored" / src.name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            info.unlink(missing_ok=True)
            restored.append(str(dst))
        return json_ok({"restored": restored})

    async def mkdir(req):
        b = await body(req)
        p = resolve(str(b.get("path", "")))
        p.mkdir(parents=True, exist_ok=True)
        return json_ok({"entry": entry(p)})

    async def rename(req):
        b = await body(req)
        p = resolve(str(b.get("path", "")))
        name = str(b.get("name", "")).strip()
        if not name or "/" in name or name in (".", ".."):
            return json_err("недопустимое имя")
        dst = p.with_name(name)
        if dst.exists():
            return json_err("такое имя уже есть", 409)
        p.rename(dst)
        return json_ok({"entry": entry(dst)})

    async def copy_move(req):
        b = await body(req)
        move = req.match_info["op"] == "move"
        dst = resolve(str(b.get("dst", "")))
        if not dst.is_dir():
            return json_err("куда? нужна папка")

        def job() -> list[str]:
            out = []
            for s in b.get("src", []):
                src = resolve(str(s))
                target = dst / src.name
                k = 1
                while target.exists():
                    target = dst / f"{src.stem} ({k}){src.suffix}"
                    k += 1
                if move:
                    shutil.move(str(src), str(target))
                elif src.is_dir():
                    shutil.copytree(src, target, symlinks=True)
                else:
                    shutil.copy2(src, target)
                out.append(str(target))
            return out
        return json_ok({"done": await asyncio.to_thread(job)})

    async def delete(req):
        b = await body(req)
        if not b.get("confirm"):
            return json_err("удаление без корзины требует подтверждения", 428)
        for x in b.get("paths", []):
            p = resolve(str(x))
            if p in (paths.HOME, Path("/")) or len(p.parts) < 3:
                return json_err(f"отказ: {p}", 403)
            if p.is_dir() and not p.is_symlink():
                await asyncio.to_thread(shutil.rmtree, p)
            else:
                p.unlink(missing_ok=True)
        return json_ok()

    async def tags_get(req):
        reg = util.load_json(TAGS_FILE, None) or {"важное": "#E0705A", "работа": "#5FA8A0", "проект": "#E0A243",
                                                  "личное": "#A88BD6", "ИИ": "#8F7BE0"}
        out = {"registry": reg}
        if req.query.get("tag"):
            idx = util.load_json(TAG_INDEX, {}) or {}
            files = [p for p in idx.get(req.query["tag"], []) if Path(p).exists()]
            out["files"] = [entry(Path(p)) for p in files]
        return json_ok(out)

    async def tags_set(req):
        b = await body(req)
        if isinstance(b.get("registry"), dict):
            util.write_json(TAGS_FILE, {str(k)[:24]: str(v)[:9] for k, v in b["registry"].items()})
        for x in b.get("paths", []):
            p = resolve(str(x))
            tags = b.get("tags")
            if isinstance(tags, list):
                set_tags(p, [str(t) for t in tags])
            else:
                cur = set(get_tags(p)) | set(b.get("add", [])) - set(b.get("remove", []))
                set_tags(p, list(cur))
        return json_ok()

    async def search(req):
        q = req.query.get("q", "").strip()
        root = resolve(req.query.get("path", "~"))
        limit = min(500, int(req.query.get("limit", 200)))
        if not q:
            return json_ok({"results": []})
        if req.query.get("content") == "1" and util.which("rg"):
            rc, out, _ = await util.arun(["rg", "--json", "-m", "3", "-S", "--max-filesize", "4M", q, str(root)], 20)
            import json as _json
            res = []
            for ln in out.splitlines():
                try:
                    m = _json.loads(ln)
                except ValueError:
                    continue
                if m.get("type") == "match":
                    d = m["data"]
                    res.append({"path": d["path"]["text"], "line": d["line_number"],
                                "text": d["lines"].get("text", "")[:240]})
                if len(res) >= limit:
                    break
            return json_ok({"results": res})
        tool = util.which("fd") or util.which("fdfind")
        if tool:
            rc, out, _ = await util.arun([tool, "-i", "--max-results", str(limit), q, str(root)], 20)
            files = out.splitlines()
        else:
            files = [str(p) for p in list(root.rglob(f"*{q}*"))[:limit]]
        return json_ok({"results": [entry(Path(f)) for f in files]})

    async def paste_image(req):
        """Картинка из буфера (вставка в чат Haotica) → файл во вложениях, чтобы прикрепить его к сообщению."""
        import base64
        import time as _t
        b = await req.json()
        try:
            raw = base64.b64decode(str(b.get("data", "")), validate=True)
        except ValueError:
            return json_err("не base64")
        if not raw or len(raw) > 16 * 2 ** 20:
            return json_err("пусто или больше 16 МБ")
        ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}.get(str(b.get("type")), ".png")
        d = paths.DATA_DIR / "attachments"
        d.mkdir(parents=True, exist_ok=True)
        f = d / f"paste-{_t.strftime('%Y%m%d-%H%M%S')}{ext}"
        f.write_bytes(raw)
        return json_ok({"path": str(f)})

    r.add_post("/api/fs/paste-image", paste_image)
    r.add_get("/api/fs/list", ls)
    r.add_get("/api/fs/stat", fstat)
    r.add_get("/api/fs/places", places)
    r.add_get("/api/fs/preview", prev)
    r.add_get("/api/fs/raw", raw)
    r.add_get("/api/fs/thumb", thumb)
    r.add_get("/api/fs/read", read)
    r.add_post("/api/fs/write", write)
    r.add_post("/api/fs/open", open_)
    r.add_post("/api/fs/reveal", reveal)
    r.add_post("/api/fs/trash", trash)
    r.add_post("/api/fs/trash/empty", trash_empty)
    r.add_post("/api/fs/trash/restore", trash_restore)
    r.add_post("/api/fs/mkdir", mkdir)
    r.add_post("/api/fs/rename", rename)
    r.add_post("/api/fs/{op:copy|move}", copy_move)
    r.add_post("/api/fs/delete", delete)
    r.add_get("/api/fs/tags", tags_get)
    r.add_post("/api/fs/tags", tags_set)
    r.add_get("/api/fs/search", search)
