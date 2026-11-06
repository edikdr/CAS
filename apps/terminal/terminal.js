// Терминал HAOTICA: xterm.js + PTY хоста (Linux — pty, Windows — ConPTY), вкладки и панели (split),
// профили оболочек (PowerShell 7 / Windows PowerShell / cmd / WSL / Git Bash / zsh / bash), блоки команд
// (OSC 133), кликабельные пути (OSC 8 и распознавание в выводе, в т. ч. C:\…), файловая панель, превью,
// системные виджеты, Haotica (мини-чат под аватаром, панель справа), палитра команд.
// Поведение клавиш и мыши — как в Windows Terminal (см. docs/UI-INVENTORY.md).
import { HY, el, icon } from "/ui/hy.js";
import { Terminal } from "/ui/vendor/xterm/xterm.mjs";
import { FitAddon } from "/ui/vendor/xterm/addon-fit.mjs";
import { WebglAddon } from "/ui/vendor/xterm/addon-webgl.mjs";
import { WebLinksAddon } from "/ui/vendor/xterm/addon-web-links.mjs";
import { Unicode11Addon } from "/ui/vendor/xterm/addon-unicode11.mjs";
import { SearchAddon } from "/ui/vendor/xterm/addon-search.mjs";
import { ImageAddon } from "/ui/vendor/xterm/addon-image.mjs";
import { ClipboardAddon } from "/ui/vendor/xterm/addon-clipboard.mjs";
import { ChatView } from "/ui/chat.js";

HY.i18n({
  ru: { newtab: "Новая вкладка", closetab: "Закрыть вкладку", exited: "процесс завершён (код {code}) — Enter: перезапуск",
    copy_out: "Копировать вывод блока", copy_cmd: "Копировать команду", explain: "Haotica: разобрать ошибку", rerun: "Выполнить снова",
    open: "Открыть", open_editor: "Открыть в редакторе", reveal: "Показать в папке", copy_path: "Копировать путь",
    insert_path: "Вставить путь в терминал", cd_here: "Перейти сюда", tag: "Теги…", ask: "Haotica: что это за файл?",
    palette: "Команда…", toggle_left: "Левая колонка", toggle_right: "Правая колонка", find: "Поиск в выводе",
    clear: "Очистить экран", font_up: "Крупнее шрифт", font_down: "Мельче шрифт", font_reset: "Шрифт по умолчанию",
    cloud: "Облачная модель и ключ", settings: "Настройки терминала", prev_block: "Предыдущий блок", next_block: "Следующий блок",
    nothing: "НЕТ ПРЕВЬЮ", pick: "ВЫБЕРИТЕ ФАЙЛ", pages: "стр.", entries: "записей", lines: "строк", all: "все",
    paste: "Вставить", rename: "Переименовать", duplicate: "Дублировать вкладку", split_v: "Разделить вертикально",
    split_h: "Разделить горизонтально", close_pane: "Закрыть панель", profiles: "Профили", fullscreen: "Во весь экран",
    ontop: "Поверх всех окон", admin: "Новое окно от имени администратора", to_top: "К началу", to_end: "К концу",
    paste_many: "Вставить {n} строк?", paste_many_t: "Многострочная вставка: каждая строка может выполниться как отдельная команда.",
    busy_close: "В вкладке работает программа ({name}). Закрыть?", busy_window: "Работающих вкладок: {n}. Закрыть окно и завершить их?",
    spawn_fail: "Не удалось запустить оболочку", case: "Регистр", word: "Слово целиком", regex: "Регулярное выражение",
    no_matches: "нет совпадений" },
  en: { newtab: "New tab", closetab: "Close tab", exited: "process exited (code {code}) — Enter: restart",
    copy_out: "Copy block output", copy_cmd: "Copy command", explain: "Haotica: explain error", rerun: "Run again",
    open: "Open", open_editor: "Open in editor", reveal: "Show in folder", copy_path: "Copy path",
    insert_path: "Insert path", cd_here: "cd here", tag: "Tags…", ask: "Haotica: what is this file?",
    palette: "Command…", toggle_left: "Left column", toggle_right: "Right column", find: "Find in output",
    clear: "Clear", font_up: "Bigger font", font_down: "Smaller font", font_reset: "Reset font", cloud: "Cloud model & key",
    settings: "Terminal settings", prev_block: "Previous block", next_block: "Next block", nothing: "NO PREVIEW",
    pick: "SELECT A FILE", pages: "pages", entries: "entries", lines: "lines", all: "all", paste: "Paste", rename: "Rename",
    duplicate: "Duplicate tab", split_v: "Split vertically", split_h: "Split horizontally", close_pane: "Close pane",
    profiles: "Profiles", fullscreen: "Fullscreen", ontop: "Always on top", admin: "New window as administrator",
    to_top: "To top", to_end: "To end", paste_many: "Paste {n} lines?",
    paste_many_t: "Multi-line paste: each line may run as a separate command.", busy_close: "A program is running ({name}). Close?",
    busy_window: "Running tabs: {n}. Close the window and stop them?", spawn_fail: "Failed to start the shell",
    case: "Match case", word: "Whole word", regex: "Regex", no_matches: "no matches" },
});

const $ = (id) => document.getElementById(id);
const CATS = ["all", "dir", "code", "doc", "image", "video", "audio", "archive", "model"];
const state = { tabs: [], active: null, fontSize: 13, metrics: {}, hist: { cpu: [], gpu: [], gtt: [], tps: [] },
  dir: "", cat: "all", hidden: false, selected: "", statCache: new Map(), lastClick: { uri: "", t: 0 },
  profiles: [], defaultProfile: "", search: { caseSensitive: false, wholeWord: false, regex: false } };
window.__hyterm = state;

await HY.start({ title: "TERMINAL // HAOTICA", glyph: "terminal", topics: ["metrics", "events", "recon", "gamemode"],
  ctrlW: false, chrome: false });
// окно без видеокарты (безопасный режим графики): никаких дорогих эффектов, отрисовка — процессором
const LOWFX = !!(HY.boot && HY.boot.safe_gfx);
document.documentElement.classList.toggle("lowfx", LOWFX);
const IS_WIN = (HY.boot.platform || (navigator.platform || "").toLowerCase().startsWith("win") && "windows") === "windows";
const FEAT = HY.boot.features || {};
document.body.classList.toggle("is-win", IS_WIN);
HY.edges();
document.querySelector(".hy-app").classList.add("hy-boot");
// анимация включения закончилась — снять класс: заполненная анимация фильтра держала у корня окна свой слой
setTimeout(() => document.querySelector(".hy-app").classList.remove("hy-boot"), 2500);
// общий такт украшений: таймеры аватара, фона, графиков, часов и метрик срабатывают в одни и те же моменты
// (кратные периоду от общего начала отсчёта), и Chromium собирает их изменения в один кадр. Раньше каждый
// таймер давал свой кадр — до ~20 кадров/с в простое, и на каждый окно перерисовывалось целиком.
const beat = (ms) => ms - (performance.now() % ms) + 1;
const onBeat = (ms, fn) => setTimeout(() => requestAnimationFrame(fn), beat(ms));
$("winbtns").append(
  el("button.winbtn", { title: HY.t("cloud") + "  /key", onclick: () => openCloud() }, icon("cloud", 14)),
  el("button.winbtn", { title: HY.t("palette") + "  Ctrl+Shift+P", onclick: () => palette() }, icon("search", 14)),
  ...HY.winButtons());
HY.dragArea($("drag1")); HY.dragArea($("drag2"));

const crtMod = import("/ui/crt.js");
const SET = () => (HY.settings && HY.settings.terminal) || {};
const termTheme = () => {
  const t = (HY.theme && HY.theme.terminal) || {};
  // прозрачный фон: под текстом — руки из живого кода (art.js) и рамка HUD
  return { ...t, background: "#00000000",
    scrollbarSliderBackground: "#ffffff14", scrollbarSliderHoverBackground: "#ffffff26", scrollbarSliderActiveBackground: "#ffffff33",
    overviewRulerBorder: "#00000000" };
};
const baseFont = () => +SET().font_size || (HY.theme.fonts && HY.theme.fonts.termSize) || 13;
state.fontSize = baseFont();
const termFont = () => SET().font || getComputedStyle(document.documentElement).getPropertyValue("--font-term").trim() || "JetBrains Mono, monospace";
const clampScroll = (n) => Math.max(1000, Math.min(100000, +n || 20000));

// ── профили оболочек ─────────────────────────────────────────────
async function loadProfiles() {
  if (!HY.bridge || !HY.bridge.ptyProfiles) {
    state.profiles = [{ id: "dev", name: "dev", kind: "bash" }]; state.defaultProfile = "dev"; return;
  }
  const raw = await new Promise((res) => HY.bridge.ptyProfiles(res));
  try { const d = JSON.parse(raw || "{}"); state.profiles = d.profiles || []; state.defaultProfile = d.default || ""; }
  catch (e) { state.profiles = []; }
}
const profileOf = (id) => state.profiles.find((p) => p.id === id) || state.profiles.find((p) => p.id === state.defaultProfile) || state.profiles[0] || { id: "", kind: "bash", name: "shell" };

// пути: Windows (C:\…, \\server\share), WSL (/mnt/c/…, \\wsl.localhost\<дистр>\…), Git Bash (/c/…)
function osc7Path(data, pane) {
  let p = data;
  try { const u = new URL(data); p = decodeURIComponent(u.pathname); } catch (e) { p = data.replace(/^file:\/\/[^/]*/, ""); }
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);                            // /C:/Users → C:/Users
  if (/^[A-Za-z]:/.test(p)) return p.replaceAll("/", "\\");
  if (IS_WIN && pane) {
    if (pane.kind === "wsl") {
      const m = p.match(/^\/mnt\/([a-z])(\/.*)?$/);
      if (m) return m[1].toUpperCase() + ":" + (m[2] || "\\").replaceAll("/", "\\");
      return `\\\\wsl.localhost\\${pane.profile.distro || ""}${p.replaceAll("/", "\\")}`;
    }
    const g = p.match(/^\/([a-z])(\/.*)?$/);                               // Git Bash: /c/Users
    if (g) return g[1].toUpperCase() + ":" + (g[2] || "\\").replaceAll("/", "\\");
  }
  return p;
}
const isAbs = (p) => /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p);
const sepOf = (p) => (/^[A-Za-z]:|^\\\\/.test(p) ? "\\" : "/");
function baseName(p) { return (p || "").split(/[\\/]/).filter(Boolean).pop() || p || "/"; }

