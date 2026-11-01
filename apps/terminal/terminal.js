// Терминал HAOTICA: xterm.js + PTY хоста, блоки команд (OSC 133), кликабельные пути (OSC 8 и
// распознавание в выводе), файловая панель с категориями и тегами, превью, системные виджеты
// из общего сервиса метрик, Haotica в правой панели, палитра команд и Cloud Link.
import { HY, el, icon } from "/ui/hy.js";
import { Terminal } from "/ui/vendor/xterm/xterm.mjs";
import { FitAddon } from "/ui/vendor/xterm/addon-fit.mjs";
import { WebglAddon } from "/ui/vendor/xterm/addon-webgl.mjs";
import { WebLinksAddon } from "/ui/vendor/xterm/addon-web-links.mjs";
import { Unicode11Addon } from "/ui/vendor/xterm/addon-unicode11.mjs";
import { SearchAddon } from "/ui/vendor/xterm/addon-search.mjs";
import { ImageAddon } from "/ui/vendor/xterm/addon-image.mjs";
import { ClipboardAddon } from "/ui/vendor/xterm/addon-clipboard.mjs";

HY.i18n({
  ru: { newtab: "Новая вкладка", closetab: "Закрыть вкладку", exited: "процесс завершён (код {code}) — Enter: перезапуск",
    copy_out: "Копировать вывод блока", copy_cmd: "Копировать команду", explain: "Haotica: разобрать ошибку", rerun: "Выполнить снова",
    open: "Открыть", open_editor: "Открыть в редакторе", reveal: "Показать в «Файлах»", copy_path: "Копировать путь",
    insert_path: "Вставить путь в терминал", cd_here: "Перейти сюда", tag: "Теги…", ask: "Haotica: что это за файл?",
    palette: "Команда…", toggle_left: "Панель файлов", toggle_right: "Превью и Haotica", find: "Поиск в выводе",
    clear: "Очистить экран", font_up: "Крупнее шрифт", font_down: "Мельче шрифт", cloud: "Cloud Link — облачные модели",
    settings: "Настройки терминала", prev_block: "Предыдущий блок", next_block: "Следующий блок", nothing: "НЕТ ПРЕВЬЮ",
    pick: "ВЫБЕРИТЕ ФАЙЛ", pages: "стр.", entries: "записей", lines: "строк", all: "все" },
  en: { newtab: "New tab", closetab: "Close tab", exited: "process exited (code {code}) — Enter: restart",
    copy_out: "Copy block output", copy_cmd: "Copy command", explain: "Haotica: explain error", rerun: "Run again",
    open: "Open", open_editor: "Open in editor", reveal: "Show in Files", copy_path: "Copy path",
    insert_path: "Insert path", cd_here: "cd here", tag: "Tags…", ask: "Haotica: what is this file?",
    palette: "Command…", toggle_left: "Files panel", toggle_right: "Preview & Haotica", find: "Find in output",
    clear: "Clear", font_up: "Bigger font", font_down: "Smaller font", cloud: "Cloud Link — cloud models",
    settings: "Terminal settings", prev_block: "Previous block", next_block: "Next block", nothing: "NO PREVIEW",
    pick: "SELECT A FILE", pages: "pages", entries: "entries", lines: "lines", all: "all" },
});

const $ = (id) => document.getElementById(id);
const CATS = ["all", "dir", "code", "doc", "image", "video", "audio", "archive", "model"];
const state = { tabs: [], active: null, fontSize: 13, metrics: {}, hist: { cpu: [], gpu: [], gtt: [], tps: [] },
  dir: "", cat: "all", hidden: false, selected: "", statCache: new Map(), lastClick: { uri: "", t: 0 } };

await HY.start({ title: "TERMINAL // HAOTICA", glyph: "terminal", topics: ["metrics", "events", "recon", "gamemode"],
  ctrlW: false, chrome: false });
HY.edges();
document.querySelector(".hy-app").classList.add("hy-boot");
$("winbtns").append(
  el("button.winbtn", { title: HY.t("cloud"), onclick: () => openCloud() }, icon("cloud", 14)),
  el("button.winbtn", { title: HY.t("palette") + "  Ctrl+Shift+P", onclick: () => palette() }, icon("search", 14)),
  ...HY.winButtons());
HY.dragArea($("drag1")); HY.dragArea($("drag2"));

const termTheme = () => {
  const t = (HY.theme && HY.theme.terminal) || {};
  return { ...t, background: getComputedStyle(document.documentElement).getPropertyValue("--bg0").trim() || "#000000",
    scrollbarSliderBackground: "#ffffff14", scrollbarSliderHoverBackground: "#ffffff26", scrollbarSliderActiveBackground: "#ffffff33",
    overviewRulerBorder: "#00000000" };
};
state.fontSize = (HY.theme.fonts && HY.theme.fonts.termSize) || 13;

// ── вкладки и сессии ─────────────────────────────────────────────
class Tab {
  constructor({ cwd = "", command = "" } = {}) {
    this.id = Math.random().toString(36).slice(2, 9);
    this.cwd = cwd || HY.boot.home || "~";
    this.title = "zsh";
    this.blocks = [];
    this.cur = null;              // блок, который сейчас выполняется
    this.lastCmd = "";
    this.box = el("div.t-term");
    $("terms").append(this.box);
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-term").trim();
    this.term = new Terminal({
      fontFamily: font || "JetBrains Mono, monospace", fontSize: state.fontSize, lineHeight: 1.18, letterSpacing: 0,
      cursorStyle: "bar", cursorBlink: true, cursorWidth: 2, scrollback: 20000, allowProposedApi: true,
      allowTransparency: false, drawBoldTextInBrightColors: false, minimumContrastRatio: 1, smoothScrollDuration: 90,
      theme: termTheme(), overviewRuler: { width: 8 }, rightClickSelectsWord: true, macOptionIsMeta: true,
      linkHandler: { allowNonHttpProtocols: true, activate: (e, uri) => onLink(e, uri, this),
        hover: (e, uri) => showTip(e, uri), leave: () => hideTip() },
    });
    this.fit = new FitAddon();
    this.search = new SearchAddon();
    for (const a of [this.fit, this.search, new Unicode11Addon(), new ClipboardAddon(),
                     new WebLinksAddon((e, url) => HY.openUrl(url))]) this.term.loadAddon(a);
    try { this.term.loadAddon(new ImageAddon({ sixelSupport: true, iipSupport: true })); } catch (e) { /* картинки не обязательны */ }
    this.term.unicode.activeVersion = "11";
    this.term.open(this.box);
    try { const gl = new WebglAddon(); gl.onContextLoss(() => gl.dispose()); this.term.loadAddon(gl); } catch (e) { /* остаётся DOM-рендер */ }
    this.osc();
    this.links();
    this.keys();
    this.term.onTitleChange((t) => { this.title = t.slice(0, 40); renderTabs(); });
    this.term.onBell(() => { if (state.active !== this) { this.activity = true; renderTabs(); } });
    this.box.addEventListener("contextmenu", (e) => { e.preventDefault(); this.blockMenu(e); });
    this.box.addEventListener("dragover", (e) => e.preventDefault());
    this.box.addEventListener("drop", (e) => {
      e.preventDefault();
      const p = e.dataTransfer.getData("text/x-haotica-path") || e.dataTransfer.getData("text/plain");
      if (p) this.input(quote(p) + " ");
    });
    this.spawn(command);
  }

