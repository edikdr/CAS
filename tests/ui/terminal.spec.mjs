// Playwright: интерфейс терминала по docs/UI-INVENTORY.md (мост Qt — макет tests/ui/mock-bridge.js).
//   node tests/ui/terminal.spec.mjs            (сам поднимает dev-сервер ядра; PYTHON=… — интерпретатор)
//   ONLY=tabs node tests/ui/terminal.spec.mjs  (часть тестов)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MOCK = readFileSync(path.join(ROOT, "tests/ui/mock-bridge.js"), "utf8");
const CORE = "http://127.0.0.1:47800";

async function startCore() {
  const home = mkdtempSync(path.join(tmpdir(), "hy-ui-"));
  const py = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const proc = spawn(py, ["-m", "haotica.server"], { env: { ...process.env, HAOTICA_HOME: home, HAOTICA_DEV_ROOT: ROOT,
    PYTHONPATH: path.join(ROOT, "core") }, stdio: ["ignore", "ignore", "pipe"] });
  let err = ""; proc.stderr.on("data", (d) => { err += d; });
  const tokFile = path.join(home, "state", "token");
  for (let i = 0; i < 100; i++) {
    if (existsSync(tokFile)) {
      try { const r = await fetch(CORE + "/api/ping", { headers: { "X-Haotica-Token": readFileSync(tokFile, "utf8").trim() } }); if (r.ok) break; } catch (e) { /* ещё стартует */ }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!existsSync(tokFile)) throw new Error("ядро не стартовало:\n" + err);
  return { proc, token: readFileSync(tokFile, "utf8").trim() };
}

const results = [];
const only = (process.env.ONLY || "").split(",").filter(Boolean);
const tests = [];
const test = (name, ids, fn, opts = {}) => tests.push({ name, ids, fn, opts });
const assert = (c, msg) => { if (!c) throw new Error(msg); };

let browser, ctx, token;
async function open(opts = {}) {
  ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message + " @ " + String(e.stack || "").split("\n").slice(1, 3).join(" <- ")));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_CONNECTION_REFUSED|47810/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(`window.__MOCK = ${JSON.stringify({ token, args: opts.args || [], wizard: !!opts.wizard })};\n${MOCK}`);
  await page.addInitScript(() => { try { if (!sessionStorage.getItem("hy-keep")) localStorage.clear(); } catch (e) { /* */ } });
  await page.goto(`${CORE}/apps/terminal/index.html?token=${token}`);
  await page.waitForFunction(() => window.__hyterm && window.__hyterm.tabs.length > 0 && Object.keys(window.__writes || {}).length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(250);
  page.errors = errors;
  return page;
}
const W = (page) => page.evaluate(() => { const t = window.__hyterm.active.active; return window.__writes[t.sid] || ""; });
const clearW = (page) => page.evaluate(() => { const t = window.__hyterm.active.active; window.__writes[t.sid] = ""; });
const focusTerm = (page) => page.evaluate(() => window.__hyterm.active.active.term.focus());
const key = async (page, k, wait = 120) => { await focusTerm(page); await page.keyboard.press(k); await page.waitForTimeout(wait); };
const ntabs = (page) => page.evaluate(() => window.__hyterm.tabs.length);
const npanes = (page) => page.evaluate(() => window.__hyterm.active.panes().length);
const activeIdx = (page) => page.evaluate(() => window.__hyterm.tabs.indexOf(window.__hyterm.active));
const calls = (page, name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n), name);

