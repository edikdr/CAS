"""Пакет образцов для слепого выбора модели речи (ТЗ W5, T-50).

Запуск — в отдельном окружении каждого движка (зависимости движков несовместимы между собой):
    python tools/tts_samples/gen.py --engine xtts --out samples/tts
Пишет samples/tts/<engine>/<id>.ogg (Opus 48 кГц) и meta.json (время синтеза, RTF, устройство).
Текст проходит ту же нормализацию, что и в службе haotica-tts (core/haotica/tts/normalize.py).
Голос Сары клонируется по assets/sounds/voice/ref_sarah_1.mp3 там, где движок это умеет.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "core"))
from haotica.tts.normalize import normalize  # noqa: E402

REF_MP3 = ROOT / "assets/sounds/voice/ref_sarah_1.mp3"
REF_TEXT_FILE = Path(__file__).with_name("ref_sarah_1.txt")   # расшифровка образца (для F5/Qwen)
LANG_NAME = {"ru": "Russian", "en": "English", "de": "German"}


def ref_wav(sr: int = 24000, seconds: float = 12.5) -> str:
    out = Path(tempfile.gettempdir()) / f"haotica_ref_{sr}.wav"
    if not out.exists():
        subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(REF_MP3), "-ac", "1", "-ar", str(sr),
                        "-t", str(seconds), str(out)], check=True)
    return str(out)


def ref_text() -> str:
    return REF_TEXT_FILE.read_text(encoding="utf-8").strip() if REF_TEXT_FILE.exists() else ""


def save_wav(path: Path, samples, sr: int) -> None:
    import numpy as np
    a = np.asarray(samples, dtype=np.float32).reshape(-1)
    pcm = (np.clip(a, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())


def wav_seconds(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


# ── движки: init() → объект с synth(text, lang, wav_path) ──────────────────
class Piper:
    label, clone = "Piper (medium)", False
    VOICES = {"ru": "ru/ru_RU/irina/medium/ru_RU-irina-medium", "en": "en/en_US/amy/medium/en_US-amy-medium",
              "de": "de/de_DE/thorsten/medium/de_DE-thorsten-medium"}

    def __init__(self) -> None:
        from huggingface_hub import hf_hub_download
        from piper import PiperVoice
        self.v = {}
        for lang, rel in self.VOICES.items():
            onnx = hf_hub_download("rhasspy/piper-voices", rel + ".onnx")
            hf_hub_download("rhasspy/piper-voices", rel + ".onnx.json")
            self.v[lang] = PiperVoice.load(onnx)

    def synth(self, text, lang, out):
        with wave.open(str(out), "wb") as w:
            self.v[lang].synthesize_wav(text, w)


class Silero:
    label, clone = "Silero v5 (ru) / v3 (en, de)", False
    MODELS = {"ru": ("v5_ru.pt", "xenia"), "en": ("v3_en.pt", "en_21"), "de": ("v3_de.pt", "eva_k")}

    def __init__(self) -> None:
        import torch
        self.torch = torch
        torch.set_num_threads(os.cpu_count() or 4)
        cache = Path.home() / ".cache/silero"
        cache.mkdir(parents=True, exist_ok=True)
        self.m = {}
        for lang, (fn, spk) in self.MODELS.items():
            p = cache / fn
            if not p.exists():
                torch.hub.download_url_to_file(f"https://models.silero.ai/models/tts/{lang}/{fn}", str(p))
            imp = torch.package.PackageImporter(str(p))
            self.m[lang] = (imp.load_pickle("tts_models", "model"), spk)

    def synth(self, text, lang, out):
        model, spk = self.m[lang]
        kw = {"put_accent": True, "put_yo": True} if lang == "ru" else {}
        audio = model.apply_tts(text=text, speaker=spk, sample_rate=48000, **kw)
        save_wav(out, audio.numpy(), 48000)


class XTTS:
    label, clone = "XTTS-v2 (клон Сары)", True

    def __init__(self) -> None:
        os.environ.setdefault("COQUI_TOS_AGREED", "1")
        from TTS.api import TTS
        self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        self.ref = ref_wav(22050)

    def synth(self, text, lang, out):
        self.tts.tts_to_file(text=text, speaker_wav=self.ref, language=lang, file_path=str(out))


class Chatterbox:
    label, clone = "Chatterbox Multilingual (клон Сары)", True

    def __init__(self) -> None:
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        self.torch = torch
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        self.m = ChatterboxMultilingualTTS.from_pretrained(device=dev)
        self.m.prepare_conditionals(ref_wav(24000), exaggeration=0.5)

    def synth(self, text, lang, out):
        with self.torch.inference_mode():
            wav = self.m.generate(text, language_id=lang, exaggeration=0.5, cfg_weight=0.5)
        save_wav(out, wav.squeeze().cpu().numpy(), self.m.sr)


class F5:
    label, clone = "F5-TTS (русское дообучение, клон Сары)", True
    REPO, CKPT = "Misha24-10/F5-TTS_RUSSIAN", "F5TTS_v1_Base_v4_winter/model_212000.safetensors"

    def __init__(self) -> None:
        from f5_tts.api import F5TTS
        from huggingface_hub import hf_hub_download
        ckpt = hf_hub_download(self.REPO, self.CKPT)
        vocab = hf_hub_download(self.REPO, "F5TTS_v1_Base/vocab.txt")
        self.m = F5TTS(model="F5TTS_v1_Base", ckpt_file=ckpt, vocab_file=vocab)
        self.ref, self.rt = ref_wav(24000, 11.5), ref_text()

    def synth(self, text, lang, out):
        self.m.infer(ref_file=self.ref, ref_text=self.rt, gen_text=text, file_wave=str(out), nfe_step=32,
                     remove_silence=False, seed=7)


class Qwen3:
    label, clone = "Qwen3-TTS 1.7B (клон Сары)", True

    def __init__(self) -> None:
        import torch
        from qwen_tts import Qwen3TTSModel
        self.torch = torch
        self.m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cpu",
                                               dtype=torch.float32)
        self.prompt = self.m.create_voice_clone_prompt(ref_audio=ref_wav(24000, 11.5), ref_text=ref_text())

    def synth(self, text, lang, out):
        with self.torch.inference_mode():
            wavs, sr = self.m.generate_voice_clone(text=text, language=LANG_NAME[lang],
                                                   voice_clone_prompt=self.prompt)
        save_wav(out, wavs[0], sr)


ENGINES = {"piper": Piper, "silero": Silero, "xtts": XTTS, "chatterbox": Chatterbox, "f5": F5, "qwen3": Qwen3}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True, choices=ENGINES)
    ap.add_argument("--out", default=str(ROOT / "samples/tts"))
    ap.add_argument("--only", default="", help="через запятую: id фраз")
    a = ap.parse_args()
    phrases = json.loads(Path(__file__).with_name("phrases.json").read_text(encoding="utf-8"))
    if a.only:
        phrases = [p for p in phrases if p["id"] in a.only.split(",")]
    out = Path(a.out) / a.engine
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    eng = ENGINES[a.engine]()
    meta = {"engine": a.engine, "label": eng.label, "clone": eng.clone, "load_s": round(time.time() - t0, 1),
            "device": "cpu", "cpu": platform.processor() or platform.machine(), "threads": os.cpu_count(),
            "phrases": []}
    try:
        import torch
        meta["device"] = "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        pass
    for p in phrases:
        text = normalize(p["text"], p["lang"])
        wav = Path(tempfile.gettempdir()) / f"tts_{a.engine}_{p['id']}.wav"
        t = time.time()
        eng.synth(text, p["lang"], wav)
        dt = time.time() - t
        dur = wav_seconds(wav)
        subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(wav), "-af", "loudnorm=I=-20:TP=-2",
                        "-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "40k", str(out / f"{p['id']}.ogg")],
                       check=True)
        meta["phrases"].append({"id": p["id"], "synth_s": round(dt, 2), "audio_s": round(dur, 2),
                                "rtf": round(dt / max(dur, 0.01), 2), "text": text})
        print(f"{a.engine} {p['id']} {dt:.1f}s / {dur:.1f}s", flush=True)
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
