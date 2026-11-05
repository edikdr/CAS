"""Движки синтеза речи для службы haotica-tts. Каждый: ready(), synth(text, lang, speed, exaggeration) → WAV.

Выбор — по слепому прослушиванию (samples/tts, tools/tts_samples/gen.py): haotica.tts_engine.
Голос Сары клонируется по образцу (assets/sounds/voice/ref_sarah_1.mp3) там, где модель это умеет.
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


def reference(sr: int = 24000, seconds: float = 11.5) -> str | None:
    """Образец голоса Сары → WAV нужной частоты (через ffmpeg, в кэш); свой образец пользователя — приоритетнее."""
    own = paths.DATA_DIR / "voice" / "sarah.wav"
    src = own if own.exists() else next((p for p in (paths.SHARE / "sounds/haotica-voice/ref_sarah_1.mp3",
                                                      paths.ASSETS / "sounds/voice/ref_sarah_1.mp3") if p.exists()), None)
    if not src:
        return None
    out = paths.CACHE_DIR / "voice" / f"sarah_{sr}.wav"
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(src), "-ac", "1", "-ar", str(sr), "-t", str(seconds),
                            str(out)], check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if r.returncode != 0:
            return None
    return str(out)


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
        self.m = ChatterboxMultilingualTTS.from_pretrained(device=_device())
        ref = reference(24000)
        if ref:
            self.m.prepare_conditionals(ref, exaggeration=0.5)

    def synth(self, text, lang, speed, exaggeration, cfg=0.5, temperature=0.8):
        # exaggeration — выразительность интонации; cfg_weight ниже — речь размереннее и чётче;
        # темп Chatterbox задаётся через cfg (быстрее — выше), без передискретизации
        cfg = max(0.25, min(0.75, cfg + (speed - 1.0) * 0.8))
        with self.torch.inference_mode():
            wav = self.m.generate(text, language_id=lang if lang in self.langs else "ru", exaggeration=exaggeration,
                                  cfg_weight=cfg, temperature=max(0.5, min(1.1, temperature)))
        return to_wav(wav.squeeze().cpu().numpy(), self.m.sr)


class XTTS(Engine):
    name = "xtts"
    clone = True

    def __init__(self) -> None:
        os.environ.setdefault("COQUI_TOS_AGREED", "1")
        from TTS.api import TTS
        self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(_device())
        self.ref = reference(22050)

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
        self.prompt = self.m.create_voice_clone_prompt(ref_audio=reference(24000), ref_text=REF_TEXT)

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
        self.ref = reference(24000)

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
# «везде голос Сары»: в авто-режиме — только клоны; Silero/Piper — лишь если выбраны явно
SARAH_ORDER = ["chatterbox", "xtts", "qwen3", "f5"]
