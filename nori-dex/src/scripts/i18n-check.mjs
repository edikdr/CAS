#!/usr/bin/env node
/* Проверка перевода RU → EN.
 *   node scripts/i18n-check.mjs                 — все файлы
 *   node scripts/i18n-check.mjs sections tcg    — только перечисленные js/<имя>.js
 *   node scripts/i18n-check.mjs --keys > keys.json  — выписать все ключи _() / _n()
 *
 * 1) Каждая русская строка в коде должна быть внутри _('…') / _n(n, '…')
 *    (или на строке с комментарием // i18n-ok, если это не текст интерфейса).
 * 2) Каждый ключ _() должен быть в словаре js/en/*.js, а значение — без кириллицы
 *    и с теми же {плейсхолдерами}.
 * 3) Файлы-оверлеи (lore-ru, lore-more, quiz-data): английская копия имеет ту же структуру
 *    и числа, что и русская, а в строках нет кириллицы.
 * Нужен пакет acorn:  npm i -D acorn
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let acorn;
try { acorn = require('acorn'); } catch (e) { acorn = require(path.join(process.env.ACORN_DIR || '', 'acorn')); }

const CYR = /[А-Яа-яЁё]/;
const OVERLAYS = ['lore-ru', 'lore-more', 'quiz-data'];
const SKIP = new Set(['shot-fonts', 'i18n']);
const args = process.argv.slice(2);
const wantKeys = args.includes('--keys');
const only = args.filter(a => !a.startsWith('--'));

const jsDir = path.join(ROOT, 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))
  .filter(n => !SKIP.has(n) && !OVERLAYS.includes(n) && (!only.length || only.includes(n)));

/* ---------- 1) разбор кода ---------- */
function parse(src) {
  const comments = [];
  const ast = acorn.parse(src, { ecmaVersion: 2020, locations: true, onComment: comments });
  return { ast, comments };
}
function strOf(n) {   // значение строкового ключа (Literal / шаблон без ${} / a + b)
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis[0].value.cooked;
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const a = strOf(n.left), b = strOf(n.right);
    return a != null && b != null ? a + b : null;
  }
  return null;
}
function walk(node, parents, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parents);
  parents.push(node);
  for (const k in node) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && c.type && walk(c, parents, fn));
    else if (v && typeof v.type === 'string') walk(v, parents, fn);
  }
  parents.pop();
}
const isTr = (c) => c && c.type === 'CallExpression' && c.callee.type === 'Identifier' && (c.callee.name === '_' || c.callee.name === '_n');

const keys = {};      // key -> [файлы]
const problems = [];
for (const name of files) {
  const file = path.join(jsDir, name + '.js');
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let ast;
  try { ast = parse(src).ast; } catch (e) { problems.push(`${name}.js: синтаксическая ошибка: ${e.message}`); continue; }
  walk(ast, [], (n, parents) => {
    if (isTr(n)) {
      const arg = n.callee.name === '_' ? n.arguments[0] : n.arguments[1];
      const k = strOf(arg);
      if (k == null) problems.push(`${name}.js:${n.loc.start.line}: ключ ${n.callee.name}() должен быть строковым литералом`);
      else if (CYR.test(k)) (keys[k] = keys[k] || []).push(name);
      else if (n.callee.name === '_n') problems.push(`${name}.js:${n.loc.start.line}: _n() без русских форм: ${k}`);
      return;
    }
    let text = null;
    if (n.type === 'Literal' && typeof n.value === 'string') text = n.value;
    else if (n.type === 'TemplateElement') text = n.value.cooked;
    if (text == null || !CYR.test(text)) return;
    // внутри _()/_n() — уже обёрнуто
    for (let i = parents.length - 1; i >= 0; i--) if (isTr(parents[i])) return;
    const ln = n.loc.start.line;
    if (/i18n-ok/.test(lines[ln - 1])) return;
    problems.push(`${name}.js:${ln}: не обёрнуто в _(): ${JSON.stringify(text.length > 70 ? text.slice(0, 70) + '…' : text)}`);
  });
}

if (wantKeys) { console.log(JSON.stringify(keys, null, 1)); process.exit(0); }

