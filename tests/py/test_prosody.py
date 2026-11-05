"""Просодия голоса Сары: паузы, интонация, темп, эмоции, что не читается вслух."""
from haotica.tts import prosody


def kinds(segs):
    return [s.kind for s in segs]


def test_pauses_and_intonation():
    segs = prosody.plan("Готово! Сборка прошла, но есть нюанс… Осторожно: команда удалит папку без возврата. Что дальше?")
    sp = [s for s in segs if s.kind == "speech"]
    assert [s.text for s in sp][0] == "Готово!"
    assert "exclaim" in sp[0].tags and sp[0].exaggeration > 0.6
    trail = next(s for s in sp if "нюанс" in s.text)
    assert "trail" in trail.tags and trail.speed < 1.0
    warn = next(s for s in sp if "Осторожно" in s.text)
    assert "warning" in warn.tags and warn.cfg < 0.45 and warn.speed < 1.0
    assert "question" in sp[-1].tags
    pauses = [s.ms for s in segs if s.kind == "pause"]
    assert 650 in pauses and all(100 <= p <= 1300 for p in pauses)
    assert segs[-1].kind == "speech" and segs[0].kind == "speech"


def test_emotions_and_pause_tags():
    segs = prosody.plan("Ну ты даёшь *смеётся* ладно. [пауза] Делаем. *вздыхает*")
    sounds = [s.sound for s in segs if s.kind == "sound"]
    assert sounds == ["emo_giggle", "emo_sigh"]
    assert any(s.kind == "pause" and s.ms == 700 for s in segs)
    assert not any("смеётся" in s.text or "пауза" in s.text for s in segs if s.kind == "speech")


def test_code_links_lists_not_read():
    text = "Вот команда:\n```powershell\nRemove-Item -Recurse build\n```\nПодробнее: https://example.com/x\n- первый\n- второй"
    sp = [s.text for s in prosody.plan(text) if s.kind == "speech"]
    joined = " ".join(sp)
    assert "Remove-Item" not in joined and "https" not in joined
    assert "Команда — в блоке кода." in sp and "первый" in sp and "второй" in sp


def test_long_sentence_split_and_language():
    long = ("Если хочешь, я сама проверю зависимости, запущу тесты в отдельной вкладке, посмотрю журнал, "
            "найду, что сломалось, и коротко расскажу, как это исправить без лишней возни.")
    segs = prosody.plan(long + " Let me know when you're ready.")
    sp = [s for s in segs if s.kind == "speech"]
    assert len(sp) >= 3 and all(len(s.text) <= 160 for s in sp)
    assert sp[-1].lang == "en" and sp[0].lang == "ru"


def test_speakable_and_trim():
    assert not prosody.speakable("```bash\nls\n```")
    segs = prosody.plan("Фраза номер один. " * 120, max_chars=300)
    assert sum(len(s.text) for s in segs if s.kind == "speech") < 420
