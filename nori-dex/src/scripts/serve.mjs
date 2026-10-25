#!/usr/bin/env node
/* Local preview of dist/ with the production headers (no dependencies).
 *
 *   npm run build && npm run serve        # http://127.0.0.1:4173/   (PORT=8080 npm run serve)
 *
 * Applies the "headers" rules of vercel.json (CSP, caching, nosniff, ...) in order, later rules
 * overriding earlier ones like Vercel does, and gzips text responses. A CSP problem shows up here
 * exactly as it would on the deployed site.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = +process.env.PORT || 4173;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing: run npm run build first');
  process.exit(1);
}
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const RULES = (vercel.headers || []).map((h) => ({
  re: new RegExp('^' + h.source.split('(.*)').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*)') + '$'),
  headers: h.headers,
}));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
};

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  let rel = decodeURIComponent(url);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  const headers = { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' };
  for (const r of RULES) if (r.re.test(url)) for (const h of r.headers) headers[h.key] = h.value;
  let body = fs.readFileSync(file);
  if (/^(text\/|application\/json|image\/svg)/.test(headers['content-type']) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    body = zlib.gzipSync(body, { level: 9 });
    headers['content-encoding'] = 'gzip';
    headers['vary'] = 'Accept-Encoding';
  }
  headers['content-length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(PORT, '127.0.0.1', () => console.log('dist/ with production headers: http://127.0.0.1:' + PORT + '/'));