  spawn(command = "") {
    this.exited = false;
    const { cols, rows } = this.dims();
    if (!HY.bridge) { this.term.write("\x1b[33mРежим разработки: нет хоста PTY.\x1b[0m\r\n"); return; }
    HY.bridge.ptySpawn(this.cwd, cols, rows, command, (sid) => { this.sid = sid; sessions.set(sid, this); });
    this.term.onData((d) => {
      if (this.exited) { if (d === "\r") { this.term.write("\r\n"); this.spawn(); } return; }
      if (this.sid) HY.bridge.ptyWrite(this.sid, d);
    });
    this.term.onResize(({ cols, rows }) => this.sid && HY.bridge.ptyResize(this.sid, cols, rows));
  }

  dims() { try { this.fit.fit(); } catch (e) { /* окно ещё не видно */ } return { cols: this.term.cols || 100, rows: this.term.rows || 30 }; }
  input(text) { if (this.sid) HY.bridge.ptyWrite(this.sid, text); this.term.focus(); }

  // OSC 133 — блоки, OSC 7 — папка, OSC 7777 — текст команды
  osc() {
    const p = this.term.parser;
    p.registerOscHandler(7, (data) => {
      try { const u = new URL(data); this.cwd = decodeURIComponent(u.pathname); } catch (e) { return true; }
      if (state.active === this) { loadDir(this.cwd); renderStatus(); }
      renderTabs();
      return true;
    });
    p.registerOscHandler(7777, (data) => {
      const m = data.match(/^cmd=(.*)$/);
      if (m) { try { this.lastCmd = new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))); } catch (e) { this.lastCmd = ""; } }
      return true;
    });
    p.registerOscHandler(133, (data) => {
      const [kind, arg] = data.split(";");
      const buf = this.term.buffer.active;
      if (kind === "A") {
        this.promptMarker = this.term.registerMarker(0);
      } else if (kind === "C") {
        this.cur = { cmd: this.lastCmd, start: this.promptMarker || this.term.registerMarker(0),
          out: this.term.registerMarker(0), t0: performance.now(), cwd: this.cwd };
        this.cur.deco = this.decorate(this.cur, "run", 1);
      } else if (kind === "D" && this.cur) {
        const b = this.cur;
        this.cur = null;
        b.code = parseInt(arg || "0", 10) || 0;
        b.ms = performance.now() - b.t0;
        b.end = this.term.registerMarker(0);
        const height = Math.max(1, (buf.baseY + buf.cursorY) - b.start.line);
        if (b.deco) b.deco.dispose();
        b.deco = this.decorate(b, b.code === 0 ? "ok" : "fail", height);
        this.blocks.push(b);
        if (this.blocks.length > 400) { const old = this.blocks.shift(); old.deco && old.deco.dispose(); }
        if (b.code !== 0 && b.code !== 130) onFailed(this, b);
        if (b.ms > 10000 && document.hidden !== false) HY.bridge && HY.bridge.notify("Команда завершена", `${b.cmd.slice(0, 60)} · ${fmtMs(b.ms)}`);
      }
      return true;
    });
  }

  decorate(b, kind, height) {
    if (!b.start || b.start.isDisposed) return null;
    const d = this.term.registerDecoration({ marker: b.start, x: 0, width: this.term.cols, height, layer: "bottom",
      overviewRulerOptions: kind === "fail" ? { color: "#E0705A", position: "full" } : kind === "ok" ? { color: "#8FBF7A44", position: "left" } : undefined });
    if (!d) return null;
    d.onRender((node) => {
      node.className = "t-block " + kind;
      if (!node.firstChild && kind !== "run") {
        const txt = kind === "fail" ? `EXIT ${b.code} · ${fmtMs(b.ms)}` : `✓ ${fmtMs(b.ms)}`;
        node.append(el("span.badge", txt));
      }
    });
    return d;
  }

  blockAt(row) {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (b.start.line <= row && (!b.end || b.end.line >= row)) return b;
    }
    return null;
  }

  output(b, maxLines = 400) {
    const buf = this.term.buffer.active;
    const from = (b.out || b.start).line, to = b.end ? b.end.line : buf.baseY + buf.cursorY;
    const lines = [];
    for (let y = from; y < to && lines.length < 100000; y++) { const l = buf.getLine(y); if (l) lines.push(l.translateToString(true)); }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length > maxLines) return [...lines.slice(0, maxLines / 4), `… (${lines.length - maxLines} строк пропущено) …`, ...lines.slice(-maxLines * 3 / 4)].join("\n");
    return lines.join("\n");
  }

  blockMenu(e) {
    const rect = this.box.querySelector(".xterm-screen").getBoundingClientRect();
    const cellH = rect.height / this.term.rows;
    const row = this.term.buffer.active.viewportY + Math.floor((e.clientY - rect.top) / cellH);
    const b = this.blockAt(row);
    const sel = this.term.getSelection();
    const items = [];
    if (sel) items.push({ label: HY.t("copy"), icon: "clipboard", key: "Ctrl+Shift+C", fn: () => navigator.clipboard.writeText(sel) });
    items.push({ label: "Вставить", icon: "doc", key: "Ctrl+Shift+V", fn: () => paste(this) });
    if (b) {
      items.push("-");
      items.push({ label: HY.t("copy_cmd"), icon: "terminal", fn: () => navigator.clipboard.writeText(b.cmd) });
      items.push({ label: HY.t("copy_out"), icon: "clipboard", fn: () => navigator.clipboard.writeText(this.output(b, 100000)) });
      items.push({ label: HY.t("rerun"), icon: "reboot", fn: () => this.input(b.cmd + "\r") });
      items.push({ label: HY.t("explain"), icon: "haotica", fn: () => askHaotica(this, b, true) });
    }
    items.push("-", { label: HY.t("find"), icon: "search", key: "Ctrl+Shift+F", fn: () => findBar(this) },
      { label: HY.t("clear"), icon: "trash", key: "Ctrl+Shift+K", fn: () => this.term.clear() });
    HY.menu(e.clientX, e.clientY, items);
  }

  // пути в выводе: «src/app.py:42», «./x», «~/y», «/etc/z» — проверяем существование и делаем ссылками
  links() {
    const rx = /(?:^|[\s'"(=:])((?:~|\.{1,2}|\/)?[\w@%+.~-]*\/[\w@%+.~/-]*[\w@%+~-]|[\w@%+-]+\.(?:py|js|ts|tsx|json|md|toml|ya?ml|sh|lua|qml|rs|go|c|h|cpp|txt|log|conf|ini|css|html))(?::(\d+))?/g;
    this.term.registerLinkProvider({
      provideLinks: (y, cb) => {
        const line = this.term.buffer.active.getLine(y - 1);
        if (!line) return cb(undefined);
        const text = line.translateToString(true);
        const found = [];
        let m;
        rx.lastIndex = 0;
        while ((m = rx.exec(text))) {
          const raw = m[1];
          const start = m.index + m[0].indexOf(raw);
          found.push({ raw, line: m[2], x: start + 1, len: raw.length + (m[2] ? m[2].length + 1 : 0) });
        }
        if (!found.length) return cb(undefined);
        Promise.all(found.map((f) => statPath(resolvePath(f.raw, this.cwd)).then((ok) => ok ? f : null))).then((res) => {
          const links = res.filter(Boolean).map((f) => ({
            range: { start: { x: f.x, y }, end: { x: f.x + f.len - 1, y } }, text: f.raw,
            decorations: { underline: true, pointerCursor: true },
            activate: (e) => onLink(e, "file://" + resolvePath(f.raw, this.cwd) + (f.line ? "#L" + f.line : ""), this),
            hover: (e) => showTip(e, resolvePath(f.raw, this.cwd)), leave: () => hideTip(),
          }));
          cb(links.length ? links : undefined);
        });
      },
    });
  }

  keys() {
    this.term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && e.shiftKey) {
        if (k === "c") { const s = this.term.getSelection(); if (s) navigator.clipboard.writeText(s); return false; }
        if (k === "v") { paste(this); return false; }
        if (k === "t") { newTab({ cwd: this.cwd }); return false; }
        if (k === "w") { closeTab(this); return false; }
        if (k === "f") { findBar(this); return false; }
        if (k === "p") { palette(); return false; }
        if (k === "k") { this.term.clear(); return false; }
        if (k === "h") { document.body.classList.toggle("no-right"); refit(); return false; }
        if (k === "arrowup") { this.jump(-1); return false; }
        if (k === "arrowdown") { this.jump(1); return false; }
      }
      if (e.ctrlKey && !e.shiftKey) {
        if (k === "b" && e.altKey) { document.body.classList.toggle("no-left"); refit(); return false; }
        if (k === "tab") { cycle(1); return false; }
        if (k === "=" || k === "+") { setFont(state.fontSize + 1); return false; }
        if (k === "-") { setFont(state.fontSize - 1); return false; }
        if (/^[1-9]$/.test(k) && e.altKey) { const t = state.tabs[+k - 1]; if (t) activate(t); return false; }
      }
      return true;
    });
  }

  jump(dir) {
    const vy = this.term.buffer.active.viewportY;
    const list = this.blocks.map((b) => b.start.line);
    const target = dir < 0 ? list.filter((l) => l < vy).pop() : list.find((l) => l > vy);
    if (target !== undefined) this.term.scrollToLine(target);
  }

  dispose() { if (this.sid) HY.bridge.ptyKill(this.sid); this.term.dispose(); this.box.remove(); }
}