// кавычки для вставки пути по правилам оболочки
function quoteFor(kind, p) {
  if (kind === "pwsh") return /^[\w\\/:.\-]+$/.test(p) ? p : "'" + p.replaceAll("'", "''") + "'";
  if (kind === "cmd") return /[\s&()[\]{}^=;!'+,`~]/.test(p) ? `"${p}"` : p;
  if (kind === "wsl") { const m = p.match(/^([A-Za-z]):[\\/](.*)$/); if (m) p = `/mnt/${m[1].toLowerCase()}/${m[2].replaceAll("\\", "/")}`; }
  else if (kind === "bash" && IS_WIN) { const m = p.match(/^([A-Za-z]):[\\/](.*)$/); if (m) p = `/${m[1].toLowerCase()}/${m[2].replaceAll("\\", "/")}`; }
  return /^[\w@%+=:,./~-]+$/.test(p) ? p : "'" + p.replaceAll("'", "'\\''") + "'";
}
const cdCmd = (kind, p) => kind === "cmd" ? `cd /d ${quoteFor(kind, p)}` : kind === "pwsh" ? `Set-Location -LiteralPath ${quoteFor(kind, p)}` : `cd ${quoteFor(kind, p)}`;

// ── панель (одна сессия оболочки) ────────────────────────────────
class Pane {
  constructor(tab, { cwd = "", command = "", profile = "" } = {}) {
    this.tab = tab;
    this.id = Math.random().toString(36).slice(2, 9);
    this.profile = profileOf(profile);
    this.kind = this.profile.kind;
    this.cwd = cwd || HY.boot.home || "~";
    this.title = "";
    this.blocks = [];
    this.cur = null;              // блок, который сейчас выполняется
    this.lastCmd = "";
    this.pending = command;       // команда --run: вводится после первого приглашения
    this.box = el("div.t-pane");
    this.box.addEventListener("mousedown", () => tab.focusPane(this), true);
    const s = SET();
    this.term = new Terminal({
      fontFamily: termFont(), fontSize: state.fontSize, lineHeight: +s.line_height || 1.18, letterSpacing: 0,
      cursorStyle: s.cursor_style || "bar", cursorBlink: s.cursor_blink !== false, cursorWidth: 2,
      scrollback: clampScroll(s.scrollback), allowProposedApi: true, allowTransparency: true,
      drawBoldTextInBrightColors: false, minimumContrastRatio: 1, smoothScrollDuration: 90, theme: termTheme(),
      overviewRuler: { width: 8 }, rightClickSelectsWord: (s.right_click || "menu") === "menu", macOptionIsMeta: true,
      altClickMovesCursor: false, windowsPty: IS_WIN ? { backend: "conpty", buildNumber: 22621 } : undefined,
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
    // окно, разделители панелей, скрытие колонок — любое изменение размера панели подгоняет терминал
    let raf = 0;
    this.ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (this.box.offsetWidth) this.dims(); }); });
    this.ro.observe(this.box);
    try { const gl = new WebglAddon(); gl.onContextLoss(() => gl.dispose()); this.term.loadAddon(gl); } catch (e) { /* остаётся DOM-рендер */ }
    this.osc();
    this.links();
    this.keys();
    this.mouse();
    this.term.onTitleChange((t) => { this.title = t.slice(0, 60); renderTabs(); if (cur() === this) syncTitle(); });
    this.term.onBell(() => this.bell());
    this.term.onSelectionChange(() => { if (SET().copy_on_select && this.term.hasSelection()) copyText(this.term.getSelection()); });
    this.term.textarea && this.term.textarea.addEventListener("focus", () => tab.focusPane(this, false));
    this.box.addEventListener("paste", (e) => this.onPaste(e), true);
    this.box.addEventListener("dragover", (e) => e.preventDefault());
    this.box.addEventListener("drop", (e) => {
      e.preventDefault();
      const p = e.dataTransfer.getData("text/x-haotica-path") || uriToPath(e.dataTransfer.getData("text/uri-list")) || e.dataTransfer.getData("text/plain");
      if (p) this.insertPaths(p.split(/\r?\n/).filter(Boolean));
    });
    this.spawn();
  }

  spawn() {
    this.exited = false;
    const { cols, rows } = this.dims();
    if (!this.dataHook) {
      this.dataHook = this.term.onData((d) => {
        if (this.exited) { if (d === "\r") { this.term.write("\r\n"); this.spawn(); } return; }
        // у cmd нет OSC 133 C: Enter владельца — значит, команда пошла и до нового приглашения вкладка занята
        if (this.kind === "cmd" && d.includes("\r")) this.atPrompt = false;
        if (this.sid) HY.bridge.ptyWrite(this.sid, d);
      });
      // размер — в PTY не на каждый пиксель перетаскивания, а последним значением (оболочка перерисовывается раз)
      let rt = 0;
      this.term.onResize(({ cols, rows }) => { clearTimeout(rt); rt = setTimeout(() => this.sid && HY.bridge.ptyResize(this.sid, this.term.cols, this.term.rows), 40); });
    }
    if (!HY.bridge) {                      // разработка в браузере: без PTY
      this.term.write("\x1b[33mРежим разработки: нет хоста PTY.\x1b[0m\r\n");
      return;
    }
    // на Windows команда --run вводится после первого приглашения; на Linux её выполняет интеграция оболочки
    const cmd = IS_WIN ? "" : (this.pending || "");
    if (!IS_WIN) this.pending = "";
    const done = (sid) => {
      if (!sid || String(sid).startsWith("error:")) {
        this.exited = true;
        this.term.write(`\r\n\x1b[31m${HY.t("spawn_fail")}: ${String(sid || "").slice(6)}\x1b[0m\r\n`);
        return;
      }
      this.sid = sid; sessions.set(sid, this);
      if (this.pending) setTimeout(() => this.flushPending(), 2500);
    };
    if (HY.bridge.ptySpawnProfile) HY.bridge.ptySpawnProfile(this.profile.id || "", this.cwd, cols, rows, cmd, done);
    else HY.bridge.ptySpawn(this.cwd, cols, rows, cmd, done);
  }

  flushPending() { if (this.pending && this.sid) { const c = this.pending; this.pending = ""; HY.bridge.ptyWrite(this.sid, c + "\r"); } }
  dims() { try { this.fit.fit(); } catch (e) { /* окно ещё не видно */ } return { cols: this.term.cols || 100, rows: this.term.rows || 30 }; }
  input(text) { if (this.sid) HY.bridge.ptyWrite(this.sid, text); else if (window.__hyDevWrite) window.__hyDevWrite(this, text); this.term.focus(); }
  insertPaths(list) { this.input(list.map((p) => quoteFor(this.kind, p)).join(" ") + " "); }
  info() { return new Promise((res) => (this.sid && HY.bridge && HY.bridge.ptyInfo) ? HY.bridge.ptyInfo(this.sid, (j) => { try { res(JSON.parse(j)); } catch (e) { res({}); } }) : res({})); }

  bell() {
    const mode = SET().bell || "visual";
    if (mode !== "off") {
      if (mode === "sound") HY.sound("bell", 0.4);
      else { this.box.classList.remove("bell"); void this.box.offsetWidth; this.box.classList.add("bell"); }
    }
    if (cur() !== this) { this.tab.activity = true; renderTabs(); }
  }

  // вставка: многострочная — с предупреждением; bracketed paste — только если программа его включила
  async onPaste(e) {
    const text = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
    e.preventDefault(); e.stopPropagation();
    await this.paste(text);
  }
  async paste(text) {
    if (!text) return;
    const n = text.replace(/\r?\n$/, "").split(/\r?\n/).length;
    if (n > 1 && SET().paste_warn !== false && !this.term.modes.bracketedPasteMode) {
      const ok = await HY.confirm(HY.t("paste_many", { n }), el("div", el("div", HY.t("paste_many_t")),
        el("pre.t-paste-prev", text.slice(0, 600) + (text.length > 600 ? "\n…" : ""))), { ok: HY.t("paste") });
      if (!ok) { this.term.focus(); return; }
    }
    this.term.paste(IS_WIN ? text : text.replace(/\r\n/g, "\n"));
    this.term.focus();
  }

  // OSC 133 — блоки, OSC 7 — папка, OSC 7777 — текст команды
  osc() {
    const p = this.term.parser;
    p.registerOscHandler(7, (data) => {
      this.cwd = osc7Path(data, this);
      if (cur() === this) { loadDir(this.cwd); renderStatus(); }
      renderTabs();
      return true;
    });
    p.registerOscHandler(9, (data) => {                       // OSC 9;9;<path> (Windows Terminal, cmd/pwsh)
      const m = data.match(/^9;"?(.+?)"?$/);
      if (m) { this.cwd = osc7Path(m[1], this); if (cur() === this) { loadDir(this.cwd); renderStatus(); } renderTabs(); }
      return !!m;
    });
    p.registerOscHandler(7777, (data) => {
      const m = data.match(/^cmd=(.*)$/);
      if (m) { try { this.lastCmd = new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))); } catch (e) { this.lastCmd = ""; } }
      return true;
    });
    p.registerOscHandler(133, (data) => {
      const [kind, arg] = data.split(";");
      const buf = this.term.buffer.active;
      this.integrated = true;                                  // интеграция оболочки работает
      if (kind === "A") {
        this.promptMarker = this.term.registerMarker(0);
        this.atPrompt = true;
        if (this.pending) setTimeout(() => this.flushPending(), 30);
        if (this.waiters) for (const w of this.waiters.splice(0)) w();
      } else if (kind === "C") {
        this.atPrompt = false;
        this.cur = { cmd: this.lastCmd, start: this.promptMarker || this.term.registerMarker(0),
          out: this.term.registerMarker(0), t0: performance.now(), cwd: this.cwd, exec: this.execId || "" };
        this.execId = "";
        this.cur.deco = this.decorate(this.cur, "run", 1);
      } else if (kind === "D" && !this.cur && this.promptMarker && !this.promptMarker.isDisposed) {
        // оболочка без начала команды (PowerShell без PSReadLine): блок — от прошлого приглашения до этого места
        const cy = buf.baseY + buf.cursorY, from = this.promptMarker.line;
        this.cur = { cmd: this.lastCmd, start: this.promptMarker, out: this.term.registerMarker(Math.min(0, from + 1 - cy)),
          t0: this.execT0 || performance.now(), cwd: this.cwd, exec: this.execId || "" };
        this.execId = ""; this.execT0 = 0;
      }
      if (kind === "D" && this.cur) {
        const b = this.cur;
        this.cur = null;
        b.code = parseInt(arg || "0", 10) || 0;
        b.ms = performance.now() - b.t0;
        b.end = this.term.registerMarker(0);
        b.alt = this.altSeen; this.altSeen = false;
        const height = Math.max(1, (buf.baseY + buf.cursorY) - b.start.line);
        if (b.deco) b.deco.dispose();
        b.deco = this.decorate(b, b.code === 0 ? "ok" : "fail", height);
        this.blocks.push(b);
        if (this.blocks.length > 400) { const old = this.blocks.shift(); old.deco && old.deco.dispose(); }
        if (b.code !== 0 && b.code !== 130 && !b.exec) onFailed(this, b);
        if (b.ms > 10000 && (document.hidden || !document.hasFocus())) HY.bridge && HY.bridge.notify("Команда завершена", `${b.cmd.slice(0, 60)} · ${fmtMs(b.ms)}`);
        HY.emit("block", { pane: this, block: b });
        if (cur() === this) renderStatus();
      }
      return true;
    });
    this.term.buffer.onBufferChange((b) => { if (b.type === "alternate") this.altSeen = true; });
  }

  decorate(b, kind, height) {
    if (!b.start || b.start.isDisposed) return null;
    const d = this.term.registerDecoration({ marker: b.start, x: 0, width: this.term.cols, height, layer: "bottom",
      overviewRulerOptions: kind === "fail" ? { color: "#E0705A", position: "full" } : kind === "ok" ? { color: "#8FBF7A44", position: "left" } : undefined });
    if (!d) return null;
    d.onRender((node) => {
      node.className = "t-block " + kind + (b.exec ? " ai" : "");
      if (!node.firstChild && kind !== "run") {
        const txt = kind === "fail" ? `EXIT ${b.code} · ${fmtMs(b.ms)}` : `✓ ${fmtMs(b.ms)}`;
        node.append(el("span.badge", (b.exec ? "HAOTICA · " : "") + txt));
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

  contextMenu(e) {
    const rect = this.box.querySelector(".xterm-screen").getBoundingClientRect();
    const cellH = rect.height / this.term.rows;
    const row = this.term.buffer.active.viewportY + Math.floor((e.clientY - rect.top) / cellH);
    const b = this.blockAt(row);
    const sel = this.term.getSelection();
    const items = [];
    if (sel) items.push({ label: HY.t("copy"), icon: "clipboard", key: "Ctrl+C", fn: () => copyText(sel) });
    items.push({ label: HY.t("paste"), icon: "doc", key: "Ctrl+V", fn: () => pasteFromClipboard(this) });
    if (b) {
      items.push("-");
      items.push({ label: HY.t("copy_cmd"), icon: "terminal", fn: () => copyText(b.cmd) });
      items.push({ label: HY.t("copy_out"), icon: "clipboard", fn: () => copyText(this.output(b, 100000)) });
      items.push({ label: HY.t("rerun"), icon: "reboot", fn: () => this.input(b.cmd + "\r") });
      items.push({ label: HY.t("explain"), icon: "haotica", fn: () => askHaotica(this, b, true) });
    }
    items.push("-", { label: HY.t("split_v"), icon: "layout", key: "Alt+Shift++", fn: () => this.tab.split("v") },
      { label: HY.t("split_h"), icon: "layout", key: "Alt+Shift+−", fn: () => this.tab.split("h") },
      "-", { label: HY.t("find"), icon: "search", key: "Ctrl+Shift+F", fn: () => findBar(this) },
      { label: HY.t("clear"), icon: "trash", key: "Ctrl+Shift+K", fn: () => this.term.clear() });
    HY.menu(e.clientX, e.clientY, items);
  }

  // правая кнопка: меню / вставить / копировать-если-выделено-иначе-вставить (настройка terminal.right_click)
  mouse() {
    this.box.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const mode = SET().right_click || "menu";
      if (mode === "menu" || e.shiftKey) return this.contextMenu(e);
      if (mode === "copy_paste" && this.term.hasSelection()) { copyText(this.term.getSelection()); this.term.clearSelection(); return; }
      pasteFromClipboard(this);
    });
    this.box.addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault(); e.stopPropagation();
      setFont(state.fontSize + (e.deltaY < 0 ? 1 : -1));
    }, { capture: true, passive: false });
  }

  // пути в выводе: «src/app.py:42», «./x», «~/y», «/etc/z», «C:\Users\x», «.\x», «src\a.py:12» — проверяем и делаем ссылками
  links() {
    const rx = /(?:^|[\s'"(=:])((?:[A-Za-z]:[\\/]|\\\\[\w.$-]+\\)[^\s'"<>|*?:]*[^\s'"<>|*?:.,;)]|(?:~|\.{1,2}|\/)?[\w@%+.~-]*[\\/][\w@%+.~\\/-]*[\w@%+~-]|[\w@%+-]+\.(?:py|js|mjs|ts|tsx|json|md|toml|ya?ml|sh|ps1|psm1|bat|cmd|lua|qml|rs|go|c|h|cpp|cs|txt|log|conf|ini|css|html))(?::(\d+))?/g;
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
            activate: (e) => onLink(e, pathUri(resolvePath(f.raw, this.cwd)) + (f.line ? "#L" + f.line : ""), this),
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
      const altGr = e.getModifierState && e.getModifierState("AltGraph");
      if (altGr || (IS_WIN && e.ctrlKey && e.altKey && e.key.length === 1)) return true;   // AltGr-символы — в оболочку
      const action = keyAction(e, this);
      if (!action) return true;
      if (action === "native") return false;          // браузер сам сделает вставку (событие paste)
      e.preventDefault();
      runAction(action, this);
      return false;
    });
  }

  jump(dir) {
    const vy = this.term.buffer.active.viewportY;
    const list = this.blocks.map((b) => b.start.line);
    const target = dir < 0 ? list.filter((l) => l < vy).pop() : list.find((l) => l > vy);
    if (target !== undefined) this.term.scrollToLine(target);
  }

  // ждать приглашения (для команд Haotica): резолвится на следующем OSC 133 A
  waitPrompt(ms = 15000) {
    if (this.atPrompt) return Promise.resolve(true);
    return new Promise((res) => { (this.waiters ||= []).push(() => res(true)); setTimeout(() => res(false), ms); });
  }

  dispose() { if (this.ro) this.ro.disconnect(); if (this.sid) HY.bridge.ptyKill(this.sid); sessions.delete(this.sid); this.term.dispose(); this.box.remove(); }
}

