import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const SCRIPTS = ['js/data.js', 'js/collage.js', 'js/particles.js', 'js/api.js', 'js/visualizer.js', 'js/app.js'];
const MIME = { '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const dataUri = (filename) => {
  const assetPath = path.join(root, 'assets', filename);
  if (!fs.existsSync(assetPath)) return null;
  const type = MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  return `data:${type};base64,${fs.readFileSync(assetPath).toString('base64')}`;
};

let html = read('index.html');
let css = read('css/style.css');

/* assets referenced from the stylesheet */
css = css.replace(/url\((['"]?)(?:\.\.\/)?assets\/([^)'"]+)\1\)/g, (whole, quote, filename) => {
  const uri = dataUri(filename);
  return uri ? `url(${quote}${uri}${quote})` : whole;
});

/* replacement callbacks, not strings: a literal "$$" or "$&" inside the inlined
   source would otherwise be eaten as a replacement pattern */
html = html.replace(/\s*<link rel="stylesheet" href="css\/style\.css">/, () => `\n<style>\n${css}\n</style>`);

for (const script of SCRIPTS) {
  const tag = new RegExp(`\\s*<script src="${script.replace('.', '\\.')}"></script>`);
  if (!tag.test(html)) throw new Error(`index.html does not reference ${script}`);
  const source = read(script);
  html = html.replace(tag, () => `\n<script>\n${source}\n</script>`);
}

/* every remaining assets/ reference — markup attributes and JS string literals alike */
html = html.replace(/assets\/([A-Za-z0-9._-]+)/g, (whole, filename) => dataUri(filename) || whole);

const out = path.join(root, 'the-neighbourhood-single.html');
fs.writeFileSync(out, html);
console.log(`Built the-neighbourhood-single.html (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
