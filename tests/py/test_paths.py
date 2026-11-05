import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _paths(env: dict) -> dict:
    code = ("import json, haotica.paths as p; print(json.dumps({k: str(getattr(p, k)) for k in "
            "('CONFIG_DIR','DATA_DIR','STATE_DIR','RUNTIME_DIR','LOG_DIR','TOKEN_FILE','MODELS_DIR','OPT','APPS_DIR')}))")
    e = {k: v for k, v in os.environ.items() if k not in ("HAOTICA_HOME", "HAOTICA_DEV_ROOT")}
    e.update(env, PYTHONPATH=str(ROOT / "core"))
    out = subprocess.run([sys.executable, "-c", code], env=e, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def test_home_override(tmp_path):
    p = _paths({"HAOTICA_HOME": str(tmp_path)})
    assert p["STATE_DIR"] == str(tmp_path / "state") and p["TOKEN_FILE"] == str(tmp_path / "state" / "token")


def test_platform_layout(tmp_path):
    if os.name == "nt":
        p = _paths({"APPDATA": str(tmp_path / "Roaming"), "LOCALAPPDATA": str(tmp_path / "Local")})
        assert p["CONFIG_DIR"] == str(tmp_path / "Roaming" / "Haotica")
        assert p["DATA_DIR"] == str(tmp_path / "Local" / "Haotica" / "data")
        assert p["LOG_DIR"] == str(tmp_path / "Local" / "Haotica" / "logs")
        assert p["OPT"] == str(tmp_path / "Local" / "Haotica" / "opt")
        assert Path(p["APPS_DIR"]).name == "apps"
    else:
        p = _paths({"XDG_CONFIG_HOME": str(tmp_path / "c"), "XDG_RUNTIME_DIR": str(tmp_path / "r")})
        assert p["CONFIG_DIR"] == str(tmp_path / "c" / "haotica")
        assert p["RUNTIME_DIR"] == str(tmp_path / "r" / "haotica")


def test_dev_root():
    p = _paths({"HAOTICA_DEV_ROOT": str(ROOT)})
    assert p["APPS_DIR"] == str(ROOT / "apps")
