#!/usr/bin/env node
/* ==========================================================================
   Сборка данных сайта из открытых источников (ключи не нужны):
     • PokéAPI (CSV-дамп на GitHub)          — покедекс, типы, регионы, поколения, предметы
     • PokemonTCG/pokemon-tcg-data (GitHub)  — все наборы и карточки TCG (англ.)
     • npm-пакет «pokemon»                  — русские имена всех покемонов

   node scripts/build-data.mjs                лёгкая сборка (≈2 МБ): покедекс, индекс ВСЕХ карточек, наборы
   node scripts/build-data.mjs --cache-sets   + данные карточек каждого набора (≈10 МБ) — работа без интернета
   node scripts/build-data.mjs --cache-art    + официальные арты покемонов (≈100 МБ)
   node scripts/build-data.mjs --cache-items  + иконки предметов
   node scripts/build-data.mjs --manifest     + список ссылок на сканы (нужен fetch-card-images.mjs)
   node scripts/build-data.mjs --all          всё перечисленное

   Без этих флагов сайт сам берёт данные карточек, арты и сканы из интернета (jsDelivr /
   GitHub / CDN карточек / TCGdex) в момент просмотра и ничего не хранит в архиве.
   Результат — папка data/ (JS-файлы, сайт читает их без сервера). Нужен Node.js 18+.
   ========================================================================== */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com';
const CSV = `${RAW}/PokeAPI/pokeapi/master/data/v2/csv`;
const SPRITES = `${RAW}/PokeAPI/sprites/master/sprites`;
const TCG = `${RAW}/PokemonTCG/pokemon-tcg-data/master`;
const A = process.argv.slice(2);
const ALL = A.includes('--all');
const CACHE_SETS = ALL || A.includes('--cache-sets');
const CACHE_ART = ALL || A.includes('--cache-art');
const CACHE_ITEMS = ALL || A.includes('--cache-items');
const MANIFEST = ALL || A.includes('--manifest');
const EN = 9;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, as = 'text') {
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return as === 'buf' ? Buffer.from(await res.arrayBuffer()) : as === 'json' ? res.json() : res.text();
    } catch (e) {
      if (i === 4) throw new Error(url + ' — ' + e.message);
      await sleep(500 * i);
    }
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

/* CSV с кавычками и переводами строк внутри полей */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, k) => [h, r[k]])));
}
async function csv(name) {
  process.stdout.write(`  · ${name}.csv\n`);
  return parseCSV(await get(`${CSV}/${name}.csv`));
}
const clean = (s) => (s || '').replace(/[\f\n\r­]+/g, ' ').replace(/\s+/g, ' ').trim();

