// Dev/test static server for site/ with HTTP Range support (video seeking needs it) and
// the same Content-Types as vercel.json. Usage: node tools/serve.mjs [--port 4173] [--dir site] [--fixtures tests/fixtures]
// --fixtures mounts a folder at /__fixture__/ (e2e only; never part of the deployed site).
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { args, ROOT } from './lib.mjs';

const a = args();
const dir = path.resolve(a.dir || path.join(ROOT, 'site'));
const port = Number(a.port || process.env.PORT || 4173);
const fixtures = a.fixtures ? path.resolve(a.fixtures) : null;
// Apply vercel.json headers (CSP, nosniff, …) so local runs and e2e enforce production policy.
const vercel = JSON.parse(await readFile(path.join(dir, 'vercel.json'), 'utf8').catch(() => '{"headers":[]}'));
const rules = (vercel.headers || []).map((r) => ({ re: new RegExp(`^${r.source}$`), headers: r.headers }));
const prodHeaders = (pathname) => Object.fromEntries(rules.filter((r) => r.re.test(pathname)).flatMap((r) => r.headers.map((h) => [h.key, h.value])));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.lrc': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const pathname = decodeURIComponent(url.pathname);
    const base = fixtures && pathname.startsWith('/__fixture__/') ? fixtures : dir;
    let file = path.join(base, base === dir ? pathname : pathname.slice('/__fixture__'.length));
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    let st = await stat(file).catch(() => null);
    if (st?.isDirectory()) { file = path.join(file, 'index.html'); st = await stat(file).catch(() => null); }
    if (!st) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, ...prodHeaders(pathname), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      let start = range[1] === '' ? st.size - Number(range[2]) : Number(range[1]);
      let end = range[1] === '' || range[2] === '' ? st.size - 1 : Math.min(Number(range[2]), st.size - 1);
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    }
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
