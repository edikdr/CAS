"""Поиск в интернете без аккаунтов: локальный SearXNG (podman), загрузка и очистка страниц локально.

Облачным помощникам уходят только фрагменты публичных страниц, а не адреса ваших файлов.
"""
from __future__ import annotations

import asyncio
import html
import re
from urllib.parse import urlparse

import aiohttp

from .. import paths

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36"
DROP = re.compile(r"(?is)<(script|style|noscript|svg|nav|footer|header|form|iframe|template|aside)[^>]*>.*?</\1>")
TAGS = re.compile(r"(?s)<[^>]+>")
SPACE = re.compile(r"[ \t\r\f\v]+")


def clean_html(raw: str, limit: int = 7000) -> tuple[str, str]:
    title = ""
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw)
    if m:
        title = html.unescape(TAGS.sub("", m.group(1))).strip()[:200]
    body = re.search(r"(?is)<(article|main)[^>]*>(.*?)</\1>", raw)
    text = body.group(2) if body else raw
    text = DROP.sub(" ", text)
    text = re.sub(r"(?i)<(br|/p|/div|/li|/h[1-6]|/tr)[^>]*>", "\n", text)
    text = html.unescape(TAGS.sub(" ", text))
    lines = [SPACE.sub(" ", ln).strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if len(ln) > 30 or (ln and ln[-1:] in ".:!?")]
    return title, "\n".join(lines)[:limit]


class Search:
    def __init__(self) -> None:
        self.base = f"http://{paths.HOST}:{paths.PORT_SEARXNG}"

    async def searx(self, query: str, n: int = 8, lang: str = "auto") -> list[dict]:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12)) as s:
                async with s.get(self.base + "/search", params={"q": query, "format": "json", "language": lang,
                                                                "safesearch": 0}) as r:
                    if r.status != 200:
                        return []
                    d = await r.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
            return []
        out, seen = [], set()
        for it in d.get("results", []):
            u = it.get("url", "")
            host = urlparse(u).netloc
            if not u or u in seen:
                continue
            seen.add(u)
            out.append({"title": it.get("title", ""), "url": u, "snippet": it.get("content", "")[:400], "host": host,
                        "engine": it.get("engine", "")})
            if len(out) >= n:
                break
        return out

    async def available(self) -> bool:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2)) as s:
                async with s.get(self.base + "/healthz") as r:
                    return r.status == 200
        except (aiohttp.ClientError, asyncio.TimeoutError, OSError):
            return False

    async def fetch(self, url: str, limit: int = 7000) -> dict:
        if not url.startswith(("http://", "https://")):
            return {"url": url, "error": "не http(s)"}
        host = urlparse(url).hostname or ""
        if host in ("localhost", "127.0.0.1") or host.endswith(".local") or re.match(r"^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.", host):
            return {"url": url, "error": "локальные адреса не загружаются"}
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15), headers={"User-Agent": UA}) as s:
                async with s.get(url, max_redirects=5) as r:
                    ctype = r.headers.get("Content-Type", "")
                    if "html" not in ctype and "text" not in ctype:
                        return {"url": url, "error": f"тип {ctype}"}
                    raw = (await r.content.read(2_000_000)).decode(r.charset or "utf-8", "replace")
        except (aiohttp.ClientError, asyncio.TimeoutError, UnicodeDecodeError) as e:
            return {"url": url, "error": type(e).__name__}
        title, text = clean_html(raw, limit)
        return {"url": url, "title": title, "text": text}

    async def exists(self, url: str) -> bool:
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8), headers={"User-Agent": UA}) as s:
                async with s.head(url, allow_redirects=True) as r:
                    if r.status < 400:
                        return True
                async with s.get(url, allow_redirects=True) as r:
                    return r.status < 400
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return False
