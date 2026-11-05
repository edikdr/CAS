// HAOTICA — Настройки. Каждое поле пишет в settings.toml через /api/settings (ядро применяет на лету).
import { HY, el, icon } from "/ui/hy.js";
import { cloudKeyRow, elevenKeyRow, keyfieldCss } from "/ui/keyfield.js";

await HY.start({ title: "Настройки", glyph: "settings" });
document.head.append(el("style", keyfieldCss));
const IS_WIN = HY.boot.platform === "windows";
const FEAT = HY.boot.features || {};
const $ = (id) => document.getElementById(id);
const get = (key) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), HY.settings);
let current = "appearance";
let timers = [];

async function refreshSettings() {
  const st = await HY.get("/api/settings").catch(() => null);
  if (st && st.settings) HY.applySettings(st.settings);
}

// ── конструкторы полей ──────────────────────────────────────────
function field(label, hint, ...ctl) {
  return el("div.hy-field", el("div.label", el("b", label), hint ? el("small", hint) : null), el("div.ctl", ...ctl));
}
const save = (key) => (v) => HY.setting(key, v);
function toggle(key, label, hint) { return field(label, hint, HY.toggle(!!get(key), save(key))); }
function range(key, label, hint, { min = 0, max = 1, step = 0.01, fmt = (v) => Math.round(v * 100) + "%" } = {}) {
  const val = el("span.val", fmt(+get(key) || 0));
  return field(label, hint, HY.range(+get(key) || 0, { min, max, step, oninput: (v) => (val.textContent = fmt(v)), onchange: save(key) }), val);
}
function seg(key, label, hint, options) { return field(label, hint, HY.seg(options, get(key), save(key))); }
function select(key, label, hint, options) {
  const s = el("select.hy-input.hy-select", { onchange: () => HY.setting(key, isNaN(+s.value) || s.value === "" ? s.value : +s.value) },
    options.map(([v, l]) => el("option", { value: v, selected: String(get(key)) === String(v) }, l)));
  return field(label, hint, s);
}
function text(key, label, hint, { list = false, placeholder = "" } = {}) {
  const v = get(key);
  const i = el("input.hy-input", { value: list ? (v || []).join(", ") : (v ?? ""), placeholder });
  i.addEventListener("change", () => HY.setting(key, list ? i.value.split(",").map((x) => x.trim()).filter(Boolean) : i.value.trim()));
  return field(label, hint, i);
}
function num(key, label, hint, { min, max, step = 1 } = {}) {
  const i = el("input.hy-input.num", { type: "number", value: get(key) ?? 0, min, max, step });
  i.addEventListener("change", () => HY.setting(key, +i.value));
  return field(label, hint, i);
}
const h1 = (t) => el("h1", t);
const h2 = (t) => el("h2", t);
const note = (t, cls = "") => el("div.s-note" + (cls ? "." + cls : ""), t);
const pill = (s) => el("span.s-pill." + String(s || "offline").split(" ")[0], String(s || "offline").toUpperCase());
function every(ms, fn) { fn(); timers.push(setInterval(fn, ms)); }

