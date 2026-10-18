// Shared helpers for the dev-only asset pipeline (never shipped to site/).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = path.join(ROOT, 'site');
export const CACHE = path.join(ROOT, '.cache');

/** Parse `--key value` / `--flag` CLI arguments. */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

/** Undo Info-ZIP's escaping of non-ASCII names: `#U00e9` → é, `#L0001f600` → 😀. Exactly 4/8 hex
 *  digits, otherwise `D#U00e9bil` would greedily eat the `b`. */
export function decodeMangled(s) {
  return s
    .replace(/#L([0-9a-fA-F]{8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/#U([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

const FEAT = /\s*[([]\s*(?:feat|ft|with)\.?\s[^)\]]*[)\]]/giu;
const KIND_SUFFIX = /\s+-\s+(?:single|ep)\s*$/iu;

/** Matching key for titles: NFC, case-fold, no (feat…)/[feat…], no "- Single|EP", letters+digits only. */
export function normTitle(s) {
  return decodeMangled(s).normalize('NFC').toLocaleLowerCase('und')
    .replace(FEAT, '').replace(KIND_SUFFIX, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Release title for display: collection name without the "- Single"/"- EP" store suffix. */
export function releaseTitle(collectionName) {
  return collectionName.replace(KIND_SUFFIX, '').trim();
}

export function releaseType(collectionName) {
  if (/\s-\s+single\s*$/i.test(collectionName)) return 'single';
  if (/\s-\s+ep\s*$/i.test(collectionName)) return 'ep';
  return 'album';
}

/** URL-safe id: ASCII, no feat credits, dash separated. */
export function slug(s) {
  return releaseTitle(s).replace(FEAT, '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'release';
}

/** "A, B & C" + feat credits in the title → ["A","B","C",…] (order kept, duplicates dropped). */
export function splitArtists(artistName, trackName = '') {
  const parts = artistName.split(/\s*,\s*|\s+&\s+/u);
  for (const m of trackName.matchAll(/[([]\s*(?:feat|ft|with)\.?\s([^)\]]*)[)\]]/giu)) parts.push(...m[1].split(/\s*,\s*|\s+&\s+/u));
  const seen = new Set();
  return parts.map((p) => p.trim()).filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()));
}

export async function readJSON(p) { return JSON.parse(await readFile(p, 'utf8')); }
export async function writeJSON(p, data) {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2) + '\n');
}

/** Extract a zip into a fresh dir with the system `unzip` (Node has no built-in zip reader). */
export function unzip(zip, dest) {
  execFileSync('unzip', ['-oq', zip, '-d', dest], { stdio: 'inherit' });
}

export function ffprobeDuration(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
}

/** Deterministic PRNG (mulberry32) so generated quiz/order is reproducible from a seed. */
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 1779033703);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
