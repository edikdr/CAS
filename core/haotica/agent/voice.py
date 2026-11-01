"""Голос Haotica (Сара): готовые реплики и эмоции для фиксированных ситуаций, остальное —
локальный синтез Chatterbox (служба haotica-tts) или ElevenLabs. Губы аватара двигаются по
громкости звука: огибающая 50 Гц уходит в поток событий «mouth» во время воспроизведения."""
from __future__ import annotations

import asyncio
import io
import logging
import time
import wave
from pathlib import Path

import aiohttp

from .. import config, paths, secrets, util

log = logging.getLogger("haotica.voice")
ELEVEN_VOICE = "EXAVITQu4vr4xnSDxMaL"      # Sarah (стандартная библиотека ElevenLabs)
EMOTION_EXPR = {"scream": "warning", "laugh": "happy", "giggle": "happy", "joy": "happy", "sigh": "idle",
                "groan": "warning", "pain": "warning", "gasp": "warning", "hmm": "thinking", "yawn": "sleep",
                "psst": "idle", "tsk": "idle"}


def voice_dir() -> Path:
    for d in (paths.SHARE / "sounds/haotica-voice", paths.ASSETS / "sounds/voice"):
        if d.is_dir():
            return d
    return paths.SHARE / "sounds/haotica-voice"


def quiet_now(s: dict) -> bool:
    snd = s.get("sound", {})
    if not snd.get("quiet_hours", True):
        return False
    now = time.localtime()
    cur = now.tm_hour * 60 + now.tm_min

    def m(x: str) -> int:
        h, _, mm = (x or "00:00").partition(":")
        return int(h) * 60 + int(mm or 0)
    a, b = m(snd.get("quiet_start", "23:00")), m(snd.get("quiet_end", "08:00"))
    return a <= cur < b if a <= b else (cur >= a or cur < b)


