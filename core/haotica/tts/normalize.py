"""Нормализация текста перед синтезом речи: числа, время, даты, единицы, сокращения.

Без внешних зависимостей работает частично (сокращения, единицы); с пакетом `num2words`
читает числа словами (ru/en/de). Латиница в русском тексте не трогается — современные
модели читают её лучше любой транслитерации. Разбивка на предложения — для потоковой выдачи.
"""
from __future__ import annotations

import re

try:
    from num2words import num2words as _n2w
except ImportError:  # pragma: no cover — без пакета числа остаются цифрами
    _n2w = None

RU_MONTHS = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября",
             "октября", "ноября", "декабря")
RU_ABBR = [
    (r"\bт\.\s?е\.", "то есть"), (r"\bт\.\s?к\.", "так как"), (r"\bи\s+т\.\s?д\.", "и так далее"),
    (r"\bи\s+т\.\s?п\.", "и тому подобное"), (r"\bт\.\s?н\.", "так называемый"), (r"\bнапр\.", "например"),
    (r"\bсм\.", "смотри"), (r"\bок\.", "около"), (r"\bг\.(?=\s|$)", "год"),
]
# единица → (1, 2–4, 5+) — согласование с числом
RU_UNITS = {
    "ГБ": ("гигабайт", "гигабайта", "гигабайт"), "МБ": ("мегабайт", "мегабайта", "мегабайт"),
    "КБ": ("килобайт", "килобайта", "килобайт"), "ТБ": ("терабайт", "терабайта", "терабайт"),
    "ГиБ": ("гибибайт", "гибибайта", "гибибайт"), "%": ("процент", "процента", "процентов"),
    "мс": ("миллисекунда", "миллисекунды", "миллисекунд"), "сек": ("секунда", "секунды", "секунд"),
    "мин": ("минута", "минуты", "минут"), "ч": ("час", "часа", "часов"), "°C": ("градус", "градуса", "градусов"),
    "°": ("градус", "градуса", "градусов"), "км": ("километр", "километра", "километров"),
    "МГц": ("мегагерц", "мегагерца", "мегагерц"), "ГГц": ("гигагерц", "гигагерца", "гигагерц"),
    "Вт": ("ватт", "ватта", "ватт"), "€": ("евро", "евро", "евро"), "$": ("доллар", "доллара", "долларов"),
}
RU_FEMININE = {"минута", "секунда", "миллисекунда", "ошибка", "строка", "вкладка", "папка", "команда",
               "тысяча", "неделя", "задача", "модель", "минуты", "секунды", "ошибки", "строки", "вкладки",
               "папки", "команды", "недели", "задачи", "модели", "копейка", "копейки"}
EN_UNITS = {"GB": "gigabytes", "MB": "megabytes", "KB": "kilobytes", "TB": "terabytes", "%": "percent",
            "ms": "milliseconds"}
DE_UNITS = {"GB": "Gigabyte", "MB": "Megabyte", "KB": "Kilobyte", "TB": "Terabyte", "%": "Prozent",
            "€": "Euro", "°C": "Grad"}


def plural_ru(n: int, forms: tuple[str, str, str]) -> str:
    n = abs(n) % 100
    if 11 <= n <= 14:
        return forms[2]
    n %= 10
    return forms[0] if n == 1 else forms[1] if 2 <= n <= 4 else forms[2]


def _words(n: int, lang: str, to: str = "cardinal") -> str:
    if _n2w is None:
        return str(n)
    try:
        return _n2w(n, lang=lang, to=to)
    except (NotImplementedError, OverflowError, ValueError):
        return str(n)


def _ru_fem(words: str) -> str:
    """«один/два» → «одна/две» в последнем слове числа (для существительных женского рода)."""
    parts = words.split()
    if parts and parts[-1] == "один":
        parts[-1] = "одна"
    elif parts and parts[-1] == "два":
        parts[-1] = "две"
    return " ".join(parts)


def _ord_ru(n: int, form: str) -> str:
    """Порядковое: form = 'n' (средний род, «пятое»), 'g' (родительный, «пятого»)."""
    w = _words(n, "ru", "ordinal")
    if w.isdigit():
        return w
    parts = w.split()
    last = parts[-1]
    if form == "n":
        last = re.sub(r"(ый|ой)$", "ое", last)
        last = re.sub(r"ий$", "ье" if last.endswith("тий") else "ее", last)
    else:
        last = re.sub(r"(ый|ой)$", "ого", last)
        last = re.sub(r"ий$", "ьего" if last.endswith("тий") else "его", last)
    parts[-1] = last
    return " ".join(parts)


