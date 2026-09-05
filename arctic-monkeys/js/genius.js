/* ============================================================
   Genius

   Everything here reads what tools/fetch_am_data.py baked into
   js/am-api-data.js — credits, artwork paths and the annotations that
   open under a lyric line.

   If server.js is running with a token, anything that was not baked can
   also be fetched live through its /api/genius proxy. The token stays on
   that server: Genius refuses cross-origin browser requests, so the page
   could not hold one usefully even if we wanted it to.

   With neither, every call returns null and the site falls back to the
   credits written by hand in js/data.js. Nothing breaks.
   ============================================================ */

const Genius = {
  proxy: undefined,        // undefined = not probed yet, then true/false
  live: new Map(),

  data() {
    return typeof API_DATA !== 'undefined' ? API_DATA : null;
  },

  track(name) {
    const d = this.data();
    return (d && d.tracks && d.tracks[name]) || null;
  },

  album(title) {
    const d = this.data();
    return (d && d.albums && d.albums[title]) || null;
  },

  artist(name) {
    const d = this.data();
    return (d && d.artists && d.artists[name]) || null;
  },

  /** Cover for an album: Genius first, then whatever iTunes gave a track. */
  cover(album) {
    const meta = this.album(album.title);
    if (meta && meta.cover) return meta.cover;
    for (const t of album.tracks) {
      const rec = this.track(t.name);
      if (rec && rec.art) return rec.art;
      if (rec && rec.artUrl) return rec.artUrl;
    }
    return null;
  },

  photo(name) {
    const a = this.artist(name);
    return (a && a.photo) || null;
  },

  /** Is a Genius proxy answering? Probed once, remembered. */
  async hasProxy() {
    if (this.proxy !== undefined) return this.proxy;
    try {
      const res = await fetch('/api/genius/health', { cache: 'no-store' });
      const body = await res.json();
      this.proxy = Boolean(body && body.ok && body.token);
    } catch {
      this.proxy = false;
    }
    return this.proxy;
  },

  /**
   * Annotations for a track: the lyric fragments Genius' community has
   * written notes on, each with the top-voted note.
   */
  async notes(name) {
    const baked = this.track(name);
    if (baked && baked.notes && baked.notes.length) return baked.notes;
    if (this.live.has(name)) return this.live.get(name);
    if (!(await this.hasProxy())) return null;

    try {
      let id = baked && baked.geniusId;
      if (!id) {
        const q = encodeURIComponent(`${ARTIST} ${name}`);
        const res = await fetch(`/api/genius/search?q=${q}`);
        const hits = (await res.json()).response?.hits || [];
        const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
        const hit = hits.find(h =>
          norm(h.result?.primary_artist?.name) === norm(ARTIST));
        id = hit && hit.result.id;
      }
      if (!id) { this.live.set(name, null); return null; }

      const res = await fetch(
        `/api/genius/referents?song_id=${id}&text_format=plain&per_page=50`);
      const refs = (await res.json()).response?.referents || [];

      const out = [];
      for (const ref of refs) {
        const fragment = (ref.fragment || '').trim();
        if (!fragment) continue;
        const best = (ref.annotations || [])
          .map(a => ({ text: (a.body?.plain || '').trim(),
                       votes: a.votes_total || 0,
                       url: a.url || ref.url }))
          .filter(a => a.text)
          .sort((a, b) => b.votes - a.votes)[0];
        if (best) out.push({ fragment, annotation: best.text, votes: best.votes, url: best.url });
        if (out.length >= 14) break;
      }
      const notes = out.length ? out : null;
      this.live.set(name, notes);
      return notes;
    } catch {
      this.live.set(name, null);
      return null;
    }
  }
};
