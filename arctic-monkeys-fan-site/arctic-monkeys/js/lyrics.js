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

   The request goes through the site's own /api/lyrics rather than
   straight from the browser — one entry point, no CORS to argue with,
   and the same shape whether it is served by server.js or the Netlify
   function.

   Nothing is stored in the repository and nothing is written to disk.
   The words are fetched when a window is opened and live in the tab for
   as long as it is open. They belong to their publishers.
   ============================================================ */

const Lyrics = {
  cache: new Map(),
  probe: null,

  /** Is the lyrics route answering? Probed once; callers share it. */
  reachable() {
    if (this.probe) return this.probe;
    this.probe = fetch('/api/lyrics?track=' + encodeURIComponent('Do I Wanna Know?'),
      { cache: 'no-store' })
      .then(r => r.ok || r.status === 404)   // 404 is an answer; HTML is not
      .catch(() => false);
    return this.probe;
  },

  /**
   * The full words for one track, in the same shape as the baked cues so
   * the window does not care which it got.
   *
   * Returns null when there is nothing to be had, and the caller keeps
   * whatever it was already showing.
   */
  async get(track, album) {
    const key = `${album || ''}|${track}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const qs = new URLSearchParams({ track, artist: 'Arctic Monkeys' });
    if (album) qs.set('album', album);

    let out = null;
    try {
      const r = await fetch(`/api/lyrics?${qs}`);
      const type = r.headers.get('content-type') || '';
      /* A static host with no function behind it answers a missing route
         with the site's own HTML, which JSON.parse would choke on. */
      if (r.ok && /json/.test(type)) {
        const body = await r.json();
        out = shape(body);
      }
    } catch (e) {
      /* offline, blocked, or no proxy — the baked cues stand */
    }

    this.cache.set(key, out);
    return out;
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
