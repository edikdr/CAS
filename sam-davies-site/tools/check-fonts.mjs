// Fails the build if the self-hosted display font (or its @font-face unicode-range) misses a glyph
// needed for EN/ES/CA — no silent fallback in display text. Uses fontTools (pip install fonttools brotli).
// Checks: (1) the TZ glyph set + its uppercase forms, (2) every character in i18n/*.json and the
// generated multilingual data, (3) that tokens.css unicode-range covers all of them.
// Release/track titles are only WARNED about (proper nouns may carry decorative symbols).
// Usage: node tools/check-fonts.mjs
import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { SITE, readJSON } from './lib.mjs';

const FONT = path.join(SITE, 'fonts/anton-sd.woff2');
const REQUIRED = 'àèéíïòóúüçñ ÀÈÉÍÏÒÓÚÜÇÑ ¿¡ · ŀĿ «» — … ’ “ ” ‘ – 0123456789 abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ .,;:!?\'"()&/-';

let cmap;
try {
  const py = 'import sys,json\nfrom fontTools.ttLib import TTFont\nprint(json.dumps(sorted(TTFont(sys.argv[1]).getBestCmap().keys())))';
  cmap = new Set(JSON.parse(execFileSync('python3', ['-I', '-c', py, FONT]).toString()));
} catch (e) {
  console.error(`check-fonts: cannot read ${FONT} with fontTools (${e.message.split('\n')[0]}). pip install fonttools brotli`);
  process.exit(1);
}

const css = await readFile(path.join(SITE, 'src/css/tokens.css'), 'utf8');
const ranges = (/unicode-range:\s*([^;]+);/.exec(css)?.[1] || '').split(',').map((r) => r.trim().replace(/^U\+/i, '')).filter(Boolean)
  .map((r) => { const [a, b] = r.split('-'); return [parseInt(a, 16), parseInt(b || a, 16)]; });
const inRange = (cp) => !ranges.length || ranges.some(([a, b]) => cp >= a && cp <= b);

const errors = [];
const warnings = [];
const skip = (cp) => cp <= 0x20 || cp === 0xa0 || (cp >= 0x200b && cp <= 0x200f);
function check(text, where, level) {
  const seen = new Set();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (skip(cp) || seen.has(cp)) continue;
    seen.add(cp);
    const miss = !cmap.has(cp) ? 'not in font' : !inRange(cp) ? 'outside @font-face unicode-range' : null;
    if (miss) (level === 'error' ? errors : warnings).push(`${where}: “${ch}” U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${miss}`);
  }
}

// 1. required set + uppercase forms (text-transform must keep ç ñ ŀ correct)
check(REQUIRED, 'required set', 'error');
check(REQUIRED.toLocaleUpperCase('ca'), 'required set (uppercase)', 'error');
if ('l·l'.toLocaleUpperCase('ca') !== 'L·L') errors.push('uppercase of "l·l" is not "L·L"');

// 2. all i18n strings (any of them may be set in the display font)
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
for (const f of (await readdir(path.join(SITE, 'i18n'))).filter((f) => f.endsWith('.json'))) {
  const text = strings(await readJSON(path.join(SITE, 'i18n', f))).join(' ');
  check(text, `i18n/${f}`, 'error');
  check(text.toLocaleUpperCase(f.split('.')[1]), `i18n/${f} (uppercase)`, 'error');
}
// generated multilingual data (quiz questions/explanations, timeline text)
const data = (f) => readJSON(path.join(SITE, 'data', f));
const multi = (v) => (Array.isArray(v) ? v.flatMap(multi) : v && typeof v === 'object' ? ('en' in v && 'ca' in v ? strings(v) : Object.values(v).flatMap(multi)) : []);
for (const f of ['quiz.json', 'timeline.json']) check(multi(await data(f)).join(' '), `data/${f} (translated text)`, 'error');

// 3. catalogue proper nouns → warnings only
const titles = [...(await data('tracks.json')).flatMap((t) => [t.title, t.artistLine, t.releaseTitle])].join(' ');
check(titles, 'catalogue titles/names', 'warn');
check(titles.toLocaleUpperCase('und'), 'catalogue titles/names (uppercase)', 'warn');

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`check-fonts: ${cmap.size} glyphs in ${path.basename(FONT)}, ${errors.length} error(s), ${warnings.length} warning(s)`);
if (errors.length) process.exit(1);
