/*
 * tools/make-lyric-fixture.mjs - placeholder lyrics for testing, never real words.
 *
 *   node tools/make-lyric-fixture.mjs <trackId> [--permission private-preview|granted|none]
 *   export fixtureLines(beats) -> lines
 *
 * Builds "la la la ..." lines on the track's beat grid (data/beats/<id>.json): four beats of
 * words, then two beats of silence, from the first beat to the end of the clip. Writes
 * data/lyrics/<id>.json with source "fixture" (gitignored like real lyrics).
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readJson } from './lib.mjs';
import { writeLyrics } from './lyrics-from-words.mjs';

const SYLLABLES = ['la', 'la', 'la', 'da', 'la', 'na', 'la', 'la'];

export function fixtureLines(beats) {
  const lines = [];
  for (let i = 0; i + 4 < beats.length; i += 6) {
    const span = beats.slice(i, i + 5);
    const words = span.slice(0, 4).map((t, k) => ({
      t: +t.toFixed(3),
      end: +(t + (span[k + 1] - t) * 0.8).toFixed(3),
      text: SYLLABLES[(i + k) % SYLLABLES.length],
    }));
    lines.push({ t: words[0].t, end: words[3].end, text: words.map((w) => w.text).join(' '), words });
  }
  return lines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = Number(process.argv[2]);
  const i = process.argv.indexOf('--permission');
  const beats = await readJson(path.join(ROOT, `data/beats/${id}.json`)).catch(() => null);
  if (!beats) {
    console.error(`no data/beats/${id}.json - fixtures follow the beat grid`);
    process.exit(1);
  }
  const lines = fixtureLines(beats.beats);
  const file = await writeLyrics(id, lines, { permission: i >= 0 ? process.argv[i + 1] : 'private-preview', source: 'fixture' });
  console.log(`${lines.length} fixture lines -> ${path.relative(ROOT, file)}`);
}
