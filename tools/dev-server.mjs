/*
 * tools/dev-server.mjs - tiny static server for development (no dependencies).
 *
 *   node tools/dev-server.mjs [--dir <root>] [--port 8000] [--host 127.0.0.1]
 *
 * Serves the source tree by default (or a build with --dir dist) with the same response
 * headers as production (read from vercel.json: CSP, noindex, referrer policy), except
 * Cache-Control, which is always no-store here. Supports Range requests so local previews
 * (assets/previews-local/, never deployed) can seek. Dot-files (.env, .git) are never served.
 * Use --host 0.0.0.0 to open it from a phone on the same network.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const dir = path.resolve(arg('dir', ROOT));
const port = Number(arg('port', 8000));
const host = arg('host', '127.0.0.1');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.wasm': 'application/wasm',
};

const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
const rules = vercel.headers.map((r) => [new RegExp(`^${r.source}$`), r.headers]);

function headersFor(urlPath) {
  const out = {};
  for (const [re, list] of rules) if (re.test(urlPath)) for (const h of list) out[h.key] = h.value;
  out['Cache-Control'] = 'no-store';
  return out;
}

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(dir, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath);
  const headers = headersFor(urlPath);
  const deny = (code) => { res.writeHead(code, { ...headers, 'Content-Type': 'text/plain' }); res.end(String(code)); };

  if (!file.startsWith(dir + path.sep) || urlPath.split('/').some((p) => p.startsWith('.'))) return deny(403);
  let info;
  try { info = await stat(file); } catch { return deny(404); }
  if (!info.isFile()) return deny(404);

  headers['Content-Type'] = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  headers['Accept-Ranges'] = 'bytes';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 });
    return req.method === 'HEAD' ? res.end() : createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': info.size });
  return req.method === 'HEAD' ? res.end() : createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(`dev server: http://${host}:${port}/  (serving ${path.relative(process.cwd(), dir) || '.'})`);
});
