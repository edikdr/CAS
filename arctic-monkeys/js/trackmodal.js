/* ============================================================
   Track window
   Opens on any receipt row: the words (short excerpts with a
   follow-along marker), credits, its own preview player, and
   where to hear the whole thing.

   Full lyrics are not reproduced. Every track links out to
   Genius, which is where the complete words and the community
   annotations live — and where the credits below come from
   when tools/fetch_am_data.py has been run with a token.
   ============================================================ */

const TrackModal = {
  overlay: null,
  face: null,
  album: null,
  idx: 0,
  lastFocus: null,
  timer: null,

  init() {
    this.overlay = document.getElementById('trackModal');
    if (!this.overlay) return;

    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', e => {
      if (this.overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
      if (e.key === 'Tab') this.trap(e);
    });
  },

  open(trackName, albumId) {
    this.album = ALBUMS.find(a => a.id === albumId) || albumOf(trackName);
    if (!this.album) return;
    this.idx = this.album.tracks.findIndex(t => t.name === trackName);
    if (this.idx < 0) this.idx = 0;
    this.lastFocus = document.activeElement;
    this.render();
    this.overlay.hidden = false;
    document.body.classList.add('locked');
    this.dust = startModalParticles(this.overlay);
    const close = this.overlay.querySelector('.tm-close');
    if (close) close.focus();
  },

  close() {
    if (!this.overlay || this.overlay.hidden) return;
    this.overlay.hidden = true;
    document.body.classList.remove('locked');
    if (this.dust) { this.dust.destroy(); this.dust = null; }
    if (this.face) { Player.unregister(this.face); this.face = null; }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  step(dir) {
    this.idx = (this.idx + dir + this.album.tracks.length) % this.album.tracks.length;
    this.render();
    const close = this.overlay.querySelector('.tm-close');
    if (close) close.focus();
  },

  trap(e) {
    const items = [...this.overlay.querySelectorAll(
      'button, [href], input, [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  },

  render() {
    const track = this.album.tracks[this.idx];
    const name = track.name;
    const credits = creditsFor(name, this.album);
    const words = lyricsFor(name);
    const api = Genius.track(name) || {};
    const album = this.album;
    const art = api.art || Genius.cover(album);

    // Genius credits win when the fetcher has supplied them
    const writers = (api.writers && api.writers.length)
      ? api.writers.join(', ') : credits.writers;
    const producers = (api.producers && api.producers.length)
      ? api.producers.join(', ') : credits.producers;
    const genius = api.geniusUrl || geniusUrl(name);

    const lines = words && words.lines.length
      ? `<ol class="tm-lines">${words.lines.map((l, i) => `
          <li><button type="button" class="tm-line" data-t="${l.t}" data-i="${i}">
            <span class="tm-tc">${fmtLrc(l.t)}</span>
            <span class="tm-tx">${esc(l.text)}</span>
          </button></li>`).join('')}</ol>
         <p class="tm-hint">Short signature lines with approximate fan timings —
            press play and the marker follows. The complete words are on
            <a href="${genius}" target="_blank" rel="noopener">Genius</a>.</p>`
      : `<p class="tm-empty">No transcribed excerpt for this one yet.
            The full words and the annotations are on
            <a href="${genius}" target="_blank" rel="noopener">Genius</a>.</p>`;

    this.overlay.innerHTML = `
      <div class="tm" role="dialog" aria-modal="true" aria-labelledby="tmTitle">
        <button class="tm-close" type="button" aria-label="Close">×</button>

        <header class="tm-head">
          ${art
            ? `<img class="tm-art" src="${esc(art)}" alt="" loading="lazy" decoding="async">`
            : `<div class="tm-no">${String(this.idx + 1).padStart(2, '0')}</div>`}
          <div>
            <h3 id="tmTitle" class="tm-title">${esc(name)}</h3>
            <p class="tm-sub">${esc(this.album.title)} · ${this.album.year} ·
               ${track.duration}${api.releaseDate ? ' · released ' + esc(api.releaseDate) : ''}</p>
          </div>
        </header>

        <div class="tm-player" data-tm="player"></div>

        <div class="tm-grid">
          <div class="tm-col">
            <h4 class="tm-h">The words</h4>
            ${lines}

            <h4 class="tm-h">Annotations</h4>
            <div class="tm-notes" data-tm="notes">
              <p class="tm-hint">looking for annotations…</p>
            </div>
          </div>

          <div class="tm-col">
            <h4 class="tm-h">Credits</h4>
            <dl class="tm-dl">
              <dt>Written by</dt><dd>${esc(writers)}</dd>
              <dt>Produced by</dt><dd>${esc(producers)}</dd>
              <dt>Album</dt><dd>${esc(this.album.title)}</dd>
              <dt>Label</dt><dd>${esc(this.album.label)}</dd>
              <dt>Recorded at</dt><dd>${esc(this.album.studio)}</dd>
              ${api.pageviews ? `<dt>Genius views</dt><dd>${Number(api.pageviews).toLocaleString('en-GB')}</dd>` : ''}
            </dl>

            ${credits.note ? `<h4 class="tm-h">Lore</h4><p class="tm-note">${credits.note}</p>` : ''}

            <h4 class="tm-h">Hear it in full</h4>
            <div class="tm-links">
              ${PLATFORMS.map(p =>
                `<a href="${p.url(name)}" target="_blank" rel="noopener">${p.name}</a>`).join('')}
              <a href="${videoUrl(name)}" target="_blank" rel="noopener">Video</a>
            </div>

            <p class="tm-attr">
              Words, annotations and songwriter credits:
              <a href="${genius}" target="_blank" rel="noopener">Genius</a> ·
              <a href="${geniusSearchUrl(name)}" target="_blank" rel="noopener">search Genius</a><br>
              Preview audio and artwork: iTunes Search API. Release data: MusicBrainz.
              This is an unofficial fan page.
            </p>
          </div>
        </div>

        <nav class="tm-nav">
          <button type="button" class="tm-prev">← Previous</button>
          <span class="tm-of">${this.idx + 1} / ${this.album.tracks.length}</span>
          <button type="button" class="tm-next">Next →</button>
        </nav>
      </div>`;

    this.overlay.querySelector('.tm-close').addEventListener('click', () => this.close());
    this.overlay.querySelector('.tm-prev').addEventListener('click', () => this.step(-1));
    this.overlay.querySelector('.tm-next').addEventListener('click', () => this.step(1));

    if (this.face) Player.unregister(this.face);
    this.face = new PlayerFace(this.overlay.querySelector('[data-tm="player"]'), this.album);
    this.face.idx = this.idx;
    this.face.paint();

    this.overlay.querySelectorAll('.tm-line').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = parseFloat(btn.dataset.t);
        if (Player.isCued(name)) Player.seek(t / (words.duration || 200));
        this.mark(parseInt(btn.dataset.i, 10));
      });
    });

    // render() replaces the panel, so the dust layer has to be remade
    if (this.dust) this.dust.destroy();
    this.dust = startModalParticles(this.overlay);

    this.follow(words);
    this.loadNotes(name, genius);
    this.hydrate(name);
  },

  /**
   * Fill in anything Genius can tell us that was not baked in: the
   * credits, the sleeve. Arrives after the window is already usable, so
   * nothing waits on the network.
   */
  async hydrate(name) {
    const live = await Genius.song(name);
    if (!live) return;
    if (!this.overlay || this.overlay.hidden) return;
    if (this.album.tracks[this.idx].name !== name) return;

    const set = (label, value) => {
      if (!value) return;
      const dts = [...this.overlay.querySelectorAll('.tm-dl dt')];
      const dt = dts.find(d => d.textContent.trim() === label);
      if (dt && dt.nextElementSibling) dt.nextElementSibling.textContent = value;
    };
    if (live.writers && live.writers.length) set('Written by', live.writers.join(', '));
    if (live.producers && live.producers.length) set('Produced by', live.producers.join(', '));

    const art = live.art || live.albumCover;
    const head = this.overlay.querySelector('.tm-head');
    if (art && head && !head.querySelector('.tm-art')) {
      const img = document.createElement('img');
      img.className = 'tm-art';
      img.src = art;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      const no = head.querySelector('.tm-no');
      if (no) no.replaceWith(img); else head.prepend(img);
    }
  },

  /**
   * Genius annotations: a lyric fragment and what the community made of
   * it. Clicking a fragment opens its note.
   */
  async loadNotes(name, geniusUrl) {
    const host = this.overlay.querySelector('[data-tm="notes"]');
    if (!host) return;
    const notes = await Genius.notes(name);
    // the window may have moved on while that was in flight
    if (!host.isConnected || this.album.tracks[this.idx].name !== name) return;

    if (!notes || !notes.length) {
      host.innerHTML = `<p class="tm-empty">No annotations for this one yet.
        Anyone can write one on
        <a href="${geniusUrl}" target="_blank" rel="noopener">its Genius page</a>.</p>`;
      return;
    }

    host.innerHTML = notes.map((n, i) => `
      <details class="tm-note-item"${i === 0 ? ' open' : ''}>
        <summary>${esc(n.fragment)}</summary>
        <div class="tm-note-body">
          <p>${esc(n.annotation).replace(/\n{2,}/g, '</p><p>')}</p>
          ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">
            Read it on Genius${n.votes ? ` · ${n.votes} votes` : ''}</a>` : ''}
        </div>
      </details>`).join('');
  },

  /** Walk the marker down the lines on the song's own timeline. */
  follow(words) {
    if (this.timer) clearInterval(this.timer);
    if (!words || !words.lines.length) return;
    const name = this.album.tracks[this.idx].name;

    this.timer = setInterval(() => {
      if (this.overlay.hidden) return;
      if (!Player.isCued(name) || !Player.playing()) return;
      // the preview is 30s of a whole song — map it onto the full timeline
      const songTime = (Player.time() / Player.duration()) * (words.duration || 200);
      let at = -1;
      words.lines.forEach((l, i) => { if (songTime >= l.t) at = i; });
      this.mark(at);
    }, 250);
  },

  mark(i) {
    this.overlay.querySelectorAll('.tm-line').forEach((b, j) =>
      b.classList.toggle('now', j === i));
  }
};
