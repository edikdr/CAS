"""Общая подготовка: пакет haotica из core/, всё состояние — во временном каталоге (HAOTICA_HOME)."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_HOME = tempfile.mkdtemp(prefix="haotica-test-")
os.environ["HAOTICA_HOME"] = _HOME
os.environ["HAOTICA_DEV_ROOT"] = str(ROOT)
os.environ.setdefault("HAOTICA_AGENT_PORT", "47810")
sys.path.insert(0, str(ROOT / "core"))
sys.path.insert(0, str(ROOT / "tools"))