// ── клавиши: таблица сочетаний (переопределяются в terminal.keys) ─────
const DEFAULT_KEYS = {
  "ctrl+shift+c": "copy", "ctrl+insert": "copy", "ctrl+shift+v": "native", "shift+insert": "native",
  "ctrl+shift+t": "newTab", "ctrl+shift+w": "closePane", "ctrl+shift+d": "duplicateTab", "ctrl+shift+f": "find",
  "ctrl+shift+p": "palette", "ctrl+shift+k": "clear", "ctrl+shift+h": "toggleRight", "ctrl+shift+b": "toggleLeft",
  "ctrl+shift+arrowup": "prevBlock", "ctrl+shift+arrowdown": "nextBlock", "ctrl+shift+home": "toTop", "ctrl+shift+end": "toEnd",
  "ctrl+tab": "nextTab", "ctrl+shift+tab": "prevTab", "ctrl+=": "fontUp", "ctrl++": "fontUp", "ctrl+-": "fontDown",
  "ctrl+0": "fontReset", "f11": "fullscreen", "alt+shift++": "splitV", "alt+shift+=": "splitV", "alt+shift+*": "splitV",
  "alt+shift+-": "splitH", "alt+shift+_": "splitH", "ctrl+shift+e": "splitV", "ctrl+shift+o": "splitH",
  "ctrl+shift+n": "newWindow",
};
for (let i = 1; i <= 9; i++) DEFAULT_KEYS[`alt+${i}`] = `tab${i}`;
function keyName(e) {
  let k = e.key.toLowerCase();
  if (k === " ") k = "space";
  if (e.code === "NumpadAdd") k = "+";
  if (e.code === "NumpadSubtract") k = "-";
  if (/^Digit[0-9]$/.test(e.code) && e.altKey && !e.ctrlKey) k = e.code.slice(5);   // Alt+1 на любой раскладке
  return [e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift", k].filter(Boolean).join("+");
}
function keyAction(e, pane) {
  const name = keyName(e);
  const map = { ...DEFAULT_KEYS, ...(SET().keys || {}) };
  if (name === "ctrl+c" && pane.term.hasSelection()) return "copyClear";       // как в Windows Terminal
  if (name === "ctrl+v" && SET().ctrl_v_paste !== false) return "native";
  if (/^alt\+arrow(left|right|up|down)$/.test(name) && pane.tab.panes().length > 1) return "focus" + name.slice(9);
  return map[name] || null;
}
function runAction(a, pane) {
  const t = pane.tab;
  const acts = {
    copy: () => { const s = pane.term.getSelection(); if (s) copyText(s); },
    copyClear: () => { copyText(pane.term.getSelection()); pane.term.clearSelection(); },
    paste: () => pasteFromClipboard(pane),
    newTab: () => newTab({ cwd: pane.cwd, profile: pane.profile.id }), closePane: () => t.closePane(pane, true),
    duplicateTab: () => newTab({ cwd: pane.cwd, profile: pane.profile.id }), find: () => findBar(pane), palette: () => palette(),
    clear: () => pane.term.clear(), toggleRight: () => toggleCol("no-right"), toggleLeft: () => toggleCol("no-left"),
    prevBlock: () => pane.jump(-1), nextBlock: () => pane.jump(1), toTop: () => pane.term.scrollToTop(), toEnd: () => pane.term.scrollToBottom(),
    nextTab: () => cycle(1), prevTab: () => cycle(-1), fontUp: () => setFont(state.fontSize + 1), fontDown: () => setFont(state.fontSize - 1),
    fontReset: () => setFont(baseFont()), fullscreen: () => HY.bridge && (HY.bridge.toggleFullscreen || HY.bridge.toggleMaximize)(),
    splitV: () => t.split("v"), splitH: () => t.split("h"), newWindow: () => HY.openApp("terminal", ["--new-window"]),
    focusleft: () => t.focusDir("left"), focusright: () => t.focusDir("right"), focusup: () => t.focusDir("up"), focusdown: () => t.focusDir("down"),
  };
  const m = /^tab([1-9])$/.exec(a);
  if (m) { const i = +m[1]; const tab = i === 9 ? state.tabs[state.tabs.length - 1] : state.tabs[i - 1]; if (tab) activate(tab); return; }
  (acts[a] || (() => {}))();
}

// сочетания работают и когда фокус не в терминале (после клика по панели, вкладке, кнопке)
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || !cur()) return;
  const t = e.target;
  if (t && t.closest && (t.closest(".xterm") || t.closest(".hy-modal-back") || t.matches("input, textarea, select, [contenteditable]"))) return;
  const a = keyAction(e, cur());
  if (!a || a === "native" || a.startsWith("copy") || a.startsWith("focus")) return;
  e.preventDefault();
  runAction(a, cur());
});

// ── вкладка: дерево панелей ──────────────────────────────────────
class Tab {
  constructor(opts = {}) {
    this.id = Math.random().toString(36).slice(2, 9);
    this.name = opts.name || "";          // имя, заданное пользователем
    this.box = el("div.t-term");
    $("terms").append(this.box);
    const p = new Pane(this, opts);
    this.root = { pane: p };
    this.active = p;
    this.layout();
  }
  panes(node = this.root) { if (!node) return []; return node.pane ? [node.pane] : [...this.panes(node.a), ...this.panes(node.b)]; }
  get pane() { return this.active || this.panes()[0]; }
  get cwd() { const p = this.pane; return p ? p.cwd : ""; }
  layout() {
    const build = (n) => n.pane ? n.pane.box : el("div.t-split." + n.dir, build(n.a), el("div.t-gutter." + n.dir), build(n.b));
    this.box.replaceChildren(build(this.root));
    for (const p of this.panes()) p.box.classList.toggle("focus", p === this.active && this.panes().length > 1);
    requestAnimationFrame(() => this.panes().forEach((p) => p.dims()));
  }
  focusPane(p, focusTerm = true) {
    if (this.active === p) return;
    this.active = p;
    for (const x of this.panes()) x.box.classList.toggle("focus", x === p && this.panes().length > 1);
    if (focusTerm) p.term.focus();
    if (state.active === this) { loadDir(p.cwd); renderStatus(); syncTitle(); renderTabs(); }
  }
  split(dir) {
    const old = this.active;
    const p = new Pane(this, { cwd: old.cwd, profile: old.profile.id });
    const replace = (n) => { if (n.pane === old) return { dir, a: { pane: old }, b: { pane: p } }; if (n.pane) return n; return { ...n, a: replace(n.a), b: replace(n.b) }; };
    this.root = replace(this.root);
    this.active = p;
    this.layout();
    setTimeout(() => p.term.focus(), 30);
    saveSession();
  }
  async closePane(p, ask = false) {
    if (ask && !(await confirmBusy(p))) return;
    if (this.panes().length === 1) return closeTab(this, false);
    const drop = (n) => { if (n.pane) return n; if (n.a.pane === p) return n.b; if (n.b.pane === p) return n.a; return { ...n, a: drop(n.a), b: drop(n.b) }; };
    this.root = drop(this.root);
    p.dispose();
    if (this.active === p) this.active = this.panes()[0];
    this.layout();
    this.active.term.focus();
    saveSession();
  }
  focusDir(dir) {
    const r0 = this.active.box.getBoundingClientRect();
    const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    let best = null, bd = Infinity;
    for (const p of this.panes()) {
      if (p === this.active) continue;
      const r = p.box.getBoundingClientRect(), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const ok = { left: c.x < c0.x - 4, right: c.x > c0.x + 4, up: c.y < c0.y - 4, down: c.y > c0.y + 4 }[dir];
      const d = Math.hypot(c.x - c0.x, c.y - c0.y);
      if (ok && d < bd) { bd = d; best = p; }
    }
    if (best) this.focusPane(best);
  }
  dispose() { for (const p of this.panes()) p.dispose(); this.box.remove(); }
}

const sessions = new Map();
const cur = () => state.active && state.active.active;
if (HY.bridge) {
  HY.bridge.ptyData.connect((sid, data) => {
    const p = sessions.get(sid);
    if (!p) return;
    p.term.write(data, () => HY.bridge.ptyAck(sid, data.length));
    if (state.active !== p.tab && !p.tab.activity) { p.tab.activity = true; renderTabs(); }
  });
  HY.bridge.ptyExit.connect((sid, code) => {
    const p = sessions.get(sid);
    if (!p) return;
    sessions.delete(sid);
    p.sid = null;
    p.exited = true;
    const mode = SET().close_on_exit || "graceful";
    if (mode === "always" || (mode === "graceful" && code === 0)) { p.tab.closePane(p); return; }
    p.term.write(`\r\n\x1b[2m── ${HY.t("exited", { code })} ──\x1b[0m\r\n`);
  });
}