/* ---------- 2) словари ---------- */
const enDir = path.join(jsDir, 'en');
const dict = {};
const dictFiles = fs.existsSync(enDir) ? fs.readdirSync(enDir).filter(f => f.endsWith('.js') && !OVERLAYS.includes(f.slice(0, -3)) && f !== 'dex.js') : [];
for (const f of dictFiles) {
  const sb = { window: { PL: {} }, console };
  sb.PL = sb.window.PL;
  sb.PL.i18n = { add(o) { for (const k in o) { if (k in dict && dict[k] !== o[k]) problems.push(`en/${f}: ключ уже задан иначе в другом словаре: ${k.slice(0, 50)}`); dict[k] = o[k]; sb.__n = (sb.__n || 0) + 1; } } };
  try { vm.runInNewContext(fs.readFileSync(path.join(enDir, f), 'utf8'), sb, { filename: f }); }
  catch (e) { problems.push(`en/${f}: ошибка выполнения: ${e.message}`); }
}
const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
for (const k of Object.keys(keys)) {
  if (!(k in dict)) { problems.push(`нет перевода (${[...new Set(keys[k])].join(',')}): ${JSON.stringify(k.length > 80 ? k.slice(0, 80) + '…' : k)}`); continue; }
  const v = dict[k];
  if (typeof v !== 'string') { problems.push(`перевод не строка: ${k.slice(0, 50)}`); continue; }
  if (CYR.test(v)) problems.push(`кириллица в переводе: ${JSON.stringify(k.slice(0, 50))} → ${JSON.stringify(v.slice(0, 50))}`);
  if (ph(k) !== ph(v)) problems.push(`не совпадают {плейсхолдеры}: ${JSON.stringify(k.slice(0, 50))} → ${JSON.stringify(v.slice(0, 50))}`);
  if (k.includes('|') && !/^\S[^]*\|/.test(v) && !v.includes('|')) problems.push(`_n: ожидается 'one|many': ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
}
/* статические тексты index.html (js/en/html.js) проверяются отдельно в тесте DOM */

/* ---------- 3) оверлеи ---------- */
function load(file, extra) {
  const sb = { window: { PL: {} }, console, location: { search: '' }, ...extra };
  sb.PL = sb.window.PL;
  sb.PL.dex = []; sb.PL.lang = 'x';
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sb, { filename: file });
  return sb.window.PL;
}
function shape(a, b, p, out) {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { out.push(`${p}: разные типы`); return; }
  if (Array.isArray(a)) {
    if (a.length !== b.length) { out.push(`${p}: длина ${a.length} ≠ ${b.length}`); return; }
    a.forEach((x, i) => shape(x, b[i], p + '[' + i + ']', out));
  } else if (a && typeof a === 'object') {
    const ka = Object.keys(a).sort().join(), kb = Object.keys(b).sort().join();
    if (ka !== kb) { out.push(`${p}: разные ключи {${ka}} ≠ {${kb}}`); return; }
    for (const k of Object.keys(a)) shape(a[k], b[k], p + '.' + k, out);
  } else if (typeof a === 'string') {
    if (CYR.test(b)) out.push(`${p}: кириллица в EN: ${b.slice(0, 40)}`);
    if (ph(a) !== ph(b)) out.push(`${p}: не совпадают {плейсхолдеры}: ${a.slice(0, 40)} → ${b.slice(0, 40)}`);
    if (a.length > 3 && a === b && CYR.test(a)) out.push(`${p}: не переведено`);
    if (!CYR.test(a) && a !== b) out.push(`${p}: нерусская строка изменена: ${a.slice(0, 30)} → ${b.slice(0, 30)}`);
  } else if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) out.push(`${p}: значение ${a} ≠ ${b}`);
}
for (const name of OVERLAYS) {
  if (only.length && !only.includes(name)) continue;
  const en = path.join(enDir, name + '.js');
  if (!fs.existsSync(en)) { problems.push(`нет js/en/${name}.js`); continue; }
  try {
    const A = load(path.join(jsDir, name + '.js')), B = load(en);
    const out = [];
    for (const k of Object.keys(A)) { if (k === 'dex') continue; if (!(k in B)) out.push(`PL.${k}: нет в EN`); else shape(A[k], B[k], 'PL.' + k, out); }
    out.slice(0, 40).forEach(o => problems.push(`overlay ${name}: ${o}`));
    if (out.length > 40) problems.push(`overlay ${name}: … и ещё ${out.length - 40}`);
  } catch (e) { problems.push(`overlay ${name}: ошибка: ${e.message}`); }
}

const nKeys = Object.keys(keys).length;
if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n✗ проблем: ${problems.length} (ключей _(): ${nKeys}, в словарях: ${Object.keys(dict).length})`);
  process.exit(1);
}
console.log(`✓ i18n: ключей _(): ${nKeys}, в словарях: ${Object.keys(dict).length}, оверлеи в порядке`);
