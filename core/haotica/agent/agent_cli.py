"""haotica ask "…" (в zsh: hy …, ?? …) — вопрос Haotica из командной строки, ответ потоком."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

from .. import client, paths


def _post_card(cid: str, accept: bool) -> None:
    client.haotica("POST", f"/api/card/{cid}/{'accept' if accept else 'reject'}", {})


def _card(c: dict) -> None:
    risk = (c.get("risk") or {}).get("level", "write")
    print(f"\n\033[33m┌ HAOTICA // {c.get('title', 'ДЕЙСТВИЕ')} [{risk.upper()}]\033[0m", file=sys.stderr)
    print(f"\033[33m│\033[0m {c.get('text', '')}", file=sys.stderr)
    if c.get("why"):
        print(f"\033[33m│\033[0m {c['why']}", file=sys.stderr)
    ans = ""
    if sys.stdin.isatty():
        try:
            with open("/dev/tty") as tty:
                print("\033[33m└\033[0m принять? [y/N] ", end="", file=sys.stderr, flush=True)
                ans = tty.readline().strip().lower()
        except OSError:
            ans = ""
    accept = ans in ("y", "yes", "д", "да")
    _post_card(c["id"], accept)
    if accept and c.get("kind") == "command" and c.get("command"):
        print(f"\n$ {c['command']}", file=sys.stderr)


def ask(text: str, chat: str = "cli") -> int:
    if not text.strip():
        print("использование: haotica ask \"вопрос\"", file=sys.stderr)
        return 2
    body = json.dumps({"text": text, "source": "cli", "chat": chat, "wait": False,
                       "context": {"cwd": os.getcwd()}}).encode()
    req = urllib.request.Request(f"http://{paths.HOST}:{paths.PORT_HAOTICA}/api/chat", data=body, method="POST",
                                 headers={"X-Haotica-Token": client.token(), "Content-Type": "application/json"})
    # карточки приходят в общий поток событий; слушаем его параллельно
    import threading
    stop = threading.Event()

    def cards() -> None:
        u = f"http://{paths.HOST}:{paths.PORT_HAOTICA}/api/stream?topics=card"
        r2 = urllib.request.Request(u, headers={"X-Haotica-Token": client.token()})
        try:
            with urllib.request.urlopen(r2, timeout=3600) as s:
                ev = ""
                for raw in s:
                    if stop.is_set():
                        return
                    line = raw.decode("utf-8", "replace").rstrip("\n")
                    if line.startswith("event:"):
                        ev = line[6:].strip()
                    elif line.startswith("data:") and ev == "card":
                        c = json.loads(line[5:])
                        if c.get("chat") == chat:
                            _card(c)
        except (OSError, ValueError):
            return
    threading.Thread(target=cards, daemon=True).start()
    rc = 0
    try:
        with urllib.request.urlopen(req, timeout=3600) as r:
            ev = ""
            for raw in r:
                line = raw.decode("utf-8", "replace").rstrip("\n")
                if line.startswith("event:"):
                    ev = line[6:].strip()
                    continue
                if not line.startswith("data:"):
                    continue
                d = json.loads(line[5:])
                if ev == "delta":
                    print(d["text"], end="", flush=True)
                elif ev == "tool":
                    print(f"\033[2m[{d['name']}]\033[0m", end=" ", file=sys.stderr, flush=True)
                elif ev == "error":
                    print(f"\033[31mHaotica: {d['error']}\033[0m", file=sys.stderr)
                    rc = 1
        print()
    except urllib.error.HTTPError as e:
        print(f"Haotica: HTTP {e.code}", file=sys.stderr)
        rc = 1
    except (urllib.error.URLError, ConnectionError, TimeoutError):
        print("Haotica не отвечает (systemctl --user status haotica-agent)", file=sys.stderr)
        rc = 1
    finally:
        stop.set()
    return rc


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    return ask(" ".join(argv) if argv else (sys.stdin.read() if not sys.stdin.isatty() else ""))


def register(sub) -> None:
    p = sub.add_parser("ask", help="спросить Haotica")
    p.add_argument("text", nargs="*")
    p.add_argument("--chat", default="cli")
    p.set_defaults(fn=lambda a: ask(" ".join(a.text) if a.text else (sys.stdin.read() if not sys.stdin.isatty() else ""),
                                    a.chat))


if __name__ == "__main__":
    sys.exit(main())

