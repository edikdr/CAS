// Мастер первого запуска HAOTICA Terminal (ТЗ T-71): система → модели → оболочка → голос → ключи.
// Открывается сам, пока нет отметки state/wizard.done; повторно — из палитры «Мастер первого запуска».
import { HY, el, icon } from "/ui/hy.js";
import { cloudKeyRow, keyfieldCss } from "/ui/keyfield.js";

const CSS = `
.wz-back { position: fixed; inset: 0; z-index: 4000; background: color-mix(in srgb, var(--bg0) 86%, transparent); display: grid; place-items: center;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 16px max(16px, env(safe-area-inset-left, 0px)); }
.wz { width: min(760px, 100%); max-height: calc(100vh - 40px); display: flex; flex-direction: column; background: var(--bg1); border: 1px solid var(--line-hi); }
.wz-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.wz-head b { font: 600 12px var(--font-mono); letter-spacing: .2em; color: var(--accent); }
.wz-steps { display: flex; gap: 4px; margin-left: auto; }
.wz-steps i { width: 26px; height: 3px; background: var(--line-hi); } .wz-steps i.on { background: var(--accent); } .wz-steps i.done { background: var(--teal); }
.wz-body { padding: 14px 16px; overflow: auto; display: grid; gap: 10px; font-size: 13px; }
.wz-body h2 { margin: 0; font: 600 14px var(--font-mono); letter-spacing: .12em; color: var(--ink); }
.wz-body p { margin: 0; color: var(--dim); }
.wz-chk { display: grid; grid-template-columns: 180px 54px 1fr; gap: 8px; font: 11.5px var(--font-mono); align-items: baseline; }
.wz-chk .ok { color: var(--green); } .wz-chk .warn { color: var(--amber); } .wz-chk .fail { color: var(--coral); }
.wz-chk span:last-child { color: var(--dim); overflow-wrap: anywhere; }
.wz-model { display: grid; grid-template-columns: 22px 70px 1fr auto; gap: 8px; align-items: center; padding: 8px; border: 1px solid var(--line); cursor: pointer; }
.wz-model.on { border-color: var(--accent); } .wz-model b { font: 600 11px var(--font-mono); letter-spacing: .12em; color: var(--accent); }
.wz-model small { color: var(--dim); display: block; }
.wz-model .sz { font: 11px var(--font-mono); color: var(--dim); white-space: nowrap; }
.wz-foot { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); justify-content: flex-end; }
.wz-foot .grow { flex: 1; }
.wz-prof { display: flex; flex-wrap: wrap; gap: 6px; }
` + keyfieldCss;
const ROLES = [
  ["fast", "FAST", "подсказки в строке и названия чатов", true],
  ["base", "BASE", "терминал, команды, зрение — основная", true],
  ["deep", "DEEP", "большие задачи и код (по желанию; меняется с base)", false],
];

