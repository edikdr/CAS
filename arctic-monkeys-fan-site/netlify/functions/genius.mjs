/* ============================================================
   Genius proxy, as a serverless function.

   Netlify (and anything else that runs standard handlers) sets
   GENIUS_ACCESS_TOKEN in the platform's own environment — no .env file
   is deployed, and the token never reaches the browser. Genius refuses
   cross-origin browser requests anyway, so a proxy is the only way the
   page can read it at all.

   `export const config` at the bottom claims /api/genius/* and
   /api/lyrics, the same paths server.js serves locally — the site does
   not know or care which one answered. netlify.toml repeats those two as
   redirects, so the route works whether the platform honours v2 path
   config or only the classic /.netlify/functions/ mapping.

   /api/lyrics is a second, unrelated upstream: LRCLIB, which is open and
   needs no key. Genius has no lyrics endpoint — it serves credits, stats
   and annotations, and nothing else — so the words come from there.

   The .mjs extension is deliberate. Netlify's v2 functions are ESM, and a
   bare .js here would be read as CommonJS unless a package.json declared
   otherwise; .mjs removes the ambiguity without adding one.
   ============================================================ */

// only these, so the route cannot be used as an open relay
const ALLOWED = [/^search$/, /^songs\/\d+$/, /^artists\/\d+$/, /^referents$/];

export default async (request, context) => {
  const url = new URL(request.url);
  /* Netlify may hand the request over on either path shape: the v2 route
     declared below, or the classic /.netlify/functions/ one the redirects
     in netlify.toml use. Normalise before anything looks at it. */
  const FN = '/.netlify/functions/genius';
  let route = url.pathname;
  if (route.startsWith(FN)) {
    const rest = route.slice(FN.length) || '/';
    route = rest.startsWith('/lyrics') ? '/api/lyrics' : '/api/genius' + rest;
  }

  const json = (code, body, cache) =>
    new Response(JSON.stringify(body), {
      status: code,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cache || 'no-store'
      }
    });

  if (/^\/api\/lyrics\b/.test(route)) return lyrics(url, json);

  const endpoint = route.replace(/^\/api\/genius\/?/, '');

  if (endpoint === 'health') {
    return json(200, { ok: true, token: Boolean(process.env.GENIUS_ACCESS_TOKEN) });
  }

  const token = (process.env.GENIUS_ACCESS_TOKEN || '').trim();
  if (!token) {
    return json(503, {
      error: 'no token',
      hint: 'set GENIUS_ACCESS_TOKEN in the site environment variables — '
          + 'the page falls back to its baked data without it'
    });
  }

  if (!ALLOWED.some(rx => rx.test(endpoint))) {
    return json(400, { error: 'endpoint not allowed', endpoint });
  }

  try {
    const upstream = await fetch(
      `https://api.genius.com/${endpoint}${url.search}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const body = await upstream.json();
    return upstream.ok
      ? json(200, body, 'public, max-age=21600')
      : json(502, body);
  } catch (e) {
    return json(502, { error: String(e && e.message) });
  }
};

/**
 * Words, from LRCLIB.
 *
 * Open, keyless, and used by a number of open-source players. It answers
 * with both a plain text and a time-stamped LRC when it has one, which is
 * what gives every line its real position in the song instead of the
 * handful of cue points written against a thirty-second preview.
 *
 * Nothing is written to disk and nothing is cached beyond the CDN edge —
 * the words belong to their publishers, and the site only passes them
 * through on request.
 */
async function lyrics(url, json) {
  const track = (url.searchParams.get('track') || '').trim();
  const artist = (url.searchParams.get('artist') || 'Arctic Monkeys').trim();
  const album = (url.searchParams.get('album') || '').trim();
  if (!track) return json(400, { error: 'track required' });

  const qs = new URLSearchParams({ track_name: track, artist_name: artist });
  if (album) qs.set('album_name', album);

  try {
    /* get/ is the exact match and the cheaper call; search/ is the
       fallback for the titles that carry a remaster suffix or a feature
       credit the database spells differently. */
    let hit = await pick(`https://lrclib.net/api/get?${qs}`);
    if (!hit) {
      const alt = new URLSearchParams({ track_name: track, artist_name: artist });
      hit = await pick(`https://lrclib.net/api/search?${alt}`);
    }
    if (!hit) {
      /* LRCLIB is missing a handful of the B-sides and the live cuts.
         lyrics.ovh has no timings and no key either, but plain words for
         a song beat no words for it. */
      const plain = await ovh(artist, track);
      if (plain) {
        return json(200, {
          track, artist, duration: 0, synced: null, plain, source: 'lyrics.ovh'
        }, 'public, max-age=86400');
      }
      return json(404, { error: 'not found', track }, 'public, max-age=3600');
    }

    return json(200, {
      id: hit.id,
      track: hit.trackName,
      artist: hit.artistName,
      duration: hit.duration,
      synced: hit.syncedLyrics || null,
      plain: hit.plainLyrics || null,
      source: 'lrclib'
    }, 'public, max-age=86400');
  } catch (e) {
    return json(502, { error: String(e && e.message) });
  }
}

/** Plain words from lyrics.ovh, for what LRCLIB has not got. */
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

export const config = { path: ['/api/genius/*', '/api/lyrics'] };
