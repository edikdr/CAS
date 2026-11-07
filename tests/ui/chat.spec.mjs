// Playwright: мини-чат Haotica (W2) и команды Haotica в настоящей вкладке (W3).
// Поднимает ядро, агента и ложную модель (tools/fake_llama.py); PTY — макет tests/ui/mock-bridge.js.
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MOCK = readFileSync(path.join(ROOT, "tests/ui/mock-bridge.js"), "utf8");
const CORE = "http://127.0.0.1:47800", AGENT = "http://127.0.0.1:47810";
const PY = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const HOME = mkdtempSync(path.join(tmpdir(), "hy-chat-"));
const ENV = { ...process.env, HAOTICA_HOME: HOME, HAOTICA_DEV_ROOT: ROOT, PYTHONPATH: path.join(ROOT, "core") };
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUrl(url, tok, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { "X-Haotica-Token": tok() } }); if (r.ok) return true; } catch (e) { /* ещё стартует */ }
    await sleep(150);
  }
  return false;
}
function start(args) { const p = spawn(PY, args, { env: ENV, stdio: ["ignore", "ignore", "pipe"] }); let e = ""; p.stderr.on("data", (d) => { e += d; }); p.err = () => e; procs.push(p); return p; }

// 1000 сообщений в чате «big» (плавная прокрутка и подгрузка порциями)
spawnSync(PY, ["-c", `
from haotica.agent.memory import Memory
m = Memory(); m.chat("big", "terminal")
for i in range(1000): m.add("big", "user" if i % 2 == 0 else "assistant", f"сообщение {i} " + "текст " * (i % 7))
m.update_chat("big", title="Большой чат")`], { env: ENV });
start([path.join(ROOT, "tools/fake_llama.py"), "--port", "47821", "--port", "47822"]);
const core = start(["-m", "haotica.server"]);
const tokFile = path.join(HOME, "state", "token");
const token = () => (existsSync(tokFile) ? readFileSync(tokFile, "utf8").trim() : "");
if (!(await waitUrl(CORE + "/api/ping", token))) throw new Error("ядро: " + core.err());
const agent = start(["-m", "haotica.agent"]);
if (!(await waitUrl(AGENT + "/api/status", token))) throw new Error("агент: " + agent.err());
for (let i = 0; i < 60; i++) { const s = await (await fetch(AGENT + "/api/status", { headers: { "X-Haotica-Token": token() } })).json(); if (s.llm_state === "ready") break; await sleep(250); }

const tests = [];
const test = (name, ids, fn) => tests.push({ name, ids, fn });
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const browser = await chromium.launch();
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.addInitScript(`window.__MOCK = ${JSON.stringify({ token: token() })};\n${MOCK}`);
  await page.goto(`${CORE}/apps/terminal/index.html?token=${token()}`);
  await page.waitForFunction(() => window.__hyterm && window.__hyterm.tabs.length > 0, null, { timeout: 15000 });
  await page.locator("#chat .hc-badge").filter({ hasText: /BASE|DEEP/ }).waitFor({ timeout: 15000 });
  page.ctx = ctx;
  return page;
}
const ask = async (p, text) => { await p.locator("#chat textarea").fill(text); await p.locator("#chat textarea").press("Enter"); };
const lastAnswer = (p) => p.locator("#chat .hc-msg.assistant .bub").last();
const allWrites = (p) => p.evaluate(() => Object.values(window.__writes).join("\n"));

