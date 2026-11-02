// Окно API-ключей (OpenRouter, ElevenLabs, …): ключи уходят в связку ключей системы через ядро,
// в файлы и в контекст моделей не попадают; наружу показывается только маска.
import { HY, el, icon } from "/ui/hy.js";

const HINTS = {
  openrouter: "Облачные помощники и второе мнение (openrouter.ai/keys)",
  elevenlabs: "Голос Сары через ElevenLabs, если локальный синтез недоступен",
  router: "Пароль администратора роутера (Network Recon)",
  caldav: "Пароль календаря CalDAV",
};

export async function keysDialog() {
  const body = el("div", { style: { display: "flex", flexDirection: "column", gap: "12px", minWidth: "460px" } });
  const load = async () => {
    const r = await HY.get("/api/secrets").catch(() => null);
    body.replaceChildren();
    if (!r || !r.ok) { body.append(el("div", { style: { color: "var(--coral)" } }, "Ядро не отвечает")); return; }
    for (const [name, s] of Object.entries(r.secrets || {})) {
      const inp = el("input.hy-input", { type: "password", placeholder: s.set ? s.mask : "вставьте ключ", style: { flex: "1" } });
      const status = el("span", { style: { font: "11px var(--font-mono)", color: s.set ? "var(--teal)" : "var(--dim)" } }, s.set ? "СОХРАНЁН" : "НЕТ");
      const save = async () => {
        const v = inp.value.trim();
        if (!v) return;
        const x = await HY.post("/api/secrets", { name, value: v });
        inp.value = "";
        if (!x.ok || !x.stored) return HY.toast(x.error || "Связка ключей недоступна (gnome-keyring)", "err");
        if (name === "openrouter") {
          const k = await HY.haotica("GET", "/api/cloud/key?check=1").catch(() => null);
          const i = (k && k.info) || {};
          HY.toast(i.ok ? "OpenRouter: ключ принят" : "Ключ сохранён, но OpenRouter его не принял: " + (i.error || "нет связи"), i.ok ? "" : "err");
        } else HY.toast(s.label + ": сохранено");
        load();
      };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); e.stopPropagation(); });
      body.append(el("div",
        el("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" } }, icon("key", 14), el("b", s.label), status),
        el("div", { style: { color: "var(--dim)", fontSize: "12px", marginBottom: "6px" } }, HINTS[name] || ""),
        el("div", { style: { display: "flex", gap: "6px" } }, inp,
          el("button.hy-btn.small.primary", { onclick: save }, "СОХРАНИТЬ"),
          s.set ? el("button.hy-btn.ghost.icon.small", { title: "Удалить ключ", onclick: async () => {
            if (await HY.confirm("Удалить ключ?", s.label, { danger: true })) { await HY.post("/api/secrets", { name, value: "" }); load(); }
          } }, icon("trash", 14)) : null)));
    }
    body.append(el("div", { style: { color: "var(--dim)", fontSize: "11px" } },
      "Ключи хранятся в связке ключей системы (libsecret). Из консоли: haotica key set openrouter"));
  };
  await load();
  return HY.modal({ title: "API-КЛЮЧИ", body, actions: [{ label: HY.t("close"), value: null, primary: true }] });
}
