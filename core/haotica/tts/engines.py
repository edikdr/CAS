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


def _fix_early_stop() -> None:
    """Chatterbox 0.1.7 обрывает речь на ДВУХ одинаковых речевых токенах подряд (протяжный звук, пауза) — посреди
    фразы, проверка «фраза закончена» у них закомментирована: из предложения звучали первые слова. Оставляем
    их проверки по выравниванию (хвост, повтор текста), а застреванием считаем только 10 одинаковых токенов подряд
    (0,4 с одного и того же звука)."""
    import torch
    from chatterbox.models.t3.inference import alignment_stream_analyzer as asa
    cls = asa.AlignmentStreamAnalyzer
    if getattr(cls, "_hy_patched", False):
        return
    orig = cls.step

    def step(self, logits, next_token=None):
        logits = orig(self, logits, None)          # без токена их счётчик повторов пуст и не срабатывает
        if next_token is not None:
            t = int(next_token.view(-1)[0].item()) if isinstance(next_token, torch.Tensor) else int(next_token)
            h = self.__dict__.setdefault("_hy_tokens", [])
            h.append(t)
            del h[:-12]
            if len(h) >= 10 and len(set(h[-10:])) == 1:
                log.warning("речь застряла на одном звуке — конец фразы")
                logits = -(2 ** 15) * torch.ones_like(logits)
                logits[..., self.eos_idx] = 2 ** 15
        return logits
    cls.step = step
    cls._hy_patched = True


def _fast_t3(tfmr) -> None:
    """Две потери скорости T3 (Chatterbox 0.1.7 + transformers 5):
    1. Анализатор выравнивания на КАЖДУЮ фразу вешает 3 перехватчика на слои внимания и не снимает их —
       за разговор их сотни, каждый токен речи вызывал их все, синтез замедлялся с каждой фразой.
    2. Ради весов внимания трёх голов он переключал ВСЕ 30 слоёв на медленное «eager»-внимание.
    Здесь: прошлые перехватчики снимаются, все слои считают быстрым sdpa, а три нужных слоя — sdpa плюс веса
    внимания отдельно (с той же причинной маской), их и читает анализатор."""
    import copy
    import torch
    from chatterbox.models.t3.inference import alignment_stream_analyzer as asa
    from chatterbox.models.t3.inference.t3_hf_backend import T3HuggingfaceBackend
    from transformers import AttentionInterface
    from transformers.integrations.sdpa_attention import sdpa_attention_forward
    from transformers.models.llama.modeling_llama import repeat_kv

    cls = asa.AlignmentStreamAnalyzer
    if getattr(cls, "_hy_fast", False):
        return

    def spy_attention(module, query, key, value, attention_mask, scaling=None, dropout=0.0, **kw):
        out, _ = sdpa_attention_forward(module, query, key, value, attention_mask, scaling=scaling,
                                        dropout=dropout, **kw)
        w = torch.matmul(query, repeat_kv(key, module.num_key_value_groups).transpose(2, 3)) * (
            scaling if scaling is not None else query.shape[-1] ** -0.5)
        q_len, k_len = w.shape[-2], w.shape[-1]
        if q_len > 1:                                     # первый проход: причинная маска, как у eager
            keep = torch.ones(q_len, k_len, dtype=torch.bool, device=w.device).tril(k_len - q_len)
            w = w.masked_fill(~keep, float("-inf"))
        return out, torch.softmax(w.float(), dim=-1)
    AttentionInterface.register("haotica_spy", spy_attention)

    spied = sorted({li for li, _ in asa.LLAMA_ALIGNED_HEADS})
    for li in spied:
        attn = tfmr.layers[li].self_attn
        c = copy.copy(attn.config)                        # своя копия настроек — только у этих трёх слоёв
        c._attn_implementation = "haotica_spy"
        attn.config = c
    handles: list = []

    orig_spy = cls._add_attention_spy

    def add_spy(self, tfmr_, buffer_idx, layer_idx, head_idx):
        layer = tfmr_.layers[layer_idx].self_attn
        before = set(layer._forward_hooks)
        orig_spy(self, tfmr_, buffer_idx, layer_idx, head_idx)
        handles.extend((layer, k) for k in set(layer._forward_hooks) - before)

    orig_init = cls.__init__

    def init(self, tfmr_, *a, **k):
        for layer, key in handles:                        # перехватчики прошлой фразы
            layer._forward_hooks.pop(key, None)
        handles.clear()
        orig_init(self, tfmr_, *a, **k)
        cfg = getattr(tfmr_, "config", None)
        if cfg is not None:                               # анализатор переключил всё на eager — вернуть sdpa
            cfg.output_attentions = False
            cfg._attn_implementation = "sdpa"

    orig_fwd = T3HuggingfaceBackend.forward

    def forward(self, inputs_embeds, past_key_values=None, use_cache=True, output_attentions=False,
                output_hidden_states=True, return_dict=True):
        # веса внимания всех слоёв не нужны: три нужных слоя отдают их сами
        return orig_fwd(self, inputs_embeds, past_key_values, use_cache, False, output_hidden_states, return_dict)

    cls._add_attention_spy = add_spy
    cls.__init__ = init
    T3HuggingfaceBackend.forward = forward
    cls._hy_fast = True


_VOWELS = "аеёиоуыэюяАЕЁИОУЫЭЮЯ"


