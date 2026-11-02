// HAOTICA — окно ассистента. ?embed=terminal — панель внутри терминала (без рамки, разговор «terminal»).
import { HY, el, icon } from "/ui/hy.js";
import { createAvatar, avatarCss } from "/ui/avatar.js";
import { keysDialog } from "/ui/keys.js";

const qs = new URLSearchParams(location.search);
const embed = qs.get("embed") || "";
if (embed) document.body.classList.add("embed");
await HY.start({ title: "Haotica", glyph: "haotica", chrome: !embed, topics: [] });
const $ = (id) => document.getElementById(id);
const chat = embed === "terminal" ? "terminal" : (qs.get("chat") || "panel");
const source = embed === "terminal" ? "terminal" : "panel";
let busy = false, streamMsg = null, streamText = "", lastFinal = "";

const st = document.createElement("style"); st.textContent = avatarCss(); document.head.append(st);
let avatar = null;
try { avatar = createAvatar($("av"), { size: embed ? 40 : 64, interactive: false, crt: 0.25 }); } catch (e) { /* без аватара */ }
$("clear").append(icon("trash", 14));
$("keys").append(icon("key", 14));
$("keys").onclick = () => keysDialog();

// ── отрисовка сообщений ─────────────────────────────────────────
function esc(s) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function renderText(node, text) {
  node.replaceChildren();
  const parts = text.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) node.append(el("span", { html: esc(parts[i]).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>") }));
    if (i + 2 < parts.length) {
      const code = parts[i + 2].replace(/\n$/, "");
      const lang = parts[i + 1];
      const shell = !lang || /^(bash|sh|zsh|shell|console)$/.test(lang);
      node.append(el("pre", code, el("div.cb",
        el("button.hy-btn.ghost.icon.small", { title: "Копировать", onclick: () => { navigator.clipboard.writeText(code); HY.toast(HY.t("copied")); } }, icon("clipboard", 12)),
        shell && embed === "terminal" ? el("button.hy-btn.ghost.icon.small", { title: "Вставить в терминал", onclick: () => toTerminal("insert", code) }, icon("terminal", 12)) : null)));
    }
  }
}
function addMsg(role, text, extra = {}) {
  const body = el("div.body");
  const m = el("div.a-msg." + role, role !== "error" ? el("span.who", role === "user" ? "YOU" : "HAOTICA" + (extra.role ? " · " + extra.role.toUpperCase() : "")) : null, body);
  renderText(body, text);
  if (extra.tools && extra.tools.length) m.append(el("div.tools", "⚙ " + extra.tools.join(", ")));
  $("log").append(m);
  $("log").scrollTop = $("log").scrollHeight;
  return m;
}
function toTerminal(type, text) {
  try { window.parent.postMessage({ haotica: true, type, text }, location.origin); } catch (e) { /* не во фрейме */ }
}

// ── состояние ───────────────────────────────────────────────────
function setState(s) {
  if (!s) return;
  const llm = s.llm_state || "offline";
  $("st").textContent = `${(s.state || "idle").toUpperCase()} · ${String(llm).toUpperCase()}${s.llm_tps ? " · " + s.llm_tps + " T/S" : ""}`;
  if (s.line) $("line").textContent = s.line;
  const role = s.llm_role || "base";
  $("model").textContent = role.toUpperCase() + (s.switching ? " …" : "");
  $("model").classList.toggle("deep", role === "deep");
  $("model").title = `${s.llm_model || ""} — щелчок: переключить base/deep`;
  if (avatar) avatar.setState(s.state || "idle");
}
$("model").onclick = async () => {
  const role = $("model").classList.contains("deep") ? "base" : "deep";
  await HY.haotica("POST", "/api/llm/use", { role });
  HY.toast(`Переключаюсь на ${role}…`);
};
$("clear").onclick = async () => {
  if (!(await HY.confirm("Очистить разговор?", "История этого чата удалится. Память о фактах останется."))) return;
  await HY.haotica("POST", "/api/clear", { chat });
  $("log").replaceChildren();
};

// ── карточки разрешений: [TAB] принять / [ESC] отклонить ─────────
const cards = new Map();
function showCard(c) {
  if (!c || cards.has(c.id) || (c.chat && c.chat !== chat && !(chat === "panel" && c.source !== "terminal"))) return;
  if (embed === "terminal" && c.kind === "command") return;           // такие карточки рисует сам терминал
  const risk = (c.risk && c.risk.level) || "write";
  const danger = risk === "danger";
  const card = el("div.a-card" + (danger ? ".danger" : ""),
    el("div.t", icon(c.kind === "cloud" ? "cloud" : "haotica", 14), "HAOTICA // " + (c.title || "ДЕЙСТВИЕ"),
      el("span", { style: { marginLeft: "auto" } }, danger ? "DANGER" : risk === "read" ? "READ-ONLY" : risk === "cloud" ? "CLOUD" : "CHANGES")),
    el("pre", c.kind === "cloud" ? (c.question || c.text) : (c.command || c.text)),
    c.preview ? el("pre", c.preview) : null,
    c.why ? el("div.why", c.why) : null,
    c.kind === "cloud" ? el("div.why", `Уйдёт в облако${c.model ? " (" + c.model + ")" : ""}. Секреты вычищены.`) : null,
    danger ? el("div.why", { style: { color: "var(--coral)" } }, "⚠ " + ((c.risk.reasons || []).join(", ") || "опасная команда")) : null,
    el("div.act",
      el("button.hy-btn.small" + (danger ? ".danger" : ".primary"), { onclick: () => decide(c, true) }, danger ? "ПОНИМАЮ, ВЫПОЛНИТЬ" : "[TAB] ПРИНЯТЬ"),
      el("button.hy-btn.small", { onclick: () => decide(c, false) }, "[ESC] ОТКЛОНИТЬ")));
  cards.set(c.id, { c, node: card, danger });
  $("cards").append(card);
  if (HY.bridge && HY.bridge.raise) HY.bridge.raise();
}
function dropCard(id) { const x = cards.get(id); if (x) { x.node.remove(); cards.delete(id); } }
async function decide(c, accept) {
  dropCard(c.id);
  if (accept && c.kind === "command" && c.command) {
    if (embed === "terminal") toTerminal("insert", c.command);
    else { navigator.clipboard.writeText(c.command).catch(() => {}); HY.toast("Команда скопирована в буфер"); }
  }
  await HY.haotica("POST", `/api/card/${c.id}/${accept ? "accept" : "reject"}`, {});
}
document.addEventListener("keydown", (e) => {
  const last = [...cards.values()].pop();
  if (!last || document.activeElement === $("in") && $("in").value) return;
  if (e.key === "Tab" && !last.danger) { e.preventDefault(); decide(last.c, true); }
  if (e.key === "Escape") { e.preventDefault(); decide(last.c, false); }
}, true);

// ── отправка (поток ответа) ─────────────────────────────────────
async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  addMsg("user", text);
  streamText = "";
  streamMsg = null;
  try {
    const r = await fetch(HY.haoticaUrl + "/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Haotica-Token": HY.token },
      body: JSON.stringify({ text, source, chat, wait: false, context: {} }),
    });
    if (!r.ok || !r.body) throw new Error("HTTP " + r.status);
    const rd = r.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1];
        const data = (block.match(/^data: (.*)$/m) || [])[1];
        if (!ev || !data) continue;
        const d = JSON.parse(data);
        if (ev === "delta") {
          streamText += d.text;
          if (!streamMsg) streamMsg = addMsg("assistant", "");
          renderText(streamMsg.querySelector(".body"), streamText.replace(/<think>[\s\S]*?(<\/think>|$)/g, ""));
          $("log").scrollTop = $("log").scrollHeight;
        } else if (ev === "done") {
          lastFinal = d.text;
          if (!streamMsg) streamMsg = addMsg("assistant", d.text, { role: d.role, tools: d.tools });
          else {
            renderText(streamMsg.querySelector(".body"), d.text);
            streamMsg.querySelector(".who").textContent = "HAOTICA · " + String(d.role || "").toUpperCase();
            if (d.tools && d.tools.length) streamMsg.append(el("div.tools", "⚙ " + d.tools.join(", ")));
          }
        } else if (ev === "tool") {
          if (!streamMsg) streamMsg = addMsg("assistant", "");
        } else if (ev === "error") addMsg("error", d.error);
      }
    }
  } catch (e) {
    addMsg("error", "NEURAL CORE OFFLINE — служба Haotica не отвечает или модель ещё загружается.");
  } finally {
    busy = false;
    streamMsg = null;
  }
}
$("send").onclick = () => { const v = $("in").value; $("in").value = ""; send(v); };
$("in").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("send").click(); }
});

