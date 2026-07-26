/* ============================================================
   Preview player
   ------------------------------------------------------------
   One audio element for the whole page. Each album gets its own
   player face; the track modal gets a compact one. Whichever
   face owns the currently cued track renders the live state,
   the rest sit idle.

   Previews are 30 seconds. When a stream cannot be resolved the
   player still runs on an internal clock so the transport stays
   usable, and the face offers the full track elsewhere instead.
   ============================================================ */

const PREVIEW_LEN = 30;

const Player = {
  audio: null,
  cue: null,          // { albumId, index, name, album }
  faces: [],          // registered player faces
  virtual: false,     // true when no stream resolved
  vt: 0,              // virtual playhead
  vtimer: null,
  resolving: false,
  cache: new Map(),   // "track" -> url | null

  init() {
    this.audio = new window.Audio();
    this.audio.preload = 'none';
    this.audio.addEventListener('timeupdate', () => this.paint());
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('play', () => this.paint());
    this.audio.addEventListener('pause', () => this.paint());
    this.audio.addEventListener('error', () => {
      // stream died mid-flight: fall back to the internal clock
      if (this.cue) this.startVirtual();
    });
  },

  register(face) {
    this.faces.push(face);
    face.render(this.state(face));
  },

  owns(face) {
    if (!this.cue) return false;
    if (face.scope === 'album') return face.albumId === this.cue.albumId;
    // the modal face only drives the transport when the cued track is the one
    // the window is actually showing — otherwise browsing a song's words while
    // something else plays would hand it the wrong track to pause
    return typeof TrackModal !== 'undefined'
      && this.cue.albumId === TrackModal.albumId
      && this.cue.index === TrackModal.index;
  },

  state(face) {
    const own = this.owns(face);
    return {
      own,
      cue: own ? this.cue : null,
      playing: own && this.isPlaying(),
      t: own ? this.time() : 0,
      len: PREVIEW_LEN,
      virtual: own && this.virtual,
      resolving: own && this.resolving
    };
  },

  paint() {
    this.faces.forEach(f => f.render(this.state(f)));
  },

  isPlaying() {
    if (this.virtual) return this.vtimer !== null;
    return this.audio && !this.audio.paused && !this.audio.ended;
  },

  time() {
    if (this.virtual) return this.vt;
    return Math.min(PREVIEW_LEN, this.audio ? this.audio.currentTime : 0);
  },

  /* ---------- cue / play ---------- */
  async playTrack(albumId, index) {
    const album = ALBUMS.find(a => a.id === albumId);
    if (!album || !album.tracks[index]) return;
    const name = album.tracks[index].name;

    const same = this.cue && this.cue.albumId === albumId && this.cue.index === index;
    if (same) { this.toggle(); return; }

    this.stopVirtual();
    this.cue = { albumId, index, name, album: album.title };
    this.resolving = true;
    this.paint();

    const url = await this.previewUrl(name, album.title);
    this.resolving = false;
    if (!this.cue || this.cue.name !== name) return;   // superseded

    if (url) {
      this.virtual = false;
      this.audio.src = url;
      try {
        await this.audio.play();
      } catch {
        this.startVirtual();
      }
    } else {
      this.startVirtual();
    }
    this.paint();
  },

  toggle() {
    if (this.virtual) {
      this.vtimer ? this.stopVirtual(true) : this.startVirtual();
      this.paint();
      return;
    }
    if (!this.audio.src) return;
    if (this.audio.paused) this.audio.play().catch(() => this.startVirtual());
    else this.audio.pause();
  },

  seek(frac) {
    const t = Math.max(0, Math.min(PREVIEW_LEN, frac * PREVIEW_LEN));
    if (this.virtual) { this.vt = t; }
    else if (this.audio.src && isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.min(t, this.audio.duration - 0.05);
    }
    this.paint();
  },

  step(dir) {
    if (!this.cue) return;
    const album = ALBUMS.find(a => a.id === this.cue.albumId);
    if (!album) return;
    const n = (this.cue.index + dir + album.tracks.length) % album.tracks.length;
    this.playTrack(album.id, n);
  },

  next() { this.step(1); },

  /* Show a track on the faces without starting it, so the window you just
     opened describes the song you opened rather than whatever played last. */
  cueOnly(albumId, index) {
    const album = ALBUMS.find(a => a.id === albumId);
    if (!album || !album.tracks[index]) return;
    const same = this.cue && this.cue.albumId === albumId && this.cue.index === index;
    if (same) { this.paint(); return; }
    this.stopVirtual();
    if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); }
    this.virtual = false;
    this.cue = { albumId, index, name: album.tracks[index].name, album: album.title };
    this.paint();
  },

  stop() {
    this.stopVirtual();
    if (this.audio) { this.audio.pause(); }
    this.cue = null;
    this.paint();
  },

  /* ---------- internal clock fallback ---------- */
  startVirtual() {
    this.virtual = true;
    clearInterval(this.vtimer);
    let last = performance.now();
    this.vtimer = setInterval(() => {
      const now = performance.now();
      this.vt += (now - last) / 1000;
      last = now;
      if (this.vt >= PREVIEW_LEN) { this.vt = PREVIEW_LEN; this.stopVirtual(true); }
      this.paint();
    }, 100);
  },

  stopVirtual(keepPos) {
    clearInterval(this.vtimer);
    this.vtimer = null;
    if (!keepPos) this.vt = 0;
  },

  /* ---------- stream lookup (kept out of the interface) ---------- */
  async previewUrl(name, albumTitle) {
    const key = name.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);
    let url = null;
    try {
      const term = `Cigarettes After Sex ${name}`;
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=12`,
        { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const rows = (data.results || []).filter(r =>
          /cigarettes after sex/i.test(r.artistName || ''));
        const exact = rows.find(r =>
          (r.trackName || '').toLowerCase() === key &&
          (r.collectionName || '').toLowerCase().includes(String(albumTitle).toLowerCase()));
        const loose = rows.find(r => (r.trackName || '').toLowerCase() === key);
        url = (exact || loose || rows[0] || {}).previewUrl || null;
      }
    } catch {
      url = null;
    }
    this.cache.set(key, url);
    return url;
  }
};

/* ============================================================
   Player faces
   ============================================================ */

function playerFaceHTML(opts) {
  const { compact } = opts;
  return `
    <div class="cp-sleeve" aria-hidden="true">
      <span class="cp-disc"></span>
      <span class="cp-spindle"></span>
    </div>
    <div class="cp-body">
      <div class="cp-label" data-cp="label">Preview</div>
      <div class="cp-title" data-cp="title">Pick a track</div>
      ${compact ? '' : '<div class="cp-from" data-cp="from"></div>'}
      <div class="cp-bar" data-cp="bar" role="slider" tabindex="0"
           aria-label="Seek within the preview" aria-valuemin="0" aria-valuemax="30" aria-valuenow="0">
        <span class="cp-fill" data-cp="fill"></span>
        <span class="cp-head" data-cp="head"></span>
      </div>
      <div class="cp-times"><span data-cp="now">0:00</span><span data-cp="len">0:30</span></div>
      <div class="cp-controls">
        <button type="button" class="cp-btn" data-cp-act="prev" aria-label="Previous track">|&lt;</button>
        <button type="button" class="cp-btn play" data-cp-act="toggle" aria-label="Play">&#9654;</button>
        <button type="button" class="cp-btn" data-cp-act="next" aria-label="Next track">&gt;|</button>
        <span class="cp-note" data-cp="note">30-second preview</span>
      </div>
    </div>`;
}

/**
 * Wire a rendered player face to the Player.
 * @param {HTMLElement} root
 * @param {'album'|'modal'} scope
 * @param {string} albumId
 */
/**
 * Wire a rendered player face to the Player.
 * @param {HTMLElement} root
 * @param {'album'|'modal'} scope
 * @param {string|null} albumId
 * @param {Function} [onEmptyPlay] what Play should start when this face is idle
 * @param {Function} [subjectFn] the track this face is about while idle,
 *        so a window about one song never reads "Pick a track"
 */
function bindPlayerFace(root, scope, albumId, onEmptyPlay, subjectFn) {
  const q = (k) => root.querySelector(`[data-cp="${k}"]`);
  const bar = q('bar');

  const face = {
    scope, albumId, root,
    render(s) {
      const subject = s.cue || (subjectFn ? subjectFn() : null);
      root.classList.toggle('is-active', !!s.cue);
      root.classList.toggle('is-named', !!subject);
      root.classList.toggle('is-playing', s.playing);
      q('title').textContent = subject ? subject.name : 'Pick a track';
      if (q('from')) q('from').textContent = subject ? `${subject.album}` : '';
      q('label').textContent = s.resolving ? 'Cueing…' : (s.playing ? 'Now playing' : 'Preview');
      const pct = s.len ? Math.max(0, Math.min(100, (s.t / s.len) * 100)) : 0;
      q('fill').style.width = pct + '%';
      q('head').style.left = pct + '%';
      q('now').textContent = fmtClock(s.t);
      q('len').textContent = fmtClock(s.len);
      bar.setAttribute('aria-valuenow', Math.round(s.t));
      const btn = root.querySelector('[data-cp-act="toggle"]');
      btn.innerHTML = s.playing ? '&#10073;&#10073;' : '&#9654;';
      btn.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
      q('note').textContent = s.resolving
        ? 'finding the preview…'
        : (s.virtual && s.cue
            ? 'preview unavailable here — open the full track below'
            : '30-second preview');
    }
  };

  root.querySelector('[data-cp-act="toggle"]').addEventListener('click', () => {
    // nothing cued yet, or this face is not the one holding the cue:
    // start what this face is about instead of toggling someone else's track
    if (!Player.cue || !Player.owns(face)) {
      if (onEmptyPlay) onEmptyPlay();
      else if (scope === 'album') Player.playTrack(albumId, 0);
      return;
    }
    Player.toggle();
  });
  root.querySelector('[data-cp-act="prev"]').addEventListener('click', () => Player.step(-1));
  root.querySelector('[data-cp-act="next"]').addEventListener('click', () => Player.step(1));

  const seekAt = (clientX) => {
    const r = bar.getBoundingClientRect();
    Player.seek((clientX - r.left) / r.width);
  };
  bar.addEventListener('click', e => { if (Player.cue) seekAt(e.clientX); });
  bar.addEventListener('keydown', e => {
    if (!Player.cue) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); Player.seek((Player.time() + 3) / PREVIEW_LEN); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); Player.seek((Player.time() - 3) / PREVIEW_LEN); }
  });

  Player.register(face);
  return face;
}

function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
