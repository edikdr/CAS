"""Журнал событий без повторов, запись файла при занятом приёмнике, повтор запроса после падения модели."""
import os
from pathlib import Path

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




def test_step_signature_ignores_waits_and_spacing():
    from haotica.agent.engine import _step_sig
    a = {"name": "terminal_run", "arguments": '{"command": "Start-Sleep 15; curl.exe -s --max-time 60 https://x"}'}
    b = {"name": "terminal_run", "arguments": '{"command":"Start-Sleep -Seconds 30;  curl.exe -s --max-time 120 https://x"}'}
    c = {"name": "terminal_run", "arguments": '{"command": "curl.exe -s https://y"}'}
    assert _step_sig(a) == _step_sig(b) != _step_sig(c)


def test_edit_file_backup_and_crlf(tmp_path, monkeypatch):
    import asyncio
    from haotica import config
    from haotica.agent import tools
    monkeypatch.setattr(paths, "DATA_DIR", tmp_path / "data")
    f = tmp_path / "a.ps1"
    f.write_bytes(b"line1\r\nWrite-Host 'old'\r\nline3\r\n")
    t = tools.Tools(None)
    monkeypatch.setattr(t, "cfg", lambda: {"folders_allowed": [str(tmp_path)], "folders_denied": []})
    r = asyncio.run(t.t_edit_file({"path": str(f), "old": "Write-Host 'old'\nline3", "new": "Write-Host 'new'\nline3"}, {}))
    assert r.get("ok") and r["line"] == 2, r
    assert f.read_bytes() == b"line1\r\nWrite-Host 'new'\r\nline3\r\n"
    assert open(r["backup"], "rb").read() == b"line1\r\nWrite-Host 'old'\r\nline3\r\n"
    r = asyncio.run(t.t_edit_file({"path": str(f), "old": "line", "new": "x"}, {}))
    assert "встречается" in r["error"]
    r = asyncio.run(t.t_write_file({"path": str(f), "content": "fresh"}, {}))
    assert r["ok"] and r["backup"] and f.read_text() == "fresh"
    assert config is not None


def test_tts_venv_home_repair(tmp_path):
    from haotica.tts import runtime
    base = tmp_path / "py"
    (base / "cpython-3.11.18-windows-x86_64-none").mkdir(parents=True)
    exe = "python.exe" if os.name == "nt" else "bin/python3"
    (base / "cpython-3.11.18-windows-x86_64-none" / exe).parent.mkdir(parents=True, exist_ok=True)
    (base / "cpython-3.11.18-windows-x86_64-none" / exe).write_text("x")
    v = tmp_path / "venv"
    v.mkdir()
    (v / "pyvenv.cfg").write_text(f"home = {base / 'cpython-3.11-windows-x86_64-none'}\nversion_info = 3.11.18\n", encoding="utf-8")
    assert runtime.repair_home(v)
    assert "cpython-3.11.18" in (v / "pyvenv.cfg").read_text(encoding="utf-8")
    assert not runtime.repair_home(v)            # второй раз чинить нечего


def test_supervisor_backoff_grows_and_reports(tmp_path):
    from haotica import supervisor
    log = tmp_path / "x.log"
    log.write_text("── start\nerror: uv trampoline failed to spawn Python child process\n", encoding="utf-8")
    assert "uv trampoline" in supervisor._tail_reason(log)


@pytest.mark.skipif(os.name != "nt", reason="fast убрана только в Windows")
def test_no_fast_model_on_windows():
    from haotica import models
    assert "fast" not in models.ROLES and "fast" not in models.load_manifest()["models"]
    assert "fast" not in models.status()


