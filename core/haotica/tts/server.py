"""Синтез речи Haotica: POST /tts {text, lang, exaggeration, speed} → audio/wav; GET /health.

Движки по порядку (haotica.tts_engine: auto, chatterbox, piper):
  chatterbox — Chatterbox Multilingual на GPU (ROCm), голос Сары клонируется по образцу из репозитория
               (assets/sounds/voice/ref_sarah_1.mp3, сделан в ElevenLabs) или по своему ~/.local/share/haotica/voice/sarah.wav;
               ставится по умолчанию (отказ: ./install.sh --no-voice-hq), ~6 ГБ, делит общую память с моделями;
  piper      — Piper на CPU (лёгкий, быстрый): ru_RU-irina-medium / en_US-amy-medium. Ставится всегда.
Работает в /opt/haotica/tts-venv; слушает только 127.0.0.1. Модели голосов: /opt/haotica/voices.
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import wave
from pathlib import Path

from aiohttp import web

from .. import config, paths

log = logging.getLogger("haotica.tts")
VOICES = Path(os.environ.get("HAOTICA_VOICES", str(paths.OPT / "voices")))
PIPER_VOICES = {"ru": "ru_RU-irina-medium", "en": "en_US-amy-medium"}


def reference() -> Path | None:
    """Образец голоса Сары: свой WAV пользователя, иначе MP3 из репозитория → WAV 24 кГц (через ffmpeg, в кэш)."""
    own = paths.DATA_DIR / "voice" / "sarah.wav"
    if own.exists():
        return own
    cached = paths.CACHE_DIR / "voice" / "sarah.wav"
    if cached.exists():
        return cached
    for d in (paths.SHARE / "sounds/haotica-voice", paths.ASSETS / "sounds/voice"):
        src = d / "ref_sarah_1.mp3"
        if src.exists():
            import subprocess
            cached.parent.mkdir(parents=True, exist_ok=True)
            r = subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(src), "-ac", "1", "-ar", "24000",
                                "-t", "12", str(cached)], check=False)
            return cached if r.returncode == 0 and cached.exists() else None
    return None


class Piper:
    name = "piper"

    def __init__(self) -> None:
        from piper import PiperVoice  # noqa: F401 — проверка, что пакет есть
        self.voices: dict = {}

    def ready(self) -> bool:
        return any((VOICES / f"{v}.onnx").exists() for v in PIPER_VOICES.values())

    def _voice(self, lang: str):
        from piper import PiperVoice
        name = PIPER_VOICES.get(lang, PIPER_VOICES["ru"])
        if not (VOICES / f"{name}.onnx").exists():
            name = next(v for v in PIPER_VOICES.values() if (VOICES / f"{v}.onnx").exists())
        if name not in self.voices:
            self.voices[name] = PiperVoice.load(str(VOICES / f"{name}.onnx"))
        return self.voices[name]

    def synth(self, text: str, lang: str, exaggeration: float, speed: float) -> bytes:
        voice = self._voice(lang)
        length = 1.0 / max(0.5, min(2.0, speed or 1.0))
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            try:                                    # piper-tts ≥ 1.3
                from piper import SynthesisConfig
                voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=length))
            except ImportError:                     # piper-tts 1.2
                voice.synthesize(text, w, length_scale=length)
        return buf.getvalue()


class Chatterbox:
    name = "chatterbox"

    def __init__(self) -> None:
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        self.torch = torch
        self.model = ChatterboxMultilingualTTS.from_pretrained(device=dev)
        self.ref = reference()
        if self.ref:                                # условия голоса считаются один раз
            try:
                self.model.prepare_conditionals(str(self.ref), exaggeration=0.5)
            except Exception as e:  # noqa: BLE001
                log.warning("образец голоса не подготовлен: %s", e)
        log.info("chatterbox на %s, образец: %s", dev, self.ref or "нет (стандартный голос)")

    def ready(self) -> bool:
        return True

    def synth(self, text: str, lang: str, exaggeration: float, speed: float) -> bytes:
        kw = {"language_id": lang if lang in ("ru", "en", "de") else "ru", "exaggeration": exaggeration}
        if self.ref and getattr(self.model, "conds", None) is None:
            kw["audio_prompt_path"] = str(self.ref)
        with self.torch.inference_mode():
            wav = self.model.generate(text, **kw)
        pcm = (wav.squeeze().clamp(-1, 1).cpu().numpy() * 32767).astype("int16").tobytes()
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(int(self.model.sr))
            w.writeframes(pcm)
        return buf.getvalue()


def load_engine():
    want = config.get("haotica.tts_engine", "auto")
    order = {"chatterbox": [Chatterbox, Piper], "piper": [Piper]}.get(want, [Chatterbox, Piper])
    for cls in order:
        try:
            eng = cls()
            if eng.ready():
                return eng
        except Exception as e:  # noqa: BLE001 — движок не установлен: пробуем следующий
            log.info("%s недоступен: %s", cls.name, e)
    return None


def create_app() -> web.Application:
    app = web.Application(client_max_size=64 * 1024)
    lock = asyncio.Lock()

    async def health(_r):
        eng = app.get("engine")
        return web.json_response({"ok": bool(eng), "engine": eng.name if eng else ""}, status=200 if eng else 503)

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
        async with lock:
            wav = await asyncio.to_thread(eng.synth, text, str(d.get("lang", "ru")),
                                          float(d.get("exaggeration", 0.5)), float(d.get("speed", 1.0)))
        return web.Response(body=wav, content_type="audio/wav")

    async def startup(_app):
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
