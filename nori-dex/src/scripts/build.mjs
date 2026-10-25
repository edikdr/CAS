#!/usr/bin/env node
/* Production build of Nori-Dex (minify and bundle only; no quality loss).
 *
 *   npm i              # terser, csso, html-minifier-terser (dev dependencies)
 *   npm run build      # -> dist/   (open dist/index.html through any static server, or deploy dist/)
 *
 * What it does:
 *   • js:  every script listed in index.html -> one js/app.<hash>.js (deferred, no inline script);
 *   • css: every stylesheet listed in index.html -> one css/app.<hash>.css;
 *   • html: minified, fonts preloaded;
 *   • assets/ (minus assets/src, the untouched originals) and fonts/ are copied, and every
 *     reference to them gets ?v=<content hash> so they can be cached forever;
 *   • gates (the build fails when one trips):
 *       - index.html script list must equal CORE below (same order);
 *       - no Cyrillic anywhere in the sources or the output (English only);
 *       - brand sweep over dist: no third-party franchise or hardware names (BRAND below);
 *       - every absolute URL in dist is an outbound link to an allowed host (zero third-party requests);
 *       - every assets/... path referenced by code or data exists;
 *       - budgets: first load (HTML + CSS + JS, gzip) < 250 KB, data/sky.js < 20 KB,
 *         every shipped image is WebP and < 250 KB.
 * Everything the build does is in this file. Images are prepared by scripts/bake-images.py.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist');
const require = createRequire(import.meta.url);
const terser = require('terser');
const csso = require('csso');
const { minify: minifyHtml } = require('html-minifier-terser');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const gz = (s) => zlib.gzipSync(s, { level: 9 }).length;
const problems = [];
const fail = (msg) => problems.push(msg);

/* ---------- bundle contents (must match the <script> order in index.html) ---------- */
const CORE = [
  'js/i18n.js', 'js/i18n/es.js', 'data/sky.js',
  'js/motion.js', 'js/config.js', 'js/icons.js', 'js/audio.js', 'js/static.js', 'js/input.js',
  'js/device.js', 'js/cable.js', 'js/carts.js', 'js/sections.js', 'js/quiz-data.js', 'js/quiz.js', 'js/spirit.js', 'js/hub.js', 'js/shot.js',
  'js/app.js',
];
const FONTS_PRELOAD = ['nunito-latin', 'tiny5'];
/* outbound links the site may contain (they are <a href>, never fetched) */
const LINK_HOSTS = ['www.kickstarter.com', 'kickstarter.com', 'www.entharielgames.com', 'entharielgames.com',
  'www.instagram.com', 'x.com', 'www.tiktok.com', 'www.youtube.com', 'store.steampowered.com', 'discord.gg', 'discord.com',
  'www.facebook.com', 'bsky.app'];
const NAMESPACES = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml', 'http://www.w3.org/1999/xlink'];
const BRAND = /pok[eé]|pikachu|arceus|joy-?con|tcg/i;
const CYRILLIC = /[\u0400-\u04FF]/;
const BUDGET = { firstLoadGz: 250 * 1024, sky: 20 * 1024, image: 250 * 1024 };

/* ---------- gate: index.html lists exactly CORE ---------- */
const srcHtml = read('index.html');
const inHtml = [...srcHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (inHtml.join() !== CORE.join()) {
  console.error('index.html <script> list differs from CORE in scripts/build.mjs:');
  CORE.filter((x) => !inHtml.includes(x)).forEach((x) => console.error('  missing in index.html:', x));
  inHtml.filter((x) => !CORE.includes(x)).forEach((x) => console.error('  missing in build.mjs:', x));
  if (CORE.every((x) => inHtml.includes(x)) && inHtml.every((x) => CORE.includes(x))) console.error('  (same files, different order)');
  process.exit(1);
}

/* ---------- gate: English only (sources) ---------- */
function walk(dir, skip, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (skip(p, e)) continue;
    if (e.isDirectory()) walk(p, skip, fn); else fn(p);
  }
}
const TEXT = /\.(js|mjs|css|html|json|md|py|txt)$/;
walk(ROOT, (p) => /node_modules|[\\/]dist$|[\\/]\.git$/.test(p) || p === OUT, (p) => {
  if (!TEXT.test(p) || p.endsWith('package-lock.json')) return;
  fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
    if (CYRILLIC.test(l)) fail(`Cyrillic text in ${path.relative(ROOT, p)}:${i + 1}`);
  });
});