def _russian_stress() -> bool:
    """Ударения для русского: Chatterbox ждёт их как знак U+0301 после гласной, а его модуль ударений
    (russian_text_stresser) не ставится из PyPI — без него «читал плохо». Берём расстановщик Silero
    (пакет silero-stress, ставится с голосом): его «+» перед ударной гласной превращаем в U+0301."""
    import re
    try:
        from silero_stress import load_accentor
        from chatterbox.models.tokenizers import tokenizer as tk
    except ImportError:
        return False
    acc = load_accentor()
    plus = re.compile(r"\+([" + _VOWELS + r"])")

    def add(text: str) -> str:
        try:
            out = acc(text)
        except Exception:  # noqa: BLE001 — не вышло — читаем без ударений, как раньше
            return text
        if not isinstance(out, str):
            return text
        return plus.sub(lambda m: m.group(1) + "\u0301", out)
    tk.add_russian_stress = add
    return True


class Chatterbox(Engine):
    name = "chatterbox"
    clone = True

    def __init__(self) -> None:
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        self.torch = torch
        dev = _device()
        if dev == "cpu":
            # 2/3 логических ядер (haotica.voice_threads): на всех 24 синтез быстрее лишь на ~10%, но пока Haotica
            # говорила — минуту и больше — процессор был занят целиком и окно с остальными программами дёргалось
            n = int(_setting("haotica.voice_threads", 0) or 0) or max(4, (os.cpu_count() or 8) * 2 // 3)
            torch.set_num_threads(max(1, min(n, os.cpu_count() or n)))
        self.m = ChatterboxMultilingualTTS.from_pretrained(device=dev)
        try:
            _fix_early_stop()
        except Exception as e:  # noqa: BLE001 — другая версия Chatterbox: работаем как есть
            log.warning("исправление обрыва речи не применено: %s", e)
        try:
            _fast_t3(self.m.t3.tfmr)
        except Exception as e:  # noqa: BLE001 — другая версия: работаем медленнее, но работаем
            log.warning("быстрое внимание T3 не подключено: %s", e)
        try:
            log.info("ударения в русском: %s", "silero-stress" if _russian_stress()
                     else "нет (переустановите голос: haotica voice install chatterbox)")
        except Exception as e:  # noqa: BLE001
            log.warning("ударения не подключены: %s", e)
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
        self.q = q
        self.turbo = False                    # декодер звука Turbo (2 шага) вместо обычного (6–10 шагов)
        self._pending = None                  # декодер Turbo докачался в фоне — подменить перед следующей фразой
        want = str(_setting("haotica.voice_decoder", "turbo")) == "turbo"
        s3 = self._turbo_decoder(download=False) if want else None
        if s3 is not None:
            self.m.s3gen, self.turbo = s3, True
        elif want:
            import threading                  # первый запуск после обновления: качаем ~1 ГБ, пока говорим по-старому
            threading.Thread(target=self._fetch_turbo, daemon=True, name="turbo-decoder").start()
        self._prepare()

    def _prepare(self) -> None:
        self.conds = {}                       # язык → условия клона: свой образец Сары на каждый язык
        for key in ("ru", "en"):
            ref = reference(24000, lang=key, pitch=self.pitch)
            if ref:
                self.m.prepare_conditionals(ref, exaggeration=0.5)
                self.conds[key] = self.m.conds
        self.voice_id = f"sarah-ru-en-p{self.pitch:+.2f}-{self.q}" + ("-turbo" if self.turbo else "")
        log.info("декодер звука: %s", "Turbo, 2 шага" if self.turbo else f"обычный, {self.steps} шагов")

    @staticmethod
    def _turbo_decoder(download: bool):
        """Декодер звука из Chatterbox Turbo (meanflow): те же речевые токены, 2 шага вместо 6 — на фразе
        ~1,5 с вместо ~7 с, сходство с образцом Сары не хуже (замер CAMPPlus: 0,86 против 0,83 по-русски)."""
        try:
            from chatterbox.models.s3gen import S3Gen
            from huggingface_hub import hf_hub_download
            from safetensors.torch import load_file
            path = hf_hub_download("ResembleAI/chatterbox-turbo", "s3gen_meanflow.safetensors",
                                   local_files_only=not download)
            s3 = S3Gen(meanflow=True)
            s3.load_state_dict(load_file(path), strict=True)
            return s3.to(_device()).eval()
        except Exception as e:  # noqa: BLE001 — нет файла или другая версия Chatterbox: обычный декодер
            if download:
                log.warning("декодер Turbo не загружен: %s", e)
            return None

    def _fetch_turbo(self) -> None:
        s3 = self._turbo_decoder(download=True)
        if s3 is not None:
            self._pending = s3

    def synth(self, text, lang, speed, exaggeration, cfg=0.5, temperature=0.8):
        if self._pending is not None:         # в потоке синтеза: между фразами, не посреди
            self.m.s3gen, self._pending, self.turbo = self._pending, None, True
            self._prepare()
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
            # предел длины по тексту: ~25 речевых токенов в секунду, ~13 знаков в секунду, двойной запас — модель
            # иногда «разговаривалась» и выдавала до 30 с звука на короткую фразу, занимая процессор
            cap = int(min(1000, 60 + len(text) * 5))
            st = m.t3.inference(t3_cond=cond, text_tokens=tt, max_new_tokens=cap,
                                temperature=max(0.5, min(1.1, temperature)), cfg_weight=cfg,
                                repetition_penalty=2.0, min_p=0.05, top_p=1.0)
            st = drop_invalid_tokens(st[0]).to(m.device)
            steps = self.steps
            if self.turbo:                    # как в Chatterbox Turbo: 3 токена тишины в конце — хвост не обрезается
                from chatterbox.models.s3gen.const import S3GEN_SIL
                st = torch.cat([st, torch.full((3,), S3GEN_SIL, dtype=st.dtype, device=st.device)])
                steps = 2
            wav, _ = m.s3gen.inference(speech_tokens=st, ref_dict=c.gen, n_cfm_timesteps=steps)
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
