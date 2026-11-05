"""Голос Haotica (Сара): готовые реплики и эмоции для фиксированных ситуаций, остальное —
локальный синтез Chatterbox (служба haotica-tts) или ElevenLabs. Губы аватара двигаются по
громкости звука: огибающая 50 Гц уходит в поток событий «mouth» во время воспроизведения."""
from __future__ import annotations

import asyncio
import io
import logging
import os
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


def scale_wav(data: bytes, gain: float) -> bytes:
    """Громкость в самом WAV (winsound не умеет громкость)."""
    if abs(gain - 1.0) < 0.02:
        return data
    try:
        import numpy as np
        with wave.open(io.BytesIO(data)) as w:
            params, raw = w.getparams(), w.readframes(w.getnframes())
        if params.sampwidth != 2:
            return data
        a = (np.frombuffer(raw, dtype=np.int16).astype(np.float32) * max(0.0, min(2.0, gain))).clip(-32768, 32767)
        out = io.BytesIO()
        with wave.open(out, "wb") as w:
            w.setparams(params)
            w.writeframes(a.astype(np.int16).tobytes())
        return out.getvalue()
    except Exception:  # noqa: BLE001
        return data


class Voice:
    """Речь Haotica: по предложениям (первое звучит, пока синтезируется второе), с прерыванием.

    Прерывание (barge-in): новая реплика, ввод владельца, Esc/«стоп» — stop() глушит звук и сбрасывает очередь.
    """

    def __init__(self, hub, state) -> None:
        self.hub, self.state = hub, state
        self.lock = asyncio.Lock()
        self.playing: asyncio.subprocess.Process | None = None
        self.gen = 0                                     # поколение речи: stop() его увеличивает
        self._win_playing = False

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
        """Сказать ответ голосом Сары по плану просодии: фразы с интонацией и темпом, паузы, записанные эмоции.

        Пока звучит фраза, синтезируется следующая. Любая новая реплика, ввод владельца или «стоп» — stop().
        Голос — только Сара: локальный клон, при сбое — ElevenLabs Sarah; чужих голосов нет.
        """
        s = config.load()
        if not self.enabled(s) or not text.strip():
            return False
        from ..tts import prosody
        if not prosody.speakable(text):
            return False
        await self.stop()                                 # новая реплика глушит старую
        gen = self.gen
        backend = s.get("haotica", {}).get("voice_backend", "local")
        lang = s.get("locale", {}).get("haotica_language", "")
        speed = float(s.get("haotica", {}).get("voice_speed", 1.0))
        mood = {"warning": "warning", "happy": "happy"}.get(emotion, "neutral")
        plan = prosody.plan(text, lang if lang in ("ru", "en", "de") else "", speed, mood)
        speech = [i for i, x in enumerate(plan) if x.kind == "speech"]
        if not speech:
            return False

        async def synth(seg) -> bytes:
            audio = b""
            if backend in ("local", "auto"):
                audio = await self._local(seg.text, seg.lang, seg.exaggeration, seg.speed, seg.cfg, seg.temperature)
            if not audio and backend in ("elevenlabs", "local", "auto"):
                audio = await self._eleven(seg.text, seg.lang, seg.exaggeration, seg.speed)
            return audio
        tasks: dict[int, asyncio.Task] = {speech[0]: asyncio.create_task(synth(plan[speech[0]]))}
        played = False
        try:
            for idx, seg in enumerate(plan):
                if gen != self.gen:
                    return played
                if seg.kind == "pause":
                    await asyncio.sleep(seg.ms / 1000)
                    continue
                if seg.kind == "sound":
                    f = voice_dir() / f"{seg.sound}.ogg"
                    if f.exists():
                        await self._play_file(f, s, seg.ms / 1000 if seg.ms else 0)
                    continue
                nxt = next((k for k in speech if k > idx), None)    # конвейер: следующая фраза уже синтезируется
                if nxt is not None and nxt not in tasks:
                    tasks[nxt] = asyncio.create_task(synth(plan[nxt]))
                audio = await tasks.pop(idx)
                if gen != self.gen:
                    return played
                if audio:
                    await self._play_bytes(audio, s, gen)
                    played = True
                elif not played:
                    return False                           # голоса Сары нет — молчим, а не говорим чужим голосом
        finally:
            for t in tasks.values():
                t.cancel()
        return played

    async def _local(self, text: str, lang: str, exaggeration: float = 0.5, speed: float = 1.0, cfg: float = 0.5,
                     temperature: float = 0.8) -> bytes:
        url = f"http://{paths.HOST}:{paths.PORT_TTS}/tts"
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=90)) as sess:
                async with sess.post(url, json={"text": text[:1200], "lang": lang, "exaggeration": exaggeration,
                                                "speed": speed, "cfg": cfg, "temperature": temperature}) as r:
                    if r.status == 200 and r.headers.get("X-Haotica-Sarah", "1") != "0":
                        return await r.read()
        except (aiohttp.ClientError, asyncio.TimeoutError):
            pass
        return b""

    async def _eleven(self, text: str, lang: str, exaggeration: float = 0.5, speed: float = 1.0) -> bytes:
        key = await secrets.get("elevenlabs")
        if not key:
            return b""
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}?output_format=pcm_24000"
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as sess:
                async with sess.post(url, headers={"xi-api-key": key}, json={
                        "text": text[:1500], "model_id": "eleven_multilingual_v2",
                        "voice_settings": {"stability": round(max(0.25, 0.7 - exaggeration * 0.5), 2), "similarity_boost": 0.8,
                                           "style": round(max(0.0, min(0.8, exaggeration - 0.3)), 2),
                                           "speed": round(max(0.8, min(1.2, speed)), 2)}}) as r:
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

    async def _play_file(self, f: Path, s: dict, max_s: float = 0) -> None:
        data = b""
        if f.suffix == ".ogg" and util.which("ffmpeg"):
            cut = ["-t", f"{max_s:.2f}", "-af", f"afade=t=out:st={max(0, max_s - 0.4):.2f}:d=0.4"] if max_s else []
            proc = await asyncio.create_subprocess_exec("ffmpeg", "-v", "quiet", "-i", str(f), *cut, "-f", "wav", "-ac", "1",
                                                        "-ar", "24000", "-", stdout=asyncio.subprocess.PIPE)
            data, _ = await proc.communicate()
        if data:
            await self._play_bytes(data, s)
        elif os.name != "nt":
            await util.arun(["pw-play", "--volume", f"{self.volume(s):.2f}", str(f)], 60)

    async def _play_bytes(self, wav: bytes, s: dict, gen: int | None = None) -> None:
        async with self.lock:
            if gen is not None and gen != self.gen:
                return
            env, dur = envelope_wav(wav)
            prev = self.state.value
            self.state.set("speaking")
            if os.name == "nt":                          # Windows: winsound из памяти, громкость — в самих данных
                import winsound
                data = scale_wav(wav, self.volume(s) / 0.55)
                mouth = asyncio.create_task(self._mouth(env))
                self._win_playing = True
                try:
                    await asyncio.to_thread(winsound.PlaySound, data, winsound.SND_MEMORY | winsound.SND_NODEFAULT)
                except RuntimeError:
                    pass
                finally:
                    self._win_playing = False
                    mouth.cancel()
                    self.hub.publish("mouth", {"v": 0}, keep=False)
                    self.state.set(prev if prev != "speaking" else "idle")
                return
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
        """Заглушить речь сейчас же и отменить оставшиеся предложения."""
        self.gen += 1
        if os.name == "nt" and self._win_playing:
            import winsound
            try:
                winsound.PlaySound(None, winsound.SND_PURGE)
            except RuntimeError:
                pass
        if self.playing and self.playing.returncode is None:
            self.playing.kill()
