"""Предпросмотр и файловое API (W6): все типы из tests/fixtures/preview, пути с пробелами и кириллицей."""
import asyncio
from pathlib import Path

import pytest

from haotica.server import routes_fs

FIX = Path(__file__).resolve().parents[1] / "fixtures" / "preview"


def prev(name: str) -> dict:
    return asyncio.new_event_loop().run_until_complete(routes_fs.preview(FIX / name))


@pytest.mark.parametrize("name,kind", [
    ("image.png", "image"), ("vector.svg", "image"), ("doc.pdf", "pdf"), ("tone.wav", "audio"), ("archive.zip", "archive"),
    ("table.csv", "table"), ("data.json", "tree"), ("config.toml", "tree"), ("notes.md", "markdown"),
    ("script.py", "code"), ("app.log", "log"), ("blob.dat", "binary"), ("report.docx", "office"),
    ("Папка с пробелами", "dir"), ("Папка с пробелами/файл с пробелами.txt", "text"),
])
def test_kinds(name, kind):
    p = prev(name)
    if kind == "image" and name.endswith(".png"):
        pytest.importorskip("PIL")
    assert p["kind"] == kind, p


@pytest.mark.parametrize("name,enc,needle", [
    ("cyrillic-cp1251.txt", "cp1251", "Привет"), ("cyrillic-cp866.txt", "cp866", "кодовая"), ("utf16.txt", "utf-16", "Блокнот")])
def test_encodings(name, enc, needle):
    text, got, eol = routes_fs.decode_text((FIX / name).read_bytes())
    assert got == enc and needle in text


def test_csv_and_tree_content():
    t = prev("table.csv")
    assert t["rows"][0] == ["имя", "размер", "дата"] and len(t["rows"]) == 3
    j = prev("data.json")
    assert j["data"]["models"] == ["fast", "base", "deep"]
    log = prev("app.log")
    assert log["lines_tail"][-1].endswith("шаг 599") and len(log["lines_tail"]) == 400
    z = prev("archive.zip")
    assert any("src/app.py" in e for e in z["entries"])


def test_entry_and_resolve_unicode():
    e = routes_fs.entry(FIX / "Папка с пробелами" / "файл с пробелами.txt")
    assert e["type"] == "file" and e["name"] == "файл с пробелами.txt" and not e["hidden"]
    assert routes_fs.resolve(str(FIX / "Папка с пробелами")).is_dir()
    assert routes_fs.resolve((FIX / "doc.pdf").as_uri()).is_file()
