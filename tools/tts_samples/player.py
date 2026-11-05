"""Страница слепого прослушивания образцов речи (ТЗ W5, T-50).

    python tools/tts_samples/player.py            → samples/tts/index.html (файлы рядом) и samples/tts/key.json
    python tools/tts_samples/player.py --embed X  → один HTML со встроенным звуком (для публикации)

Кандидаты получают буквы A…F в случайном порядке (зерно фиксировано, ключ — в key.json: не открывайте его
до выбора). На странице: образец голоса Сары, 12 фраз × все голоса, оценки 1–5 и итог для копирования.
"""
from __future__ import annotations

import argparse
import base64
import json
import random
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
import sys  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
OUT = ROOT / "samples/tts"
PHRASES = json.loads((Path(__file__).with_name("phrases.json")).read_text(encoding="utf-8"))
SEED = 20261105


def ref_ogg() -> Path:
    out = OUT / "ref_sarah.ogg"
    if not out.exists():
        subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-i", str(ROOT / "assets/sounds/voice/ref_sarah_1.mp3"), "-t", "12",
                        "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "40k", str(out)], check=True)
    return out


def build(embed: bool) -> str:
    engines = sorted(d.name for d in OUT.iterdir() if d.is_dir() and len(list(d.glob("*.ogg"))) >= len(PHRASES))
    rnd = random.Random(SEED)
    order = engines[:]
    rnd.shuffle(order)
    letters = "ABCDEFGH"[:len(order)]
    key = {letters[i]: order[i] for i in range(len(order))}
    (OUT / "key.json").write_text(json.dumps({"note": "Ключ слепого теста — не открывать до выбора", "key": key},
                                             ensure_ascii=False, indent=1), encoding="utf-8")

    def src(path: Path) -> str:
        if embed:
            return "data:audio/ogg;base64," + base64.b64encode(path.read_bytes()).decode()
        return path.relative_to(OUT).as_posix()
    audio = {L: {p["id"]: src(OUT / key[L] / f"{p['id']}.ogg") for p in PHRASES} for L in letters}
    data = {"letters": list(letters), "phrases": [{k: p[k] for k in ("id", "lang", "what", "text")} for p in PHRASES],
            "audio": audio, "ref": src(ref_ogg()), "demo": None, "eval": None, "tuning": None}
    demo = OUT / "demo_sarah.ogg"
    if demo.exists():
        from demo import TEXT  # noqa: PLC0415 — текст демо — из генератора
        data["demo"] = {"src": src(demo), "text": TEXT}
    tu = OUT / "voice_tuning.json"
    if tu.exists():
        data["tuning"] = json.loads(tu.read_text(encoding="utf-8"))
    ev = OUT / "eval.json"
    if ev.exists():
        e = json.loads(ev.read_text(encoding="utf-8"))
        inv = {v: k for k, v in key.items()}
        data["eval"] = {"self": e.get("self_similarity", 1.0), "rows": [
            {"letter": inv.get(name, "?"), "label": v["label"], "cer_ru": v["cer_ru"], "cer_en_de": v["cer_en_de"],
             "sim": v["sarah_similarity"], "score": v["score"]} for name, v in e["engines"].items() if name in inv]}
    tpl = Path(__file__).with_name("player.html").read_text(encoding="utf-8")
    return tpl.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False)).replace("{{N}}", str(len(letters)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--embed", default="")
    a = ap.parse_args()
    if a.embed:
        Path(a.embed).write_text(build(True), encoding="utf-8")
        print(a.embed)
    else:
        (OUT / "index.html").write_text("<!doctype html><meta charset=utf-8>\n" + build(False), encoding="utf-8")
        print(OUT / "index.html")


if __name__ == "__main__":
    main()
