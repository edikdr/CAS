"""Агент Haotica с ложной моделью (tools/fake_llama.py): чаты и история (W2), цепочки команд через терминал (W3)."""
import asyncio
import json

import aiohttp
import pytest
from aiohttp import web

pytest.importorskip("aiohttp")

from haotica import cli, paths  # noqa: E402

BASE = f"http://127.0.0.1:{paths.PORT_HAOTICA}"


@pytest.fixture()
def env(tmp_path):
    import fake_llama
    from haotica.agent.server import create_app

    async def setup():
        cli.ensure_token()
        runners = []
        for port in (paths.PORT_LLM_BASE, paths.PORT_LLM_FAST):
            r = web.AppRunner(fake_llama.create_app(), access_log=None)
            await r.setup()
            await web.TCPSite(r, "127.0.0.1", port).start()
            runners.append(r)
        app = create_app()
        r = web.AppRunner(app, access_log=None)
        await r.setup()
        await web.TCPSite(r, "127.0.0.1", paths.PORT_HAOTICA).start()
        runners.append(r)
        agent = app["agent"]
        for _ in range(50):
            if agent.llm.state.get("base") == "ready":
                break
            await asyncio.sleep(0.1)
        sess = aiohttp.ClientSession(headers={"X-Haotica-Token": paths.TOKEN_FILE.read_text().strip()})
        return runners, agent, sess

    async def teardown(runners, sess):
        await sess.close()
        for r in reversed(runners):
            await r.cleanup()
    return setup, teardown


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


async def _terminal(sess, log, accept="plan", stop_after=None):
    """Изображает терминал: принимает exec, отвечает результатом; карточки принимает/отклоняет."""
    async with sess.get(BASE + "/api/stream?topics=exec,card,exec_cancel,term_read") as r:
        ev = ""
        async for raw in r.content:
            line = raw.decode().strip()
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:"):
                d = json.loads(line[5:])
                log.append((ev, d))
                if ev in ("exec", "term_read"):
                    c = await sess.post(BASE + "/api/terminal/claim", json={"exec_id": d["id"], "win": "w1"})
                    log.append(("claim", {"status": c.status}))
                    c2 = await sess.post(BASE + "/api/terminal/claim", json={"exec_id": d["id"], "win": "w2"})
                    log.append(("claim2", {"status": c2.status}))
                if ev == "exec":
                    code = 3 if "fail" in d["command"] else 0
                    await sess.post(BASE + "/api/terminal/result", json={"exec_id": d["id"], "exit": code, "duration": 12,
                                                                          "cwd": "C:\\proj", "output_tail": f"ok {d['command']}"})
                elif ev == "term_read":
                    await sess.post(BASE + "/api/terminal/result", json={
                        "exec_id": d["id"], "screen": "PS C:\\proj> npm test\nError: token=ghp_abcdefghijklmnopqrstuvwxyz0123456789\n",
                        "blocks": [{"cmd": "npm test", "exit": 1, "ms": 900, "cwd": "C:\\proj"}], "cwd": "C:\\proj",
                        "shell": "pwsh", "tab": "SESSION 1", "tabs": ["SESSION 1"]})
                elif ev == "card":
                    act = accept if d.get("risk", {}).get("level") != "danger" else "reject"
                    await sess.post(BASE + f"/api/card/{d['id']}/{act}", json={})


