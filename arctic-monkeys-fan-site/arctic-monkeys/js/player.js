/* ============================================================
   Preview player
   One <audio> element serves the whole page. Whichever face
   holds the cued track drives the transport; the others sit
   idle showing their own subject.

   Audio is a 30-second preview. It comes from am-api-data.js
   when the fetcher has been run, otherwise it is resolved live
   from the iTunes Search API. When neither works the transport
   still runs on an internal clock so the controls behave, and
   the face says so and points at the full-track links.
   ============================================================ */

const Player = {
  audio: null,
  cue: null,            // { track, album, url }
  faces: new Set(),
  virtual: false,       // true when no stream could be resolved
  vTime: 0,
  vTimer: null,
  cache: new Map(),

  init() {
    this.audio = new Audio();
    this.audio.preload = 'none';
    // asking for CORS is what makes the analyser legal on a cross-origin
    // preview; without it the browser hands back silence
    this.audio.crossOrigin = 'anonymous';
    this.audio.addEventListener('timeupdate', () => this.paint());
    this.audio.addEventListener('ended', () => { this.stopVirtual(); this.paint(); });
    this.audio.addEventListener('play', () => this.paint());
    this.audio.addEventListener('pause', () => this.paint());
    this.audio.addEventListener('error', () => { this.virtual = true; this.paint(); });
  },

  /* --------------------------------------------------------
     Frequency analysis.

     The previews are served from Apple, so the analyser only gets real
     numbers when that response carries CORS headers. When it does not —
     or when the whole graph is refused — `live` goes false and the
     waveform runs on the procedural model instead. Either way the wave
     moves with the track; only one of them is measuring it.
     -------------------------------------------------------- */
  ctx: null,
  analyser: null,
  freq: null,
  live: false,

  connectAnalyser() {
    if (this.ctx || !this.audio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.72;
      src.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    } catch {
      this.ctx = this.analyser = null;      // keep playing, just unmeasured
    }
  },

  /** Latest spectrum as 0..1 bins, or null when nothing is measurable. */
  spectrum() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.freq);
    let sum = 0;
    for (let i = 0; i < this.freq.length; i++) sum += this.freq[i];
    if (!sum) { this.live = false; return null; }   // silent = tainted source
    this.live = true;
    return this.freq;
  },

  register(face) { this.faces.add(face); },
  unregister(face) { this.faces.delete(face); },

  isCued(track) {
    return this.cue && this.cue.track.toLowerCase() === String(track).toLowerCase();
  },

  playing() {
    return this.virtual ? !!this.vTimer : (this.audio && !this.audio.paused);
  },

  time() { return this.virtual ? this.vTime : (this.audio ? this.audio.currentTime : 0); },

  duration() {
    if (this.virtual) return 30;
    const d = this.audio ? this.audio.duration : 0;
    return Number.isFinite(d) && d > 0 ? d : 30;
  },

  /** Cue a track and start it. */
  async play(trackName, album) {
    if (this.isCued(trackName) && this.playing()) return this.pause();

    if (!this.isCued(trackName)) {
      this.stopVirtual();
      if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); }
      this.cue = { track: trackName, album: album ? album.title : '', url: null, loading: true };
      this.virtual = false;
      this.paint();

      const url = await this.previewUrl(trackName, album && album.title);
      if (!this.isCued(trackName)) return;      // something else was cued meanwhile
      this.cue.loading = false;
      this.cue.url = url;
      this.virtual = !url;
      if (url) this.audio.src = url;
    }

    if (this.virtual) { this.startVirtual(); this.paint(); return; }

    this.connectAnalyser();
    if (this.ctx && this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* not fatal */ }
    }

    try {
      await this.audio.play();
    } catch {
      this.virtual = true;      // autoplay refused, or the file will not load
      this.startVirtual();
    }
    this.paint();
  },

  pause() {
    if (this.virtual) this.stopVirtual();
    else if (this.audio) this.audio.pause();
    this.paint();
  },

  seek(frac) {
    const t = Math.max(0, Math.min(1, frac)) * this.duration();
    if (this.virtual) this.vTime = t;
    else if (this.audio && Number.isFinite(this.audio.duration)) this.audio.currentTime = t;
    this.paint();
  },

  startVirtual() {
    this.stopVirtual();
    this.vTimer = setInterval(() => {
      this.vTime += 0.25;
      if (this.vTime >= 30) { this.vTime = 0; this.stopVirtual(); }
      this.paint();
    }, 250);
  },

  stopVirtual() {
    if (this.vTimer) { clearInterval(this.vTimer); this.vTimer = null; }
  },

  /** Resolve a 30-second preview: generated data first, then iTunes. */
  async previewUrl(name, albumTitle) {
    const key = `${name}::${albumTitle || ''}`;
    if (this.cache.has(key)) return this.cache.get(key);

    let url = null;

    // 1. whatever tools/fetch_am_data.py wrote
    if (typeof API_DATA !== 'undefined' && API_DATA.tracks && API_DATA.tracks[name]) {
      url = API_DATA.tracks[name].preview || null;
    }

    // 2. live lookup
    if (!url) {
      const term = `${ARTIST} ${name}`;
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=15`,
          { mode: 'cors' }
        );
        if (res.ok) {
          const rows = (await res.json()).results || [];
          const mine = rows.filter(r =>
            (r.artistName || '').toLowerCase().includes('arctic monkeys'));
          const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
          const exact = mine.find(r => norm(r.trackName) === norm(name));
          const loose = mine.find(r => norm(r.trackName).startsWith(norm(name).slice(0, 12)));
          url = (exact || loose || mine[0] || {}).previewUrl || null;
        }
      } catch {
        url = null;      // offline, blocked, or refused — the face handles it
      }
    }

    this.cache.set(key, url);
    return url;
  },

  paint() { this.faces.forEach(f => f.paint()); }
};

/* ------------------------------------------------------------
   A player face.

   The transport is the AM waveform: one damped burst drawn across the
   panel, whose amplitude follows the music. Played time is solid, the
   rest is dim, and clicking anywhere along it seeks.
   ------------------------------------------------------------ */

/* Only the face holding the cued track animates; the rest draw once and
   sit still. One shared loop keeps that to a single rAF for the page. */
const WaveLoop = {
  running: false,
  tick() {
    const any = Player.playing();
    Player.faces.forEach(f => f.drawWave());
    if (any) requestAnimationFrame(() => WaveLoop.tick());
    else WaveLoop.running = false;
  },
  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(() => this.tick());
  }
};

const BANDS = 48;

class PlayerFace {
  constructor(host, album) {
    this.host = host;
    this.album = album;
    this.bands = new Float32Array(BANDS);      // smoothed levels
    this.host.innerHTML = `
      <div class="pf">
        <div class="pf-top">
          <div class="pf-track" data-pf="track">—</div>
          <span class="pf-time" data-pf="time">0:00</span>
        </div>

        <canvas class="pf-wave" data-pf="wave" role="slider" tabindex="0"
                aria-label="Seek within the preview"
                aria-valuemin="0" aria-valuemax="30" aria-valuenow="0"></canvas>

        <div class="pf-row">
          <button class="pf-btn" data-pf="prev" type="button" aria-label="Previous track">◀◀</button>
          <button class="pf-btn pf-play" data-pf="play" type="button" aria-label="Play">▶</button>
          <button class="pf-btn" data-pf="next" type="button" aria-label="Next track">▶▶</button>
          <span class="pf-note" data-pf="note">30-second preview</span>
        </div>
      </div>`;

    this.el = sel => this.host.querySelector(`[data-pf="${sel}"]`);
    this.canvas = this.el('wave');
    this.ctx = this.canvas.getContext('2d');

    this.el('play').addEventListener('click', () => this.toggle());
    this.el('prev').addEventListener('click', () => this.step(-1));
    this.el('next').addEventListener('click', () => this.step(1));

    this.canvas.addEventListener('click', e => {
      if (!Player.isCued(this.current())) return this.toggle();
      const r = this.canvas.getBoundingClientRect();
      Player.seek((e.clientX - r.left) / r.width);
    });
    this.canvas.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); return this.toggle(); }
      if (!Player.isCued(this.current())) return;
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      Player.seek((Player.time() + step * 2) / Player.duration());
    });

    this.idx = 0;
    this.resize();
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(() => { this.resize(); this.drawWave(true); });
      this.ro.observe(this.canvas);
    }

    Player.register(this);
    this.paint();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 64;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
  }

  current() {
    const t = this.album.tracks[this.idx];
    return t ? t.name : '';
  }

  cueTrack(name) {
    const i = this.album.tracks.findIndex(t => t.name === name);
    if (i >= 0) this.idx = i;
    Player.play(name, this.album);
  }

  toggle() {
    const name = this.current();
    if (Player.isCued(name) && Player.playing()) Player.pause();
    else Player.play(name, this.album);
  }

  step(dir) {
    this.idx = (this.idx + dir + this.album.tracks.length) % this.album.tracks.length;
    Player.play(this.current(), this.album);
  }

  /** Pull the current levels: measured if we can, modelled if we cannot. */
  sample(playing, t) {
    const spec = playing ? Player.spectrum() : null;

    for (let i = 0; i < BANDS; i++) {
      let target;
      if (spec) {
        // the low half of the spectrum carries the audible shape
        const bin = Math.floor((i / BANDS) * spec.length * 0.7);
        target = spec[bin] / 255;
      } else if (playing) {
        /* No measurable signal — Apple serves some previews without the
           CORS header the analyser needs. Model it instead: a pulse on a
           beat, plus two slow waves so the shape keeps moving. */
        const beat = Math.pow(1 - ((t * 2) % 1), 2.2);
        target = 0.16
          + 0.34 * beat
          + 0.12 * Math.sin(t * 3.1 + i * 0.42)
          + 0.08 * Math.sin(t * 1.3 - i * 0.19);
      } else {
        target = 0;
      }
      // asymmetric smoothing: jump to a transient, fall away from it
      const cur = this.bands[i];
      this.bands[i] += (target - cur) * (target > cur ? 0.55 : 0.12);
    }
  }

  drawWave(force) {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    if (!W || !H) return;

    const mine = Player.isCued(this.current());
    const playing = mine && Player.playing();
    if (!playing && !force && !this.wasPlaying && this.drawnOnce) return;
    this.wasPlaying = playing;
    this.drawnOnce = true;

    const t = performance.now() / 1000;
    this.sample(playing, t);

    const frac = mine ? Math.min(1, Player.time() / Player.duration()) : 0;
    const mid = H / 2;
    const dpr = this.dpr || 1;

    ctx.clearRect(0, 0, W, H);

    // the burst envelope of the AM sleeve: silent, loud, silent
    const N = Math.max(120, Math.floor(W / (2 * dpr)));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      const d = (x - 0.5) * 2;
      const env = Math.exp(-(d * d) * 2.9);
      const band = this.bands[Math.min(BANDS - 1, Math.floor(x * BANDS))];
      const amp = (0.10 + 0.90 * band) * env;
      const y = mid - Math.sin(x * Math.PI * 54) * amp * (H * 0.46);
      pts.push([x * W, y]);
    }

    const stroke = (from, to, style, width) => {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const [x, y] = pts[i];
        i === from ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = width * dpr;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    };

    const cut = Math.round(frac * N);
    // the flat lead-in and lead-out the sleeve has
    ctx.beginPath();
    ctx.moveTo(0, mid); ctx.lineTo(pts[0][0], mid);
    ctx.moveTo(pts[N][0], mid); ctx.lineTo(W, mid);
    ctx.strokeStyle = 'rgba(232,229,222,.28)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();

    if (cut > 0) stroke(0, cut, '#f4f2ec', 1.9);
    if (cut < N) stroke(Math.max(0, cut), N, 'rgba(232,229,222,.30)', 1.5);

    // the playhead
    if (mine) {
      const px = frac * W;
      ctx.beginPath();
      ctx.moveTo(px, 2 * dpr); ctx.lineTo(px, H - 2 * dpr);
      ctx.strokeStyle = 'rgba(244,242,236,.55)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
    }
  }

  paint() {
    const name = this.current();
    const mine = Player.isCued(name);
    const playing = mine && Player.playing();

    this.el('track').textContent = name || '—';
    this.el('play').textContent = playing ? '❚❚' : '▶';
    this.el('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.host.classList.toggle('is-playing', playing);

    const secs = mine ? Player.time() : 0;
    this.el('time').textContent =
      `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
    this.canvas.setAttribute('aria-valuenow', Math.floor(secs));

    this.el('note').textContent =
      mine && Player.cue && Player.cue.loading ? 'finding the preview…'
        : mine && Player.virtual ? 'preview unavailable here — full track below'
          : Player.live && playing ? 'live waveform · 30-second preview'
            : '30-second preview';

    this.drawWave(true);
    if (playing) WaveLoop.start();
  }
}
