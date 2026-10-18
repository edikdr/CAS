// ElevenLabs Scribe → word timestamps → LRC (the ONLY source of lyric text and timing).
// Runs on the owner's machine. Real API calls happen ONLY when ALLOW_PAID=1 and ELEVENLABS_API_KEY
// are set in the environment (never in files). Everything else is free and offline.
//
//   node tools/transcribe-scribe.mjs --estimate            # count + audio minutes, no network
//   ALLOW_PAID=1 ELEVENLABS_API_KEY=… node tools/transcribe-scribe.mjs [--only <trackId>] [--force]
//   node tools/transcribe-scribe.mjs --rebuild-lrc          # re-make .lrc from saved .json (free)
//   then: node tools/make-data.mjs                          # sets tracks[].hasLyrics
//
// Options: --model scribe_v2 (scribe_v1 was removed 2026-07-09) · --concurrency 3 · --min-prob 0.2
// Output (gitignored): site/data/private-lyrics/<trackId>.json (raw words) and <trackId>.lrc.
// Report (no lyric text): docs/lyrics-review.md.
import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { args, ROOT, SITE, readJSON, ffprobeDuration } from './lib.mjs';

const API = 'https://api.elevenlabs.io/v1/speech-to-text';
const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- LRC building (pure; unit-tested in tests/unit) ----------

const PUNCT_ONLY = /^[\p{P}\p{S}]+$/u;
const EVENT = /^[([].*[)\]]$/u; // "(laughter)", "[music]"
const BREAK_AFTER = /[.?!…,;:]$/u;

export function fmtStamp(t) {
  const cs = Math.round(Math.max(0, t) * 100); // centiseconds first, so 59.999 → [01:00.00]
  const m = Math.floor(cs / 6000);
  const rest = (cs % 6000) / 100;
  return `[${String(m).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}]`;
}

/** Scribe words → clean word list: words only (no spacing/audio events), punctuation fragments
 *  merged into the previous word, low-confidence words dropped (logprob → probability). */
export function cleanWords(words, { minProb = 0.2, maxTime = 30.5 } = {}) {
  const out = [];
  for (const w of words || []) {
    if (w.type && w.type !== 'word') continue;
    const text = String(w.text || '').trim();
    if (!text || EVENT.test(text)) continue;
    if (typeof w.start !== 'number') continue;
    if (w.start > maxTime) continue;
    if (PUNCT_ONLY.test(text)) { if (out.length) out.at(-1).text += text; continue; }
    if (typeof w.logprob === 'number' && Math.exp(w.logprob) < minProb) continue;
    out.push({ text, start: w.start, end: typeof w.end === 'number' ? w.end : w.start });
  }
  return out;
}

/** 1–3 words per line so each line lands close to when it is sung. New line after 3 words,
 *  after sentence/clause punctuation, or across a gap > 0.6 s. Times are relative to the preview. */
export function buildLines(words, { maxWords = 3, gap = 0.6 } = {}) {
  const lines = [];
  let cur = null;
  for (const w of words) {
    const prev = cur?.words.at(-1);
    const split = !cur || cur.words.length >= maxWords || (prev && (w.start - prev.end > gap || BREAK_AFTER.test(prev.text)));
    if (split) { cur = { t: w.start, words: [] }; lines.push(cur); }
    cur.words.push(w);
  }
  return lines.map((l) => ({ t: l.t, text: l.words.map((w) => w.text).join(' ') }));
}

export function toLrc(lines, meta = {}) {
  const head = [`[re:${meta.model || 'scribe'}]`, '[length:00:30]', '[offset:0]'];
  return head.concat(lines.map((l) => `${fmtStamp(l.t)}${l.text}`)).join('\n') + '\n';
}

// ---------- review heuristics (stats only, never lyric text) ----------

