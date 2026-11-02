// HAOTICA — Монитор системы: ресурсы (поток /api/stream metrics), процессы, службы.
import { HY, el, icon } from "/ui/hy.js";

await HY.start({ title: "Монитор системы", glyph: "sysmon", topics: ["metrics"] });
const $ = (id) => document.getElementById(id);
const HIST = 120;
const hist = { cpu: [], gpu: [], gtt: [], ram: [], temp: [], net: [] };
let tab = "res", timer = null, last = {};

const TABS = [["res", "РЕСУРСЫ"], ["procs", "ПРОЦЕССЫ"], ["svc", "СЛУЖБЫ"]];
for (const [k, l] of TABS) $("tabs").append(el("div.hy-tab", { "data-t": k, onclick: () => show(k) }, l));

function cssv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function spark(c, data, max, color) {
  const r = c.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
  c.width = r.width * dpr; c.height = r.height * dpr;
  const g = c.getContext("2d"); g.scale(dpr, dpr);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1.2;
  g.beginPath();
  data.forEach((v, i) => { const x = r.width - (data.length - 1 - i) * (r.width / (HIST - 1)); const y = r.height - Math.min(1, v / (max || 1)) * (r.height - 2) - 1; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke(); g.globalAlpha = .12; g.lineTo(r.width, r.height); g.lineTo(r.width - (data.length - 1) * (r.width / (HIST - 1)), r.height); g.fill();
}
const TILES = [
  ["cpu", "CPU", (m) => `${Math.round(m.cpu || 0)}%`, (m) => `${m.temp_cpu ?? "—"}°C · вентилятор ${m.fan_rpm ?? 0} об/мин`, 100, "--amber"],
  ["gpu", "GPU · RADEON 8060S", (m) => `${m.gpu ?? 0}%`, (m) => `${m.temp_gpu ?? "—"}°C · VRAM ${m.vram_used_gb ?? 0}/${m.vram_total_gb ?? 0} ГБ`, 100, "--teal"],
  ["gtt", "GTT (ОБЩАЯ ПАМЯТЬ GPU)", (m) => `${m.gtt_used_gb ?? 0} ГБ`, (m) => `из ${m.gtt_total_gb ?? 0} ГБ`, 0, "--violet"],
  ["ram", "ПАМЯТЬ", (m) => `${m.ram_used_gb ?? 0} ГБ`, (m) => `из ${m.ram_total_gb ?? 0} ГБ · zram ${m.zram_used_gb ?? 0} ГБ`, 0, "--accent"],
  ["net", "СЕТЬ", (m) => `↓${Math.round(m.net_down_kbs || 0)} ↑${Math.round(m.net_up_kbs || 0)} КБ/с`, (m) => `${m.net_name || "—"} ${m.net_ip || ""}`, 0, "--teal"],
  ["temp", "ПИТАНИЕ", (m) => m.battery >= 0 ? `${m.battery}%${m.charging ? " ⚡" : ""}` : "AC", (m) => `${m.power_profile || ""}${m.battery_watts ? " · " + m.battery_watts + " Вт" : ""}${m.game_mode ? " · ИГРА" : ""}`, 0, "--coral"],
];
function push(m) {
  last = m;
  const vals = { cpu: m.cpu || 0, gpu: m.gpu || 0, gtt: m.gtt_used_gb || 0, ram: m.ram_used_gb || 0, temp: m.temp_cpu || 0, net: (m.net_down_kbs || 0) + (m.net_up_kbs || 0) };
  for (const k in hist) { hist[k].push(vals[k]); if (hist[k].length > HIST) hist[k].shift(); }
  if (tab === "res") drawRes();
  $("status").replaceChildren(el("span", "CPU ", el("b", Math.round(m.cpu || 0) + "%")), el("span", "GPU ", el("b", (m.gpu ?? 0) + "%")),
    el("span", "GTT ", el("b", `${m.gtt_used_gb ?? 0}/${m.gtt_total_gb ?? 0} ГБ`)), el("span", "HAOTICA ", el("b", `${m.llm_role || ""} ${m.llm_state || ""}`)),
    el("span", "UPTIME ", el("b", (m.uptime_hours ?? 0) + " ч")));
}
function drawRes() {
  let g = document.querySelector(".m-grid");
  if (!g) {
    g = el("div.m-grid.scroll");
    for (const [k, t] of TILES) g.append(el("div.m-tile", { "data-k": k }, el("div.t", t), el("div.v"), el("canvas"), el("div.sub")));
    $("main").replaceChildren(g);
  }
  for (const [k, , v, sub, max, col] of TILES) {
    const tile = g.querySelector(`[data-k="${k}"]`);
    tile.querySelector(".v").textContent = v(last);
    tile.querySelector(".sub").textContent = sub(last);
    const mx = max || (k === "gtt" ? last.gtt_total_gb : k === "ram" ? last.ram_total_gb : Math.max(1, ...hist[k]));
    spark(tile.querySelector("canvas"), hist[k], mx, cssv(col) || "#E0A243");
  }
}
async function procs() {
  const sortSel = document.querySelector("#psort");
  const q = (document.querySelector("#pq") || {}).value || "";
  const r = await HY.get("/api/sys/procs?sort=" + (sortSel ? sortSel.value : "cpu"));
  const tb = document.querySelector("#prows");
  if (!tb || !r || !r.ok) return;
  tb.replaceChildren();
  for (const p of r.procs.filter((p) => !q || (p.name + " " + p.cmd).toLowerCase().includes(q.toLowerCase())).slice(0, 150)) {
    tb.append(el("tr", { title: p.cmd, oncontextmenu: (e) => { e.preventDefault(); pmenu(e, p); } },
      el("td.num", String(p.pid)), el("td", p.name), el("td", p.user || ""), el("td.num", p.cpu.toFixed(1)), el("td.num", p.mem_mb.toFixed(0) + " МБ"),
      el("td", p.mine ? el("button.hy-btn.ghost.icon.small", { title: "Завершить", onclick: () => kill(p, "term") }, icon("close", 12)) : "")));
  }
}
async function kill(p, sig) {
  if (sig === "kill" && !(await HY.confirm("Убить процесс?", `${p.name} (${p.pid}) — без сохранения данных`, { danger: true }))) return;
  const r = await HY.post("/api/sys/kill", { pid: p.pid, signal: sig });
  HY.toast(r.ok ? `${p.name}: сигнал ${sig}` : r.error || "Ошибка", r.ok ? "" : "err"); procs();
}
function pmenu(e, p) {
  HY.menu(e.clientX, e.clientY, [
    { label: "Завершить (TERM)", icon: "close", fn: () => kill(p, "term") },
    { label: "Убить (KILL)", icon: "close", danger: true, fn: () => kill(p, "kill") },
    { label: "Приостановить", icon: "minus", fn: () => kill(p, "stop") }, { label: "Продолжить", icon: "play", fn: () => kill(p, "cont") },
    "-", { label: "Спросить Haotica", icon: "haotica", fn: () => HY.openApp("assistant", [`Что за процесс ${p.name} (pid ${p.pid}): ${p.cmd}?`]) },
  ]);
}
async function services() {
  const r = await HY.get("/api/sys/services");
  const box = el("div.hy-list.scroll", { style: { flex: 1, overflow: "auto" } });
  for (const u of (r && r.units) || []) {
    const act = (a) => async () => { const x = await HY.post("/api/sys/service", { unit: u.unit, action: a }); HY.toast(x.ok ? u.unit + ": " + a : x.error || "Ошибка", x.ok ? "" : "err"); services(); };
    box.append(el("div.it", el("b", u.unit), el("span", { style: { color: "var(--dim)" } }, u.description || ""),
      el("span.meta", `${u.active}/${u.sub}`),
      el("button.hy-btn.small", { onclick: act(u.active === "active" ? "stop" : "start") }, u.active === "active" ? "СТОП" : "СТАРТ"),
      el("button.hy-btn.ghost.icon.small", { title: "Перезапуск", onclick: act("restart") }, icon("reboot", 14))));
  }
  if (tab === "svc") $("main").replaceChildren(box);
}
function show(k) {
  tab = k;
  clearInterval(timer);
  document.querySelectorAll(".hy-tab").forEach((t) => t.classList.toggle("on", t.dataset.t === k));
  if (k === "res") { $("main").replaceChildren(); drawRes(); }
  if (k === "procs") {
    const sort = el("select.hy-input.hy-select", { id: "psort", onchange: procs }, el("option", { value: "cpu" }, "по CPU"), el("option", { value: "mem" }, "по памяти"));
    $("main").replaceChildren(el("div.m-bar", el("input.hy-input", { id: "pq", placeholder: "Фильтр…", oninput: procs }), sort),
      el("div.m-procs", el("table.hy-table", el("thead", el("tr", ["PID", "ИМЯ", "ПОЛЬЗОВАТЕЛЬ", "CPU %", "ПАМЯТЬ", ""].map((h) => el("th", h)))), el("tbody", { id: "prows" }))));
    procs(); timer = setInterval(procs, 2500);
  }
  if (k === "svc") { services(); timer = setInterval(services, 5000); }
}
HY.on("metrics", push);
const m0 = await HY.get("/api/metrics").catch(() => null);
if (m0 && m0.ok !== false) push(m0.metrics || m0);
show((HY.args && HY.args[0]) || "res");
