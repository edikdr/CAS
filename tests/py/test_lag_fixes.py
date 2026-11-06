"""Журнал событий без повторов, запись файла при занятом приёмнике, повтор запроса после падения модели."""
import os

import pytest

from haotica import paths, util
from haotica.server.events import EventLog


class _Hub:
    def __init__(self):
        self.sent = []

    def publish(self, topic, data, keep=True):
        self.sent.append((topic, data))


def test_events_collapse_repeats(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "RUNTIME_DIR", tmp_path)
    util.write_json(tmp_path / "events.json", [{"kind": "ok", "text": "CORE // ONLINE"}] * 30
                    + [{"kind": "power", "text": "POWER // AC CONNECTED"}])
    log = EventLog(_Hub())
    assert [e["text"] for e in log.items] == ["CORE // ONLINE", "POWER // AC CONNECTED"]
    log.add("ok", "CORE // ONLINE")
    log.add("ok", "CORE // ONLINE")
    assert [e["text"] for e in log.items][-2:] == ["POWER // AC CONNECTED", "CORE // ONLINE"]


@pytest.mark.skipif(os.name != "nt", reason="занятый файл мешает замене только в Windows")
def test_atomic_write_retries_when_busy(tmp_path, monkeypatch):
    real = os.replace
    calls = []

    def flaky(a, b):
        calls.append(1)
        if len(calls) < 3:
            raise PermissionError(5, "Отказано в доступе")
        return real(a, b)

    monkeypatch.setattr(os, "replace", flaky)
    util.write_json(tmp_path / "m.json", {"a": 1})
    assert util.load_json(tmp_path / "m.json") == {"a": 1}
    assert len(calls) == 3
    assert not [p for p in tmp_path.iterdir() if p.name.startswith(".m.json.")]

