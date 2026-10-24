#!/usr/bin/env node
/* ==========================================================================
   Скачивание сканов карточек и логотипов наборов (ключи не нужны).

   node scripts/fetch-card-images.mjs                  все наборы (≈20 000 карт)
   node scripts/fetch-card-images.mjs sv3pt5 base1     только указанные наборы
   node scripts/fetch-card-images.mjs --large          крупные сканы (тяжелее в ~10 раз)
   node scripts/fetch-card-images.mjs --logos          только логотипы наборов
   node scripts/fetch-card-images.mjs --report         показать, каких сканов не хватает
   node scripts/fetch-card-images.mjs --no-fallback    не искать недостающее в других источниках

   Для каждой карты источники пробуются по очереди, пока один не отдаст картинку:
     1. images.pokemontcg.io  — ссылки из базы pokemon-tcg-data
     2. images.scrydex.com    — CDN-преемник pokemontcg.io
     3. TCGdex (API)          — assets.tcgdex.net; набор находится по тому же id,
                                по варианту id (sv3pt5 → sv03.5) или по названию и числу карт
   Недостающее при каждом запуске пробуется заново, поэтому скрипт можно запускать повторно.
   Карты, для которых картинки нет нигде, сайт рисует сам (с официальным артом покемона).

   Результат:
     assets/cards/<набор>/<номер>.png, assets/sets/<набор>.png
     data/tcg/images.js — что скачано и чего нет (сайт читает его сам)
   Нужен Node.js 18+. Переменные окружения (необязательно): TCGDEX_API, SCRYDEX_IMG.
   ========================================================================== */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const LARGE = args.includes('--large');
const LOGOS_ONLY = args.includes('--logos');
const REPORT = args.includes('--report');
const NO_FALLBACK = args.includes('--no-fallback');
const only = args.filter((a) => !a.startsWith('--'));
const CONCURRENCY = 8;
const TCGDEX = (process.env.TCGDEX_API || 'https://api.tcgdex.net/v2').replace(/\/$/, '');
const SCRYDEX = (process.env.SCRYDEX_IMG || 'https://images.scrydex.com/pokemon').replace(/\/$/, '');

const safe = (s) => String(s).replace(/[^a-z0-9_-]/gi, '_');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normLocal = (s) => String(s).toLowerCase().replace(/^0+(?=\d)/, '');
const normName = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/pok[eé]mon|tcg|trading card game/g, '').replace(/[^a-z0-9]+/g, '');

async function fetchBuf(url) {
  if (!url) return null;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > 200 ? buf : null;
    } catch {
      if (i === 3) return null;
      await sleep(600 * i);
    }
  }
  return null;
}
async function getJSON(url) {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'pokelore-fan-wiki' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch {
      if (i === 3) return null;
      await sleep(600 * i);
    }
  }
  return null;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } }));
}

/* ---------- состояние (data/tcg/images.js) ---------- */
async function readJSVar(file, name) {
  try {
    const txt = await fs.readFile(path.join(ROOT, file), 'utf8');
    const m = txt.match(new RegExp(name.replace('.', '\\.') + ' = ([\\s\\S]*?);\\s*$'));
    return m ? JSON.parse(m[1]) : null;
  } catch { return null; }
}
async function readState() {
  const v = (await readJSVar('data/tcg/images.js', 'PL.tcgImages')) || {};
  return { sets: v.sets || {}, logos: v.logos || {}, miss: v.miss || {} };
}
async function writeState(state) {
  await fs.writeFile(path.join(ROOT, 'data/tcg/images.js'),
    '/* Какие сканы карточек уже скачаны и каких нет (обновляет scripts/fetch-card-images.mjs). */\nwindow.PL = window.PL || {};\nPL.tcgImages = ' + JSON.stringify(state) + ';\n');
}

/* ---------- поиск набора в TCGdex ---------- */
let tcgdexList = null;
const tcgdexCache = new Map();