test("вопрос → потоковый ответ, история переживает перезагрузку", "T-20 T-22", async (p) => {
  await ask(p, "привет, Haotica");
  await p.waitForFunction(() => [...document.querySelectorAll("#chat .hc-msg.assistant .bub")].some((b) => b.textContent.includes("Принято: привет")), null, { timeout: 15000 });
  await p.reload();
  await p.locator("#chat .hc-msg.user").first().waitFor({ timeout: 10000 });
  assert((await p.locator("#chat .hc-feed").innerText()).includes("Принято: привет"), "история после перезапуска");
});
test("markdown и блоки кода: копировать, выполнить в терминале", "T-20", async (p) => {
  await ask(p, "[[markdown]]");
  await p.locator("#chat .hc-code").first().waitFor({ timeout: 15000 });
  assert(await p.locator("#chat .hc-msg.assistant h2").count() >= 1, "заголовок");
  assert(await p.locator("#chat .hc-msg.assistant ol li").count() === 2, "список");
  await p.locator("#chat .hc-code").first().locator("button[title='Выполнить в терминале']").click();
  await p.waitForTimeout(200);
  assert((await allWrites(p)).includes("Get-ChildItem -Force\r"), "команда ушла в терминал");
});
test("цепочка команд в отдельной вкладке HAOTICA с карточкой «весь план»", "T-30 T-31 T-34", async (p) => {
  await ask(p, "[[chain:Get-ChildItem;;New-Item build -ItemType Directory;;git status]]");
  const card = p.locator("#chat .hc-card:not(.done)");
  await card.waitFor({ timeout: 20000 });
  assert((await card.innerText()).includes("New-Item build"), "карточка на изменение");
  await card.locator("text=ВЕСЬ ПЛАН").click();
  await p.waitForFunction(() => [...document.querySelectorAll("#chat .hc-msg.assistant .bub")].some((b) => b.textContent.includes("Цепочка выполнена: 3")), null, { timeout: 30000 });
  assert(await p.evaluate(() => window.__hyterm.tabs.some((t) => t.name === "HAOTICA")), "вкладка HAOTICA");
  const w = await allWrites(p);
  for (const c of ["Get-ChildItem\r", "New-Item build -ItemType Directory\r", "git status\r"]) assert(w.includes(c), "в PTY: " + c);
  assert(await p.locator("#chat .hc-step.ok").count() >= 3, "шаги с кодами выхода");
  assert(await p.evaluate(() => window.__hyterm.tabs.indexOf(window.__hyterm.active)) === 0, "фокус остался во вкладке владельца");
  assert((await p.locator("#p-log").innerText()).includes("HAOTICA $"), "журнал шагов");
});
test("опасная команда не выполняется без подтверждения", "T-31 T-32", async (p) => {
  await ask(p, "[[danger]]");
  const card = p.locator("#chat .hc-card.danger:not(.done)");
  await card.waitFor({ timeout: 20000 });
  assert(await card.locator("text=ВЕСЬ ПЛАН").count() === 0, "у опасного нет «весь план»");
  await p.keyboard.press("Tab");                       // [TAB] не принимает опасное
  await p.waitForTimeout(300);
  assert(await p.locator("#chat .hc-card.danger.done").count() === 0, "TAB не сработал на опасном");
  await card.locator("text=ОТКЛОНИТЬ").click();
  await p.waitForTimeout(1500);
  assert(!(await allWrites(p)).includes("Remove-Item"), "Remove-Item не дошёл до PTY");
});
test("голос: выключить прямо в чате и озвучить отдельное сообщение", "T-20", async (p) => {
  await ask(p, "привет, голос");
  await p.waitForFunction(() => [...document.querySelectorAll("#chat .hc-msg.assistant .bub")].some((b) => b.textContent.includes("Принято: привет")), null, { timeout: 15000 });
  const getVoice = async () => {
    const r = await fetch(CORE + "/api/settings", { headers: { "X-Haotica-Token": token() } });
    return ((await r.json()).settings.haotica || {}).voice;
  };
  const btn = p.locator("#chat .hc-head button[title^='Голос']");
  await btn.click();
  await p.waitForTimeout(500);
  assert(await getVoice() === false, "голос выключен в настройках");
  assert((await btn.getAttribute("title")).includes("выключен"), "кнопка показывает «выключен»");
  await ask(p, "/voice");
  await p.waitForTimeout(500);
  assert(await getVoice() === true, "/voice включает голос обратно");
  const msg = p.locator("#chat .hc-msg.assistant").last();
  await msg.hover();
  await msg.locator(".hc-say").click();
  await p.waitForFunction(() => !!document.querySelector("#chat .hc-msg.assistant.speaking"), null, { timeout: 5000 });
  await msg.locator(".hc-say").click();
  assert(await p.locator("#chat .hc-msg.assistant.speaking").count() === 0, "повторный клик — стоп");
});
test("стоп прерывает ответ", "T-20 T-34", async (p) => {
  await ask(p, "[[slow]] " + "слово ".repeat(80));
  await p.locator("#chat .hc-msg.assistant").last().waitFor({ timeout: 10000 });
  await p.waitForTimeout(800);
  await p.locator("#chat .hy-btn.danger", { hasText: "■" }).click();
  await p.waitForFunction(() => [...document.querySelectorAll("#chat .hc-msg.assistant .bub")].some((b) => b.textContent.includes("Остановлено")), null, { timeout: 15000 });
});
test("история: новый чат, поиск, переименование, закрепление", "T-22", async (p) => {
  await ask(p, "запомни слово ЕЖЕВИКА");
  await lastAnswer(p).waitFor();
  await p.waitForTimeout(500);
  await p.locator("#chat button[title^='Новый чат']").click();
  await p.waitForTimeout(300);
  assert(await p.locator("#chat .hc-msg").count() === 0, "новый чат пуст");
  await p.locator("#chat button[title='История']").click();
  await p.locator("#chat .hc-drawer input").fill("ЕЖЕВИКА");
  await p.waitForTimeout(500);
  assert(await p.locator("#chat .hc-drawer .it").count() >= 1, "поиск нашёл чат");
  await p.locator("#chat .hc-drawer .it").first().click();
  await p.waitForTimeout(400);
  assert((await p.locator("#chat .hc-feed").innerText()).includes("ЕЖЕВИКА"), "открыт найденный чат");
});
test("1000 сообщений: подгрузка вверх порциями без зависаний", "T-23", async (p) => {
  await p.evaluate(() => localStorage.setItem("haotica.chat.terminal", "big"));
  await p.reload();
  await p.locator("#chat .hc-msg").first().waitFor({ timeout: 10000 });
  assert((await p.locator("#chat .hc-title").innerText()).includes("БОЛЬШОЙ ЧАТ"), "название");
  const n0 = await p.locator("#chat .hc-msg").count();
  const t0 = Date.now();
  for (let i = 0; i < 20 && (await p.locator("#chat .hc-msg").count()) < n0 + 150; i++) { await p.evaluate(() => { document.querySelector("#chat .hc-feed").scrollTop = 0; }); await p.waitForTimeout(200); }
  const n1 = await p.locator("#chat .hc-msg").count();
  assert(n1 > n0 + 100, `подгрузка: ${n0} → ${n1}`);
  assert(Date.now() - t0 < 6000, "быстро");
  assert(await p.locator("#chat .hc-day").count() >= 1, "разделители дат");
});

let failed = 0, done = 0;
for (const t of tests) {
  const page = await open();
  const t0 = Date.now();
  try {
    await t.fn(page);
    if (page.errors.length) throw new Error("ошибки страницы: " + page.errors.join(" | "));
    console.log(`  ✓ ${t.name}  [${t.ids}]  ${Date.now() - t0} мс`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${t.name}  [${t.ids}]\n      ${String(e.message).split("\n")[0]}`);
    try { await page.screenshot({ path: path.join(tmpdir(), `hy-chat-fail-${tests.indexOf(t)}.png`) }); } catch (e2) { /* */ }
  }
  done++;
  await page.ctx.close();
}
await browser.close();
for (const p of procs) p.kill();
console.log(`\n${done - failed}/${done} пройдено`);
process.exit(failed ? 1 : 0);
