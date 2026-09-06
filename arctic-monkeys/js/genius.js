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
  probe: null,             // the single in-flight probe
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

  /* Photographs resolved live are kept here so that a window opened
     later sees the same one the card already found, without asking
     again. */
  livePhotos: {},

  photo(name) {
    const a = this.artist(name);
    return (a && a.photo) || this.livePhotos[name] || null;
  },

  /* ---------- live lookups ----------
     With a token in the platform's environment, everything below resolves
     through the proxy on first use and is remembered for the session:
     credits, cover art, artist photographs, annotations. Without one,
     every call returns null and the page uses what was baked in — or the
     credits written by hand in data.js. */

  session(key) {
    try { return JSON.parse(sessionStorage.getItem('am-genius-' + key)); }
    catch { return null; }
  },

  remember(key, value) {
    try { sessionStorage.setItem('am-genius-' + key, JSON.stringify(value)); }
    catch { /* private window, or storage refused — just don't cache */ }
  },

  async api(path) {
    if (!(await this.hasProxy())) return null;
    try {
      const res = await fetch(`/api/genius/${path}`);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  },

  /** The Genius song record for a track, live. */
  async song(name) {
    const key = 'song:' + name;
    const cached = this.session(key);
    if (cached !== null) return cached;

    const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const search = await this.api(`search?q=${encodeURIComponent(ARTIST + ' ' + name)}`);
    const hits = (search && search.response && search.response.hits) || [];
    const mine = hits.map(h => h.result)
      .filter(r => r && norm(r.primary_artist && r.primary_artist.name) === norm(ARTIST));
    const hit = mine.find(r => norm(r.title) === norm(name)) || mine[0];
    if (!hit) { this.remember(key, false); return null; }

    const full = await this.api(`songs/${hit.id}?text_format=plain`);
    const song = (full && full.response && full.response.song) || hit;
    const rec = {
      geniusId: hit.id,
      geniusUrl: song.url,
      writers: (song.writer_artists || []).map(a => a.name),
      producers: (song.producer_artists || []).map(a => a.name),
      releaseDate: song.release_date,
      pageviews: song.stats && song.stats.pageviews,
      art: song.song_art_image_url || hit.song_art_image_url || null,
      albumCover: (song.album && song.album.cover_art_url) || null,
      albumName: (song.album && song.album.name) || null
    };
    this.remember(key, rec);
    return rec;
  },

  /** An artist photograph — the band, or one of its members. */
  async artistLive(name) {
    const key = 'artist:' + name;
    const cached = this.session(key);
    if (cached !== null) return cached;

    const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const search = await this.api(`search?q=${encodeURIComponent(name)}`);
    const hits = (search && search.response && search.response.hits) || [];
    const pa = hits.map(h => h.result && h.result.primary_artist)
      .find(a => a && norm(a.name) === norm(name));
    if (!pa) { this.remember(key, false); return null; }

    const full = await this.api(`artists/${pa.id}?text_format=plain`);
    const artist = (full && full.response && full.response.artist) || pa;
    const rec = {
      geniusUrl: artist.url,
      photo: artist.image_url || artist.header_image_url || null
    };
    if (rec.photo) this.livePhotos[name] = rec.photo;
    this.remember(key, rec);
    return rec;
  },

  /**
   * A sleeve for a record, live. Genius has no album search, so this goes
   * through the first track and reads the album hanging off it.
   */
  async coverLive(album) {
    const key = 'cover:' + album.id;
    const cached = this.session(key);
    if (cached !== null) return cached;

    for (const t of album.tracks.slice(0, 3)) {
      const song = await this.song(t.name);
      const url = song && (song.albumCover || song.art);
      if (url) { this.remember(key, url); return url; }
    }
    this.remember(key, false);
    return null;
  },

  /** Is a Genius proxy answering? Probed once, ever — callers share it. */
  hasProxy() {
    // one promise, not one per caller: several lookups start at once and
    // would otherwise each fire their own probe
    if (!this.probe) {
      this.probe = fetch('/api/genius/health', { cache: 'no-store' })
        .then(r => r.json())
        .then(b => Boolean(b && b.ok && b.token))
        .catch(() => false)
        .then(ok => { this.proxy = ok; return ok; });
    }
    return this.probe;
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
        const song = await this.song(name);
        id = song && song.geniusId;
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