// ── история и события ───────────────────────────────────────────
async function loadHistory() {
  const h = await HY.haotica("GET", `/api/history?chat=${encodeURIComponent(chat)}&n=60`).catch(() => null);
  if (!h || !h.ok) return;
  $("log").replaceChildren();
  for (const m of h.messages || []) addMsg(m.role === "user" ? "user" : "assistant", m.content, m.extra || {});
  for (const c of h.cards || []) showCard(c);
}
const s0 = await HY.haotica("GET", "/api/status").catch(() => null);
if (s0 && s0.ok) setState(s0); else document.body.classList.add("offline");
await loadHistory();
HY.stream(["state", "mouth", "card", "card_done", "message"], {
  state: setState,
  mouth: (d) => avatar && avatar.setMouth && avatar.setMouth(d.v),
  card: showCard,
  card_done: (d) => dropCard(d.id),
  message: (m) => { if (!busy && m.chat === chat && m.role === "assistant" && m.final && m.text !== lastFinal) addMsg("assistant", m.text, { role: m.model }); },
}, HY.haoticaUrl);
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || !e.data.haotica) return;
  if (e.data.type === "ask" && e.data.text) send(e.data.text);
});
HY.on("open", (args) => { if (args && args[0]) send(args.join(" ")); });
if (HY.args && HY.args.length && typeof HY.args[0] === "string") send(HY.args.join(" "));
$("in").focus();