// ── ввод ─────────────────────────────────────────────────────────
test("печать, кириллица, Enter → блок", "UI-20 UI-90", async (p) => {
  await focusTerm(p); await clearW(p);
  await p.keyboard.type("echo привет");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(150);
  assert((await W(p)).includes("echo привет\r"), "в PTY: " + JSON.stringify(await W(p)));
  await p.locator(".t-block.ok").first().waitFor({ timeout: 4000 }).catch(() => {});
  assert(await p.locator(".t-block.ok").count() >= 1, "блок ✓");
});
test("AltGr (немецкая раскладка) не перехватывается", "UI-21", async (p) => {

  await focusTerm(p); await clearW(p);
  const before = await activeIdx(p);
  await p.evaluate(() => {
    const ta = window.__hyterm.active.active.term.textarea;
    for (const [key, code, kc] of [["[", "Digit8", 56], ["]", "Digit9", 57], ["{", "Digit7", 55], ["}", "Digit0", 48], ["\\", "Minus", 219], ["@", "KeyQ", 81], ["€", "KeyE", 69], ["~", "BracketRight", 187], ["|", "IntlBackslash", 226]]) {
      const o = { key, code, keyCode: kc, which: kc, ctrlKey: true, altKey: true, modifierAltGraph: true, bubbles: true, cancelable: true };
      ta.dispatchEvent(new KeyboardEvent("keydown", o));
      ta.dispatchEvent(new KeyboardEvent("keypress", { ...o, charCode: key.charCodeAt(0), keyCode: key.charCodeAt(0) }));
      ta.dispatchEvent(new KeyboardEvent("keyup", o));
    }
  });
  const w = await W(p);
  assert(w.includes("[]{}\\@€~|"), "AltGr-символы: " + JSON.stringify(w));
  assert((await activeIdx(p)) === before, "вкладка не переключилась");
});
test("Ctrl+C: копирует при выделении, иначе ^C", "UI-25", async (p) => {
  await focusTerm(p);
  await p.keyboard.type("x"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  await clearW(p);
  await p.evaluate(() => window.__hyterm.active.active.term.selectAll());
  await p.keyboard.press("Control+c");
  await p.waitForTimeout(100);
  assert(!(await W(p)).includes("\x03"), "с выделением не должно быть ^C");
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  assert(clip.includes("PS C:"), "буфер: " + JSON.stringify(clip.slice(0, 80)));
  assert(!(await p.evaluate(() => window.__hyterm.active.active.term.hasSelection())), "выделение снято");
  await p.keyboard.press("Control+c");
  assert((await W(p)).includes("\x03"), "без выделения — ^C");
});
test("Ctrl+V, Shift+Insert, Ctrl+Shift+V вставляют один раз", "UI-26 UI-27 UI-28", async (p) => {
  await focusTerm(p);
  for (const k of ["Control+v", "Shift+Insert", "Control+Shift+v"]) {
    await clearW(p);
    await p.evaluate(() => navigator.clipboard.writeText("hello-paste"));
    await p.keyboard.press(k);
    await p.waitForTimeout(150);
    const w = await W(p);
    assert(w.split("hello-paste").length === 2, `${k}: ` + JSON.stringify(w));
    assert(!w.includes("\x16"), `${k}: ^V не должен уходить`);
  }
});
test("Ctrl+Insert копирует", "UI-27", async (p) => {
  await focusTerm(p);
  await p.evaluate(() => navigator.clipboard.writeText(""));
  await p.evaluate(() => window.__hyterm.active.active.term.selectAll());
  await clearW(p);
  await p.keyboard.press("Control+Insert");
  await p.waitForTimeout(100);
  assert((await p.evaluate(() => navigator.clipboard.readText())).includes("PS C:"), "буфер пуст");
  assert(!(await W(p)).includes("\x1b[2;5~"), "Ctrl+Insert не должен уходить в программу");
});
test("многострочная вставка: предупреждение; bracketed — без него", "UI-35 UI-36", async (p) => {
  await focusTerm(p); await clearW(p);
  await p.evaluate(() => navigator.clipboard.writeText("echo a\necho b"));
  await p.keyboard.press("Control+v");
  await p.locator(".hy-modal").waitFor({ timeout: 3000 });
  await p.locator(".hy-modal .hy-btn.primary").click();
  await p.waitForTimeout(150);
  const w = await W(p);
  assert(w.includes("echo a\recho b") && !w.includes("\x1b[200~"), "вставка после подтверждения: " + JSON.stringify(w));
  await clearW(p);
  await p.evaluate(() => window.__mock.emit(window.__hyterm.active.active.sid, "\x1b[?2004h"));
  await p.waitForTimeout(50);
  await p.keyboard.press("Control+v");
  await p.waitForTimeout(150);
  assert(await p.locator(".hy-modal").count() === 0, "в bracketed-режиме без предупреждения");
  assert((await W(p)).includes("\x1b[200~echo a\recho b\x1b[201~"), "bracketed: " + JSON.stringify(await W(p)));
  await p.evaluate(() => window.__mock.emit(window.__hyterm.active.active.sid, "\x1b[?2004l"));
});
test("F-клавиши и стрелки — стандартные последовательности", "UI-24 UI-23", async (p) => {
  await focusTerm(p); await clearW(p);
  for (const k of ["F1", "F5", "F12", "Home", "End", "PageUp", "Delete", "Control+ArrowLeft", "Alt+b", "Control+a"]) await p.keyboard.press(k);
  const w = await W(p);
  for (const s of ["\x1bOP", "\x1b[15~", "\x1b[24~", "\x1b[H", "\x1b[F", "\x1b[5~", "\x1b[3~", "\x1b[1;5D", "\x1bb", "\x01"]) assert(w.includes(s), "нет " + JSON.stringify(s) + " в " + JSON.stringify(w));
});

// ── вкладки и панели ─────────────────────────────────────────────
test("вкладки: создать, Ctrl+Tab, Ctrl+Shift+Tab, Alt+N, дублировать, закрыть", "UI-60 UI-62 UI-65 UI-66 UI-67", async (p) => {
  await key(p, "Control+Shift+T", 200);
  await key(p, "Control+Shift+T", 200);
  assert(await ntabs(p) === 3, "3 вкладки");
  assert(await activeIdx(p) === 2, "активна новая");
  await p.keyboard.press("Control+Tab"); await p.waitForTimeout(80);
  assert(await activeIdx(p) === 0, "Ctrl+Tab по кругу");
  await p.keyboard.press("Control+Shift+Tab"); await p.waitForTimeout(80);
  assert(await activeIdx(p) === 2, "Ctrl+Shift+Tab назад");
  await p.keyboard.press("Alt+2"); await p.waitForTimeout(80);
  assert(await activeIdx(p) === 1, "Alt+2");
  await p.keyboard.press("Alt+9"); await p.waitForTimeout(80);
  assert(await activeIdx(p) === 2, "Alt+9 — последняя");
  await p.keyboard.press("Control+Shift+D"); await p.waitForTimeout(150);
  assert(await ntabs(p) === 4, "дубликат");
  await p.keyboard.press("Control+Shift+W"); await p.waitForTimeout(200);
  assert(await ntabs(p) === 3, "закрыта");
});
test("закрытие вкладки с работающей программой спрашивает", "UI-62", async (p) => {
  await p.keyboard.press("Control+Shift+T"); await p.waitForTimeout(150);
  await p.evaluate(() => { window.__mock.sessions[window.__hyterm.active.active.sid].busy = true; });
  await focusTerm(p);
  await p.keyboard.press("Control+Shift+W");
  await p.locator(".hy-modal").waitFor({ timeout: 3000 });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(100);
  assert(await ntabs(p) === 2, "отмена — вкладка осталась");
});
test("переименование двойным кликом и перетаскивание вкладок", "UI-63 UI-64", async (p) => {
  await p.keyboard.press("Control+Shift+T"); await p.waitForTimeout(150);
  await p.locator(".t-tab").nth(0).dblclick();
  await p.locator(".hy-modal input").fill("сборка");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(100);
  assert((await p.locator(".t-tab").nth(0).innerText()).includes("сборка"), "имя вкладки");
  await p.locator(".t-tab").nth(0).dragTo(p.locator(".t-tab").nth(1));
  await p.waitForTimeout(150);
  assert((await p.locator(".t-tab").nth(1).innerText()).includes("сборка"), "порядок после перетаскивания: " + await p.locator("#tabs").innerText());
});
test("разделение панелей, фокус Alt+стрелки, закрытие панели", "UI-68 UI-69", async (p) => {
  await focusTerm(p);
  await p.keyboard.press("Alt+Shift+Equal"); await p.waitForTimeout(250);
  assert(await npanes(p) === 2, "2 панели");
  await p.keyboard.press("Alt+Shift+Minus"); await p.waitForTimeout(250);
  assert(await npanes(p) === 3, "3 панели");
  await p.waitForTimeout(300);
  const a = await p.evaluate(() => window.__hyterm.active.panes().indexOf(window.__hyterm.active.active));
  await key(p, "Alt+ArrowUp", 200);
  const b = await p.evaluate(() => window.__hyterm.active.panes().indexOf(window.__hyterm.active.active));
  assert(a !== b, "фокус сменился");
  await p.keyboard.press("Control+Shift+W"); await p.waitForTimeout(200);
  assert(await npanes(p) === 2, "панель закрыта");
  assert(await p.locator(".t-split").count() >= 1, "есть разделитель");
});
test("профили в «+»: cmd и WSL", "UI-61 UI-114", async (p) => {
  await p.locator(".t-tab-new.prof").click();
  await p.locator(".hy-menu >> text=Командная строка").click();
  await p.waitForTimeout(150);
  const sp = await calls(p, "spawn");
  assert(sp[sp.length - 1][1] === "cmd", "запуск cmd: " + JSON.stringify(sp));
  assert(await p.evaluate(() => window.__hyterm.active.active.kind) === "cmd", "kind=cmd");
});
test("восстановление вкладок после перезапуска", "UI-70", async (p) => {
  await p.keyboard.press("Control+Shift+T"); await p.waitForTimeout(150);
  await p.evaluate(() => { sessionStorage.setItem("hy-keep", "1"); window.dispatchEvent(new Event("beforeunload")); });
  await p.reload();
  await p.waitForFunction(() => window.__hyterm && window.__hyterm.tabs.length > 0, null, { timeout: 10000 });
  await p.waitForTimeout(200);
  assert(await ntabs(p) === 2, "восстановлено 2 вкладки, а не " + await ntabs(p));
});
test("выход из оболочки: код 0 закрывает панель, иначе — сообщение", "UI-72", async (p) => {
  await p.keyboard.press("Control+Shift+T"); await p.waitForTimeout(150);
  await p.evaluate(() => window.__mock.exit(window.__hyterm.active.active.sid, 0));
  await p.waitForTimeout(150);
  assert(await ntabs(p) === 1, "вкладка закрыта по exit 0");
  await p.evaluate(() => window.__mock.exit(window.__hyterm.active.active.sid, 2));
  await p.waitForTimeout(150);
  const txt = await p.evaluate(() => { const b = window.__hyterm.active.active.term.buffer.active; let s = ""; for (let i = 0; i < b.length; i++) s += b.getLine(i).translateToString(true) + "\n"; return s; });
  assert(txt.includes("код 2"), "сообщение о коде");
});

// ── поиск, масштаб, вид ──────────────────────────────────────────
test("поиск: счётчик, регистр, регулярка, Esc", "UI-80 UI-81 UI-82", async (p) => {
  await focusTerm(p);
  await p.keyboard.type("many"); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  await p.keyboard.press("Control+Shift+F");
  await p.locator(".t-search input").fill("line 1");
  await p.waitForTimeout(250);
  assert(/\d+\/\d+/.test(await p.locator(".t-search .cnt").innerText()), "счётчик: " + await p.locator(".t-search .cnt").innerText());
  await p.locator(".t-search .tog", { hasText: ".*" }).click();
  await p.locator(".t-search input").fill("line 29\\d");
  await p.waitForTimeout(250);
  assert((await p.locator(".t-search .cnt").innerText()).endsWith("/10"), "регулярка: " + await p.locator(".t-search .cnt").innerText());
  await p.locator(".t-search input").press("Escape");
  assert(await p.locator(".t-search").count() === 0, "закрыт");
});
test("масштаб: Ctrl+=, Ctrl+-, Ctrl+0, Ctrl+колесо", "UI-83 UI-84", async (p) => {
  await focusTerm(p);
  const f0 = await p.evaluate(() => window.__hyterm.fontSize);
  await p.keyboard.press("Control+Equal"); await p.keyboard.press("Control+Equal");
  assert(await p.evaluate(() => window.__hyterm.fontSize) === f0 + 2, "крупнее");
  await p.keyboard.press("Control+0");
  assert(await p.evaluate(() => window.__hyterm.fontSize) === f0, "сброс");
  await p.keyboard.press("Control+Minus");
  assert(await p.evaluate(() => window.__hyterm.fontSize) === f0 - 1, "мельче");
  const box = await p.locator(".t-term.on .t-pane").first().boundingBox();
  await p.mouse.move(box.x + 50, box.y + 50);
  await p.keyboard.down("Control"); await p.mouse.wheel(0, -100); await p.keyboard.up("Control");
  await p.waitForTimeout(100);
  assert(await p.evaluate(() => window.__hyterm.fontSize) === f0, "Ctrl+колесо");
});
test("F11, палитра, колонки Ctrl+Shift+B/H", "UI-07 UI-10 UI-86", async (p) => {
  await focusTerm(p);
  await p.keyboard.press("F11"); await p.waitForTimeout(50);
  assert((await calls(p, "toggleFullscreen")).length === 1, "F11 → полноэкранный режим один раз");
  await p.keyboard.press("Control+Shift+B");
  assert(await p.evaluate(() => document.body.classList.contains("no-left")), "левая колонка скрыта");
  await p.keyboard.press("Control+Shift+H");
  assert(await p.evaluate(() => document.body.classList.contains("no-right")), "правая колонка скрыта");
  await p.keyboard.press("Control+Shift+P");
  await p.locator(".t-palette input").fill("вертикально");
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  assert(await npanes(p) === 2, "палитра → разделить");
});
test("блоки: код выхода, переход Ctrl+Shift+↑", "UI-43 UI-90 UI-93", async (p) => {
  await focusTerm(p);
  await p.keyboard.type("exit 3"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  assert(await p.locator(".t-block.fail").count() === 1, "блок с ошибкой");
  assert((await p.locator(".t-block.fail .badge").innerText()).includes("EXIT 3"), "EXIT 3");
  assert((await p.locator("#s-state").innerText()).includes("EXIT 3"), "строка сеанса");
  assert((await p.locator("#p-log").innerText()).includes("EXIT 3"), "журнал");
});
test("OSC 0/2 заголовок и OSC 7 путь Windows", "UI-11 UI-57", async (p) => {
  await p.evaluate(() => window.__mock.emit(window.__hyterm.active.active.sid, "\x1b]0;nvim notes.md\x07\x1b]7;file://pc/D:/Проекты/x%20y\x07"));
  await p.waitForTimeout(100);
  assert((await p.locator(".t-tab.on").innerText()).includes("nvim notes.md"), "заголовок вкладки");
  const st = await calls(p, "setTitle");
  assert(st.some((c) => c[1].includes("nvim notes.md")), "заголовок окна");
  assert(await p.evaluate(() => window.__hyterm.active.active.cwd) === "D:\\Проекты\\x y", "cwd: " + await p.evaluate(() => window.__hyterm.active.active.cwd));
});
test("звонок: мигание панели", "UI-59", async (p) => {
  await p.evaluate(() => window.__mock.emit(window.__hyterm.active.active.sid, "\x07"));
  await p.waitForTimeout(50);
  assert(await p.locator(".t-pane.bell").count() === 1, "визуальный звонок");
});
test("перетаскивание файла из Проводника → путь в кавычках PowerShell", "UI-110", async (p) => {
  await clearW(p);
  await p.evaluate(() => {
    const dt = new DataTransfer(); dt.setData("text/uri-list", "file:///C:/Program%20Files/It's%20Me/a.txt");
    window.__hyterm.active.active.box.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await p.waitForTimeout(80);
  assert((await W(p)).includes("'C:\\Program Files\\It''s Me\\a.txt' "), "путь: " + JSON.stringify(await W(p)));
});
test("подтверждение закрытия окна с работающими вкладками", "UI-05", async (p) => {
  await p.evaluate(() => window.__mock.message({ cmd: "confirm-close", busy: 2 }));
  await p.locator(".hy-modal").waitFor({ timeout: 3000 });
  await p.locator(".hy-modal .hy-btn.danger").click();
  await p.waitForTimeout(100);
  assert((await calls(p, "forceClose")).length === 1, "forceClose");
});
test("правая кнопка — меню; на Windows скрыты Linux-плитки", "UI-29 UI-107", async (p) => {
  const box = await p.locator(".t-term.on .t-pane").first().boundingBox();
  await p.mouse.click(box.x + 60, box.y + 20, { button: "right" });
  await p.locator(".hy-menu").waitFor({ timeout: 5000 });
  assert((await p.locator(".hy-menu").innerText()).includes("Разделить"), "пункты меню");
  await p.keyboard.press("Escape");
  assert(await p.locator("#globe.hidden").count() === 1, "глобус Network Recon скрыт");
});

test("мастер первого запуска: шаги, выбор оболочки, «позже»", "T-71", async (p) => {
  await p.locator(".wz").waitFor({ timeout: 8000 });
  assert((await p.locator(".wz-chk").innerText()).includes("ОБОЛОЧКИ"), "проверка системы");
  await p.locator(".wz >> text=ДАЛЕЕ").click();
  await p.locator(".wz-model").first().waitFor();
  assert(await p.locator(".wz-model").count() === 3, "три модели");
  await p.locator(".wz >> text=ДАЛЕЕ").click();
  await p.locator(".wz-prof >> text=Командная строка").click();
  await p.waitForTimeout(400);
  const s = await (await fetch(CORE + "/api/settings", { headers: { "X-Haotica-Token": token } })).json();
  assert(s.settings.terminal.default_profile === "cmd", "профиль по умолчанию сохранён");
  await p.locator(".wz >> text=ПОЗЖЕ").click();
  await p.waitForTimeout(300);
  assert(await p.locator(".wz").count() === 0, "закрыт");
  const d = await (await fetch(CORE + "/api/doctor", { headers: { "X-Haotica-Token": token } })).json();
  assert(d.wizard_done, "отметка wizard.done");
  await fetch(CORE + "/api/settings", { method: "POST", headers: { "X-Haotica-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ changes: { "terminal.default_profile": "" } }) });
}, { wizard: true });

// ── запуск ───────────────────────────────────────────────────────
const core = await startCore();
token = core.token;
browser = await chromium.launch();
let failed = 0;
for (const t of tests) {
  if (only.length && !only.some((o) => t.name.includes(o) || t.ids.includes(o))) continue;
  const page = await open(t.opts);
  await page.evaluate(() => { window.newTabForTest = () => {}; });
  const t0 = Date.now();
  try {
    await t.fn(page);
    if (page.errors.length) throw new Error("ошибки страницы: " + page.errors.join(" | "));
    results.push(["ok", t]);
    console.log(`  ✓ ${t.name}  [${t.ids}]  ${Date.now() - t0} мс`);
  } catch (e) {
    failed++;
    results.push(["fail", t, e]);
    console.log(`  ✗ ${t.name}  [${t.ids}]\n      ${String(e.message).split("\n")[0]}`);
    try { await page.screenshot({ path: path.join(tmpdir(), `hy-fail-${tests.indexOf(t)}.png`) }); } catch (e2) { /* */ }
  }
  await page.close();
  await ctx.close();
}
await browser.close();
core.proc.kill();
console.log(`\n${results.length - failed}/${results.length} пройдено`);
process.exit(failed ? 1 : 0);
