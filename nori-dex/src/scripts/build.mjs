#!/usr/bin/env node
/* Сборка боевой версии сайта (без потери качества: только минификация и склейка).
 *
 *   npm i                      # terser, csso, html-minifier-terser, acorn (dev-зависимости)
 *   node scripts/build.mjs     # → dist/   (можно открыть dist/index.html или залить папку dist на Netlify)
 *
 * Что делает:
 *   • js: данные (data/**) → js/data.min.js; код → js/app.ru.min.js и js/app.en.min.js (в EN вместо русских
 *     lore-ru / lore-more / quiz-data подставляются английские версии и подключаются словари js/en/*);
 *     по одному запросу на язык вместо ~30–60 файлов; js/shot-fonts.js (шрифты для снимков) остаётся отдельным и грузится по требованию;
 *   • css: все стили → один css/app.css (минификация csso, без «умных» перестановок правил);
 *   • index.html: минификация, версия ?v=<хэш> у бандлов (можно кэшировать «навсегда»), preload шрифтов;
 *   • assets/, fonts/ копируются как есть, assets/src (исходники картинок) не включается;
 *   • _headers для Netlify (кэш и сжатие).
 * Исходники остаются читаемыми: всё, что делает сборка, — в этом файле.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist');
const require = createRequire(import.meta.url);
const TOOLS = process.env.TOOLS_DIR || '';
function need(name) {
  try { return require(name); } catch (e) { return require(path.join(TOOLS, name)); }
}
const terser = need('terser');
const csso = need('csso');
const { minify: minifyHtml } = need('html-minifier-terser');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const kb = (n) => (n / 1024).toFixed(1) + ' КБ';

/* ---------- состав бандлов (должен совпадать с порядком <script> в index.html) ---------- */
const DATA = ['data/meta.js', 'data/dex.js', 'data/types.js', 'data/world.js', 'data/tcg/sets.js', 'data/tcg/index.js', 'data/tcg/images-map.js', 'data/tcg/supporters.js', 'data/tcg/images.js'];
const CORE = ['js/i18n.js', 'js/motion.js', 'js/config.js', 'js/icons.js', 'js/cards.js', 'js/img.js', 'js/lore-ru.js', 'js/lore-more.js', 'js/news.js', 'js/data.js', 'js/tcg.js', 'js/sections.js', 'js/audio.js', 'js/static.js', 'js/input.js', 'js/cable.js', 'js/pixballs.js', 'js/carts.js', 'js/shot.js', 'js/quiz-data.js', 'js/quiz.js', 'js/catcher.js', 'js/mine.js', 'js/scan-img.js', 'js/scan-match.js', 'js/scan.js', 'js/app.js'];

/* сверка с index.html: чтобы бандлы не разошлись с исходником */
const srcHtml = read('index.html');
const inHtml = [...srcHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const expected = [...CORE.slice(0, 1), ...DATA, ...CORE.slice(1)].join();
const actual = inHtml.join();
if (expected !== actual) {
  console.error('⚠ состав бандлов не совпадает с index.html:');
  const a = new Set(expected.split(',')), b = new Set(actual.split(','));
  [...a].filter((x) => !b.has(x)).forEach((x) => console.error('  нет в index.html:', x));
  [...b].filter((x) => !a.has(x)).forEach((x) => console.error('  нет в build.mjs:', x));
  process.exit(1);
}

async function min(file, code) {
  const r = await terser.minify({ [file]: code }, { ecma: 2015, compress: { passes: 2 }, mangle: true, format: { comments: false } });
  if (r.error) throw r.error;
  return r.code;
}
/* items: путь к файлу или { code } (готовый фрагмент) */
async function bundle(items) {
  const parts = [];
  for (const it of items) parts.push(typeof it === 'string' ? await min(it, read(it)) : it.code);
  return parts.join(';\n') + '\n';
}
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true }); fs.writeFileSync(path.join(OUT, f), s); };
const copyDir = (from, to, skip = () => false) => {
  fs.mkdirSync(path.join(OUT, to), { recursive: true });
  for (const e of fs.readdirSync(path.join(ROOT, from), { withFileTypes: true })) {
    if (skip(e.name)) continue;
    if (e.isDirectory()) copyDir(path.join(from, e.name), path.join(to, e.name), skip);
    else fs.copyFileSync(path.join(ROOT, from, e.name), path.join(OUT, to, e.name));
  }
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* ---------- js ---------- */
const appJs = await bundle([CORE[0], ...DATA, ...CORE.slice(1)]);
const v = { app: hash(appJs) };
write('js/app.min.js', appJs);
fs.copyFileSync(path.join(ROOT, 'js/shot-fonts.js'), path.join(OUT, 'js/shot-fonts.js'));

/* ---------- css ---------- */
const links = [...srcHtml.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const cssSrc = links.map((f) => read(f)).join('\n');
const cssMin = csso.minify(cssSrc, { restructure: false, comments: false }).css;
const vCss = hash(cssMin);
write('css/app.css', cssMin);

/* ---------- html ---------- */
let html = srcHtml;
html = html.replace(/\s*<link rel="stylesheet" href="[^"]+">/g, '');
html = html.replace(/\s*<script[\s\S]*?<\/script>/g, '');            // все скрипты: i18n уйдёт в <head> инлайном, остальное — в бандлах
const FONTS = ['nunito-latin', 'pressstart-latin', 'tiny5'];
const head =
  FONTS.map((n) => `<link rel="preload" href="fonts/${n}.woff2" as="font" type="font/woff2" crossorigin>`).join('') +
  `<link rel="stylesheet" href="css/app.css?v=${vCss}">` +
  `<script defer src="js/app.min.js?v=${v.app}"></script>`;
html = html.replace('</head>', head + '</head>');
html = await minifyHtml(html, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true, minifyCSS: false, minifyJS: false, keepClosingSlash: true, caseSensitive: true });
write('index.html', html);

/* ---------- файлы как есть ---------- */
copyDir('assets', 'assets', (n) => n === 'src');
copyDir('fonts', 'fonts');
write('_headers', [
  '/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', '',
  '/index.html', '  Cache-Control: no-cache', '',
  '/js/*.min.js', '  Cache-Control: public, max-age=31536000, immutable', '',   // у бандлов в адресе ?v=<хэш>; js/shot-fonts.js (без хэша) остаётся с обычной проверкой свежести
  '/css/*', '  Cache-Control: public, max-age=31536000, immutable', '',
  '/fonts/*', '  Cache-Control: public, max-age=31536000, immutable', '',
  '/assets/*', '  Cache-Control: public, max-age=2592000', '',
].join('\n'));

/* ---------- отчёт ---------- */
const size = (f) => fs.statSync(path.join(OUT, f)).size;
const srcSize = (fs_) => fs_.reduce((a, f) => a + fs.statSync(path.join(ROOT, f)).size, 0);
console.log('js          ', kb(srcSize([...DATA, ...CORE])), '→', kb(size('js/app.min.js')));
console.log('css         ', kb(cssSrc.length), '→', kb(size('css/app.css')));
console.log('index.html  ', kb(srcHtml.length), '→', kb(size('index.html')));
console.log('✓ готово:', OUT);
