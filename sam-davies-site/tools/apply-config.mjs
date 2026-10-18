// Applies site.config.json flags that cannot be runtime-only (crawlers do not run JS):
//   features.indexable → <meta name="robots"> in index.html + the global X-Robots-Tag in vercel.json.
// The private-lyrics path stays noindex/no-store regardless.
// Usage: node tools/apply-config.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SITE, readJSON, writeJSON } from './lib.mjs';

const config = await readJSON(path.join(SITE, 'site.config.json'));
const indexable = Boolean(config.features?.indexable);

const htmlPath = path.join(SITE, 'index.html');
let html = await readFile(htmlPath, 'utf8');
const META = '<meta name="robots" content="noindex, nofollow">';
html = html.replace(/<meta name="robots"[^>]*>\n?/, '');
if (!indexable) html = html.replace(/(<meta name="description"[^>]*>\n)/, `$1${META}\n`);
await writeFile(htmlPath, html);

const vPath = path.join(SITE, 'vercel.json');
const vercel = await readJSON(vPath);
const global = vercel.headers.find((h) => h.source === '/(.*)');
global.headers = global.headers.filter((h) => h.key !== 'X-Robots-Tag');
if (!indexable) global.headers.unshift({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
await writeJSON(vPath, vercel);

console.log(`indexable=${indexable}: robots meta ${indexable ? 'removed' : 'present'}, global X-Robots-Tag ${indexable ? 'removed' : 'present'} (private lyrics stay noindex).`);
