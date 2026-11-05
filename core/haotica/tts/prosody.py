"""Просодия голоса Сары: как Haotica *говорит* то, что написала — паузы, интонация, темп, эмоции.

plan(text) превращает ответ в последовательность сегментов:
  speech — фраза с параметрами синтеза: exaggeration (выразительность, 0.25–0.9), cfg (у Chatterbox: ниже —
           размереннее и чётче), speed (темп), temperature (живость);
  pause  — тишина нужной длины (между предложениями, абзацами, после «…», по метке [пауза]);
  sound  — записанная эмоция Сары (assets/sounds/voice/emo_*.ogg): *смеётся*, *вздыхает*, *хмыкает*…
Правила — по пунктуации и смыслу: вопрос, восклицание, предупреждение, шутка, перечисление, длина фразы.
Код, ссылки, таблицы и разметка не читаются (код — короткой фразой «команда — в блоке кода»).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .normalize import detect_lang


@dataclass
class Segment:
    kind: str                       # speech | pause | sound
    text: str = ""
    lang: str = "ru"
    ms: int = 0
    sound: str = ""
    exaggeration: float = 0.5
    cfg: float = 0.5
    speed: float = 1.0
    temperature: float = 0.8
    tags: list[str] = field(default_factory=list)


# эмоции Сары: метка в тексте → готовая запись
SOUNDS = [
    (r"\*?\(?\b(смеётся|смеется|смех|ржёт|ржет|хохочет|laughs?)\b\)?\*?", "emo_laugh"),
    (r"\*?\(?\b(хихикает|хихик|giggles?)\b\)?\*?", "emo_giggle"),
    (r"\*?\(?\b(вздыхает|вздох|sighs?)\b\)?\*?", "emo_sigh"),
    (r"\*?\(?\b(хмыкает|хмм+|hmm+)\b\)?\*?", "emo_hmm"),
    (r"\*?\(?\b(ахает|ах!|gasps?)\b\)?\*?", "emo_gasp"),
    (r"\*?\(?\b(стонет|groans?)\b\)?\*?", "emo_groan"),
    (r"\*?\(?\b(тсс+|psst)\b\)?\*?", "emo_psst"),
]
CUE_RX = re.compile(r"\*(?P<a>[^*\n]{2,30})\*|\[(?P<b>[^\]\n]{2,30})\]|\((?P<c>(?:смеётся|смеется|вздыхает|хихикает|хмыкает|ахает|пауза)[^)\n]{0,12})\)",
                    re.I)
WARN_RX = re.compile(r"(?i)\b(осторожно|внимание|опасн\w*|удал\w*|без возврата|ошибк\w*|сломал\w*|не получилось|"
                     r"warning|danger|careful|achtung|vorsicht|fehler)\b")
JOKE_RX = re.compile(r"(?i)(шучу|ха-?ха|хех|лол|😄|😂|😉|😏|\bjk\b|kidding)")
SOFT_RX = re.compile(r"(?i)\b(извини|прости|жаль|к сожалению|sorry|leider)\b")
EMOJI_RX = re.compile("[\U0001F300-\U0001FAFF☀-➿️]")


def for_speech(text: str) -> str:
    """Убрать то, что вслух не читают: код, ссылки, таблицы, разметку, эмодзи."""
    t = text or ""
    blocks = len(re.findall(r"```", t)) // 2
    t = re.sub(r"```[\s\S]*?(```|$)", "\n\n§CODE§\n\n", t)
    t = re.sub(r"`([^`\n]{1,24})`", r"\1", t)                         # короткий код — читаем как слово
    t = re.sub(r"`[^`\n]+`", "это", t)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"\[([^\]]+)\]\((?:https?|file)://[^)]+\)", r"\1", t)
    t = re.sub(r"https?://\S+", "ссылка", t)
    t = re.sub(r"(?m)^\s*\|.*\|\s*$", "", t)                           # таблицы
    t = re.sub(r"(?m)^\s*#{1,6}\s*(.+)$", r"\1.", t)                     # заголовок → фраза
    t = re.sub(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+", "§ITEM§", t)            # пункты списка
    t = re.sub(r"\*\*([^*\n]+)\*\*|__([^_\n]+)__", lambda m: m.group(1) or m.group(2), t)
    t = EMOJI_RX.sub("", t)
    if blocks:
        first = True
        while "§CODE§" in t:
            t = t.replace("§CODE§", "Команда — в блоке кода." if first else "", 1)
            first = False
    return t


def _cue(seg_text: str) -> tuple[str, str]:
    """Метка эмоции/паузы → ('sound', имя) | ('pause', мс) | ('', '')."""
    s = seg_text.strip().lower()
    if re.fullmatch(r"пауза|pause|\.\.\.|…", s):
        return "pause", "700"
    if re.fullmatch(r"(долгая|длинная) пауза|long pause", s):
        return "pause", "1200"
    for rx, name in SOUNDS:
        if re.fullmatch(rx, s, re.I) or re.search(rx, s, re.I):
            return "sound", name
    return "", ""


def _sentences(par: str) -> list[str]:
    parts = re.split(r"(?<=[.!?…])\s+(?=[«\"(A-ZА-ЯЁ0-9§])", par.strip())
    return [p.strip() for p in parts if p.strip()]


def _clauses(sent: str, limit: int = 150) -> list[tuple[str, int]]:
    """Длинное предложение → части по запятым/точкам с запятой/тире, с короткими паузами между ними."""
    if len(sent) <= limit:
        return [(sent, 0)]
    out, cur = [], ""
    for piece in re.split(r"(?<=[,;:])\s+|\s+(?=—\s)", sent):
        if cur and len(cur) + len(piece) > limit * 0.7:
            out.append((cur.strip(), 170 if cur.rstrip().endswith((",", ";")) else 220))
            cur = piece
        else:
            cur = f"{cur} {piece}" if cur else piece
    if cur:
        out.append((cur.strip(), 0))
    return out


def _voice(sent: str, base_speed: float, mood: str, lang: str) -> Segment:
    words = len(sent.split())
    exag, cfg, speed, temp, tags = 0.5, 0.5, 1.0, 0.8, []
    if sent.endswith("?"):
        exag += 0.05
        tags.append("question")
    if sent.endswith("!") or sent.count("!") >= 1:
        exag += 0.18
        speed *= 1.04
        tags.append("exclaim")
    if WARN_RX.search(sent):
        exag, cfg, speed = max(exag, 0.6), 0.38, speed * 0.93      # серьёзно, чётко, медленнее
        tags.append("warning")
    if JOKE_RX.search(sent):
        exag += 0.15
        temp = 0.9
        tags.append("joke")
    if SOFT_RX.search(sent):
        exag, speed = min(exag, 0.4), speed * 0.95
        tags.append("soft")
    if sent.endswith(("…", "...")):
        speed *= 0.94
        exag = min(exag, 0.45)
        tags.append("trail")
    if words <= 3:
        speed *= 0.95                                               # короткие реплики — с весом
    elif words >= 26:
        speed *= 1.05                                               # длинные — плавно, не растягивая
    if mood == "warning":
        exag, cfg = max(exag, 0.55), min(cfg, 0.42)
    elif mood == "happy":
        exag += 0.1
    return Segment("speech", sent, lang, exaggeration=round(min(0.9, max(0.25, exag)), 2), cfg=round(cfg, 2),
                   speed=round(max(0.8, min(1.25, speed * base_speed)), 3), temperature=temp, tags=tags)


def plan(text: str, lang: str = "", base_speed: float = 1.0, mood: str = "neutral", max_chars: int = 900) -> list[Segment]:
    t = for_speech(text)
    if len(t) > max_chars:                                          # длинный ответ: читаем начало до конца фразы
        cut = max(t.rfind(". ", 0, max_chars), t.rfind("! ", 0, max_chars), t.rfind("? ", 0, max_chars))
        t = t[: cut + 1 if cut > 200 else max_chars] + " Остальное — в чате."
    segs: list[Segment] = []
    pars = [p for p in re.split(r"\n\s*\n", t) if p.strip()]
    for pi, par in enumerate(pars):
        lines = [ln.strip() for ln in par.split("\n") if ln.strip()]
        for line in lines:
            item = line.startswith("§ITEM§")
            line = line.replace("§ITEM§", "").strip()
            if not line:
                continue
            pos = 0
            for m in CUE_RX.finditer(line):                           # метки эмоций и пауз внутри строки
                kind, val = _cue(m.group("a") or m.group("b") or m.group("c") or "")
                if not kind:
                    continue
                _add_text(segs, line[pos:m.start()], lang, base_speed, mood, item)
                if kind == "pause":
                    segs.append(Segment("pause", ms=int(val)))
                else:
                    segs.append(Segment("pause", ms=120))
                    segs.append(Segment("sound", sound=val))
                    segs.append(Segment("pause", ms=160))
                pos = m.end()
            _add_text(segs, line[pos:], lang, base_speed, mood, item)
            if item:
                segs.append(Segment("pause", ms=260))
        if pi < len(pars) - 1:
            segs.append(Segment("pause", ms=560))
    # склеить соседние паузы, убрать паузы по краям
    out: list[Segment] = []
    for s in segs:
        if s.kind == "pause" and out and out[-1].kind == "pause":
            out[-1].ms = max(out[-1].ms, s.ms)
        elif not (s.kind == "pause" and not out):
            out.append(s)
    while out and out[-1].kind == "pause":
        out.pop()
    return out


def _add_text(segs: list[Segment], chunk: str, lang: str, base_speed: float, mood: str, item: bool) -> None:
    chunk = re.sub(r"\s+", " ", chunk).strip(" *_")
    if not re.search(r"[\wА-Яа-яЁё]", chunk):
        return
    for sent in _sentences(chunk):
        sl = lang or detect_lang(sent)
        for part, gap in _clauses(sent):
            seg = _voice(part, base_speed, mood, sl)
            if item:
                seg.tags.append("item")
            segs.append(seg)
            if gap:
                segs.append(Segment("pause", ms=gap))
        end = sent[-1:]
        segs.append(Segment("pause", ms={"?": 360, "!": 320, "…": 650, ".": 330, ":": 260}.get(end, 280)
                            if not sent.endswith("...") else 650))


def speakable(text: str) -> bool:
    return bool(re.search(r"[\wА-Яа-яЁё]{2,}", for_speech(text).replace("Команда — в блоке кода.", "")))