/* ---------- output ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true }); fs.writeFileSync(path.join(OUT, f), s); };
const copyDir = (from, to, skip = () => false) => {
  fs.mkdirSync(path.join(OUT, to), { recursive: true });
  for (const e of fs.readdirSync(path.join(ROOT, from), { withFileTypes: true })) {
    if (skip(e.name)) continue;
    if (e.isDirectory()) copyDir(path.join(from, e.name), path.join(to, e.name), skip);
    else fs.copyFileSync(path.join(ROOT, from, e.name), path.join(OUT, to, e.name));
  }
};
copyDir('assets', 'assets', (n) => n === 'src');
copyDir('fonts', 'fonts');
/* files that must sit at the root of the site: robots.txt, and the Netlify headers (Vercel reads vercel.json) */
for (const f of ['robots.txt', '_headers']) {
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
  else fail(`${f} is missing (it must be shipped at the root of dist/)`);
}

/* every assets/... or fonts/... reference -> must exist; gets ?v=<file hash> */
const fileHash = {};
function stamp(code, where) {
  return code.replace(/((?:\.\.\/)?)((?:assets|fonts)\/[\w\-./]+\.(?:webp|png|jpe?g|svg|gif|woff2))/g, (m, up, rel) => {
    const f = path.join(OUT, rel);
    if (!fs.existsSync(f)) { fail(`missing file ${rel} (referenced in ${where})`); return m; }
    fileHash[rel] = fileHash[rel] || hash(fs.readFileSync(f));
    return up + rel + '?v=' + fileHash[rel];
  });
}

/* ---------- shot fonts (lazy, for photo mode) ---------- */
let shotFonts = null;
if (fs.existsSync(path.join(ROOT, 'js/shot-fonts.js'))) {
  const code = read('js/shot-fonts.js');
  shotFonts = `js/shot-fonts.${hash(code)}.js`;
  write(shotFonts, code);
}

/* ---------- js ---------- */
async function min(file, code) {
  const r = await terser.minify({ [file]: code }, { ecma: 2015, compress: { passes: 2 }, mangle: true, format: { comments: false } });
  if (r.error) throw r.error;
  return r.code;
}
const parts = [`window.PL=window.PL||{};PL.build=${JSON.stringify({ shotFonts })};`];
for (const f of CORE) parts.push(await min(f, read(f)));
const appJs = stamp(parts.join(';\n') + '\n', 'js');
const jsName = `js/app.${hash(appJs)}.js`;
write(jsName, appJs);

/* ---------- css ---------- */
const links = [...srcHtml.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const cssSrc = links.map((f) => read(f)).join('\n');
const cssMin = stamp(csso.minify(cssSrc, { restructure: false, comments: false }).css, 'css');
const cssName = `css/app.${hash(cssMin)}.css`;
write(cssName, cssMin);

/* ---------- html ---------- */
let html = srcHtml;
html = html.replace(/\s*<link rel="stylesheet" href="[^"]+">/g, '');
html = html.replace(/\s*<script[\s\S]*?<\/script>/g, '');
const head =
  FONTS_PRELOAD.map((n) => `<link rel="preload" href="fonts/${n}.woff2" as="font" type="font/woff2" crossorigin>`).join('') +
  `<link rel="stylesheet" href="${cssName}">` +
  `<script defer src="${jsName}"></script>`;
html = html.replace('</head>', head + '</head>');
html = await minifyHtml(html, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true, minifyCSS: false, minifyJS: false, keepClosingSlash: true, caseSensitive: true });
html = stamp(html, 'index.html');
write('index.html', html);

