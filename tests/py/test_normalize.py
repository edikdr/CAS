import pytest

from haotica.tts import normalize as n

pytest.importorskip("num2words")


def test_ru_numbers_units_dates():
    assert n.normalize("Найдена 1 ошибка и 22 строки.") == "Найдена одна ошибка и двадцать две строки."
    assert "сорок семь гигабайт" in n.normalize("Свободно 47 ГБ")
    assert n.normalize("5 ноября 2026 года, в 14:30") == "пятое ноября две тысячи двадцать шестого года, в четырнадцать тридцать"
    assert "то есть" in n.normalize("т. е. так")


def test_sentences_and_lang():
    parts = n.sentences("Первое. Второе предложение! Третье?")
    assert parts == ["Первое.", "Второе предложение!", "Третье?"]
    assert n.detect_lang("Привет, мир") == "ru" and n.detect_lang("Hallo, wie geht es Ihnen? Die Datei") == "de"
