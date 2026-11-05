// HAOTICA — окно ассистента. ?embed=terminal — вкладка HAOTICA внутри терминала (тот же чат, что мини-окно под аватаром).
import { HY } from "/ui/hy.js";
import { createAvatar, avatarCss } from "/ui/avatar.js";
import { ChatView } from "/ui/chat.js";

const qs = new URLSearchParams(location.search);
const embed = qs.get("embed") || "";
if (embed) document.body.classList.add("embed");
await HY.start({ title: "Haotica", glyph: "haotica", chrome: !embed, topics: [] });
const $ = (id) => document.getElementById(id);
const inTerminal = embed === "terminal";

const st = document.createElement("style"); st.textContent = avatarCss(); document.head.append(st);
let avatar = null;
try { avatar = createAvatar($("av"), { size: embed ? 40 : 64, interactive: false, crt: 0.25 }); } catch (e) { /* без аватара */ }
const toTerminal = (type, text) => { try { window.parent.postMessage({ haotica: true, type, text }, location.origin); } catch (e) { /* не во фрейме */ } };

const chat = new ChatView($("chat"), {
  source: inTerminal ? "terminal" : "panel", key: inTerminal ? "terminal" : (qs.get("chat") || "panel"),
  onRun: inTerminal ? (code) => toTerminal("run", code) : null,
  onInsert: inTerminal ? (code) => toTerminal("insert", code) : null,
  onState: (s) => {
    $("st").textContent = (s.state || "idle").toUpperCase();
    $("line").textContent = s.line || "";
    if (avatar) avatar.setState(s.state);
  },
});
HY.stream(["mouth"], { mouth: (d) => avatar && avatar.setMouth(d.v) }, HY.haoticaUrl);
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || !e.data.haotica) return;
  if (e.data.type === "open-chat" && e.data.chat) chat.open(e.data.chat);
  if (e.data.type === "focus-key") chat.focusKey();
  if (e.data.type === "ask" && e.data.text) chat.send(e.data.text);
});
HY.on("open", (args) => { if (args && args[0] && !args[0].startsWith("--")) chat.send(args.join(" ")); });
if (qs.get("focus") === "key") chat.focusKey(); else chat.focus();
