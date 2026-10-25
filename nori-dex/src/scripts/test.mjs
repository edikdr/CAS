#!/usr/bin/env node
/* Tiny tests for the pure logic (no browser, no dependencies):  npm test
 *
 * Loads the browser scripts into a sandbox and checks them with a fixed "now". Because date math is
 * the classic place for time-zone bugs, the whole file re-runs itself under several TZ values,
 * including zones where 25 Oct 2026 is a 25-hour daylight-saving day.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZONES = ['Europe/Madrid', 'Europe/London', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Auckland', 'UTC'];

if (!process.env.NORI_TZ_CHILD) {
  let failed = 0;
  for (const tz of ZONES) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: tz, NORI_TZ_CHILD: '1' }, encoding: 'utf8' });
    process.stdout.write(r.stdout.replace(/^/gm, '  '));
    if (r.status) { failed++; process.stderr.write(r.stderr); }
  }
  console.log(failed ? `\n${failed} time zone(s) failed` : `\nall tests passed in ${ZONES.length} time zones`);
  process.exit(failed ? 1 : 0);
}

/* ---------- sandbox ---------- */
function load(files) {
  const ctx = { console, _: (s) => s, _n: (n, s) => s.split('|')[n === 1 ? 0 : 1] };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.PL;
}
const PL = load(['js/hub.js']);
const at = (y, m, d, h = 12, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s);   // local time, like the visitor's clock
const plain = (x) => JSON.parse(JSON.stringify(x));   // arrays made inside the vm sandbox have another realm's prototype
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* ---------- countdown ---------- */
const END = '2026-11-12';
test('25 Oct is 18 days before 12 Nov (any hour of the day)', () => {
  for (const [h, m] of [[0, 0], [0, 30], [1, 30], [2, 30], [12, 0], [23, 59]]) assert.equal(PL.hub.daysLeft(END, at(2026, 10, 25, h, m)), 18, `${h}:${m}`);
});
test('the day before is 19, the day after is 17', () => {
  assert.equal(PL.hub.daysLeft(END, at(2026, 10, 24, 23, 59)), 19);
  assert.equal(PL.hub.daysLeft(END, at(2026, 10, 26, 0, 1)), 17);
});
test('last day is 0 (shown as "last day"), the next day is negative (hidden)', () => {
  assert.equal(PL.hub.daysLeft(END, at(2026, 11, 12, 0, 0)), 0);
  assert.equal(PL.hub.daysLeft(END, at(2026, 11, 12, 23, 59, 59)), 0);
  assert.equal(PL.hub.daysLeft(END, at(2026, 11, 13, 0, 0, 1)), -1);
});
test('daylight-saving days do not add or drop a day', () => {
  assert.equal(PL.hub.daysLeft('2026-10-26', at(2026, 10, 25, 0, 30)), 1);   // 25 Oct: clocks go back in Europe
  assert.equal(PL.hub.daysLeft('2026-11-02', at(2026, 11, 1, 0, 30)), 1);    // 1 Nov: clocks go back in the US
  assert.equal(PL.hub.daysLeft('2026-03-30', at(2026, 3, 29, 0, 30)), 1);    // 29 Mar: clocks go forward in Europe
  assert.equal(PL.hub.daysLeft('2027-01-01', at(2026, 10, 25, 12)), 68);
});
test('a missing or malformed date gives null', () => {
  for (const bad of [undefined, null, '', 'soon', '2026-13', '12/11/2026']) assert.equal(PL.hub.daysLeft(bad, at(2026, 10, 25)), null, String(bad));
});
test('formatting', () => {
  assert.equal(PL.hub.fmtDate(END), '12 Nov 2026');
  assert.equal(PL.hub.fmtDate('2026-01-05'), '5 Jan 2026');
  assert.equal(PL.hub.fmtNum(15000), '15,000');
  assert.equal(PL.hub.fmtNum(999), '999');
});

