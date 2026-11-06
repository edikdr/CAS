"""Скорость Haotica: начало промпта не меняется между ходами (кэш llama-server), выбор быстрой модели."""
from haotica import config


def test_system_prompt_is_stable_between_turns(monkeypatch):
    from haotica.agent.engine import Agent
    a = Agent()
    m1 = a.build_messages("t-cache", "привет", {"cwd": "C:\\a", "shell": "pwsh", "source": "terminal"})
    import time as _t
    real = _t.localtime
    monkeypatch.setattr(_t, "localtime", lambda *x: real(_t.time() + 3600))      # через час, другие метрики
    m2 = a.build_messages("t-cache", "а теперь другое", {"cwd": "D:\\b", "shell": "pwsh", "source": "terminal"})
    assert m1[0]["content"] == m2[0]["content"], "системная инструкция не должна зависеть от времени, метрик и папки"
    assert "Сейчас:" not in m1[0]["content"]
    assert "Сейчас:" in m2[-1]["content"] and "D:\\b" in m2[-1]["content"], "обстановка — в последнем сообщении"


def test_auto_prefers_deep_when_ready(monkeypatch):
    from haotica.agent.llm import LLM
    llm = LLM()
    monkeypatch.setattr(config, "load", lambda: {"haotica": {"model_mode": "auto", "prefer_deep": True}})
    monkeypatch.setattr(llm, "_deep_ok", lambda: True)
    assert llm.route("собери проект", 100, "terminal") == "deep"
    assert llm.route("что на картинке?", 100, "terminal", images=True) == "base", "зрение — только у base"
    assert llm.route("x", 100, "terminal", want="base") == "base"
    monkeypatch.setattr(llm, "_deep_ok", lambda: False)
    assert llm.route("собери проект", 100, "terminal") == "base", "deep не скачана или падала — base"
    monkeypatch.setattr(config, "load", lambda: {"haotica": {"model_mode": "base", "prefer_deep": True}})
    monkeypatch.setattr(llm, "_deep_ok", lambda: True)
    assert llm.route("собери проект", 100, "terminal") == "base", "явный режим base владельца уважается"
