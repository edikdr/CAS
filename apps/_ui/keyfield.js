// Ключ рядом с моделью (ТЗ T-43): одна строка [облачная модель ▾] [ключ ••••] [Проверить] [✓/✗ баланс].
// Ключ уходит в хранилище системы (Windows Credential Manager / libsecret) через агента или ядро;
// в файлы, журналы и контекст моделей не попадает, обратно показывается только маска.
import { HY, el, icon } from "/ui/hy.js";

function statusPill() { return el("span.kf-st", "…"); }
function setStatus(st, ok, text) { st.className = "kf-st " + (ok === true ? "ok" : ok === false ? "err" : ""); st.textContent = text; }

// OpenRouter: выбор облачной модели + ключ
export function cloudKeyRow({ compact = false } = {}) {
  const sel = el("select.hy-input.hy-select.kf-model", { title: "Облачная модель (второе мнение)" });
  const inp = el("input.hy-input.kf-key", { type: "password", placeholder: "ключ OpenRouter (sk-or-…)", autocomplete: "off", spellcheck: false });
  const st = statusPill();
  const check = async (force = true) => {
    setStatus(st, null, "…");
    const r = await HY.haotica("GET", "/api/cloud/key" + (force ? "?check=1" : ""));
    if (!r || !r.ok) return setStatus(st, false, "агент не отвечает");
    if (!r.set) { inp.placeholder = "ключ OpenRouter (sk-or-…)"; return setStatus(st, null, "нет ключа"); }
    inp.placeholder = r.mask;
    const i = r.info || {};
    if (!force) return setStatus(st, null, "сохранён");
    setStatus(st, !!i.ok, i.ok ? `✓ $${i.credits != null ? (i.credits - (i.spent || 0)).toFixed(2) : "—"}` : "✗ " + (i.error || "не принят"));
  };
  const save = async () => {
    const v = inp.value.trim();
    if (!v) return check(true);
    const r = await HY.haotica("POST", "/api/cloud/key", { key: v });
    inp.value = "";
    if (!r || !r.ok) return setStatus(st, false, (r && r.error) || "не сохранён");
    check(true);
  };
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") save(); if (e.key === "Escape") inp.blur(); });
  sel.addEventListener("change", () => HY.setting("cloud.model", sel.value));
  const loadModels = async () => {
    const ms = await HY.haotica("GET", "/api/cloud/models");
    const list = (ms && ms.models) || [];
    const curm = ((HY.settings || {}).cloud || {}).model || "";
    sel.replaceChildren(el("option", { value: "" }, "— облачная модель —"),
      ...list.map((m) => el("option", { value: m.id, selected: m.id === curm }, compact ? m.id : `${m.id} · $${(+m.in).toFixed(2)}/$${(+m.out).toFixed(2)}`)));
    if (curm && !list.find((m) => m.id === curm)) sel.append(el("option", { value: curm, selected: true }, curm));
  };
  const row = el("div.kf-row" + (compact ? ".compact" : ""), icon("cloud", 14), sel, inp,
    el("button.hy-btn.small", { onclick: save, title: "Сохранить и проверить ключ" }, "ПРОВЕРИТЬ"), st,
    el("button.hy-btn.ghost.icon.small", { title: "Удалить ключ", onclick: async () => {
      if (await HY.confirm("Удалить ключ OpenRouter?", "Облачные модели перестанут работать до ввода нового ключа.", { danger: true })) {
        await HY.haotica("DELETE", "/api/cloud/key"); check(false);
      } } }, icon("trash", 14)));
  row.focusKey = () => { inp.focus(); inp.select(); };
  loadModels(); check(false);
  return row;
}

// ElevenLabs: рядом с выбором движка речи (необязательный облачный голос)
export function elevenKeyRow() {
  const inp = el("input.hy-input.kf-key", { type: "password", placeholder: "ключ ElevenLabs (необязательно)", autocomplete: "off" });
  const st = statusPill();
  const load = async () => {
    const r = await HY.get("/api/secrets");
    const s = r && r.secrets && r.secrets.elevenlabs;
    if (s && s.set) { inp.placeholder = s.mask; setStatus(st, true, "✓ сохранён"); } else setStatus(st, null, "нет ключа");
  };
  const save = async () => {
    const v = inp.value.trim();
    if (!v) return;
    const x = await HY.post("/api/secrets", { name: "elevenlabs", value: v });
    inp.value = "";
    setStatus(st, !!(x && x.ok && x.stored), x && x.ok && x.stored ? "✓ сохранён" : (x && x.error) || "хранилище недоступно");
    HY.haotica("POST", "/api/reload", {});
  };
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") save(); });
  load();
  return el("div.kf-row", icon("volume", 14), el("span.kf-lbl", "ElevenLabs"), inp,
    el("button.hy-btn.small", { onclick: save }, "СОХРАНИТЬ"), st,
    el("button.hy-btn.ghost.icon.small", { title: "Удалить ключ", onclick: async () => { await HY.post("/api/secrets", { name: "elevenlabs", value: "" }); load(); } }, icon("trash", 14)));
}

export const keyfieldCss = `
.kf-row { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
.kf-row .kf-model { flex: 1 1 200px; min-width: 120px; max-width: 320px; }
.kf-row .kf-key { flex: 1 1 180px; min-width: 120px; font-family: var(--font-mono); }
.kf-row.compact .kf-model { flex: 1 1 120px; }
.kf-row .kf-lbl { font: 600 10.5px var(--font-mono); letter-spacing: .12em; color: var(--dim); }
.kf-st { font: 10.5px var(--font-mono); color: var(--dim); white-space: nowrap; }
.kf-st.ok { color: var(--green); } .kf-st.err { color: var(--coral); }
`;