export async function runWizard({ profiles = [], defaultProfile = "", force = false } = {}) {
  const doc = await HY.get("/api/doctor");
  if (!force && doc && doc.wizard_done) return;
  if (!document.getElementById("wz-css")) { const st = el("style", CSS); st.id = "wz-css"; document.head.append(st); }
  const steps = ["Система", "Модели", "Оболочка", "Голос", "Ключи"];
  let step = 0;
  const pick = new Set(ROLES.filter((r) => r[3]).map((r) => r[0]));
  const body = el("div.wz-body"), bar = el("div.wz-steps", steps.map(() => el("i")));
  const back = el("button.hy-btn", { onclick: () => go(step - 1) }, "НАЗАД");
  const next = el("button.hy-btn.primary", { onclick: () => go(step + 1) }, "ДАЛЕЕ");
  const later = el("button.hy-btn.ghost", { onclick: () => finish() }, "ПОЗЖЕ");
  const wz = el("div.wz", el("div.wz-head", icon("haotica", 16), el("b", "HAOTICA TERMINAL // ПЕРВЫЙ ЗАПУСК"), bar), body,
    el("div.wz-foot", later, el("span.grow"), back, next));
  const root = el("div.wz-back", wz);
  document.body.append(root);
  let timer = null;
  const finish = async () => { clearInterval(timer); await HY.post("/api/wizard/done", {}); root.remove(); };

  async function go(n) {
    clearInterval(timer);
    if (n >= steps.length) return finish();
    step = Math.max(0, n);
    [...bar.children].forEach((b, i) => { b.className = i === step ? "on" : i < step ? "done" : ""; });
    back.disabled = step === 0;
    next.textContent = step === steps.length - 1 ? "ГОТОВО" : "ДАЛЕЕ";
    body.replaceChildren();
    if (step === 0) {
      const d = await HY.get("/api/doctor");
      body.append(el("h2", "ПРОВЕРКА СИСТЕМЫ"), el("p", "Видеокарта, llama.cpp, оболочки, диск. Предупреждения не мешают работе терминала — Haotica включится, когда будут модели."),
        el("div.wz-chk", ((d && d.checks) || []).flatMap((c) => [el("span", c.name), el("span." + c.status, c.status.toUpperCase()), el("span", c.info)])));
    } else if (step === 1) {
      const m = await HY.get("/api/models");
      const list = (m && m.models) || {};
      const free = ((await HY.get("/api/doctor")) || {}).checks?.find((c) => c.name === "ДИСК")?.info || "";
      const status = el("p", "");
      const render = () => {
        const need = [...pick].reduce((a, r) => a + Math.max(0, ((list[r] || {}).size || 0) - ((list[r] || {}).have || 0)), 0);
        status.textContent = `Нужно скачать: ${HY.fmtBytes(need)} · ${free}. Загрузка идёт в фоне с докачкой и проверкой SHA-256; терминал работает уже сейчас.`;
      };
      body.append(el("h2", "МОДЕЛИ HAOTICA"), el("p", "Три локальные модели для кода. Минимум — FAST и BASE; DEEP можно добавить позже в Настройках."),
        ...ROLES.map(([role, tag, what]) => {
          const x = list[role] || {};
          const row = el("div.wz-model" + (pick.has(role) ? ".on" : ""), { onclick: () => { pick.has(role) ? pick.delete(role) : pick.add(role); row.classList.toggle("on"); box.checked = pick.has(role); render(); } },
            el("input", { type: "checkbox", checked: pick.has(role), tabindex: -1 }), el("b", tag), el("div", x.label || role, el("small", what)),
            el("span.sz", x.ready ? "ГОТОВА" : x.have ? `${Math.floor(100 * x.have / Math.max(1, x.size))}%` : HY.fmtBytes(x.size || 0)));
          const box = row.querySelector("input");
          return row;
        }), status,
        el("div.s-actions", el("button.hy-btn.primary", { onclick: async () => {
          await HY.haotica("POST", "/api/models/download", { roles: [...pick] });
          HY.toast("Загрузка начата в фоне — прогресс в блоке DL справа сверху");
        } }, icon("download", 14), " СКАЧАТЬ ВЫБРАННЫЕ")));
      render();
    } else if (step === 2) {
      const cur = (HY.settings.terminal || {}).default_profile || defaultProfile;
      body.append(el("h2", "ОБОЛОЧКА ПО УМОЛЧАНИЮ"), el("p", "Что открывать в новой вкладке. Другие профили — в «+» рядом с вкладками."),
        el("div.wz-prof", profiles.map((p) => el("button.hy-btn" + (p.id === cur ? ".primary" : ""), { onclick: async (e) => {
          const btn = e.currentTarget;
          btn.parentNode.querySelectorAll("button").forEach((b) => b.classList.remove("primary")); btn.classList.add("primary");
          await HY.setting("terminal.default_profile", p.id);
        } }, p.name))));
    } else if (step === 3) {
      body.append(el("h2", "ГОЛОС САРЫ"), el("p", "Локальная модель речи выбирается слепым прослушиванием (samples/tts). Если службы речи ещё нет — Haotica отвечает текстом."),
        el("div.s-actions", el("button.hy-btn", { onclick: async () => {
          const r = await HY.haotica("POST", "/api/voice/test", {});
          HY.toast(r && r.played ? `Голос: ${r.engine || "?"}` : "Голос не прозвучал: служба речи не установлена (haotica voice install)", r && r.played ? "" : "err", [], 6000);
        } }, icon("volume", 14), " ПРОВЕРИТЬ ГОЛОС")));
    } else if (step === 4) {
      body.append(el("h2", "КЛЮЧИ (НЕОБЯЗАТЕЛЬНО)"), el("p", "Облачная модель — только второе мнение и поиск публичной информации; всё локальное идёт карточкой. Ключ хранится в Диспетчере учётных данных Windows."),
        cloudKeyRow());
    }
  }
  go(0);
}
