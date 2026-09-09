/* ============================================================
   The catalogue, and the transport.

   THE CATALOGUE runs off the iTunes Search API, which needs no key. Two
   calls per record —

     search?term=<artist album>&entity=album  ->  the release, and its id
     lookup?id=<collectionId>&entity=song     ->  its actual tracklist

   — which is why no tracklist is typed into js/data.js. What appears on
   screen is the store's own listing: right about the running order,
   right about the durations, and right about the deluxe editions a
   hand-written list always gets wrong. Each track carries its 30-second
   preview from the same response, so pressing one never costs a second
   lookup.

   THE TRANSPORT lives inside the track panel. It used to be a bar
   pinned to the bottom of the window, which meant the thing you pressed
   and the thing you were reading about were at opposite ends of the
   screen. Now opening a song opens its player, and closing the song
   stops it — see mount() and detach().

   ------------------------------------------------------------
   WHY PREVIEWS DID NOT PLAY, AND WHAT FIXED IT
   ------------------------------------------------------------

   Three separate faults, all of which had to go.

   1. THE GESTURE WAS SPENT BEFORE PLAY WAS CALLED. Pressing a track ran
      an await — the album lookup — and only then reached .play(). By
      that point the click had been over for a hundred milliseconds and
      the browser no longer counted it: Safari and iOS refuse outright,
      and Chrome refuses whenever media engagement is low. The audio
      element is now unlocked on the first gesture anywhere on the page
      (see unlock()), which makes it a permitted source from then on
      regardless of how much awaiting happens later.

   2. A SINGLE FAILURE WAS CACHED FOR THE WHOLE SESSION. A miss was
      written to sessionStorage as `false` and read back as a definite
      "there is no preview", so one blocked request meant that record
      stayed silent until the tab was closed. Misses now carry a
      timestamp and expire in five minutes; successes are kept for the
      session as before.

   3. THERE WAS NOWHERE TO GO WHEN APPLE WAS UNREACHABLE. A blocked
      request, a privacy extension, a proxy that mishandles CORS, or the
      page opened from a file:// URL all produced the same dead end. The
      call is now tried directly first and relayed through /api/itunes —
      same origin, no key, no configuration — only if that fails.

   And when there is genuinely no preview to be had, the panel says which
   of those it was instead of showing a play button that does nothing.
   ============================================================ */