const MARKERS = {
  ca: /\b(amb|perquè|això|molt|ara|els|meu|teu|vull|tinc|estic|només|mai|sóc|també|nit|què)\b|l·l|ç/iu,
  es: /\b(pero|muy|tengo|estoy|quiero|siempre|nunca|también|noche|soy|nada|ahora|porque|qué|¿)\b|ñ/iu,
  en: /\b(the|and|you|i'm|my|baby|don't|what|yeah|love|it's|we|they)\b/iu,
};
export function languageHints(words) {
  const text = words.map((w) => w.text).join(' ');
  return Object.entries(MARKERS).filter(([, re]) => re.test(text)).map(([l]) => l);
}

// ---------- API ----------

async function transcribe(file, { key, model, language }) {
  const buf = await readFile(file);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mp4' }), path.basename(file));
  form.append('model_id', model);
  form.append('timestamps_granularity', 'word');
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  if (language) form.append('language_code', language);
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(API, { method: 'POST', headers: { 'xi-api-key': key }, body: form });
    } catch (e) {
      if (attempt >= 4) throw e;
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res.json();
    const body = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

async function writeReview(outDir, tracks) {
  const rows = [];
  for (const t of tracks) {
    const jf = path.join(outDir, `${t.id}.json`);
    if (!(await exists(jf))) { rows.push(`| ${t.id} | ${esc(t.title)} | — | — | — | not transcribed |`); continue; }
    const raw = JSON.parse(await readFile(jf, 'utf8'));
    const words = cleanWords(raw.words);
    const hints = languageHints(words);
    const flags = [];
    if (words.length < 15) flags.push('few words');
    if (hints.length > 1) flags.push(`mixed ${hints.join('/')}`);
    if ((raw.language_probability ?? 1) < 0.6) flags.push('low language confidence');
    rows.push(`| ${t.id} | ${esc(t.title)} | ${raw.language_code ?? '?'} (${(raw.language_probability ?? 0).toFixed(2)}) | ${words.length} | ${hints.join(', ') || '—'} | ${flags.join('; ') || 'ok'} |`);
  }
  const md = ['# Lyrics review (generated, no lyric text)', '',
    'Every transcript needs a human pass before use. Flags: **few words** (< 15 kept words in 30 s),',
    '**mixed** (marker words of more than one of EN/ES/CA found — heuristic), **low language confidence**.',
    'Fix a transcript by editing `site/data/private-lyrics/<id>.lrc` by hand (keep `[mm:ss.xx]` stamps).', '',
    '| trackId | title | detected language | words kept | language markers | flags |', '|---|---|---|---|---|---|', ...rows, ''].join('\n');
  await writeFile(path.join(ROOT, 'docs/lyrics-review.md'), md);
}
const esc = (s) => String(s).replace(/\|/g, '\\|');

// ---------- CLI ----------

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  const config = await readJSON(path.join(SITE, 'site.config.json'));
  const tracks = await readJSON(path.join(SITE, 'data/tracks.json'));
  const audioDir = path.resolve(a.dir || path.join(SITE, 'media/audio'));
  const outDir = path.resolve(a.out || path.join(SITE, config.lyrics?.dir || 'data/private-lyrics'));
  const model = a.model || process.env.SCRIBE_MODEL || 'scribe_v2';
  const minProb = Number(a['min-prob'] ?? 0.2);
  await mkdir(outDir, { recursive: true });

  let list = tracks.filter((t) => !a.only || t.id === String(a.only));
  const files = new Set(await readdir(audioDir).catch(() => []));
  list = list.filter((t) => files.has(`${t.id}.m4a`));
  const todo = [];
  for (const t of list) if (a.force || !(await exists(path.join(outDir, `${t.id}.json`)))) todo.push(t);

  if (a['rebuild-lrc']) {
    let n = 0;
    for (const t of list) {
      const jf = path.join(outDir, `${t.id}.json`);
      if (!(await exists(jf))) continue;
      const raw = JSON.parse(await readFile(jf, 'utf8'));
      await writeFile(path.join(outDir, `${t.id}.lrc`), toLrc(buildLines(cleanWords(raw.words, { minProb })), { model: raw._model || model }));
      n++;
    }
    await writeReview(outDir, list);
    console.log(`rebuilt ${n} .lrc files from saved JSON (no API calls). Next: node tools/make-data.mjs`);
    process.exit(0);
  }

  const minutes = (ts) => ts.reduce((s, t) => s + ffprobeDuration(path.join(audioDir, `${t.id}.m4a`)), 0) / 60;
  const paid = process.env.ALLOW_PAID === '1';
  const key = process.env.ELEVENLABS_API_KEY;
  if (a.estimate || !paid || !key) {
    console.log(`Scribe estimate (model ${model}): ${list.length} previews, ${minutes(list).toFixed(1)} audio-min total; ` +
      `${todo.length} still to transcribe = ${minutes(todo).toFixed(1)} audio-min. Pricing: see your ElevenLabs plan (billed per audio hour).`);
    if (!a.estimate) console.log(paid ? 'ELEVENLABS_API_KEY is not set — nothing sent.' : 'ALLOW_PAID=1 is not set — nothing sent (paid calls are opt-in).');
    await writeReview(outDir, list);
    process.exit(0);
  }

  const failures = [];
  let done = 0;
  await pool(todo, Number(a.concurrency || 3), async (t) => {
    try {
      const language = config.lyricLanguages?.[t.id] || undefined; // default: auto-detect
      const raw = await transcribe(path.join(audioDir, `${t.id}.m4a`), { key, model, language });
      raw._model = model;
      raw._trackId = t.id;
      await writeFile(path.join(outDir, `${t.id}.json`), JSON.stringify(raw, null, 1));
      await writeFile(path.join(outDir, `${t.id}.lrc`), toLrc(buildLines(cleanWords(raw.words, { minProb })), { model }));
      console.log(`✓ ${++done}/${todo.length} ${t.id} ${t.title}`);
    } catch (e) {
      failures.push(`${t.id} ${t.title}: ${e.message}`);
      console.error(`✗ ${t.id} ${t.title}: ${e.message}`);
    }
  });
  await writeReview(outDir, list);
  console.log(`done: ${done} ok, ${failures.length} failed. Review docs/lyrics-review.md, then run: node tools/make-data.mjs`);
  if (failures.length) process.exit(1);
}