/* мини-распаковщик tar.gz (для npm-пакета с русскими именами) */
function untarFile(tgz, wanted) {
  const tar = zlib.gunzipSync(tgz);
  for (let off = 0; off + 512 <= tar.length;) {
    const name = tar.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(tar.toString('utf8', off + 124, off + 136).replace(/\0.*$/, '').trim() || '0', 8);
    if (name === wanted) return tar.subarray(off + 512, off + 512 + size).toString('utf8');
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

async function writeJS(rel, varExpr, data) {
  const file = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `/* Сгенерировано scripts/build-data.mjs — не редактируй вручную. */\nwindow.PL = window.PL || {};\n${varExpr} = ${JSON.stringify(data)};\n`);
}

/* ------------------------------------------------------------------ */
async function buildDex() {
  console.log('Покедекс (PokéAPI)…');
  const [species, names, flavor, pokemon, ptypes, pstats, pabil, abilNames, gens] = await Promise.all([
    csv('pokemon_species'), csv('pokemon_species_names'), csv('pokemon_species_flavor_text'), csv('pokemon'),
    csv('pokemon_types'), csv('pokemon_stats'), csv('pokemon_abilities'), csv('ability_names'), csv('generations'),
  ]);
  console.log('  · русские имена (npm: pokemon)');
  const meta = await get('https://registry.npmjs.org/pokemon/latest', 'json');
  const ru = JSON.parse(untarFile(await get(meta.dist.tarball, 'buf'), 'package/data/ru.json'));

  const TYPE_IDS = ['', 'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];
  const enName = {}, genus = {};
  for (const r of names) if (+r.local_language_id === EN) { enName[r.pokemon_species_id] = r.name; genus[r.pokemon_species_id] = r.genus; }
  const flav = {};
  for (const r of flavor) if (+r.language_id === EN) {
    const s = r.species_id, v = +r.version_id;
    if (!flav[s] || v > flav[s].v) flav[s] = { v, t: clean(r.flavor_text) };
  }
  const defPoke = {};
  for (const p of pokemon) if (p.is_default === '1') defPoke[p.species_id] = p;
  const types = {}, stats = {}, abil = {};
  for (const r of ptypes) (types[r.pokemon_id] ||= [])[+r.slot - 1] = TYPE_IDS[+r.type_id];
  for (const r of pstats) (stats[r.pokemon_id] ||= [])[+r.stat_id - 1] = +r.base_stat;
  const abilName = {};
  for (const r of abilNames) if (+r.local_language_id === EN) abilName[r.ability_id] = r.name;
  for (const r of pabil) (abil[r.pokemon_id] ||= []).push({ n: abilName[r.ability_id] || '', h: r.is_hidden === '1' ? 1 : 0 });

  const list = species
    .map((s) => {
      const id = +s.id, p = defPoke[s.id] || {};
      return {
        id, ru: ru[id - 1] || enName[id], en: enName[id] || s.identifier, g: genus[id] || '',
        t: (types[p.id] || []).filter(Boolean), gen: +s.generation_id,
        leg: s.is_legendary === '1' ? 1 : 0, myth: s.is_mythical === '1' ? 1 : 0, baby: s.is_baby === '1' ? 1 : 0,
        ch: +s.evolution_chain_id, from: s.evolves_from_species_id ? +s.evolves_from_species_id : 0,
        h: +p.height || 0, w: +p.weight || 0, st: stats[p.id] || [], ab: abil[p.id] || [], fl: flav[id]?.t || '',
      };
    })
    .filter((x) => x.id <= 1025)
    .sort((a, b) => a.id - b.id);
  await writeJS('data/dex.js', 'PL.dex', list);
  console.log(`  ✓ ${list.length} покемонов → data/dex.js`);
  return { list, gens };
}

async function buildTypes() {
  console.log('Типы…');
  const eff = await csv('type_efficacy');
  const chart = {};
  for (const r of eff) {
    if (+r.damage_type_id > 18 || +r.target_type_id > 18) continue;
    (chart[r.damage_type_id] ||= {})[r.target_type_id] = +r.damage_factor / 100;
  }
  await writeJS('data/types.js', 'PL.typeChart', chart);
}

async function buildWorld(dex) {
  console.log('Регионы, поколения, игры, предметы…');
  const [regions, generations, vgroups, versions, vnames, items, itemCats, itemNames, itemFlavor] = await Promise.all([
    csv('regions'), csv('generations'), csv('version_groups'), csv('versions'), csv('version_names'),
    csv('items'), csv('item_categories'), csv('item_names'), csv('item_flavor_text'),
  ]);
  const vname = {};
  for (const r of vnames) if (+r.local_language_id === EN) vname[r.version_id] = r.name;
  const games = {};
  for (const v of versions) {
    const g = vgroups.find((x) => x.id === v.version_group_id);
    if (g) (games[g.generation_id] ||= []).push(vname[v.id] || v.identifier);
  }
  const genList = generations.map((g) => ({
    id: +g.id, region: regions.find((r) => r.id === g.main_region_id)?.identifier || '',
    games: games[g.id] || [], count: dex.filter((p) => p.gen === +g.id).length,
  }));

  const catPocket = Object.fromEntries(itemCats.map((c) => [c.id, { pocket: +c.pocket_id, id: c.identifier }]));
  const iname = {}, iflav = {};
  for (const r of itemNames) if (+r.local_language_id === EN) iname[r.item_id] = r.name;
  for (const r of itemFlavor) if (+r.language_id === EN) {
    const v = +r.version_group_id;
    if (!iflav[r.item_id] || v > iflav[r.item_id].v) iflav[r.item_id] = { v, t: clean(r.flavor_text) };
  }
  const group = (it) => {
    const c = catPocket[it.category_id];
    if (!c) return null;
    if (c.pocket === 3) return 'balls';
    if (c.pocket === 5) return 'berries';
    if (c.id === 'evolution') return 'evolution';
    if (c.id === 'mega-stones') return 'mega';
    return null;
  };
  const itemList = items.map((it) => ({ id: +it.id, k: it.identifier, n: iname[it.id] || it.identifier, grp: group(it), fl: iflav[it.id]?.t || '' }))
    .filter((x) => x.grp && x.id < 10000);
  return { regions: regions.map((r) => ({ id: +r.id, k: r.identifier })), generations: genList, items: itemList };
}

async function downloadAssets(dex, items) {
  if (CACHE_ART) {
    console.log('Арты покемонов (качаются только недостающие)…');
    await fs.mkdir(path.join(ROOT, 'assets/pokemon'), { recursive: true });
    let got = 0;
    await pool(dex, 8, async (p) => {
      const base = path.join(ROOT, 'assets/pokemon', String(p.id));
      if (existsSync(base + '.webp') || existsSync(base + '.png')) return;
      const buf = await get(`${SPRITES}/pokemon/other/official-artwork/${p.id}.png`, 'buf').catch(() => null);
      if (buf) { await fs.writeFile(base + '.png', buf); got++; }
    });
    console.log(`  ✓ скачано артов: ${got}`);
  }
  if (CACHE_ITEMS) {
    console.log('Иконки предметов…');
    await fs.mkdir(path.join(ROOT, 'assets/items'), { recursive: true });
    await pool(items, 8, async (it) => {
      const file = path.join(ROOT, 'assets/items', it.k + '.png');
      if (existsSync(file)) return;
      const buf = await get(`${SPRITES}/items/${it.k}.png`, 'buf').catch(() => null);
      if (buf) await fs.writeFile(file, buf);
    });
  }
}

/* ------------------------------------------------------------------ */
const T = { Grass: 'grass', Fire: 'fire', Water: 'water', Lightning: 'lightning', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'dark', Metal: 'steel', Dragon: 'dragon', Fairy: 'fairy', Colorless: 'colorless' };
const t = (x) => T[x] || 'colorless';

function compactCard(c) {
  const o = { i: c.id.slice(c.id.indexOf('-') + 1), n: c.name, s: c.supertype === 'Pokémon' ? 'P' : c.supertype === 'Trainer' ? 'T' : 'E' };
  if (c.subtypes?.length) o.sb = c.subtypes;
  if (c.hp) o.hp = +c.hp || c.hp;
  if (c.types?.length) o.t = c.types.map(t);
  if (c.evolvesFrom) o.ef = c.evolvesFrom;
  if (c.abilities?.length) o.ab = c.abilities.map((a) => [a.name, a.text || '', a.type || '']);
  if (c.attacks?.length) o.at = c.attacks.map((a) => [a.name, (a.cost || []).map(t), a.damage || '', a.text || '']);
  if (c.weaknesses?.length) o.wk = c.weaknesses.map((w) => [t(w.type), w.value]);
  if (c.resistances?.length) o.rs = c.resistances.map((w) => [t(w.type), w.value]);
  if (c.convertedRetreatCost) o.rt = c.convertedRetreatCost;
  if (c.rules?.length) o.ru = c.rules;
  if (c.artist) o.ar = c.artist;
  if (c.rarity) o.ra = c.rarity;
  if (c.flavorText) o.fl = c.flavorText;
  if (c.nationalPokedexNumbers?.length) o.d = c.nationalPokedexNumbers;
  return o;
}

const CARD_TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'dark', 'steel', 'dragon', 'fairy', 'colorless'];
async function buildTCG() {
  console.log('Карточки TCG (все наборы)…');
  const sets = (await get(`${TCG}/sets/en.json`, 'json')).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.id.localeCompare(b.id));
  const setIdx = Object.fromEntries(sets.map((s, i) => [s.id, i]));
  const perSet = {};
  const rarities = [];
  const supporters = [];
  const manifest = {};
  const imgMap = { sx: [], ex: {}, logo: {} };
  let total = 0;

  await pool(sets, 6, async (s) => {
    const cards = (await get(`${TCG}/cards/en/${s.id}.json`, 'json')) || [];
    perSet[s.id] = cards;
    if (CACHE_SETS) {
      const file = path.join(ROOT, `data/tcg/sets/${s.id}.js`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `/* ${s.name} (${s.releaseDate}) — сгенерировано scripts/build-data.mjs */\nPL.tcgSet(${JSON.stringify(s.id)}, ${JSON.stringify(cards.map(compactCard))});\n`);
    }
    total += cards.length;
  });

  const rows = [];
  for (const s of sets) {
    const cards = perSet[s.id];
    let sx = 0, pt = 0;
    for (const c of cards) {
      const local = c.id.slice(c.id.indexOf('-') + 1);
      const sm = c.images?.small || '', lg = c.images?.large || '';
      const isPt = sm === `https://images.pokemontcg.io/${s.id}/${local}.png` && lg === `https://images.pokemontcg.io/${s.id}/${local}_hires.png`;
      const isSx = sm === `https://images.scrydex.com/pokemon/${c.id}/small` && lg === `https://images.scrydex.com/pokemon/${c.id}/large`;
      if (isPt) pt++; else if (isSx) sx++; else if (sm) imgMap.ex[c.id] = [sm, lg];
      let ri = rarities.indexOf(c.rarity || ''); if (ri === -1) ri = rarities.push(c.rarity || '') - 1;
      const t = CARD_TYPES.indexOf((c.types || []).map((x) => T[x] || 'colorless')[0]);
      rows.push([setIdx[s.id], local, c.name, c.supertype === 'Pokémon' ? 0 : c.supertype === 'Trainer' ? 1 : 2, t, ri, (c.nationalPokedexNumbers || [])[0] || 0, +c.hp || 0]);
      if (c.supertype === 'Trainer' && (c.subtypes || []).includes('Supporter')) supporters.push([c.id, c.name]);
    }
    if (sx > pt) imgMap.sx.push(s.id);
    if (s.images?.logo && s.images.logo !== `https://images.pokemontcg.io/${s.id}/logo.png`) imgMap.logo[s.id] = [s.images.logo, s.images.symbol || ''];
    manifest[s.id] = { logo: s.images?.logo, symbol: s.images?.symbol, cards: cards.map((c) => [c.id, c.images?.small, c.images?.large]) };
  }

  const index = sets.map((s) => ({ id: s.id, n: s.name, se: s.series, d: s.releaseDate.replace(/\//g, '-'), c: perSet[s.id].length, pt: s.printedTotal }));
  await writeJS('data/tcg/sets.js', 'PL.tcgSets', index);
  await writeJS('data/tcg/index.js', 'PL.tcgIndex', { rarities, rows });
  await writeJS('data/tcg/supporters.js', 'PL.tcgSupporters', supporters);
  await writeJS('data/tcg/images-map.js', 'PL.tcgImgMap', imgMap);
  if (MANIFEST) await fs.writeFile(path.join(ROOT, 'data/tcg/images-manifest.json'), JSON.stringify(manifest));
  if (!existsSync(path.join(ROOT, 'data/tcg/images.js'))) await writeJS('data/tcg/images.js', 'PL.tcgImages', { sets: {}, logos: {}, miss: {} });
  console.log(`  ✓ ${sets.length} наборов, ${total} карточек → индекс data/tcg/index.js (${rows.length} строк)`);
  return { sets: sets.length, cards: total };
}

async function main() {
  const { list } = await buildDex();
  await buildTypes();
  const world = await buildWorld(list);
  await writeJS('data/world.js', 'PL.world', world);
  await downloadAssets(list, world.items);
  const tcg = await buildTCG();
  await writeJS('data/meta.js', 'PL.dataMeta', {
    built: new Date().toISOString().slice(0, 10),
    local: { sets: CACHE_SETS, art: CACHE_ART, items: CACHE_ITEMS },
    sets: tcg.sets, cards: tcg.cards,
  });
  console.log('\nГотово. Открой index.html.');
}
main().catch((e) => { console.error('\nОшибка:', e.message || e); process.exit(1); });
