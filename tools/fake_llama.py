"""Ложный llama-server для тестов Haotica (W8): OpenAI-совместимый /v1/chat/completions.

    python tools/fake_llama.py --port 47821 --port 47822 --port 47824

Поведение задаётся текстом последнего сообщения пользователя (удобно для автотестов):
  [[tool:ИМЯ {json}]]        — вызвать инструмент ИМЯ с аргументами json;
  [[chain:к1;;к2;;к3]]        — цепочка terminal_run: по шагу на каждый ответ инструмента, затем итог;
  [[danger]]                  — terminal_run с опасной командой (Remove-Item -Recurse -Force C:\\…);
  [[slow]]                    — медленный поток (≈ 3 с) — для проверки кнопки «стоп»;
  [[think]]                   — сначала «мысли» (reasoning_content), потом ответ;
  [[markdown]]                — ответ с заголовком, списком и блоками кода (powershell/bash);
иначе — короткий ответ-эхо. Если последнее сообщение — результат инструмента, отвечает итогом
с кодом выхода. Нестримовые запросы (подсказки, названия чатов) получают короткий текст.
GET /health → 200 (или 503 первые --warmup секунд), GET /v1/models, GET /props.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import time

from aiohttp import web

DANGER = r"Remove-Item -Recurse -Force C:\Users\Public\haotica-test"


def _last(messages: list[dict], role: str) -> dict | None:
    for m in reversed(messages):
        if m.get("role") == role:
            return m
    return None


def _text(m: dict | None) -> str:
    if not m:
        return ""
    c = m.get("content")
    if isinstance(c, list):
        return " ".join(p.get("text", "") for p in c if isinstance(p, dict))
    return str(c or "")


def plan(body: dict) -> dict:
    """Решить, что ответить: {'text':…, 'reasoning':…, 'calls':[…], 'delay':…}."""
    msgs = body.get("messages") or []
    user = _text(_last(msgs, "user"))
    last = msgs[-1] if msgs else {}
    tools = {t.get("function", {}).get("name") for t in body.get("tools") or []}
    run_tool = "terminal_run" if "terminal_run" in tools or not tools else "run_command"
    out: dict = {"text": "", "reasoning": "", "calls": [], "delay": 0.01}
    if "[[slow]]" in user:
        out["delay"] = 0.15
    if "[[think]]" in user:
        out["reasoning"] = "Пользователь проверяет режим мыслей. Отвечу коротко."
    m = re.search(r"\[\[chain:(.+?)\]\]", user, re.S)
    if m:
        steps = [s.strip() for s in m.group(1).split(";;") if s.strip()]
        done = sum(1 for x in msgs[msgs.index(_last(msgs, "user")):] if x.get("role") == "tool")
        if done < len(steps):
            out["calls"] = [{"name": run_tool, "arguments": {"command": steps[done], "reason": f"шаг {done + 1}"}}]
            out["text"] = f"Шаг {done + 1} из {len(steps)}."
        else:
            out["text"] = f"Цепочка выполнена: {len(steps)} шагов. Итог: {_text(last)[:120]}"
        return out
    if last.get("role") == "tool":
        res = _text(last)
        code = re.search(r'"exit"\s*:\s*(-?\d+)', res)
        out["text"] = f"Готово. Код выхода: {code.group(1) if code else '?'}."
        return out
    m = re.search(r"\[\[tool:(\w+)\s*(\{.*?\})?\]\]", user, re.S)
    if m:
        try:
            args = json.loads(m.group(2) or "{}")
        except ValueError:
            args = {}
        out["calls"] = [{"name": m.group(1), "arguments": args}]
        return out
    if "[[danger]]" in user:
        out["calls"] = [{"name": run_tool, "arguments": {"command": DANGER, "reason": "проверка фильтра"}}]
        return out
    if "[[markdown]]" in user:
        out["text"] = ("## План\n\n1. Проверить папку\n2. Запустить тесты\n\n```powershell\nGet-ChildItem -Force\n```\n\n"
                       "```bash\nls -la\n```\n\nГотово — **жми** «выполнить».")
        return out
    out["text"] = f"Принято: {user[:160]}" if user else "Привет! Я на связи."
    return out


def chunks(text: str) -> list[str]:
    return re.findall(r"\S+\s*|\s+", text) or [text]


async def completions(request: web.Request) -> web.StreamResponse:
    body = await request.json()
    request.app["log"].append(body)
    p = plan(body)
    model = body.get("model", "fake")
    if not body.get("stream"):
        msgs = body.get("messages") or []
        sys_txt = _text(msgs[0]) if msgs and msgs[0].get("role") == "system" else ""
        text = "Тестовый чат" if re.search(r"назван|title", sys_txt, re.I) else (p["text"] or "ok")[:200]
        msg: dict = {"role": "assistant", "content": text}
        if p["calls"]:
            msg["tool_calls"] = [{"id": f"call_{i}", "type": "function",
                                  "function": {"name": c["name"], "arguments": json.dumps(c["arguments"])}}
                                 for i, c in enumerate(p["calls"])]
        return web.json_response({"id": "fake", "object": "chat.completion", "model": model,
                                  "choices": [{"index": 0, "message": msg, "finish_reason": "stop"}],
                                  "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}})
    resp = web.StreamResponse(headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache"})
    await resp.prepare(request)

    async def send(obj) -> None:
        await resp.write(b"data: " + json.dumps(obj, ensure_ascii=False).encode() + b"\n\n")

    def ev(delta: dict, finish=None) -> dict:
        return {"id": "fake", "object": "chat.completion.chunk", "created": int(time.time()), "model": model,
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
    t0 = time.time()
    n = 0
    try:
        for part in chunks(p["reasoning"]) if p["reasoning"] else []:
            await send(ev({"reasoning_content": part}))
            await asyncio.sleep(p["delay"])
        for part in chunks(p["text"]) if p["text"] else []:
            await send(ev({"content": part}))
            n += 1
            await asyncio.sleep(p["delay"])
        for i, c in enumerate(p["calls"]):
            args = json.dumps(c["arguments"], ensure_ascii=False)
            await send(ev({"tool_calls": [{"index": i, "id": f"call_{i}", "type": "function",
                                           "function": {"name": c["name"], "arguments": ""}}]}))
            for j in range(0, len(args), 16):
                await send(ev({"tool_calls": [{"index": i, "function": {"arguments": args[j:j + 16]}}]}))
        await send(ev({}, "tool_calls" if p["calls"] else "stop"))
        dt = max(0.001, time.time() - t0)
        await send({"id": "fake", "object": "chat.completion.chunk", "model": model, "choices": [],
                    "usage": {"prompt_tokens": 42, "completion_tokens": n, "total_tokens": 42 + n},
                    "timings": {"predicted_per_second": round(n / dt, 1), "predicted_n": n}})
        await resp.write(b"data: [DONE]\n\n")
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    return resp


def create_app(warmup: float = 0.0) -> web.Application:
    app = web.Application()
    app["t0"] = time.time()
    app["log"] = []

    async def health(_r):
        if time.time() - app["t0"] < warmup:
            return web.json_response({"status": "loading model"}, status=503)
        return web.json_response({"status": "ok"})

    async def models(_r):
        return web.json_response({"object": "list", "data": [{"id": "fake", "object": "model"}]})

    async def props(_r):
        return web.json_response({"default_generation_settings": {"n_ctx": 32768}, "total_slots": 1})

    async def requests_log(_r):
        return web.json_response(app["log"][-50:])

    app.router.add_get("/health", health)
    app.router.add_get("/v1/models", models)
    app.router.add_get("/props", props)
    app.router.add_get("/_log", requests_log)
    app.router.add_post("/v1/chat/completions", completions)
    return app


async def _serve(ports: list[int], warmup: float) -> None:
    runners = []
    for port in ports:
        r = web.AppRunner(create_app(warmup), access_log=None)
        await r.setup()
        await web.TCPSite(r, "127.0.0.1", port).start()
        runners.append(r)
        print(f"fake llama-server на 127.0.0.1:{port}", flush=True)
    await asyncio.Event().wait()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, action="append", default=[])
    ap.add_argument("--warmup", type=float, default=0.0, help="секунд отвечать 503 на /health")
    a = ap.parse_args()
    try:
        asyncio.run(_serve(a.port or [47821], a.warmup))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
