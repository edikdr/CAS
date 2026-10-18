// One command for the whole asset pipeline (dev machine only).
// Usage: node tools/build-assets.mjs [--inputs inputs] [--video] [--skip-audio] [--seed sd-2026]
//   1. extract the zips into .cache/raw (fresh)      4. subset the display font (pyftsubset)
//   2. match previews → site/media/audio/<id>.m4a   5. generate site/data/*.json
//   3. covers → site/media/covers/<id>-{400,800}.webp (+ Apple artwork / placeholder fallback)
//   --video also runs tools/encode-video.sh on inputs/VID_*.mp4.
import { readdir, rm, mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';
import { args, ROOT, SITE, CACHE, unzip, readJSON, normTitle, releaseType, slug } from './lib.mjs';
import { matchAudio } from './match-audio.mjs';
import { makeData } from './make-data.mjs';

const a = args();
const inputs = path.resolve(a.inputs || path.join(ROOT, 'inputs'));
const raw = path.join(CACHE, 'raw');
const exists = (p) => access(p).then(() => true, () => false);

// 1. extract
await rm(raw, { recursive: true, force: true });
await mkdir(raw, { recursive: true });
for (const f of (await readdir(inputs)).filter((f) => f.endsWith('.zip'))) unzip(path.join(inputs, f), raw);
const metaPath = path.join(raw, 'meta.json');
const meta = await readJSON(metaPath);

// 2. audio
if (!a['skip-audio']) {
  const res = await matchAudio({ raw, meta: metaPath });
  console.log(`audio: matched ${res.matched.size}/${res.files.length}`);
  if (res.problems.length) { console.error(res.problems.join('\n')); process.exit(1); }
}

// 3. covers: one per collectionName
const coverDir = path.join(raw, 'covers');
const coverFiles = (await readdir(coverDir).catch(() => [])).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const coverByKey = new Map(coverFiles.map((f) => [normTitle(f.replace(/\.[^.]+$/, '')) + '|' + releaseType(f.replace(/\.[^.]+$/, '')), f]));
const outDir = path.join(SITE, 'media/covers');
await mkdir(outDir, { recursive: true });
const collections = new Map();
for (const t of meta) if (!collections.has(t.collectionName)) collections.set(t.collectionName, t);
const report = [];
const usedCovers = new Set();
for (const [collection, t] of collections) {
  const id = slug(collection);
  const key = normTitle(collection) + '|' + releaseType(collection);
  let src = null, origin;
  if (coverByKey.has(key)) { src = path.join(coverDir, coverByKey.get(key)); origin = 'supplied'; usedCovers.add(coverByKey.get(key)); }
  else {
    // Albums have no supplied cover → Apple artwork upscaled (100x100bb → 1000x1000bb), cached.
    const cached = path.join(CACHE, 'artwork', `${id}.jpg`);
    if (await exists(cached)) { src = cached; origin = 'apple artwork (cached)'; }
    else {
      try {
        const res = await fetch(t.artworkUrl100.replace(/\/\d+x\d+bb\./, '/1000x1000bb.'));
        if (!res.ok) throw new Error(res.status);
        await mkdir(path.dirname(cached), { recursive: true });
        await writeFile(cached, Buffer.from(await res.arrayBuffer()));
        src = cached; origin = 'apple artwork';
      } catch (e) { origin = `placeholder (artwork fetch failed: ${e.message})`; }
    }
  }
  const input = src ? await readFile(src) : placeholder(collection);
  for (const w of [400, 800]) {
    await sharp(input).resize(w, w, { fit: 'cover' }).webp({ quality: 78, effort: 6 }).toFile(path.join(outDir, `${id}-${w}.webp`));
  }
  report.push(`| ${id} | ${collection.replace(/\|/g, '\\|')} | ${origin} |`);
}
for (const f of coverFiles) if (!usedCovers.has(f)) report.push(`| — | ${f} | UNUSED supplied cover |`);
await writeFile(path.join(ROOT, 'docs/covers-report.md'), ['# Covers', '', '| releaseId | collection | source |', '|---|---|---|', ...report, ''].join('\n'));
console.log(`covers: ${collections.size} releases (${report.filter((r) => r.includes('apple')).length} via Apple artwork, ${report.filter((r) => r.includes('placeholder')).length} placeholders)`);

/** Styled placeholder: night-navy square with the release title. */
function placeholder(title) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17397d"/><stop offset="1" stop-color="#0a1633"/></linearGradient></defs>
    <rect width="1000" height="1000" fill="url(#g)"/><rect x="60" y="60" width="880" height="880" fill="none" stroke="#e30613" stroke-width="10"/>
    <text x="500" y="540" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="64" fill="#f2e6c9" text-anchor="middle">${esc(title.replace(/\s+-\s+(Single|EP)$/i, ''))}</text></svg>`);
}

// 4. display font subset (Latin + Latin Ext-A + the punctuation EN/ES/CA need)
const font = (await readdir(raw)).find((f) => /^Anton.*\.ttf$/i.test(f));
if (font) {
  const unicodes = 'U+0020-007E,U+00A0-00FF,U+0100-017F,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2039-203A,U+20AC';
  await mkdir(path.join(SITE, 'fonts'), { recursive: true });
  execFileSync('pyftsubset', [path.join(raw, font), `--unicodes=${unicodes}`, '--flavor=woff2', '--layout-features=kern,liga,locl,case',
    `--output-file=${path.join(SITE, 'fonts/anton-sd.woff2')}`], { stdio: 'inherit' });
  await writeFile(path.join(SITE, 'fonts/OFL.txt'), await readFile(path.join(raw, 'OFL.txt')).catch(() => 'Anton — SIL Open Font License 1.1'));
  console.log('font: site/fonts/anton-sd.woff2');
} else console.warn('font: Anton TTF not found in inputs — skipped');

// 5. data
const res = await makeData({ meta: metaPath, seed: a.seed || 'sd-2026' });
console.log(`data: tracks ${res.tracks.length} · releases ${res.releases.length} · timeline ${res.timeline.length} · quiz ${res.quiz.length}`);

if (a.video) {
  const vid = (await readdir(inputs)).find((f) => /^VID_.*\.mp4$/i.test(f));
  execFileSync(path.join(ROOT, 'tools/encode-video.sh'), [path.join(inputs, vid), path.join(SITE, 'media')], { stdio: 'inherit' });
}
