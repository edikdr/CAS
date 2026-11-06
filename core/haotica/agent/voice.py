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


START_LEAD_S = 3.0      # речь начинается не позже, чем накоплено столько секунд звука


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


def _pcm(data: bytes, sr: int):
    """WAV → моно int16 нужной частоты (numpy) или None."""
    try:
        import numpy as np
        with wave.open(io.BytesIO(data)) as w:
            rate, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
            raw = w.readframes(w.getnframes())
        if width != 2:
            return None
        a = np.frombuffer(raw, dtype=np.int16)
        if ch > 1:
            a = a.reshape(-1, ch).mean(axis=1).astype(np.int16)
        if rate != sr:
            from .. import audio
            a = (np.clip(audio.resample(a.astype(np.float32) / 32768, rate, sr), -1, 1) * 32767).astype(np.int16)
        return a
    except Exception:  # noqa: BLE001
        return None


def _wav(a, sr: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(a.tobytes())
    return buf.getvalue()


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
        self.rtf = 4.0                                   # во сколько раз синтез дольше звучания (уточняется по ходу)
        # заготовки: фразы ответа, озвученные, пока модель ещё пишет остальное (ключ — фраза и её параметры)
        self._pre: dict[tuple, asyncio.Task] = {}
        self._synth_lock = asyncio.Lock()                # синтез по одной фразе за раз, в порядке текста

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

    def _plan(self, s: dict, text: str, emotion: str = "neutral"):
        from ..tts import prosody
        ha = s.get("haotica", {})
        lang = s.get("locale", {}).get("haotica_language", "")
        speed = float(ha.get("voice_speed", 1.0))
        mood = {"warning": "warning", "happy": "happy"}.get(emotion, "neutral")
        # вслух — начало ответа (до конца фразы), остальное в чате (настройка haotica.voice_max_chars)
        max_chars = int(ha.get("voice_max_chars", 600) or 600)
        return prosody.plan(text, lang if lang in ("ru", "en", "de") else "", speed, mood, max_chars=max(120, max_chars),
                            pause_scale=float(ha.get("voice_pause_scale", 0.35))), max(120, max_chars)

    @staticmethod
    def _key(seg) -> tuple:
        return (seg.text, seg.lang, round(seg.exaggeration, 3), round(seg.speed, 3), round(seg.cfg, 3), round(seg.temperature, 3))

    async def _synth_local(self, seg) -> bytes:
        async with self._synth_lock:
            return await self._local(seg.text, seg.lang, seg.exaggeration, seg.speed, seg.cfg, seg.temperature)

    def prefetch(self, text_so_far: str) -> None:
        """Модель ещё пишет ответ — озвучить уже законченные фразы заранее. Раньше синтез начинался только после
        всего текста, и после ответа была длинная пауза (синтез на процессоре в 2–3 раза дольше звучания)."""
        try:
            s = config.load()
            if not self.enabled(s) or s.get("haotica", {}).get("voice_backend", "local") not in ("local", "auto"):
                return
            from ..tts import prosody
            if not prosody.speakable(text_so_far):
                return
            plan, max_chars = self._plan(s, text_so_far)
            if len(text_so_far) > max_chars:
                return                                   # дальше — «остальное в чате», план у готового текста другой
            speech = [x for x in plan if x.kind == "speech"][:-1]   # последняя фраза ещё может дописываться
            for seg in speech[:6]:
                k = self._key(seg)
                if k not in self._pre:
                    self._pre[k] = asyncio.create_task(self._synth_local(seg))
        except Exception:  # noqa: BLE001 — заготовка не обязательна
            log.debug("prefetch", exc_info=True)

    def cancel_prefetch(self) -> None:
        for t in self._pre.values():
            t.cancel()
        self._pre.clear()

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
        await self.stop(keep_prefetch=True)               # новая реплика глушит старую (заготовки этого ответа — нет)
        gen = self.gen
        backend = s.get("haotica", {}).get("voice_backend", "local")
        ha = s.get("haotica", {})
        plan, _max = self._plan(s, text, emotion)
        speech = [i for i, x in enumerate(plan) if x.kind == "speech"]
        if not speech:
            self.cancel_prefetch()
            return False
        pre, self._pre = self._pre, {}                    # заготовки — этому ответу; лишние отменим в конце

        async def synth(seg) -> bytes:
            audio = b""
            if backend in ("local", "auto"):
                t = pre.pop(self._key(seg), None)
                if t is not None:
                    try:
                        audio = await t
                    except (asyncio.CancelledError, Exception):  # noqa: BLE001
                        audio = b""
                if not audio:
                    audio = await self._synth_local(seg)
            if not audio and backend in ("elevenlabs", "local", "auto"):
                audio = await self._eleven(seg.text, seg.lang, seg.exaggeration, seg.speed)
            return audio
        if ha.get("voice_flow", "continuous") != "fast":
            try:
                return await self._say_continuous(plan, synth, s, gen)
            finally:
                for t in pre.values():
                    t.cancel()
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

    async def _say_continuous(self, plan, synth, s: dict, gen: int) -> bool:
        """Речь без разрывов: фразы и паузы синтезируются по порядку и склеиваются; звук начинается, когда
        накопленного хватает, чтобы синтез оставшегося успел до конца звучания (скорость синтеза запоминается).
        Дальше всё, что готово, играется одним куском — между фразами нет пауз на ожидание синтеза."""
        import numpy as np
        SR = 24000
        q: asyncio.Queue = asyncio.Queue()
        stat = {"audio": 0.0, "synth": 0.0, "chars": 0, "ok": True}
        total_chars = sum(len(x.text) for x in plan if x.kind == "speech") or 1

        async def producer() -> None:
            first = True
            try:
                for seg in plan:
                    if gen != self.gen:
                        return
                    if seg.kind == "pause":
                        await q.put(np.zeros(int(SR * seg.ms / 1000), np.int16))
                        continue
                    if seg.kind == "sound":
                        f = voice_dir() / f"{seg.sound}.ogg"
                        if f.exists():
                            from .. import audio
                            arr = _pcm(await asyncio.to_thread(audio.to_wav, f, SR, seg.ms / 1000 if seg.ms else 0), SR)
                            if arr is not None:
                                await q.put(arr)
                        continue
                    t0 = time.monotonic()
                    data = await synth(seg)
                    arr = _pcm(data, SR) if data else None
                    if arr is None:
                        if first:                   # голоса Сары нет — молчим, а не говорим чужим голосом
                            stat["ok"] = False
                            return
                        continue
                    first = False
                    stat["synth"] += time.monotonic() - t0
                    stat["audio"] += len(arr) / SR
                    stat["chars"] += len(seg.text)
                    await q.put(arr)
            finally:
                await q.put(None)

        task = asyncio.create_task(producer())
        buf: list = []
        done = started = played = False
        try:
            while True:
                while not q.empty():
                    item = q.get_nowait()
                    if item is None:
                        done = True
                    else:
                        buf.append(item)
                if gen != self.gen:
                    return played
                if not buf and done:
                    break
                if not started and buf and not done:
                    rtf = stat["synth"] / stat["audio"] if stat["audio"] else self.rtf
                    per_char = stat["audio"] / stat["chars"] if stat["chars"] else 1 / 13
                    left = (total_chars - stat["chars"]) * per_char * rtf      # сколько ещё синтезировать, с
                    # запас на весь остаток — без разрывов; но не ждать больше 3 с звука: длинный ответ на CPU
                    # иначе молчал десятки секунд (синтез ~2× медленнее звучания), догоняем по ходу
                    if sum(len(a) for a in buf) / SR >= min(left * 1.1, START_LEAD_S):
                        started = True
                if (started or done) and buf:
                    data, buf = np.concatenate(buf), []
                    await self._play_bytes(_wav(data, SR), s, gen)
                    played = True
                    continue
                item = await q.get()
                if item is None:
                    done = True
                else:
                    buf.append(item)
        finally:
            task.cancel()
            if stat["audio"] > 1:
                self.rtf = 0.6 * self.rtf + 0.4 * (stat["synth"] / stat["audio"])   # помним скорость синтеза
        return played and stat["ok"]

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
        from .. import audio                              # OGG без ffmpeg (Windows): soundfile + numpy
        data = await asyncio.to_thread(audio.to_wav, f, 24000, max_s)
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

    async def stop(self, keep_prefetch: bool = False) -> None:
        """Заглушить речь сейчас же и отменить оставшиеся предложения."""
        self.gen += 1
        if not keep_prefetch:
            self.cancel_prefetch()
        if os.name == "nt" and self._win_playing:
            import winsound
            try:
                winsound.PlaySound(None, winsound.SND_PURGE)
            except RuntimeError:
                pass
        if self.playing and self.playing.returncode is None:
            self.playing.kill()