const sessions = new Map();
if (HY.bridge) {
  HY.bridge.ptyData.connect((sid, data) => {
    const t = sessions.get(sid);
    if (!t) return;
    t.term.write(data, () => HY.bridge.ptyAck(sid, data.length));
    if (state.active !== t && !t.activity) { t.activity = true; renderTabs(); }
  });
  HY.bridge.ptyExit.connect((sid, code) => {
    const t = sessions.get(sid);
    if (!t) return;
    sessions.delete(sid);
    t.sid = null;
    t.exited = true;
    t.term.write(`\r\n\x1b[2m── ${HY.t("exited", { code })} ──\x1b[0m\r\n`);
  });
}

// ── вкладки ──────────────────────────────────────────────────────
function newTab(opts = {}) {
  const t = new Tab(opts);
  state.tabs.push(t);
  activate(t);
  logLine("ok", `SESSION ${state.tabs.length} OPENED`, "OK");
  return t;
}
function activate(t) {
  state.active = t;
  t.activity = false;
  for (const x of state.tabs) x.box.classList.toggle("on", x === t);
  requestAnimationFrame(() => { t.dims(); t.term.focus(); });
  loadDir(t.cwd);
  renderTabs();
  renderStatus();
}
function closeTab(t) {
  const i = state.tabs.indexOf(t);
  if (i < 0) return;
  t.dispose();
  state.tabs.splice(i, 1);
  if (!state.tabs.length) return HY.close();
  activate(state.tabs[Math.max(0, i - 1)]);
}
function cycle(d) {
  const i = state.tabs.indexOf(state.active);
  activate(state.tabs[(i + d + state.tabs.length) % state.tabs.length]);
}
function renderTabs() {
  $("tabs").replaceChildren(...state.tabs.map((t, i) => el("div.t-tab" + (t === state.active ? ".on" : ""), {
    onclick: () => activate(t), onauxclick: (e) => { if (e.button === 1) closeTab(t); }, title: t.cwd,
  }, t.activity ? el("span.dot") : null, el("span", `${i + 1} · ${shortTitle(t)}`),
     el("span.x", { onclick: (e) => { e.stopPropagation(); closeTab(t); } }, icon("close", 14)))),
    el("button.t-tab-new", { title: HY.t("newtab") + "  Ctrl+Shift+T", onclick: () => newTab({ cwd: state.active ? state.active.cwd : "" }) }, icon("plus", 14)));
}
function shortTitle(t) {
  const home = HY.boot.home || "";
  const dir = t.cwd === home ? "~" : t.cwd.split("/").filter(Boolean).pop() || "/";
  return t.title && t.title !== "zsh" && !t.title.includes("@") ? t.title : dir;
}
function setFont(n) {
  state.fontSize = Math.max(9, Math.min(26, n));
  for (const t of state.tabs) { t.term.options.fontSize = state.fontSize; t.dims(); }
}
function refit() { requestAnimationFrame(() => { state.tabs.forEach((t) => t.dims()); drawCharts(); }); }
window.addEventListener("resize", HY.debounce(refit, 60));
HY.on("theme-applied", () => {
  const th = termTheme();
  const font = getComputedStyle(document.documentElement).getPropertyValue("--font-term").trim();
  for (const t of state.tabs) { t.term.options.theme = th; if (font) t.term.options.fontFamily = font; }
  applyCrt();
  drawCharts();
});
function applyCrt() {
  const fx = HY.theme.effects || {};
  const k = Math.max(0, Math.min(1, fx.crt_terminal === undefined ? 0.7 : +fx.crt_terminal || 0));
  const screen = Math.max(0, +fx.crt_screen || 0);           // лёгкий экранный CRT уже лежит сверху
  const root = document.documentElement.style;
  root.setProperty("--crt", k);
  document.body.classList.toggle("no-crt", k <= 0);
  if (k <= 0) { root.setProperty("--crt-filter", "none"); return; }
  const flt = document.getElementById("crt-rgb");
  const [oL, oR, , , , , , soft, , glowMix] = flt.children;
  const off = (0.3 + 0.75 * k).toFixed(2);
  oL.setAttribute("dx", -off); oR.setAttribute("dx", off);
  soft.setAttribute("stdDeviation", (0.15 + 0.45 * k).toFixed(2));
  glowMix.setAttribute("k3", (0.08 + 0.22 * k).toFixed(3));
  root.setProperty("--crt-filter", "url(#crt-rgb)");
  crtLines.k = k * (screen > 0 ? 0.82 : 1);
  drawCrtLines();
}
// строки развёртки точно по физическим пикселям: период кратен 3 (как у экранного шейдера) —
// узоры совпадают по шагу и не дают муара; тёмная полоса с мягкими краями
const crtLines = { k: 0.7, key: "" };
function drawCrtLines() {
  const c = $("crt-lines");
  if (!c || document.body.classList.contains("no-crt")) return;
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  const key = `${w}x${h}@${crtLines.k}`;
  if (key === crtLines.key) return;
  crtLines.key = key;
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  const P = 3 * Math.max(1, Math.round(4 * dpr / 3));
  // тёмная полоса (затемняет яркое) и едва светлая — «люминофор» в чёрном, как у кинескопа
  const A = 0.34 * crtLines.k, L = 0.022 * crtLines.k;
  for (let y = 0; y < h; y++) {
    const ph = Math.cos(2 * Math.PI * ((y % P) + 0.5) / P);
    const dark = A * Math.pow(0.5 + 0.5 * ph, 1.6), lite = L * Math.pow(0.5 - 0.5 * ph, 2);
    if (dark > 0.004) { g.fillStyle = `rgba(0,0,0,${dark.toFixed(3)})`; g.fillRect(0, y, w, 1); }
    else if (lite > 0.002) { g.fillStyle = `rgba(255,244,230,${lite.toFixed(4)})`; g.fillRect(0, y, w, 1); }
  }
}
new ResizeObserver(HY.debounce(drawCrtLines, 80)).observe($("crt-lines"));
matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.("change", () => { crtLines.key = ""; drawCrtLines(); });

