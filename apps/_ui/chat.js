// Чат Haotica (ТЗ W2): один компонент для мини-окна под аватаром терминала, вкладки HAOTICA и окна ассистента.
// Лента с прокруткой и подгрузкой вверх, markdown и блоки кода (копировать / выполнить в терминале), потоковый ответ,
// шаги инструментов (команды и коды выхода), карточки разрешений [TAB]/[ESC]/«весь план», стоп, история чатов
// (поиск, новый, переименование, закрепление, удаление, экспорт), вложения, бейдж модели, счётчик контекста.
import { HY, el, icon } from "/ui/hy.js";
import { cloudKeyRow, keyfieldCss } from "/ui/keyfield.js";

const CSS = `
.hc { display: flex; flex-direction: column; min-height: 0; height: 100%; font: 12px/1.45 var(--font-ui); color: var(--ink); position: relative; }
.hc-head { display: flex; align-items: center; gap: 6px; padding: 0 0 6px; border-bottom: 1px dashed var(--line); min-width: 0; }
.hc-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
  font: 600 10.5px var(--font-mono); letter-spacing: .14em; color: var(--violet); text-transform: uppercase; }
.hc-title:hover { color: var(--ink); }
.hc-badge { font: 600 9.5px var(--font-mono); letter-spacing: .12em; padding: 1px 6px; border: 1px solid currentColor; color: var(--teal); cursor: pointer; }
.hc-badge.deep { color: var(--violet); } .hc-badge.off { color: var(--dim); } .hc-badge.load { color: var(--amber); }
.hc-ctx { font: 9.5px var(--font-mono); color: var(--dim); }
.hc-head .hy-btn.icon { width: 22px; height: 22px; }
.hc-keys { padding: 6px 0; border-bottom: 1px dashed var(--line); }
.hc-feed { flex: 1; min-height: 60px; overflow-y: auto; overflow-x: hidden; padding: 6px 4px 6px 0; scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--accent) 45%, transparent) transparent; overscroll-behavior: contain; }
.hc-feed::-webkit-scrollbar { width: 6px; } .hc-feed::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--accent) 45%, transparent); }
.hc-feed::-webkit-scrollbar-thumb:hover { background: var(--accent); }
.hc-day { text-align: center; font: 9.5px var(--font-mono); letter-spacing: .16em; color: var(--dim); margin: 8px 0 4px; }
.hc-msg { position: relative; margin: 6px 0; max-width: 100%; }
.hc-msg .who { font: 600 9.5px var(--font-mono); letter-spacing: .16em; color: var(--violet); display: flex; gap: 6px; align-items: center; }
.hc-msg.user .who { color: var(--accent); justify-content: flex-end; }
.hc-msg .who time { color: var(--dim); font-weight: 400; letter-spacing: .04em; }
.hc-msg .bub { padding: 6px 9px; border: 1px solid var(--line); background: color-mix(in srgb, var(--bg1) 85%, transparent);
  user-select: text; overflow-wrap: anywhere; }
.hc-msg.user .bub { border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); margin-left: 18%; }
.hc-msg.assistant .bub { border-left: 2px solid var(--violet); margin-right: 6%; }
.hc-msg .bub p { margin: 0 0 6px; } .hc-msg .bub p:last-child { margin-bottom: 0; }
.hc-msg .bub h1, .hc-msg .bub h2, .hc-msg .bub h3 { font: 600 12px var(--font-mono); letter-spacing: .1em; margin: 6px 0 4px; color: var(--teal); }
.hc-msg .bub ul, .hc-msg .bub ol { margin: 2px 0 6px 18px; padding: 0; }
.hc-msg .bub code { font: 11.5px var(--font-term); background: var(--bg0); padding: 0 3px; border: 1px solid var(--line); }
.hc-msg .bub a { color: var(--teal); }
.hc-code { position: relative; margin: 6px 0; border: 1px solid var(--line); background: var(--bg0); }
.hc-code pre { margin: 0; padding: 7px 9px; font: 11.5px/1.45 var(--font-term); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; }
.hc-code .bar { display: flex; gap: 4px; align-items: center; padding: 2px 4px; border-bottom: 1px dashed var(--line); font: 9.5px var(--font-mono); color: var(--dim); }
.hc-code .bar span { flex: 1; letter-spacing: .12em; text-transform: uppercase; }
.hc-tools { position: absolute; right: 2px; top: -2px; display: none; gap: 2px; }
.hc-msg:hover .hc-tools { display: flex; }
.hc-tools .hy-btn.icon { width: 20px; height: 20px; background: var(--bg1); }
.hc-msg.speaking .hc-tools { display: flex; }
.hc-msg.speaking .hc-say { color: var(--teal); }
.hc-head .hy-btn.off { opacity: .55; }
.hc-step { font: 11px var(--font-term); margin: 3px 0 3px 8px; padding: 2px 6px; border-left: 2px solid var(--line-hi); color: var(--dim);
  display: flex; gap: 6px; align-items: baseline; overflow: hidden; }
.hc-step .c { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.hc-step.ok { border-color: var(--green); } .hc-step.fail { border-color: var(--coral); } .hc-step.run { border-color: var(--amber); }
.hc-step .x { font-weight: 600; } .hc-step.ok .x { color: var(--green); } .hc-step.fail .x { color: var(--coral); }
.hc-card { margin: 6px 0; border: 1px solid var(--violet); background: var(--bg1); padding: 7px 8px; }
.hc-card.danger { border-color: var(--coral); box-shadow: 0 0 0 1px color-mix(in srgb, var(--coral) 35%, transparent); }
.hc-card .t { font: 600 9.5px var(--font-mono); letter-spacing: .16em; color: var(--violet); display: flex; gap: 6px; }
.hc-card .t .r { margin-left: auto; padding: 0 5px; border: 1px solid currentColor; }
.hc-card .r.read { color: var(--green); } .hc-card .r.write { color: var(--amber); } .hc-card .r.danger { color: var(--coral); }
.hc-card pre { margin: 6px 0; padding: 6px 8px; background: var(--bg0); border: 1px solid var(--line); font: 11.5px var(--font-term); white-space: pre-wrap; }
.hc-card .why { color: var(--dim); font-size: 11.5px; } .hc-card .why.err { color: var(--coral); }
.hc-card .act { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.hc-card.done { opacity: .55; } .hc-card.done .act { display: none; }
.hc-typing { font: 10px var(--font-mono); color: var(--violet); letter-spacing: .2em; padding: 2px 4px; }
.hc-typing i { animation: hc-blink 1s infinite; font-style: normal; } .hc-typing i:nth-child(2) { animation-delay: .2s; } .hc-typing i:nth-child(3) { animation-delay: .4s; }
@keyframes hc-blink { 0%, 100% { opacity: .2; } 50% { opacity: 1; } }
.hc-last { position: absolute; right: 10px; bottom: 74px; z-index: 5; display: none; }
.hc-last.on { display: block; }
.hc-in { border-top: 1px dashed var(--line); padding-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.hc-att { display: flex; flex-wrap: wrap; gap: 4px; }
.hc-att .a { font: 10px var(--font-mono); border: 1px solid var(--line-hi); padding: 1px 4px 1px 6px; display: flex; gap: 4px; align-items: center; max-width: 220px; }
.hc-att .a span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hc-att .a b { cursor: pointer; color: var(--dim); } .hc-att .a b:hover { color: var(--coral); }
.hc-row { display: flex; gap: 6px; align-items: flex-end; }
.hc-row .pfx { color: var(--violet); font: 600 12px var(--font-mono); padding-bottom: 3px; }
.hc-row textarea { flex: 1; min-width: 0; resize: none; border: 0; background: none; outline: none; font: 12px/1.4 var(--font-mono);
  color: var(--ink); max-height: 140px; min-height: 18px; padding: 2px 0; }
.hc-row textarea::placeholder { color: var(--line-hi); letter-spacing: .2em; }
.hc-drawer { position: absolute; inset: 28px 0 0 0; z-index: 20; background: var(--bg0); border: 1px solid var(--line-hi); display: flex; flex-direction: column; }
.hc-drawer .q { padding: 6px; border-bottom: 1px solid var(--line); display: flex; gap: 6px; }
.hc-drawer .q input { flex: 1; }
.hc-drawer .l { flex: 1; overflow: auto; }
.hc-drawer .it { display: flex; gap: 6px; align-items: center; padding: 6px 8px; cursor: pointer; border-bottom: 1px dashed var(--line); }
.hc-drawer .it:hover, .hc-drawer .it.on { background: var(--hover); }
.hc-drawer .it .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hc-drawer .it small { color: var(--dim); font: 10px var(--font-mono); }
.hc-drawer .it .pin { color: var(--accent); }
.hc-drawer .snip { color: var(--dim); font-size: 11px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hc.mini .hc-msg.user .bub { margin-left: 8%; } .hc.mini .hc-msg.assistant .bub { margin-right: 0; }
` + keyfieldCss;

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function inline(s) {
  return esc(s).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1<i>$2</i>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}
