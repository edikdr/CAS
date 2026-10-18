// SD.i18n — EN/ES/CA machinery (TZ §8A). Page copy lives in i18n/ui.*.json (UI layer);
// every string core shows lives in i18n/core.*.json. Switching is live: no reload, no scroll jump.
import { root, $$, emit, isDev, storage } from './util.js';

const STORE_KEY = 'sd.lang';

export function createI18n() {
  let config = { languages: ['en', 'es', 'ca'], default: 'en', detect: true };
  const dicts = {}; // lang → merged { "core.*": …, "ui.*": … }
  const warned = new Set();
  let started = false;

  const api = {
    lang: 'en',
    get languages() { return [...config.languages]; },
    t, tx, fmtDate, setLang,
    apply,
  };

  async function load(lang) {
    if (dicts[lang]) return dicts[lang];
    const get = (f) => fetch(`i18n/${f}.${lang}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const [core, ui] = await Promise.all([get('core'), get('ui')]);
    return (dicts[lang] = { ...core, ...ui });
  }

  function pick(entry, params) {
    if (entry && typeof entry === 'object') {
      const n = params?.n;
      const form = n === undefined ? 'other' : new Intl.PluralRules(api.lang).select(Number(n));
      return entry[form] ?? entry.other ?? Object.values(entry)[0];
    }
    return entry;
  }

  /** Plural-aware lookup: current lang → English → the key itself. */
  function t(key, params) {
    let s = pick(dicts[api.lang]?.[key], params);
    if (s === undefined) {
      s = pick(dicts.en?.[key], params);
      if (isDev() && !warned.has(key)) { warned.add(key); console.warn(`[i18n] missing ${api.lang}:${key}`); }
    }
    if (s === undefined) return key;
    return params ? String(s).replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m)) : String(s);
  }

  /** Data values are a plain string (titles, names — never translated) or {en,es,ca}. */
  function tx(value) {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    return value[api.lang] ?? value.en ?? Object.values(value)[0] ?? '';
  }

  /** "YYYY" → year; "YYYY-MM-DD" → Intl long date (UTC so dates never shift by a day). */
  function fmtDate(iso, opts) {
    if (!iso) return '';
    const s = String(iso);
    if (/^\d{4}$/.test(s)) return new Intl.DateTimeFormat(api.lang, { year: 'numeric', timeZone: 'UTC' }).format(new Date(`${s}-07-01T00:00:00Z`));
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    return new Intl.DateTimeFormat(api.lang, { timeZone: 'UTC', ...(opts || { dateStyle: 'long' }) }).format(d);
  }

  /** Apply data-i18n / data-i18n-attr / data-i18n-params bindings under `scope`. */
  function apply(scope = document) {
    const params = (el) => {
      const raw = el.getAttribute('data-i18n-params');
      if (!raw) return undefined;
      try { return JSON.parse(raw); } catch { return undefined; }
    };
    const els = scope.querySelectorAll ? [...(scope.matches?.('[data-i18n],[data-i18n-attr]') ? [scope] : []), ...scope.querySelectorAll('[data-i18n],[data-i18n-attr]')] : [];
    for (const el of els) {
      const p = params(el);
      const key = el.getAttribute('data-i18n');
      if (key) {
        const text = t(key, p);
        if (el.textContent !== text) el.textContent = text;
      }
      const attrs = el.getAttribute('data-i18n-attr');
      if (attrs) {
        for (const pair of attrs.split(';')) {
          const i = pair.indexOf(':');
          if (i < 1) continue;
          el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim(), p));
        }
      }
    }
  }

  function syncDocument() {
    root.lang = api.lang;
    root.dataset.lang = api.lang;
    const has = (k) => dicts[api.lang]?.[k] !== undefined || dicts.en?.[k] !== undefined;
    document.title = t(has('ui.meta.title') ? 'ui.meta.title' : 'core.meta.title');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t(has('ui.meta.description') ? 'ui.meta.description' : 'core.meta.description'));
    for (const b of $$('[data-lang-set]')) {
      const code = b.getAttribute('data-lang-set');
      b.setAttribute('aria-pressed', String(code === api.lang));
      b.setAttribute('aria-label', t(`core.lang.name.${code}`));
    }
  }

  async function setLang(code, { save = true } = {}) {
    code = String(code || '').toLowerCase();
    if (!config.languages.includes(code)) return api.lang;
    await Promise.all([load(code), load('en')]);
    const changed = code !== api.lang;
    api.lang = code;
    if (save) storage(STORE_KEY, code);
    // Keep a shareable ?lang= link in step, without adding history entries or dropping modal state.
    const url = new URL(location.href);
    if (url.searchParams.has('lang') && url.searchParams.get('lang') !== code) {
      url.searchParams.set('lang', code);
      history.replaceState(history.state, '', url);
    }
    syncDocument();
    apply();
    if (changed || !started) emit('i18n:change', { lang: code });
    started = true;
    return code;
  }

  /** ?lang= > saved choice > navigator.languages (primary subtag) > config default. */
  function detect() {
    const langs = config.languages;
    const q = new URLSearchParams(location.search).get('lang')?.toLowerCase();
    if (q && langs.includes(q)) return q;
    const saved = storage(STORE_KEY);
    if (saved && langs.includes(saved)) return saved;
    if (config.detect !== false) {
      for (const l of navigator.languages || [navigator.language]) {
        const primary = String(l).toLowerCase().split('-')[0];
        if (langs.includes(primary)) return primary;
      }
    }
    return langs.includes(config.default) ? config.default : langs[0];
  }

  api.init = async (cfg) => {
    config = { ...config, ...(cfg || {}) };
    const lang = detect();
    // Only a manual switch is remembered; a ?lang= link or browser default is not.
    await setLang(lang, { save: false });
    document.addEventListener('click', (e) => {
      const b = e.target.closest?.('[data-lang-set]');
      if (b) { e.preventDefault(); setLang(b.getAttribute('data-lang-set')); }
    });
    return api;
  };

  return api;
}