// ── вкладки ──────────────────────────────────────────────────────
function newTab(opts = {}) {
  const t = new Tab({ profile: state.defaultProfile, ...opts });
  state.tabs.push(t);
  activate(t);
  logLine("ok", `SESSION ${state.tabs.length} OPENED // ${t.pane.profile.name || "shell"}`, "OK");
  saveSession();
  return t;
}
function activate(t) {
  state.active = t;
  t.activity = false;
  for (const x of state.tabs) x.box.classList.toggle("on", x === t);
  t.pane.term.focus();
  requestAnimationFrame(() => { t.panes().forEach((p) => p.dims()); t.pane.term.focus(); });
  loadDir(t.cwd);
  renderTabs();
  renderStatus();
  syncTitle();
}
async function confirmBusy(p) {
  if (!p.sid || !HY.bridge) return true;
  const inf = await p.info();
  if (!inf.busy) return true;
  return HY.confirm(HY.t("closetab"), HY.t("busy_close", { name: inf.name || "?" }), { danger: true, ok: HY.t("closetab") });
}
async function closeTab(t, ask = true) {
  const i = state.tabs.indexOf(t);
  if (i < 0) return;
  if (ask) for (const p of t.panes()) if (!(await confirmBusy(p))) return;
  t.dispose();
  state.tabs.splice(i, 1);
  saveSession();
  if (!state.tabs.length) return HY.bridge ? HY.bridge.forceClose ? HY.bridge.forceClose() : HY.close() : newTab();
  activate(state.tabs[Math.max(0, i - 1)]);
}
function cycle(d) {
  const i = state.tabs.indexOf(state.active);
  activate(state.tabs[(i + d + state.tabs.length) % state.tabs.length]);
}
let dragTab = null;
function renderTabs() {
  $("tabs").replaceChildren(...state.tabs.map((t, i) => el("div.t-tab" + (t === state.active ? ".on" : ""), {
    draggable: true, title: t.cwd + "  ·  " + (t.pane.profile.name || ""), "data-tab": t.id,
    onclick: () => activate(t), onauxclick: (e) => { if (e.button === 1) closeTab(t); },
    ondblclick: (e) => { e.stopPropagation(); renameTab(t); },
    oncontextmenu: (e) => { e.preventDefault(); tabMenu(e, t); },
    ondragstart: (e) => { dragTab = t; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-haotica-tab", t.id); },
    ondragover: (e) => { if (dragTab) { e.preventDefault(); e.currentTarget.classList.add("drop"); } },
    ondragleave: (e) => e.currentTarget.classList.remove("drop"),
    ondrop: (e) => { e.preventDefault(); if (!dragTab || dragTab === t) return; const from = state.tabs.indexOf(dragTab);
      state.tabs.splice(from, 1); state.tabs.splice(state.tabs.indexOf(t) + (from <= i ? 1 : 0), 0, dragTab); dragTab = null; renderTabs(); saveSession(); },
    ondragend: () => { dragTab = null; },
  }, t.activity ? el("span.dot") : null, el("span.nm", `${i + 1} · ${shortTitle(t)}`), t.panes().length > 1 ? el("span.np", "▦" + t.panes().length) : null,
     el("span.x", { onclick: (e) => { e.stopPropagation(); closeTab(t); } }, icon("close", 14)))),
    el("button.t-tab-new", { title: HY.t("newtab") + "  Ctrl+Shift+T", onclick: () => newTab({ cwd: cur() ? cur().cwd : "" }),
      oncontextmenu: (e) => { e.preventDefault(); profileMenu(e); } }, icon("plus", 14)),
    el("button.t-tab-new.prof", { title: HY.t("profiles"), onclick: (e) => profileMenu(e) }, icon("chevron", 12)));
}
function profileMenu(e) {
  const r = e.currentTarget.getBoundingClientRect();
  HY.menu(r.left, r.bottom + 2, [
    ...state.profiles.map((p) => ({ label: p.name + (p.id === state.defaultProfile ? "  ·  по умолчанию" : ""), icon: "terminal",
      fn: () => newTab({ cwd: cur() ? cur().cwd : "", profile: p.id }) })),
    "-", { label: HY.t("settings"), icon: "settings", fn: () => HY.openApp("settings", ["--page", "terminal"]) },
    ...(IS_WIN ? [{ label: HY.t("admin"), icon: "shield", fn: () => HY.bridge && HY.bridge.runAsAdmin && HY.bridge.runAsAdmin("[]") }] : []),
  ]);
}
function tabMenu(e, t) {
  HY.menu(e.clientX, e.clientY, [
    { label: HY.t("rename"), icon: "doc", key: "2×", fn: () => renameTab(t) },
    { label: HY.t("duplicate"), icon: "plus", key: "Ctrl+Shift+D", fn: () => newTab({ cwd: t.cwd, profile: t.pane.profile.id }) },
    { label: HY.t("split_v"), icon: "layout", fn: () => { activate(t); t.split("v"); } },
    { label: HY.t("split_h"), icon: "layout", fn: () => { activate(t); t.split("h"); } },
    "-", { label: HY.t("closetab"), icon: "close", key: "Ctrl+Shift+W", fn: () => closeTab(t) },
  ]);
}
async function renameTab(t) {
  const v = await HY.prompt(HY.t("rename"), t.name || shortTitle(t), "");
  if (v === null) return;
  t.name = v.trim();
  renderTabs(); saveSession(); syncTitle();
}
function shortTitle(t) {
  if (t.name) return t.name;
  const p = t.pane;
  if (!p) return "…";
  const home = HY.boot.home || "";
  const dir = p.cwd === home ? "~" : baseName(p.cwd);
  const generic = !p.title || /^(zsh|bash|pwsh|powershell|cmd)(\.exe)?$/i.test(p.title) || p.title.includes("@") ||
    /\\(pwsh|powershell|cmd)\.exe$/i.test(p.title) || /^(Administrator: |Администратор: )?(Windows PowerShell|PowerShell)$/.test(p.title);
  return generic ? dir : p.title;
}
function syncTitle() {
  const t = state.active;
  if (!t || !HY.bridge || !HY.bridge.setTitle) return;
  HY.bridge.setTitle(`${shortTitle(t)} — HAOTICA TERMINAL`);
}
function setFont(n) {
  state.fontSize = Math.max(8, Math.min(32, n));
  for (const t of state.tabs) for (const p of t.panes()) { p.term.options.fontSize = state.fontSize; p.dims(); }
}
function toggleCol(cls) { document.body.classList.toggle(cls); refit(); }
function refit() { requestAnimationFrame(() => { state.tabs.forEach((t) => t.panes().forEach((p) => p.dims())); drawCharts(); }); }
window.addEventListener("resize", HY.debounce(refit, 60));
function applyTermSettings() {
  const s = SET(), th = termTheme(), font = termFont();
  for (const t of state.tabs) for (const p of t.panes()) {
    const o = p.term.options;
    o.theme = th; o.fontFamily = font; o.lineHeight = +s.line_height || 1.18; o.cursorStyle = s.cursor_style || "bar";
    o.cursorBlink = s.cursor_blink !== false; o.scrollback = clampScroll(s.scrollback);
    o.rightClickSelectsWord = (s.right_click || "menu") === "menu";
    p.dims();
  }
}
HY.on("theme-applied", () => { applyTermSettings(); applyCrt(); drawCharts(); });
HY.on("settings-applied", applyTermSettings);
function applyCrt() {
  const fx = HY.theme.effects || {};
  const k = Math.max(0, Math.min(1, fx.crt_terminal === undefined ? 0.85 : +fx.crt_terminal || 0));
  crtLines.av_k = Math.max(0, Math.min(1, fx.crt_avatar === undefined ? 0.25 : +fx.crt_avatar || 0));
  if (state.avatar && state.avatar.setCrt) state.avatar.setCrt(crtLines.av_k);
  const screen = Math.max(0, +fx.crt_screen || 0);           // лёгкий экранный CRT уже лежит сверху
  const root = document.documentElement.style;
  root.setProperty("--crt", k);
  document.body.classList.toggle("no-crt", k <= 0);
  document.body.classList.toggle("crt-full", !!fx.crt_beam_full && !LOWFX);
  if (k <= 0) { root.setProperty("--crt-filter", "none"); return; }
  crtMod.then(({ mountBeamFilter, tuneBeamFilter }) => tuneBeamFilter(mountBeamFilter("crt-rgb"), k));
  root.setProperty("--crt-filter", "url(#crt-rgb)");
  crtLines.k = k * (screen > 0 && !IS_WIN ? 0.82 : 1);
  drawCrtLines();
}
// строки развёртки — общий модуль /ui/crt.js (период кратен 3, по физическим пикселям)
const crtLines = { k: 0.85, ctl: null, av: null };
function drawCrtLines() { crtLines.ctl?.redraw(); crtLines.av?.redraw(); }
crtMod.then(({ watchScanlines }) => {
  crtLines.ctl = watchScanlines($("crt-lines"), () => document.body.classList.contains("no-crt") ? 0 : crtLines.k);
  // аватар: свои строки поверх (только затемнение — фон у него прозрачный)
  crtLines.av = watchScanlines($("av-lines"), () => document.body.classList.contains("no-crt") ? 0 : crtLines.av_k || 0, { light: false });
});

// ── буфер обмена ─────────────────────────────────────────────────
function copyText(s) {
  if (!s) return;
  navigator.clipboard.writeText(s).catch(() => {
    const ta = el("textarea", { style: { position: "fixed", opacity: "0" } }); ta.value = s; document.body.append(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* буфер недоступен */ } ta.remove();
  });
}
async function pasteFromClipboard(p) {
  try { const text = await navigator.clipboard.readText(); if (text) await p.paste(text); }
  catch (e) { /* буфер недоступен */ }
}
function uriToPath(list) {
  const first = (list || "").split(/\r?\n/).filter((x) => x && !x.startsWith("#"));
  return first.map((u) => { try { const x = new URL(u); if (x.protocol !== "file:") return ""; let p = decodeURIComponent(x.pathname);
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1).replaceAll("/", "\\"); else if (x.host) p = `\\\\${x.host}${p.replaceAll("/", "\\")}`; return p; } catch (e) { return ""; } })
    .filter(Boolean).join("\n");
}
function pathUri(p) { return /^[A-Za-z]:/.test(p) ? "file:///" + encodeURI(p.replaceAll("\\", "/")) : "file://" + encodeURI(p); }
function fmtMs(ms) { return ms < 1000 ? Math.round(ms) + "ms" : ms < 60000 ? (ms / 1000).toFixed(1) + "s" : Math.floor(ms / 60000) + "m" + Math.round(ms % 60000 / 1000) + "s"; }
function resolvePath(p, cwd) {
  const home = HY.boot.home || "/home";
  if (p.startsWith("~")) p = home + p.slice(1);
  if (!isAbs(p)) p = (cwd || home) + sepOf(cwd || home) + p;
  const win = /^[A-Za-z]:|^\\\\/.test(p);
  const sep = win ? "\\" : "/";
  const unc = p.startsWith("\\\\");
  const parts = p.split(/[\\/]+/);
  const head = win ? (unc ? "\\\\" + parts.splice(0, 3).filter(Boolean).join("\\") : parts.shift()) : "";
  const out = [];
  for (const seg of parts) { if (!seg || seg === ".") continue; if (seg === "..") out.pop(); else out.push(seg); }
  return win ? head + sep + out.join(sep) : "/" + out.join("/");
}
async function statPath(p) {
  if (state.statCache.has(p)) return state.statCache.get(p);
  const pr = HY.get("/api/fs/stat?path=" + encodeURIComponent(p)).then((r) => !!(r && r.ok)).catch(() => false);
  state.statCache.set(p, pr);
  if (state.statCache.size > 3000) state.statCache.clear();
  return pr;
}

// ── сеанс: сохранить/восстановить вкладки ────────────────────────
const SESSION_KEY = "haotica.terminal.session";
function saveSession() {
  try {
    const data = state.tabs.map((t) => ({ name: t.name, panes: t.panes().map((p) => ({ cwd: p.cwd, profile: p.profile.id })) }));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: data, active: state.tabs.indexOf(state.active) }));
  } catch (e) { /* хранилище недоступно */ }
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
}
setInterval(saveSession, 15000);

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
HY.on("events", (e) => {
  logLine(e.kind, e.text, KIND_STATUS[e.kind] || e.time);
  if (e.toast && HY.bridge && HY.bridge.notify) HY.bridge.notify(e.title || "HAOTICA", e.text);
});