/* ---------- gate: the prototype must not be indexable (meta, both header files, robots.txt) ---------- */
if (!/<meta name="robots" content="noindex,\s*nofollow">/.test(html)) fail('dist/index.html lacks <meta name="robots" content="noindex,nofollow">');
if (!/User-agent:\s*\*\s*[\r\n]+\s*Disallow:\s*\/\s*$/m.test(fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf8'))) fail('dist/robots.txt must disallow everything ("User-agent: *" then "Disallow: /")');
if (!/^\s*X-Robots-Tag:\s*noindex,\s*nofollow\s*$/m.test(fs.readFileSync(path.join(OUT, '_headers'), 'utf8'))) fail('dist/_headers (Netlify) lacks "X-Robots-Tag: noindex, nofollow"');
if (!/"X-Robots-Tag",\s*"value":\s*"noindex,\s*nofollow"/.test(read('vercel.json'))) fail('vercel.json lacks the X-Robots-Tag: noindex, nofollow header');

/* ---------- gates on the output ---------- */
const shipped = { 'index.html': html, [jsName]: appJs, [cssName]: cssMin };
for (const [f, s] of Object.entries(shipped)) {
  const b = BRAND.exec(s); if (b) fail(`brand sweep: "${s.slice(Math.max(0, b.index - 30), b.index + 30)}" in ${f}`);
  const c = CYRILLIC.exec(s); if (c) fail(`Cyrillic in ${f}`);
  for (const m of s.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
    const url = m[0].replace(/[.,;]+$/, '');
    if (NAMESPACES.some((n) => url.startsWith(n))) continue;
    let host = ''; try { host = new URL(url).host; } catch (e) { /* not a URL */ }
    if (!LINK_HOSTS.includes(host)) fail(`third-party URL in ${f}: ${url}`);
  }
}
const nintendo = Object.values(shipped).reduce((n, s) => n + (s.match(/nintendo/gi) || []).length, 0);

/* ---------- budgets ---------- */
const firstLoad = gz(html) + gz(cssMin) + gz(appJs);
if (firstLoad > BUDGET.firstLoadGz) fail(`first load ${kb(firstLoad)} gzip exceeds ${kb(BUDGET.firstLoadGz)}`);
const skySize = fs.statSync(path.join(ROOT, 'data/sky.js')).size;
if (skySize > BUDGET.sky) fail(`data/sky.js is ${kb(skySize)} (budget ${kb(BUDGET.sky)})`);
let images = 0, imageBytes = 0;
walk(path.join(OUT, 'assets'), () => false, (p) => {
  const rel = path.relative(OUT, p), size = fs.statSync(p).size;
  if (/\.(png|jpe?g|gif)$/i.test(p)) fail(`${rel}: ship WebP (run scripts/bake-images.py)`);
  if (/\.webp$/i.test(p)) { images++; imageBytes += size; if (size > BUDGET.image) fail(`${rel} is ${kb(size)} (budget ${kb(BUDGET.image)})`); }
});

/* ---------- report ---------- */
console.log('js   ', jsName.padEnd(26), kb(appJs.length).padStart(9), '  gzip', kb(gz(appJs)));
console.log('css  ', cssName.padEnd(26), kb(cssMin.length).padStart(9), '  gzip', kb(gz(cssMin)));
console.log('html ', 'index.html'.padEnd(26), kb(html.length).padStart(9), '  gzip', kb(gz(html)));
console.log('first load (html+css+js, gzip):', kb(firstLoad), '/ budget', kb(BUDGET.firstLoadGz));
console.log('data/sky.js:', kb(skySize), '/ budget', kb(BUDGET.sky));
console.log('images:', images, 'WebP files,', kb(imageBytes), 'total, each under', kb(BUDGET.image));
console.log('"Nintendo" mentions in shipped code:', nintendo, '(allowed only in the platform line)');
if (problems.length) {
  console.error('\nBuild FAILED:');
  problems.forEach((p) => console.error('  ✗ ' + p));
  process.exit(1);
}
console.log('✓ built:', path.relative(process.cwd(), OUT) || OUT);
