/* ============================================================
   The Genius bridge — the part that holds the token.

   WHY THERE IS A SERVER SIDE AT ALL. api.genius.com wants
   `Authorization: Bearer <token>` on every call and sends no CORS
   headers, so a browser cannot call it directly and a token put in a
   <script> is a token published. This module is the only thing that ever
   sees GENIUS_ACCESS_TOKEN; the browser talks to /api/genius and never
   learns it exists.

   WHAT GENIUS DOES AND DOES NOT GIVE YOU. Its API is a metadata API:
   ids, credits, album, release date, artwork, the song's own
   description, annotation counts, and the media links it knows about.
   It does NOT serve lyric text through the API, and scraping the page
   for it is both against their terms and one redesign away from
   breaking. So the words are fetched from LRCLIB — open, keyless, and
   what a number of open-source players use — and Genius supplies
   everything around them. Both are named in the payload's `attribution`
   so the page can credit them honestly.

   ONE CALL DOES THE WHOLE JOB. `op=track` runs the search, the song
   lookup and the lyric fetch together and answers once. That is one
   round trip from the browser for a panel that would otherwise make
   four, and it keeps every retry, every fallback and every bit of
   matching logic on this side.

   Everything here is plain fetch on globals, so the same file runs on
   Vercel, Netlify, Cloudflare Pages and bare Node with no dependencies.
   ============================================================ */

const GENIUS = 'https://api.genius.com';
const LRCLIB = 'https://lrclib.net/api';
const UA = 'hollywood-undead-fan-archive/2 (+static fan page; contact via host)';

/* ------------------------------------------------------------
   A small TTL cache.

   Serverless containers are reused between invocations often enough that
   this earns its keep, and it costs nothing when they are not. Bounded,
   because a warm container that never restarts should not grow forever.
   ------------------------------------------------------------ */
const TTL = 6 * 60 * 60 * 1000;      // six hours
const MAX = 400;
const cache = new Map();

function cached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.until) { cache.delete(key); return null; }
  /* touch: re-inserting moves it to the end, so the eviction below
     drops the least recently used rather than the oldest. */
  cache.delete(key); cache.set(key, hit);
  return hit.value;
}

function keep(key, value) {
  cache.set(key, { value, until: Date.now() + TTL });
  while (cache.size > MAX) cache.delete(cache.keys().next().value);
}

/* ------------------------------------------------------------ helpers */

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Title as Genius is likely to have filed it, minus the store's noise. */
function bare(title) {
  return String(title || '')
    .replace(/\s*[([]\s*(feat|ft|with)[^)\]]*[)\]]/ig, '')
    .replace(/\s*[([][^)\]]*\b(remaster(ed)?|explicit|bonus|deluxe|album version|live)\b[^)\]]*[)\]]/ig, '')
    .replace(/\s*-\s*(remaster(ed)?|explicit|bonus track|single version)\b.*$/i, '')
    .trim();
}