// файлы (W6): строка пути с крошками и вводом, диски и быстрый доступ, категории, сортировка, фильтр,
// поиск по имени и содержимому, список/плитки, клавиатура, мультивыбор, меню действий, живое обновление
const FS = { sort: "name", desc: false, view: "list", filter: "", sel: new Set(), anchor: "", clip: null, search: null };
function sepFor(dir) { return /^[A-Za-z]:|^\\\\/.test(dir) ? "\\" : "/"; }
function joinPath(dir, name) { const s = sepFor(dir); return dir.endsWith(s) ? dir + name : dir + s + name; }
function crumbs(dir) {
  const s = sepFor(dir), out = [];
  if (s === "\\") {
    const m = dir.match(/^(\\\\[^\\]+\\[^\\]+|[A-Za-z]:)(.*)$/);
    if (!m) return [[dir, dir]];
    let acc = m[1] + "\\"; out.push([m[1], acc]);
    for (const part of m[2].split("\\").filter(Boolean)) { acc = acc.endsWith("\\") ? acc + part : acc + "\\" + part; out.push([part, acc]); }
  } else {
    out.push(["/", "/"]); let acc = "";
    for (const part of dir.split("/").filter(Boolean)) { acc += "/" + part; out.push([part, acc]); }
  }
  return out;
}
function renderPathBar() {
  const box = $("f-path");
  const cr = crumbs(state.dir || "");
  const input = el("input.hy-input.mono.f-in", { value: state.dir, spellcheck: false, title: "Путь: Enter — перейти" });
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") loadDir(input.value.trim()); if (e.key === "Escape") renderPathBar(); });
  const bar = el("div.f-crumbs", { ondblclick: () => { box.replaceChildren(input); input.focus(); input.select(); } },
    ...cr.flatMap(([n, p], i) => [i ? el("span.sep", "›") : null, el("span.cr", { onclick: () => loadDir(p), title: p }, n)]));
  box.replaceChildren(
    el("button.hy-btn.ghost.icon.small", { title: "Вверх (Backspace)", onclick: () => state.parent && loadDir(state.parent) }, icon("chevron", 13)),
    el("button.hy-btn.ghost.icon.small", { title: "Диски и быстрый доступ", onclick: (e) => placesMenu(e) }, icon("disk", 13)), bar,
    el("button.hy-btn.ghost.icon.small", { title: "Ввести путь", onclick: () => { box.replaceChildren(input); input.focus(); input.select(); } }, icon("doc", 13)));
  box.firstChild.style.transform = "rotate(-90deg)";
}
async function placesMenu(e) {
  const r = await HY.get("/api/fs/places");
  const list = (r && r.places) || [];
  HY.menu(e.clientX, e.clientY, list.map((p) => ({ label: p.name + (p.total ? `  ·  ${HY.fmtBytes(p.total - p.used)} своб.` : ""),
    icon: p.icon === "disk" ? "disk" : p.icon === "trash" ? "trash" : p.icon === "download" ? "download" : "folder",
    fn: () => p.kind === "trash" && IS_WIN ? HY.post("/api/fs/reveal", { path: "shell:RecycleBinFolder" }) : loadDir(p.path) })));
}
function renderCats() {
  const tools = el("div.f-tools",
    el("input.hy-input.mono.f-filter", { placeholder: "фильтр / поиск…", value: FS.filter, spellcheck: false,
      oninput: (e) => { FS.filter = e.target.value; FS.search = null; renderTree(); },
      onkeydown: (e) => { e.stopPropagation(); if (e.key === "Enter") deepSearch(e.target.value, e.shiftKey); if (e.key === "Escape") { e.target.value = ""; FS.filter = ""; FS.search = null; renderTree(); } } }),
    el("button.hy-btn.ghost.icon.small", { title: "Искать в подпапках (Enter), по содержимому — Shift+Enter", onclick: () => deepSearch(FS.filter, false) }, icon("search", 13)),
    el("button.hy-btn.ghost.icon.small", { title: "Сортировка", onclick: (e) => HY.menu(e.clientX, e.clientY, [["name", "по имени"], ["mtime", "по дате"], ["size", "по размеру"], ["type", "по типу"]].map(([k, l]) =>
      ({ label: (FS.sort === k ? "● " : "") + l, fn: () => { FS.desc = FS.sort === k ? !FS.desc : false; FS.sort = k; renderTree(); } }))) }, icon("layout", 13)),
    el("button.hy-btn.ghost.icon.small" + (FS.view === "tiles" ? ".on" : ""), { title: "Список / плитки", onclick: () => { FS.view = FS.view === "list" ? "tiles" : "list"; renderCats(); renderTree(); } }, icon("image", 13)),
    el("button.hy-btn.ghost.icon.small" + (state.hidden ? ".on" : ""), { title: "Скрытые и системные", onclick: () => { state.hidden = !state.hidden; renderCats(); loadDir(state.dir); } }, icon("eye", 13)));
  $("f-cats").replaceChildren(tools, el("div.t-cats-row", ...CATS.map((c) => el("span.c" + (state.cat === c ? ".on" : ""), { onclick: () => { state.cat = c; renderCats(); renderTree(); } },
    c === "all" ? null : el("i", { style: { background: HY.catColor(c) } }), c === "all" ? HY.t("all") : c))));
}
async function deepSearch(q, content) {
  q = (q || "").trim();
  if (!q) return;
  $("f-tree").replaceChildren(el("div.t-prev-empty", "ПОИСК…"));
  const r = await HY.get(`/api/fs/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(state.dir)}&content=${content ? 1 : 0}&limit=300`);
  FS.search = ((r && r.results) || []).map((x) => x.line ? { name: `${baseName(x.path)}:${x.line}  ${x.text}`, path: x.path, line: x.line, type: "file", category: "code" } : x);
  renderTree();
}
async function loadDir(dir, keepSel = false) {
  if (!dir) return;
  if (dir !== state.dir && !keepSel) { state.selected = ""; FS.sel.clear(); FS.search = null; }
  const r = await HY.get(`/api/fs/list?path=${encodeURIComponent(dir)}${state.hidden ? "&hidden=1" : ""}`);
  if (!r || !r.ok) { if (r && r.status === 403) HY.toast("Нет доступа к папке", "err"); return; }
  state.dir = r.path || dir;
  state.parent = r.parent || "";
  state.entries = r.entries || [];
  state.dirStamp = state.entries.map((e) => e.name + e.mtime + e.size).join("|");
  renderPathBar();
  renderTree();
}
function sortedEntries() {
  const list = (FS.search || state.entries || []).filter((e) => (state.cat === "all" || e.category === state.cat) &&
    (!FS.filter || FS.search || e.name.toLowerCase().includes(FS.filter.toLowerCase())));
  const k = FS.sort, d = FS.desc ? -1 : 1;
  const ext = (n) => (n.includes(".") ? n.split(".").pop().toLowerCase() : "");
  return list.sort((a, b) => (a.type === "dir") !== (b.type === "dir") ? (a.type === "dir" ? -1 : 1) :
    k === "mtime" ? d * ((b.mtime || 0) - (a.mtime || 0)) : k === "size" ? d * ((b.size || 0) - (a.size || 0)) :
    k === "type" ? d * (ext(a.name).localeCompare(ext(b.name)) || a.name.localeCompare(b.name)) : d * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}
function renderTree() {
  const reg = state.tagColors || {};
  const list = sortedEntries();
  state.visible = list;
  const tiles = FS.view === "tiles";
  $("f-tree").classList.toggle("tiles", tiles);
  $("f-tree").replaceChildren(...list.slice(0, 1500).map((e) => el("div.n" + (e.type === "dir" ? ".dir" : "") + (e.hidden ? ".hidden-file" : "") + (FS.sel.has(e.path) ? ".sel" : ""), {
    draggable: true, title: e.path + (e.size ? "  ·  " + HY.fmtBytes(e.size) : "") + (e.mtime ? "  ·  " + HY.fmtDate(e.mtime) : ""), "data-path": e.path,
    onclick: (ev) => selectEntry(e, ev), ondblclick: () => openEntry(e),
    oncontextmenu: (ev) => { ev.preventDefault(); if (!FS.sel.has(e.path)) { FS.sel = new Set([e.path]); renderTree(); } fileMenu(ev, e); },
    ondragstart: (ev) => { const ps = FS.sel.has(e.path) ? [...FS.sel] : [e.path]; ev.dataTransfer.setData("text/x-haotica-path", ps.join("\n")); ev.dataTransfer.setData("text/plain", ps.join("\n")); },
  }, tiles ? (e.category === "image" ? el("img.th", { src: HY.url("/api/fs/thumb", { path: e.path, size: 160 }), loading: "lazy", alt: "" }) : el("div.th", icon(e.type === "dir" ? "folder" : glyphFor(e.category), 28))) : el("span.bar2", { style: { background: HY.catColor(e.category) } }),
     tiles ? null : icon(e.type === "dir" ? "folder" : glyphFor(e.category), 14), el("span.nm", e.name),
     !tiles && e.type !== "dir" && e.size !== undefined ? el("span.sz", HY.fmtBytes(e.size)) : null,
     e.tags && e.tags.length ? el("span.tg", e.tags.slice(0, 3).map((t) => el("i", { title: t, style: { background: reg[t] || "var(--accent)" } }))) : null)));
  $("f-count").textContent = `${list.length} ${HY.t("entries")}${FS.sel.size > 1 ? ` · выбрано ${FS.sel.size}` : ""}`;
}
function selectEntry(e, ev) {
  const list = state.visible || [];
  if (ev && ev.shiftKey && FS.anchor) {
    const a = list.findIndex((x) => x.path === FS.anchor), b = list.findIndex((x) => x.path === e.path);
    FS.sel = new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.path));
  } else if (ev && ev.ctrlKey) { FS.sel.has(e.path) ? FS.sel.delete(e.path) : FS.sel.add(e.path); FS.anchor = e.path; }
  else { FS.sel = new Set([e.path]); FS.anchor = e.path; }
  state.selected = e.path;
  renderTree();
  if (FS.sel.size === 1) preview(e.path, e.line || null, false);
}
function openEntry(e) { e.type === "dir" ? loadDir(e.path) : HY.post("/api/fs/open", { path: e.path, line: e.line }); }
function selPaths() { return FS.sel.size ? [...FS.sel] : state.selected ? [state.selected] : []; }
async function fsAction(kind, e) {
  const ps = selPaths();
  if (kind === "new-file" || kind === "new-dir") {
    const v = await HY.prompt(kind === "new-dir" ? "Новая папка" : "Новый файл", kind === "new-dir" ? "Новая папка" : "новый.txt");
    if (!v) return;
    const path = joinPath(state.dir, v.trim());
    const r = kind === "new-dir" ? await HY.post("/api/fs/mkdir", { path }) : await HY.post("/api/fs/write", { path, text: "" });
    if (!r.ok) HY.toast(r.error || "Не удалось", "err");
    return loadDir(state.dir, true);
  }
  if (kind === "rename" && e) {
    const v = await HY.prompt(HY.t("rename"), e.name);
    if (!v || v === e.name) return;
    const r = await HY.post("/api/fs/rename", { path: e.path, name: v.trim() });
    if (!r.ok) HY.toast(r.error || "Не удалось", "err");
    return loadDir(state.dir);
  }
  if (kind === "copy" || kind === "cut") { FS.clip = { op: kind, paths: ps }; HY.toast(`${kind === "cut" ? "Вырезано" : "Скопировано"}: ${ps.length}`); return; }
  if (kind === "paste" && FS.clip) {
    const r = await HY.post(`/api/fs/${FS.clip.op === "cut" ? "move" : "copy"}`, { paths: FS.clip.paths, dest: state.dir });
    if (r && r.ok === false) HY.toast(r.error || "Не удалось", "err");
    if (FS.clip.op === "cut") FS.clip = null;
    return loadDir(state.dir, true);
  }
  if (kind === "trash" && ps.length) {
    const ok = await HY.confirm("В корзину?", ps.length === 1 ? ps[0] : `${ps.length} объектов`, { danger: true, ok: "В КОРЗИНУ" });
    if (!ok) return;
    const r = await HY.post("/api/fs/trash", { paths: ps });
    if (r.failed && r.failed.length) HY.toast("Не удалось: " + r.failed.map((f) => f.error).join("; "), "err");
    FS.sel.clear();
    return loadDir(state.dir);
  }
  if (kind === "props" && e) {
    const r = await HY.get("/api/fs/props?path=" + encodeURIComponent(e.path));
    const d = (r && r.props) || {};
    HY.modal({ title: e.name, body: el("div.lines", [["Путь", d.path], ["Тип", d.type + (d.mime ? " · " + d.mime : "")],
      ["Размер", d.tree_size !== undefined ? `${HY.fmtBytes(d.tree_size)} · ${d.files} файлов` : HY.fmtBytes(d.size)],
      ["Изменён", d.mtime && HY.fmtDate(d.mtime)], ["Создан", d.ctime && HY.fmtDate(d.ctime)], ["Права", d.mode],
      ["Атрибуты", [d.hidden && "скрытый", d.system && "системный", d.readonly && "только чтение", d.link && "ссылка"].filter(Boolean).join(", ") || "—"],
      d.sha256 ? ["SHA-256", d.sha256] : null].filter(Boolean).map(([k, v]) => HY.kv(k, String(v ?? "—")))), actions: [{ label: HY.t("close"), value: null, primary: true }] });
  }
}
function fileMenu(ev, e) {
  const t = cur();
  const many = FS.sel.size > 1;
  HY.menu(ev.clientX, ev.clientY, [
    { label: HY.t("open"), icon: "folder", key: "Enter", fn: () => openEntry(e) },
    e.type !== "dir" && IS_WIN ? { label: "Открыть с помощью…", icon: "folder", fn: () => HY.post("/api/fs/open", { path: e.path, with: true }) } : null,
    { label: HY.t("reveal"), icon: "folder", fn: () => HY.post("/api/fs/reveal", { path: e.path }) },
    "-",
    { label: HY.t("insert_path"), icon: "terminal", fn: () => t && t.insertPaths(selPaths()) },
    e.type === "dir" ? { label: HY.t("cd_here"), icon: "chevron", fn: () => t && t.input(cdCmd(t.kind, e.path) + "\r") } : null,
    { label: "Прикрепить к чату Haotica", icon: "haotica", fn: () => chat.addAttachments(selPaths()) },
    { label: HY.t("copy_path"), icon: "clipboard", fn: () => copyText(selPaths().join("\n")) },
    IS_WIN ? { label: HY.t("copy_path") + " (POSIX)", icon: "clipboard", fn: () => copyText(selPaths().map((p) => p.replaceAll("\\", "/")).join("\n")) } : null,
    IS_WIN ? { label: HY.t("copy_path") + " (WSL)", icon: "clipboard", fn: () => copyText(selPaths().map((p) => quoteFor("wsl", p).replace(/^'|'$/g, "")).join("\n")) } : null,
    "-",
    { label: "Копировать", icon: "clipboard", key: "Ctrl+C", fn: () => fsAction("copy") },
    { label: "Вырезать", icon: "clipboard", key: "Ctrl+X", fn: () => fsAction("cut") },
    FS.clip ? { label: `Вставить (${FS.clip.paths.length})`, icon: "doc", key: "Ctrl+V", fn: () => fsAction("paste") } : null,
    !many ? { label: HY.t("rename"), icon: "doc", key: "F2", fn: () => fsAction("rename", e) } : null,
    { label: "Новый файл", icon: "plus", fn: () => fsAction("new-file") }, { label: "Новая папка", icon: "folder", fn: () => fsAction("new-dir") },
    { label: HY.t("tag"), icon: "key", fn: () => tagDialog(e) },
    { label: "В корзину", icon: "trash", key: "Del", danger: true, fn: () => fsAction("trash") },
    "-",
    !many ? { label: "Свойства", icon: "settings", fn: () => fsAction("props", e) } : null,
    { label: HY.t("ask"), icon: "haotica", fn: () => ask(`Что это за файл и что с ним можно сделать? ${e.path}`, { path: e.path }) },
  ].filter(Boolean));
}
$("f-tree").tabIndex = 0;
$("f-tree").addEventListener("keydown", (ev) => {
  const list = state.visible || [];
  const i = Math.max(0, list.findIndex((x) => x.path === state.selected));
  const pick = (j) => { const e = list[Math.max(0, Math.min(list.length - 1, j))]; if (e) { selectEntry(e, ev.shiftKey ? ev : null); $("f-tree").querySelector(`[data-path="${CSS.escape(e.path)}"]`)?.scrollIntoView({ block: "nearest" }); } };
  const e = list[i];
  const k = ev.key;
  if (k === "ArrowDown") pick(i + 1); else if (k === "ArrowUp") pick(i - 1);
  else if (k === "Home") pick(0); else if (k === "End") pick(list.length - 1);
  else if (k === "Enter" && e) openEntry(e);
  else if (k === "Backspace") state.parent && loadDir(state.parent);
  else if (k === "F2" && e) fsAction("rename", e);
  else if (k === "Delete") fsAction("trash");
  else if (ev.ctrlKey && k.toLowerCase() === "a") { FS.sel = new Set(list.map((x) => x.path)); renderTree(); }
  else if (ev.ctrlKey && k.toLowerCase() === "c") fsAction("copy");
  else if (ev.ctrlKey && k.toLowerCase() === "x") fsAction("cut");
  else if (ev.ctrlKey && k.toLowerCase() === "v") fsAction("paste");
  else return;
  ev.preventDefault(); ev.stopPropagation();
});
// перетаскивание из терминала/Проводника в папку — копирование сюда
$("f-tree").addEventListener("dragover", (e) => e.preventDefault());
// живое обновление: пока открыта вкладка FILES — сверяем содержимое папки раз в 3 с
setInterval(async () => {
  if (panel !== "files" || !state.dir || FS.search || document.hidden) return;
  const r = await HY.get(`/api/fs/list?path=${encodeURIComponent(state.dir)}${state.hidden ? "&hidden=1" : ""}`);
  if (!r || !r.ok) return;
  const stamp = (r.entries || []).map((e) => e.name + e.mtime + e.size).join("|");
  if (stamp !== state.dirStamp) { state.entries = r.entries; state.dirStamp = stamp; renderTree(); }
}, 3000);
function glyphFor(cat) { return { code: "code", doc: "doc", image: "image", video: "play", audio: "music", archive: "archive", model: "haotica" }[cat] || "doc"; }
async function tagDialog(e) {
  const v = await HY.prompt(HY.t("tag"), (e.tags || []).join(", "), "важное, работа, проект");
  if (v === null) return;
  await HY.post("/api/fs/tags", { paths: selPaths(), tags: v.split(",").map((x) => x.trim()).filter(Boolean) });
  loadDir(state.dir, true);
}
HY.get("/api/fs/tags").then((r) => { state.tagColors = (r && r.registry) || {}; });

