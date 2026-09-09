/* ============================================================
   Words, credits and attribution — the browser's half.

   There are two ways this page can be running and it works out which
   one at boot rather than being told.

   WITH A BACK END. The folder was deployed somewhere that runs
   functions (Vercel, Netlify, Cloudflare Pages, or server.mjs) and
   /api/genius answered. One request per track then returns the lyrics,
   the Genius credits and the attribution together, and if
   GENIUS_ACCESS_TOKEN is set in that environment the credits are real
   rather than a link.

   AS A PLAIN STATIC FOLDER. No functions, so /api/genius is a 404. The
   probe notices once, at boot, and everything falls back to calling
   LRCLIB straight from the browser — which is exactly what this site did
   before the bridge existed. The words still arrive; the credits become
   a link to Genius. Nothing is broken and nothing needs configuring.

   Which of the two happened is on the page, at the bottom of every track
   panel. A fan site that quietly showed less because a token was missing
   would be a worse thing than one that says so.
   ============================================================ */

const Words = {
  /** null = not probed yet, then { bridge, configured }. */
  mode: null,
  cache: new Map(),

  /**
   * Is there a back end, and does it hold a token?
   *
   * Asked once. A static host answers this with its 404 page, so a
   * non-JSON body counts as "no bridge" just as much as a bad status
   * does — `r.json()` on an HTML error page throws, and the catch is
   * the whole detection.
   */
  async probe() {
    if (this.mode) return this.mode;

    this.mode = (async () => {
      try {
        const r = await fetch('api/genius?op=status', {
          headers: { Accept: 'application/json' }
        });
        if (!r.ok) throw new Error(String(r.status));
        const body = await r.json();
        if (!body || body.ok !== true) throw new Error('not the bridge');
        Diag.set('genius', body.configured ? 'bridge · token set' : 'bridge · no token');
        return { bridge: true, configured: !!body.configured };
      } catch {
        Diag.set('genius', 'static · lrclib direct');
        return { bridge: false, configured: false };
      }
    })();

    return this.mode;
  },

  /**
   * Everything about one track, in one shape either way.
   *
   * `{ lyrics, song, attribution, bridge, configured, error }` — `song`
   * is null without a token and the panel simply links out instead.
   */
  async track(title, album) {
    const key = `${album || ''}|${title}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const work = (async () => {
      const mode = await this.probe();

      if (mode.bridge) {
        try {
          const q = new URLSearchParams({ op: 'track', title, artist: ARTIST });
          if (album) q.set('album', album);
          const r = await fetch(`api/genius?${q}`, { headers: { Accept: 'application/json' } });
          if (r.ok) {
            const body = await r.json();
            return {
              lyrics: body.lyrics || null,
              song: body.song || null,
              attribution: body.attribution || {},
              bridge: true,
              configured: !!body.configured,
              error: body.error || null
            };
          }
        } catch { /* the bridge was there at boot and is not now */ }
      }

      const lyrics = await lrclibDirect(title, album);
      return {
        lyrics,
        song: null,
        attribution: {
          lyrics: lyrics ? { name: 'LRCLIB', url: 'https://lrclib.net',
                             note: lyrics.synced ? 'timed transcription' : 'plain transcription' }
                         : null,
          metadata: null
        },
        bridge: false,
        configured: false,
        error: null
      };
    })();

    this.cache.set(key, work);
    return work;
  }
};

/* ------------------------------------------------------------
   LRCLIB, called straight from the browser.

   The fallback path, and the one this site ran on before there was a
   server side at all. Open, keyless, sends CORS headers, and is what a
   number of open-source players use.
   ------------------------------------------------------------ */
async function lrclibDirect(track, album) {
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

  const clean = bareTitle(track);
  const exact = new URLSearchParams({ track_name: clean, artist_name: ARTIST });
  if (album) exact.set('album_name', album);

  let hit = await one(`https://lrclib.net/api/get?${exact}`);
  if (!hit) {
    hit = await one(`https://lrclib.net/api/search?${new URLSearchParams({
      track_name: clean, artist_name: ARTIST })}`);
  }
  return shapeLyrics(hit);
}

/** The store's title, minus the parts LRCLIB and Genius do not file under. */
function bareTitle(title) {
  return String(title || '')
    .replace(/\s*[([]\s*(feat|ft|with)[^)\]]*[)\]]/ig, '')
    .replace(/\s*[([][^)\]]*\b(remaster(ed)?|explicit|bonus|deluxe|album version|live)\b[^)\]]*[)\]]/ig, '')
    .replace(/\s*-\s*(remaster(ed)?|explicit|bonus track|single version)\b.*$/i, '')
    .trim() || String(title || '');
}

function shapeLyrics(hit) {
  if (!hit) return null;

  if (hit.syncedLyrics) {
    const lines = parseLrc(hit.syncedLyrics);
    if (lines.length) return { duration: hit.duration || 0, lines, synced: true };
  }
  if (hit.plainLyrics) {
    /* No timings, so no timecodes are drawn beside the lines. Spacing
       them evenly would be a guess dressed up as data. */
    const lines = String(hit.plainLyrics).split(/\r?\n/)
      .map(t => t.trim()).filter(Boolean).map(text => ({ t: null, text }));
    if (lines.length) return { duration: hit.duration || 0, lines, synced: false };
  }
  return null;
}

/** `[mm:ss.xx] text`, which is the whole of the format. */
function parseLrc(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach(raw => {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) return;
    const line = raw.replace(/\[[^\]]*\]/g, '').trim();
    stamps.forEach(m => out.push({
      t: (+m[1]) * 60 + (+m[2]) + (m[3] ? Number('0.' + m[3]) : 0),
      text: line || '♪'
    }));
  });
  return out.sort((a, b) => a.t - b.t);
}

function fmtLrc(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