// ── страницы ────────────────────────────────────────────────────
const KEYS_HELP = [
  "Ctrl+Shift+T — новая вкладка · Ctrl+Shift+W — закрыть панель/вкладку · Ctrl+Shift+D — дублировать",
  "Ctrl+Tab / Ctrl+Shift+Tab — следующая/предыдущая · Alt+1…9 — вкладка N",
  "Alt+Shift+Plus / Alt+Shift+Minus — разделить · Alt+стрелки — соседняя панель",
  "Ctrl+C — копировать (если выделено, иначе прерывание) · Ctrl+V, Shift+Insert — вставить · Ctrl+Insert — копировать",
  "Ctrl+Shift+F — поиск · Ctrl+Shift+P — команды · Ctrl+Shift+K — очистить · Ctrl+Shift+↑/↓ — блоки",
  "Ctrl+Shift+Home/End — к началу/концу · Ctrl+= / Ctrl+− / Ctrl+0 — шрифт · F11 — во весь экран",
  "Ctrl+Shift+B / Ctrl+Shift+H — левая/правая колонка",
].join("\n");
const PROFILES = ["MIX", "HYPERION", "SUBJECT", "ESCAPE", "ARCH", "RIDER", "SPACE", "CUSTOM"];
const PAGES = {
  appearance: { title: "Внешний вид", icon: "image", build: () => [
    h1("Внешний вид"),
    select("appearance.profile", "Профиль оформления", "Палитра и характер интерфейса", PROFILES.map((p) => [p, p])),
    range("appearance.ui_scale", "Масштаб интерфейса", null, { min: 1, max: 2.2, step: 0.05, fmt: (v) => v.toFixed(2) + "×" }),
    range("appearance.font_size", "Размер шрифта", null, { min: 8, max: 16, step: 0.5, fmt: (v) => v + " pt" }),
    seg("appearance.density", "Плотность", null, [["compact", "Плотно"], ["normal", "Обычно"], ["airy", "Свободно"]]),
    select("appearance.wallpaper", "Обои", null, [["statue", "Статуя"], ["nebula", "Туманность"], ["contour", "Контуры"], ["plain", "Чёрный"], ["custom", "Свои"]]),
    toggle("appearance.wallpaper_live", "Живые обои"),
    range("appearance.liveliness", "Живость интерфейса"),
    h2("CRT и эффекты"),
    range("effects.crt_terminal", "CRT терминала", "Строки, расхождение лучей, свечение"),
    range("effects.crt_avatar", "CRT аватара", "Добавляется к CRT окна"),
    range("effects.crt_screen", "CRT всего экрана", "Выключается в режиме «Игра» и в полноэкранных окнах"),
    toggle("effects.crt_fullscreen_off", "Снимать экранный CRT в полноэкранных окнах"),
    toggle("effects.terminal_art", "Фон терминала «руки из кода»"),
    range("effects.glitch", "Глитч событий", null, { min: 0, max: 1.5, step: 0.05 }),
    range("effects.glow", "Свечение"),
    toggle("effects.blur", "Размытие под окнами"),
    h2("Анимации"),
    select("animations.preset", "Набор", null, [["SIGNAL", "SIGNAL"], ["CHAOS", "CHAOS"], ["BLUEPRINT", "BLUEPRINT"], ["MINIMAL", "MINIMAL"]]),
    range("animations.speed", "Скорость", null, { min: 0.3, max: 2, step: 0.05, fmt: (v) => v.toFixed(2) + "×" }),
    range("animations.window", "Окна: CRT + глитч", null, { min: 0, max: 1.5, step: 0.05, fmt: (v) => v.toFixed(2) + "×" }),
    toggle("animations.reduce_motion", "Меньше движения"),
  ] },

  display: { title: "Экран", icon: "layout", build: () => {
    const box = el("div");
    const pend = {};
    const mons = el("div.s-kv");
    HY.get("/api/display").then((r) => {
      for (const m of (r && r.monitors) || []) mons.append(el("span", m.name || "monitor"),
        el("span", `${m.width}×${m.height} @ ${Math.round(m.refreshRate || 0)} Гц · ×${m.scale} ${m.vrr ? "· VRR" : ""}`));
      if (!mons.children.length) mons.append(el("span", "—"), el("span", "Hyprland недоступен"));
    });
    const pick = (key, label, opts) => {
      const s = HY.seg(opts, get(key), (v) => { pend[key] = v; });
      return field(label, null, s);
    };
    const applyBtn = el("button.hy-btn.primary", { onclick: async () => {
      if (!Object.keys(pend).length) return HY.toast("Нет изменений");
      const r = await HY.post("/api/display/apply", { changes: { ...pend }, timeout: 15 });
      if (!r || r.ok === false) return HY.toast((r && r.error) || "не применилось", "err");
      let left = 15;
      const cnt = el("b", String(left));
      const t = setInterval(() => { left--; cnt.textContent = String(left); if (left <= 0) clearInterval(t); }, 1000);
      const keep = await HY.modal({ title: "Оставить новые параметры экрана?", body: el("div", "Откат через ", cnt, " с."),
        actions: [{ label: "Вернуть", value: false }, { label: "Оставить", value: true, primary: true }] });
      clearInterval(t);
      await HY.post(keep ? "/api/display/confirm" : "/api/display/revert", {});
      for (const k of Object.keys(pend)) delete pend[k];
      refreshSettings();
    } }, "Применить (откат через 15 с)");
    box.append(h1("Экран"), mons,
      pick("display.refresh", "Частота", [[60, "60"], [120, "120"], [165, "165 Гц"]]),
      pick("display.scale", "Масштаб", [[1, "1"], [1.25, "1.25"], [1.5, "1.5"], [1.6, "1.6"], [2, "2"]]),
      pick("display.vrr", "VRR (FreeSync)", [[true, "Вкл"], [false, "Выкл"]]),
      pick("display.hdr", "HDR", [[false, "Выкл"], [true, "Вкл"]]),
      pick("display.bitdepth", "Глубина цвета", [[8, "8 бит"], [10, "10 бит"]]),
      el("div.s-actions", applyBtn),
      h2("Ночной свет"),
      toggle("display.night_light", "Ночной свет по расписанию"),
      text("display.night_start", "Начало", null, { placeholder: "22:00" }),
      text("display.night_end", "Конец", null, { placeholder: "07:00" }),
      num("display.night_temperature", "Температура, K", null, { min: 2500, max: 6500, step: 100 }),
      h2("Подсветка клавиатуры"),
      seg("keyboard.backlight", "Режим", null, [["palette", "Палитра"], ["haotica", "Haotica"], ["static", "Цвет"], ["off", "Выкл"]]),
      range("keyboard.backlight_brightness", "Яркость", null, { min: 0, max: 3, step: 1, fmt: (v) => String(v) }));
    return [box];
  } },

  sound: { title: "Звук", icon: "volume", build: () => {
    const devs = el("div");
    const load = async () => {
      const r = await HY.get("/api/audio");
      devs.replaceChildren();
      if (!r || !r.ok) return devs.append(note("PipeWire недоступен", "s-err"));
      for (const [kind, label, def] of [["sinks", "Выход", "default_sink"], ["sources", "Вход", "default_source"]]) {
        devs.append(h2(label));
        for (const d of r[kind] || []) {
          const isDef = d.name === r[def];
          devs.append(el("div.s-row",
            el("button.hy-btn.small" + (isDef ? ".primary" : ""), { onclick: async () => { await HY.post("/api/audio", { action: kind === "sinks" ? "default-sink" : "default-source", target: d.name }); load(); } }, isDef ? "ОСНОВНОЕ" : "ВЫБРАТЬ"),
            el("span.nm", d.description || d.name),
            HY.range(d.volume ?? 0.5, { min: 0, max: 1.5, step: 0.01, onchange: (v) => HY.post("/api/audio", { action: kind === "sinks" ? "sink-volume" : "source-volume", target: d.name, value: v }) }),
            el("button.hy-btn.ghost.icon.small", { title: "Без звука", onclick: async () => { await HY.post("/api/audio", { action: kind === "sinks" ? "sink-mute" : "source-mute", target: d.name }); load(); } }, icon(d.mute ? "mute" : "volume", 14))));
        }
      }
    };
    load();
    return [h1("Звук"), range("sound.volume", "Громкость звуков системы"), toggle("sound.ui_sounds", "Звуки интерфейса"),
      toggle("sound.voice_lines", "Голос Haotica"), toggle("sound.emotions", "Эмоции (смех, вздохи)"),
      toggle("sound.quiet_hours", "Тихие часы"), text("sound.quiet_start", "Тихо с"), text("sound.quiet_end", "Тихо до"), devs];
  } },

  network: { title: "Сеть", icon: "wifi", build: () => {
    const wifi = el("div"), bt = el("div");
    const loadWifi = async (rescan) => {
      const r = await HY.get("/api/wifi" + (rescan ? "?rescan=1" : ""));
      wifi.replaceChildren();
      if (!r || !r.ok) return wifi.append(note((r && r.error) || "NetworkManager недоступен", "s-err"));
      wifi.append(field("Wi-Fi", null, HY.toggle(r.radio, async (v) => { await HY.post("/api/wifi", { action: v ? "radio-on" : "radio-off" }); loadWifi(); })),
        el("div.s-actions", el("button.hy-btn.small", { onclick: () => loadWifi(true) }, icon("search", 14), " Искать")));
      for (const n of r.networks || []) {
        wifi.append(el("div.s-row", icon("wifi", 14), el("span.nm", n.ssid || "(скрытая)"), el("span.meta", `${n.signal}% ${n.security || ""}`),
          n.active ? el("span.s-pill.active", "ПОДКЛЮЧЕНО") : el("button.hy-btn.small", { onclick: async () => {
            const known = (r.connections || []).find((c) => c.name === n.ssid);
            let res;
            if (known) res = await HY.post("/api/wifi", { action: "up", uuid: known.uuid });
            else {
              const pw = n.security && n.security !== "--" ? await HY.prompt(`Пароль сети «${n.ssid}»`) : "";
              if (pw === null) return;
              res = await HY.post("/api/wifi", { action: "connect", ssid: n.ssid, password: pw || undefined });
            }
            HY.toast(res && res.ok ? "Подключено" : (res && res.error) || "Не удалось", res && res.ok ? "" : "err");
            loadWifi();
          } }, "ПОДКЛЮЧИТЬ")));
      }
    };
    const loadBt = async () => {
      const r = await HY.get("/api/bt");
      bt.replaceChildren();
      if (!r || !r.ok) return bt.append(note("Bluetooth недоступен", "s-err"));
      bt.append(field("Bluetooth", null, HY.toggle(r.powered, async (v) => { await HY.post("/api/bt", { action: v ? "power-on" : "power-off" }); loadBt(); })),
        el("div.s-actions", el("button.hy-btn.small", { onclick: async () => { HY.toast("Поиск 10 с…"); await HY.post("/api/bt", { action: "scan" }); loadBt(); } }, icon("search", 14), " Искать")));
      for (const d of r.devices || []) {
        const act = (a) => async () => { const x = await HY.post("/api/bt", { action: a, mac: d.mac }); if (!x.ok) HY.toast(x.error || "Не удалось", "err"); loadBt(); };
        bt.append(el("div.s-row", icon("bluetooth", 14), el("span.nm", d.name), el("span.meta", d.battery != null ? d.battery + "%" : ""),
          d.connected ? el("button.hy-btn.small", { onclick: act("disconnect") }, "ОТКЛЮЧИТЬ")
            : el("button.hy-btn.small", { onclick: act(d.paired ? "connect" : "pair") }, d.paired ? "ПОДКЛЮЧИТЬ" : "СОПРЯЧЬ"),
          d.paired ? el("button.hy-btn.ghost.icon.small", { title: "Забыть", onclick: act("remove") }, icon("trash", 14)) : null));
      }
    };
    loadWifi(); loadBt();
    return [h1("Сеть"), h2("Wi-Fi"), wifi, h2("Bluetooth"), bt, h2("Network Recon"),
      toggle("network.recon", "Следить за устройствами своей сети"), num("network.recon_interval_minutes", "Интервал, мин", null, { min: 5, max: 240 }),
      toggle("network.alert_new_devices", "Сообщать о новых устройствах")];
  } },

  power: { title: "Питание", icon: "battery", build: () => {
    const gm = HY.toggle(false, (v) => HY.post("/api/gamemode", { on: v }));
    HY.get("/api/gamemode").then((r) => r && gm.set(r.on));
    const profiles = [["quiet", "Тихий"], ["balanced", "Баланс"], ["performance", "Производительность"]];
    return [h1("Питание"),
      field("Режим «Игра»", "Выгружает модели Haotica, снимает эффекты и CRT (Super+G)", gm),
      select("power.profile_ac", "Профиль от сети", null, profiles), select("power.profile_battery", "Профиль от батареи", null, profiles),
      toggle("power.conservation", "Беречь батарею", "Заряд до порога (Lenovo conservation)"),
      num("power.charge_limit", "Порог заряда, %", null, { min: 50, max: 100, step: 5 }),
      seg("power.lid", "Крышка", null, [["suspend", "Сон"], ["lock", "Блокировка"], ["screen_off", "Экран"], ["nothing", "Ничего"]]),
      num("power.autolock_minutes", "Блокировка через, мин", null, { min: 0, max: 120 }),
      num("power.screen_off_minutes", "Экран гаснет через, мин", null, { min: 0, max: 120 }),
      num("power.suspend_minutes", "Сон через, мин", null, { min: 0, max: 240 }),
      seg("power.haotica_on_battery", "Haotica от батареи", null, [["normal", "Как обычно"], ["light", "Лёгкий режим"]]),
      h2("Режим «Игра»"),
      toggle("gamemode.unload_llm", "Выгружать модели"), toggle("gamemode.pause_effects", "Пауза эффектов"),
      toggle("gamemode.pause_recon", "Пауза сканирования сети")];
  } },

  locale: { title: "Клавиатура и язык", icon: "keyboard", build: () => [
    h1("Язык и регион"),
    seg("locale.ui_language", "Язык интерфейса", null, [["ru", "Русский"], ["en", "English"], ["de", "Deutsch"]]),
    seg("locale.haotica_language", "Язык Haotica", null, [["ru", "Русский"], ["en", "English"]]),
    seg("locale.hud_language", "Язык HUD", null, [["en", "English"], ["ui", "Как интерфейс"]]),
    text("locale.timezone", "Часовой пояс", "auto — по сети", { placeholder: "Europe/Berlin" }),
    text("locale.weather_city", "Город погоды"),
    h1("Клавиатура"),
    text("locale.layouts", "Раскладки", "Через запятую: de, ru, us", { list: true }),
    seg("locale.ru_variant", "Русская раскладка", null, [["", "ЙЦУКЕН"], ["phonetic", "ЯВЕРТЫ"]]),
    seg("locale.switch", "Переключение", null, [["alt_shift", "Alt+Shift"], ["super_space", "Super+Space"], ["caps", "Caps Lock"]]),
    toggle("locale.per_window_layout", "Раскладка для каждого окна"),
    num("keyboard.repeat_delay", "Задержка повтора, мс", null, { min: 150, max: 1000, step: 10 }),
    num("keyboard.repeat_rate", "Скорость повтора, /с", null, { min: 10, max: 80 }),
    h2("Тачпад"),
    toggle("touchpad.natural_scroll", "Естественная прокрутка"), toggle("touchpad.tap_to_click", "Касание = щелчок"),
    toggle("touchpad.disable_while_typing", "Выключать при наборе"),
    range("touchpad.speed", "Скорость", null, { min: -1, max: 1, step: 0.05, fmt: (v) => v.toFixed(2) }),
  ] },

  terminal: { title: "Терминал", icon: "terminal", build: () => {
    const prof = el("div");
    (async () => {
      const r = HY.bridge && HY.bridge.ptyProfiles ? await new Promise((res) => HY.bridge.ptyProfiles(res)) : null;
      let list = [];
      try { list = (JSON.parse(r || "{}").profiles) || []; } catch (e) { list = []; }
      prof.replaceChildren(list.length ? select("terminal.default_profile", "Профиль по умолчанию", "Оболочка новой вкладки",
        [["", "Авто (первый найденный)"], ...list.map((p) => [p.id, p.name])]) : text("terminal.default_profile", "Профиль по умолчанию",
        "pwsh, powershell, cmd, wsl:<дистрибутив>, gitbash (Linux: zsh, bash)"));
    })();
    return [h1("Терминал"), prof,
      note("Свои профили — в settings.toml: [[terminal.profiles]] id, name, command, cwd, env."),
      h2("Шрифт и вид"),
      text("terminal.font", "Шрифт", "Пусто — шрифт темы", { placeholder: "JetBrains Mono, Cascadia Mono" }),
      num("terminal.font_size", "Размер шрифта", "Ctrl+колесо, Ctrl+= / Ctrl+− / Ctrl+0", { min: 8, max: 32 }),
      range("terminal.line_height", "Межстрочный интервал", null, { min: 1, max: 1.6, step: 0.02, fmt: (v) => (+v).toFixed(2) }),
      toggle("terminal.ligatures", "Лигатуры"),
      seg("terminal.cursor_style", "Курсор", null, [["bar", "Черта"], ["block", "Блок"], ["underline", "Подчёркивание"]]),
      toggle("terminal.cursor_blink", "Мигающий курсор"),
      range("effects.crt_terminal", "CRT терминала", null), toggle("effects.terminal_art", "Фон «руки из кода»"),
      h2("История и звонок"),
      num("terminal.scrollback", "Строк истории", "1 000 – 100 000", { min: 1000, max: 100000, step: 1000 }),
      seg("terminal.bell", "Звонок (BEL)", null, [["visual", "Мигание"], ["sound", "Звук"], ["off", "Выкл"]]),
      h2("Буфер обмена и мышь"),
      toggle("terminal.copy_on_select", "Копировать при выделении"),
      toggle("terminal.ctrl_v_paste", "Ctrl+V — вставить", "Иначе Ctrl+V уходит в программу (^V)"),
      toggle("terminal.paste_warn", "Предупреждать о многострочной вставке"),
      seg("terminal.right_click", "Правая кнопка", null, [["menu", "Меню"], ["paste", "Вставить"], ["copy_paste", "Копировать/вставить"]]),
      h2("Вкладки и окно"),
      toggle("terminal.restore_tabs", "Восстанавливать вкладки при запуске"),
      toggle("terminal.confirm_close", "Спрашивать перед закрытием окна с работающими программами"),
      seg("terminal.close_on_exit", "Закрывать вкладку при выходе оболочки", null, [["graceful", "Если код 0"], ["always", "Всегда"], ["never", "Никогда"]]),
      seg("terminal.haotica_tab", "Где Haotica выполняет команды", "Своя вкладка «HAOTICA» или текущая", [["separate", "Своя вкладка"], ["active", "Текущая"]]),
      h2("Горячие клавиши"),
      note(KEYS_HELP),
      note("Переопределение: [terminal.keys] в settings.toml, например \"ctrl+shift+t\" = \"newTab\"."),
    ];
  } },

  haotica: { title: "Haotica", icon: "haotica", build: () => {
    const llm = el("div"), mods = el("div"), cloud = el("div");
    const loadLlm = async () => {
      const r = await HY.haotica("GET", "/api/llm/status").catch(() => null);
      llm.replaceChildren();
      if (!r || !r.ok) return llm.append(note(IS_WIN ? "Служба Haotica не отвечает (журнал: %LOCALAPPDATA%\\Haotica\\logs\\agent.log)" : "Служба Haotica не отвечает (systemctl --user status haotica-agent)", "s-err"));
      for (const role of ["base", "deep", "fast"]) {
        llm.append(el("div.s-row", el("b", role.toUpperCase()), el("span.nm", (r.labels || {})[role] || ""), pill(r.state[role]),
          role !== "fast" ? el("button.hy-btn.small" + (r.main === role ? ".primary" : ""), { onclick: async () => {
            await HY.haotica("POST", "/api/llm/use", { role }); HY.toast(`Переключаюсь на ${role}…`); setTimeout(loadLlm, 1500);
          } }, r.main === role ? "АКТИВНА" : "ЗАГРУЗИТЬ") : null));
      }
      llm.append(note(`Скорость: ${r.tps || 0} ток/с${r.switching ? " · переключение → " + r.switching : ""}${r.paused ? " · режим «Игра»" : ""}`));
    };
    const loadModels = async () => {
      const r = await HY.haotica("GET", "/api/models").catch(() => null) || await HY.get("/api/models");
      mods.replaceChildren();
      if (!r || !r.models) return mods.append(note("Нет данных о моделях", "s-err"));
      for (const [role, m] of Object.entries(r.models)) {
        const f = m.size ? m.have / m.size : 0;
        const meter = el("div.hy-meter", el("i", { style: { "--p": (f * 100).toFixed(1) + "%" } }));
        mods.append(el("div.s-row", el("b", role.toUpperCase()), el("span.nm", m.label), meter,
          el("span.meta", `${(m.have / 1e9).toFixed(1)}/${(m.size / 1e9).toFixed(1)} ГБ`),
          m.ready ? el("span.s-pill.ready", "ГОТОВА") : el("button.hy-btn.small", { onclick: async () => {
            await HY.haotica("POST", "/api/models/download", { role }); HY.toast("Загрузка начата в фоне");
          } }, f > 0 ? "ДОКАЧАТЬ" : "СКАЧАТЬ")));
      }
      const v = r.verify || {};
      mods.append(note(r.engine ? "llama-server: " + r.engine : "llama-server не установлен", r.engine ? "" : "s-err"),
        el("div.s-actions", el("button.hy-btn.small", { onclick: async () => { await HY.haotica("POST", "/api/models/download", {}); HY.toast("Загрузка всех моделей начата"); } }, icon("download", 14), " Скачать все"),
          el("button.hy-btn.small", { onclick: async () => { await HY.haotica("POST", "/api/models/verify", {}); HY.toast("Проверка SHA-256 идёт в фоне"); } }, icon("shield", 14), " Проверить SHA-256")),
        v.running ? note("Проверка идёт…") : v.ts ? note(v.ok ? "Проверка: всё в порядке" : "Проверка: есть ошибки\n" + (v.output || ""), v.ok ? "s-ok" : "s-err") : null);
    };
    const loadCloud = async () => {
      cloud.replaceChildren();
      const row = cloudKeyRow();
      cloud.append(field("Облачная модель и ключ", "Ключ — в " + (IS_WIN ? "Диспетчере учётных данных Windows" : "связке ключей системы") +
        ", не в файлах. Облако — только с разрешения (карточка CLOUD REQUEST)", row));
      if (HY.args && HY.args.includes("--focus-key")) setTimeout(() => row.focusKey(), 200);
      const led = await HY.haotica("GET", "/api/cloud/ledger?n=1").catch(() => null);
      const b = (led && led.budget) || {};
      cloud.append(note(`Потрачено: сегодня $${(b.day || 0).toFixed(3)} / $${b.limit_day ?? "—"}, месяц $${(b.month || 0).toFixed(3)} / $${b.limit_month ?? "—"}, помощники сегодня $${(b.helpers_day || 0).toFixed(3)}`));
    };
    every(4000, loadLlm); loadModels(); timers.push(setInterval(loadModels, 5000)); loadCloud();
    return [h1("Haotica"),
      toggle("haotica.enabled", "Haotica включена"),
      seg("haotica.mode", "Режим", "Наблюдатель — только советы; второй пилот — изменения карточками; агент — безопасное сама",
        [["observer", "Наблюдатель"], ["copilot", "Второй пилот"], ["agent", "Агент"]]),
      seg("haotica.autonomy", "Автономия", null, [["none", "Нет"], ["readonly", "Чтение"], ["safe", "Безопасное"]]),
      note("Опасные команды подтверждаются всегда, независимо от режима."),
      h2("Модели"),
      seg("haotica.model_mode", "Выбор модели", "auto — Haotica сама берёт deep для больших задач", [["auto", "Авто"], ["base", "Base"], ["deep", "Deep"]]),
      select("haotica.context_size", "Контекст", "Больше — больше памяти", [[32768, "32K"], [65536, "64K"], [131072, "128K"], [262144, "256K"]]),
      num("haotica.deep_idle_min", "Возврат на base через, мин", null, { min: 1, max: 120 }),
      seg("haotica.speculative", "Спекулятивное декодирование", null, [["auto", "Авто"], ["draft", "Драфт"], ["ngram", "N-граммы"], ["none", "Нет"]]),
      llm, h2("Файлы моделей"), mods,
      h2("Характер"),
      range("haotica.directness", "Прямота"), range("haotica.humor", "Юмор"),
      seg("haotica.swearing", "Мат", null, [["off", "Нет"], ["moderate", "Умеренно"], ["free", "Свободно"]]),
      seg("haotica.proactive", "Сама подсказывает", null, [["never", "Никогда"], ["sometimes", "Иногда"], ["often", "Часто"]]),
      num("haotica.max_unprompted_per_hour", "Подсказок без спроса в час", null, { min: 0, max: 30 }),
      toggle("haotica.memory", "Память о владельце"),
      h2("Голос (Сара)"),
      toggle("haotica.voice", "Голос", "Отвечает вслух, кроме тихих часов и режима «Игра»"),
      seg("haotica.voice_backend", "Источник", "Свой — синтез на ноутбуке; при сбое — ElevenLabs, если есть ключ",
        [["local", "Свой"], ["elevenlabs", "ElevenLabs"], ["lines", "Только реплики"]]),
      seg("haotica.tts_engine", "Движок", "Локальная модель речи голосом Сары; выбрана слепым прослушиванием (samples/tts)",
        [["auto", "Авто"], ["chatterbox", "Chatterbox"], ["xtts", "XTTS"], ["qwen3", "Qwen3-TTS"], ["f5", "F5"], ["silero", "Silero"], ["piper", "Piper"]]),
      field("Облачный голос", "Запасной вариант, если локальный синтез недоступен", elevenKeyRow()),
      range("haotica.voice_speed", "Скорость речи", null, { min: 0.7, max: 1.4, step: 0.05, fmt: (v) => v.toFixed(2) + "×" }),
      el("div.s-actions",
        el("button.hy-btn.small", { onclick: async () => {
          HY.toast("Говорю…");
          const r = await HY.haotica("POST", "/api/voice/test", {}).catch(() => null);
          HY.toast(r && r.played ? `Голос: ${r.engine || "?"}` : "Голос не прозвучал: служба haotica-tts не запущена и нет ключа ElevenLabs", r && r.played ? "" : "err", [], 7000);
        } }, icon("volume", 14), " Проверить голос"),
        el("button.hy-btn.small", { onclick: () => HY.haotica("POST", "/api/voice/restart", {}).then((x) => HY.toast(x && x.ok ? "Служба голоса перезапущена (модель грузится до минуты)" : (x && x.error) || "Ошибка", x && x.ok ? "" : "err")) }, icon("reboot", 14), " Перезапустить голос")),
      text("haotica.folders_allowed", "Доступ к папкам", "Через запятую", { list: true }),
      text("haotica.folders_denied", "Закрытые папки", "~/.ssh, ключи и банковский профиль закрыты всегда", { list: true }),
      h2("Облако (OpenRouter)"),
      toggle("cloud.enabled", "Облачные модели"), cloud,
      seg("cloud.effort", "Усилие рассуждений", null, [["off", "Выкл"], ["low", "Низкое"], ["medium", "Среднее"], ["high", "Высокое"]]),
      num("cloud.budget_request_usd", "Лимит на запрос, $", null, { min: 0, max: 10, step: 0.05 }),
      num("cloud.budget_day_usd", "Лимит в день, $", null, { min: 0, max: 100, step: 0.5 }),
      num("cloud.budget_month_usd", "Лимит в месяц, $", null, { min: 0, max: 1000, step: 1 }),
      h2("Помощники (поиск публичной информации)"),
      toggle("cloud.helpers_enabled", "Помощники без карточки", "Только публичные задачи без личных данных"),
      text("cloud.helper_fast", "Быстрый помощник"), text("cloud.helper_careful", "Аккуратный помощник"),
      num("cloud.helpers_task_usd", "Лимит на задачу, $", null, { min: 0, max: 1, step: 0.01 }),
      num("cloud.helpers_day_usd", "Лимит помощников в день, $", null, { min: 0, max: 20, step: 0.1 }),
      num("cloud.helpers_per_hour", "Запросов помощников в час", null, { min: 0, max: 200 })];
  } },

  apps: { title: "Приложения", icon: "store", build: () => {
    const box = el("div");
    HY.get("/api/apps").then((r) => {
      const all = ((r && r.apps) || []).filter((a) => !a.hidden || a.kde_fallback);
      const pick = (key, label, filter) => {
        const opts = all.filter(filter).map((a) => [a.id + ".desktop", a.name]);
        const cur = get(key);
        if (cur && !opts.find((o) => o[0] === cur)) opts.unshift([cur, cur]);
        return select(key, label, null, opts);
      };
      const has = (cats) => (a) => cats.some((c) => (a.categories || []).includes(c));
      box.append(pick("apps.browser", "Браузер", has(["WebBrowser"])), pick("apps.terminal", "Терминал", has(["TerminalEmulator"])),
        pick("apps.files", "Файлы", has(["FileManager"])), pick("apps.editor", "Редактор", has(["TextEditor", "Development"])),
        pick("apps.viewer", "Просмотр изображений", has(["Viewer", "Graphics"])), pick("apps.player", "Плеер", has(["AudioVideo", "Video", "Player"])));
    });
    return [h1("Приложения"), toggle("apps.show_kde", "Показывать приложения KDE", "Запасные программы (Dolphin, Okular, Gwenview, Kate), пока своих нет"),
      h2("По умолчанию"), box];
  } },

  about: { title: "О системе", icon: "shield", build: () => {
    const info = el("div.s-kv"), svc = el("div"), ag = el("div");
    HY.get("/api/sys/info").then((r) => {
      const i = (r && r.info) || {};
      for (const [k, v] of Object.entries(i)) info.append(el("span", k), el("span", typeof v === "object" ? JSON.stringify(v) : String(v)));
    });
    const loadSvc = async () => {
      const r = await HY.get("/api/sys/services");
      svc.replaceChildren();
      for (const u of (r && r.units) || []) {
        svc.append(el("div.s-row", el("span.nm", u.unit), el("span.meta", u.description || ""), pill(u.active),
          el("button.hy-btn.ghost.icon.small", { title: "Перезапустить", onclick: async () => {
            const x = await HY.post("/api/sys/service", { unit: u.unit, action: "restart" });
            HY.toast(x.ok ? "Перезапущено" : x.error || "Ошибка", x.ok ? "" : "err"); loadSvc();
          } }, icon("reboot", 14))));
      }
      if (!svc.children.length) svc.append(note("systemd недоступен"));
    };
    HY.haotica("GET", "/api/status").then((s) => {
      ag.append(s && s.ok ? note(`Haotica: ${s.state} · модель ${s.llm_model} (${s.llm_state}) · облако ${s.cloud.key ? "ключ есть" : "без ключа"} · голос ${s.voice ? "есть" : "нет"}`, "s-ok")
        : note("Haotica не отвечает на 127.0.0.1:47810", "s-err"));
    }).catch(() => ag.append(note("Haotica не отвечает на 127.0.0.1:47810", "s-err")));
    loadSvc();
    return [h1("О системе"), info, h2("Проверка (doctor)"), ag, svc,
      el("div.s-actions",
        el("button.hy-btn.small", { onclick: loadSvc }, icon("reboot", 14), " Обновить"),
        el("button.hy-btn.small", { onclick: async () => { const r = await HY.post("/api/diag", {}); HY.toast(r.ok ? "Отчёт: " + r.file : r.error || "Ошибка", r.ok ? "" : "err", [], 9000); } }, icon("doc", 14), " Отчёт для диагностики"),
        el("button.hy-btn.small", { onclick: () => HY.openApp("terminal", ["--run", "haotica doctor"]) }, icon("terminal", 14), " haotica doctor"))];
  } },
};

