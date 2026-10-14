/*
 * tools/check-budgets.mjs - hard budgets from CONTRACT section 4, checked on build output.
 *
 *   node tools/check-budgets.mjs            builds the private preview into .tmp/budgets, checks it
 *   node tools/check-budgets.mjs --dir dist checks an existing build
 *   export checkBudgets(dir) -> { errors, rows }
 *
 * Initial = index.html + its stylesheets (+ @import) + the static import graph of its module
 * scripts (dynamic import() is not followed) + the first <img>. Checks:
 *  - critical path gzip <= 350 KB, initial JS gzip <= 90 KB
 *  - no absolute http(s) URL in initial HTML/CSS/JS or in any shipped CSS (except <a href> links
 *    and XML namespaces): third parties load only after a user action, from lazy code
 *  - the initial graph never contains Three.js, the lyrics engine or a .glb (mobile bundle)
 *  - DOM guitar layers (assets/guitar/dom/): <= 8 WebP, each <= 60 KB, total <= 300 KB
 *  - GLB files <= 2 MB; cover images WebP <= 100 KB; fonts are woff2 with OFL.txt beside them
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { build } from './build.mjs';
import { ROOT, walk, fail } from './lib.mjs';

const KB = 1024;
export const BUDGETS = {
  criticalGzip: 350 * KB,
  initialJsGzip: 90 * KB,
  domLayers: 8,
  domLayerMax: 60 * KB,
  domTotal: 300 * KB,
  glbMax: 2048 * KB,
  coverMax: 100 * KB,
};
const FORBIDDEN_INITIAL = [/^vendor\/three\//, /^vendor\/lyrics-engine\//, /\.glb$/];
const URL_RE = /https?:\/\/[^\s'"`)<>]+/g;
const XML_NS = /^https?:\/\/www\.w3\.org\//;

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
  return out;
}

/** Absolute third-party URLs in a text, ignoring <a href> navigation and XML namespaces. */
export function externalUrls(text, kind) {
  const scan = kind === 'html' ? text.replace(/<a\b[^>]*>/gi, '') : text;
  return [...scan.matchAll(URL_RE)].map((m) => m[0]).filter((u) => !XML_NS.test(u));
}