// превью (T-63): изображение (масштаб, перетаскивание, поворот), PDF, видео/аудио, markdown, код, таблица, дерево, лог, hex, архив
async function preview(path, line, switchTo = true) {
  const box = $("p-preview");
  const r = await HY.get("/api/fs/preview?path=" + encodeURIComponent(path));
  if (switchTo) showPanel("preview");
  if (!r || !r.ok) { box.replaceChildren(el("div.t-prev-empty", HY.t("nothing"))); return; }
  const p = r.preview;
  const name = baseName(path);
  const meta = [p.language, p.encoding && p.encoding !== "utf-8" ? p.encoding.toUpperCase() : "", p.eol && p.eol !== "LF" ? p.eol : "",
    p.lines ? p.lines + " " + HY.t("lines") : "", p.pages ? p.pages + " " + HY.t("pages") : "",
    p.size !== undefined && p.kind !== "dir" ? HY.fmtBytes(p.size) : "", p.width ? `${p.width}×${p.height}` : "",
    p.kind === "dir" ? p.count + " " + HY.t("entries") : "", p.truncated ? "фрагмент" : ""].filter(Boolean).join(" · ");
  const head = el("div.t-prev-head", icon(p.kind === "dir" ? "folder" : glyphFor(p.category), 14), el("span.nm", { title: path }, name), el("span.meta", meta),
    el("button.hy-btn.ghost.icon.small", { title: "Прикрепить к чату", onclick: () => chat.addAttachments([path]) }, icon("haotica", 14)),
    el("button.hy-btn.ghost.icon.small", { title: HY.t("open"), onclick: () => HY.post("/api/fs/open", { path }) }, icon("chevron", 14)));
  const body = el("div.t-prev-body");
  const raw = HY.url("/api/fs/raw", { path });
  if (p.kind === "image") body.append(imageViewer(raw, name));
  else if (p.kind === "pdf") body.append(p.embed || !p.pages ? el("iframe.pdf", { src: raw, title: name }) : el("img", { src: HY.url("/api/fs/thumb", { path, size: 600 }) }));
  else if (p.kind === "video") body.append(el("video", { src: raw, controls: true, preload: "metadata", onerror: () => body.replaceChildren(mediaFail(path)) }), tracks(p));
  else if (p.kind === "audio") body.append(el("audio", { src: raw, controls: true, preload: "metadata", onerror: () => body.replaceChildren(mediaFail(path)) }), tracks(p));
  else if (p.kind === "markdown") body.append(el("div.md", { html: p.html }));
  else if (p.kind === "code" || p.kind === "text") {
    body.append(el("div.code", { html: p.html }));
    if (line) setTimeout(() => { const a = body.querySelector(`#L-${line}`) || body.querySelector(`a[href="#L-${line}"]`); if (a) { a.scrollIntoView({ block: "center" }); a.closest("tr")?.classList.add("hit"); } }, 30);
  } else if (p.kind === "table") body.append(el("div.tbl", el("table", ...p.rows.map((row, i) => el("tr", ...row.map((c) => el(i ? "td" : "th", c)))))));
  else if (p.kind === "tree") body.append(treeView(p.data));
  else if (p.kind === "log") {
    const pre = el("pre.lines.log", p.lines_tail.join("\n"));
    let timer = null;
    const follow = el("button.hy-btn.small", { onclick: () => {
      if (timer) { clearInterval(timer); timer = null; follow.textContent = "СЛЕДИТЬ"; return; }
      follow.textContent = "СТОП";
      timer = setInterval(async () => { if (!box.contains(pre)) return clearInterval(timer); const x = await HY.get("/api/fs/preview?path=" + encodeURIComponent(path)); if (x && x.ok && x.preview.lines_tail) { pre.textContent = x.preview.lines_tail.join("\n"); pre.scrollTop = pre.scrollHeight; } }, 2000);
    } }, "СЛЕДИТЬ");
    body.append(el("div.s-actions", follow), pre);
    setTimeout(() => { pre.scrollTop = pre.scrollHeight; }, 20);
  } else if (p.kind === "archive") body.append(el("pre.lines", p.entries.join("\n") + (p.total > p.entries.length ? `\n… всего ${p.total}` : "")));
  else if (p.kind === "binary") body.append(el("div.hex", p.hex));
  else if (p.kind === "office") body.append(el("div.t-prev-empty", el("div", icon("doc", 32), el("div", { style: { marginTop: "10px" } }, "ДОКУМЕНТ OFFICE"),
    el("button.hy-btn.small", { style: { marginTop: "10px" }, onclick: () => HY.post("/api/fs/open", { path }) }, "ОТКРЫТЬ"))));
  else if (p.kind === "dir") body.append(el("div.lines", Object.entries(p.categories || {}).map(([c, n]) => HY.kv(c, String(n), HY.catColor(c)))));
  else body.append(el("div.t-prev-empty", HY.t("nothing")));
  box.replaceChildren(head, body);
  box.classList.remove("hy-scan"); void box.offsetWidth; box.classList.add("hy-scan");
}
function mediaFail(path) {
  return el("div.t-prev-empty", el("div", "КОДЕК НЕ ПОДДЕРЖАН ВСТРОЕННЫМ ПЛЕЕРОМ"),
    el("button.hy-btn.small", { style: { marginTop: "10px" }, onclick: () => HY.post("/api/fs/open", { path }) }, "ОТКРЫТЬ ВО ВНЕШНЕМ ПЛЕЕРЕ"));
}
function imageViewer(src, name) {
  const img = el("img", { src, alt: name, draggable: false });
  const st = { z: 1, x: 0, y: 0, r: 0 };
  const apply = () => { img.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.z}) rotate(${st.r}deg)`; };
  const wrap = el("div.imgv", img);
  wrap.addEventListener("wheel", (e) => { e.preventDefault(); st.z = Math.max(0.1, Math.min(16, st.z * (e.deltaY < 0 ? 1.15 : 0.87))); apply(); }, { passive: false });
  wrap.addEventListener("mousedown", (e) => {
    const x0 = e.clientX - st.x, y0 = e.clientY - st.y;
    const mv = (m) => { st.x = m.clientX - x0; st.y = m.clientY - y0; apply(); };
    const up = () => { removeEventListener("mousemove", mv); removeEventListener("mouseup", up); };
    addEventListener("mousemove", mv); addEventListener("mouseup", up);
  });
  return el("div", el("div.s-actions", el("button.hy-btn.ghost.small", { onclick: () => { st.r = (st.r + 90) % 360; apply(); } }, "⟳ 90°"),
    el("button.hy-btn.ghost.small", { onclick: () => { Object.assign(st, { z: 1, x: 0, y: 0, r: 0 }); apply(); } }, "1:1")), wrap);
}
function treeView(data, depth = 0) {
  if (data === null || typeof data !== "object") return el("span.tv-v." + (data === null ? "null" : typeof data), JSON.stringify(data));
  const arr = Array.isArray(data);
  const entries = arr ? data.map((v, i) => [i, v]) : Object.entries(data);
  const d = el("details.tv", depth < 2 ? { open: true } : null, el("summary", arr ? `[${entries.length}]` : `{${entries.length}}`));
  for (const [k, v] of entries.slice(0, 500)) d.append(el("div.tv-row", el("span.tv-k", String(k)), ": ", treeView(v, depth + 1)));
  return d;
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
(function clockTick() { clock(); onBeat(1000, clockTick); })();

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
    $("bars").append(...VITALS.map(([k, c]) => el("div.bar" + (IS_WIN && !FEAT.temps && (k === "TEMP" || k === "FAN") ? ".hidden" : ""), { style: { "--c": `var(${c})` }, title: k,
      onclick: () => (k === "TEMP" || k === "FAN" || k === "BAT") && FEAT.power_profiles ? palettePower() : k === "AI" ? showPanel("haotica") : HY.openApp("sysmon") },
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
  $("power-mode").textContent = m.game_mode ? "GAME" : IS_WIN ? "WINDOWS" : (m.power_profile || "balanced").toUpperCase();
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
  state.metricsDue = true;            // нарисуются на ближайшем такте вместе с остальным
});
function renderMetrics() {
  const m = state.metrics;
  state.metricsDue = false;
  bars(); mini();
  $("load-val").textContent = `${Math.round(m.cpu || 0)}% · ${Math.round(m.gpu || 0)}%`;
  $("net-val").textContent = `↓ ${HY.fmtBytes((m.net_down_kbs || 0) * 1024)}/s`;
}
// цвета темы — из кэша: getComputedStyle на каждом кадре графиков пересчитывал стили всего окна
const cssCache = new Map();
HY.on("theme-applied", () => cssCache.clear());
function cssv(name) {
  let v = cssCache.get(name);
  if (v === undefined) { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); cssCache.set(name, v); }
  return v;
}
// окно не в фокусе — декоративные анимации реже (терминал при этом работает как обычно)
const UI = { focused: document.hasFocus() };
window.addEventListener("focus", () => { UI.focused = true; });
window.addEventListener("blur", () => { UI.focused = false; });
window.__hyUI = UI;
function fitCanvas(c) {
  const r = c.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [g, r.width, r.height];
}
const gridCache = new Map();
function grid(g, w, h, step = 12) {
  // сетка рисуется один раз на размер и цвет и дальше копируется картинкой (было: десятки stroke на кадр)
  const col = cssv("--ink-faint") || "#1E1D1A", dpr = devicePixelRatio || 1, key = `${w}x${h}@${dpr}:${col}:${step}`;
  let c = gridCache.get(key);
  if (!c) {
    if (gridCache.size > 8) gridCache.clear();
    c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    const x2 = c.getContext("2d"); x2.setTransform(dpr, 0, 0, dpr, 0, 0);
    x2.strokeStyle = col; x2.lineWidth = 1; x2.beginPath();
    for (let x = 0.5; x < w; x += step) { x2.moveTo(x, 0); x2.lineTo(x, h); }
    for (let y = 0.5; y < h; y += step) { x2.moveTo(0, y); x2.lineTo(w, y); }
    x2.stroke();
    gridCache.set(key, c);
  }
  g.drawImage(c, 0, 0, w, h);
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
if (!FEAT.recon && IS_WIN) $("globe").classList.add("hidden");
let globeT = 0;
setInterval(() => { if (document.hidden || $("globe").classList.contains("hidden")) return; globeT += 0.16; const m = $("globe").querySelector(".gl-m"); if (m) m.setAttribute("rx", Math.abs(Math.cos(globeT)) * 14 + 1); }, 132);

// подсказки клавиш (реальные сочетания)
$("hints").innerHTML = [["CTRL+SHIFT+T", "NEW TAB"], ["ALT+SHIFT++", "SPLIT"], ["CTRL+SHIFT+P", "COMMANDS"], ["CTRL+SHIFT+F", "FIND"],
  [IS_WIN ? "HY …" : "?? …", "ASK HAOTICA"], ["CTRL+SHIFT+B/H", "PANELS"]]
  .map(([k, v]) => `<b>${k}</b> : ${v}`).join('<span class="sep">·</span>');

// блок загрузок: модели Haotica, обновления, файлы
$("dl-icon").append(icon("download", 32));
$("dl-icon").onclick = () => IS_WIN || !FEAT.updates ? HY.openApp("settings", ["--page", "haotica"]) : HY.openApp("updates");
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
    const act = all.find((m) => m.role === (state.metrics.llm_role || "base")) || all[0] || {};
    lines.push(el("div", "PACKAGE: ", el("b", act.label?.split("·")[0]?.trim().slice(0, 24) || "—")));
  }
  if (upd && upd.ok) lines.push(el("div", "UPDATES: ", el("b", { style: { color: upd.count ? "var(--amber)" : "var(--green)" } }, upd.count ? `${upd.count} AVAILABLE` : "UP TO DATE")));
  lines.push(el("div", "CONNECTION: ", el("b", state.metrics.net_name ? "ESTABLISHED" : "—")));
  lines.push(el("div", "SERVICE PROTOCOL: ", el("b", { style: { color: "var(--green)" } }, "ACTIVE")));
  $("dl-lines").replaceChildren(...lines);
}
downloads(); setInterval(downloads, 30000);

// ── фон сеанса: «Сотворение Адама» из живого кода ─────────────────
const art = { ctl: null };
function applyArt() {
  const fx = HY.theme.effects || {};
  const on = !LOWFX && (fx.terminal_art === undefined ? true : !!fx.terminal_art);   // без GPU фон из кода не рисуем
  if (on && !art.ctl && !art.starting) {
    art.starting = true;
    import("./art.js").then(async ({ startHandsArt }) => {
      art.ctl = await startHandsArt($("t-art"), {
        opacity: () => { const e = HY.theme.effects || {}; return e.terminal_art_opacity === undefined ? 0.22 : +e.terminal_art_opacity; },
        font: () => getComputedStyle(document.documentElement).getPropertyValue("--font-term").trim() || "monospace",
        colors: () => ({ ink: cssv("--ink"), teal: cssv("--teal"), violet: cssv("--violet"), dim: cssv("--line-hi"), accent: cssv("--accent") }),
      });
      art.starting = false;
    }).catch(() => { art.starting = false; });
  } else if (!on && art.ctl) { art.ctl.stop(); art.ctl = null; }
}
HY.on("theme-applied", applyArt);
applyArt();

// ── Haotica: портрет, голос, короткая связь, карточки команд ─────
import("/ui/avatar.js").then(({ createAvatar, avatarCss }) => {
  const st = el("style", avatarCss()); document.head.append(st);
  const fx = HY.theme.effects || {};
  state.avatar = createAvatar($("avatar"), { size: 262, crt: fx.crt_avatar === undefined ? 0.25 : +fx.crt_avatar || 0 });
  $("avatar").onclick = () => showPanel("haotica");
  // строки аватара — ровно по рамке портрета
  const fitLines = () => {
    const a = $("avatar").getBoundingClientRect(), p = $("portrait").getBoundingClientRect(), c = $("av-lines");
    Object.assign(c.style, { top: `${a.top - p.top}px`, height: `${a.height}px`, left: `${a.left - p.left}px`, width: `${a.width}px` });
    drawCrtLines();
  };
  new ResizeObserver(fitLines).observe($("avatar")); fitLines();
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
// волна голоса: 20 кадров/с, пока Сара говорит; в тишине — один раз очистить и не рисовать
setInterval(() => {
  voice.env.push(voice.mouth || 0); voice.env.shift(); voice.mouth = (voice.mouth || 0) * 0.85;
  const live = voice.env.some((v) => v > 0.004);
  if (live || voice.drawn !== false) { drawVoice(); voice.drawn = live; }
}, 50);
function setHState(s) {
  $("h-state").textContent = (s || "idle").toUpperCase();
  if (state.avatar) state.avatar.setState(s);
}
HY.stream(["state", "mouth"], {
  state: (d) => setHState(d.state),
  mouth: (d) => { voice.mouth = d.v; if (state.avatar) state.avatar.setMouth(d.v); },
}, HY.haoticaUrl);

// мини-чат под аватаром: тот же чат, что во вкладке HAOTICA справа и в окне ассистента
const WIN_ID = Math.random().toString(36).slice(2, 10);     // это окно (команды Haotica выполняет одно окно)
// оболочка, в которую пойдут команды Haotica: своя вкладка «HAOTICA» (или профиль по умолчанию, пока её нет) либо текущая
function execProfile() {
  if ((SET().haotica_tab || "separate") === "active") return cur() ? cur().profile : profileOf(state.defaultProfile);
  const t = state.tabs.find((x) => x.name === "HAOTICA");
  return t ? t.pane.profile : profileOf(state.defaultProfile);
}
const chat = new ChatView($("chat"), {
  mini: true, source: "terminal", key: "terminal",
  context: () => { const t = cur(), p = execProfile();
    return { cwd: t ? t.cwd : "", shell: p.kind, shell_name: p.name || "", os: IS_WIN ? "windows" : "linux", pane: t ? t.id : "", win: WIN_ID }; },
  onRun: (code) => cur() && cur().input(code.replace(/\r?\n/g, IS_WIN ? "\r" : "\n") + "\r"),
  onInsert: (code) => cur() && cur().input(code),
  onExpand: (id) => { showPanel("haotica"); hPost({ type: "open-chat", chat: id }); },
  onEscape: () => cur() && cur().term.focus(),
  onState: (s) => setHState(s.state),
});
window.__hyChatAttach = (paths) => chat.addAttachments(paths);
async function ask(text, context = {}) {
  if (!text.trim()) return;
  if (context.path) chat.addAttachments([context.path]);
  await chat.ask(text, context, false).catch(() => {});
}

// ── Haotica выполняет команды в настоящей вкладке (W3, terminal_run) ─────────
const execs = new Map();       // exec_id → { pane, t0 }
function haoticaPane(where) {
  if (where === "active" && cur()) return cur();
  let t = state.tabs.find((x) => x.name === "HAOTICA");
  if (!t) {
    const back = state.active;
    t = newTab({ cwd: cur() ? cur().cwd : "", name: "HAOTICA" });
    t.name = "HAOTICA"; renderTabs();
    if (back && back !== t) activate(back);                  // не уводим фокус владельца из его вкладки
  }
  return t.pane;
}
// Команду выполняет одно окно: то, из которого спросили, — сразу; остальные — только если оно не взялось (закрыто).
async function claim(x) {
  if (x.win && x.win !== WIN_ID) await new Promise((r) => setTimeout(r, 1500));
  const r = await HY.haotica("POST", "/api/terminal/claim", { exec_id: x.id, win: WIN_ID });
  return !!(r && r.ok);
}
async function onExec(x) {
  if (!(await claim(x))) return;
  const pane = haoticaPane(x.tab === "active" ? "active" : "haotica");
  const fail = (error, exit = -2) => HY.haotica("POST", "/api/terminal/result", { exec_id: x.id, exit, error, duration: 0, cwd: pane ? pane.cwd : "" });
  if (!pane) return fail("нет вкладки");
  const ready = await pane.waitPrompt(20000);
  if (!ready && !pane.integrated)
    return fail(`интеграция оболочки (${pane.profile.name || pane.kind}) не загрузилась: терминал не видит конца команд. ` +
      "Открой вкладку PowerShell или cmd и проверь haotica doctor");
  if (!ready || pane.cur) return fail(`вкладка занята: ${pane.cur && pane.cur.cmd ? "выполняется «" + pane.cur.cmd.slice(0, 80) + "»" : "оболочка не вернулась к приглашению"}`);
  if (pane.term.buffer.active.type === "alternate") return fail("во вкладке открыта полноэкранная программа");
  execs.set(x.id, { pane, t0: performance.now() });
  pane.execId = x.id; pane.execT0 = performance.now();
  if (pane.kind !== "cmd") pane.atPrompt = false;           // до следующего приглашения вкладка занята (и без OSC 133 C)
  logLine("haotica", `HAOTICA $ ${x.command.slice(0, 60)}`, "RUN");
  if (state.active !== pane.tab) { pane.tab.activity = true; renderTabs(); }
  pane.input(x.command.replace(/\r?\n/g, " ") + "\r");
  if (pane.kind === "cmd") {                                   // у cmd нет кода выхода: ждём следующее приглашение
    const t0 = performance.now(), start = pane.term.registerMarker(0);
    pane.atPrompt = false;
    await pane.waitPrompt(Math.max(5000, (x.timeout || 120) * 1000));
    const fake = { out: start, start, end: pane.term.registerMarker(0) };
    execs.delete(x.id);
    HY.haotica("POST", "/api/terminal/result", { exec_id: x.id, exit: null, duration: Math.round(performance.now() - t0),
      cwd: pane.cwd, output_tail: pane.output(fake, 300).slice(-12000), note: "cmd: код выхода недоступен" });
  }
}
HY.on("block", ({ pane, block }) => {
  if (!block.exec || !execs.has(block.exec)) return;
  execs.delete(block.exec);
  logLine(block.code ? "error" : "ok", `HAOTICA EXIT ${block.code} // ${block.cmd.slice(0, 40)}`, block.code ? "FAIL" : "OK");
  HY.haotica("POST", "/api/terminal/result", { exec_id: block.exec, exit: block.code, duration: Math.round(block.ms), cwd: block.cwd || pane.cwd,
    output_tail: block.alt ? "" : pane.output(block, 300).slice(-12000), alt: !!block.alt });
});
// Haotica смотрит на терминал: последние строки экрана и блоки команд (вывод вычищается от секретов в агенте)
async function onTermRead(x) {
  if (!(await claim(x))) return;
  let pane = cur();
  if (x.tab === "haotica") { const t = state.tabs.find((v) => v.name === "HAOTICA"); if (t) pane = t.pane; }
  const reply = (d) => HY.haotica("POST", "/api/terminal/result", { exec_id: x.id, ...d });
  if (!pane) return reply({ error: "нет открытых вкладок" });
  const buf = pane.term.buffer.active, n = Math.max(5, Math.min(400, +x.lines || 80));
  const end = buf.baseY + buf.cursorY + 1, lines = [];
  for (let y = Math.max(0, end - n); y < end; y++) { const l = buf.getLine(y); if (l) lines.push(l.translateToString(true)); }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const blocks = pane.blocks.slice(-8).map((b) => ({ cmd: b.cmd, exit: b.code, ms: Math.round(b.ms || 0), cwd: b.cwd, by_haotica: !!b.exec }));
  reply({ screen: lines.join("\n"), blocks, cwd: pane.cwd, shell: pane.kind, profile: pane.profile.name || "",
    tab: pane.tab.name || shortTitle(pane.tab), running: pane.cur ? pane.cur.cmd || "команда" : "",
    alt: buf.type === "alternate", tabs: state.tabs.map((t) => t.name || shortTitle(t)) });
}
HY.stream(["exec", "exec_cancel", "term_read"], {
  exec: (x) => onExec(x),
  exec_cancel: (x) => { const e = execs.get(x.id); if (e && e.pane.sid) HY.bridge.ptyWrite(e.pane.sid, "\x03"); },
  term_read: (x) => onTermRead(x),
}, HY.haoticaUrl);