// ── навигация и поиск ───────────────────────────────────────────
function render(name) {
  timers.forEach(clearInterval); timers = [];
  current = name;
  document.querySelectorAll("#nav .item").forEach((i) => i.classList.toggle("on", i.dataset.p === name));
  const page = $("page");
  page.replaceChildren(...PAGES[name].build());
  page.scrollTop = 0;
  HY.sub(PAGES[name].title);
  try { localStorage.setItem("settings.page", name); } catch (e) { /* нет хранилища */ }
}
const LINUX_PAGES = new Set(["display", "sound", "network", "power", "apps"]);   // на Windows — системные настройки Windows
if (IS_WIN) for (const k of LINUX_PAGES) delete PAGES[k];
for (const [k, p] of Object.entries(PAGES)) {
  $("nav").append(el("div.item", { "data-p": k, onclick: () => render(k) }, icon(p.icon, 16), p.title));
}
const find = el("input.hy-input", { placeholder: "Поиск настройки…" });
document.querySelector(".s-find").append(icon("search", 14), find);
find.addEventListener("input", HY.debounce(() => {
  const q = find.value.trim().toLowerCase();
  document.querySelectorAll("#page .hy-field, #page .s-row").forEach((f) => { f.style.display = !q || f.textContent.toLowerCase().includes(q) ? "" : "none"; });
}, 150));
HY.on("settings-applied", () => {}); // значения подтягиваются при открытии страницы
const argPage = HY.args && (HY.args.indexOf("--page") >= 0 ? HY.args[HY.args.indexOf("--page") + 1] : HY.args[0]);
const want = argPage || (() => { try { return localStorage.getItem("settings.page"); } catch (e) { return null; } })();
render(PAGES[want] ? want : IS_WIN ? "terminal" : "appearance");