/* One sample of silence. Playing it inside a real gesture is what marks
   the element as user-initiated; everything after that is allowed. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

const Catalogue = {
  cache: new Map(),
  MISS_TTL: 5 * 60 * 1000,

  session(key) {
    try {
      const row = JSON.parse(sessionStorage.getItem('hu-cat-' + key));
      if (!row || typeof row !== 'object') return undefined;
      /* A miss is a guess about the network, not a fact about the song,
         so it is allowed to go stale. A hit is a fact and is not. */
      if (row.v === null && Date.now() - (row.at || 0) > this.MISS_TTL) return undefined;
      return row.v;
    } catch { return undefined; }
  },
  remember(key, value) {
    try {
      sessionStorage.setItem('hu-cat-' + key,
        JSON.stringify({ v: value === undefined ? null : value, at: Date.now() }));
    } catch { /* private window, or storage refused — just don't cache */ }
  },

  norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); },

  /**
   * Ask the store, by whichever route answers.
   *
   * Apple first, because it is one hop and needs nothing deployed. The
   * same-origin relay second, because it is immune to every reason the
   * first one fails. Null only when both are gone.
   */
  async ask(op, params) {
    const qs = new URLSearchParams(params);

    try {
      const r = await fetch(`https://itunes.apple.com/${op}?${qs}`, { mode: 'cors' });
      /* /lookup answers as text/javascript, so the body is parsed here
         rather than through r.json(), which checks the content type. */
      if (r.ok) return JSON.parse(await r.text());
    } catch { /* blocked, offline, or file:// — try the relay */ }

    try {
      const r = await fetch(`api/itunes?op=${encodeURIComponent(op)}&${qs}`,
        { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const body = await r.json();
        if (body && !body.error) { Diag.set('store', 'relayed'); return body; }
      }
    } catch { /* deployed as a plain static folder — nothing to relay to */ }

    Diag.set('store', 'unreachable');
    return null;
  },

  /**
   * Every Hollywood Undead release the store carries, in one call.
   *
   * The per-record search is exact and usually right, and when it is
   * wrong it is wrong silently — the sleeve never appears and the card
   * keeps its stand-in, which looks identical to the store being down.
   * The titles it misses are the ones the store files differently:
   * "Notes from the Underground" is listed with a "(Deluxe)" suffix,
   * "Five" collides with every other record called Five ever released,
   * and "Day of the Dead" matches a dozen unrelated compilations.
   *
   * So there is a second route. One request fetches the artist's whole
   * album list, cached for the session, and any record the targeted
   * search could not place is matched against that instead — where the
   * artist is already guaranteed and only the title has to match.
   */
  discography() {
    if (this._disco) return this._disco;
    this._disco = (async () => {
      const body = await this.ask('search', {
        term: ARTIST, entity: 'album', limit: 60, country: 'US' });
      const rows = (body && body.results) || [];
      const mine = rows.filter(r => this.norm(r.artistName) === 'hollywoodundead');
      Diag.set('discography', `${mine.length} releases`);
      return mine;
    })().catch(() => []);
    return this._disco;
  },

  /** The best release in a list for one title, or null. */
  pick(rows, title) {
    const want = this.norm(title);
    /* Exact first, then a prefix match — the store carries "(Deluxe)"
       and "(Explicit)" suffixes a title does not — then a contains, and
       never the other way round, or "Five" matches "Five Finger…". */
    return rows.find(r => this.norm(r.collectionName) === want)
      || rows.find(r => this.norm(r.collectionName).startsWith(want))
      || rows.find(r => want.length > 6 && this.norm(r.collectionName).includes(want))
      || null;
  },

  /** One record: the tracks, with their previews. Resolved once. */
  album(album) {
    if (this.cache.has(album.id)) return this.cache.get(album.id);

    const seen = this.session(album.id);
    if (seen !== undefined) {
      const p = Promise.resolve(seen);
      this.cache.set(album.id, p);
      return p;
    }

    const work = (async () => {
      const found = await this.ask('search', {
        term: `${ARTIST} ${album.title}`, entity: 'album', limit: 12, country: 'US' });
      const mine = ((found && found.results) || [])
        .filter(r => this.norm(r.artistName).includes('hollywoodundead'));

      // the targeted search, then the artist's whole shelf
      const hit = this.pick(mine, album.title)
        || this.pick(await this.discography(), album.title);
      if (!hit) return null;

      const look = await this.ask('lookup', {
        id: hit.collectionId, entity: 'song', limit: 60, country: 'US' });
      const items = (look && look.results) || [];

      const tracks = items
        .filter(r => r.wrapperType === 'track' && r.trackName)
        .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0))
        .map(r => ({
          name: r.trackName,
          preview: r.previewUrl || null,
          ms: r.trackTimeMillis || 0,
          n: r.trackNumber || 0
        }));
      if (!tracks.length) return null;

      /* The sleeve, at 600px rather than the 100px the search result
         carries: the artwork URL is a template and swapping the size
         segment is the documented way to ask for a bigger one. */
      return {
        cover: (hit.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.') || null,
        year: (hit.releaseDate || '').slice(0, 4),
        tracks
      };
    })().catch(() => null)
      .then(v => { this.remember(album.id, v); return v; });

    this.cache.set(album.id, work);
    return work;
  },

  /** A preview for one track, when the album listing did not carry one. */
  async preview(name) {
    const key = 'trk:' + this.norm(name);
    const seen = this.session(key);
    if (seen !== undefined) return seen;

    const body = await this.ask('search', {
      term: `${ARTIST} ${name}`, entity: 'song', limit: 15, country: 'US' });
    const rows = (body && body.results) || [];
    const mine = rows.filter(r => this.norm(r.artistName).includes('hollywoodundead'));
    const want = this.norm(name);
    const hit = mine.find(r => this.norm(r.trackName) === want)
      || mine.find(r => this.norm(r.trackName).startsWith(want))
      || mine[0];

    const url = (hit && hit.previewUrl) || null;
    this.remember(key, url);
    return url;
  }
};

/* ============================================================
   The transport.

   One <audio> for the page, kept across panels so the unlock survives.
   The controls are built into whatever element mount() is handed and
   thrown away with it.
   ============================================================ */