def envelope_wav(data: bytes, fps: int = 50) -> tuple[list[float], float]:
    """Громкость по кадрам (0..1) и длительность WAV."""
    try:
        import numpy as np
        with wave.open(io.BytesIO(data)) as w:
            sr, n, ch, width = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
            raw = w.readframes(n)
        if width != 2:
            return [], n / max(1, sr)
        a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
        if ch > 1:
            a = a.reshape(-1, ch).mean(axis=1)
        hop = max(1, sr // fps)
        frames = len(a) // hop
        if frames == 0:
            return [], len(a) / sr
        rms = np.sqrt((a[: frames * hop].reshape(frames, hop) ** 2).mean(axis=1))
        peak = float(np.percentile(rms, 95)) or 1.0
        env = np.clip(rms / peak, 0, 1) ** 0.6
        return [round(float(x), 3) for x in env], len(a) / sr
    except Exception:  # noqa: BLE001 — без numpy губы просто не двигаются
        return [], 0.0


class Voice:
    def __init__(self, hub, state) -> None:
        self.hub, self.state = hub, state
        self.lock = asyncio.Lock()
        self.playing: asyncio.subprocess.Process | None = None

    def enabled(self, s: dict) -> bool:
        ha = s.get("haotica", {})
        return bool(ha.get("voice", True)) and s.get("sound", {}).get("voice_lines", True) and not s.get("_game")

    def volume(self, s: dict) -> float:
        v = float(s.get("sound", {}).get("volume", 0.55))
        return v * (0.4 if quiet_now(s) else 1.0)

    async def line(self, event: str, emotion: str = "") -> bool:
        """Готовая реплика: event_ru.ogg / event_en.ogg или эмоция emo_*.ogg."""
        s = config.load()
        if not self.enabled(s):
            return False
        lang = s.get("locale", {}).get("haotica_language", "ru")
        d = voice_dir()
        f = next((p for p in (d / f"{event}_{lang}.ogg", d / f"{event}_en.ogg", d / f"{event}.ogg") if p.exists()), None)
        if not f:
            return False
        if emotion or event.startswith("emo_"):
            self.state.set(EMOTION_EXPR.get(event.removeprefix("emo_").split("_")[0], "happy"))
        await self._play_file(f, s)
        return True

    async def say(self, text: str, emotion: str = "neutral") -> bool:
        s = config.load()
        if not self.enabled(s) or not text.strip():
            return False
        backend = s.get("haotica", {}).get("voice_backend", "local")
        lang = s.get("locale", {}).get("haotica_language", "ru")
        speed = float(s.get("haotica", {}).get("voice_speed", 1.0))
        audio = b""
        if backend in ("local", "auto"):
            audio = await self._local(text, lang, emotion, speed)
        if not audio and backend in ("elevenlabs", "local", "auto"):
            audio = await self._eleven(text, lang)
        if not audio:
            return False
        await self._play_bytes(audio, s)
        return True

    async def _local(self, text: str, lang: str, emotion: str, speed: float) -> bytes:
        url = f"http://{paths.HOST}:{paths.PORT_TTS}/tts"
        exaggeration = {"neutral": 0.45, "happy": 0.7, "warning": 0.6, "sad": 0.35, "excited": 0.85}.get(emotion, 0.5)
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90)) as sess:
                async with sess.post(url, json={"text": text[:1200], "lang": lang, "exaggeration": exaggeration,
                                                "speed": speed}) as r:
                    if r.status == 200:
                        return await r.read()
        except (aiohttp.ClientError, asyncio.TimeoutError):
            pass
        return b""

    async def _eleven(self, text: str, lang: str) -> bytes:
        key = await secrets.get("elevenlabs")
        if not key:
            return b""
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}?output_format=pcm_24000"
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as sess:
                async with sess.post(url, headers={"xi-api-key": key}, json={
                        "text": text[:1500], "model_id": "eleven_multilingual_v2",
                        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8}}) as r:
                    if r.status != 200:
                        return b""
                    pcm = await r.read()
        except (aiohttp.ClientError, asyncio.TimeoutError):
            return b""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(24000)
            w.writeframes(pcm)
        return buf.getvalue()

    async def _play_file(self, f: Path, s: dict) -> None:
        data = b""
        if f.suffix == ".ogg" and util.which("ffmpeg"):
            proc = await asyncio.create_subprocess_exec("ffmpeg", "-v", "quiet", "-i", str(f), "-f", "wav", "-ac", "1",
                                                        "-ar", "24000", "-", stdout=asyncio.subprocess.PIPE)
            data, _ = await proc.communicate()
        if data:
            await self._play_bytes(data, s)
        else:
            await util.arun(["pw-play", "--volume", f"{self.volume(s):.2f}", str(f)], 60)

    async def _play_bytes(self, wav: bytes, s: dict) -> None:
        async with self.lock:
            env, dur = envelope_wav(wav)
            prev = self.state.current
            self.state.set("speaking")
            tmp = paths.RUNTIME_DIR / f"voice-{int(time.time() * 1000)}.wav"
            tmp.write_bytes(wav)
            proc = await asyncio.create_subprocess_exec("pw-play", "--volume", f"{self.volume(s):.2f}", str(tmp),
                                                        stderr=asyncio.subprocess.DEVNULL)
            self.playing = proc
            mouth = asyncio.create_task(self._mouth(env))
            try:
                await asyncio.wait_for(proc.wait(), dur + 5)
            except asyncio.TimeoutError:
                proc.kill()
            finally:
                mouth.cancel()
                tmp.unlink(missing_ok=True)
                self.hub.publish("mouth", {"v": 0}, keep=False)
                self.playing = None
                self.state.set(prev if prev != "speaking" else "idle")

    async def _mouth(self, env: list[float]) -> None:
        t0 = time.monotonic()
        for i, v in enumerate(env):
            self.hub.publish("mouth", {"v": v}, keep=False)
            delay = t0 + (i + 1) / 50 - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)

    async def stop(self) -> None:
        if self.playing and self.playing.returncode is None:
            self.playing.kill()
