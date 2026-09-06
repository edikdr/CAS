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
      /* 512 bins rather than 64. The wave is mapped across the spectrum
         logarithmically below, and a 64-bin spectrum gives the whole
         right-hand half of the panel about six bins to share. */
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.65;
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
    Player.faces.forEach(f => f.drawWave());
    /* Carry on for the few frames a face still owes after a stop, so the
       wave falls back to the rule rather than freezing mid-burst. */
    let more = Player.playing();
    if (!more) Player.faces.forEach(f => { if (f.settle > 0) more = true; });
    if (more) requestAnimationFrame(() => WaveLoop.tick());
    else WaveLoop.running = false;
  },
  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(() => this.tick());
  }
};

/* Bands across the panel, log-spaced against the spectrum in sample().
   An even split hands the right-hand half of the wave the top two
   octaves, where music has next to no energy — which is exactly why that
   end of it never moved. */
const BANDS = 64;

/* The sheen travels while a track plays and holds still otherwise, so an
   idle face stays a single static paint. Reduced motion freezes it. */
const REDUCED_MOTION = !!(window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
    this.hue = 0;         // where the ripple of light has got to
    this.phase = 0;       // carrier drift, so the wave is never quite still
    this.settle = 0;      // frames still owed after a stop
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

  /**
   * Pull the current levels: measured if we can, modelled if we cannot.
   *
   * Two things used to leave the right-hand half of the wave sitting flat
   * however hard the track was playing, and both are fixed here:
   *
   *   - the bands were mapped straight onto the spectrum, so the right of
   *     the panel drew the top two octaves — where music has almost no
   *     energy — while the left drew the bass and did all the moving;
   *   - nothing compensated for the roughly 1/f fall-off, so even the
   *     energy that was up there never reached a visible amplitude.
   *
   * So: log spacing, a treble lift, and the shape normalised to its own
   * loudest band before the whole thing is scaled by how loud the moment
   * actually is.
   */
  sample(playing, t) {
    const spec = playing ? Player.spectrum() : null;
    const raw = this.raw || (this.raw = new Float32Array(BANDS));

    if (spec) {
      const LO = 1, HI = Math.min(spec.length - 1, 240);
      let sum = 0, peak = 0;
      for (let i = 0; i < BANDS; i++) {
        const a = Math.floor(LO * Math.pow(HI / LO, i / BANDS));
        const b = Math.max(a + 1, Math.floor(LO * Math.pow(HI / LO, (i + 1) / BANDS)));
        let acc = 0, n = 0;
        for (let k = a; k < b && k < spec.length; k++) { acc += spec[k]; n++; }
        const u = i / (BANDS - 1);
        const v = (acc / (n || 1) / 255) * (1 + 3.4 * u * u);   // treble lift
        raw[i] = v;
        sum += v;
        if (v > peak) peak = v;
      }
      /* Normalise the shape to its loudest band so the panel keeps its
         full range end to end, then scale by the loudness of the moment
         so a chorus and a breath still look different. */
      const loud = Math.min(1, (sum / BANDS) * 3.4);
      const scale = 0.34 + 0.66 * loud;
      /* The 0.18 is a floor under every band. Records with almost nothing
         above 8 kHz — most of the first two albums — would otherwise still
         draw a flat line at the treble end, which is the bug this whole
         function exists to fix; it scales with the loudness, so silence is
         still silent. */
      for (let i = 0; i < BANDS; i++) {
        raw[i] = (0.18 + 0.82 * (raw[i] / Math.max(0.05, peak))) * scale;
      }
    } else if (playing) {
      /* No measurable signal — Apple serves some previews without the
         CORS header the analyser needs. Model it instead: a beat, two slow
         waves, and a ripple that travels the width, so the whole panel
         moves rather than only the end nearest the bass. */
      const beat = Math.pow(1 - ((t * 2) % 1), 2.0);
      for (let i = 0; i < BANDS; i++) {
        const u = i / (BANDS - 1);
        raw[i] = Math.max(0,
          0.22
          + 0.34 * beat * (0.58 + 0.42 * Math.cos(u * 2.4))
          + 0.15 * Math.sin(t * 3.1 + i * 0.42)
          + 0.10 * Math.sin(t * 1.3 - i * 0.19)
          + 0.09 * Math.sin(t * 5.7 - u * 9.0));
      }
    } else {
      raw.fill(0);
    }

    for (let i = 0; i < BANDS; i++) {
      // asymmetric smoothing: jump to a transient, fall away from it
      const cur = this.bands[i], target = raw[i];
      this.bands[i] += (target - cur) * (target > cur ? 0.62 : 0.15);
    }
  }

  /**
   * The sheen the wave is drawn in: black, white and grey, and nothing
   * else. The page has no colour in it and the wave should not be the one
   * thing that does — so the shimmer is made of light rather than hue, a
   * ripple of brightness that travels along the line while a track plays
   * and holds still when it does not.
   *
   * `lo` and `hi` are the grey levels the ripple runs between, so the
   * same ramp draws the played line, its bloom and the part still to come
   * at three different strengths.
   */
  sheen(W, lo, hi, alpha) {
    const g = this.ctx.createLinearGradient(0, 0, W, 0);
    const stops = 14;
    const drift = (this.hue / 180) * Math.PI;
    for (let i = 0; i <= stops; i++) {
      const u = i / stops;
      const k = 0.5 + 0.5 * Math.sin(u * Math.PI * 2.6 - drift);
      const l = Math.round(lo + (hi - lo) * k);
      g.addColorStop(u, `rgba(${l}, ${l}, ${l}, ${alpha})`);
    }
    return g;
  }

  drawWave(force) {
    const ctx = this.ctx;
    if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    if (!W || !H) return;

    const mine = Player.isCued(this.current());
    const playing = mine && Player.playing();

    /* A handful of frames after a stop, so the bands fall away instead of
       freezing mid-shape, and then the face goes quiet again. */
    if (playing) this.settle = 10;
    else if (this.settle > 0) this.settle--;
    if (!playing && !force && !this.settle && this.drawnOnce) return;
    this.drawnOnce = true;

    const t = performance.now() / 1000;
    if (playing && !REDUCED_MOTION) {
      this.hue = (this.hue + 1.5) % 360;      // where the ripple has got to
      this.phase += 0.05;
    }
    this.sample(playing, t);

    const frac = mine ? Math.min(1, Player.time() / Player.duration()) : 0;
    const mid = H / 2;
    const dpr = this.dpr || 1;

    ctx.clearRect(0, 0, W, H);

    /* The burst envelope of the AM sleeve — loud in the middle, quiet at
       the ends — but no longer pinched shut: the old one fell to 5% of
       full height at either edge, so the last fifth of the wave could not
       have moved visibly even with a signal driving it. */
    const N = Math.max(180, Math.floor(W / (1.5 * dpr)));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      const d = (x - 0.5) * 2;
      const env = 0.24 + 0.76 * Math.exp(-(d * d) * 2.1);
      // interpolate between bands rather than stepping, or the wave reads
      // as 64 blocks rather than one line
      const bx = x * (BANDS - 1);
      const b0 = Math.floor(bx), b1 = Math.min(BANDS - 1, b0 + 1);
      const band = this.bands[b0] + (this.bands[b1] - this.bands[b0]) * (bx - b0);
      const amp = (0.12 + 0.86 * band) * env;
      const carrier = Math.sin(x * Math.PI * 54 + this.phase)
                    + 0.22 * Math.sin(x * Math.PI * 108 - this.phase * 1.7);
      pts.push([x * W, mid - carrier * amp * (H * 0.38)]);
    }

    const stroke = (from, to, style, width, glow) => {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const [x, y] = pts[i];
        i === from ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = width * dpr;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (glow) { ctx.shadowBlur = 10 * dpr; ctx.shadowColor = glow; }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    // the receipt rule the wave sits on
    ctx.beginPath();
    ctx.moveTo(0, mid); ctx.lineTo(W, mid);
    ctx.strokeStyle = 'rgba(232,229,222,.10)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    const cut = Math.round(frac * N);

    // still to come: the same wave, held back to the darker greys
    if (cut < N) stroke(Math.max(0, cut), N, this.sheen(W, 44, 94, 0.62), 1.5, null);

    /* Played: the ripple, bloomed and then drawn sharp over its own glow.
       The bloom is what carries the shimmer; the sharp line reads as
       paper-white wherever the light happens to be. */
    if (cut > 0) {
      stroke(0, cut, this.sheen(W, 26, 132, 0.38), 5, null);
      stroke(0, cut, this.sheen(W, 142, 250, 1), 2, 'rgba(236, 233, 226, .34)');
    }

    // the playhead
    if (mine) {
      const px = frac * W;
      ctx.beginPath();
      ctx.moveTo(px, 2 * dpr); ctx.lineTo(px, H - 2 * dpr);
      ctx.strokeStyle = 'rgba(244, 242, 236, .55)';
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
    this.canvas.setAttribute('aria-valuemax', Math.floor(Player.duration()));

    this.el('note').textContent =
      mine && Player.cue && Player.cue.loading ? 'finding the preview…'
        : mine && Player.virtual ? 'preview unavailable here — full track below'
          : Player.live && playing ? 'live waveform · 30-second preview'
            : '30-second preview';

    this.drawWave(true);
    if (playing || this.settle > 0) WaveLoop.start();
  }
}
