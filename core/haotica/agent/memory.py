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


MIGRATIONS = [                                # (таблица, колонка, определение)
    ("chats", "pinned", "INTEGER DEFAULT 0"),
    ("chats", "titled", "INTEGER DEFAULT 0"),    # 1 — название дал человек или быстрая модель
]


class Memory:
    def __init__(self) -> None:
        paths.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(paths.MEMORY_DB, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        # lower() в SQLite понимает только латиницу — для поиска по-русски нужна своя функция
        self.db.create_function("ulower", 1, lambda v: v.lower() if isinstance(v, str) else v, deterministic=True)
        self.lock = threading.Lock()
        with self.lock:
            self.db.executescript(SCHEMA)
            for table, col, decl in MIGRATIONS:
                cols = {r["name"] for r in self.db.execute(f"PRAGMA table_info({table})")}
                if col not in cols:
                    self.db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
            self.db.execute("CREATE INDEX IF NOT EXISTS chats_updated ON chats(pinned DESC, updated DESC)")
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

    def add(self, chat_id: str, role: str, content: str, extra: dict | None = None) -> int:
        with self.lock:
            cur = self.db.execute("INSERT INTO messages(chat, role, content, extra, created) VALUES (?,?,?,?,?)",
                                  (chat_id, role, content, json.dumps(extra or {}, ensure_ascii=False), time.time()))
            mid = cur.lastrowid
            self.db.execute("UPDATE chats SET updated=? WHERE id=?", (time.time(), chat_id))
            if role == "user":
                self.db.execute("UPDATE chats SET title=? WHERE id=? AND (title IS NULL OR title='')",
                                (content.strip().splitlines()[0][:60] if content.strip() else "", chat_id))
            self.db.commit()
        return mid

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

    def chats(self, limit: int = 50, q: str = "") -> list[dict]:
        """Список чатов: закреплённые сверху, затем по последнему сообщению; q — фильтр по названию."""
        sql = ("SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.chat=c.id) AS count, "
               "(SELECT substr(content,1,120) FROM messages m WHERE m.chat=c.id ORDER BY id DESC LIMIT 1) AS last "
               "FROM chats c")
        args: list = []
        if q:
            sql += " WHERE ulower(c.title) LIKE ?"
            args.append(f"%{q.lower()}%")
        sql += " ORDER BY c.pinned DESC, c.updated DESC LIMIT ?"
        args.append(limit)
        with self.lock:
            rows = self.db.execute(sql, args).fetchall()
        return [dict(r) for r in rows]

    def new_chat(self, source: str = "panel", title: str = "") -> dict:
        import uuid
        cid = "c" + uuid.uuid4().hex[:11]
        now = time.time()
        with self.lock:
            self.db.execute("INSERT INTO chats(id, title, source, created, updated, titled) VALUES (?,?,?,?,?,?)",
                            (cid, title[:80], source, now, now, 1 if title else 0))
            self.db.commit()
        return self.get_chat(cid)

    def get_chat(self, chat_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT * FROM chats WHERE id=?", (chat_id,)).fetchone()
        return dict(row) if row else None

    def update_chat(self, chat_id: str, title: str | None = None, pinned: bool | None = None,
                    auto: bool = False) -> dict | None:
        with self.lock:
            if title is not None:
                if auto:      # быстрая модель не перезаписывает название, данное человеком
                    self.db.execute("UPDATE chats SET title=?, titled=1 WHERE id=? AND titled=0", (title[:80], chat_id))
                else:
                    self.db.execute("UPDATE chats SET title=?, titled=1 WHERE id=?", (title[:80], chat_id))
            if pinned is not None:
                self.db.execute("UPDATE chats SET pinned=? WHERE id=?", (1 if pinned else 0, chat_id))
            self.db.commit()
        return self.get_chat(chat_id)

    def delete_chat(self, chat_id: str) -> bool:
        with self.lock:
            self.db.execute("DELETE FROM messages WHERE chat=?", (chat_id,))
            n = self.db.execute("DELETE FROM chats WHERE id=?", (chat_id,)).rowcount
            self.db.commit()
        return n > 0

    def page(self, chat_id: str, before: int | None = None, limit: int = 50) -> dict:
        """Порция сообщений для бесконечной прокрутки вверх: самые новые до before (id), по возрастанию."""
        limit = max(1, min(500, limit))
        with self.lock:
            if before:
                rows = self.db.execute("SELECT id, role, content, extra, created FROM messages WHERE chat=? AND id<? "
                                       "ORDER BY id DESC LIMIT ?", (chat_id, before, limit + 1)).fetchall()
            else:
                rows = self.db.execute("SELECT id, role, content, extra, created FROM messages WHERE chat=? "
                                       "ORDER BY id DESC LIMIT ?", (chat_id, limit + 1)).fetchall()
        more = len(rows) > limit
        out = []
        for r in reversed(rows[:limit]):
            d = dict(r)
            d["extra"] = json.loads(d["extra"] or "{}")
            out.append(d)
        return {"messages": out, "more": more}

    def search(self, q: str, limit: int = 40) -> list[dict]:
        """Поиск по названиям и тексту сообщений (без учёта регистра)."""
        q = q.strip().lower()
        if not q:
            return []
        like = f"%{q}%"
        with self.lock:
            rows = self.db.execute(
                "SELECT m.id AS msg, m.chat, m.role, substr(m.content, max(1, instr(ulower(m.content), ?) - 40), 160) AS snippet, "
                "m.created, c.title FROM messages m JOIN chats c ON c.id = m.chat WHERE ulower(m.content) LIKE ? "
                "ORDER BY m.id DESC LIMIT ?", (q, like, limit)).fetchall()
            titles = self.db.execute("SELECT id AS chat, title, updated AS created FROM chats WHERE ulower(title) LIKE ? "
                                     "ORDER BY updated DESC LIMIT 20", (like,)).fetchall()
        seen, out = set(), []
        for r in [*titles, *rows]:
            d = dict(r)
            key = (d["chat"], d.get("msg"))
            if key not in seen:
                seen.add(key)
                out.append(d)
        return out[:limit]

    def export(self, chat_id: str, fmt: str = "md") -> str:
        c = self.get_chat(chat_id) or {"id": chat_id, "title": chat_id}
        with self.lock:
            rows = self.db.execute("SELECT id, role, content, extra, created FROM messages WHERE chat=? ORDER BY id",
                                   (chat_id,)).fetchall()
        msgs = [{**dict(r), "extra": json.loads(r["extra"] or "{}")} for r in rows]
        if fmt == "json":
            return json.dumps({"chat": c, "summary": self.summary(chat_id), "messages": msgs}, ensure_ascii=False, indent=1)
        out = [f"# {c.get('title') or chat_id}", ""]
        if self.summary(chat_id):
            out += ["> Конспект раннего разговора:", "> " + self.summary(chat_id).replace("\n", "\n> "), ""]
        for m in msgs:
            who = {"user": "Вы", "assistant": "Haotica"}.get(m["role"], m["role"])
            out.append(f"**{who}** · {time.strftime('%d.%m.%Y %H:%M', time.localtime(m['created']))}")
            out.append("")
            for st in m["extra"].get("steps", []) or []:
                out.append(f"- `{st.get('command') or st.get('tool')}` → {st.get('exit', '—')}")
            out.append(m["content"])
            out.append("")
        return "\n".join(out)

    def last_user(self, chat_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT id, content, extra FROM messages WHERE chat=? AND role='user' ORDER BY id DESC LIMIT 1",
                                  (chat_id,)).fetchone()
        return dict(row) if row else None

    def drop_after(self, chat_id: str, msg_id: int) -> int:
        """Удалить сообщения после msg_id (для «повторить ответ»)."""
        with self.lock:
            n = self.db.execute("DELETE FROM messages WHERE chat=? AND id>?", (chat_id, msg_id)).rowcount
            self.db.commit()
        return n

    def clear(self, chat_id: str) -> None:
        with self.lock:
            self.db.execute("DELETE FROM messages WHERE chat=?", (chat_id,))
            self.db.execute("UPDATE chats SET summary='' WHERE id=?", (chat_id,))
            self.db.commit()