const Player = {
  audio: null,
  host: null,             // the element the controls are currently in
  queue: [],              // [{ name, preview, ms, album }]
  idx: -1,
  unlocked: false,
  dragging: false,
  seekTo: null,           // where the head is being dragged, mid-drag
  listeners: new Set(),   // told on every timeupdate — the lyric follower

  /* ----------------------------------------------------------
     Once, at boot. The element exists from here on; only its
     controls come and go.
     ---------------------------------------------------------- */
  init() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = this.savedVolume();

    this.audio.addEventListener('timeupdate', () => this.tick());
    this.audio.addEventListener('durationchange', () => this.paint());
    this.audio.addEventListener('play', () => this.paint());
    this.audio.addEventListener('pause', () => this.paint());
    this.audio.addEventListener('ended', () => this.step(1));
    this.audio.addEventListener('error', () => {
      this.say('that preview would not load', true);
      this.paint();
    });

    /* The unlock. It has to happen inside a real gesture, and the first
       gesture is not always enough — a browser can refuse the silent
       sample and then allow the next one — so the listener stays until
       it works rather than removing itself after one try. capture:true
       so a handler that stops propagation cannot deny it. */
    this.arm = () => { if (this.unlocked) this.disarm(); else this.unlock(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
      addEventListener(ev, this.arm, { capture: true, passive: true }));
  },

  /**
   * Mark the element as user-initiated by playing a single silent sample
   * through it. From then on .play() is permitted from anywhere,
   * including after an await, which is the whole point.
   */
  disarm() {
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
      removeEventListener(ev, this.arm, { capture: true }));
  },

  unlock() {
    if (this.unlocked || !this.audio || this.audio.src) return;
    this.audio.src = SILENCE;
    const p = this.audio.play();
    const done = () => {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.unlocked = true;
      this.disarm();
      Diag.set('audio', 'unlocked');
    };
    if (p && p.then) p.then(done).catch(() => { /* it will be asked again on the play button */ });
    else done();
  },

  /**
   * The fourth reason previews "did not play": they played silently.
   *
   * This read `Number(localStorage.getItem('hu-volume'))` and accepted
   * anything finite between 0 and 1. On a first visit there is no stored
   * value, getItem returns null, and Number(null) is 0 — not NaN — so
   * the guard passed and every new visitor got the player at zero
   * volume. It ran, the scrubber moved, and nothing came out.
   *
   * A missing value and a stored zero are now different things: the
   * first gets the default, the second is somebody who turned it down
   * and is honoured.
   */
  savedVolume() {
    try {
      const raw = localStorage.getItem('hu-volume');
      if (raw === null || raw === '') return 0.8;
      const v = Number(raw);
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.8;
    } catch { return 0.8; }
  },
  saveVolume(v) { try { localStorage.setItem('hu-volume', String(v)); } catch { /* fine */ } },

  /* ----------------------------------------------------------
     Build the controls inside `host` and cue a track.
     ---------------------------------------------------------- */
  mount(host, tracks, albumTitle, index) {
    this.host = host;
    this.queue = tracks.map(t => Object.assign({ album: albumTitle }, t));
    this.idx = Math.max(0, Math.min(this.queue.length - 1, index || 0));

    /* THE DECK.

       Built rather than templated in the markup, because it only exists
       while a song is open. The progress ring around the play button is
       an SVG circle whose dash offset is the preview position — the same
       number the rail underneath shows, read differently: the ring is
       for the eye at a glance, the rail is for the hand that wants to
       scrub. Steel for the controls, blood for the state, which is the
       one rule the whole interface runs on. */
    const R = 26, C = 2 * Math.PI * R;
    host.innerHTML = `
      <div class="tx">
        <div class="tx-grain" aria-hidden="true"></div>

        <div class="tx-deck">
          <button class="tx-step" data-pl="prev" type="button" aria-label="Previous track">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14L8 12zM7 5h2v14H7z"/></svg>
          </button>

          <button class="tx-play" data-pl="play" type="button" aria-label="Play">
            <svg class="tx-ring" viewBox="0 0 60 60" aria-hidden="true">
              <circle class="tx-ring-track" cx="30" cy="30" r="${R}"/>
              <circle class="tx-ring-fill" cx="30" cy="30" r="${R}"
                      stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"
                      data-pl="ring"/>
            </svg>
            <span class="tx-glyph" data-pl="glyph" aria-hidden="true"></span>
          </button>

          <button class="tx-step" data-pl="next" type="button" aria-label="Next track">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14l10-7zM15 5h2v14h-2z"/></svg>
          </button>

          <div class="tx-read">
            <div class="tx-now" data-pl="title">—</div>
            <div class="tx-state" data-pl="sub">30-second preview</div>
          </div>

        </div>

        <div class="tx-belt">
          <span class="tx-at" data-pl="at">0:00</span>
          <div class="tx-scrub" data-pl="scrub" role="slider" tabindex="0"
               aria-label="Seek within the preview"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="tx-rail"></span>
            <span class="tx-ticks" aria-hidden="true"></span>
            <span class="tx-fill" data-pl="fill"></span>
            <span class="tx-head" data-pl="head"></span>
          </div>
          <span class="tx-dur" data-pl="dur">0:30</span>
        </div>

        <div class="tx-foot">
          <span class="tx-of" data-pl="of"></span>
          <span class="tx-vol">
            <button class="tx-mute" data-pl="mute" type="button" aria-label="Mute">
              <svg viewBox="0 0 24 24" aria-hidden="true" data-pl="volicon"></svg>
            </button>
            <input data-pl="vol" type="range" min="0" max="100" value="80" aria-label="Volume">
          </span>
        </div>
      </div>`;

    this.ring = C;
    this.el = s => this.host.querySelector(`[data-pl="${s}"]`);

    this.el('play').addEventListener('click', () => this.toggle());
    this.el('prev').addEventListener('click', () => this.step(-1));
    this.el('next').addEventListener('click', () => this.step(1));

    const vol = this.el('vol');
    vol.value = String(Math.round(this.audio.volume * 100));
    vol.addEventListener('input', () => {
      this.audio.volume = Number(vol.value) / 100;
      this.audio.muted = false;
      this.saveVolume(this.audio.volume);
      this.paintVolume();
    });
    this.el('mute').addEventListener('click', () => {
      this.audio.muted = !this.audio.muted;
      this.paintVolume();
    });

    this.bindScrub();
    this.paintVolume();
    this.cue();
  },

  /** The panel is closing: stop the sound and forget the controls. */
  detach() {
    if (this.audio) { this.audio.pause(); }
    this.host = null;
    this.queue = [];
    this.idx = -1;
    this.listeners.clear();
  },

  /** Called on every timeupdate with (seconds, duration). */
  onTime(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },

  /* ----------------------------------------------------------
     Cue and play.
     ---------------------------------------------------------- */
  async cue(autoplay = true) {
    const t = this.queue[this.idx];
    if (!t || !this.host) return;

    this.el('title').textContent = t.name;
    this.el('of').textContent =
      `Track ${this.idx + 1} of ${this.queue.length} · ${t.album || ARTIST}`;
    this.say('30-second preview');
    this.mark();

    let url = t.preview;
    if (!url) {
      this.say('finding a preview…');
      url = await Catalogue.preview(t.name);
      t.preview = url;
      if (!this.host || this.queue[this.idx] !== t) return;   // moved on while waiting
    }

    if (!url) {
      this.say('the store has no preview for this one', true);
      this.audio.removeAttribute('src');
      this.paint();
      return;
    }

    this.say('30-second preview');
    this.audio.src = url;
    if (autoplay) await this.play();
    this.paint();
  },

  async play() {
    try {
      await this.audio.play();
      this.say('30-second preview');
    } catch {
      /* Only reachable if the unlock never landed — an autoplay policy
         strict enough to want the press to be on the button itself.
         Saying so is better than a button that looks broken. */
      this.say('press play to start', true);
    }
    this.paint();
  },

  toggle() {
    if (!this.queue.length) return;
    this.unlocked = true;                       // this press is the gesture
    if (this.audio.paused) {
      if (!this.audio.src) return void this.cue();
      this.play();
    } else {
      this.audio.pause();
    }
    this.paint();
  },

  step(dir) {
    if (!this.queue.length) return;
    this.idx = (this.idx + dir + this.queue.length) % this.queue.length;
    this.cue();
    if (this.onStep) this.onStep(this.queue[this.idx], this.idx);
  },

  playing() { return !!(this.audio && !this.audio.paused && this.audio.src && this.queue.length); },
  current() { return this.queue[this.idx] || null; },

  duration() {
    const d = this.audio ? this.audio.duration : 0;
    return Number.isFinite(d) && d > 0 ? d : 0;
  },

  /**
   * How long to treat the preview as, for painting and seeking.
   *
   * A served preview normally reports its length the moment its headers
   * land. Some do not — a chunked response, or one without a
   * Content-Length — and the old code then divided by zero-as-false and
   * left the scrubber pinned at the far left for the whole thirty
   * seconds, which looks exactly like a player that is not running.
   * These are 30-second previews by definition, so that is the fallback,
   * and it is right whenever the real answer is missing.
   */
  span() { return this.duration() || 30; },

  seek(frac) {
    if (!this.audio || !this.audio.src) return;
    const to = Math.max(0, Math.min(1, frac)) * this.span();
    try { this.audio.currentTime = to; } catch { /* not seekable yet */ }
    this.paint();
  },

  /* Click the rail to seek, hold to scrub. Pointer events rather than
     mouse, so a finger works the same way. */
  bindScrub() {
    const scrub = this.el('scrub');
    const at = e => {
      const r = scrub.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    const move = e => { if (this.dragging) { this.seekTo = at(e); this.paintScrub(this.seekTo); } };
    const up = e => {
      if (!this.dragging) return;
      this.dragging = false;
      scrub.classList.remove('dragging');
      this.seek(at(e));
      this.seekTo = null;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    scrub.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.dragging = true;
      scrub.classList.add('dragging');
      this.seekTo = at(e);
      this.paintScrub(this.seekTo);
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
    scrub.addEventListener('keydown', e => {
      const step = e.key === 'ArrowRight' ? 2 : e.key === 'ArrowLeft' ? -2 : 0;
      if (!step) return;
      e.preventDefault();
      this.seek((this.audio.currentTime + step) / this.span());
    });
  },

  /* ---------------------------------------------------------- painting */

  say(text, warn = false) {
    if (!this.host) return;
    const el = this.el('sub');
    el.textContent = text;
    el.classList.toggle('warn', warn);
  },

  fmt(s) {
    if (!Number.isFinite(s) || s < 0) s = 0;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  },

  tick() {
    this.paint();
    const t = this.audio.currentTime || 0;
    const d = this.duration();
    this.listeners.forEach(fn => { try { fn(t, d); } catch { /* a listener is not the player's problem */ } });
  },

  paintScrub(frac) {
    if (!this.host) return;
    this.el('fill').style.width = `${frac * 100}%`;
    this.el('head').style.left = `${frac * 100}%`;
  },

  /* Drawn rather than typed: ▶ and ❚❚ as text sit on the font's own
     baseline and drift by a pixel or two between platforms, which is
     visible inside a circle. */
  GLYPH: {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5h3.2v14H8zM12.8 5H16v14h-3.2z"/></svg>'
  },

  paint() {
    if (!this.host) return;
    const playing = this.playing();
    const glyph = this.el('glyph');
    const want = playing ? 'pause' : 'play';
    if (glyph.dataset.shape !== want) {
      glyph.dataset.shape = want;
      glyph.innerHTML = this.GLYPH[want];
    }
    this.el('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.el('play').classList.toggle('on', playing);

    const d = this.span();
    const t = this.audio.currentTime || 0;
    const frac = Math.min(1, t / d);
    this.paintScrub(this.seekTo != null ? this.seekTo : frac);

    this.el('at').textContent = this.fmt(t);
    this.el('dur').textContent = this.fmt(d);
    this.el('scrub').setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    // the ring runs the same number the rail does, read at a glance
    this.el('ring').style.strokeDashoffset = String(this.ring * (1 - frac));
    this.mark();
  },

  /* Three states, three shapes. Emoji speakers were rendering at a
     different size and weight on every platform and never matched the
     stencil the rest of the deck is drawn in. */
  VOL: {
    off:  '<path d="M4 9v6h4l5 4V5L8 9zm12.5 3 3 3-1.4 1.4-3-3-3 3L10.7 15l3-3-3-3L12.1 7.6l3 3 3-3L19.5 9z"/>',
    low:  '<path d="M4 9v6h4l5 4V5L8 9zm11 3a3 3 0 0 0-1.5-2.6v5.2A3 3 0 0 0 15 12z"/>',
    high: '<path d="M4 9v6h4l5 4V5L8 9zm11 3a3 3 0 0 0-1.5-2.6v5.2A3 3 0 0 0 15 12zm.5-6.3v2.1a4.5 4.5 0 0 1 0 8.4v2.1a6.5 6.5 0 0 0 0-12.6z"/>'
  },

  paintVolume() {
    if (!this.host) return;
    const muted = this.audio.muted || this.audio.volume === 0;
    const shape = muted ? 'off' : this.audio.volume > 0.5 ? 'high' : 'low';
    const icon = this.el('volicon');
    if (icon.dataset.shape !== shape) {
      icon.dataset.shape = shape;
      icon.innerHTML = this.VOL[shape];
    }
    this.el('mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    this.el('mute').classList.toggle('off', muted);
    this.el('vol').value = String(Math.round((this.audio.muted ? 0 : this.audio.volume) * 100));
  },

  /** Light the row in the tracklist behind the panel that is sounding. */
  mark() {
    const t = this.current();
    document.querySelectorAll('.track').forEach(row => {
      row.classList.toggle('playing',
        !!t && this.playing() && row.dataset.track === t.name && row.dataset.album === t.album);
    });
  }
};
