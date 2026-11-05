import os

import pytest

from haotica.apps import profiles


def test_quote_for():
    assert profiles.quote_for("pwsh", r"C:\Users\x") == r"C:\Users\x"
    assert profiles.quote_for("pwsh", r"C:\Мои файлы\it's") == r"'C:\Мои файлы\it''s'"
    assert profiles.quote_for("cmd", r"C:\Program Files\x") == r'"C:\Program Files\x"'
    assert profiles.quote_for("wsl", r"C:\Users\x y") == "'/mnt/c/Users/x y'"
    assert profiles.quote_for("bash", "/tmp/a b") == "'/tmp/a b'"


def test_win_to_wsl():
    assert profiles.win_to_wsl(r"D:\work\repo") == "/mnt/d/work/repo"


def test_detect_has_default():
    pr = profiles.detect()
    assert pr and profiles.default_id(pr) == pr[0]["id"]
    if os.name == "nt":
        kinds = {p["kind"] for p in pr}
        assert "cmd" in kinds and "pwsh" in kinds


@pytest.mark.skipif(os.name != "nt", reason="Windows")
def test_build_pwsh_integration():
    pr = [p for p in profiles.detect() if p["kind"] == "pwsh"]
    argv, env, cwd, prof = profiles.build(pr[0]["id"], "~", "test")
    assert "-NoExit" in argv and any("haotica.ps1" in a for a in argv)
    assert env["TERM_PROGRAM"] == "haotica" and os.path.isdir(cwd)


@pytest.mark.skipif(os.name != "nt", reason="Windows")
def test_build_cmd_prompt():
    argv, env, _cwd, _p = profiles.build("cmd", "~", "test")
    assert "]7;file://" in env["PROMPT"] and argv[1].upper() == "/K"


def test_wsl_list_never_blocks_spawn(monkeypatch):
    """Без WSL `wsl -l -q` висит до тайм-аута: запуск вкладки не должен его ждать (было: 6 с на вкладку)."""
    import time
    from haotica.apps import profiles
    monkeypatch.setattr(profiles, "IS_WINDOWS", True)
    monkeypatch.setattr(profiles, "_wsl_query", lambda: (time.sleep(2), ["Ubuntu"])[1])
    profiles._WSL.update(names=None, t=0.0, busy=False)
    t0 = time.monotonic()
    assert profiles.wsl_distros() == []                 # первый вызов — сразу, опрос ушёл в фон
    assert time.monotonic() - t0 < 0.3
    assert profiles.wsl_distros(wait=True) == ["Ubuntu"]   # явный выбор WSL — дождаться
    t0 = time.monotonic()
    assert profiles.wsl_distros() == ["Ubuntu"] and time.monotonic() - t0 < 0.1   # дальше — из кэша