window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || !e.data.haotica) return;
  const d = e.data;
  if (d.type === "insert" && cur()) cur().input(d.text);
  if (d.type === "run" && cur()) cur().input(d.text + "\r");
  if (d.type === "preview") preview(d.path);
  if (d.type === "close-overlay") $("overlay").classList.add("hidden");
});
function onFailed(tab, b) {
  renderStatus();
  logLine("error", `EXIT ${b.code} // ${b.cmd.slice(0, 40)}`, "FAIL");
  HY.haotica("POST", "/api/terminal/block", { cmd: b.cmd, code: b.code, ms: Math.round(b.ms), cwd: b.cwd, output: tab.output(b, 160) });
}
function askHaotica(tab, b) {
  chat.send(`Разбери: команда «${b.cmd}» завершилась с кодом ${b.code}.`, { cmd: b.cmd, code: b.code, cwd: b.cwd, output: tab.output(b, 300) });
}

// строка сеанса
function renderStatus() {
  const t = cur();
  if (!t) return;
  const i = state.tabs.indexOf(state.active) + 1;
  $("s-title").textContent = `SESSION ${i}` + (state.active.panes().length > 1 ? `.${state.active.panes().indexOf(t) + 1}` : "");
  $("s-path").textContent = "// " + (t.profile.name || "") + " // " + t.cwd.replace(HY.boot.home || "\0", "~");
  const last = t.blocks[t.blocks.length - 1];
  $("s-state").textContent = `${t.blocks.length} BLOCKS` + (last ? (last.code ? ` · EXIT ${last.code}` : " · OK") : "");
  $("s-state").style.color = last && last.code ? "var(--coral)" : "";
}