async function paste(t) {
  try { const text = await navigator.clipboard.readText(); if (text) t.input(text.includes("\n") ? `\x1b[200~${text}\x1b[201~` : text); }
  catch (e) { /* буфер недоступен */ }
}
function quote(p) { return /^[\w@%+=:,./~-]+$/.test(p) ? p : "'" + p.replaceAll("'", "'\\''") + "'"; }
function fmtMs(ms) { return ms < 1000 ? Math.round(ms) + "ms" : ms < 60000 ? (ms / 1000).toFixed(1) + "s" : Math.floor(ms / 60000) + "m" + Math.round(ms % 60000 / 1000) + "s"; }
function resolvePath(p, cwd) {
  const home = HY.boot.home || "/home";
  if (p.startsWith("~")) return home + p.slice(1);
  if (p.startsWith("/")) return p;
  const out = [];
  for (const seg of (cwd + "/" + p).split("/")) { if (!seg || seg === ".") continue; if (seg === "..") out.pop(); else out.push(seg); }
  return "/" + out.join("/");
}
async function statPath(p) {
  if (state.statCache.has(p)) return state.statCache.get(p);
  const pr = HY.get("/api/fs/stat?path=" + encodeURIComponent(p)).then((r) => !!(r && r.ok)).catch(() => false);
  state.statCache.set(p, pr);
  if (state.statCache.size > 3000) state.statCache.clear();
  return pr;
}

// клик по пути: клик — превью, двойной клик — открыть, Ctrl+клик — показать в «Файлах»
function onLink(e, uri, tab) {
  if (!uri.startsWith("file://")) return HY.openUrl(uri);
  const u = new URL(uri);
  const path = decodeURIComponent(u.pathname);
  const line = (u.hash.match(/L(\d+)/) || [])[1];
  const now = Date.now();
  const dbl = state.lastClick.uri === uri && now - state.lastClick.t < 420;
  state.lastClick = { uri, t: now };
  if (e.ctrlKey) return HY.post("/api/fs/reveal", { path });
  if (dbl) return HY.post("/api/fs/open", { path, line: line ? +line : undefined });
  preview(path, line);
  if (tab) tab.term.focus();
}
let tip;
function showTip(e, text) {
  hideTip();
  tip = el("div.hy-tip", text.replace("file://", "") + "   клик — превью · 2× — открыть · Ctrl — в папке");
  document.body.append(tip);
  tip.style.left = Math.min(e.clientX + 12, innerWidth - 420) + "px"; tip.style.top = e.clientY + 16 + "px";
}
function hideTip() { if (tip) { tip.remove(); tip = null; } }

// ── правая панель: журнал / файлы / превью / Haotica ─────────────
const PANELS = [["log", "LOG"], ["files", "FILES"], ["preview", "PREVIEW"], ["haotica", "HAOTICA"]];
let panel = "log";
function showPanel(name) {
  panel = name;
  for (const [n] of PANELS) $("p-" + n).classList.toggle("hidden", n !== name);
  $("p-tabs").replaceChildren(...PANELS.map(([n, label]) => el("button" + (n === name ? ".on" : ""), { onclick: () => showPanel(n) },
    label, n === "log" && state.unread ? el("span.n", state.unread) : null)));
  if (name === "log") state.unread = 0;
  if (name === "haotica" && !hFrame.src) hFrame.src = "/apps/assistant/index.html?embed=terminal";
}

// журнал со встроенными барами
const logBox = $("p-log");
function logLine(kind, text, status, pct) {
  const bar = pct !== undefined ? el("span.pbar", "▓".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10))) : null;
  const row = el("div.lg." + kind + ".new", el("span", ">"), el("span.tx", text), el("span.ld"), bar,
    el("span.st", pct !== undefined ? `${Math.round(pct)}%` : status || ""));
  logBox.append(row);
  while (logBox.children.length > 300) logBox.firstChild.remove();
  logBox.scrollTop = logBox.scrollHeight;
  if (panel !== "log") { state.unread = (state.unread || 0) + 1; showPanel(panel); }
}
const KIND_STATUS = { ok: "OK", info: "INFO", warn: "WARN", error: "FAIL", haotica: "AI", net: "LINK", power: "PWR",
  security: "ALERT", game: "GAME", update: "UPD" };
HY.get("/api/events?n=24").then((r) => { for (const e of (r && r.events) || []) logLine(e.kind, e.text, KIND_STATUS[e.kind] || e.time); });
HY.on("events", (e) => logLine(e.kind, e.text, KIND_STATUS[e.kind] || e.time));

