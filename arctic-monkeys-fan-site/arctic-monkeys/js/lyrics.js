/* ============================================================
   The words.

   Genius does not serve lyrics. Its API answers with credits, release
   dates, statistics and community annotations, and that is the whole of
   it — the words themselves are on the page, behind terms that say not
   to scrape them. So the site asks somewhere else.

   LRCLIB (lrclib.net) is open, needs no key, and is what a number of
   open-source players use. It answers with the plain text and, more
   often than not, a time-stamped LRC. The LRC is the better answer by
   some distance: the follow-along marker gets the song's real timing for
   its whole length instead of the handful of cue points written by hand
   against a thirty-second preview.

   Four places are asked, in the order that gets words on screen soonest:
   whatever tools/fetch_lyrics.py baked in, the site's own /api/lyrics,
   LRCLIB straight from the browser, and lyrics.ovh after that. The two
   direct calls are what make the words work on a plain static host with
   no function behind it, which is the deploy most people actually do.

   Nothing is stored in the repository and nothing is written to disk.
   The words are fetched when a window is opened and live in the tab for
   as long as it is open. They belong to their publishers.
   ============================================================ */

const Lyrics = {
  cache: new Map(),
  probe: null,

  /* The same two path shapes the Genius proxy is reached by: a host can
     route the declared /api/lyrics, or only the classic function path.
     Both are served by the same function, which accepts either. */
  routes: ['/api/lyrics', '/.netlify/functions/genius/lyrics'],

  /** Is the site's own lyrics route answering? Probed once; shared. */
  reachable() {
    if (this.probe) return this.probe;
    this.probe = (async () => {
      for (const route of this.routes) {
        try {
          const r = await fetch(`${route}?track=${encodeURIComponent('Do I Wanna Know?')}`,
            { cache: 'no-store' });
          // 404 is an answer; the site's own HTML is not
          if (/json/.test(r.headers.get('content-type') || '') && (r.ok || r.status === 404)) {
            return route;
          }
        } catch { /* try the other shape */ }
      }
      return null;
    })();
    return this.probe;
  },

  /**
   * The full words for one track, in the same shape as the baked cues so
   * the window does not care which it got.
   *
   * Three sources, in the order that gets words on the screen soonest:
   *
   *   1. js/lyrics-data.js, if tools/fetch_lyrics.py has been run. No
   *      network at all, so the whole song is there on the frame the
   *      window opens.
   *   2. the site's own /api/lyrics, which server.js and the Netlify
   *      function both answer.
   *   3. lrclib.net straight from the browser.
   *
   * (3) is what makes every song's words work on a plain static host with
   * no function behind it — the deploy that (2) exists for is the one
   * most people do not do. LRCLIB serves the browser directly; if a host
   * or an extension blocks it the earlier sources still stand, and
   * failing all three the baked cue points stay on screen.
   *
   * Returns null when there is nothing to be had, and the caller keeps
   * whatever it was already showing.
   */
  async get(track, album) {
    const key = `${album || ''}|${track}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const out = (await this.baked(track))
      || (await this.viaRoute(track, album))
      || (await this.viaLrclib(track, album))
      || (await this.viaOvh(track));

    this.cache.set(key, out);
    if (out && window.Diag) Diag.set('lyrics', `${out.via} · ${out.synced ? 'timed' : 'plain'}`);
    return out;
  },

  /** Whatever tools/fetch_lyrics.py wrote into js/lyrics-data.js. */
  async baked(track) {
    if (typeof LYRICS_DATA === 'undefined' || !LYRICS_DATA.tracks) return null;
    const rec = LYRICS_DATA.tracks[track]
      || LYRICS_DATA.tracks[Object.keys(LYRICS_DATA.tracks)
        .find(k => k.toLowerCase() === String(track).toLowerCase()) || ''];
    const got = shape(rec);
    if (got) got.via = 'baked';
    return got;
  },

  /** The site's own route: server.js, or the serverless function. */
  async viaRoute(track, album) {
    const route = await this.reachable();
    if (!route) return null;

    const qs = new URLSearchParams({ track, artist: ARTIST });
    if (album) qs.set('album', album);
    try {
      const r = await fetch(`${route}?${qs}`);
      /* A static host with no function behind the route answers a missing
         path with the site's own HTML, which JSON.parse would choke on. */
      if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
      const body = await r.json();
      const got = shape(body);
      if (got) got.via = (body && body.source) || 'lrclib';
      return got;
    } catch {
      return null;      // offline, blocked, or no proxy
    }
  },

  /**
   * LRCLIB, asked directly.
   *
   * `get` is the exact match and the cheaper call; `search` is the
   * fallback for the titles LRCLIB spells differently — a remaster
   * suffix, a feature credit, an apostrophe of a different shape.
   */
  async viaLrclib(track, album) {
    const one = async url => {
      try {
        const r = await fetch(url, { mode: 'cors' });
        if (!r.ok) return null;
        const body = await r.json();
        const list = Array.isArray(body) ? body : [body];
        return list.find(x => x && x.syncedLyrics)
          || list.find(x => x && x.plainLyrics) || null;
      } catch { return null; }
    };

    const exact = new URLSearchParams({ track_name: track, artist_name: ARTIST });
    if (album) exact.set('album_name', album);
    let hit = await one(`https://lrclib.net/api/get?${exact}`);
    if (!hit) {
      const loose = new URLSearchParams({ track_name: track, artist_name: ARTIST });
      hit = await one(`https://lrclib.net/api/search?${loose}`);
    }
    if (!hit) return null;

    const got = shape({
      track: hit.trackName, duration: hit.duration,
      synced: hit.syncedLyrics || null, plain: hit.plainLyrics || null
    });
    if (got) got.via = 'lrclib · direct';
    return got;
  },

  /**
   * lyrics.ovh, asked directly — the last resort.
   *
   * No timings and no key. LRCLIB is missing a handful of the B-sides and
   * the live cuts, and plain words for a song beat no words for it: the
   * marker sits still, the text is the whole song.
   */
  async viaOvh(track) {
    try {
      const r = await fetch('https://api.lyrics.ovh/v1/'
        + encodeURIComponent(ARTIST) + '/' + encodeURIComponent(track), { mode: 'cors' });
      if (!r.ok) return null;
      const b = await r.json();
      const plain = String((b && b.lyrics) || '').trim();
      if (plain.length < 40) return null;
      const got = shape({ track, duration: 0, synced: null, plain });
      if (got) got.via = 'lyrics.ovh';
      return got;
    } catch { return null; }
  }
};

