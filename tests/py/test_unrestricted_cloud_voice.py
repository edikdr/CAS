"""Режим «без ограничений», облако с минимумом данных, речь без разрывов."""
import asyncio
import io
import wave

import pytest

from haotica import config
from haotica.agent import safety, tools


class _A:
    pass


def _tools(monkeypatch, ha: dict):
    monkeypatch.setattr(config, "get", lambda k, d=None, **kw: ha if k == "haotica" else d)
    return tools.Tools(_A())


def test_unrestricted_runs_everything_but_closed_zones(monkeypatch):
    t = _tools(monkeypatch, {"unrestricted": True, "mode": "observer"})
    need, risk = t.needs_card("terminal_run", {"command": "Remove-Item -Recurse -Force C:\\tmp\\x"}, {"shell": "pwsh"})
    assert not need and risk["level"] == "danger", "без ограничений: опасное — без карточки (но риск виден)"
    need, _ = t.needs_card("write_file", {"path": "~/a.txt", "content": "x"})
    assert not need
    need, risk = t.needs_card("terminal_run", {"command": "Get-Content $env:APPDATA\\Microsoft\\Credentials\\x"},
                              {"shell": "pwsh"})
    assert need and risk["level"] == "denied", "хранилище паролей закрыто всегда"


def test_default_mode_still_asks(monkeypatch):
    t = _tools(monkeypatch, {"mode": "copilot", "autonomy": "readonly"})
    need, risk = t.needs_card("terminal_run", {"command": "Remove-Item -Recurse C:\\x"}, {"shell": "pwsh"})
    assert need and risk["level"] == "danger"


def test_cloud_ask_minimal_brief(monkeypatch):
    t = _tools(monkeypatch, {"mode": "copilot"})
    need, _ = t.needs_card("cloud_ask", {"question": "Какой последний стабильный релиз Python?"})
    assert not need, "обезличенный короткий вопрос — без карточки"
    need, risk = t.needs_card("cloud_ask", {"question": r"Почему не открывается C:\Users\Edik\secret\plan.docx?"})
    assert need and "пути к файлам" in risk["reasons"][0]
    t2 = _tools(monkeypatch, {"unrestricted": True})
    assert not t2.needs_card("cloud_ask", {"question": r"C:\Users\Edik\x.txt что это?"})[0]


def test_brief_check_windows_paths_and_user(monkeypatch):
    monkeypatch.setenv("USERNAME", "EdikTest")
    clean, removed = safety.brief_check(r"Файл C:\Users\EdikTest\Documents\a.txt и \\nas\share\b — что с ними? EdikTest")
    assert "EdikTest" not in clean and "C:\\Users" not in clean and "\\\\nas" not in clean, clean
    assert "пути к файлам" in removed


def _wav(sec: float, sr: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"\x01\x00" * int(sr * sec))
    return buf.getvalue()


def test_continuous_speech_plays_without_gaps(monkeypatch):
    """Синтез медленнее звучания (как на CPU): звук начинается, когда запаса хватит до конца, и идёт крупными
    кусками — меньше кусков, чем фраз, ничего не теряется."""
    from haotica.agent import voice as V
    from haotica.tts import prosody

    class Hub:
        def publish(self, *a, **k):
            pass

    class State:
        value = "idle"

        def set(self, *a, **k):
            pass
    v = V.Voice(Hub(), State())
    played: list[float] = []

    async def fake_play(data, s, gen=None):
        with wave.open(io.BytesIO(data)) as w:
            played.append(w.getnframes() / w.getframerate())
        await asyncio.sleep(played[-1])                  # звучит столько, сколько длится
    monkeypatch.setattr(v, "_play_bytes", fake_play)
    plan = prosody.plan("Первая фраза. Вторая фраза! Третья фраза? Четвёртая.", "ru", pause_scale=0.3)
    n_speech = sum(1 for s in plan if s.kind == "speech")

    async def synth(seg):
        await asyncio.sleep(0.3)                          # синтез втрое дольше звучания
        return _wav(0.1)
    ok = asyncio.new_event_loop().run_until_complete(v._say_continuous(plan, synth, {}, v.gen))
    assert ok and played
    assert len(played) < n_speech, f"куски {played}: речь должна идти крупными частями, а не по фразе"
    pauses = sum(s.ms for s in plan if s.kind == "pause") / 1000
    assert sum(played) == pytest.approx(n_speech * 0.1 + pauses, abs=0.05)


def test_pause_scale():
    from haotica.tts import prosody
    full = prosody.plan("Раз. Два. Три.", "ru")
    short = prosody.plan("Раз. Два. Три.", "ru", pause_scale=0.3)
    f = sum(s.ms for s in full if s.kind == "pause")
    s = sum(s.ms for s in short if s.kind == "pause")
    assert 0 < s <= f * 0.31


def test_parse_helper_answer_variants():
    from haotica.agent.cloud import _parse_json_answer
    assert _parse_json_answer('{"answer": "3.15.2", "facts": []}')["answer"] == "3.15.2"
    assert _parse_json_answer('```json\n{"answer": "да", "facts": []}\n```')["answer"] == "да"
    cut = '```json\n{\n  "answer": "Последняя версия — **3.15.2** (python.org).\nЕщё'
    assert _parse_json_answer(cut)["answer"].startswith("Последняя версия — **3.15.2**")