async function getJSON(url, { token, timeout = 8000 } = {}) {
  const stop = AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined;
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(url, { headers, signal: stop });
  if (!r.ok) {
    const err = new Error(`${r.status} ${r.statusText}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

/* ------------------------------------------------------------ Genius */

/**
 * Find one song.
 *
 * Genius' /search is a relevance search over everything, so the first
 * hit is regularly a remix, a live version, or another artist's song
 * with the same name. Scoring the results by artist first and title
 * second is what makes this reliable rather than lucky.
 */
async function findSong(title, artist, token) {
  const q = `${artist} ${bare(title)}`.trim();
  const body = await getJSON(
    `${GENIUS}/search?q=${encodeURIComponent(q)}`, { token });

  const hits = ((body && body.response && body.response.hits) || [])
    .filter(h => h && h.type === 'song' && h.result)
    .map(h => h.result);
  if (!hits.length) return null;

  const wantArtist = norm(artist);
  const wantTitle = norm(bare(title));

  const score = s => {
    const a = norm(s.primary_artist && s.primary_artist.name);
    const t = norm(s.title);
    let n = 0;
    if (a === wantArtist) n += 60;
    else if (a.includes(wantArtist) || wantArtist.includes(a)) n += 34;
    if (t === wantTitle) n += 40;
    else if (t.startsWith(wantTitle) || wantTitle.startsWith(t)) n += 24;
    else if (t.includes(wantTitle)) n += 12;
    /* Genius files translations and transcriptions as songs of their own
       and they match a title exactly, so they are pushed down. */
    if (/translation|traduc|перевод|romanization/i.test(s.title)) n -= 45;
    if (s.lyrics_state && s.lyrics_state !== 'complete') n -= 10;
    return n;
  };

  const best = hits.map(s => ({ s, n: score(s) })).sort((a, b) => b.n - a.n)[0];
  return best && best.n >= 34 ? best.s : null;      // artist must match at least loosely
}

/** Everything Genius knows about one song id, flattened. */
async function songDetail(id, token) {
  const body = await getJSON(
    `${GENIUS}/songs/${encodeURIComponent(id)}?text_format=plain`, { token });
  const s = (body && body.response && body.response.song) || null;
  if (!s) return null;

  const names = role => (s.producer_artists && role === 'producer'
    ? s.producer_artists
    : s.writer_artists || []).map(a => a.name).filter(Boolean);

  const desc = s.description && s.description.plain;

  return {
    id: s.id,
    title: s.title,
    fullTitle: s.full_title,
    url: s.url,
    artist: (s.primary_artist && s.primary_artist.name) || null,
    artistUrl: (s.primary_artist && s.primary_artist.url) || null,
    featured: (s.featured_artists || []).map(a => a.name),
    producers: names('producer'),
    writers: names('writer'),
    album: s.album ? {
      name: s.album.name,
      url: s.album.url,
      /* The sleeve is deliberately not passed through. The page shows no
         album artwork — see css/style.css — and a field the client is
         told to ignore is a field somebody will render by accident. */
    } : null,
    releaseDate: s.release_date_for_display || s.release_date || null,
    description: desc && desc !== '?' ? desc : null,
    annotations: s.annotation_count || 0,
    pageviews: (s.stats && s.stats.pageviews) || null,
    media: (s.media || [])
      .filter(m => m && m.url && m.provider)
      .map(m => ({ provider: m.provider, url: m.url }))
  };
}

/* ------------------------------------------------------------ LRCLIB */

/**
 * The words.
 *
 * Fetched here rather than in the browser for one practical reason: on
 * this side there is no CORS, no preflight and no ad-blocker between the
 * page and the answer, and the panel gets its lyrics in the same
 * response as its credits.
 */
async function words(title, artist, album) {
  const one = async url => {
    try {
      const body = await getJSON(url);
      const list = Array.isArray(body) ? body : [body];
      return list.find(x => x && x.syncedLyrics)
        || list.find(x => x && x.plainLyrics)
        || null;
    } catch { return null; }
  };

  const clean = bare(title);
  const exact = new URLSearchParams({ track_name: clean, artist_name: artist });
  if (album) exact.set('album_name', album);

  let hit = await one(`${LRCLIB}/get?${exact}`);
  if (!hit) {
    hit = await one(`${LRCLIB}/search?${new URLSearchParams({
      track_name: clean, artist_name: artist })}`);
  }
  if (!hit) return null;

  if (hit.syncedLyrics) {
    const lines = parseLrc(hit.syncedLyrics);
    if (lines.length) return { synced: true, duration: hit.duration || 0, lines };
  }
  if (hit.plainLyrics) {
    const lines = String(hit.plainLyrics).split(/\r?\n/)
      .map(t => t.trim()).filter(Boolean).map(text => ({ t: null, text }));
    if (lines.length) return { synced: false, duration: hit.duration || 0, lines };
  }
  return null;
}

/** `[mm:ss.xx] text` — the whole of the LRC format. */
function parseLrc(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach(raw => {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) return;
    const line = raw.replace(/\[[^\]]*\]/g, '').trim();
    /* A line repeated at several timestamps is written once per stamp;
       a stamp with no words is an instrumental gap and is kept, because
       a gap is information about the song. */
    stamps.forEach(m => out.push({
      t: (+m[1]) * 60 + (+m[2]) + (m[3] ? Number('0.' + m[3]) : 0),
      text: line || '♪'
    }));
  });
  return out.sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------ the API */

export function tokenFrom(env = {}) {
  return env.GENIUS_ACCESS_TOKEN || env.GENIUS_API_TOKEN
    || env.GENIUS_TOKEN || env.GENIUS_CLIENT_ACCESS_TOKEN || '';
}

/**
 * Answer one request.
 *
 * `params` is a plain object of the query string; `env` is whatever
 * carries the environment on this platform. Returns
 * `{ status, body, cache }` and throws nothing — a failure on either
 * upstream is reported in the body, because a track panel that opens
 * with the credits missing is better than one that does not open.
 */
export async function handle(params = {}, env = {}) {
  const token = tokenFrom(env);
  const op = String(params.op || 'track');

  if (op === 'status') {
    return { status: 200, cache: 0,
             body: { ok: true, configured: !!token, lyrics: 'lrclib' } };
  }

  const title = String(params.title || params.q || '').slice(0, 200).trim();
  const artist = String(params.artist || 'Hollywood Undead').slice(0, 120).trim();
  const album = String(params.album || '').slice(0, 200).trim();
  if (!title) {
    return { status: 400, cache: 0, body: { ok: false, error: 'title is required' } };
  }

  const key = `${op}|${norm(artist)}|${norm(title)}|${norm(album)}`;
  const hit = cached(key);
  if (hit) return { status: 200, cache: TTL / 1000, body: hit };

  /* The two upstreams are independent and neither blocks the other:
     no token still returns the words, and a Genius outage still returns
     the words. */
  const [meta, lyrics] = await Promise.all([
    token
      ? (async () => {
          const found = await findSong(title, artist, token);
          return found ? await songDetail(found.id, token) : null;
        })().catch(e => ({ __error: e.status === 401
            ? 'Genius rejected the token (401).'
            : `Genius: ${e.message}` }))
      : Promise.resolve(null),
    op === 'meta' ? Promise.resolve(null)
      : words(title, artist, album).catch(() => null)
  ]);

  const failed = meta && meta.__error ? meta.__error : null;

  const body = {
    ok: true,
    configured: !!token,
    query: { title, artist, album: album || null },
    song: failed ? null : meta,
    lyrics,
    error: failed,
    attribution: {
      lyrics: lyrics
        ? { name: 'LRCLIB', url: 'https://lrclib.net',
            note: lyrics.synced ? 'timed transcription' : 'plain transcription' }
        : null,
      metadata: (!failed && meta)
        ? { name: 'Genius', url: meta.url, note: 'credits, annotations and release data' }
        : null
    }
  };

  /* A miss on both sides is not worth remembering: it is usually a
     spelling this build has not learned yet, or a network that was down
     for a moment, and both are worth trying again. */
  if (body.song || body.lyrics) keep(key, body);

  return { status: 200, cache: body.song || body.lyrics ? 3600 : 0, body };
}
