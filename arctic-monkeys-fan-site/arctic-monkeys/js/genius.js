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
  state: 'unknown',        // 'connected' | 'no-token' | 'absent'
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

  /* Two path shapes, because a deploy can honour one and not the other.
     Netlify Functions v2 declares its own route (/api/genius/*) and
     netlify.toml repeats it as a redirect — but an older build image, or
     a UI setting pinning the classic mapping, serves only
     /.netlify/functions/genius/*. The function answers to both; the probe
     below finds out which one this host is actually routing and every
     call after it goes there. */
  bases: ['/api/genius', '/.netlify/functions/genius'],
  base: '/api/genius',

  async api(path) {
    if (!(await this.hasProxy())) return null;
    try {
      const res = await fetch(`${this.base}/${path}`);
      if (!res.ok || !/json/.test(res.headers.get('content-type') || '')) return null;
      return await res.json();
    } catch { return null; }
  },

  /**
   * How much of Genius is already in the page.
   *
   * tools/fetch_am_data.py --genius writes the credits, the statistics and
   * the annotations into js/am-api-data.js, and everything below reads
   * that before it reads anything else. A deploy carrying a fetched file
   * needs no proxy, no token and no serverless anything — which is the
   * only way any of it works on a host that just serves files, a manual
   * drag-and-drop deploy included.
   */
  bakedCount() {
    const d = this.data();
    const rows = Object.values((d && d.tracks) || {});
    return {
      tracks: rows.filter(r => r && (r.geniusId || (r.writers || []).length)).length,
      notes: rows.filter(r => r && (r.notes || []).length).length
    };
  },

  /** The baked Genius record for a track, if the fetcher supplied one. */
  bakedSong(name) {
    const rec = this.track(name);
    if (!rec) return null;
    return (rec.geniusId || (rec.writers || []).length) ? rec : null;
  },

  /** The Genius song record for a track: baked if there is one, else live. */
  async song(name) {
    /* Before the session cache and before the network. A fetched file is
       both faster and the only thing that answers at all where there is
       no proxy — and the two carry the same fields, so nothing downstream
       can tell which it got. */
    const baked = this.bakedSong(name);
    if (baked) return baked;

    const key = 'song:' + name;
    const cached = this.session(key);
    if (cached !== null) return cached;

    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const search = await this.api(`search?q=${encodeURIComponent(ARTIST + ' ' + name)}`);
    const hits = (search && search.response && search.response.hits) || [];

    /* `includes` rather than an equality test: Genius files some of these
       under "Arctic Monkeys" and some under a longer credit, and an exact
       match dropped every one of the latter on the floor. */
    const mine = hits.map(h => h.result)
      .filter(r => r && norm(r.primary_artist && r.primary_artist.name).includes('arcticmonkeys'));

    /* Titles do not line up either: Genius carries remaster suffixes,
       feature credits and bracketed live tags that a tracklist does not.
       Exact first, then either one being a prefix of the other. */
    const want = norm(name);
    const hit = mine.find(r => norm(r.title) === want)
      || mine.find(r => norm(r.title_with_featured) === want)
      || mine.find(r => norm(r.title).startsWith(want) && want.length > 5)
      || mine.find(r => want.startsWith(norm(r.title)) && norm(r.title).length > 5)
      || mine[0];
    if (!hit) { this.rememberMiss(key); return null; }

    const full = await this.api(`songs/${hit.id}?text_format=plain`);
    const song = (full && full.response && full.response.song) || hit;
    const stats = song.stats || {};

    /* Everything the API is willing to say about a song. Note what is
       missing: the words themselves. Genius licenses lyrics from
       publishers and cannot serve them here — the annotations below are
       what it does offer, and they are the interesting half. */
    const rec = {
      geniusId: hit.id,
      geniusUrl: song.url,
      writers: (song.writer_artists || []).map(a => a.name),
      producers: (song.producer_artists || []).map(a => a.name),
      featured: (song.featured_artists || []).map(a => a.name),
      releaseDate: song.release_date_for_display || song.release_date,
      recordedAt: song.recording_location || null,
      about: ((song.description || {}).plain || '').trim() || null,

      // the numbers people actually look at
      pageviews: stats.pageviews,
      shares: song.pyongs_count,
      contributors: stats.contributors,
      annotations: song.annotation_count || stats.accepted_annotations,
      hot: Boolean(stats.hot),

      // what it borrows from and what borrows from it
      relationships: (song.song_relationships || [])
        .filter(r => (r.songs || []).length)
        .map(r => ({
          kind: String(r.relationship_type || '').replace(/_/g, ' '),
          songs: r.songs.slice(0, 4).map(x => ({ title: x.title, url: x.url }))
        })),

      // players and videos Genius knows about
      media: (song.media || [])
        .filter(m => m.url)
        .map(m => ({ provider: m.provider, url: m.url, type: m.type })),

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

    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const want = norm(name);

    /* Genius has no artist search — only a song search — so a person is
       found through the songs they are attached to. Looking only at
       `primary_artist` found Alex Turner, who has releases of his own, and
       nobody else in the band: the other four appear as featured credits
       or not at all. Both lists are searched now, and the name is tried
       both alone and against the band, because "Jamie Cook" on its own
       returns a different Jamie Cook. */
    const seen = [];
    for (const q of [name, `${name} ${ARTIST}`]) {
      const search = await this.api(`search?q=${encodeURIComponent(q)}`);
      const hits = (search && search.response && search.response.hits) || [];
      for (const h of hits) {
        const r = h.result || {};
        seen.push(r.primary_artist, ...(r.featured_artists || []));
      }
      if (seen.some(a => a && norm(a.name) === want)) break;
    }

    const pa = seen.find(a => a && norm(a.name) === want);
    if (!pa) { this.rememberMiss(key); return null; }

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
    this.rememberMiss(key);
    return null;
  },

  /**
   * Is a Genius proxy answering, and does it hold a token?
   *
   * Three answers, not two, because the two ways this goes wrong after a
   * deploy need different things done about them:
   *
   *   connected  the route is there and the token is set
   *   no-token   the route is there, GENIUS_ACCESS_TOKEN is not — set it
   *              in the platform's environment and redeploy
   *   absent     nothing is serving /api/genius at all, so the whole
   *              folder is deployed rather than just the site directory
   *
   * The footer says which, so a deploy that is missing one of the two can
   * be told from a deploy that is missing the other without opening a
   * console.
   *
   * One promise, not one per caller: several lookups start at once and
   * would otherwise each fire their own probe.
   */
  tries: 0,

  probeProxy() {
    if (this.probe) return this.probe;
    this.probe = (async () => {
      for (const base of this.bases) {
        try {
          const r = await fetch(`${base}/health`, { cache: 'no-store' });
          /* A static host with no function behind the route answers with
             the site's own HTML and a 200. Reading that as JSON throws,
             which looked the same as the network being down. */
          if (!/json/.test(r.headers.get('content-type') || '')) continue;
          const b = await r.json();
          if (!b || !b.ok) continue;
          this.base = base;
          return b.token ? 'connected' : 'no-token';
        } catch { /* try the other path shape */ }
      }
      return 'absent';
    })()
      .then(state => {
        this.state = state;
        this.proxy = state === 'connected';
        /* A serverless function that is cold starting can miss the first
           request. Nothing else ever re-probed, so one unlucky call at
           load switched every live lookup off for the rest of the session
           — including on a site that was configured perfectly. Give it two
           more chances, spaced out, and only for the failure that a cold
           start actually looks like. */
        if (state === 'absent' && this.tries < 2) {
          this.tries++;
          setTimeout(() => { this.probe = null; }, 2500 * this.tries);
        }
        return state;
      });
    return this.probe;
  },

  hasProxy() { return this.probeProxy().then(s => s === 'connected'); },

  /* Only remember that Genius has nothing for something when Genius was
     actually asked. Remembering a miss that was really "the proxy was not
     up yet" is how a cold start used to poison a whole session. */
  rememberMiss(key) {
    if (this.state === 'connected') this.remember(key, false);
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

      /* Through api(), which checks the status and the content type. This
         call went to fetch() directly and read whatever came back as JSON,
         so a route answering with the site's HTML threw here rather than
         being recognised for what it was. */
      const body = await this.api(
        `referents?song_id=${id}&text_format=plain&per_page=50`);
      const refs = (body && body.response && body.response.referents) || [];

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