def _ru(text: str) -> str:
    for rx, rep in RU_ABBR:
        text = re.sub(rx, rep, text, flags=re.IGNORECASE)
    # даты: «5 ноября 2026 года» / «5 ноября»
    months = "|".join(RU_MONTHS)
    text = re.sub(rf"\b(\d{{1,2}})\s+({months})(?:\s+(\d{{4}})\s+(года|г\.?))?",
                  lambda m: f"{_ord_ru(int(m[1]), 'n')} {m[2]}" + (f" {_ord_ru(int(m[3]), 'g')} года" if m[3] else ""),
                  text)
    # время 14:30
    text = re.sub(r"\b([01]?\d|2[0-3]):([0-5]\d)\b",
                  lambda m: f"{_words(int(m[1]), 'ru')} " + ("ноль ноль" if m[2] == "00" else
                                                              ("ноль " + _words(int(m[2]), 'ru')) if m[2][0] == "0"
                                                              else _words(int(m[2]), 'ru')), text)
    # число + единица
    units = "|".join(re.escape(u) for u in sorted(RU_UNITS, key=len, reverse=True))

    def unit(m: re.Match) -> str:
        n = int(m[1])
        forms = RU_UNITS[m[2]]
        word = plural_ru(n, forms)
        w = _words(n, "ru")
        return f"{_ru_fem(w) if forms[0] in RU_FEMININE else w} {word}"
    text = re.sub(rf"(\d+)\s?({units})(?![\wА-Яа-я])", unit, text)
    # число + существительное женского рода
    text = re.sub(r"\b(\d+)\s+([А-Яа-яё]+)", lambda m: (_ru_fem(_words(int(m[1]), "ru"))
                                                       if m[2].lower() in RU_FEMININE else _words(int(m[1]), "ru"))
                  + " " + m[2], text)
    text = re.sub(r"\b\d+\b", lambda m: _words(int(m[0]), "ru"), text)
    return text


def _simple(text: str, lang: str, units: dict[str, str]) -> str:
    keys = "|".join(re.escape(u) for u in sorted(units, key=len, reverse=True))
    text = re.sub(rf"(\d+)\s?({keys})(?!\w)", lambda m: f"{_words(int(m[1]), lang)} {units[m[2]]}", text)
    text = re.sub(r"\b([01]?\d|2[0-3]):([0-5]\d)\b",
                  lambda m: f"{_words(int(m[1]), lang)} {_words(int(m[2]), lang) if m[2] != '00' else ''}".strip()
                  + (" Uhr" if lang == "de" else ""), text)
    return re.sub(r"\b\d+\b", lambda m: _words(int(m[0]), lang), text)


def normalize(text: str, lang: str = "ru") -> str:
    text = re.sub(r"[`*_#>]+", "", text)                 # разметка markdown не читается
    text = re.sub(r"https?://\S+", "ссылка" if lang == "ru" else "link", text)
    text = re.sub(r"\s+", " ", text).strip()
    if lang == "ru":
        return _ru(text)
    if lang == "de":
        return _simple(text, "de", DE_UNITS)
    return _simple(text, "en", EN_UNITS)


def sentences(text: str, max_len: int = 220) -> list[str]:
    """Предложения для потоковой выдачи: первое — короткое, чтобы звук пошёл быстрее."""
    parts = [p.strip() for p in re.split(r"(?<=[.!?…])\s+|\n+", text) if p.strip()]
    out: list[str] = []
    for p in parts:
        while len(p) > max_len:
            cut = max(p.rfind(", ", 0, max_len), p.rfind("; ", 0, max_len), p.rfind(" — ", 0, max_len))
            cut = cut if cut > 40 else p.rfind(" ", 0, max_len)
            if cut <= 0:
                break
            out.append(p[:cut + 1].strip())
            p = p[cut + 1:].strip()
        out.append(p)
    return out


def detect_lang(text: str) -> str:
    cyr = len(re.findall(r"[А-Яа-яЁё]", text))
    lat = len(re.findall(r"[A-Za-z]", text))
    if cyr >= lat * 0.5 and cyr:
        return "ru"
    if re.search(r"[äöüßÄÖÜ]|\b(der|die|das|und|ist|nicht|ich|Sie)\b", text):
        return "de"
    return "en"
