"""Движки синтеза речи для службы haotica-tts. Каждый: ready(), synth(text, lang, speed, exaggeration) → WAV.

Выбор — по слепому прослушиванию (samples/tts, tools/tts_samples/gen.py): haotica.tts_engine.
Голос Сары клонируется по образцу там, где модель это умеет: для русского — русские реплики Сары
(assets/sounds/voice/ref_sarah_ru.ogg), для английского и немецкого — ref_sarah_1.mp3; тон — haotica.voice_pitch.
Устройство: GPU через PyTorch (ROCm/CUDA, `torch.cuda`), иначе CPU.
"""
from __future__ import annotations

import io
import logging
import os
import subprocess
import wave
from pathlib import Path

from .. import paths

log = logging.getLogger("haotica.tts")
LANG_NAME = {"ru": "Russian", "en": "English", "de": "German"}
PITCH_DEFAULT = 0.0           # образец без сдвига: ближе всего к Саре ElevenLabs (сходство голоса 0,86; −2,5 → 0,66)
REF_TEXT = ("You know, sometimes the hardest part is simply getting started. But once you take that first step, "
            "everything becomes much easier. Let's try it together.")


def to_wav(samples, sr: int, speed: float = 1.0) -> bytes:
    """PCM16 WAV: тишина по краям обрезается (паузы задаёт просодия), громкость выравнивается между кусками."""
    import numpy as np
    a = np.asarray(samples, dtype=np.float32).reshape(-1)
    if a.size:
        env = np.abs(a)
        idx = np.nonzero(env > 0.012)[0]
        if idx.size:
            pad = int(sr * 0.03)
            a = a[max(0, idx[0] - pad): min(a.size, idx[-1] + pad)]
        rms = float(np.sqrt(np.mean(a ** 2))) if a.size else 0.0
        if rms > 1e-4:
            a = a * min(4.0, 0.075 / rms)                # ~ −20 dBFS RMS, как у реплик Сары
        peak = float(np.max(np.abs(a))) if a.size else 0.0
        if peak > 0.97:
            a = a * (0.97 / peak)
    if abs(speed - 1.0) > 0.03 and a.size:            # темп без модели — простое передискретизирование (запасной путь)
        idx = np.arange(0, len(a), max(0.5, min(2.0, speed)))
        a = np.interp(idx, np.arange(len(a)), a).astype(np.float32)
    pcm = (np.clip(a, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


REF_FILES = {"ru": "ref_sarah_ru.ogg", "en": "ref_sarah_1.mp3"}   # русский образец — без английского акцента


def reference(sr: int = 24000, seconds: float = 12.5, lang: str = "en", pitch: float = 0.0) -> str | None:
    """Образец голоса Сары для языка → WAV нужной частоты (в кэш), с подъёмом тона на pitch полутонов.

    Порядок: свой образец пользователя (voice/sarah_ru.wav, voice/sarah.wav) → образец из поставки.
    Для русского — русские реплики Сары: клон по английскому образцу говорит по-русски с акцентом."""
    key = "ru" if lang == "ru" else "en"
    own = next((p for p in (paths.DATA_DIR / "voice" / f"sarah_{key}.wav", paths.DATA_DIR / "voice" / "sarah.wav")
                if p.exists()), None)
    name = REF_FILES[key]
    src = own or next((p for p in (paths.SHARE / "sounds/haotica-voice" / name, paths.ASSETS / "sounds/voice" / name)
                       if p.exists()), None)
    if not src and key == "ru":
        return reference(sr, seconds, "en", pitch)
    if not src:
        return None
    pitch = round(max(-3.0, min(3.0, float(pitch or 0))), 2)
    tag = f"{'own' if own else 'sarah'}_{key}_{sr}_p{pitch:+.2f}"
    out = paths.CACHE_DIR / "voice" / f"{tag}.wav"
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        return str(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    plain = out.with_suffix(".src.wav")
    if not _decode_ref(src, plain, sr, seconds):
        log.warning("образец голоса %s не прочитан — без него будет чужой голос", src)
        return None
    if abs(pitch) < 0.05:
        plain.replace(out)
        return str(out)
    try:                                              # тон выше без смены темпа (librosa есть у движков-клонов)
        import librosa
        import soundfile as sf
        y, _ = librosa.load(str(plain), sr=sr)
        sf.write(str(out), librosa.effects.pitch_shift(y, sr=sr, n_steps=pitch), sr)
    except Exception as e:  # noqa: BLE001 — запасной путь: ffmpeg (тон и форманты вместе)
        log.info("librosa недоступна (%s): тон через ffmpeg", e)
        if not util_which("ffmpeg"):
            plain.replace(out)                        # без librosa и ffmpeg — образец без сдвига тона
            return str(out)
        k = 2 ** (pitch / 12)
        r = subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(plain), "-af",
                            f"asetrate={sr * k:.0f},aresample={sr},atempo={1 / k:.5f}", str(out)], check=False,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if r.returncode != 0:
            plain.replace(out)
    plain.unlink(missing_ok=True)
    return str(out)


def util_which(name: str) -> bool:
    import shutil
    return bool(shutil.which(name))


def _decode_ref(src: Path, dst: Path, sr: int, seconds: float) -> bool:
    """Образец (OGG/MP3) → WAV моно sr: ffmpeg, если есть; иначе librosa (soxr, качественно) или soundfile+numpy.
    На Windows ffmpeg обычно нет — раньше из-за этого клон Сары молча становился чужим голосом."""
    if util_which("ffmpeg"):
        r = subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(src), "-ac", "1", "-ar", str(sr), "-t", str(seconds),
                            str(dst)], check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if r.returncode == 0 and dst.exists():
            return True
    try:
        import librosa
        import soundfile as sf
        y, _ = librosa.load(str(src), sr=sr, mono=True, duration=seconds)
        sf.write(str(dst), y, sr, subtype="PCM_16")
        return True
    except Exception as e:  # noqa: BLE001
        log.info("librosa не прочитала %s: %s", src.name, e)
    from .. import audio
    data = audio.to_wav(src, sr, seconds, fade_s=0)
    if data:
        dst.write_bytes(data)
        return True
    return False


def _setting(key: str, default):
    try:
        from .. import config
        return config.get(key, default)
    except Exception:  # noqa: BLE001
        return default


def voice_pitch() -> float:
    """haotica.voice_pitch — подъём тона Сары в полутонах (0 — как в образце)."""
    try:
        from .. import config
        return float(config.get("haotica.voice_pitch", PITCH_DEFAULT))
    except Exception:  # noqa: BLE001
        return PITCH_DEFAULT


def _device():
    import torch
    return "cuda" if torch.cuda.is_available() else "cpu"


class Engine:
    name = ""
    clone = False                   # говорит голосом Сары (клон по образцу)
    langs = ("ru", "en", "de")

    def ready(self) -> bool:
        return True

    def synth(self, text: str, lang: str, speed: float, exaggeration: float, cfg: float = 0.5,
              temperature: float = 0.8) -> bytes:  # pragma: no cover
        raise NotImplementedError


class Chatterbox(Engine):
    name = "chatterbox"
    clone = True

    def __init__(self) -> None:
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        self.torch = torch
        dev = _device()
        if dev == "cpu":                    # на процессоре — все логические ядра: замер на Ryzen AI Max — ~25% быстрее
            torch.set_num_threads(max(1, os.cpu_count() or 1))
        self.m = ChatterboxMultilingualTTS.from_pretrained(device=dev)
        self.pitch = voice_pitch()
        # качество/скорость на процессоре (haotica.voice_quality). Замер на Ryzen AI Max+ 392, 24 потока:
        #   best     — fp32, 10 шагов декодера: синтез ≈ 3,5× дольше звучания;
        #   balanced — T3 (токены речи) в bf16, 8 шагов: ≈ 2,6×, T3 в памяти вдвое меньше, звук почти не меняется;
        #   fast     — bf16, 6 шагов: ≈ 2,2×.
        q = _setting("haotica.voice_quality", "balanced")
        self.steps = {"best": 10, "balanced": 8, "fast": 6}.get(q, 8)
        self.dtype = torch.float32
        if dev == "cpu" and q in ("balanced", "fast"):
            self.m.t3.to(torch.bfloat16)
            self.dtype = torch.bfloat16
        self.conds = {}                       # язык → условия клона: свой образец Сары на каждый язык
        for key in ("ru", "en"):
            ref = reference(24000, lang=key, pitch=self.pitch)
            if ref:
                self.m.prepare_conditionals(ref, exaggeration=0.5)
                self.conds[key] = self.m.conds
        self.voice_id = f"sarah-ru-en-p{self.pitch:+.2f}-{q}"

    def synth(self, text, lang, speed, exaggeration, cfg=0.5, temperature=0.8):
        # exaggeration — выразительность интонации; cfg_weight ниже — речь размереннее и чётче;
        # темп Chatterbox задаётся через cfg (быстрее — выше), без передискретизации
        torch = self.torch
        import torch.nn.functional as F
        from chatterbox.models.s3tokenizer import drop_invalid_tokens
        from chatterbox.models.t3.modules.cond_enc import T3Cond
        from chatterbox.mtl_tts import punc_norm
        m = self.m
        c = self.conds.get("ru" if lang == "ru" else "en") or m.conds
        cfg = max(0.25, min(0.75, cfg + (speed - 1.0) * 0.8))
        # как ChatterboxMultilingualTTS.generate, но с типом T3 и числом шагов декодера из настроек
        cond = T3Cond(speaker_emb=c.t3.speaker_emb, cond_prompt_speech_tokens=c.t3.cond_prompt_speech_tokens,
                      emotion_adv=exaggeration * torch.ones(1, 1, 1)).to(device=m.device, dtype=self.dtype)
        tt = m.tokenizer.text_to_tokens(punc_norm(text), language_id=lang if lang in self.langs else "ru").to(m.device)
        tt = torch.cat([tt, tt], dim=0)                                     # две копии — для CFG
        tt = F.pad(F.pad(tt, (1, 0), value=m.t3.hp.start_text_token), (0, 1), value=m.t3.hp.stop_text_token)
        with torch.inference_mode():
            st = m.t3.inference(t3_cond=cond, text_tokens=tt, max_new_tokens=1000,
                                temperature=max(0.5, min(1.1, temperature)), cfg_weight=cfg,
                                repetition_penalty=2.0, min_p=0.05, top_p=1.0)
            st = drop_invalid_tokens(st[0]).to(m.device)
            wav, _ = m.s3gen.inference(speech_tokens=st, ref_dict=c.gen, n_cfm_timesteps=self.steps)
            wav = wav.squeeze(0).detach().float().cpu().numpy()
            wav = m.watermarker.apply_watermark(wav, sample_rate=m.sr)
        return to_wav(wav, m.sr)


class XTTS(Engine):
    name = "xtts"
    clone = True

    def __init__(self) -> None:
        os.environ.setdefault("COQUI_TOS_AGREED", "1")
        from TTS.api import TTS
        self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(_device())
        self.ref = reference(22050, pitch=voice_pitch())

    def synth(self, text, lang, speed, exaggeration, cfg=0.5, temperature=0.8):
        wav = self.tts.tts(text=text, speaker_wav=self.ref, language=lang, speed=max(0.7, min(1.4, speed)),
                           temperature=max(0.3, min(1.0, 0.55 + (exaggeration - 0.5) * 0.6 + (temperature - 0.8) * 0.5)),
                           enable_text_splitting=False)
        return to_wav(wav, 24000)


class Qwen3(Engine):
    name = "qwen3"
    clone = True

    def __init__(self) -> None:
        import torch
        from qwen_tts import Qwen3TTSModel
        self.torch = torch
        dev = _device()
        self.m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map=dev,
                                               dtype=torch.bfloat16 if dev == "cuda" else torch.float32)
        self.prompt = self.m.create_voice_clone_prompt(ref_audio=reference(24000, pitch=voice_pitch()), ref_text=REF_TEXT)

    def synth(self, text, lang, speed, exaggeration, cfg=0.5, temperature=0.8):
        with self.torch.inference_mode():
            wavs, sr = self.m.generate_voice_clone(text=text, language=LANG_NAME.get(lang, "Russian"),
                                                   voice_clone_prompt=self.prompt,
                                                   temperature=max(0.5, min(1.1, temperature + (exaggeration - 0.5) * 0.4)))
        return to_wav(wavs[0], sr, speed)


