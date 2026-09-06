#!/usr/bin/env node
/* ============================================================
   Optional server.

   The site is static and needs none of this: open
   arctic-monkeys/index.html on any host and everything works from the
   data baked in by tools/fetch_am_data.py.

   Run this instead when you want Genius answered live — annotations for
   tracks that were not baked, or fresher credits. It does two things:

     1. serves the site
     2. proxies /api/genius/* to api.genius.com with your token attached
     3. proxies /api/lyrics to lrclib.net for the full words (no key)

   The token stays on the server. The browser never sees it, which is the
   whole reason this file exists — Genius refuses cross-origin browser
   requests anyway, so calling it from the page is not an option.

   No dependencies, no framework, no platform assumptions. It reads PORT
   from the environment, which is what nearly every host sets, and falls
   back to 8080.

       cp .env.example .env      # put your token in
       node server.js
   ============================================================ */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;
const SITE = path.join(ROOT, 'arctic-monkeys');

/* ---------- .env, without a dependency ---------- */
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const TOKEN = (process.env.GENIUS_ACCESS_TOKEN || '').trim();
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

/* ---------- static file serving ---------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8'
};

// hashed-forever assets vs. markup that must revalidate
const IMMUTABLE = /\.(webp|png|jpe?g|woff2|svg)$/i;

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname.replace(/^\/+/, '')) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';

  // resolve inside the site directory, then verify — no traversal out
  let file = path.resolve(SITE, rel);
  if (!file.startsWith(SITE + path.sep) && file !== SITE) return notFound(res);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) return notFound(res);

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': IMMUTABLE.test(ext)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(file).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': code === 200 ? 'public, max-age=3600' : 'no-store'
  });
  res.end(payload);
}

/* ---------- the Genius proxy ---------- */

// only these endpoints, so the route cannot be used as an open relay
const ALLOWED = [
  /^search$/,
  /^songs\/\d+$/,
  /^artists\/\d+$/,
  /^referents$/
];

const cache = new Map();
const TTL = 1000 * 60 * 60 * 6;

function geniusProxy(req, res, url) {
  if (!TOKEN) {
    return json(res, 503, {
      error: 'no token',
      hint: 'set GENIUS_ACCESS_TOKEN in .env — the site falls back to its '
          + 'baked data without it'
    });
  }

  const endpoint = url.pathname.replace(/^\/api\/genius\/?/, '');
  if (!ALLOWED.some(rx => rx.test(endpoint))) {
    return json(res, 400, { error: 'endpoint not allowed', endpoint });
  }

  const target = `https://api.genius.com/${endpoint}${url.search}`;
  const hit = cache.get(target);
  if (hit && Date.now() - hit.at < TTL) return json(res, 200, hit.body);

  https.get(target, { headers: { Authorization: `Bearer ${TOKEN}` } }, up => {
    let raw = '';
    up.on('data', c => { raw += c; });
    up.on('end', () => {
      let body;
      try { body = JSON.parse(raw); } catch { body = { error: 'bad upstream response' }; }
      if (up.statusCode === 200) cache.set(target, { at: Date.now(), body });
      json(res, up.statusCode === 200 ? 200 : 502, body);
    });
  }).on('error', e => json(res, 502, { error: String(e.message) }));
}

/* ---------- words, from LRCLIB ----------

   Genius has no lyrics endpoint — credits, stats and annotations, and
   nothing else. LRCLIB is open, needs no key, and answers with a
   time-stamped LRC when it has one, which is what gives every line its
   real position in the song rather than the handful of cue points written
   against a thirty-second preview. Same route the Netlify function
   serves, so the page cannot tell which one answered.

   Nothing is written to disk: the words belong to their publishers and
   are passed through on request. */

function getJSON(target) {
  return new Promise((resolve, reject) => {
    https.get(target, {
      headers: { 'User-Agent': 'arctic-monkeys-fan-archive (static site)' }
    }, up => {
      let raw = '';
      up.on('data', c => { raw += c; });
      up.on('end', () => {
        if (up.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

/* A time-stamped result is worth more than a plain one, so prefer it even
   when it is not the first thing that came back. */
function bestOf(body) {
  const list = Array.isArray(body) ? body : (body ? [body] : []);
  return list.find(x => x && x.syncedLyrics) || list.find(x => x && x.plainLyrics) || null;
}

/** Plain words from lyrics.ovh, for what LRCLIB has not got. */
async function ovhLyrics(artist, track) {
  const body = await getJSON('https://api.lyrics.ovh/v1/'
    + encodeURIComponent(artist) + '/' + encodeURIComponent(track)).catch(() => null);
  const words = String((body && body.lyrics) || '').trim();
  return words.length > 40 ? words : null;
}

async function lyricsProxy(req, res, url) {
  const track = (url.searchParams.get('track') || '').trim();
  const artist = (url.searchParams.get('artist') || 'Arctic Monkeys').trim();
  const album = (url.searchParams.get('album') || '').trim();
  if (!track) return json(res, 400, { error: 'track required' });

  const key = `lyrics:${artist}|${album}|${track}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return json(res, 200, hit.body);

  const qs = new URLSearchParams({ track_name: track, artist_name: artist });
  if (album) qs.set('album_name', album);

  try {
    /* get is the exact match and the cheaper call; search is the fallback
       for titles carrying a remaster suffix or a feature credit the
       database spells differently. */
    let found = bestOf(await getJSON(`https://lrclib.net/api/get?${qs}`));
    if (!found) {
      const alt = new URLSearchParams({ track_name: track, artist_name: artist });
      found = bestOf(await getJSON(`https://lrclib.net/api/search?${alt}`));
    }
    if (!found) {
      /* LRCLIB is missing a handful of the B-sides and the live cuts.
         lyrics.ovh has no timings and no key either, but plain words for
         a song beat no words for it. */
      const words = await ovhLyrics(artist, track);
      if (words) {
        const body = { track, artist, duration: 0, synced: null, plain: words,
                       source: 'lyrics.ovh' };
        cache.set(key, { at: Date.now(), body });
        return json(res, 200, body);
      }
      return json(res, 404, { error: 'not found', track });
    }

    const body = {
      id: found.id,
      track: found.trackName,
      artist: found.artistName,
      duration: found.duration,
      synced: found.syncedLyrics || null,
      plain: found.plainLyrics || null,
      source: 'lrclib'
    };
    cache.set(key, { at: Date.now(), body });
    json(res, 200, body);
  } catch (e) {
    json(res, 502, { error: String(e && e.message) });
  }
}

/* ---------- routing ---------- */
http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  if (url.pathname === '/api/genius/health') {
    return json(res, 200, { ok: true, token: Boolean(TOKEN) });
  }
  if (url.pathname.startsWith('/api/genius/')) return geniusProxy(req, res, url);
  if (url.pathname === '/api/lyrics') return lyricsProxy(req, res, url);

  serveStatic(req, res, url.pathname);
}).listen(PORT, HOST, () => {
  console.log(`Arctic Monkeys archive on http://localhost:${PORT}`);
  console.log(TOKEN
    ? 'Genius proxy: on'
    : 'Genius proxy: off (no GENIUS_ACCESS_TOKEN) — serving baked data');
});
