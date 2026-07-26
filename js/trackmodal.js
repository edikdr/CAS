/* ============================================================
   Track modal
   Opens on a track click: lyric lines with timecodes, a preview
   player, the video link and every platform the song is on.
   Closes on ×, on an outside click and on Escape.
   ============================================================ */

const TrackModal = {
  overlay: null,
  albumId: null,
  index: -1,
  lastFocus: null,
  follow: null,      // interval id for the lyric follower
  ft: 0,             // follower playhead, seconds into the full song
  duration: 240,

  init() {
    this.overlay = $('#trackModal');
    if (!this.overlay) return;

    $('#tmClose').addEventListener('click', () => this.close());
    this.overlay.addEventListener('mousedown', e => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', e => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
      else if (e.key === 'Tab') this.trap(e);
    });
    $('#tmPrev').addEventListener('click', () => this.step(-1));
    $('#tmNext').addEventListener('click', () => this.step(1));
    $('#tmFollow').addEventListener('click', () => this.toggleFollow());

    const face = $('#tmPlayer');
    face.innerHTML = playerFaceHTML({ compact: true });
    bindPlayerFace(face, 'modal', null,
      () => this.playThis(),
      () => {
        const t = this.track();
        const album = ALBUMS.find(a => a.id === this.albumId);
        return t ? { name: t.name, album: album ? album.title : '' } : null;
      });
  },

  isOpen() { return this.overlay && this.overlay.classList.contains('open'); },

  open(albumId, index) {
    const album = ALBUMS.find(a => a.id === albumId);
    if (!album || !album.tracks[index]) return;
    this.lastFocus = document.activeElement;
    this.albumId = albumId;
    this.index = index;
    this.fill();
    this.overlay.classList.add('open');
    this.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => $('#tmClose').focus());
  },

  close() {
    if (!this.isOpen()) return;
    this.stopFollow();
    this.overlay.classList.remove('open');
    this.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  step(dir) {
    const album = ALBUMS.find(a => a.id === this.albumId);
    if (!album) return;
    this.index = (this.index + dir + album.tracks.length) % album.tracks.length;
    this.fill();
    $('.track-modal').scrollTop = 0;
  },

  track() {
    const album = ALBUMS.find(a => a.id === this.albumId);
    return album ? album.tracks[this.index] : null;
  },

  fill() {
    const album = ALBUMS.find(a => a.id === this.albumId);
    const t = this.track();
    if (!album || !t) return;

    this.stopFollow();

    $('#tmEyebrow').textContent = `${album.title} · ${album.year} · track ${this.index + 1} of ${album.tracks.length}`;
    $('#tmTitle').textContent = t.name;
    $('#tmDur').textContent = t.duration && t.duration !== '—' ? t.duration : '';

    // ---- lyric lines ----
    const set = lyricsFor(t.name);
    const body = $('#tmLyrics');
    const foot = $('#tmLyricsFoot');
    if (set && set.lines.length) {
      this.duration = set.duration || 240;
      this.ft = 0;
      body.innerHTML = set.lines.map((ln, i) =>
        `<div class="lrc-line" data-i="${i}" data-t="${ln.t}">
           <span class="tc">${fmtLrc(ln.t)}</span>
           <span class="tx">${esc(ln.text)}</span>
         </div>`).join('');
      $$('.lrc-line', body).forEach(row => {
        row.addEventListener('click', () => {
          this.ft = parseFloat(row.dataset.t);
          this.paintFollow();
        });
      });
      foot.hidden = false;
      this.paintFollow();
    } else {
      body.innerHTML = `<p class="tm-empty">No timed lines transcribed for this one yet.
        Open it on a streaming platform below.</p>`;
      foot.hidden = true;
    }

    // ---- links ----
    $('#tmVideo').href = videoUrl(t.name);
    $('#tmPlatforms').innerHTML = PLATFORMS.map(p =>
      `<a class="tm-plat" target="_blank" rel="noopener"
          href="${esc(p.id === 'spotify' ? spotifyTrackUrl(t.name, t.id) : p.url(t.name))}">
         ${esc(p.name)} <span aria-hidden="true">→</span>
       </a>`).join('');

    this.overlay.setAttribute('aria-label', `${t.name} — ${album.title}`);

    // name this track on the face when the player is idle; if something is
    // already playing, leave it alone — opening a song's words should not
    // stop the music
    if (!Player.isPlaying()) Player.cueOnly(this.albumId, this.index);
    else Player.paint();
  },

  playThis() { Player.playTrack(this.albumId, this.index); },

  /* ---------- lyric follower (walks the song's own timeline) ---------- */
  toggleFollow() {
    this.follow ? this.stopFollow() : this.startFollow();
  },

  startFollow() {
    const set = lyricsFor(this.track() ? this.track().name : '');
    if (!set || !set.lines.length) return;
    // starting at 0 would sit on nothing until the first timecode arrives
    const first = set.lines[0].t;
    if (this.ft < first) this.ft = Math.max(0, first - 1.5);
    let last = performance.now();
    clearInterval(this.follow);
    this.follow = setInterval(() => {
      const now = performance.now();
      this.ft += (now - last) / 1000;
      last = now;
      if (this.ft >= this.duration) { this.ft = 0; this.stopFollow(); }
      this.paintFollow();
    }, 120);
    $('#tmFollow').textContent = 'Pause follow';
  },

  stopFollow() {
    clearInterval(this.follow);
    this.follow = null;
    const b = $('#tmFollow');
    if (b) b.textContent = 'Follow along';
  },

  paintFollow() {
    const rows = $$('#tmLyrics .lrc-line');
    let idx = -1;
    rows.forEach((r, i) => { if (parseFloat(r.dataset.t) <= this.ft + 0.02) idx = i; });
    rows.forEach((r, i) => {
      r.classList.toggle('active', i === idx);
      r.classList.toggle('past', i < idx);
    });
    $('#tmFollowTime').textContent = `${fmtClock(this.ft)} / ${fmtClock(this.duration)}`;
    if (this.follow && rows[idx]) {
      const box = $('#tmLyrics');
      const top = rows[idx].offsetTop - box.clientHeight / 2 + rows[idx].clientHeight / 2;
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  },

  trap(e) {
    const f = $$('button, [href], input, [tabindex]:not([tabindex="-1"])', this.overlay)
      .filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
};
