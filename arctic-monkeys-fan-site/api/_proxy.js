/* ============================================================
   The two routes, as one module.

   netlify/functions/genius.mjs answers /api/genius/* and /api/lyrics on
   Netlify. This is the same two routes for anything that reads a Node
   `api/` directory instead — Vercel is the obvious one — where the path
   comes from the file name rather than from a config block:

       api/genius/[...path].js   →  /api/genius/*
       api/lyrics.js             →  /api/lyrics

   Nothing platform-specific is in here beyond the (req, res) signature,
   so a host that speaks that convention needs no configuration for the
   routes at all: only GENIUS_ACCESS_TOKEN in its environment, and only
   for the Genius half. The lyrics half needs no key.

   The token is read from the environment and never leaves the server —
   which it cannot, because Genius refuses cross-origin browser requests.
   ============================================================ */

// only these, so the route cannot be used as an open relay
const ALLOWED = [/^search$/, /^songs\/\d+$/, /^artists\/\d+$/, /^referents$/];

function send(res, code, body, cache) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}

/** /api/genius/<endpoint> — health, or a proxied Genius call. */
async function genius(req, res, endpoint, search) {
  if (endpoint === 'health') {
    return send(res, 200, { ok: true, token: Boolean(process.env.GENIUS_ACCESS_TOKEN) });
  }

  const token = (process.env.GENIUS_ACCESS_TOKEN || '').trim();
  if (!token) {
    return send(res, 503, {
      error: 'no token',
      hint: 'set GENIUS_ACCESS_TOKEN in the site environment variables and '
          + 'redeploy — the page falls back to its keyless sources without it'
    });
  }

  if (!ALLOWED.some(rx => rx.test(endpoint))) {
    return send(res, 400, { error: 'endpoint not allowed', endpoint });
  }

  try {
    const up = await fetch(`https://api.genius.com/${endpoint}${search || ''}`,
      { headers: { Authorization: `Bearer ${token}` } });
    const body = await up.json();
    return up.ok ? send(res, 200, body, 'public, max-age=21600') : send(res, 502, body);
  } catch (e) {
    return send(res, 502, { error: String(e && e.message) });
  }
}

/**
 * /api/lyrics — the words.
 *
 * Genius has no lyrics endpoint at all: credits, statistics and community
 * annotations, and nothing else. LRCLIB is open, keyless, and usually
 * answers with a time-stamped LRC, which is what lets the follow-along
 * marker run the whole song rather than the thirty seconds a preview
 * covers. lyrics.ovh picks up the handful LRCLIB has not got.
 *
 * Nothing is written to disk. The words belong to their publishers and
 * are passed through on request.
 */
async function lyrics(req, res, params) {
  const track = (params.get('track') || '').trim();
  const artist = (params.get('artist') || 'Arctic Monkeys').trim();
  const album = (params.get('album') || '').trim();
  if (!track) return send(res, 400, { error: 'track required' });

  const qs = new URLSearchParams({ track_name: track, artist_name: artist });
  if (album) qs.set('album_name', album);

  try {
    let hit = await pick(`https://lrclib.net/api/get?${qs}`);
    if (!hit) {
      const alt = new URLSearchParams({ track_name: track, artist_name: artist });
      hit = await pick(`https://lrclib.net/api/search?${alt}`);
    }
    if (hit) {
      return send(res, 200, {
        id: hit.id, track: hit.trackName, artist: hit.artistName,
        duration: hit.duration,
        synced: hit.syncedLyrics || null,
        plain: hit.plainLyrics || null,
        source: 'lrclib'
      }, 'public, max-age=86400');
    }

    const plain = await ovh(artist, track);
    if (plain) {
      return send(res, 200, {
        track, artist, duration: 0, synced: null, plain, source: 'lyrics.ovh'
      }, 'public, max-age=86400');
    }
    return send(res, 404, { error: 'not found', track }, 'public, max-age=3600');
  } catch (e) {
    return send(res, 502, { error: String(e && e.message) });
  }
}

async function pick(endpoint) {
  const r = await fetch(endpoint, {
    headers: { 'User-Agent': 'arctic-monkeys-fan-archive (static site)' }
  });
  if (!r.ok) return null;
  const body = await r.json();
  const list = Array.isArray(body) ? body : [body];
  /* A time-stamped result is worth more than a plain one, so prefer it
     even when it is not the first thing that came back. */
  return list.find(x => x && x.syncedLyrics) || list.find(x => x && x.plainLyrics) || null;
}

async function ovh(artist, track) {
  try {
    const r = await fetch('https://api.lyrics.ovh/v1/'
      + encodeURIComponent(artist) + '/' + encodeURIComponent(track));
    if (!r.ok) return null;
    const b = await r.json();
    const words = String((b && b.lyrics) || '').trim();
    return words.length > 40 ? words : null;
  } catch { return null; }
}

/** The query string, whichever way the host chose to hand it over. */
function query(req) {
  const raw = String(req.url || '');
  const i = raw.indexOf('?');
  return new URLSearchParams(i < 0 ? '' : raw.slice(i + 1));
}

module.exports = { genius, lyrics, query };
