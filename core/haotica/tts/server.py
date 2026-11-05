"""Синтез речи Haotica: POST /tts {text, lang, exaggeration, speed} → audio/wav; GET /health.

Текст нормализуется (числа, даты, сокращения — normalize.py), короткие фразы кэшируются на диске,
запросы идут в очередь (один синтез за раз). Потоковость — по предложениям: клиент (agent/voice.py)
шлёт их по одному и играет первое, пока синтезируется следующее; прерывание — на стороне клиента.
Движки — tts/engines.py.

Движки по порядку (haotica.tts_engine: auto, chatterbox, piper):
  chatterbox — Chatterbox Multilingual на GPU (ROCm), голос Сары клонируется по образцу из репозитория
               (assets/sounds/voice/ref_sarah_1.mp3, сделан в ElevenLabs) или по своему ~/.local/share/haotica/voice/sarah.wav;
               ставится по умолчанию (отказ: ./install.sh --no-voice-hq), ~6 ГБ, делит общую память с моделями;
  piper      — Piper на CPU (лёгкий, быстрый): ru_RU-irina-medium / en_US-amy-medium. Ставится всегда.
Работает в /opt/haotica/tts-venv; слушает только 127.0.0.1. Модели голосов: /opt/haotica/voices.
"""
from __future__ import annotations

import asyncio
import logging
import os

from aiohttp import web

from .. import config, paths

log = logging.getLogger("haotica.tts")


def load_engine():
    """Движок из haotica.tts_engine; auto — первый установленный по качеству (выбор по прослушиванию)."""
    from .engines import ENGINES, SARAH_ORDER
    want = config.get("haotica.tts_engine", "auto")
    order = [want] if want in ENGINES else []
    order += [e for e in SARAH_ORDER if e not in order]       # только голос Сары, если не выбрано иное
    for name in order:
        try:
            eng = ENGINES[name]()
            if eng.ready():
                return eng
        except Exception as e:  # noqa: BLE001 — движок не установлен: пробуем следующий
            log.info("%s недоступен: %s", name, e)
    return None


class Cache:
    """Готовые фразы на диске (короткие реплики повторяются): ключ — движок, язык, скорость, текст."""

    def __init__(self, limit_mb: int = 200) -> None:
        self.dir = paths.CACHE_DIR / "tts"
        self.limit = limit_mb * 2 ** 20

    def key(self, *parts) -> str:
        import hashlib
        return hashlib.sha256("\x1f".join(map(str, parts)).encode()).hexdigest()[:32]

    def get(self, k: str) -> bytes | None:
        f = self.dir / f"{k}.wav"
        try:
            data = f.read_bytes()
            os.utime(f)
            return data
        except OSError:
            return None

    def put(self, k: str, data: bytes) -> None:
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            (self.dir / f"{k}.wav").write_bytes(data)
            files = sorted(self.dir.glob("*.wav"), key=lambda p: p.stat().st_mtime)
            total = sum(p.stat().st_size for p in files)
            while files and total > self.limit:
                total -= files[0].stat().st_size
                files.pop(0).unlink(missing_ok=True)
        except OSError:
            pass


def create_app() -> web.Application:
    app = web.Application(client_max_size=64 * 1024)
    lock = asyncio.Lock()

    async def health(_r):
        eng = app.get("engine")
        return web.json_response({"ok": bool(eng), "engine": eng.name if eng else "", "sarah": bool(eng and eng.clone)},
                                 status=200 if eng else 503)

    async def tts(r):
        if r.host not in (f"127.0.0.1:{paths.PORT_TTS}", f"localhost:{paths.PORT_TTS}"):
            return web.json_response({"ok": False}, status=403)
        eng = app.get("engine")
        if not eng:
            return web.json_response({"ok": False, "error": "нет движка синтеза"}, status=503)
        d = await r.json()
        text = str(d.get("text", "")).strip()[:1200]
        if not text:
            return web.json_response({"ok": False, "error": "пустой текст"}, status=400)
        from .normalize import detect_lang, normalize
        lang = str(d.get("lang") or detect_lang(text))
        lang = lang if lang in ("ru", "en", "de") else detect_lang(text)
        speed, exag = float(d.get("speed", 1.0)), float(d.get("exaggeration", 0.5))
        cfg, temp = float(d.get("cfg", 0.5)), float(d.get("temperature", 0.8))
        norm = normalize(text, lang) if d.get("normalize", True) else text
        k = app["cache"].key(eng.name, getattr(eng, "voice_id", ""), lang, round(speed, 2), round(exag, 2), round(cfg, 2), norm)
        wav = app["cache"].get(k)
        if wav is None:
            async with lock:                       # очередь: один синтез за раз
                wav = await asyncio.to_thread(eng.synth, norm, lang, speed, exag, cfg, temp)
            if len(norm) < 300:
                app["cache"].put(k, wav)
        return web.Response(body=wav, content_type="audio/wav",
                            headers={"X-Haotica-Engine": eng.name, "X-Haotica-Sarah": "1" if eng.clone else "0"})

    async def startup(_app):
        app["cache"] = Cache()
        app["engine"] = await asyncio.to_thread(load_engine)
        log.info("движок: %s", app["engine"].name if app["engine"] else "нет")

    app.router.add_get("/health", health)
    app.router.add_post("/tts", tts)
    app.on_startup.append(startup)
    return app


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname).1s %(name)s: %(message)s")
    web.run_app(create_app(), host=paths.HOST, port=paths.PORT_TTS, print=None, access_log=None)
    return 0
