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
    this.audio.addEventListener('timeupdate', () => this.paint());
    this.audio.addEventListener('ended', () => { this.stopVirtual(); this.paint(); });
    this.audio.addEventListener('play', () => this.paint());
    this.audio.addEventListener('pause', () => this.paint());
    this.audio.addEventListener('error', () => { this.virtual = true; this.paint(); });
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
   A player face — the transport drawn in receipt ink.
   ------------------------------------------------------------ */
class PlayerFace {
  constructor(host, album) {
    this.host = host;
    this.album = album;
    this.host.innerHTML = `
      <div class="pf">
        <div class="pf-disc" data-pf="disc"><span></span></div>
        <div class="pf-body">
          <div class="pf-track" data-pf="track">—</div>
          <div class="pf-note" data-pf="note">30-second preview</div>
          <div class="pf-bar" data-pf="bar" role="slider" tabindex="0"
               aria-label="Seek within the preview"
               aria-valuemin="0" aria-valuemax="30" aria-valuenow="0">
            <div class="pf-fill" data-pf="fill"></div>
          </div>
          <div class="pf-row">
            <button class="pf-btn" data-pf="prev" type="button" aria-label="Previous track">◀◀</button>
            <button class="pf-btn pf-play" data-pf="play" type="button" aria-label="Play">▶</button>
            <button class="pf-btn" data-pf="next" type="button" aria-label="Next track">▶▶</button>
            <span class="pf-time" data-pf="time">0:00</span>
          </div>
        </div>
      </div>`;

    this.el = sel => this.host.querySelector(`[data-pf="${sel}"]`);
    this.el('play').addEventListener('click', () => this.toggle());
    this.el('prev').addEventListener('click', () => this.step(-1));
    this.el('next').addEventListener('click', () => this.step(1));

    const bar = this.el('bar');
    bar.addEventListener('click', e => {
      if (!Player.isCued(this.current())) return;
      const r = bar.getBoundingClientRect();
      Player.seek((e.clientX - r.left) / r.width);
    });
    bar.addEventListener('keydown', e => {
      if (!Player.isCued(this.current())) return;
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      Player.seek((Player.time() + step * 2) / Player.duration());
    });

    this.idx = 0;
    Player.register(this);
    this.paint();
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

  paint() {
    const name = this.current();
    const mine = Player.isCued(name);
    const playing = mine && Player.playing();
    const frac = mine ? Player.time() / Player.duration() : 0;

    this.el('track').textContent = name || '—';
    this.el('fill').style.width = (frac * 100).toFixed(1) + '%';
    this.el('play').textContent = playing ? '❚❚' : '▶';
    this.el('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.el('disc').classList.toggle('spin', playing);

    const secs = mine ? Player.time() : 0;
    this.el('time').textContent =
      `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
    this.el('bar').setAttribute('aria-valuenow', Math.floor(secs));

    this.el('note').textContent =
      mine && Player.cue && Player.cue.loading ? 'finding the preview…'
        : mine && Player.virtual ? 'preview unavailable here — open the full track below'
          : '30-second preview';
  }
}