/** Static import specifiers of an ES module (dynamic import() is skipped on purpose). */
export function staticImports(js) {
  return [...js.matchAll(/(?:^|[\s;}])(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

const gz = (buf) => gzipSync(buf).length;
const kb = (n) => `${(n / KB).toFixed(1)} KB`;

export async function checkBudgets(dir) {
  const errors = [];
  const rows = [];
  const read = (rel) => readFile(path.join(dir, rel));
  const resolve = (from, ref) => path.posix.normalize(path.posix.join(path.posix.dirname(from), ref.split(/[?#]/)[0]));
  const row = (name, value, budget, fmt = kb) => {
    const ok = value <= budget;
    rows.push([name, fmt(value), fmt(budget), ok ? 'ok' : 'OVER']);
    if (!ok) errors.push(`${name}: ${fmt(value)} > ${fmt(budget)}`);
  };

  // initial set
  const html = (await read('index.html')).toString('utf8');
  const initial = new Map([['index.html', 'html']]);
  let firstImage = null;
  const queue = [];
  for (const m of html.matchAll(/<(link|script|img)\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const tag = m[1].toLowerCase();
    const ref = tag === 'link' ? a.href : a.src;
    if (!ref || ref.startsWith('data:') || /^https?:/.test(ref)) continue; // absolute URLs are reported below
    const rel = resolve('index.html', ref);
    if (tag === 'link' && /\bstylesheet\b/.test(a.rel || '')) queue.push([rel, 'css']);
    else if (tag === 'link' && /\b(modulepreload|preload)\b/.test(a.rel || '')) queue.push([rel, a.as === 'style' ? 'css' : a.as === 'image' ? 'img' : 'js']);
    else if (tag === 'script') queue.push([rel, 'js']);
    else if (tag === 'img' && !firstImage) firstImage = rel;
  }
  if (firstImage) queue.push([firstImage, 'img']);
  while (queue.length) {
    const [rel, kind] = queue.shift();
    if (initial.has(rel)) continue;
    let body;
    try { body = (await read(rel)).toString('utf8'); }
    catch { errors.push(`initial file missing: ${rel}`); continue; }
    initial.set(rel, kind);
    if (kind === 'css') {
      for (const m of body.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s]+)/g)) if (!/^https?:/.test(m[1])) queue.push([resolve(rel, m[1]), 'css']);
    } else if (kind === 'js') {
      for (const spec of staticImports(body)) {
        if (/^https?:/.test(spec)) continue; // reported as external below
        if (!/^\.{0,2}\//.test(spec)) errors.push(`${rel}: bare import "${spec}" (no bundler: use a relative path)`);
        else queue.push([resolve(rel, spec), 'js']);
      }
    }
  }

  let critical = 0;
  let js = 0;
  for (const [rel, kind] of initial) {
    const buf = await read(rel);
    if (FORBIDDEN_INITIAL.some((re) => re.test(rel))) errors.push(`initial load contains ${rel} (must be a dynamic import)`);
    if (kind === 'img') { critical += buf.length; continue; }
    const size = gz(buf);
    critical += size;
    if (kind === 'js') js += size;
    for (const u of externalUrls(buf.toString('utf8'), kind)) errors.push(`${rel}: third-party URL in initial load: ${u}`);
  }
  row(`critical path (${initial.size} files, gzip)`, critical, BUDGETS.criticalGzip);
  row('initial JS (gzip)', js, BUDGETS.initialJsGzip);

  // whole build
  const files = await walk(dir);
  const sizes = new Map(await Promise.all(files.map(async (f) => [f, (await stat(path.join(dir, f))).size])));
  for (const f of files.filter((x) => x.endsWith('.css') && !initial.has(x))) {
    for (const u of externalUrls((await read(f)).toString('utf8'), 'css')) errors.push(`${f}: third-party URL in CSS: ${u}`);
  }

  const layers = files.filter((f) => f.startsWith('assets/guitar/dom/') && !f.endsWith('.json')); // + manifest.json
  row('DOM guitar layers (count)', layers.length, BUDGETS.domLayers, String);
  row('DOM guitar layers (total)', layers.reduce((s, f) => s + sizes.get(f), 0), BUDGETS.domTotal);
  for (const f of layers) {
    if (!f.endsWith('.webp')) errors.push(`${f}: DOM guitar layers must be WebP`);
    if (sizes.get(f) > BUDGETS.domLayerMax) errors.push(`${f}: ${kb(sizes.get(f))} > ${kb(BUDGETS.domLayerMax)}`);
  }
  for (const f of files.filter((x) => x.endsWith('.glb'))) row(`GLB ${f}`, sizes.get(f), BUDGETS.glbMax);
  for (const f of files.filter((x) => x.startsWith('assets/covers/'))) {
    if (!f.endsWith('.webp')) errors.push(`${f}: covers must be WebP`);
    if (sizes.get(f) > BUDGETS.coverMax) errors.push(`${f}: ${kb(sizes.get(f))} > ${kb(BUDGETS.coverMax)}`);
  }
  for (const f of files.filter((x) => /\.(woff2?|ttf|otf)$/.test(x))) {
    if (!f.endsWith('.woff2')) errors.push(`${f}: fonts ship as woff2 only`);
    if (!files.includes(`${path.posix.dirname(f)}/OFL.txt`)) errors.push(`${f}: no OFL.txt next to the font`);
  }
  return { errors, rows, initial: [...initial.keys()] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--dir');
  let dir;
  if (i >= 0) dir = path.resolve(process.argv[i + 1]);
  else {
    try { dir = (await build({ out: path.join(ROOT, '.tmp/budgets') })).out; }
    catch (e) { fail('check:budgets (build)', e.errors || [e.stack]); }
  }
  const { errors, rows, initial } = await checkBudgets(dir);
  console.log(`initial load: ${initial.join(', ')}`);
  for (const r of rows) console.log(`  ${r[0].padEnd(40)} ${r[1].padStart(10)} / ${r[2].padStart(10)}  ${r[3]}`);
  fail('check:budgets', errors);
  console.log('check:budgets: all budgets met, no third-party URLs in the initial load');
}