// ── Cloud Link и палитра команд ─────────────────────────────────
// ключ облачной модели — поле рядом с выбором модели во вкладке HAOTICA (модального окна больше нет)
function openCloud() { showPanel("haotica"); setTimeout(() => hPost({ type: "focus-key" }), 300); }
function palettePower() {
  HY.menu(innerWidth / 2 - 120, 160, [["quiet", "ТИХИЙ"], ["balanced", "БАЛАНС"], ["performance", "ПРОИЗВОДИТЕЛЬНОСТЬ"]].map(([v, l]) =>
    ({ label: l, icon: "bolt", fn: () => HY.setting(state.metrics.on_battery ? "power.profile_battery" : "power.profile_ac", v) })));
}
function palette() {
  document.querySelector(".t-palette")?.remove();
  const t = cur();
  const A = (a) => () => t && runAction(a, t);
  const cmds = [
    { label: HY.t("newtab"), key: "Ctrl+Shift+T", icon: "plus", fn: () => newTab({ cwd: t ? t.cwd : "" }) },
    ...state.profiles.map((p) => ({ label: `${HY.t("newtab")}: ${p.name}`, key: "", icon: "terminal", fn: () => newTab({ cwd: t ? t.cwd : "", profile: p.id }) })),
    { label: HY.t("closetab"), key: "Ctrl+Shift+W", icon: "close", fn: () => state.active && closeTab(state.active) },
    { label: HY.t("rename"), key: "F2", icon: "doc", fn: () => state.active && renameTab(state.active) },
    { label: HY.t("duplicate"), key: "Ctrl+Shift+D", icon: "plus", fn: A("duplicateTab") },
    { label: HY.t("split_v"), key: "Alt+Shift++", icon: "layout", fn: A("splitV") },
    { label: HY.t("split_h"), key: "Alt+Shift+−", icon: "layout", fn: A("splitH") },
    { label: HY.t("close_pane"), key: "Ctrl+Shift+W", icon: "close", fn: A("closePane") },
    { label: HY.t("cloud"), key: "/key", icon: "key", fn: openCloud, keepFocus: true },
    { label: HY.t("find"), key: "Ctrl+Shift+F", icon: "search", fn: () => t && findBar(t), keepFocus: true },
    { label: "Журнал", key: "", icon: "doc", fn: () => showPanel("log") },
    { label: "Файлы", key: "", icon: "folder", fn: () => showPanel("files") },
    { label: "Haotica — чат", key: "", icon: "haotica", fn: () => showPanel("haotica") },
    { label: HY.t("toggle_left"), key: "Ctrl+Shift+B", icon: "layout", fn: () => toggleCol("no-left") },
    { label: HY.t("toggle_right"), key: "Ctrl+Shift+H", icon: "layout", fn: () => toggleCol("no-right") },
    { label: HY.t("fullscreen"), key: "F11", icon: "layout", fn: A("fullscreen") },
    { label: HY.t("ontop"), key: "", icon: "layout", fn: () => { state.onTop = !state.onTop; HY.bridge && HY.bridge.setOnTop && HY.bridge.setOnTop(state.onTop); } },
    { label: "CRT терминала вкл/выкл", key: "", icon: "eye", fn: () => HY.setting("effects.crt_terminal", document.body.classList.contains("no-crt") ? 0.85 : 0) },
    { label: "Фон «руки из кода» вкл/выкл", key: "", icon: "image", fn: () => HY.setting("effects.terminal_art", !(HY.theme.effects || {}).terminal_art) },
    { label: HY.t("prev_block"), key: "Ctrl+Shift+↑", icon: "chevron", fn: A("prevBlock") },
    { label: HY.t("next_block"), key: "Ctrl+Shift+↓", icon: "chevron", fn: A("nextBlock") },
    { label: HY.t("to_top"), key: "Ctrl+Shift+Home", icon: "chevron", fn: A("toTop") },
    { label: HY.t("to_end"), key: "Ctrl+Shift+End", icon: "chevron", fn: A("toEnd") },
    { label: HY.t("font_up"), key: "Ctrl+=", icon: "plus", fn: A("fontUp") },
    { label: HY.t("font_down"), key: "Ctrl+-", icon: "minus", fn: A("fontDown") },
    { label: HY.t("font_reset"), key: "Ctrl+0", icon: "minus", fn: A("fontReset") },
    { label: HY.t("clear"), key: "Ctrl+Shift+K", icon: "trash", fn: A("clear") },
    { label: "Скрытые файлы", key: "", icon: "eye", fn: () => { state.hidden = !state.hidden; loadDir(state.dir); showPanel("files"); } },
    FEAT.power_profiles ? { label: "Режим питания…", key: "", icon: "bolt", fn: palettePower } : null,
    { label: HY.t("settings"), key: "", icon: "settings", fn: () => HY.openApp("settings", ["--page", "terminal"]) },
    { label: "Мастер первого запуска", key: "", icon: "sparkle", fn: () => openWizard(true) },
    { label: "Диагностика (haotica doctor)", key: "", icon: "shield", fn: () => openWizard(true) },
    IS_WIN ? { label: HY.t("admin"), key: "", icon: "shield", fn: () => HY.bridge && HY.bridge.runAsAdmin && HY.bridge.runAsAdmin("[]") } : null,
    { label: "Haotica: разобрать последнюю ошибку", key: "", icon: "haotica", fn: () => {
      const b = t && [...t.blocks].reverse().find((x) => x.code); if (b) askHaotica(t, b); } },
  ].filter(Boolean);
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
  const run = (c) => { box.remove(); c.fn(); if (cur() && !c.keepFocus) cur().term.focus(); };
  inp.addEventListener("input", () => { sel = 0; render(); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(shown.length - 1, sel + 1); render(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    if (e.key === "Enter" && shown[sel]) run(shown[sel]);
    if (e.key === "Escape") { box.remove(); cur() && cur().term.focus(); }
  });
  document.body.append(box);
  render();
  inp.focus();
}
function findBar(t) {
  document.querySelector(".t-search")?.remove();
  const o = state.search;
  const inp = el("input.hy-input.mono", { placeholder: HY.t("find"), value: t.lastSearch || "" });
  const count = el("span.cnt", "");
  const deco = { matchBackground: "#E0A24333", matchBorder: "#E0A24366", matchOverviewRuler: "#E0A243",
    activeMatchBackground: "#5FA8A066", activeMatchBorder: "#5FA8A0", activeMatchColorOverviewRuler: "#5FA8A0" };
  const opts = (inc = false) => ({ caseSensitive: o.caseSensitive, wholeWord: o.wholeWord, regex: o.regex, incremental: inc, decorations: deco });
  const go = (dir, inc = false) => { t.lastSearch = inp.value; if (!inp.value) { t.search.clearDecorations(); count.textContent = ""; return; }
    try { dir < 0 ? t.search.findPrevious(inp.value, opts()) : t.search.findNext(inp.value, opts(inc)); } catch (e) { count.textContent = "regex?"; } };
  const tog = (key, label, title) => el("button.hy-btn.icon.small.tog" + (o[key] ? ".on" : ""), { title,
    onclick: (e) => { o[key] = !o[key]; e.currentTarget.classList.toggle("on", o[key]); go(1, true); } }, label);
  const close = () => { t.search.clearDecorations(); bar.remove(); t.term.focus(); };
  const bar = el("div.t-search", inp, count, tog("caseSensitive", "Aa", HY.t("case")), tog("wholeWord", "W", HY.t("word")), tog("regex", ".*", HY.t("regex")),
    el("button.hy-btn.icon.small", { onclick: () => go(-1) }, icon("chevron", 14)),
    el("button.hy-btn.icon.small", { onclick: () => go(1) }, icon("chevron", 14)),
    el("button.hy-btn.icon.small.ghost", { onclick: close }, icon("close", 14)));
  const btns = bar.querySelectorAll("button:not(.tog)");
  btns[0].style.transform = "rotate(-90deg)"; btns[1].style.transform = "rotate(90deg)";
  if (t.searchHook) t.searchHook.dispose();
  t.searchHook = t.search.onDidChangeResults(({ resultIndex, resultCount }) => {
    count.textContent = resultCount ? `${resultIndex + 1}/${resultCount}` : (inp.value ? HY.t("no_matches") : "");
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
    if (e.key === "Escape") close();
  });
  inp.addEventListener("input", () => go(1, true));
  t.box.append(bar);
  inp.focus(); inp.select();
}

// ── запуск ───────────────────────────────────────────────────────
$("p-preview").replaceChildren(el("div.t-prev-empty", el("div", icon("eye", 32), el("div", { style: { marginTop: "10px" } }, HY.t("pick")))));
renderCats();
showPanel("log");
applyCrt();
await loadProfiles();
const argv = HY.args || [];
const argOf = (list, name) => { const k = list.indexOf(name); return k >= 0 ? list[k + 1] || "" : ""; };
const posDir = (list) => list.find((a) => isAbs(a) && !a.startsWith("--"));
const startCwd = argOf(argv, "--cwd") || posDir(argv) || "";
const sess = SET().restore_tabs !== false && !startCwd && !argOf(argv, "--run") ? loadSession() : null;
if (sess && sess.tabs && sess.tabs.length) {
  for (const st of sess.tabs) {
    const first = st.panes[0] || {};
    const t = newTab({ cwd: first.cwd, profile: first.profile, name: st.name });
    t.name = st.name || "";
    for (const p of st.panes.slice(1)) { const np = new Pane(t, p); const old = t.root; t.root = { dir: "v", a: old, b: { pane: np } }; t.active = np; }
    t.layout();
  }
  activate(state.tabs[Math.min(state.tabs.length - 1, Math.max(0, sess.active || 0))]);
} else {
  newTab({ cwd: startCwd, command: argOf(argv, "--run"), profile: argOf(argv, "--profile") });
}
HY.on("open", (args) => {
  if (args.includes("--new-window") && !args.includes("--cwd")) { newTab({ cwd: cur() ? cur().cwd : "" }); return; }
  newTab({ cwd: argOf(args, "--cwd") || posDir(args) || (cur() ? cur().cwd : ""), command: argOf(args, "--run"), profile: argOf(args, "--profile") });
});
HY.on("message", async (m) => {
  if (m.cmd === "confirm-close") {
    const ok = await HY.confirm("HAOTICA TERMINAL", HY.t("busy_window", { n: m.busy }), { danger: true, ok: HY.t("closetab") });
    if (ok) { saveSession(); HY.bridge.forceClose(); }
  }
  if (m.cmd === "drop") {                                  // файлы из Проводника (перехват Qt): куда бросили
    const z = devicePixelRatio && HY.bridge ? 1 : 1;
    const node = document.elementFromPoint((m.x || 0) / z, (m.y || 0) / z);
    if (node && node.closest && node.closest("#chat, .h-chat") && window.__hyChatAttach) return window.__hyChatAttach(m.paths || []);
    const pane = node && node.closest && state.tabs.flatMap((t) => t.panes()).find((p) => p.box.contains(node));
    (pane || cur()) && (pane || cur()).insertPaths(m.paths || []);
  }
});
window.addEventListener("beforeunload", saveSession);
// мастер первого запуска (Windows): система, модели, оболочка, голос, ключи
const openWizard = (force) => import("./wizard.js").then(({ runWizard }) => runWizard({ profiles: state.profiles, defaultProfile: state.defaultProfile, force })).catch(() => {});
if (IS_WIN && HY.bridge && !window.__hyNoWizard) setTimeout(() => openWizard(false), 1200);
bars(); mini(); drawCharts();
// графики и метрики — на общем такте: 4 кадра/с в фокусе, 1 — без фокуса; свёрнуто — не рисуем
(function chartsTick() {
  onBeat(UI.focused ? 250 : 1000, () => {
    if (!document.hidden) { if (state.metricsDue) renderMetrics(); drawCharts(); }
    chartsTick();
  });
})();
