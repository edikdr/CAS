"""Память Haotica: факты о владельце (поиск FTS5) и история разговоров. SQLite в ~/.local/share/haotica."""
from __future__ import annotations

import json
import re
import sqlite3
import threading
import time

from .. import paths

SCHEMA = """
CREATE TABLE IF NOT EXISTS facts (id INTEGER PRIMARY KEY, text TEXT NOT NULL, kind TEXT DEFAULT 'fact',
  created REAL, used REAL, weight REAL DEFAULT 1.0);
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(text, content='facts', content_rowid='id', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN INSERT INTO facts_fts(rowid, text) VALUES (new.id, new.text); END;
CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN INSERT INTO facts_fts(facts_fts, rowid, text) VALUES('delete', old.id, old.text); END;
CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, text) VALUES('delete', old.id, old.text);
  INSERT INTO facts_fts(rowid, text) VALUES (new.id, new.text); END;
CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, title TEXT, source TEXT, created REAL, updated REAL, summary TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, chat TEXT, role TEXT, content TEXT, extra TEXT, created REAL);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat, id);
"""


class Memory:
    def __init__(self) -> None:
        paths.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(paths.MEMORY_DB, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock:
            self.db.executescript(SCHEMA)
            self.db.commit()
        try:
            paths.MEMORY_DB.chmod(0o600)
        except OSError:
            pass

    # ── факты ──────────────────────────────────────────────────
    def remember(self, text: str, kind: str = "fact") -> int:
        text = text.strip()[:500]
        with self.lock:
            dup = self.db.execute("SELECT id FROM facts WHERE lower(text)=lower(?)", (text,)).fetchone()
            if dup:
                self.db.execute("UPDATE facts SET used=?, weight=weight+0.5 WHERE id=?", (time.time(), dup["id"]))
                self.db.commit()
                return dup["id"]
            cur = self.db.execute("INSERT INTO facts(text, kind, created, used) VALUES (?,?,?,?)",
                                  (text, kind, time.time(), time.time()))
            self.db.commit()
            return cur.lastrowid

    def forget(self, fid: int) -> bool:
        with self.lock:
            n = self.db.execute("DELETE FROM facts WHERE id=?", (fid,)).rowcount
            self.db.commit()
        return n > 0

    def facts(self, limit: int = 200) -> list[dict]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM facts ORDER BY used DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    def recall(self, query: str, limit: int = 8) -> list[str]:
        words = [w for w in re.findall(r"[\wА-Яа-яЁё]{3,}", query.lower())][:12]
        out: list[str] = []
        with self.lock:
            if words:
                q = " OR ".join(f'"{w}"*' for w in words)
                try:
                    rows = self.db.execute(
                        "SELECT f.id, f.text FROM facts_fts JOIN facts f ON f.id = facts_fts.rowid "
                        "WHERE facts_fts MATCH ? ORDER BY bm25(facts_fts) LIMIT ?", (q, limit)).fetchall()
                    out = [r["text"] for r in rows]
                    for r in rows:
                        self.db.execute("UPDATE facts SET used=? WHERE id=?", (time.time(), r["id"]))
                except sqlite3.OperationalError:
                    pass
            if len(out) < 4:
                rows = self.db.execute("SELECT text FROM facts ORDER BY weight DESC, used DESC LIMIT ?", (4,)).fetchall()
                out += [r["text"] for r in rows if r["text"] not in out]
            self.db.commit()
        return out[:limit]

    # ── разговоры ──────────────────────────────────────────────
    def chat(self, chat_id: str, source: str = "panel") -> dict:
        with self.lock:
            row = self.db.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
            if not row:
                now = time.time()
                self.db.execute("INSERT INTO chats(id, title, source, created, updated) VALUES (?,?,?,?,?)",
                                (chat_id, "", source, now, now))
                self.db.commit()
                row = self.db.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
        return dict(row)

    def add(self, chat_id: str, role: str, content: str, extra: dict | None = None) -> None:
        with self.lock:
            self.db.execute("INSERT INTO messages(chat, role, content, extra, created) VALUES (?,?,?,?,?)",
                            (chat_id, role, content, json.dumps(extra or {}, ensure_ascii=False), time.time()))
            self.db.execute("UPDATE chats SET updated=? WHERE id=?", (time.time(), chat_id))
            if role == "user":
                self.db.execute("UPDATE chats SET title=? WHERE id=? AND (title IS NULL OR title='')",
                                (content.strip().splitlines()[0][:60] if content.strip() else "", chat_id))
            self.db.commit()

    def history(self, chat_id: str, limit: int = 200) -> list[dict]:
        with self.lock:
            rows = self.db.execute("SELECT role, content, extra, created FROM messages WHERE chat=? ORDER BY id DESC LIMIT ?",
                                   (chat_id, limit)).fetchall()
        out = []
        for r in reversed(rows):
            d = dict(r)
            d["extra"] = json.loads(d["extra"] or "{}")
            out.append(d)
        return out

    def summary(self, chat_id: str) -> str:
        with self.lock:
            row = self.db.execute("SELECT summary FROM chats WHERE id=?", (chat_id,)).fetchone()
        return row["summary"] if row else ""

    def set_summary(self, chat_id: str, text: str, keep_last: int) -> None:
        """Сжать старую часть разговора: конспект + последние keep_last сообщений."""
        with self.lock:
            self.db.execute("UPDATE chats SET summary=? WHERE id=?", (text, chat_id))
            ids = [r["id"] for r in self.db.execute("SELECT id FROM messages WHERE chat=? ORDER BY id DESC LIMIT ?",
                                                     (chat_id, keep_last)).fetchall()]
            if ids:
                self.db.execute(f"DELETE FROM messages WHERE chat=? AND id < {min(ids)}", (chat_id,))
            self.db.commit()

    def chats(self, limit: int = 50) -> list[dict]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM chats ORDER BY updated DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    def clear(self, chat_id: str) -> None:
        with self.lock:
            self.db.execute("DELETE FROM messages WHERE chat=?", (chat_id,))
            self.db.execute("UPDATE chats SET summary='' WHERE id=?", (chat_id,))
            self.db.commit()
