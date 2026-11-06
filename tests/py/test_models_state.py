"""Готовность моделей (SHA-256), разбор сбоев llama-server и параметры запуска deep под общую память."""
import hashlib
import os

import pytest


@pytest.fixture()
def one_model(tmp_path, monkeypatch):
    """Каталог с одной ролью «base» из маленького файла во временной папке моделей."""
    from haotica import models, paths
    monkeypatch.setattr(paths, "MODELS_DIR", tmp_path)
    data = os.urandom(4096)
    entry = {"id": "t", "label": "T", "repo": "x/y", "file": "t.gguf", "size": len(data),
             "sha256": hashlib.sha256(data).hexdigest(), "ctx_max": 8192}
    monkeypatch.setattr(models, "CATALOG", {"base": [entry]})
    return models, tmp_path, data


def test_ready_requires_checksum(one_model):
    models, d, data = one_model
    assert models.status()["base"]["state"] == "missing"
    (d / "t.gguf").write_bytes(data[:100])
    assert models.status()["base"]["state"] == "missing" or not models.status()["base"]["ready"]
    (d / "t.gguf").write_bytes(data)
    st = models.status()["base"]
    assert st["ready"] and not st["verified"] and st["state"] == "unverified", st
    assert models.verify(only_unchecked=True, progress=False) == 0
    st = models.status()["base"]
    assert st["verified"] and st["state"] == "verified", st


def test_corrupt_file_is_not_ready_and_removed(one_model):
    models, d, data = one_model
    (d / "t.gguf").write_bytes(bytes(len(data)))         # нужный размер, но не то содержимое
    assert models.verify(progress=False) == 1
    st = models.status()["base"]
    assert not st["ready"] and not (d / "t.gguf").exists(), "испорченный файл не должен считаться готовым"


def test_changed_file_is_rechecked(one_model):
    models, d, data = one_model
    f = d / "t.gguf"
    f.write_bytes(data)
    models.verify(progress=False)
    assert models.checked("t.gguf") is True
    os.utime(f, (1, 1))                                   # файл заменили — отметка больше не действует
    assert models.checked("t.gguf") is None


def test_failure_reason():
    from haotica import models
    oom = "ggml_vulkan: vk::Device::allocateMemory: ErrorOutOfDeviceMemory\nfailed to allocate buffer for kv cache"
    assert models.failure_reason(oom) == "oom"
    assert models.failure_reason("llama_model_load: tensor data is not within the file bounds") == "file"
    assert models.failure_reason("error: unknown spec-type draft-dflash") == "spec"
    assert models.failure_reason("all good") == ""


def test_oom_halves_context_then_gives_up(tmp_path, monkeypatch):
    from haotica import config, models, paths
    monkeypatch.setattr(paths, "STATE_DIR", tmp_path)
    monkeypatch.setattr(config, "get", lambda k, d=None, **kw: 131072 if k == "haotica.context_size" else d)
    assert models.on_start_failure("deep", "ErrorOutOfDeviceMemory") == "oom"
    assert models._ctx_shrink("deep") == 65536
    models.on_start_failure("deep", "ErrorOutOfDeviceMemory")
    models.on_start_failure("deep", "ErrorOutOfDeviceMemory")
    assert models._ctx_shrink("deep") == 16384
    assert models.on_start_failure("deep", "ErrorOutOfDeviceMemory") == "oom-final"
    assert not (tmp_path / "llm-deep.nospec").exists(), "нехватка памяти — не повод отключать драфт"


@pytest.mark.skipif(os.name != "nt", reason="параметры Windows")
def test_deep_args_fit_shared_memory(tmp_path, monkeypatch):
    from haotica import models, paths
    monkeypatch.setattr(paths, "MODELS_DIR", tmp_path)
    monkeypatch.setattr(paths, "STATE_DIR", tmp_path)
    monkeypatch.setattr(models, "llama_server", lambda: tmp_path / "llama-server.exe")
    e = models.CATALOG["deep"][0]
    (tmp_path / e["file"]).write_bytes(b"GGUF")
    a = models.server_args("deep")
    assert "-ngl" not in a and a[a.index("--fit") + 1] == "on", "deep: llama.cpp сам подгоняет слои под память"
    assert a[a.index("-np") + 1] == "1" and a[a.index("--cache-type-k") + 1] == "q8_0"
