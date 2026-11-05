"""Загрузчик моделей: докачка после обрыва, проверка суммы по ходу, готовый файл появляется только целиком."""
import hashlib
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

DATA = os.urandom(3 * 1024 * 1024 + 123)
SHA = hashlib.sha256(DATA).hexdigest()


class H(BaseHTTPRequestHandler):
    cut = [True]                                   # первый ответ обрывается на середине

    def log_message(self, *a):
        pass

    def do_GET(self):
        start = int((self.headers.get("Range") or "bytes=0-").split("=")[1].split("-")[0])
        self.send_response(206 if start else 200)
        self.send_header("Content-Length", str(len(DATA) - start))
        self.end_headers()
        body = DATA[start:]
        if self.cut[0]:
            self.cut[0] = False
            self.wfile.write(body[: len(body) // 2])
            self.wfile.flush()
            self.connection.shutdown(2)
            return
        self.wfile.write(body)


@pytest.fixture()
def srv():
    s = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    H.cut[0] = True
    yield f"http://127.0.0.1:{s.server_address[1]}/f"
    s.shutdown()


def test_resume_after_cut(tmp_path, srv, monkeypatch):
    from haotica import models
    monkeypatch.setattr("time.sleep", lambda *_: None)
    dst = tmp_path / "m.gguf"
    assert models._fetch(srv, dst, len(DATA), SHA)
    assert dst.read_bytes() == DATA and not (tmp_path / "m.gguf.part").exists()


def test_bad_checksum_removes_part(tmp_path, srv, monkeypatch):
    from haotica import models
    monkeypatch.setattr("time.sleep", lambda *_: None)
    dst = tmp_path / "m.gguf"
    assert not models._fetch(srv, dst, len(DATA), "0" * 64)
    assert not dst.exists() and not (tmp_path / "m.gguf.part").exists()


def test_resume_from_old_partial(tmp_path, srv, monkeypatch):
    from haotica import models
    monkeypatch.setattr("time.sleep", lambda *_: None)
    H.cut[0] = False
    dst = tmp_path / "m.gguf"
    dst.write_bytes(DATA[: 1000000])               # недокачанный файл от прежней версии
    assert models._fetch(srv, dst, len(DATA), SHA)
    assert dst.read_bytes() == DATA
