/* ============================================================
   Build-time frame renderer.

   1. screenshots each album's flat receipt from the live site
   2. maps that screenshot onto the paper mesh in crumple.html
   3. captures one frame per crumple stage
   4. writes them to arctic-monkeys/assets/crumple/<album>/<pct>.png

   The site does not need any of this at runtime — it only reads the
   finished frames, and falls back to the CSS crumple if they are absent.

   Usage:
     npm install three playwright        # once
     cp node_modules/three/build/three.module.js tools/crumple/vendor/
     python3 -m http.server 8765         # from the repo root
     node tools/crumple/render.mjs [--album am] [--quick]
   ============================================================ */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = process.env.ORIGIN || 'http://localhost:8765';
const OUT = `${ROOT}/arctic-monkeys/assets/crumple`;
const TEXDIR = `${OUT}/_tex`;

const args = process.argv.slice(2);
const only = args.includes('--album') ? args[args.indexOf('--album') + 1] : null;
const QUICK = args.includes('--quick');

/* Sixty poses between a ball and a flat sheet. 0 is the live DOM
   receipt and never an image.

   The site cross-fades continuously between neighbours, so the closer
   together the poses are the less the dissolve has to invent. Ten read
   as a slideshow; sixty read as movement. Spacing is even in percent and
   rounded to whole numbers, which keeps the filenames clean and happens
   to come out with no collisions. */
const STAGES = QUICK
  ? [100, 60, 20]
  : [...new Set(Array.from({ length: 60 },
      (_, i) => Math.round(100 - i * 98 / 59)))];

const FRAME_W = 700, FRAME_H = 1180;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

/* ---------- 1. the receipts, flat, as textures ---------- */
const page = await browser.newPage({ viewport: { width: 460, height: 1400 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('  page error:', e.message));

// the album list comes from the site's own data file
await page.goto(`${ORIGIN}/arctic-monkeys/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
let albums = await page.evaluate(() => ALBUMS.map(a => a.id));
if (only) albums = albums.filter(id => id === only);
if (!albums.length) { console.error('no albums matched'); process.exit(1); }

await mkdir(TEXDIR, { recursive: true });

for (const id of albums) {
  await page.goto(`${ORIGIN}/tools/crumple/texture.html?album=${id}`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__texReady === true, { timeout: 30000 });
  await page.waitForTimeout(150);
  const shot = await page.locator('#paper').screenshot();
  await writeFile(`${TEXDIR}/${id}.png`, shot);
  console.log(`texture  ${id}  ${(shot.length / 1024).toFixed(0)} KB`);
}
await page.close();

/* ---------- 2. render the stages ---------- */
for (const id of albums) {
  const gl = await browser.newPage({ viewport: { width: FRAME_W, height: FRAME_H } });
  gl.on('pageerror', e => console.error('  gl error:', e.message));

  const seed = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  const tex = `${ORIGIN}/arctic-monkeys/assets/crumple/_tex/${id}.png`;
  const url = `${ORIGIN}/tools/crumple/crumple.html`
    + `?tex=${encodeURIComponent(tex)}&w=${FRAME_W}&h=${FRAME_H}&seed=${seed}`;

  await gl.goto(url, { waitUntil: 'domcontentloaded' });
  await gl.waitForFunction(() => window.__ready === true, { timeout: 60000 });

  await mkdir(`${OUT}/${id}`, { recursive: true });
  const meta = await gl.evaluate(() => window.__meta);
  await writeFile(`${OUT}/${id}/meta.json`, JSON.stringify(meta, null, 1));
  for (const pct of STAGES) {
    await gl.evaluate(p => window.setStage(p / 100), pct);
    await gl.waitForTimeout(120);
    const png = await gl.locator('canvas').screenshot({ omitBackground: true });
    await writeFile(`${OUT}/${id}/${pct}.png`, png);
    process.stdout.write(`  ${id} ${pct}%  ${(png.length / 1024).toFixed(0)}KB\n`);
  }
  await gl.close();
}

await browser.close();
console.log('\ndone — now run tools/crumple/to_webp.py to compress');