class F5(Engine):
    name = "f5"
    clone = True

    def __init__(self) -> None:
        from f5_tts.api import F5TTS
        from huggingface_hub import hf_hub_download
        repo = "Misha24-10/F5-TTS_RUSSIAN"
        ckpt = hf_hub_download(repo, "F5TTS_v1_Base_v4_winter/model_212000.safetensors")
        vocab = hf_hub_download(repo, "F5TTS_v1_Base/vocab.txt")
        self.m = F5TTS(model="F5TTS_v1_Base", ckpt_file=ckpt, vocab_file=vocab, device=_device())
        self.ref = reference(24000, pitch=voice_pitch())

    def synth(self, text, lang, speed, exaggeration, cfg=0.5, temperature=0.8):
        wav, sr, _ = self.m.infer(ref_file=self.ref, ref_text=REF_TEXT, gen_text=text, nfe_step=32, speed=speed,
                                  cfg_strength=1.6 + exaggeration * 1.4, remove_silence=False)
        return to_wav(wav, sr)


class Silero(Engine):
    name = "silero"
    MODELS = {"ru": ("v5_ru.pt", "xenia"), "en": ("v3_en.pt", "en_21"), "de": ("v3_de.pt", "eva_k")}

    def __init__(self) -> None:
        import torch
        self.torch, self.m = torch, {}
        self.dir = Path(os.environ.get("HAOTICA_VOICES", str(paths.OPT / "voices"))) / "silero"

    def _model(self, lang):
        if lang not in self.m:
            fn, spk = self.MODELS.get(lang, self.MODELS["ru"])
            p = self.dir / fn
            if not p.exists():
                self.dir.mkdir(parents=True, exist_ok=True)
                self.torch.hub.download_url_to_file(f"https://models.silero.ai/models/tts/{lang}/{fn}", str(p))
            self.m[lang] = (self.torch.package.PackageImporter(str(p)).load_pickle("tts_models", "model"), spk)
        return self.m[lang]

    def synth(self, text, lang, speed, exaggeration, cfg=0.5, temperature=0.8):
        model, spk = self._model(lang if lang in self.MODELS else "ru")
        kw = {"put_accent": True, "put_yo": True} if lang == "ru" else {}
        return to_wav(model.apply_tts(text=text, speaker=spk, sample_rate=48000, **kw).numpy(), 48000, speed)