// файлы: категории, теги, дерево текущей папки
function renderCats() {
  $("f-cats").replaceChildren(...CATS.map((c) => el("span.c" + (state.cat === c ? ".on" : ""), { onclick: () => { state.cat = c; renderCats(); renderTree(); } },
    c === "all" ? null : el("i", { style: { background: HY.catColor(c) } }), c === "all" ? HY.t("all") : c)));
}
async function loadDir(dir) {
  if (!dir) return;
  if (dir !== state.dir) state.selected = "";
  state.dir = dir;
  $("f-path").textContent = "‎" + dir.replace(HY.boot.home || "\0", "~");
  const r = await HY.get(`/api/fs/list?path=${encodeURIComponent(dir)}${state.hidden ? "&hidden=1" : ""}`);
  state.entries = (r && r.entries) || [];
  renderTree();
}
function renderTree() {
  const reg = state.tagColors || {};
  const list = (state.entries || []).filter((e) => state.cat === "all" || e.category === state.cat);
  $("f-tree").replaceChildren(...list.slice(0, 600).map((e) => el("div.n" + (e.type === "dir" ? ".dir" : "") + (e.hidden ? ".hidden-file" : "") + (e.path === state.selected ? ".sel" : ""), {
    draggable: true, title: e.path,
    onclick: () => { state.selected = e.path; renderTree(); preview(e.path, null, false); },
    ondblclick: () => e.type === "dir" ? loadDir(e.path) : HY.post("/api/fs/open", { path: e.path }),
    oncontextmenu: (ev) => { ev.preventDefault(); fileMenu(ev, e); },
    ondragstart: (ev) => { ev.dataTransfer.setData("text/x-haotica-path", e.path); ev.dataTransfer.setData("text/plain", e.path); },
  }, el("span.bar2", { style: { background: HY.catColor(e.category) } }),
     icon(e.type === "dir" ? "folder" : glyphFor(e.category), 14), el("span.nm", e.name),
     e.tags && e.tags.length ? el("span.tg", e.tags.slice(0, 3).map((t) => el("i", { title: t, style: { background: reg[t] || "var(--accent)" } }))) : null)));
}
function glyphFor(cat) { return { code: "code", doc: "doc", image: "image", video: "play", audio: "music", archive: "archive", model: "haotica" }[cat] || "doc"; }
function fileMenu(ev, e) {
  const t = state.active;
  HY.menu(ev.clientX, ev.clientY, [
    { label: HY.t("open"), icon: "folder", fn: () => e.type === "dir" ? loadDir(e.path) : HY.post("/api/fs/open", { path: e.path }) },
    e.type !== "dir" ? { label: HY.t("open_editor"), icon: "code", fn: () => HY.openApp("editor", [e.path]) } : null,
    { label: HY.t("reveal"), icon: "folder", fn: () => HY.post("/api/fs/reveal", { path: e.path }) },
    "-",
    { label: HY.t("insert_path"), icon: "terminal", fn: () => t && t.input(quote(e.path) + " ") },
    e.type === "dir" ? { label: HY.t("cd_here"), icon: "chevron", fn: () => t && t.input(" cd " + quote(e.path) + "\r") } : null,
    { label: HY.t("copy_path"), icon: "clipboard", fn: () => navigator.clipboard.writeText(e.path) },
    { label: HY.t("tag"), icon: "key", fn: () => tagDialog(e) },
    "-",
    { label: HY.t("ask"), icon: "haotica", fn: () => ask(`Что это за файл и что с ним можно сделать? ${e.path}`, { path: e.path }) },
  ].filter(Boolean));
}
async function tagDialog(e) {
  const v = await HY.prompt(HY.t("tag"), (e.tags || []).join(", "), "важное, работа, проект");
  if (v === null) return;
  await HY.post("/api/fs/tags", { paths: [e.path], tags: v.split(",").map((x) => x.trim()).filter(Boolean) });
  loadDir(state.dir);
}
HY.get("/api/fs/tags").then((r) => { state.tagColors = (r && r.registry) || {}; });

// превью
async function preview(path, line, switchTo = true) {
  const box = $("p-preview");
  const r = await HY.get("/api/fs/preview?path=" + encodeURIComponent(path));
  if (switchTo) showPanel("preview");
  if (!r || !r.ok) { box.replaceChildren(el("div.t-prev-empty", HY.t("nothing"))); return; }
  const p = r.preview;
  const name = path.split("/").pop() || path;
  const meta = [p.language, p.lines ? p.lines + " " + HY.t("lines") : "", p.pages ? p.pages + " " + HY.t("pages") : "",
    p.size !== undefined && p.kind !== "dir" ? HY.fmtBytes(p.size) : "", p.width ? `${p.width}×${p.height}` : "",
    p.kind === "dir" ? p.count + " " + HY.t("entries") : ""].filter(Boolean).join(" · ");
  const head = el("div.t-prev-head", icon(p.kind === "dir" ? "folder" : glyphFor(p.category), 14), el("span.nm", name), el("span.meta", meta),
    el("button.hy-btn.ghost.icon.small", { title: HY.t("open"), onclick: () => HY.post("/api/fs/open", { path }) }, icon("chevron", 14)));
  const body = el("div.t-prev-body");
  if (p.kind === "image") body.append(el("img", { src: HY.url("/api/fs/raw", { path }), alt: name }));
  else if (p.kind === "pdf") body.append(el("img", { src: HY.url("/api/fs/thumb", { path, size: 600 }) }));
  else if (p.kind === "video") body.append(el("img", { src: HY.url("/api/fs/thumb", { path, size: 600 }) }), tracks(p));
  else if (p.kind === "audio") body.append(tracks(p));
  else if (p.kind === "markdown") body.append(el("div.md", { html: p.html }));
  else if (p.kind === "code" || p.kind === "text") {
    body.append(el("div.code", { html: p.html }));
    if (line) setTimeout(() => { const a = body.querySelector(`#L-${line}`) || body.querySelector(`a[href="#L-${line}"]`); if (a) a.scrollIntoView({ block: "center" }); }, 30);
  } else if (p.kind === "archive") body.append(el("pre.lines", p.entries.join("\n")));
  else if (p.kind === "binary") body.append(el("div.hex", p.hex));
  else if (p.kind === "dir") body.append(el("div.lines", Object.entries(p.categories || {}).map(([c, n]) => HY.kv(c, String(n), HY.catColor(c)))));
  else body.append(el("div.t-prev-empty", HY.t("nothing")));
  box.replaceChildren(head, body);
  box.classList.remove("hy-scan"); void box.offsetWidth; box.classList.add("hy-scan");
}
function tracks(p) {
  return el("div.lines", (p.tracks || []).map((t) => el("div", { style: { marginBottom: "6px" } },
    Object.entries(t).map(([k, v]) => HY.kv(k.replace("@", ""), String(v))))));
}

// ── шапка: дата, время, аптайм, сеть ────────────────────────────
function clock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  $("date").textContent = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  $("time").textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
setInterval(clock, 1000); clock();