const SHELL_LANGS = /^(bash|sh|zsh|shell|console|powershell|pwsh|ps1|ps|cmd|bat|batch|)$/i;

export class ChatView {
  constructor(root, opts = {}) {
    this.o = { mini: false, source: "panel", key: "panel", onRun: null, onInsert: null, onExpand: null, context: () => ({}), ...opts };
    this.chat = this.loadChatId();
    this.busy = false; this.stream = null; this.first = null; this.more = false; this.loading = false; this.lastDay = "";
    if (!document.getElementById("hc-css")) { const st = el("style", CSS); st.id = "hc-css"; document.head.append(st); }
    this.attach = [];
    this.root = root;
    this.build();
    this.subscribe();
    this.open(this.chat);
    this.status();
    this.statusTimer = setInterval(() => this.status(), 5000);
  }

  loadChatId() { try { return localStorage.getItem("haotica.chat." + this.o.key) || this.o.key; } catch (e) { return this.o.key; } }
  saveChatId() { try { localStorage.setItem("haotica.chat." + this.o.key, this.chat); } catch (e) { /* */ } }

  build() {
    this.title = el("div.hc-title", { title: "История чатов", onclick: () => this.drawer() }, "HAOTICA");
    this.badge = el("span.hc-badge", { title: "Модель: клик — переключить", onclick: (e) => this.modelMenu(e) }, "—");
    this.ctx = el("span.hc-ctx", { title: "Примерный размер контекста чата" }, "");
    const btn = (ic, title, fn) => el("button.hy-btn.ghost.icon.small", { title, onclick: fn }, icon(ic, 13));
    this.keys = el("div.hc-keys.hidden");
    this.voiceBtn = btn("volume", "Голос", () => this.toggleVoice());
    this.syncVoice(true);
    HY.get("/api/settings").then((st) => { if (st && st.settings) this.syncVoice(((st.settings.haotica || {}).voice) !== false); });
    HY.on("settings-applied", (s) => { if (s && s.haotica && "voice" in s.haotica) this.syncVoice(s.haotica.voice !== false); });
    this.head = el("div.hc-head", this.title, this.badge, this.ctx, this.voiceBtn,
      btn("plus", "Новый чат  /new", () => this.newChat()), btn("clock", "История", () => this.drawer()),
      btn("key", "Облачная модель и ключ", () => this.toggleKeys()),
      this.o.onExpand ? btn("layout", "Развернуть", () => this.o.onExpand(this.chat)) : null);
    this.feed = el("div.hc-feed");
    this.feed.addEventListener("scroll", () => {
      const nearEnd = this.feed.scrollHeight - this.feed.scrollTop - this.feed.clientHeight < 40;
      this.lastBtn.classList.toggle("on", !nearEnd);
      if (this.feed.scrollTop < 60 && this.more && !this.loading) this.loadMore();
    });
    this.lastBtn = el("button.hy-btn.small.hc-last", { onclick: () => this.toEnd(true) }, "↓ К ПОСЛЕДНЕМУ");
    this.ta = el("textarea", { rows: 1, placeholder: "ASK HAOTICA", spellcheck: false });
    this.ta.addEventListener("input", () => this.autosize());
    this.ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); }
      if (e.key === "Escape") { if (this.busy) this.stop(); else { this.ta.blur(); this.o.onEscape && this.o.onEscape(); } }
    });
    this.ta.addEventListener("paste", (e) => this.onPaste(e));
    this.attBox = el("div.hc-att");
    this.sendBtn = el("button.hy-btn.small.primary", { title: "Отправить (Enter)", onclick: () => this.busy ? this.stop() : this.send() }, "▶");
    this.input = el("div.hc-in", this.attBox, el("div.hc-row", el("span.pfx", ">>"), this.ta, this.sendBtn));
    this.box = el("div.hc" + (this.o.mini ? ".mini" : ""), this.head, this.keys, this.feed, this.lastBtn, this.input);
    this.box.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/x-haotica-path")) e.preventDefault(); });
    this.box.addEventListener("drop", (e) => {
      const p = e.dataTransfer.getData("text/x-haotica-path");
      if (p) { e.preventDefault(); e.stopPropagation(); this.addAttachments([p]); }
    });
    this.root.replaceChildren(this.box);
    document.addEventListener("keydown", (e) => {         // карточка в фокусе: [TAB] принять, [ESC] отклонить
      const c = this.feed.querySelector(".hc-card:not(.done)");
      if (!c || !this.box.isConnected || this.box.offsetParent === null) return;
      if (e.target && e.target.closest && e.target.closest(".xterm") && !c.dataset.global) return;
      if (e.key === "Tab" && c.dataset.risk !== "danger") { e.preventDefault(); e.stopPropagation(); c.accept(); }
      if (e.key === "Escape" && !(e.target === this.ta && !this.busy)) { e.preventDefault(); e.stopPropagation(); c.reject(); }
    }, true);
  }

  // ── голос: автоозвучка ответов вкл/выкл (haotica.voice) и «озвучить» у отдельного сообщения ──
  syncVoice(on) {
    this.voiceOn = on;
    this.voiceBtn.replaceChildren(icon(on ? "volume" : "mute", 13));
    this.voiceBtn.title = on ? "Голос включён — клик: выключить (/voice)" : "Голос выключен — клик: включить (/voice)";
    this.voiceBtn.classList.toggle("off", !on);
  }
  async toggleVoice() {
    const on = !this.voiceOn;
    this.syncVoice(on);
    // агент сохраняет настройку и выгружает модель синтеза из памяти (или загружает её снова, ~1 мин)
    const r = await HY.haotica("POST", "/api/voice/power", { on });
    if (!r || !r.ok) { this.syncVoice(!on); HY.toast("Голос: " + ((r && r.error) || "настройка не сохранилась"), "error"); return; }
    HY.toast(on ? "Голос включён — модель загружается (~1 мин)" : "Голос выключен, модель выгружена из памяти", "ok");
  }
  async speak(n) {
    const text = (n.raw ?? n.body.innerText ?? "").trim();
    if (!text) return;
    if (n.classList.contains("speaking")) { n.classList.remove("speaking"); HY.haotica("POST", "/api/voice/stop"); return; }
    for (const x of this.feed.querySelectorAll(".hc-msg.speaking")) x.classList.remove("speaking");
    n.classList.add("speaking");
    const r = await HY.haotica("POST", "/api/voice/say", { text });
    if (!r || !r.ok) { n.classList.remove("speaking"); HY.toast((r && r.error) || "голос недоступен", "error"); return; }
    if (r.loading) HY.toast("Загружаю голос (~1 мин), потом прочитаю", "ok");
    clearTimeout(n.speakTimer);                      // подсветка кнопки — примерно на время чтения (~13 знаков в секунду)
    n.speakTimer = setTimeout(() => n.classList.remove("speaking"), Math.min(600000, (r.loading ? 64000 : 4000) + text.length * 90));
  }

  autosize() { this.ta.style.height = "auto"; this.ta.style.height = Math.min(140, this.ta.scrollHeight) + "px"; }
  focus() { this.ta.focus(); }
  toggleKeys() {
    this.keys.classList.toggle("hidden");
    if (!this.keys.classList.contains("hidden")) {
      if (!this.keys.firstChild) this.keys.append(cloudKeyRow({ compact: true }));
      setTimeout(() => this.keys.firstChild.focusKey && this.keys.firstChild.focusKey(), 30);
    }
  }
  focusKey() { if (this.keys.classList.contains("hidden")) this.toggleKeys(); else this.keys.firstChild && this.keys.firstChild.focusKey(); }

  // ── статус модели ─────────────────────────────────────────────
  async status() {
    const r = await HY.haotica("GET", "/api/status");
    if (!r || !r.ok) { this.badge.textContent = "OFFLINE"; this.badge.className = "hc-badge off"; return; }
    const role = r.llm_role || "base", st = r.llm_state || "offline";
    this.badge.textContent = (st === "ready" ? role : st.startsWith("downloading") ? "DL " + st.split(" ").pop() : st === "loading" ? role + "…" : st).toUpperCase();
    this.badge.className = "hc-badge " + (st === "ready" ? role : st === "loading" || st.startsWith("downloading") ? "load" : "off");
  }
  modelMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    HY.menu(r.left, r.bottom + 2, [
      { label: "base — повседневное, зрение", icon: "haotica", fn: () => this.useModel("base") },
      { label: "deep — большие задачи и код", icon: "haotica", fn: () => this.useModel("deep") },
      "-", { label: "Модели и загрузки…", icon: "settings", fn: () => HY.openApp("settings", ["--page", "haotica"]) },
    ]);
  }
  async useModel(role) { await HY.haotica("POST", "/api/llm/use", { role }); HY.toast(`Переключаюсь на ${role}…`); setTimeout(() => this.status(), 1500); }

  // ── история ───────────────────────────────────────────────────
  async open(chat) {
    this.chat = chat; this.saveChatId();
    this.feed.replaceChildren(); this.first = null; this.lastDay = ""; this.more = false;
    const r = await HY.haotica("GET", `/api/history?chat=${encodeURIComponent(chat)}&limit=40`);
    if (!r || !r.ok) {
      this.feed.append(el("div.hc-day", "// HAOTICA OFFLINE — СЛУЖБА НЕ ЗАПУЩЕНА ИЛИ МОДЕЛЬ ГРУЗИТСЯ"));
      this.title.textContent = "HAOTICA";
      return;
    }
    this.info = r.info || { id: chat, title: "" };
    this.title.textContent = (this.info.title || "Новый чат").toUpperCase();
    this.more = !!r.more;
    if (!r.messages.length) this.feed.append(el("div.hc-day", this.o.mini ? "// СПРОСИ ЧТО-НИБУДЬ. HAOTICA САМА ВЫПОЛНИТ КОМАНДЫ В ТЕРМИНАЛЕ" : "// НОВЫЙ ЧАТ"));
    for (const m of r.messages) this.renderMsg(m, false);
    for (const c of r.cards || []) if (!c.chat || c.chat === chat) this.renderCard(c);
    this.updateCtx(r.messages);
    this.toEnd(true);
  }
  async loadMore() {
    if (!this.first) return;
    this.loading = true;
    const r = await HY.haotica("GET", `/api/history?chat=${encodeURIComponent(this.chat)}&limit=60&before=${this.first}`);
    this.loading = false;
    if (!r || !r.ok || !r.messages.length) { this.more = false; return; }
    this.more = !!r.more;
    const h0 = this.feed.scrollHeight;
    const frag = document.createDocumentFragment();
    let day = "";
    for (const m of r.messages) {
      const d = new Date(m.created * 1000).toDateString();
      if (d !== day) { frag.append(el("div.hc-day", this.fmtDay(m.created))); day = d; }
      frag.append(this.msgNode(m));
    }
    this.first = r.messages[0].id;
    this.feed.prepend(frag);
    this.feed.scrollTop += this.feed.scrollHeight - h0;
  }
  fmtDay(ts) {
    const d = new Date(ts * 1000), t = new Date();
    if (d.toDateString() === t.toDateString()) return "СЕГОДНЯ";
    const y = new Date(t); y.setDate(t.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "ВЧЕРА";
    return HY.fmtDate(ts, { dateStyle: "long" }).toUpperCase();
  }
  updateCtx(msgs) {
    const chars = (msgs || []).reduce((a, m) => a + (m.content || "").length, 0) + (this.liveChars || 0);
    this.ctxChars = (this.ctxChars || 0) + chars;
    const tok = Math.round(this.ctxChars / 3.2);
    this.ctx.textContent = tok > 999 ? (tok / 1000).toFixed(1) + "K" : String(tok);
  }

  // ── сообщения ─────────────────────────────────────────────────
  renderMsg(m, scroll = true) {
    const ts = m.created || Date.now() / 1000;
    const d = new Date(ts * 1000).toDateString();
    if (d !== this.lastDay) { this.feed.append(el("div.hc-day", this.fmtDay(ts))); this.lastDay = d; }
    const n = this.msgNode(m);
    this.feed.append(n);
    if (this.first === null && m.id) this.first = m.id;
    if (scroll) this.toEnd();
    return n;
  }
  msgNode(m) {
    const role = m.role === "user" ? "user" : "assistant";
    const ts = m.created || Date.now() / 1000;
    const tm = new Date(ts * 1000).toTimeString().slice(0, 5);
    const body = el("div.bub");
    this.renderText(body, m.content || "");
    const steps = ((m.extra || {}).steps || []).map((s) => this.stepNode(s));
    let n;
    const tools = el("div.hc-tools",
      role === "assistant" ? el("button.hy-btn.ghost.icon.small.hc-say", { title: "Озвучить (ещё раз — остановить)", onclick: () => this.speak(n) }, icon("volume", 11)) : null,
      el("button.hy-btn.ghost.icon.small", { title: "Копировать", onclick: () => this.copy(n.raw ?? m.content ?? "") }, icon("clipboard", 11)),
      role === "assistant" ? el("button.hy-btn.ghost.icon.small", { title: "Повторить ответ", onclick: () => this.retry() }, icon("reboot", 11)) : null);
    n = el("div.hc-msg." + role, { "data-id": m.id || "" }, el("div.who", role === "user" ? null : "HAOTICA", el("time", tm), role === "user" ? "ВЫ" : null),
      ...steps, body, tools);
    n.body = body;
    n.raw = m.content || "";
    return n;
  }
  stepNode(s) {
    const st = s.status === "running" ? "run" : s.error ? "fail" : s.exit === undefined || s.exit === null ? (s.ok ? "ok" : "fail") : s.exit === 0 ? "ok" : "fail";
    const label = s.command ? "$ " + s.command : s.tool;
    const res = s.status === "running" ? "…" : s.error ? "✗ " + s.error.slice(0, 60) : s.exit !== undefined && s.exit !== null ? `EXIT ${s.exit}` : "✓";
    return el("div.hc-step." + st, { title: label }, el("span.c", label), el("span.x", res), s.ms ? el("span", (s.ms / 1000).toFixed(1) + "s") : null);
  }
  renderText(node, text) {
    node.replaceChildren();
    text = String(text).replace(/\s*\[(пауза|pause|долгая пауза|long pause)\]\s*/gi, " ");   // метки речи — только для голоса
    const parts = String(text).split(/```([\w+-]*)[^\n]*\n?([\s\S]*?)(?:```|$)/g);
    for (let i = 0; i < parts.length; i += 3) {
      if (parts[i] && parts[i].trim()) node.append(this.mdBlock(parts[i]));
      if (i + 2 < parts.length) node.append(this.codeBlock(parts[i + 1] || "", parts[i + 2].replace(/\n$/, "")));
    }
  }
  mdBlock(src) {
    const box = el("div");
    let list = null, para = [];
    const flush = () => { if (para.length) { box.append(el("p", { html: para.map(inline).join("<br>") })); para = []; } };
    for (const line of src.split("\n")) {
      const h = line.match(/^(#{1,3})\s+(.*)$/), li = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/);
      if (h) { flush(); list = null; box.append(el("h" + h[1].length, { html: inline(h[2]) })); }
      else if (li) { flush(); const ordered = /\d/.test(li[1]); if (!list || list.ordered !== ordered) { list = el(ordered ? "ol" : "ul"); list.ordered = ordered; box.append(list); } list.append(el("li", { html: inline(li[2]) })); }
      else if (!line.trim()) { flush(); list = null; }
      else { list = null; para.push(line); }
    }
    flush();
    return box;
  }
  codeBlock(lang, code) {
    const shell = SHELL_LANGS.test(lang);
    return el("div.hc-code", el("div.bar", el("span", lang || "code"),
      el("button.hy-btn.ghost.icon.small", { title: "Копировать", onclick: () => this.copy(code) }, icon("clipboard", 11)),
      shell && this.o.onInsert ? el("button.hy-btn.ghost.icon.small", { title: "Вставить в терминал", onclick: () => this.o.onInsert(code) }, icon("terminal", 11)) : null,
      shell && this.o.onRun ? el("button.hy-btn.ghost.icon.small", { title: "Выполнить в терминале", onclick: () => this.o.onRun(code) }, icon("play", 11)) : null),
      el("pre", code));
  }
  copy(t) { navigator.clipboard.writeText(t).then(() => HY.toast(HY.t("copied"))).catch(() => {}); }
  toEnd(force = false) {
    const nearEnd = this.feed.scrollHeight - this.feed.scrollTop - this.feed.clientHeight < 120;
    if (force || nearEnd) requestAnimationFrame(() => { this.feed.scrollTop = this.feed.scrollHeight; });
  }

  // ── карточки разрешений ───────────────────────────────────────
  renderCard(c) {
    if (this.feed.querySelector(`.hc-card[data-id="${c.id}"]`)) return;
    const risk = (c.risk && c.risk.level) || "write";
    const node = el("div.hc-card" + (risk === "danger" ? ".danger" : ""), { "data-id": c.id, "data-risk": risk },
      el("div.t", icon("haotica", 12), "HAOTICA // " + (c.title || "ДЕЙСТВИЕ"),
        el("span.r." + risk, risk === "danger" ? "DANGER" : risk === "read" ? "READ-ONLY" : risk === "cloud" ? "CLOUD" : "CHANGES")),
      el("pre", c.command || c.text || ""), c.why ? el("div.why", c.why) : null,
      (c.risk && c.risk.reasons && c.risk.reasons.length) ? el("div.why" + (risk === "danger" ? ".err" : ""), (risk === "danger" ? "⚠ " : "") + c.risk.reasons.join(", ")) : null,
      el("div.act",
        el("button.hy-btn.small" + (risk === "danger" ? ".danger" : ".primary"), { onclick: () => node.accept() }, risk === "danger" ? "ПОНИМАЮ, ВЫПОЛНИТЬ" : c.kind === "command" ? "[TAB] ВСТАВИТЬ" : "[TAB] ВЫПОЛНИТЬ"),
        c.plan ? el("button.hy-btn.small", { title: "Разрешить все изменения этого плана (опасные шаги всё равно спрошу)", onclick: () => node.plan() }, "ВЕСЬ ПЛАН") : null,
        el("button.hy-btn.small", { onclick: () => node.reject() }, "[ESC] ОТКЛОНИТЬ")));
    const done = (act) => { node.classList.add("done"); HY.haotica("POST", `/api/card/${c.id}/${act}`, {}); if (this.o.onCard) this.o.onCard(c, act); };
    node.accept = () => done("accept"); node.reject = () => done("reject"); node.plan = () => done("plan");
    this.feed.append(node);
    this.toEnd(true);
  }

  // ── поток событий ─────────────────────────────────────────────
  subscribe() {
    HY.stream(["message", "card", "card_done", "state"], {
      message: (m) => {
        if (!m || m.chat !== this.chat) return;
        if (m.role === "user" && !this.busy && m.source !== this.o.source) this.renderMsg({ role: "user", content: m.text });
        else if (m.role === "step" && !this.busy) this.feed.append(this.stepNode(m.step));
        else if (m.role === "assistant" && m.final && !this.busy && m.proactive) this.renderMsg({ role: "assistant", content: m.text, id: m.id });
        else if (m.role === "assistant" && m.final && !this.busy && !this.feed.querySelector(`.hc-msg[data-id="${m.id}"]`)) this.renderMsg({ role: "assistant", content: m.text, id: m.id, extra: { steps: m.steps } });
        else if (m.role === "title") this.title.textContent = String(m.title).toUpperCase();
      },
      card: (c) => { if (!c.chat || c.chat === this.chat) this.renderCard(c); },
      card_done: (d) => { const n = this.feed.querySelector(`.hc-card[data-id="${d.id}"]`); if (n) n.classList.add("done"); },
      state: (s) => { if (this.o.onState) this.o.onState(s); },
    }, HY.haoticaUrl);
  }

  // ── отправка ──────────────────────────────────────────────────
  async send(textIn, ctx = {}) {
    let text = (textIn ?? this.ta.value).trim();
    if (!text && !this.attach.length) return;
    if (this.busy) return;
    if (!textIn) { this.ta.value = ""; this.autosize(); }
    if (text === "/new") return this.newChat();
    if (text === "/clear") { await HY.haotica("POST", "/api/clear", { chat: this.chat }); return this.open(this.chat); }
    if (text === "/key") return this.focusKey();
    if (text === "/voice" || text === "/голос" || text === "/mute") return this.toggleVoice();
    const files = this.attach.splice(0); this.renderAtt();
    if (!text && files.length) text = "Посмотри вложения.";
    const cleanNew = this.feed.querySelector(".hc-day:only-child");
    if (cleanNew) cleanNew.remove();
    this.renderMsg({ role: "user", content: text + (files.length ? "\n" + files.map((f) => "📎 " + f.split(/[\\/]/).pop()).join("\n") : "") });
    await this.ask(text, { ...ctx, files }, false);
  }
  async retry() {
    if (this.busy) return;
    const last = [...this.feed.querySelectorAll(".hc-msg")].pop();
    if (last && last.classList.contains("assistant")) { while (last.previousSibling && last.previousSibling.classList && last.previousSibling.classList.contains("hc-step")) last.previousSibling.remove(); last.remove(); }
    await this.ask("", {}, true);
  }
  async ask(text, extraCtx, retry) {
    this.busy = true;
    this.sendBtn.textContent = "■"; this.sendBtn.title = "Стоп (Esc)"; this.sendBtn.classList.remove("primary"); this.sendBtn.classList.add("danger");
    const typing = el("div.hc-typing", "HAOTICA ", el("i", "▮"), el("i", "▮"), el("i", "▮"));
    this.feed.append(typing); this.toEnd(true);
    let msg = null, acc = "";
    const ensureMsg = () => { if (!msg) { typing.remove(); msg = this.renderMsg({ role: "assistant", content: "" }); } return msg; };
    try {
      const ctx = { ...(this.o.context() || {}), ...extraCtx };
      const resp = await fetch(HY.haoticaUrl + "/api/chat", { method: "POST",
        headers: { "X-Haotica-Token": HY.token, "Content-Type": "application/json" },
        body: JSON.stringify({ text, chat: this.chat, source: this.o.source, context: ctx, wait: false, retry }) });
      if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);
      const reader = resp.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
          const ev = (chunk.match(/^event: (.*)$/m) || [])[1], data = (chunk.match(/^data: (.*)$/m) || [])[1];
          if (!ev || !data) continue;
          let d; try { d = JSON.parse(data); } catch (e) { continue; }
          if (ev === "delta") { acc += d.text; const n = ensureMsg(); n.body.textContent = acc; this.toEnd(); }
          else if (ev === "step") { const n = ensureMsg(); n.insertBefore(this.stepNode(d.step), n.body); this.toEnd(); }
          else if (ev === "done") { const n = ensureMsg(); n.raw = d.text; this.renderText(n.body, d.text); n.dataset.id = d.id || ""; this.liveChars = d.text.length; this.updateCtx([]); }
          else if (ev === "error") { const n = ensureMsg(); n.body.replaceChildren(el("span", { style: { color: "var(--coral)" } }, d.error)); }
        }
      }
    } catch (e) {
      const n = ensureMsg();
      n.body.replaceChildren(el("span", { style: { color: "var(--coral)" } }, "NEURAL CORE OFFLINE — служба Haotica не отвечает или модель ещё загружается."));
    } finally {
      typing.remove();
      this.busy = false;
      this.sendBtn.textContent = "▶"; this.sendBtn.title = "Отправить (Enter)"; this.sendBtn.classList.add("primary"); this.sendBtn.classList.remove("danger");
      this.toEnd();
    }
  }
  stop() { HY.haotica("POST", "/api/stop", { chat: this.chat }); }

  // ── вложения ──────────────────────────────────────────────────
  addAttachments(list) { for (const p of list) if (p && !this.attach.includes(p)) this.attach.push(p); this.renderAtt(); this.focus(); }
  renderAtt() {
    this.attBox.replaceChildren(...this.attach.map((p, i) => el("div.a", { title: p }, icon(/\.(png|jpe?g|webp|gif|bmp)$/i.test(p) ? "image" : "doc", 11),
      el("span", p.split(/[\\/]/).pop()), el("b", { onclick: () => { this.attach.splice(i, 1); this.renderAtt(); } }, "×"))));
  }
  async onPaste(e) {
    const items = [...(e.clipboardData && e.clipboardData.items || [])].filter((it) => it.type.startsWith("image/"));
    if (!items.length) return;
    e.preventDefault();
    for (const it of items) {
      const blob = it.getAsFile();
      const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
      const r = await HY.post("/api/fs/paste-image", { data: b64, type: it.type });
      if (r && r.ok && r.path) this.addAttachments([r.path]);
      else HY.toast((r && r.error) || "Не удалось сохранить картинку", "err");
    }
  }

  // ── чаты ──────────────────────────────────────────────────────
  async newChat() {
    const r = await HY.haotica("POST", "/api/chats", { source: this.o.source });
    if (r && r.ok) { this.ctxChars = 0; await this.open(r.chat.id); this.focus(); }
  }
  async drawer() {
    const old = this.box.querySelector(".hc-drawer");
    if (old) { old.remove(); return; }
    const q = el("input.hy-input", { placeholder: "Поиск по чатам…" });
    const list = el("div.l");
    const close = () => d.remove();
    const d = el("div.hc-drawer", el("div.q", q, el("button.hy-btn.small", { onclick: () => { close(); this.newChat(); } }, "+ НОВЫЙ"),
      el("button.hy-btn.ghost.icon.small", { onclick: close }, icon("close", 13))), list);
    const load = async () => {
      const s = q.value.trim();
      if (s.length >= 2) {
        const r = await HY.haotica("GET", "/api/chats/search?q=" + encodeURIComponent(s));
        list.replaceChildren(...((r && r.results) || []).map((x) => el("div.it", { onclick: () => { close(); this.open(x.chat); } },
          el("div.nm", el("b", x.title || x.chat), x.snippet ? el("span.snip", x.snippet) : null))));
        return;
      }
      const r = await HY.haotica("GET", "/api/chats?limit=200");
      list.replaceChildren(...((r && r.chats) || []).map((c) => el("div.it" + (c.id === this.chat ? ".on" : ""), { onclick: () => { close(); this.open(c.id); } },
        c.pinned ? el("span.pin", "★") : null,
        el("div.nm", c.title || "Без названия", el("span.snip", c.last || "")), el("small", HY.ago(c.updated)),
        el("button.hy-btn.ghost.icon.small", { title: "Действия", onclick: (e) => { e.stopPropagation(); this.chatMenu(e, c, load); } }, icon("chevron", 13)))));
    };
    q.addEventListener("input", HY.debounce(load, 200));
    q.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); });
    this.box.append(d);
    await load();
    q.focus();
  }
  chatMenu(e, c, reload) {
    HY.menu(e.clientX, e.clientY, [
      { label: "Переименовать", icon: "doc", fn: async () => { const v = await HY.prompt("Название чата", c.title || ""); if (v !== null) { await HY.haotica("PATCH", `/api/chats/${c.id}`, { title: v }); if (c.id === this.chat) this.title.textContent = v.toUpperCase(); reload(); } } },
      { label: c.pinned ? "Открепить" : "Закрепить", icon: "sparkle", fn: async () => { await HY.haotica("PATCH", `/api/chats/${c.id}`, { pinned: !c.pinned }); reload(); } },
      { label: "Экспорт в Markdown", icon: "download", fn: () => this.exportChat(c, "md") },
      { label: "Экспорт в JSON", icon: "download", fn: () => this.exportChat(c, "json") },
      "-", { label: "Удалить", icon: "trash", danger: true, fn: async () => {
        if (await HY.confirm("Удалить чат?", c.title || c.id, { danger: true })) { await HY.haotica("DELETE", `/api/chats/${c.id}`); if (c.id === this.chat) this.newChat(); reload(); } } },
    ]);
  }
  async exportChat(c, fmt) {
    const r = await fetch(`${HY.haoticaUrl}/api/chats/${c.id}/export?format=${fmt}`, { headers: { "X-Haotica-Token": HY.token } });
    const blob = await r.blob();
    const a = el("a", { href: URL.createObjectURL(blob), download: `${(c.title || c.id).replace(/[\\/:*?"<>|]/g, "_")}.${fmt}` });
    document.body.append(a); a.click(); a.remove();
  }
}