class Piper(Engine):
    name = "piper"
    VOICES = {"ru": "ru_RU-irina-medium", "en": "en_US-amy-medium", "de": "de_DE-thorsten-medium"}

    def __init__(self) -> None:
        from piper import PiperVoice  # noqa: F401 — проверка, что пакет есть
        self.dir = Path(os.environ.get("HAOTICA_VOICES", str(paths.OPT / "voices")))
        self.v: dict = {}

    def ready(self) -> bool:
        return any((self.dir / f"{v}.onnx").exists() for v in self.VOICES.values())

    def synth(self, text, lang, speed, exaggeration, cfg=0.5, temperature=0.8):
        from piper import PiperVoice, SynthesisConfig
        name = self.VOICES.get(lang, self.VOICES["ru"])
        if not (self.dir / f"{name}.onnx").exists():
            name = next(v for v in self.VOICES.values() if (self.dir / f"{v}.onnx").exists())
        if name not in self.v:
            self.v[name] = PiperVoice.load(str(self.dir / f"{name}.onnx"))
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            self.v[name].synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, speed))))
        return buf.getvalue()


ENGINES = {e.name: e for e in (Chatterbox, XTTS, Qwen3, F5, Silero, Piper)}
# «везде голос Сары»: в авто-режиме — только клоны; Silero/Piper — лишь если выбраны явно.
# Порядок — по samples/tts/eval.json (разборчивость русского + похожесть на Сару) и управляемости интонацией:
# Chatterbox ≈ Qwen3 по оценке, но только у Chatterbox есть отдельные выразительность и размеренность.
SARAH_ORDER = ["chatterbox", "qwen3", "f5", "xtts"]
