"""Образец голоса Сары по языку: русский — из русских реплик (без английского акцента), тон — в имени кэша."""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="нужен ffmpeg")


def _ref(tmp_path, lang, pitch):
    code = ("from haotica.tts.engines import reference; import sys; "
            f"print(reference(24000, lang={lang!r}, pitch={pitch}))")
    env = dict(os.environ, HAOTICA_HOME=str(tmp_path), HAOTICA_DEV_ROOT=str(ROOT), PYTHONPATH=str(ROOT / "core"))
    return subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True).stdout.strip()


def test_russian_reference_is_russian_sarah(tmp_path):
    assert (ROOT / "assets/sounds/voice/ref_sarah_ru.ogg").exists()
    ru, en = _ref(tmp_path, "ru", 0), _ref(tmp_path, "en", 0)
    assert "sarah_ru_24000_p+0.00" in ru and "sarah_en_24000_p+0.00" in en
    assert Path(ru).stat().st_size > 24000 * 2 * 8          # ≥ 8 с речи


def test_pitch_variant_cached_separately(tmp_path):
    p = _ref(tmp_path, "ru", 1.0)
    assert p.endswith("sarah_ru_24000_p+1.00.wav") and Path(p).exists()
    assert not Path(p).with_suffix(".src.wav").exists()