/** LRCLIB's answer → { duration, lines: [{ t, text }], synced, source } */
function shape(body) {
  if (!body) return null;

  if (body.synced) {
    const lines = parseLrc(body.synced);
    if (lines.length) {
      return {
        track: body.track, duration: body.duration || 0,
        lines, synced: true, source: 'lrclib'
      };
    }
  }

  if (body.plain) {
    /* No timings, so the marker has nothing to follow — the text is still
       the whole song, which is the point. Spacing them evenly would be a
       guess dressed up as data, so the timecodes are simply left off. */
    const lines = String(body.plain).split(/\r?\n/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(text => ({ t: null, text }));
    if (lines.length) {
      return {
        track: body.track, duration: body.duration || 0,
        lines, synced: false, source: 'lrclib'
      };
    }
  }

  return null;
}

/**
 * `[mm:ss.xx] text`, which is the whole of the format.
 *
 * A line may carry several stamps when it repeats; each one becomes its
 * own entry. Blank text between stamps is an instrumental gap and is
 * kept, because the marker sitting on an empty line is how you can tell
 * the song is between verses.
 */
function parseLrc(text) {
  const out = [];

  String(text).split(/\r?\n/).forEach(raw => {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) return;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    stamps.forEach(m => {
      const frac = m[3] ? Number('0.' + m[3]) : 0;
      out.push({ t: (+m[1]) * 60 + (+m[2]) + frac, text: words || '♪' });
    });
  });

  out.sort((a, b) => a.t - b.t);
  return out;
}

if (typeof window !== 'undefined') window.Lyrics = Lyrics;
