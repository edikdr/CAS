"""Объективная оценка образцов речи (дополнение к слепому прослушиванию, ТЗ W5).

    python tools/tts_samples/evaluate.py      → samples/tts/eval.json

Для каждого движка: разборчивость (Whisper распознаёт фразу → доля ошибок по символам, CER) и похожесть
на голос Сары (косинус эмбеддингов ECAPA с эталоном ref_sarah_1). Итог — взвешенный: русский важнее всего.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "core"))
from haotica.tts.normalize import normalize  # noqa: E402

OUT = ROOT / "samples/tts"
PHRASES = json.loads(Path(__file__).with_name("phrases.json").read_text(encoding="utf-8"))


def wav16(src: Path) -> str:
    out = Path(tempfile.gettempdir()) / f"ev_{src.parent.name}_{src.stem}.wav"
    subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(src), "-ac", "1", "-ar", "16000", str(out)], check=True)
    return str(out)


def norm(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t.lower().replace("ё", "е"))).strip()


def main() -> None:
    import jiwer
    import torch
    from faster_whisper import WhisperModel
    from speechbrain.inference.speaker import EncoderClassifier
    asr = WhisperModel("medium", device="cpu", compute_type="int8")
    enc = EncoderClassifier.from_hparams("speechbrain/spkrec-ecapa-voxceleb", savedir=str(Path(tempfile.gettempdir()) / "ecapa"))

    def emb(path: str):
        import soundfile as sf
        a, _sr = sf.read(path, dtype="float32")
        sig = torch.from_numpy(a).unsqueeze(0)
        with torch.no_grad():
            return torch.nn.functional.normalize(enc.encode_batch(sig).squeeze(), dim=0)
    ref = ROOT / "assets/sounds/voice/ref_sarah_1.mp3"
    e_ref = emb(wav16(ref))
    e_ref2 = emb(wav16(ROOT / "assets/sounds/voice/ref_sarah_2.mp3"))
    res = {"self_similarity": round(float(torch.dot(e_ref, e_ref2)), 3), "engines": {}}
    for d in sorted(p for p in OUT.iterdir() if p.is_dir()):
        rows, sims = [], []
        for p in PHRASES:
            f = d / f"{p['id']}.ogg"
            if not f.exists():
                continue
            w = wav16(f)
            segs, _info = asr.transcribe(w, language=p["lang"], beam_size=5)
            hyp = " ".join(s.text for s in segs)
            ref_text = normalize(p["text"], p["lang"])
            cer = jiwer.cer(norm(ref_text), norm(hyp)) if norm(hyp) else 1.0
            sim = float(torch.dot(emb(w), e_ref))
            sims.append(sim)
            rows.append({"id": p["id"], "lang": p["lang"], "cer": round(cer, 3), "sim": round(sim, 3), "heard": hyp.strip()})
            print(d.name, p["id"], round(cer, 3), round(sim, 3), flush=True)
        ru = [r["cer"] for r in rows if r["lang"] == "ru"]
        other = [r["cer"] for r in rows if r["lang"] != "ru"]
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8")) if (d / "meta.json").exists() else {}
        cer_ru = sum(ru) / max(1, len(ru))
        cer_other = sum(other) / max(1, len(other))
        sim = sum(sims) / max(1, len(sims))
        # итог: разборчивость русского 50 %, похожесть на Сару 35 %, английский/немецкий 15 %
        score = 0.5 * (1 - min(1, cer_ru)) + 0.35 * max(0, sim) / max(0.01, res["self_similarity"]) + 0.15 * (1 - min(1, cer_other))
        res["engines"][d.name] = {"label": meta.get("label", d.name), "clone": meta.get("clone"), "cer_ru": round(cer_ru, 3),
                                  "cer_en_de": round(cer_other, 3), "sarah_similarity": round(sim, 3),
                                  "score": round(score, 3), "rtf_cpu": round(sum(x["rtf"] for x in meta.get("phrases", [])) /
                                                                            max(1, len(meta.get("phrases", []))), 2), "rows": rows}
    (OUT / "eval.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, v in sorted(res["engines"].items(), key=lambda kv: -kv[1]["score"]):
        print(f"{k:11} score {v['score']:.3f}  CER ru {v['cer_ru']:.3f}  en/de {v['cer_en_de']:.3f}  Сара {v['sarah_similarity']:.3f}")


if __name__ == "__main__":
    main()