// ── полосы-статы, мини-блок, графики (общий сервис метрик) ──────
const VITALS = [
  ["CPU", "--teal", (m) => (m.cpu || 0) / 100, (m) => Math.round(m.cpu || 0) + "%"],
  ["GPU", "--sky", (m) => (m.gpu || 0) / 100, (m) => Math.round(m.gpu || 0) + "%"],
  ["RAM", "--green", (m) => m.ram_total_gb ? m.ram_used_gb / m.ram_total_gb : 0, (m) => (m.ram_used_gb || 0).toFixed(1) + "G"],
  ["GTT", "--violet", (m) => m.gtt_total_gb ? m.gtt_used_gb / m.gtt_total_gb : 0, (m) => (m.gtt_used_gb || 0).toFixed(1) + "G"],
  ["TEMP", "--amber", (m) => Math.min(1, (m.temp_cpu || 0) / 100), (m) => m.temp_cpu ? m.temp_cpu + "°" : "—"],
  ["FAN", "--dim", (m) => Math.min(1, (m.fan_rpm || 0) / 6000), (m) => m.fan_rpm ? (m.fan_rpm / 1000).toFixed(1) + "k" : "—"],
  ["BAT", "--green", (m) => m.battery >= 0 ? m.battery / 100 : 1, (m) => m.battery >= 0 ? m.battery + "%" + (m.charging ? "+" : "") : "AC"],
  ["AI", "--violet", (m) => Math.min(1, (m.llm_tps || 0) / 60), (m) => m.llm_state === "ready" ? Math.round(m.llm_tps || 0) + "t/s" : ({ loading: "LOAD", sleep: "SLEEP" }[m.llm_state] || "OFF")],
];
function bars() {
  const m = state.metrics;
  if (!$("bars").children.length) {
    $("bars").append(...VITALS.map(([k, c]) => el("div.bar", { style: { "--c": `var(${c})` }, title: k,
      onclick: () => (k === "TEMP" || k === "FAN" || k === "BAT") ? palettePower() : k === "AI" ? showPanel("haotica") : HY.openApp("sysmon") },
      el("span.pt"), el("span.k", k), el("div.track", el("i")), el("span.v", "—"))));
  }
  VITALS.forEach(([, , frac, val], i) => {
    const row = $("bars").children[i];
    let f = Math.max(0, Math.min(1, frac(m) || 0));
    if (i === 4) row.style.setProperty("--c", (m.temp_cpu || 0) > 85 ? "var(--coral)" : "var(--amber)");
    if (i === 6) row.style.setProperty("--c", m.battery >= 0 && m.battery <= 20 && !m.charging ? "var(--coral)" : "var(--green)");
    row.querySelector(".track i").style.setProperty("--p", (f * 100).toFixed(1) + "%");
    row.querySelector(".v").textContent = val(m);
  });
  $("power-mode").textContent = m.game_mode ? "GAME" : (m.power_profile || "balanced").toUpperCase();
  $("power-mode").style.color = m.game_mode ? "var(--coral)" : "";
}
function mini() {
  const m = state.metrics;
  const rnd = (n) => Math.floor(Math.random() * 16 ** n).toString(16).toUpperCase().padStart(n, "0");
  $("mini-cols").textContent =
    `IP   ${m.net_ip || "—"}\nPING ${m.net_ping_ms >= 0 ? m.net_ping_ms + " ms" : "—"}\n↓${(m.net_down_kbs || 0).toFixed(0).padStart(6)} kB/s  ${rnd(4)}\n↑${(m.net_up_kbs || 0).toFixed(0).padStart(6)} kB/s  ${rnd(4)}`;
  $("net-status").textContent = m.net_name ? (m.net_ping_ms >= 0 && m.net_ping_ms < 120 ? "STABLE" : "DEGRADED") : "OFFLINE";
  $("net-status").style.color = m.net_name ? (m.net_ping_ms >= 0 && m.net_ping_ms < 120 ? "var(--green)" : "var(--amber)") : "var(--coral)";
  $("sec-level").textContent = (m.recon_unknown || 0) > 0 ? "CHECK" : "HIGH";
  $("sec-level").style.color = (m.recon_unknown || 0) > 0 ? "var(--amber)" : "";
  const h = m.uptime_hours || 0;
  $("uptime").textContent = h >= 48 ? Math.floor(h / 24) + "d" : h + "h";
}
const push = (a, v, n = 90) => { a.push(v); if (a.length > n) a.shift(); };
state.hist.net = []; state.hist.up = [];
HY.on("metrics", (m) => {
  state.metrics = m;
  push(state.hist.cpu, m.cpu || 0); push(state.hist.gpu, m.gpu || 0); push(state.hist.gtt, m.gtt_used_gb || 0);
  push(state.hist.tps, m.llm_tps || 0); push(state.hist.net, m.net_down_kbs || 0); push(state.hist.up, m.net_up_kbs || 0);
  bars(); mini(); drawCharts();
  $("load-val").textContent = `${Math.round(m.cpu || 0)}% · ${Math.round(m.gpu || 0)}%`;
  $("net-val").textContent = `↓ ${HY.fmtBytes((m.net_down_kbs || 0) * 1024)}/s`;
});
function cssv(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function fitCanvas(c) {
  const r = c.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [g, r.width, r.height];
}
function grid(g, w, h, step = 12) {
  g.strokeStyle = cssv("--ink-faint") || "#1E1D1A"; g.lineWidth = 1;
  for (let x = 0.5; x < w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0.5; y < h; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
}
function drawCharts() {
  // нагрузка: сглаженная «колоколообразная» площадь CPU и линия GPU
  let [g, w, h] = fitCanvas($("c-load"));
  g.clearRect(0, 0, w, h); grid(g, w, h);
  const area = (data, color, fill) => {
    const n = Math.max(2, data.length);
    g.beginPath();
    data.forEach((v, i) => { const x = (i / (n - 1)) * w, y = h - 3 - (Math.min(100, v) / 100) * (h - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    if (fill) { g.lineTo(w, h); g.lineTo(0, h); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, color + "55"); gr.addColorStop(1, color + "00"); g.fillStyle = gr; g.fill(); }
    else { g.strokeStyle = color; g.lineWidth = 1.4; g.shadowColor = color; g.shadowBlur = 6 * (parseFloat(cssv("--glow")) || .25) * 4; g.stroke(); g.shadowBlur = 0; }
  };
  const smooth = (a) => a.map((_, i) => (a[i - 2] ?? a[i]) * .1 + (a[i - 1] ?? a[i]) * .2 + a[i] * .4 + (a[i + 1] ?? a[i]) * .2 + (a[i + 2] ?? a[i]) * .1);
  const cpu = smooth(state.hist.cpu.length ? state.hist.cpu : [0, 0]);
  area(cpu, cssv("--teal") || "#5FA8A0", true); area(cpu, cssv("--teal") || "#5FA8A0", false);
  area(smooth(state.hist.gpu.length ? state.hist.gpu : [0, 0]), cssv("--sky") || "#4FA6DC", false);
  // сеть: осциллограф (приём вверх, отдача вниз) на сетке
  [g, w, h] = fitCanvas($("c-net"));
  g.clearRect(0, 0, w, h); grid(g, w, h);
  const mid = h / 2;
  g.strokeStyle = cssv("--line-hi"); g.beginPath(); g.moveTo(0, mid + .5); g.lineTo(w, mid + .5); g.stroke();
  const max = Math.max(64, ...state.hist.net, ...state.hist.up);
  const wave = (data, sign, color) => {
    const n = Math.max(2, data.length);
    g.beginPath();
    data.forEach((v, i) => {
      const x = (i / (n - 1)) * w;
      const amp = (Math.log1p(v) / Math.log1p(max)) * (mid - 4);
      const jitter = Math.sin(i * 1.7 + performance.now() / 300) * 1.2;
      const y = mid - sign * (amp + jitter);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = color; g.lineWidth = 1.3; g.shadowColor = color; g.shadowBlur = 8 * (parseFloat(cssv("--glow")) || .25) * 3; g.stroke(); g.shadowBlur = 0;
  };
  wave(state.hist.net.length ? state.hist.net : [0, 0], 1, cssv("--accent") || "#E0A243");
  wave(state.hist.up.length ? state.hist.up : [0, 0], -1, cssv("--coral") || "#E0705A");
  // мини-осциллограф (голос/активность) в левом нижнем углу
  [g, w, h] = fitCanvas($("mini-osc"));
  g.clearRect(0, 0, w, h);
  g.strokeStyle = cssv("--teal"); g.lineWidth = 1; g.beginPath();
  const t = performance.now() / 500, load = (state.metrics.cpu || 5) / 100;
  for (let x = 0; x <= w; x += 2) { const y = h / 2 + Math.sin(x / 6 + t * 3) * (h / 2 - 3) * (0.25 + load) * Math.sin(x / w * Math.PI); x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
}

// глобус (каркас) — сеть; клик открывает Network Recon
$("globe").innerHTML = `<svg viewBox="0 0 40 40" class="hy-icon" style="width:40px;height:40px;stroke-width:1.1">
  <circle cx="20" cy="20" r="16"/><ellipse class="gl-m" cx="20" cy="20" rx="7" ry="16"/><path d="M4 20h32M6.5 12h27M6.5 28h27"/></svg>`;
$("globe").onclick = () => HY.openApp("netrecon");
let globeT = 0;
setInterval(() => { globeT += 0.08; const m = $("globe").querySelector(".gl-m"); if (m) m.setAttribute("rx", Math.abs(Math.cos(globeT)) * 14 + 1); }, 66);

// подсказки клавиш (реальные сочетания)
$("hints").innerHTML = [["CTRL+SHIFT+T", "NEW TAB"], ["CTRL+SHIFT+P", "COMMANDS"], ["CTRL+SHIFT+F", "FIND"], ["?? …", "ASK HAOTICA"], ["CTRL+ALT+B", "PANELS"]]
  .map(([k, v]) => `<b>${k}</b> : ${v}`).join('<span class="sep">·</span>');

// блок загрузок: модели Haotica, обновления, файлы
$("dl-icon").append(icon("download", 32));
$("dl-icon").onclick = () => HY.openApp("updates");
async function downloads() {
  const [mods, upd] = await Promise.all([HY.get("/api/models"), HY.get("/api/updates")]);
  const lines = [];
  const pbar = (f) => "▓".repeat(Math.round(f * 8)) + "░".repeat(8 - Math.round(f * 8));
  if (mods && mods.models) {
    const all = Object.values(mods.models);
    const need = all.reduce((a, m) => a + m.size, 0), have = all.reduce((a, m) => a + Math.min(m.have, m.size), 0);
    const f = need ? have / need : 1;
    lines.push(f >= 1 ? el("div", "NEURAL CORE: ", el("b", { style: { color: "var(--green)" } }, "READY"))
      : el("div", "MODELS ", el("b", pbar(f)), ` ${Math.floor(f * 100)}%`));
    lines.push(el("div", "PACKAGE: ", el("b", (all.find((m) => m.role === "main") || all[0] || {}).label?.split("·")[0]?.trim().slice(0, 22) || "—")));
  }
  if (upd && upd.ok) lines.push(el("div", "UPDATES: ", el("b", { style: { color: upd.count ? "var(--amber)" : "var(--green)" } }, upd.count ? `${upd.count} AVAILABLE` : "UP TO DATE")));
  lines.push(el("div", "CONNECTION: ", el("b", state.metrics.net_name ? "ESTABLISHED" : "—")));
  lines.push(el("div", "SERVICE PROTOCOL: ", el("b", { style: { color: "var(--green)" } }, "ACTIVE")));
  $("dl-lines").replaceChildren(...lines);
}
downloads(); setInterval(downloads, 30000);

// ── Haotica: портрет, голос, короткая связь, карточки команд ─────
import("/ui/avatar.js").then(({ createAvatar, avatarCss }) => {
  const st = el("style", avatarCss()); document.head.append(st);
  state.avatar = createAvatar($("avatar"), { size: 262 });
  $("avatar").onclick = () => showPanel("haotica");
});
const hFrame = $("haotica");
function hPost(msg) { try { hFrame.contentWindow && hFrame.contentWindow.postMessage({ haotica: true, ...msg }, location.origin); } catch (e) { /* ещё грузится */ } }
const voice = { env: new Array(60).fill(0) };
function drawVoice() {
  const [g, w, h] = fitCanvas($("voice-wave"));
  g.clearRect(0, 0, w, h);
  const c = cssv("--violet") || "#A7A3F0";
  const bw = w / voice.env.length;
  voice.env.forEach((v, i) => { const bh = Math.max(1, v * (h - 2)); g.fillStyle = c; g.globalAlpha = .35 + v * .65; g.fillRect(i * bw + 1, (h - bh) / 2, Math.max(1, bw - 2), bh); });
  g.globalAlpha = 1;
}
setInterval(() => { voice.env.push(voice.mouth || 0); voice.env.shift(); voice.mouth = (voice.mouth || 0) * 0.85; drawVoice(); }, 50);
function setHState(s) {
  $("h-state").textContent = (s || "idle").toUpperCase();
  if (state.avatar) state.avatar.setState(s);
}
HY.stream(["state", "mouth", "card", "message"], {
  state: (d) => setHState(d.state),
  mouth: (d) => { voice.mouth = d.v; if (state.avatar) state.avatar.setMouth(d.v); },
  card: (c) => showCard(c),
  message: (m) => { if (m.role === "assistant" && m.final) reply(m.text); },
}, HY.haoticaUrl);
function reply(text) {
  const box = $("h-reply");
  box.replaceChildren(el("span.who", "HAOTICA"), el("span", ""));
  HY.decode(box.lastChild, text.slice(0, 600), Math.min(1800, 200 + text.length * 4));
}
async function ask(text, context = {}) {
  if (!text.trim()) return;
  const t = state.active;
  $("h-reply").replaceChildren(el("span.who", "YOU"), el("span", text));
  setHState("thinking");
  const r = await HY.haotica("POST", "/api/chat", { text, source: "terminal", chat: "terminal",
    context: { cwd: t ? t.cwd : "", ...context }, wait: true });
  if (r && r.ok && r.text) reply(r.text);
  else if (!r || r.status === 0 || r.ok === false) reply(r && r.error ? r.error : "NEURAL CORE OFFLINE — модель ещё загружается или выключена.");
  setHState("idle");
}
$("h-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const v = e.target.value; e.target.value = ""; ask(v); }
  if (e.key === "Escape") { e.target.value = ""; state.active && state.active.term.focus(); }
});

// карточка команды от Haotica: [TAB] вставить в строку / [ESC] отклонить; опасные — только с подтверждением
function showCard(c) {
  if (!c || c.kind !== "command") return;
  document.querySelector(".t-card")?.remove();
  const risk = (c.risk && c.risk.level) || "write";
  const card = el("div.t-card",
    el("div.t", icon("haotica", 14), "HAOTICA // " + (c.title || "КОМАНДА"), el("span.risk." + risk, risk === "danger" ? "DANGER" : risk === "read" ? "READ-ONLY" : "CHANGES")),
    el("pre", c.command),
    c.why ? el("div.why", c.why) : null,
    risk === "danger" ? el("div.why.err", "⚠ " + ((c.risk.reasons || []).join(", ") || "опасная команда")) : null,
    el("div.act",
      el("button.hy-btn.primary.small", { onclick: () => accept() }, risk === "danger" ? "ПОНИМАЮ, ВСТАВИТЬ" : "[TAB] ВСТАВИТЬ"),
      el("button.hy-btn.small", { onclick: () => reject() }, "[ESC] ОТКЛОНИТЬ")));
  $("terms").append(card);
  const accept = () => { card.remove(); if (state.active) state.active.input(c.command); HY.haotica("POST", `/api/card/${c.id}/accept`, {}); };
  const reject = () => { card.remove(); HY.haotica("POST", `/api/card/${c.id}/reject`, {}); state.active && state.active.term.focus(); };
  const key = (e) => {
    if (!document.body.contains(card)) return document.removeEventListener("keydown", key, true);
    if (e.key === "Tab" && risk !== "danger") { e.preventDefault(); e.stopPropagation(); accept(); document.removeEventListener("keydown", key, true); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); reject(); document.removeEventListener("keydown", key, true); }
  };
  document.addEventListener("keydown", key, true);
}

window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || !e.data.haotica) return;
  const d = e.data;
  if (d.type === "insert" && state.active) state.active.input(d.text);
  if (d.type === "run" && state.active) state.active.input(d.text + "\r");
  if (d.type === "preview") preview(d.path);
  if (d.type === "close-overlay") $("overlay").classList.add("hidden");
});
function onFailed(tab, b) {
  renderStatus();
  logLine("error", `EXIT ${b.code} // ${b.cmd.slice(0, 40)}`, "FAIL");
  HY.haotica("POST", "/api/terminal/block", { cmd: b.cmd, code: b.code, ms: Math.round(b.ms), cwd: b.cwd, output: tab.output(b, 160) });
}
function askHaotica(tab, b) {
  ask(`Разбери: команда «${b.cmd}» завершилась с кодом ${b.code}.`, { cmd: b.cmd, code: b.code, cwd: b.cwd, output: tab.output(b, 300) });
}

// строка сеанса
function renderStatus() {
  const t = state.active;
  if (!t) return;
  const i = state.tabs.indexOf(t) + 1;
  $("s-title").textContent = `SESSION ${i}`;
  $("s-path").textContent = "// " + t.cwd.replace(HY.boot.home || "\0", "~");
  const last = t.blocks[t.blocks.length - 1];
  $("s-state").textContent = `${t.blocks.length} BLOCKS` + (last ? (last.code ? ` · EXIT ${last.code}` : " · OK") : "");
  $("s-state").style.color = last && last.code ? "var(--coral)" : "";
}

// ── Cloud Link и палитра команд ─────────────────────────────────
function openCloud() {
  const o = $("overlay");
  $("overlay-frame").src = "/apps/cloud/index.html?embed=terminal";
  o.classList.remove("hidden");
  o.onclick = (e) => { if (e.target === o) o.classList.add("hidden"); };
}
function palettePower() {
  HY.menu(innerWidth / 2 - 120, 160, [["quiet", "ТИХИЙ"], ["balanced", "БАЛАНС"], ["performance", "ПРОИЗВОДИТЕЛЬНОСТЬ"]].map(([v, l]) =>
    ({ label: l, icon: "bolt", fn: () => HY.setting(state.metrics.on_battery ? "power.profile_battery" : "power.profile_ac", v) })));
}
function palette() {
  document.querySelector(".t-palette")?.remove();
  const t = state.active;
  const cmds = [
    { label: HY.t("newtab"), key: "Ctrl+Shift+T", icon: "plus", fn: () => newTab({ cwd: t ? t.cwd : "" }) },
    { label: HY.t("closetab"), key: "Ctrl+Shift+W", icon: "close", fn: () => t && closeTab(t) },
    { label: HY.t("cloud"), key: "/cloud", icon: "cloud", fn: openCloud },
    { label: HY.t("find"), key: "Ctrl+Shift+F", icon: "search", fn: () => t && findBar(t) },
    { label: "Журнал", key: "", icon: "doc", fn: () => showPanel("log") },
    { label: "Файлы", key: "", icon: "folder", fn: () => showPanel("files") },
    { label: "Haotica — чат", key: "", icon: "haotica", fn: () => showPanel("haotica") },
    { label: HY.t("toggle_left"), key: "Ctrl+Alt+B", icon: "layout", fn: () => { document.body.classList.toggle("no-left"); refit(); } },
    { label: HY.t("toggle_right"), key: "Ctrl+Shift+H", icon: "layout", fn: () => { document.body.classList.toggle("no-right"); refit(); } },
    { label: "CRT терминала вкл/выкл", key: "", icon: "eye", fn: () => HY.setting("effects.crt_terminal", document.body.classList.contains("no-crt") ? 0.7 : 0) },
    { label: HY.t("prev_block"), key: "Ctrl+Shift+↑", icon: "chevron", fn: () => t && t.jump(-1) },
    { label: HY.t("next_block"), key: "Ctrl+Shift+↓", icon: "chevron", fn: () => t && t.jump(1) },
    { label: HY.t("font_up"), key: "Ctrl+=", icon: "plus", fn: () => setFont(state.fontSize + 1) },
    { label: HY.t("font_down"), key: "Ctrl+-", icon: "minus", fn: () => setFont(state.fontSize - 1) },
    { label: HY.t("clear"), key: "Ctrl+Shift+K", icon: "trash", fn: () => t && t.term.clear() },
    { label: "Скрытые файлы", key: "", icon: "eye", fn: () => { state.hidden = !state.hidden; loadDir(state.dir); showPanel("files"); } },
    { label: "Режим питания…", key: "", icon: "bolt", fn: palettePower },
    { label: HY.t("settings"), key: "", icon: "settings", fn: () => HY.openApp("settings", ["--page", "appearance"]) },
    { label: "Haotica: разобрать последнюю ошибку", key: "", icon: "haotica", fn: () => {
      const b = t && [...t.blocks].reverse().find((x) => x.code); if (b) askHaotica(t, b); } },
  ];
  const inp = el("input", { placeholder: HY.t("palette") + "  (/cloud, /new, …)" });
  const res = el("div.res");
  let sel = 0, shown = cmds;
  const render = () => {
    const q = inp.value.trim().toLowerCase().replace(/^\//, "");
    shown = cmds.filter((c) => !q || c.label.toLowerCase().includes(q) || (c.key || "").toLowerCase().includes(q));
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    res.replaceChildren(...shown.map((c, i) => el("div.r" + (i === sel ? ".on" : ""), { onclick: () => run(c) }, icon(c.icon, 14), c.label, el("span.k", c.key))));
  };
  const box = el("div.t-palette.hy-blueprint", inp, res);
  const run = (c) => { box.remove(); c.fn(); if (state.active) state.active.term.focus(); };
  inp.addEventListener("input", () => { sel = 0; render(); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(shown.length - 1, sel + 1); render(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    if (e.key === "Enter" && shown[sel]) run(shown[sel]);
    if (e.key === "Escape") { box.remove(); state.active && state.active.term.focus(); }
  });
  document.body.append(box);
  render();
  inp.focus();
}
function findBar(t) {
  document.querySelector(".t-search")?.remove();
  const inp = el("input.hy-input.mono", { placeholder: HY.t("find") });
  const bar = el("div.t-search", inp,
    el("button.hy-btn.icon.small", { onclick: () => t.search.findPrevious(inp.value) }, icon("chevron", 14)),
    el("button.hy-btn.icon.small", { onclick: () => t.search.findNext(inp.value) }, icon("chevron", 14)),
    el("button.hy-btn.icon.small.ghost", { onclick: () => { bar.remove(); t.term.focus(); } }, icon("close", 14)));
  bar.children[1].style.transform = "rotate(-90deg)"; bar.children[2].style.transform = "rotate(90deg)";
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.shiftKey ? t.search.findPrevious(inp.value) : t.search.findNext(inp.value, { incremental: false });
    if (e.key === "Escape") { bar.remove(); t.term.focus(); }
  });
  inp.addEventListener("input", () => t.search.findNext(inp.value, { incremental: true }));
  t.box.append(bar);
  inp.focus();
}

// ── запуск ───────────────────────────────────────────────────────
$("p-preview").replaceChildren(el("div.t-prev-empty", el("div", icon("eye", 32), el("div", { style: { marginTop: "10px" } }, HY.t("pick")))));
renderCats();
showPanel("log");
applyCrt();
const argv = HY.args || [];
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : ""; };
newTab({ cwd: argOf("--cwd") || argv.find((a) => a.startsWith("/")) || "", command: argOf("--run") });
HY.on("open", (args) => {
  const i = args.indexOf("--run");
  newTab({ cwd: (args[args.indexOf("--cwd") + 1]) || (state.active ? state.active.cwd : ""), command: i >= 0 ? args[i + 1] : "" });
});
bars(); mini(); drawCharts();
setInterval(drawCharts, 120);