def test_base_context_capped(monkeypatch, tmp_path):
    from haotica import config, models
    gguf = tmp_path / "m.gguf"
    gguf.write_bytes(b"GGUF")
    monkeypatch.setattr(models, "llama_server", lambda: Path("llama-server"))
    monkeypatch.setattr(models, "model_file", lambda m: gguf)
    monkeypatch.setattr(models, "_ctx_shrink", lambda role: 0)
    real = config.load()
    real.setdefault("haotica", {})["context_size"] = 131072
    monkeypatch.setattr(config, "load", lambda: real)
    a = models.server_args("base")
    assert a[a.index("-c") + 1] == "65536"
    a = models.server_args("deep")
    assert a[a.index("-c") + 1] == "131072"


def test_file_search_skips_service_dirs_and_stops_in_time(tmp_path):
    """Поиск файлов не лезет в AppData/.git/node_modules и укладывается в отведённое время."""
    import time
    from haotica.server import routes_fs
    for d in ("AppData/Local/x", ".git/objects", "node_modules/pkg", "work/src"):
        (tmp_path / d).mkdir(parents=True)
        (tmp_path / d / "target.txt").write_text("x")
    found = [e.path for e in routes_fs._walk_files(tmp_path, time.monotonic() + 5) if e.name == "target.txt"]
    assert found == [str(tmp_path / "work" / "src" / "target.txt")]
    assert list(routes_fs._walk_files(tmp_path, time.monotonic() - 1)) == []      # время вышло — сразу стоп


def test_voice_turbo_decoder_installed_and_default():
    """Быстрый декодер звука: включён по умолчанию и скачивается вместе с голосом (иначе — докачка при запуске)."""
    import tomllib
    from haotica.tts import runtime
    d = tomllib.loads((Path(__file__).parents[2] / "core/haotica/defaults.toml").read_text(encoding="utf-8"))
    assert d["haotica"]["voice_decoder"] == "turbo"
    assert "s3gen_meanflow.safetensors" in runtime.WARMUP["chatterbox"]


def test_terminal_interrupt_tool_no_card_and_flood_message(monkeypatch):
    """Занятая вкладка: модель может прервать свою команду без карточки; поток двоичного вывода — понятная ошибка."""
    from haotica import config
    from haotica.agent import tools
    from haotica.agent.engine import Agent
    monkeypatch.setattr(config, "get", lambda k, d=None, **kw: {"mode": "agent", "autonomy": "none"} if k == "haotica" else d)
    names = {s["function"]["name"] for s in tools.schemas("agent", terminal=True)}
    assert "terminal_interrupt" in names
    assert "terminal_interrupt" not in {s["function"]["name"] for s in tools.schemas("agent", terminal=False)}
    need, _ = tools.Tools(None).needs_card("terminal_interrupt", {"reason": "зависло"})
    assert not need
    a = Agent()
    res = a._exec_result("x1", {"exit": 1, "output_tail": "MZ\x00" * 5000, "flood": True, "tab": "HAOTICA 2"})
    assert "2 МБ" in res["error"] and "-OutFile" in res["error"]
    assert res["tab"] == "HAOTICA 2" and len(res["output_tail"]) <= 1500


def test_voice_off_unloads_tts(monkeypatch):
    """Голос выключили — служба речи останавливается (модель уходит из памяти); «озвучить» держит её недолго."""
    import asyncio
    from haotica import services
    from haotica.agent import engine
    from haotica.agent.engine import Agent
    calls = []
    monkeypatch.setattr(services, "supervised", lambda: True)
    monkeypatch.setattr(services, "status", lambda: {"tts": {"state": "active"}})

    async def stop(name):
        calls.append(("stop", name))
    monkeypatch.setattr(services, "stop", stop)
    from haotica.tts import runtime
    monkeypatch.setattr(runtime, "installed", lambda: "chatterbox")
    monkeypatch.setattr(engine.config, "get", lambda k, d=None, **kw: False if k == "haotica.voice" else d)
    a = Agent()
    a.voice = None
    asyncio.run(a._voice_sync())
    assert calls == [("stop", "tts")]
    calls.clear()
    a.voice_hold = __import__("time").time() + 60       # только что нажали «озвучить» — не выгружать
    asyncio.run(a._voice_sync())
    assert calls == []