def test_chats_history_search_export(env):
    setup, teardown = env

    async def go():
        runners, agent, s = await setup()
        try:
            r = await (await s.post(BASE + "/api/chats", json={"source": "terminal"})).json()
            cid = r["chat"]["id"]
            r = await (await s.post(BASE + "/api/chat", json={"text": "привет, проверка", "chat": cid, "wait": True})).json()
            assert r["ok"] and "привет" in r["text"], r
            for i in range(120):
                agent.memory.add(cid, "user" if i % 2 == 0 else "assistant", f"сообщение {i}")
            p1 = await (await s.get(BASE + f"/api/history?chat={cid}&limit=50")).json()
            assert len(p1["messages"]) == 50 and p1["more"]
            p2 = await (await s.get(BASE + f"/api/history?chat={cid}&limit=50&before={p1['messages'][0]['id']}")).json()
            assert p2["messages"][-1]["id"] < p1["messages"][0]["id"]
            await s.patch(BASE + f"/api/chats/{cid}", json={"title": "Мой чат", "pinned": True})
            lst = await (await s.get(BASE + "/api/chats")).json()
            assert lst["chats"][0]["id"] == cid and lst["chats"][0]["pinned"] == 1 and lst["chats"][0]["title"] == "Мой чат"
            found = await (await s.get(BASE + "/api/chats/search?q=сообщение 11")).json()
            assert any(x["chat"] == cid for x in found["results"])
            md = await (await s.get(BASE + f"/api/chats/{cid}/export?format=md")).text()
            assert md.startswith("# Мой чат") and "сообщение 119" in md
            js = json.loads(await (await s.get(BASE + f"/api/chats/{cid}/export?format=json")).text())
            assert len(js["messages"]) == 122
            n0 = len(agent.memory.history(cid, 500))
            r = await (await s.post(BASE + "/api/chat", json={"chat": cid, "retry": True, "text": "", "wait": True})).json()
            assert r["ok"] and len(agent.memory.history(cid, 500)) == n0, "повтор не плодит сообщения"
            assert (await (await s.delete(BASE + f"/api/chats/{cid}")).json())["deleted"]
        finally:
            await teardown(runners, s)
    run(go())


def test_terminal_chain_with_plan_approval(env):
    setup, teardown = env

    async def go():
        runners, agent, s = await setup()
        log = []
        term = asyncio.create_task(_terminal(s, log))
        await asyncio.sleep(0.3)
        try:
            r = await (await s.post(BASE + "/api/chat", json={
                "text": "[[chain:Get-ChildItem;;New-Item build -ItemType Directory;;git status]]", "chat": "t1",
                "source": "terminal", "context": {"cwd": "C:\\proj", "shell": "pwsh"}, "wait": True})).json()
            assert r["ok"] and "Цепочка выполнена: 3" in r["text"], r
            execs = [d["command"] for ev, d in log if ev == "exec"]
            assert execs == ["Get-ChildItem", "New-Item build -ItemType Directory", "git status"], execs
            cards = [d for ev, d in log if ev == "card"]
            assert len(cards) == 1 and cards[0]["plan"], "одна карточка на изменение (план), чтение — без карточки"
            assert [st["exit"] for st in r["steps"]] == [0, 0, 0]
            hist = agent.memory.history("t1", 10)
            assert hist[-1]["extra"]["steps"][1]["command"].startswith("New-Item")
            assert (paths.LOG_DIR / "agent-steps.jsonl").exists()
        finally:
            term.cancel()
            await teardown(runners, s)
    run(go())


def test_terminal_read_and_single_window_claim(env):
    setup, teardown = env

    async def go():
        runners, agent, s = await setup()
        log = []
        term = asyncio.create_task(_terminal(s, log))
        await asyncio.sleep(0.3)
        try:
            r = await (await s.post(BASE + "/api/chat", json={
                "text": '[[tool:terminal_read {"lines": 50}]]', "chat": "t5", "source": "terminal",
                "context": {"shell": "pwsh", "win": "w1"}, "wait": True})).json()
            assert r["ok"] and r["steps"][0]["tool"] == "terminal_read" and r["steps"][0]["ok"], r
            assert [d["status"] for ev, d in log if ev == "claim"] == [200]
            assert [d["status"] for ev, d in log if ev == "claim2"] == [409], "второе окно не должно брать ту же команду"
            res = await agent.terminal_read({}, {"win": "w1"})
            assert "npm test" in res["screen"] and res["blocks"][0]["exit"] == 1
            assert "ghp_abcdefghijklmnopqrstuvwxyz0123456789" not in json.dumps(res), "секрет с экрана не уходит модели"
        finally:
            term.cancel()
            await teardown(runners, s)
    run(go())