/* ---------- data contract (data/sky.js) ---------- */
const SKY = load(['data/sky.js']).sky;
const assetPaths = (o, out = []) => { if (typeof o === 'string') { if (/^assets\//.test(o)) out.push(o); } else if (o && typeof o === 'object') Object.values(o).forEach((v) => assetPaths(v, out)); return out; };
test('sky.js: under 20 KB, and every image path exists', () => {
  assert.ok(fs.statSync(path.join(ROOT, 'data/sky.js')).size < 20 * 1024);
  for (const p of assetPaths(SKY)) assert.ok(fs.existsSync(path.join(ROOT, p)), p);
});
test('sky.js: Kael is the hero, not a Nori; five Noris with the contract fields', () => {
  assert.equal(SKY.hero.id, 'kael');
  assert.deepEqual(plain(SKY.noris.map((n) => n.id)), ['zer', 'saltu', 'corivel', 'denal', 'garnia']);
  for (const n of SKY.noris) {
    assert.ok(n.name && n.appearance && n.art && n.art.regular, n.id);
    assert.ok('alternate' in n.art, n.id + ' needs art.alternate (null until the studio sends it)');
    assert.ok(n.snapshot && n.snapshot.lv > 0 && n.snapshot.hp > 0, n.id + ' snapshot');
    assert.equal(typeof n.verified, 'boolean');
  }
});
test('sky.js: six generic, unverified type slots; no Nori has a type yet', () => {
  assert.equal(SKY.types.length, 6);
  for (const t of SKY.types) assert.equal(t.verified, false, t.id);
  for (const n of SKY.noris) if (n.type !== null) assert.ok(SKY.types.some((t) => t.id === n.type && t.verified), n.id + ' has an unconfirmed type');
});
test('sky.js: four planes in order; only the Abyssal Plane name is confirmed', () => {
  assert.deepEqual(plain(SKY.planes.map((p) => p.order)), [1, 2, 3, 4]);
  assert.deepEqual(plain(SKY.planes.map((p) => p.nameStatus)), ['working', 'working', 'working', 'confirmed']);
  assert.equal(SKY.planes[3].name, 'Abyssal Plane');
});
test('sky.js: every fact has a source; campaign dates are valid and ordered', () => {
  for (const [k, f] of Object.entries(SKY.facts)) assert.ok(f.text && f.source, k);
  assert.ok(PL.hub.daysLeft(SKY.campaign.endsOn, new Date(2026, 9, 25)) !== null);
  assert.ok(SKY.campaign.startsOn < SKY.campaign.endsOn);
});

/* ---------- Spirit Quiz (js/quiz-data.js) ---------- */
const QZ = load(['js/quiz-data.js']).quizData;
test('quiz: 3 questions with 4 options each; every weight names a real Nori', () => {
  assert.equal(QZ.questions.length, 3);
  const ids = SKY.noris.map((n) => n.id);
  assert.deepEqual(plain(QZ.order).sort(), plain(ids).sort());
  for (const q of QZ.questions) {
    assert.equal(q.options.length, 4);
    for (const o of q.options) for (const id of Object.keys(o.w)) assert.ok(ids.includes(id), id);
  }
  for (const id of ids) assert.ok(QZ.match[id], id + ' needs a match line');
});
test('quiz: text is short enough for the phone dialog (question <= 50, option <= 28 characters)', () => {
  for (const q of QZ.questions) { assert.ok(q.q.length <= 50, q.q); for (const o of q.options) assert.ok(o.t.length <= 28, o.t); }
});
test('quiz: all 64 answer sets give one Nori, and every Nori can be the result', () => {
  const seen = {};
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    const r = QZ.outcome([a, b, c]);
    assert.ok(QZ.order.includes(r.winner), `${a}${b}${c}`);
    assert.equal(QZ.outcome([a, b, c]).winner, r.winner, 'same answers, same Nori');
    seen[r.winner] = (seen[r.winner] || 0) + 1;
  }
  assert.deepEqual(Object.keys(seen).sort(), plain(QZ.order).sort(), 'a Nori that can never win: ' + JSON.stringify(seen));
});
test('quiz: no Nori wins more than a third of all answer sets (the result stays a surprise)', () => {
  const seen = {};
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) { const w = QZ.outcome([a, b, c]).winner; seen[w] = (seen[w] || 0) + 1; }
  for (const [id, n] of Object.entries(seen)) assert.ok(n <= 21, `${id} wins ${n} of 64`);
});
test('quiz: a clear favourite wins (the same Nori three times)', () => {
  assert.equal(QZ.outcome([0, 0, 3]).winner, 'zer');         // zer 2+2+1 beats everyone
  assert.equal(QZ.outcome([3, 3, 3]).winner, 'garnia');
  assert.equal(QZ.outcome([1, 1, 0]).winner, 'saltu');
});

/* ---------- Spanish (js/i18n/es.js) ---------- */
const ES = (() => {
  let dict = null;
  const ctx = { PL: { i18n: { add: (l, d) => { if (l === 'es') dict = d; }, page() {} } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/i18n/es.js'), 'utf8'), ctx, { filename: 'js/i18n/es.js' });
  return plain(dict);
})();
const unq = (s) => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
/* every _('...') and _n(n, '...') in the code (the English text is the key) */
function codeKeys() {
  const files = [...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && !/^(i18n|shot-fonts)\.js$/.test(f)).map((f) => 'js/' + f), 'data/sky.js'];
  const keys = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/(?<![\w$.])_\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) keys.push({ f, key: unq(m[1] != null ? m[1] : m[2]), plural: false });
    for (const m of src.matchAll(/(?<![\w$.])_n\(\s*[^,()]+(?:\([^()]*\))?[^,()]*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) keys.push({ f, key: unq(m[1] != null ? m[1] : m[2]), plural: true });
  }
  return keys;
}
/* text that stays the same in every language: names, key labels, symbols */
const SAME = new Set(['NORI-DEX', 'ENTHARIEL GAMES', 'Enthariel Games', 'Nori-Dex']);
function pageKeys() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const out = new Set();
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  for (const m of html.matchAll(/>([^<>]+)</g)) { const t = norm(m[1]); if (/[A-Za-z]{2}/.test(t)) out.add(t); }
  for (const m of html.matchAll(/\s(?:aria-label|data-tip|alt|title)="([^"]*)"/g)) { const t = norm(m[1]); if (/[A-Za-z]{2}/.test(t)) out.add(t); }
  const d = /<meta name="description" content="([^"]*)"/.exec(html); if (d) out.add(norm(d[1]));
  const ti = /<title>([^<]*)<\/title>/.exec(html); if (ti) out.add(norm(ti[1]));
  return [...out].filter((t) => !SAME.has(t));
}
const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
test('es: every string in the code has a Spanish entry', () => {
  const miss = [...new Set(codeKeys().filter((k) => ES[k.key] == null).map((k) => `${k.f}: ${k.key}`))];
  assert.deepEqual(miss, [], `${miss.length} missing: ` + miss.slice(0, 6).join(' | '));
});
test('es: every static string of index.html has a Spanish entry', () => {
  const miss = pageKeys().filter((t) => ES[t] == null);
  assert.deepEqual(miss, [], `${miss.length} missing: ` + miss.slice(0, 6).join(' | '));
});
test('es: same {placeholders} and same number of plural forms as the English', () => {
  for (const [k, v] of Object.entries(ES)) {
    assert.equal(holes(v), holes(k), `placeholders differ: ${k}`);
  }
  for (const k of codeKeys().filter((x) => x.plural)) assert.equal(ES[k.key].split('|').length, k.key.split('|').length, `plural forms differ: ${k.key}`);
});
test('es: no entry is an unused leftover (every key is used in the code or the page)', () => {
  const used = new Set([...codeKeys().map((k) => k.key), ...pageKeys()]);
  const dead = Object.keys(ES).filter((k) => !used.has(k));
  assert.deepEqual(dead, [], 'unused: ' + dead.slice(0, 6).join(' | '));
});
test('es: Latin letters only, and the quiz still fits the phone dialog', () => {
  for (const v of Object.values(ES)) assert.ok(!/[\u0400-\u04FF]/.test(v), v);
  const tr = (key) => ES[key] != null ? ES[key] : key;
  const qz = (() => { const ctx = { _: tr }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/quiz-data.js'), 'utf8'), ctx); return ctx.PL.quizData; })();
  for (const q of qz.questions) { assert.ok(q.q.length <= 50, q.q); for (const o of q.options) assert.ok(o.t.length <= 28, `${o.t} (${o.t.length})`); }
});

/* ---------- run ---------- */
let bad = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { bad++; console.log(`FAIL ${name}\n     ${String(e.message).split('\n')[0]}`); process.exitCode = 1; }
}
console.log(`${process.env.TZ}: ${tests.length - bad}/${tests.length}`);
