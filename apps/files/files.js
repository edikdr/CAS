// HAOTICA — Файлы (минимум): обзор, открыть, в корзину, превью, поиск.
import { HY, el, icon } from "/ui/hy.js";

await HY.start({ title: "Файлы", glyph: "folder" });
const $ = (id) => document.getElementById(id);
const S = { path: "", hidden: false, hist: [], entries: [], sel: null };
$("back").append(icon("chevron", 14)); $("back").firstChild.style.transform = "rotate(180deg)";
$("up").append(icon("chevron", 14)); $("up").firstChild.style.transform = "rotate(-90deg)";
$("hidden").append(icon("eye", 14)); $("mkdir").append(icon("plus", 14));
const GLYPH = { code: "code", doc: "doc", image: "image", video: "play", audio: "music", archive: "archive", model: "haotica" };

async function load(path, push = true) {
  const r = await HY.get(`/api/fs/list?path=${encodeURIComponent(path)}${S.hidden ? "&hidden=1" : ""}`);
  if (!r || !r.ok) return HY.toast((r && r.error) || "Нет доступа", "err");
  if (push && S.path && S.path !== r.path) S.hist.push(S.path);
  S.path = r.path; S.parent = r.parent; S.entries = r.entries || [];
  $("path").value = r.path;
  render(S.entries);
  HY.sub(r.path);
}
function render(list) {
  const rows = $("rows");
  rows.replaceChildren();
  for (const e of list) {
    const tr = el("tr", {
      onclick: () => select(e, tr), ondblclick: () => open(e),
      oncontextmenu: (ev) => { ev.preventDefault(); select(e, tr); menu(ev, e); },
    },
      el("td", icon(e.type === "dir" ? "folder" : GLYPH[e.category] || "doc", 14), el("span", e.name)),
      el("td.num", e.type === "dir" ? "" : HY.fmtBytes(e.size || 0)),
      el("td.num", e.mtime ? HY.fmtDate(e.mtime * 1000, { dateStyle: "short", timeStyle: "short" }) : ""));
    rows.append(tr);
  }
  const dirs = list.filter((e) => e.type === "dir").length;
  $("status").replaceChildren(el("span", el("b", String(list.length)), " объектов"), el("span", `${dirs} папок`));
}
function select(e, tr) {
  document.querySelectorAll("#rows tr.on").forEach((x) => x.classList.remove("on"));
  tr.classList.add("on"); S.sel = e; preview(e);
}
function open(e) { if (e.type === "dir") load(e.path); else HY.post("/api/fs/open", { path: e.path }); }
async function trash(e) {
  const r = await HY.post("/api/fs/trash", { paths: [e.path] });
  if (r.ok && !(r.failed || []).length) { HY.toast(`В корзине: ${e.name}`, "", [{ label: HY.t("undo"), fn: async () => { await HY.post("/api/fs/trash/restore", { paths: [e.path] }); load(S.path, false); } }]); }
  else HY.toast((r.failed && r.failed[0] && r.failed[0].error) || r.error || "Не удалось", "err");
  load(S.path, false);
}
function menu(ev, e) {
  HY.menu(ev.clientX, ev.clientY, [
    { label: HY.t("open"), icon: "folder", fn: () => open(e) },
    { label: "Показать в папке", icon: "folder", fn: () => HY.post("/api/fs/reveal", { path: e.path }) },
    { label: "Копировать путь", icon: "clipboard", fn: () => navigator.clipboard.writeText(e.path) },
    { label: HY.t("rename"), icon: "doc", fn: async () => {
      const n = await HY.prompt(HY.t("rename"), e.name); if (!n || n === e.name) return;
      const r = await HY.post("/api/fs/rename", { path: e.path, name: n }); if (!r.ok) HY.toast(r.error || "Ошибка", "err"); load(S.path, false);
    } },
    { label: "Спросить Haotica", icon: "haotica", fn: () => HY.openApp("assistant", [`Что это за файл и что с ним можно сделать? ${e.path}`]) },
    "-",
    { label: "В корзину", icon: "trash", key: "Del", danger: true, fn: () => trash(e) },
  ]);
}
async function preview(e) {
  const box = $("prev");
  box.replaceChildren(el("h3", e.name), el("div.meta", e.type === "dir" ? "папка" : `${HY.fmtBytes(e.size || 0)} · ${e.mime || ""}`));
  if (e.type === "dir") return;
  const r = await HY.get("/api/fs/preview?path=" + encodeURIComponent(e.path));
  if (!r || !r.ok || S.sel !== e) return;
  const p = r.preview || {};
  if (p.kind === "image") box.append(el("img", { src: HY.url("/api/fs/raw", { path: e.path }) }));
  else if (p.kind === "pdf" || p.kind === "video") box.append(el("img", { src: HY.url("/api/fs/thumb", { path: e.path, size: 600 }) }));
  else if (p.kind === "markdown" && p.html) box.append(el("div", { html: p.html }));
  else if (p.html) box.append(el("div.code", { html: p.html }));
  else if (p.text) box.append(el("pre", p.text));
  if (p.width) box.append(el("div.meta", `${p.width}×${p.height}`));
}
async function places() {
  const r = await HY.get("/api/fs/places");
  const nav = $("places");
  for (const p of (r && r.places) || []) nav.append(el("div.item", { onclick: () => load(p.path) }, icon(p.icon || "folder", 16), p.name));
  nav.append(el("div.item", { onclick: () => load("trash://") }, icon("trash", 16), "Корзина"));
}
$("back").onclick = () => { const p = S.hist.pop(); if (p) load(p, false); };
$("up").onclick = () => S.parent && load(S.parent);
$("path").addEventListener("keydown", (e) => { if (e.key === "Enter") load($("path").value); });
$("hidden").onclick = () => { S.hidden = !S.hidden; $("hidden").classList.toggle("on", S.hidden); load(S.path, false); };
$("mkdir").onclick = async () => {
  const n = await HY.prompt("Новая папка", "Новая папка"); if (!n) return;
  const r = await HY.post("/api/fs/mkdir", { path: S.path + "/" + n }); if (!r.ok) HY.toast(r.error || "Ошибка", "err"); load(S.path, false);
};
$("q").addEventListener("input", HY.debounce(async () => {
  const q = $("q").value.trim();
  if (!q) return render(S.entries);
  if (q.length < 2) return render(S.entries.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())));
  const r = await HY.get(`/api/fs/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(S.path)}&limit=200`);
  render(((r && r.results) || []).map((x) => (typeof x === "string" ? { name: x.split("/").pop(), path: x, type: "file" } : { name: (x.name || x.path.split("/").pop()), ...x })));
}, 250));
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "Delete" && S.sel) trash(S.sel);
  if (e.key === "Enter" && S.sel) open(S.sel);
  if (e.key === "Backspace") $("up").click();
});
HY.on("open", (args) => args[0] && load(args[0]));
await places();
await load((HY.args && HY.args[0]) || "~");
