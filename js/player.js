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
  pendingSeek: null,  // frac to apply once metadata is ready
  cache: new Map(),   // "track" -> url | null

  init() {
    this.audio = new window.Audio();
    this.audio.preload = 'auto';
    this.audio.addEventListener('timeupdate', () => this.paint());
    this.audio.addEventListener('ended', () => {
      this.audio.pause();
      this.next();
    });
    this.audio.addEventListener('play', () => this.paint());
    this.audio.addEventListener('pause', () => this.paint());
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek != null) {
        const frac = this.pendingSeek;
        this.pendingSeek = null;
        this.seek(frac);
      }
      this.paint();
    });
    this.audio.addEventListener('error', () => {
      if (this.cue) this.startVirtual();
    });
  },

  register(face) {
    this.faces.push(face);
    face.render(this.state(face));
  },

  owns(face) {
    if (!this.cue) return false;
    if (face.scope === 'album') {
      return face.albumId === this.cue.albumId;
    }
    // modal face
    if (typeof TrackModal === 'undefined') return false;
    // pure single mode: both sides have no album
    if (this.cue.albumId == null && TrackModal.single) {
      return this.cue.name === TrackModal.single.name;
    }
    // album track open in modal
    return this.cue.albumId === TrackModal.albumId
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
    return !!(this.audio && this.audio.src && !this.audio.paused && !this.audio.ended);
  },

  time() {
    if (this.virtual) return this.vt;
    if (!this.audio || !this.audio.src) return 0;
    return Math.min(PREVIEW_LEN, this.audio.currentTime || 0);
  },

  /* ---------- cue / play ---------- */
  async playTrack(albumId, index) {
    const album = ALBUMS.find(a => a.id === albumId);
    if (!album || !album.tracks[index]) return;
    const name = album.tracks[index].name;

    const same = this.cue && this.cue.albumId === albumId && this.cue.index === index;
    if (same) { this.toggle(); return; }

    this._loadAndPlay(name, album.title, albumId, index);
  },

  async playTitle(name, albumLabel) {
    const same = this.cue && this.cue.name === name && this.cue.albumId == null;
    if (same) { this.toggle(); return; }
    this._loadAndPlay(name, albumLabel || 'Single', null, 0);
  },

  async _loadAndPlay(name, albumTitle, albumId, index) {
    this.stopVirtual();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.pendingSeek = null;
    this.cue = { albumId, index, name, album: albumTitle };
    this.virtual = false;
    this.resolving = true;
    this.paint();

    const url = await this.previewUrl(name, albumTitle);
    this.resolving = false;
    if (!this.cue || this.cue.name !== name) return;

    if (url) {
      this.virtual = false;
      this.audio.src = url;
      try {
        await this.audio.play();
      } catch (e) {
        this.startVirtual();
      }
    } else {
      this.startVirtual();
    }
    this.paint();
  },

  toggle() {
    if (!this.cue) return;
    if (this.virtual) {
      if (this.vtimer) this.stopVirtual(true);
      else this.startVirtual();
      this.paint();
      return;
    }
    if (!this.audio || !this.audio.src) {
      // no stream yet — fall back to virtual so the UI still responds
      this.startVirtual();
      this.paint();
      return;
    }
    if (this.audio.paused) {
      this.audio.play().then(() => this.paint()).catch(() => {
        this.startVirtual();
        this.paint();
      });
    } else {
      this.audio.pause();
      this.paint();
    }
  },

  seek(frac) {
    const t = Math.max(0, Math.min(PREVIEW_LEN, frac * PREVIEW_LEN));
    if (this.virtual) {
      this.vt = t;
      this.paint();
      return;
    }
    if (!this.audio || !this.audio.src) return;

    // metadata may not be ready yet (common with short iTunes previews)
    if (!isFinite(this.audio.duration) || this.audio.duration === 0) {
      this.pendingSeek = frac;
      // still update visual playhead so the user sees the scrub
      this.vt = t;
      this.paint();
      return;
    }
    try {
      this.audio.currentTime = Math.min(t, Math.max(0, this.audio.duration - 0.05));
    } catch (_) {}
    this.paint();
  },

  step(dir) {
    if (!this.cue) return;
    if (this.cue.albumId == null) return; // pure single — no neighbours
    const album = ALBUMS.find(a => a.id === this.cue.albumId);
    if (!album) return;
    const n = (this.cue.index + dir + album.tracks.length) % album.tracks.length;
    this.playTrack(album.id, n);
  },

  next() { this.step(1); },

  /* Show a track on the faces without starting it. */
  cueOnly(albumId, index) {
    const album = ALBUMS.find(a => a.id === albumId);
    if (!album || !album.tracks[index]) return;
    const same = this.cue && this.cue.albumId === albumId && this.cue.index === index;
    if (same) { this.paint(); return; }
    this.stopVirtual();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.virtual = false;
    this.pendingSeek = null;
    this.cue = { albumId, index, name: album.tracks[index].name, album: album.title };
    this.paint();
  },

  stop() {
    this.stopVirtual();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.cue = null;
    this.pendingSeek = null;
    this.paint();
  },

  /* ---------- internal clock fallback ---------- */
  startVirtual() {
    this.virtual = true;
    clearInterval(this.vtimer);
    // if we already have a visual position from a failed seek, keep it
    if (this.vt <= 0 || this.vt >= PREVIEW_LEN) this.vt = 0;
    let last = performance.now();
    this.vtimer = setInterval(() => {
      const now = performance.now();
      this.vt += (now - last) / 1000;
      last = now;
      if (this.vt >= PREVIEW_LEN) {
        this.vt = PREVIEW_LEN;
        this.stopVirtual(true);
      }
      this.paint();
    }, 80);
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
    const meta = await trackMetaFor(name);
    const url = meta ? meta.previewUrl : null;
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
      <span class="cp-disc"><span class="cp-center"></span></span>
      <span class="cp-sheen"></span>
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
      // put the record's own sleeve art on its label. Album-scoped faces know
      // their album outright; the shared face has to find it from whatever is
      // cued, which is why this reads the subject rather than the id alone.
      const art = coverFor(albumId, subject);
      if (art !== root.dataset.art) {
        root.dataset.art = art || '';
        // Resolved against the document before it goes into a custom property:
        // a relative url() substituted through var() is resolved against the
        // stylesheet that used it, which would look for it under css/.
        const href = art ? new URL(art, document.baseURI).href : '';
        root.style.setProperty('--cp-art', href ? `url("${href}")` : 'none');
        root.classList.toggle('has-art', !!art);
      }
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

  root.querySelector('[data-cp-act="toggle"]').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // nothing cued yet, or this face is not the one holding the cue:
    // start what this face is about instead of toggling someone else's track
    if (!Player.cue || !Player.owns(face)) {
      if (onEmptyPlay) onEmptyPlay();
      else if (scope === 'album') Player.playTrack(albumId, 0);
      return;
    }
    Player.toggle();
  });
  root.querySelector('[data-cp-act="prev"]').addEventListener('click', (e) => {
    e.preventDefault();
    Player.step(-1);
  });
  root.querySelector('[data-cp-act="next"]').addEventListener('click', (e) => {
    e.preventDefault();
    Player.step(1);
  });

  // ---- scrub: click + drag (pointer events work on both mouse and touch) ----
  const seekAt = (clientX) => {
    const r = bar.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    Player.seek(frac);
  };

  let dragging = false;
  bar.addEventListener('pointerdown', e => {
    if (!Player.cue || !Player.owns(face)) return;
    dragging = true;
    bar.setPointerCapture(e.pointerId);
    seekAt(e.clientX);
    e.preventDefault();
  });
  bar.addEventListener('pointermove', e => {
    if (!dragging) return;
    seekAt(e.clientX);
  });
  bar.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    try { bar.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  bar.addEventListener('pointercancel', () => { dragging = false; });

  // keyboard
  bar.addEventListener('keydown', e => {
    if (!Player.cue || !Player.owns(face)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); Player.seek((Player.time() + 3) / PREVIEW_LEN); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); Player.seek((Player.time() - 3) / PREVIEW_LEN); }
  });

  Player.register(face);
  return face;
}

/**
 * The cover art to spin on the label, or '' if the record is not identified.
 * @param {string|null} albumId  set on album-scoped faces
 * @param {{album?:string}|null} subject  whatever the face is currently about
 */
function coverFor(albumId, subject) {
  let album = albumId ? ALBUMS.find(a => a.id === albumId) : null;
  if (!album && subject && subject.album) {
    album = ALBUMS.find(a => a.title === subject.album);
  }
  return (album && album.cover && album.cover.art) || '';
}


function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
