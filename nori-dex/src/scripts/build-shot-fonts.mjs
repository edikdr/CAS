/* Собирает js/shot-fonts.js: шрифты из fonts/ в виде data-URL для снимков экрана.
   Запуск: node scripts/build-shot-fonts.mjs (после замены файлов в fonts/). */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NUNITO = { cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' };
const b64 = (f) => readFileSync(join(root, 'fonts', f)).toString('base64');
let css = '';
for (const [k, r] of Object.entries(NUNITO)) css += `@font-face{font-family:'Nunito';font-weight:500 900;src:url(data:font/woff2;base64,${b64(`nunito-${k}.woff2`)}) format('woff2');unicode-range:${r};}\n`;
for (const [k, r] of Object.entries(NUNITO)) css += `@font-face{font-family:'Press Start 2P';font-weight:400;src:url(data:font/woff2;base64,${b64(`pressstart-${k}.woff2`)}) format('woff2');unicode-range:${r};}\n`;
css += `@font-face{font-family:'Tiny5';font-weight:400;src:url(data:font/woff2;base64,${b64('tiny5.woff2')}) format('woff2');}\n`;
writeFileSync(join(root, 'js', 'shot-fonts.js'), `/* Сгенерировано scripts/build-shot-fonts.mjs: шрифты в виде data-URL, нужны только для снимков экрана. */\nwindow.PL = window.PL || {};\nPL.shotFontsCSS = ${JSON.stringify(css)};\n`);
console.log('js/shot-fonts.js готов');
