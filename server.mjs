#!/usr/bin/env node
/* ============================================================
   The whole site on one port: the static folder, and the two functions.

     GENIUS_ACCESS_TOKEN=xxxx node server.mjs 8080

   This is the fourth deployment target and the one with no platform
   attached — a VPS, a container, a Raspberry Pi, or a laptop checking
   that the token works before it is pasted into a dashboard. The routes
   it serves are exactly the routes Vercel, Netlify and Cloudflare Pages
   serve, so what is tested here is what ships.

   No dependencies. Node 18 or newer, for global fetch.
   ============================================================ */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handle as genius } from './api/_genius.mjs';
import { handle as itunes } from './api/_itunes.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav'
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
};

const json = (res, { status, body, cache }) => send(res, status,
  JSON.stringify(body, null, 2), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache ? `public, max-age=${cache}` : 'no-store'
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const params = Object.fromEntries(url.searchParams);

  try {
    if (url.pathname === '/api/genius') return json(res, await genius(params, process.env));
    if (url.pathname === '/api/itunes') return json(res, await itunes(params));

    /* Everything under the folder, and nothing above it: the path is
       normalised and then required to still start at the root, so
       ../../etc/passwd resolves out of range and is refused. */
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT.replace(/[\\/]$/, '') + sep)) return send(res, 403, 'no');

    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) return send(res, 404, 'not found');

    /* Only the immutable things under assets/ are cached. Markup, code
       and the manifests are not: a stale js/ file behind a fresh page is
       the single most confusing bug a static site can have, and on a dev
       server it is not worth one saved request. The hosting configs
       (vercel.json, netlify.toml) set the long cache on assets/ in
       production, which is where it belongs. */
    const ext = extname(file).toLowerCase();
    const immutable = rel.startsWith('/assets/') && ext !== '.json';
    send(res, 200, await readFile(file), {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
  } catch (e) {
    send(res, 500, String(e && e.message || e));
  }
});

server.listen(PORT, () => {
  const on = !!(process.env.GENIUS_ACCESS_TOKEN || process.env.GENIUS_API_TOKEN);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Genius: ${on ? 'token found — credits and metadata are live'
    : 'no token — set GENIUS_ACCESS_TOKEN to turn credits on'}`);
  console.log('  Words: LRCLIB (no key needed)\n');
});