function candidateIds(id) {
  const out = [id];
  let m;
  if ((m = id.match(/^(sv|me)(\d+)(?:pt(\d+))?$/))) out.push(m[1] + m[2].padStart(2, '0') + (m[3] ? '.' + m[3] : ''));   // sv3pt5 → sv03.5, me1 → me01
  if ((m = id.match(/^([a-z]+\d+)pt(\d+)/))) out.push(m[1] + '.' + m[2]);                                                // swsh12pt5 → swsh12.5
  if ((m = id.match(/^([a-z]+)(\d+)5$/)) && m[2]) out.push(m[1] + m[2] + '.5');                                           // sm115 → sm11.5, swsh45 → swsh4.5
  return [...new Set(out)];
}
function plausible(d, ours) {
  const name = d.name || '';
  if (normName(name) === normName(ours.n)) return true;
  const c = d.cardCount || {};
  return (ours.pt && c.official === ours.pt) || (ours.c && c.total === ours.c) || (ours.c && c.official === ours.c);
}
async function tcgdexSet(ours) {
  if (tcgdexCache.has(ours.id)) return tcgdexCache.get(ours.id);
  let found = null;
  for (const cid of candidateIds(ours.id)) {
    const d = await getJSON(`${TCGDEX}/en/sets/${encodeURIComponent(cid)}`);
    if (d && d.cards && plausible(d, ours)) { found = d; break; }
  }
  if (!found) {
    if (!tcgdexList) tcgdexList = (await getJSON(`${TCGDEX}/en/sets`)) || [];
    const nn = normName(ours.n);
    const byName = tcgdexList.filter((s) => normName(s.name) === nn);
    const byCount = tcgdexList.filter((s) => ours.pt && s.cardCount?.official === ours.pt && (normName(s.name).includes(nn) || nn.includes(normName(s.name))));
    for (const s of [...byName, ...byCount]) {
      const d = await getJSON(`${TCGDEX}/en/sets/${encodeURIComponent(s.id)}`);
      if (d && d.cards) { found = d; break; }
    }
  }
  const map = found ? new Map(found.cards.filter((c) => c.image).map((c) => [normLocal(c.localId), c.image])) : null;
  tcgdexCache.set(ours.id, map);
  return map;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'data/tcg/images-manifest.json'), 'utf8'));
  const setsMeta = (await readJSVar('data/tcg/sets.js', 'PL.tcgSets')) || [];
  const meta = Object.fromEntries(setsMeta.map((s) => [s.id, s]));
  const state = await readState();
  const ids = Object.keys(manifest).filter((id) => !only.length || only.includes(id));
  if (!ids.length) return console.log('Наборы не найдены. Пример: node scripts/fetch-card-images.mjs sv3pt5');

  if (REPORT) {
    const rows = Object.entries(state.miss).filter(([id]) => ids.includes(id)).map(([id, l]) => [id, l.length, manifest[id]?.cards.length || 0]).sort((a, b) => b[1] - a[1]);
    const none = ids.filter((id) => !state.sets[id]);
    console.log(`Наборов без единого скана: ${none.length}${none.length ? ' (' + none.slice(0, 20).join(', ') + (none.length > 20 ? '…' : '') + ')' : ''}`);
    console.log(`Наборов с недостающими сканами: ${rows.length}, карт без скана: ${rows.reduce((a, r) => a + r[1], 0)}\n`);
    rows.slice(0, 40).forEach(([id, n, t]) => console.log(`  ${id.padEnd(14)} нет ${String(n).padStart(3)} из ${t}   ${meta[id]?.n || ''}`));
    return console.log('\nЧтобы попробовать докачать: node scripts/fetch-card-images.mjs');
  }

  await fs.mkdir(path.join(ROOT, 'assets/sets'), { recursive: true });
  let logos = 0;
  await pool(ids, CONCURRENCY, async (id) => {
    const file = path.join(ROOT, 'assets/sets', id + '.png');
    const buf = existsSync(file) ? true : await fetchBuf(manifest[id].logo);
    if (buf === true || (buf && (await fs.writeFile(file, buf), true))) { state.logos[id] = 1; logos++; }
  });
  await writeState(state);
  console.log(`Логотипы наборов: ${logos}/${ids.length}`);
  if (LOGOS_ONLY) return;

  const totalCards = ids.reduce((a, id) => a + manifest[id].cards.length, 0);
  let done = 0, missTotal = 0;
  const started = Date.now();
  for (const id of ids) {
    const dir = path.join(ROOT, 'assets/cards', id);
    await fs.mkdir(dir, { recursive: true });
    const cards = manifest[id].cards;
    const stat = { have: 0, src: 0, scry: 0, tcgdex: 0 };
    const todo = [];
    const localOf = (cardId) => cardId.slice(cardId.indexOf('-') + 1);

    await pool(cards, CONCURRENCY, async ([cardId, small, large]) => {
      const local = localOf(cardId);
      const file = path.join(dir, safe(local) + '.png');
      if (existsSync(file)) { stat.have++; return; }
      let buf = await fetchBuf(LARGE ? (large || small) : (small || large));
      if (buf) stat.src++;
      else if (!NO_FALLBACK && (buf = await fetchBuf(`${SCRYDEX}/${cardId}/${LARGE ? 'large' : 'small'}`))) stat.scry++;
      if (buf) await fs.writeFile(file, buf); else todo.push([cardId, local]);
    });

    let missing = todo;
    if (todo.length && !NO_FALLBACK && meta[id]) {
      const map = await tcgdexSet(meta[id]);
      if (map) {
        const still = [];
        await pool(todo, CONCURRENCY, async ([cardId, local]) => {
          const base = map.get(normLocal(local));
          const buf = base && (await fetchBuf(`${base}/${LARGE ? 'high' : 'low'}.png`));
          if (buf) { await fs.writeFile(path.join(dir, safe(local) + '.png'), buf); stat.tcgdex++; }
          else still.push([cardId, local]);
        });
        missing = still;
      }
    }

    const got = cards.length - missing.length;
    if (got) state.sets[id] = LARGE ? 'large' : 'small'; else delete state.sets[id];
    if (missing.length && got) state.miss[id] = missing.map(([, l]) => l); else delete state.miss[id];
    missTotal += missing.length;
    done += cards.length;
    await writeState(state);
    const sec = (Date.now() - started) / 1000;
    const eta = Math.round((sec / Math.max(1, done)) * (totalCards - done) / 60);
    const extra = (stat.scry ? ` +${stat.scry} Scrydex` : '') + (stat.tcgdex ? ` +${stat.tcgdex} TCGdex` : '');
    console.log(`${missing.length ? '△' : '✓'} ${id.padEnd(14)} ${got}/${cards.length}${extra}${missing.length ? '   нет сканов: ' + missing.length : ''}   всего ${done}/${totalCards}   ~${eta} мин`);
  }
  console.log(`\nГотово. Карт со сканом: ${done - missTotal} из ${done}. Без скана: ${missTotal} (сайт нарисует их сам).`);
  if (missTotal) console.log('Список недостающего: node scripts/fetch-card-images.mjs --report');
}
main().catch((e) => { console.error('Ошибка:', e.message || e); process.exit(1); });