def test_danger_never_runs_without_confirmation(env):
    setup, teardown = env

    async def go():
        runners, agent, s = await setup()
        log = []
        term = asyncio.create_task(_terminal(s, log, accept="plan"))
        await asyncio.sleep(0.3)
        try:
            r = await (await s.post(BASE + "/api/chat", json={"text": "[[danger]]", "chat": "t2", "source": "terminal",
                                                              "context": {"shell": "pwsh"}, "wait": True})).json()
            cards = [d for ev, d in log if ev == "card"]
            assert cards and cards[0]["risk"]["level"] == "danger" and not cards[0]["plan"]
            assert not [d for ev, d in log if ev == "exec"], "опасная команда не должна дойти до терминала"
            assert r["ok"]
            # закрытая зона — даже карточки нет
            log.clear()
            r = await (await s.post(BASE + "/api/chat", json={
                "text": '[[tool:terminal_run {"command": "Get-Content $env:APPDATA\\\\Microsoft\\\\Credentials\\\\x", "reason": "x"}]]',
                "chat": "t2", "source": "terminal", "context": {"shell": "pwsh"}, "wait": True})).json()
            assert not [d for ev, d in log if ev in ("exec", "card")]
            assert r["steps"][0]["error"].startswith("отказано")
        finally:
            term.cancel()
            await teardown(runners, s)
    run(go())


def test_stop_interrupts_turn(env):
    setup, teardown = env

    async def go():
        runners, agent, s = await setup()
        try:
            task = asyncio.create_task(s.post(BASE + "/api/chat", json={"text": "[[slow]] " + "слово " * 60, "chat": "t3",
                                                                       "wait": True}))
            await asyncio.sleep(1.0)
            await s.post(BASE + "/api/stop", json={"chat": "t3"})
            r = await (await task).json()
            assert r["ok"] and "Остановлено" in r["text"], r
        finally:
            await teardown(runners, s)
    run(go())


def test_model_crash_mid_request_retried(env):
    """Процесс модели оборвал соединение до первого слова — Haotica дожидается перезапуска и повторяет, без ошибки."""
    setup, teardown = env

    async def go():
        runners, agent, s = await setup()
        real, n = agent.llm.chat, []

        async def flaky(*a, **k):
            n.append(1)
            if len(n) == 1:
                raise aiohttp.ServerDisconnectedError()
            async for ev in real(*a, **k):
                yield ev
        agent.llm.chat = flaky
        try:
            r = await (await s.post(BASE + "/api/chat", json={"text": "привет", "chat": "t4", "wait": True})).json()
            assert r["ok"] and r.get("text") and "ошибка модели" not in r["text"], r
            assert len(n) == 2
        finally:
            await teardown(runners, s)
    run(go())


def test_step_limit_ends_with_summary(env):
    """Шаги кончились — модель подводит итог (последний раунд без инструментов), а не «слишком много шагов»."""
    from haotica import config
    setup, teardown = env

    async def go():
        runners, agent, s = await setup()
        config.set_many({"haotica.max_steps": 4, "haotica.unrestricted": True})
        log: list = []
        term = asyncio.create_task(_terminal(s, log))
        try:
            await asyncio.sleep(0.3)
            r = await (await s.post(BASE + "/api/chat", json={
                "text": "[[chain:echo 1;;echo 2;;echo 3;;echo 4;;echo 5;;echo 6]]", "chat": "t5", "wait": True})).json()
            assert r["ok"], r
            assert "Слишком много шагов" not in r["text"] and "Шаги на этот ход закончились" in r["text"], r["text"]
            assert sum(1 for ev, _ in log if ev == "exec") == 4
        finally:
            term.cancel()
            config.set_many({"haotica.max_steps": 40, "haotica.unrestricted": False})
            await teardown(runners, s)
    run(go())
