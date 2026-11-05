// HAOTICA UI kit — общий код приложений: связь с хостом, API ядра, тема на лету,
// перевод, оформление окна и небольшие компоненты. Подключение:
//   import { HY, el, icon } from "/ui/hy.js";  await HY.start({ title: "Файлы", glyph: "folder" });
import { GLYPHS } from "/ui/glyphs.js";

const qs = new URLSearchParams(location.search);
const hashArgs = (() => {
  try { return JSON.parse(decodeURIComponent((location.hash.match(/args=([^&]*)/) || [])[1] || "[]")); }
  catch (e) { return []; }
})();

// ── мини-конструктор DOM ─────────────────────────────────────────
export function el(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split(".");
  const n = document.createElement(name || "div");
  if (cls.length) n.className = cls.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") n.className += (n.className ? " " : "") + v;
    else if (k === "style" && typeof v === "object") {
      for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? n.style.setProperty(sk, sv) : (n.style[sk] = sv);
    }
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else if (k in n && typeof v !== "string") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

// ── пиктограммы ─────────────────────────────────────────────────
const SVGNS = "http://www.w3.org/2000/svg";
export function icon(name, size = 16, cls = "") {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", `hy-icon ${size !== 16 ? "s" + size : ""} ${cls}`.trim());
  s.innerHTML = GLYPHS[name] || GLYPHS.sparkle || "";
  return s;
}

// ── перевод ─────────────────────────────────────────────────────
const COMMON = {
  ru: { ok: "OK", cancel: "Отмена", close: "Закрыть", save: "Сохранить", delete: "Удалить", open: "Открыть", apply: "Применить",
    undo: "Отменить", search: "Поиск", loading: "Загрузка…", empty: "Пусто", error: "Ошибка", retry: "Повторить",
    copy: "Копировать", copied: "Скопировано", rename: "Переименовать", settings: "Настройки", minimize: "Свернуть",
    maximize: "Развернуть", yes: "Да", no: "Нет", back: "Назад", offline: "ЯДРО НЕ ОТВЕЧАЕТ", confirm: "Подтвердите",
    saved: "Сохранено. Изменение можно отменить 10 секунд." },
  en: { ok: "OK", cancel: "Cancel", close: "Close", save: "Save", delete: "Delete", open: "Open", apply: "Apply",
    undo: "Undo", search: "Search", loading: "Loading…", empty: "Empty", error: "Error", retry: "Retry",
    copy: "Copy", copied: "Copied", rename: "Rename", settings: "Settings", minimize: "Minimize",
    maximize: "Maximize", yes: "Yes", no: "No", back: "Back", offline: "CORE OFFLINE", confirm: "Confirm",
    saved: "Saved. You can undo for 10 seconds." },
  de: { ok: "OK", cancel: "Abbrechen", close: "Schließen", save: "Speichern", delete: "Löschen", open: "Öffnen", apply: "Anwenden",
    undo: "Rückgängig", search: "Suche", loading: "Lädt…", empty: "Leer", error: "Fehler", retry: "Wiederholen",
    copy: "Kopieren", copied: "Kopiert", rename: "Umbenennen", settings: "Einstellungen", minimize: "Minimieren",
    maximize: "Maximieren", yes: "Ja", no: "Nein", back: "Zurück", offline: "KERN OFFLINE", confirm: "Bestätigen",
    saved: "Gespeichert. 10 Sekunden lang rückgängig machbar." },
};

// ── главный объект ──────────────────────────────────────────────
export const HY = {
  boot: {}, args: hashArgs, lang: "ru", theme: {}, settings: {}, dict: {}, bridge: null,
  core: location.origin, haoticaUrl: "http://127.0.0.1:47810", token: qs.get("token") || "",
  listeners: {},

  t(key, vars) {
    const d = this.dict[this.lang] || this.dict.ru || {};
    let s = d[key] ?? (COMMON[this.lang] || COMMON.ru)[key] ?? (this.dict.ru || {})[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  },
  i18n(dicts) { for (const [l, d] of Object.entries(dicts)) this.dict[l] = { ...(this.dict[l] || {}), ...d }; },

  // связь с хостом Qt (в обычном браузере — режим разработки)
  ready() {
    return new Promise((resolve) => {
      if (window.hy && window.HY_BOOT) return resolve(window.HY_BOOT);
      let done = false;
      window.addEventListener("hy-ready", () => { done = true; resolve(window.HY_BOOT || {}); }, { once: true });
      setTimeout(() => { if (!done) resolve({ token: this.token, app: "dev", args: hashArgs, lang: qs.get("lang") || "ru" }); }, 1500);
    });
  },

  async start(opts = {}) {
    const b = await this.ready();
    this.boot = b || {};
    this.bridge = window.hy || null;
    this.token = this.boot.token || this.token;
    this.lang = this.boot.lang || "ru";
    if (this.boot.haotica) this.haoticaUrl = this.boot.haotica;
    if (this.boot.args && this.boot.args.length) this.args = this.boot.args;
    document.documentElement.lang = this.lang;
    if (opts.transparent) document.body.classList.add("transparent");
    try {
      const th = await this.get("/api/theme");
      if (th && th.theme) this.applyTheme(th.theme);
      const st = await this.get("/api/settings");
      if (st && st.settings) this.applySettings(st.settings);
    } catch (e) { /* ядро недоступно: значения по умолчанию */ }
    this.stream(["theme", "settings", ...(opts.topics || [])], {
      theme: (t) => this.applyTheme(t),
      settings: (s) => this.applySettings(s),
    });
    if (this.bridge && this.bridge.message) this.bridge.message.connect((m) => {
      let msg = {}; try { msg = JSON.parse(m); } catch (e) { return; }
      this.emit("message", msg);
      if (msg.cmd === "open") this.emit("open", msg.args || []);
    });
    if (opts.chrome !== false) this.chrome(opts);
    if (this.bridge && this.bridge.setTitle && opts.title) this.bridge.setTitle(opts.title);
    document.addEventListener("keydown", (e) => {
      if (e.key === "w" && e.ctrlKey && !e.shiftKey && opts.ctrlW !== false) { e.preventDefault(); this.close(); }
      if (e.key === "F11" && !e.defaultPrevented) { e.preventDefault(); this.bridge && (this.bridge.toggleFullscreen || this.bridge.toggleMaximize)(); }
    });
    return this;
  },

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); return () => { this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn); }; },
  emit(ev, data) { for (const f of this.listeners[ev] || []) try { f(data); } catch (e) { console.error(e); } },

  // ── API ядра ───────────────────────────────────────────────────
  async req(base, method, path, body) {
    const r = await fetch(base + path, {
      method, headers: { "X-Haotica-Token": this.token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let data; try { data = txt ? JSON.parse(txt) : {}; } catch (e) { data = { ok: r.ok, text: txt }; }
    if (!r.ok && data && data.ok === undefined) data.ok = false;
    data.status = r.status;
    return data;
  },
  get(path) { return this.req(this.core, "GET", path); },
  post(path, body = {}) { return this.req(this.core, "POST", path, body); },
  del(path) { return this.req(this.core, "DELETE", path); },
  haotica(method, path, body) { return this.req(this.haoticaUrl, method, path, body); },
  url(path, params = {}) {
    const u = new URL(this.core + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("token", this.token);
    return u.toString();
  },
  async setting(key, value) {
    const r = await this.post("/api/settings", { changes: { [key]: value } });
    if (r.ok && r.undo) this.toast(this.t("saved"), "ok",
      [{ label: this.t("undo"), fn: () => this.post("/api/settings/undo", { id: r.undo }) }], 10000);
    return r;
  },

  // поток событий ядра (SSE) с переподключением
  stream(topics, handlers, base) {
    const u = new URL((base || this.core) + "/api/stream");
    u.searchParams.set("topics", topics.join(","));
    u.searchParams.set("token", this.token);
    let es, retry = 1000;
    const open = () => {
      es = new EventSource(u.toString());
      for (const t of topics) es.addEventListener(t, (ev) => {
        let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (handlers[t]) handlers[t](d);
        this.emit(t, d);
      });
      es.onopen = () => { retry = 1000; document.body.classList.remove("offline"); };
      es.onerror = () => { es.close(); document.body.classList.add("offline"); setTimeout(open, retry); retry = Math.min(15000, retry * 2); };
    };
    open();
    return () => es && es.close();
  },

  // ── тема и настройки ───────────────────────────────────────────
  applyTheme(t) {
    this.theme = t || {};
    const r = document.documentElement.style;
    const c = this.theme.colors || {};
    for (const [k, v] of Object.entries(c)) r.setProperty("--" + k.replaceAll("_", "-"), v);
    const f = this.theme.fonts || {};
    if (f.ui) r.setProperty("--font-ui", `"${f.ui}", "Noto Sans", sans-serif`);
    if (f.mono) r.setProperty("--font-mono", `"${f.mono}", "JetBrains Mono", monospace`);
    if (f.term) r.setProperty("--font-term", `"${f.term}", "IBM Plex Mono", monospace`);
    if (f.display) r.setProperty("--font-display", `"${f.display}", sans-serif`);
    if (f.pixel) r.setProperty("--font-pixel", `"${f.pixel}", "Terminus", monospace`);
    if (f.size) r.setProperty("--fs", Math.round(f.size * 1.25) + "px");
    const g = this.theme.geometry || {};
    if (g.chamfer !== undefined) r.setProperty("--chamfer", g.chamfer + "px");
    if (g.radius !== undefined) r.setProperty("--radius", g.radius + "px");
    const fx = this.theme.effects || {};
    for (const k of ["glow", "scanlines", "grain"]) if (fx[k] !== undefined) r.setProperty("--" + k, fx[k]);
    const an = this.theme.animations || {};
    if (an.speed) r.setProperty("--spd", an.speed);
    if (an.window) r.setProperty("--spd-window", an.window);
    if (an.scan) r.setProperty("--spd-scan", an.scan);
    if (an.decode) r.setProperty("--spd-decode", an.decode);
    document.documentElement.classList.toggle("hy-reduced", !!an.reduce_motion || an.preset === "MINIMAL");
    document.documentElement.dataset.preset = an.preset || "SIGNAL";
    this.emit("theme-applied", this.theme);
  },
  applySettings(s) {
    this.settings = s || {};
    const lang = (s.locale || {}).ui_language;
    if (lang && lang !== this.lang) { this.lang = lang; document.documentElement.lang = lang; this.emit("lang", lang); }
    this.emit("settings-applied", s);
  },

  // ── окно ───────────────────────────────────────────────────────
  chrome(opts) {
    const app = document.querySelector(".hy-app") || document.body;
    const bar = el("div.hy-titlebar",
      el("div.drag", {
        onmousedown: (e) => { if (e.button === 0 && e.detail === 1 && this.bridge) this.bridge.startMove(); },
        ondblclick: () => this.bridge && this.bridge.toggleMaximize(),
      }),
      icon(opts.glyph || "sparkle", 16, "glyph"),
      el("span.title", opts.titleHtml ? { html: opts.titleHtml } : (opts.title || document.title || "HAOTICA")),
      el("span.sub", { id: "hy-sub" }, opts.sub || ""),
      el("span.spacer"),
      ...(opts.actions || []),
      el("button.winbtn", { title: this.t("minimize"), onclick: () => this.bridge && this.bridge.minimize() }, icon("minus", 14)),
      el("button.winbtn", { title: this.t("maximize"), onclick: () => this.bridge && this.bridge.toggleMaximize() }, icon("layout", 14)),
      el("button.winbtn.close", { title: this.t("close"), onclick: () => this.close() }, icon("close", 14)),
    );
    app.prepend(bar);
    this.edges();
    app.classList.add("hy-boot");
    return bar;
  },
  // края окна для изменения размера (если приложение рисует свой заголовок)
  edges() {
    for (const edge of ["left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"]) {
      document.body.append(el("div.hy-resize." + edge, {
        onmousedown: (e) => { if (e.button === 0 && this.bridge) { e.preventDefault(); this.bridge.startResize(edge); } },
      }));
    }
  },
  winButtons() {
    return [
      el("button.winbtn", { title: this.t("minimize"), onclick: () => this.bridge && this.bridge.minimize() }, icon("minus", 14)),
      el("button.winbtn", { title: this.t("maximize"), onclick: () => this.bridge && this.bridge.toggleMaximize() }, icon("layout", 14)),
      el("button.winbtn.close", { title: this.t("close"), onclick: () => this.close() }, icon("close", 14)),
    ];
  },
  dragArea(node) {
    node.addEventListener("mousedown", (e) => { if (e.button === 0 && e.detail === 1 && e.target === node && this.bridge) this.bridge.startMove(); });
    node.addEventListener("dblclick", (e) => { if (e.target === node && this.bridge) this.bridge.toggleMaximize(); });
    return node;
  },
  sub(text) { const s = document.getElementById("hy-sub"); if (s) s.textContent = text; },
  close() {
    const app = document.querySelector(".hy-app");
    if (app && !document.documentElement.classList.contains("hy-reduced")) {
      app.classList.add("hy-closing");
      setTimeout(() => this.bridge ? this.bridge.close() : window.close(), 300 / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spd-window")) || .7));
    } else if (this.bridge) this.bridge.close();
  },
  openApp(name, args = []) { if (this.bridge) this.bridge.openApp(name, JSON.stringify(args)); },
  openUrl(url) { if (this.bridge) this.bridge.openUrl(url); else window.open(url, "_blank"); },
  pick(mode = "open", title = "", start = "~") {
    return new Promise((res) => { if (!this.bridge) return res(""); this.bridge.pickFile(mode, title, start, res); });
  },

  // ── компоненты ─────────────────────────────────────────────────
  toast(text, kind = "", actions = [], ms = 4200) {
    let box = document.querySelector(".hy-toasts");
    if (!box) { box = el("div.hy-toasts"); document.body.append(box); }
    const t = el("div.hy-toast" + (kind ? "." + kind : ""),
      el("div.t", kind === "err" ? this.t("error") : kind === "ai" ? "HAOTICA" : "HAOTICA"),
      el("div", text),
      actions.length ? el("div.act", actions.map((a) => el("button.hy-btn.small", { onclick: () => { a.fn(); t.remove(); } }, a.label))) : null);
    box.append(t);
    setTimeout(() => t.remove(), ms);
    return t;
  },
  modal({ title, body, actions = [], danger = false, width }) {
    return new Promise((resolve) => {
      const back = el("div.hy-modal-back");
      const close = (v) => { back.remove(); resolve(v); };
      const m = el("div.hy-modal.hy-card" + (danger ? ".danger" : ""), width ? { style: { width } } : null,
        el("div.head", icon(danger ? "shield" : "sparkle", 14), title || ""),
        el("div.body", typeof body === "string" ? el("div", { style: { lineHeight: "1.5" } }, body) : body),
        el("div.actions", actions.map((a) => el("button.hy-btn" + (a.primary ? ".primary" : a.danger ? ".danger" : ""),
          { onclick: () => close(a.value !== undefined ? a.value : a.label) }, a.label))));
      back.addEventListener("mousedown", (e) => { if (e.target === back) close(null); });
      back.addEventListener("keydown", (e) => { if (e.key === "Escape") close(null); });
      back.append(m);
      document.body.append(back);
      const first = m.querySelector(".hy-btn.primary, .hy-btn.danger, input"); if (first) first.focus();
    });
  },
  confirm(title, text, { danger = false, ok } = {}) {
    return this.modal({ title, body: text, danger, actions: [
      { label: this.t("cancel"), value: false }, { label: ok || this.t("ok"), value: true, primary: !danger, danger },
    ] });
  },
  async prompt(title, value = "", placeholder = "") {
    const inp = el("input.hy-input", { value, placeholder, style: { width: "100%" } });
    const p = this.modal({ title, body: inp, actions: [{ label: this.t("cancel"), value: null }, { label: this.t("ok"), value: "__ok", primary: true }] });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.closest(".hy-modal").querySelector(".hy-btn.primary").click(); });
    return (await p) === "__ok" ? inp.value : null;
  },
  menu(x, y, items) {
    document.querySelectorAll(".hy-menu").forEach((m) => m.remove());
    const m = el("div.hy-menu", items.map((it) => it === "-" ? el("div.sep") :
      el("div.mi" + (it.danger ? ".danger" : ""), { onclick: () => { m.remove(); it.fn && it.fn(); } },
        it.icon ? icon(it.icon, 14) : null, it.label, it.key ? el("span.k", it.key) : null)));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 6) + "px";
    m.style.top = Math.min(y, innerHeight - r.height - 6) + "px";
    const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("mousedown", off, true); } };
    setTimeout(() => document.addEventListener("mousedown", off, true), 0);
    return m;
  },
  toggle(on, onchange) {
    const t = el("div.hy-toggle" + (on ? ".on" : ""), { role: "switch", tabindex: 0 });
    const flip = () => { t.classList.toggle("on"); onchange && onchange(t.classList.contains("on")); };
    t.addEventListener("click", flip);
    t.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); } });
    t.set = (v) => t.classList.toggle("on", !!v);
    return t;
  },
  range(value, { min = 0, max = 1, step = 0.01, onchange, oninput } = {}) {
    const r = el("input.hy-range", { type: "range", min, max, step, value });
    const paint = () => r.style.setProperty("--p", ((r.value - min) / (max - min) * 100) + "%");
    r.addEventListener("input", () => { paint(); oninput && oninput(parseFloat(r.value)); });
    r.addEventListener("change", () => onchange && onchange(parseFloat(r.value)));
    paint();
    return r;
  },
  seg(options, value, onchange) {
    const s = el("div.hy-seg");
    for (const [v, label] of options) {
      const b = el("button" + (v === value ? ".on" : ""), { onclick: () => {
        s.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); onchange && onchange(v);
      } }, label);
      s.append(b);
    }
    return s;
  },
  kv(k, v, color) {
    return el("div.hy-kv", el("span.k", k), el("span.dots"), el("span.v", color ? { style: { color } } : null, v));
  },
  segbar(fraction, n = 20, color) {
    const b = el("div.hy-segbar", color ? { style: { "--seg": color } } : null);
    const on = Math.round(Math.max(0, Math.min(1, fraction)) * n);
    for (let i = 0; i < n; i++) b.append(el("i" + (i < on ? ".on" : "")));
    return b;
  },

  // текст «расшифровывается» из случайных знаков (скорость декода 0.5×)
  decode(node, text, ms) {
    const glyphs = "▚▞▖▘▝▗░▒#%&@$01ABCDEFXZ/\\<>";
    const spd = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spd-decode")) || .5) *
                (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--spd")) || 1);
    const dur = (ms || Math.min(900, 220 + text.length * 18)) / spd;
    if (document.documentElement.classList.contains("hy-reduced")) { node.textContent = text; return; }
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const n = Math.floor(p * text.length);
      let s = text.slice(0, n);
      for (let i = n; i < text.length; i++) s += text[i] === " " ? " " : glyphs[(Math.random() * glyphs.length) | 0];
      node.textContent = s;
      if (p < 1) requestAnimationFrame(tick); else node.textContent = text;
    };
    requestAnimationFrame(tick);
  },

  // ── форматирование по настройкам региона ──────────────────────
  locale() {
    const l = this.settings.locale || {};
    const map = (v) => (v || "").split(".")[0].replace("_", "-") || undefined;
    return { time: map(l.lc_time) || this.lang, num: map(l.lc_numeric) || this.lang, money: map(l.lc_monetary) || "de-DE",
      weekStart: l.first_weekday || 1 };
  },
  fmtBytes(n) {
    if (n === undefined || n === null) return "";
    const u = this.lang === "en" ? ["B", "KB", "MB", "GB", "TB"] : ["Б", "КБ", "МБ", "ГБ", "ТБ"];
    let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + " " + u[i];
  },
  fmtDate(ts, opts = { dateStyle: "medium", timeStyle: "short" }) {
    const d = typeof ts === "number" ? new Date(ts * (ts < 1e12 ? 1000 : 1)) : new Date(ts);
    try { return new Intl.DateTimeFormat(this.locale().time, opts).format(d); } catch (e) { return d.toLocaleString(); }
  },
  fmtNum(n, opts) { try { return new Intl.NumberFormat(this.locale().num, opts).format(n); } catch (e) { return String(n); } },
  ago(ts) {
    const s = Math.max(0, Date.now() / 1000 - ts);
    const L = this.lang === "en" ? ["now", "m", "h", "d"] : ["сейчас", "мин", "ч", "д"];
    if (s < 60) return L[0];
    if (s < 3600) return Math.floor(s / 60) + " " + L[1];
    if (s < 86400) return Math.floor(s / 3600) + " " + L[2];
    return Math.floor(s / 86400) + " " + L[3];
  },
  catColor(cat) {
    const m = { code: "sky", doc: "teal", image: "coral", video: "coral", audio: "violet", archive: "amber", model: "violet",
      font: "green", dir: "accent", other: "dim" };
    return `var(--${m[cat] || cat || "dim"})`;
  },
  sound(name, volume = 0.5) {
    const ev = ((this.settings.sound || {}).events || {});
    if ((this.settings.sound || {}).ui_sounds === false || ev[name] === false) return;
    try { const a = new Audio(`/sounds/ui/${name}.ogg`); a.volume = volume * ((this.settings.sound || {}).volume ?? 0.55); a.play().catch(() => {}); } catch (e) { /* звук не обязателен */ }
  },
  debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
};

window.HY = HY;
