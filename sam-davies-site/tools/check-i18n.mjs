// Fails on: key missing in a language, key unknown to the others, wrong namespace, placeholder
// mismatch ({n}), plural {one,other} shape mismatch, incomplete {en,es,ca} values in generated data.
// Warns when an ES/CA string equals the EN one (likely untranslated) unless whitelisted.
// Usage: node tools/check-i18n.mjs
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, SITE, readJSON } from './lib.mjs';

const config = await readJSON(path.join(SITE, 'site.config.json'));
const LANGS = config.i18n.languages;
const errors = [];
const warnings = [];
// Proper nouns / language names / brand-like strings that are legitimately identical.
const SAME_OK = new Set([
  'core.lang.name.en', 'core.lang.name.es', 'core.lang.name.ca',
  ...((await readJSON(path.join(ROOT, 'tools/i18n-whitelist.json')).catch(() => [])) || []),
]);

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const shape = (v) => (v && typeof v === 'object' ? `plural(${Object.keys(v).sort().join(',')})` : typeof v);
const forms = (v) => (v && typeof v === 'object' ? Object.values(v) : [v]);

for (const kind of ['core', 'ui']) {
  const dicts = {};
  for (const l of LANGS) {
    try { dicts[l] = await readJSON(path.join(SITE, 'i18n', `${kind}.${l}.json`)); }
    catch (e) { errors.push(`${kind}.${l}.json: cannot read (${e.message})`); dicts[l] = {}; }
  }
  const all = new Set(LANGS.flatMap((l) => Object.keys(dicts[l])));
  for (const key of all) {
    if (!key.startsWith(`${kind}.`)) errors.push(`${kind}: key "${key}" must start with "${kind}."`);
    const present = LANGS.filter((l) => key in dicts[l]);
    for (const l of LANGS) if (!(key in dicts[l])) errors.push(`${kind}.${l}: missing "${key}" (present in ${present.join(', ')})`);
    if (present.length !== LANGS.length) continue;
    const ref = dicts.en?.[key] ?? dicts[present[0]][key];
    for (const l of LANGS) {
      const v = dicts[l][key];
      if (shape(v) !== shape(ref)) { errors.push(`${kind}.${l}: "${key}" shape ${shape(v)} ≠ en ${shape(ref)}`); continue; }
      if (v && typeof v === 'object') {
        for (const f of Object.keys(ref)) if (placeholders(v[f]) !== placeholders(ref[f])) errors.push(`${kind}.${l}: "${key}.${f}" placeholders {${placeholders(v[f])}} ≠ en {${placeholders(ref[f])}}`);
        if (!('other' in v)) errors.push(`${kind}.${l}: plural "${key}" needs an "other" form`);
      } else if (placeholders(v) !== placeholders(ref)) errors.push(`${kind}.${l}: "${key}" placeholders {${placeholders(v)}} ≠ en {${placeholders(ref)}}`);
      if (l !== 'en' && !SAME_OK.has(key) && JSON.stringify(v) === JSON.stringify(ref) && forms(v).some((s) => /\p{L}{3,}/u.test(String(s)))) {
        warnings.push(`${kind}.${l}: "${key}" equals EN — untranslated?`);
      }
    }
  }
}

// Generated data: every {en,es,ca} value complete, no unfilled placeholders.
function walk(v, where) {
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`));
  if (!v || typeof v !== 'object') return;
  const keys = Object.keys(v);
  if (keys.includes('en') && keys.every((k) => LANGS.includes(k) || k === 'en')) {
    for (const l of LANGS) {
      if (typeof v[l] !== 'string' || !v[l]) errors.push(`${where}: missing ${l}`);
      else if (/\{\w+\}/.test(v[l])) errors.push(`${where}.${l}: unfilled placeholder in "${v[l]}"`);
    }
    return;
  }
  for (const k of keys) walk(v[k], `${where}.${k}`);
}
for (const f of (await readdir(path.join(SITE, 'data'))).filter((f) => f.endsWith('.json'))) walk(await readJSON(path.join(SITE, 'data', f)), f);

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`check-i18n: ${errors.length} error(s), ${warnings.length} warning(s) — languages ${LANGS.join('/')}`);
if (errors.length) process.exit(1);
