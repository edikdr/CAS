/*
 * tools/lyrics-from-words.mjs - ElevenLabs word timings -> data/lyrics/<trackId>.json (gitignored).
 *
 *   node tools/lyrics-from-words.mjs <words.json> <trackId> [--permission private-preview|granted|none]
 *        [--source elevenlabs-scribe-draft|owner-supplied]
 *   export groupWords(words, { gap, maxWords }) -> [{ t, end, text, words }]
 *
 * Input: the "words" download of an ElevenLabs transcription ({ words: [{ text, type, start, end }] }
 * or a bare array). Times must be relative to the 30 s preview clip (transcribe the preview, not the
 * full song). A line ends after a pause >= 0.45 s, after . ! ? (DATA_SCHEMA), or at 7 words.
 * The output holds lyric text: it stays in the gitignored data/lyrics/ folder and ships only when
 * its permission allows it (tools/build.mjs). Default: private-preview, unreviewed draft.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson } from './lib.mjs';
import { checkLyrics } from './validate.mjs';

export function groupWords(words, { gap = 0.45, maxWords = 7 } = {}) {
  const lines = [];
  let cur = null;
  for (const w of words) {
    const word = { t: +w.t.toFixed(3), end: +w.end.toFixed(3), text: w.text };
    if (!cur || word.t - cur.end >= gap || /[.!?]["')\]]?$/.test(cur.words.at(-1).text) || cur.words.length >= maxWords) {
      cur = { t: word.t, end: word.end, words: [] };
      lines.push(cur);
    }
    cur.words.push(word);
    cur.end = word.end;
  }
  return lines.map((l) => ({ t: l.t, end: l.end, text: l.words.map((w) => w.text).join(' '), words: l.words }));
}

export async function writeLyrics(trackId, lines, { permission = 'private-preview', source, reviewedByHuman = false, root = ROOT } = {}) {
  const doc = { trackId, permission, source, reviewedByHuman, lines };
  const tracks = await readJson(path.join(root, 'data/tracks.json'));
  const errors = checkLyrics(doc, trackId, tracks);
  if (errors.length) throw new Error(errors.join('\n'));
  const file = path.join(root, `data/lyrics/${trackId}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(doc, null, 1) + '\n');
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, id] = process.argv.slice(2);
  const opt = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };
  if (!input || !id) {
    console.error('usage: node tools/lyrics-from-words.mjs <words.json> <trackId> [--permission p] [--source s]');
    process.exit(1);
  }
  const raw = JSON.parse(await readFile(input, 'utf8'));
  const words = (Array.isArray(raw) ? raw : raw.words)
    .filter((w) => (w.type ?? 'word') === 'word')
    .map((w) => ({ t: w.start, end: w.end, text: String(w.text).trim() }));
  const lines = groupWords(words);
  const file = await writeLyrics(Number(id), lines, { permission: opt('permission', 'private-preview'), source: opt('source', 'elevenlabs-scribe-draft') });
  console.log(`${lines.length} lines, ${words.length} words -> ${path.relative(ROOT, file)} (gitignored; never commit)`);
}
