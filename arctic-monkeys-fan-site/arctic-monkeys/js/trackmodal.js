/* ============================================================
   Track window
   Opens on any receipt row: the words, the annotations,
   credits, its own preview player, and where to hear the
   whole thing.

   The words do not scroll themselves. Pressing a line marks
   it and seeks the preview to its timecode; nothing moves
   that mark afterwards.

   The window opens on the cue points baked into js/data.js so
   there is something readable on the frame it appears, and the
   whole song replaces them a moment later — see js/lyrics.js
   for where those come from and in what order.

   Every line answers a click: the Genius annotation for it if
   there is one, and if there is not, why not and where to look.
   ============================================================ */

const TrackModal = {
  overlay: null,
  face: null,
  album: null,
  idx: 0,
  lastFocus: null,

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
    // and if neither had one, hydrate() and this fill it in behind us
    if (!art) this.fillArt(album, name);

    // Genius credits win when the fetcher has supplied them
    const writers = (api.writers && api.writers.length)
      ? api.writers.join(', ') : credits.writers;
    const producers = (api.producers && api.producers.length)
      ? api.producers.join(', ') : credits.producers;
    const genius = api.geniusUrl || geniusUrl(name);

    this.words = words;
    const lines = this.linesMarkup(words, genius);

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
            <dl class="tm-dl" data-tm="credits">
              <dt>Written by</dt><dd>${esc(writers)}</dd>
              <dt>Produced by</dt><dd>${esc(producers)}</dd>
              <dt>Album</dt><dd>${esc(this.album.title)}</dd>
              <dt>Label</dt><dd>${esc(this.album.label)}</dd>
              <dt>Recorded at</dt><dd>${esc(this.album.studio)}</dd>
            </dl>

            <div data-tm="stats"></div>

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

    this.bindLines(name);

    // render() replaces the panel, so the dust layer has to be remade
    mountModalDecor(this.overlay, 'track');
    if (this.dust) this.dust.destroy();
    this.dust = startModalParticles(this.overlay);

    this.loadNotes(name, genius);
    this.hydrate(name);
    this.loadWords(name, genius);
  },

  /** A sleeve from whichever source has one, once one answers. */
  async fillArt(album, name) {
    const url = await Media.cover(album);
    if (!url || !this.overlay || this.overlay.hidden) return;
    if (this.album !== album || this.album.tracks[this.idx].name !== name) return;
    const head = this.overlay.querySelector('.tm-head');
    if (!head || head.querySelector('.tm-art')) return;
    const img = document.createElement('img');
    img.className = 'tm-art';
    img.src = url;
    img.alt = `${album.title} sleeve`;
    img.loading = 'lazy';
    img.decoding = 'async';
    const no = head.querySelector('.tm-no');
    if (no) no.replaceWith(img); else head.prepend(img);
  },

  /**
   * The line list, as markup.
   *
   * Built twice for most songs: once from the cue points baked into the
   * page so the window is readable the instant it opens, and again a
   * moment later from the full words, once they have arrived.
   */
  linesMarkup(words, genius) {
    if (!words || !words.lines.length) {
      return `<p class="tm-empty">No words for this one yet.
            They and the annotations are on
            <a href="${genius}" target="_blank" rel="noopener">Genius</a>.</p>`;
    }

    const full = words.source === 'lrclib';
    const timed = words.lines.some(l => l.t !== null && l.t !== undefined);

    const rows = words.lines.map((l, i) => `
          <li class="tm-line-row${l.text === '\u266a' ? ' tm-line-rest' : ''}" data-line="${i}">
            <button type="button" class="tm-line" data-t="${l.t === null ? '' : l.t}" data-i="${i}"
                    aria-expanded="false">
              <span class="tm-tc">${l.t === null || l.t === undefined ? '' : fmtLrc(l.t)}</span>
              <span class="tm-tx">${esc(l.text)}</span>
              <span class="tm-note-flag" hidden aria-hidden="true">?</span>
            </button>
            <div class="tm-line-note" hidden></div>
          </li>`).join('');

    const hint = full
      ? `<p class="tm-hint">${timed
            ? 'The complete words, with the song\u2019s own timings \u2014 press a timecode to jump the preview there.'
            : 'The complete words. This one has no timed transcription, so there are no timecodes to press.'}
            Click any line to open it; one marked
            <span class="tm-note-flag inline">?</span> has been annotated on
            Genius, and that is what you get.
            Words via <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>,
            annotations via <a href="${genius}" target="_blank" rel="noopener">Genius</a>.</p>`
      : `<p class="tm-hint">Cue points only \u2014 the full words have not landed
            yet, or could not be reached at all. Click any line to open it,
            or its timecode to jump the preview there; one marked
            <span class="tm-note-flag inline">?</span> has been annotated on
            <a href="${genius}" target="_blank" rel="noopener">Genius</a>.</p>`;

    return `<ol class="tm-lines${full ? ' tm-lines-full' : ''}">${rows}</ol>${hint}`;
  },

  bindLines(name) {
    this.overlay.querySelectorAll('.tm-line').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.i, 10);
        const t = parseFloat(btn.dataset.t);
        const words = this.words;
        /* A preview is thirty seconds of the song; a timecode is a
           position in the whole of it. Seeking only makes sense while the
           two are the same recording. */
        if (!Number.isNaN(t) && Player.isCued(name) && words && words.duration) {
          Player.seek(t / words.duration);
        }
        this.mark(i);
        this.toggleLineNote(i);
      });
    });
  },

  /**
   * What to say under a line nobody has annotated.
   *
   * Clicking a line used to do nothing at all unless Genius happened to
   * have a note matching it, which is most lines on most songs — the
   * click registered, the marker moved, and the page appeared to have
   * ignored you. Every line answers now, and the answer says which of the
   * three reasons applies rather than implying the line is uninteresting.
   */
  noNoteMarkup(line) {
    const search = `https://genius.com/search?q=${encodeURIComponent(line.text)}`;
    const why = Genius.state === 'connected'
      ? 'Genius has no annotation on this line.'
      : Genius.state === 'no-token'
        ? 'Annotations need a Genius token: set GENIUS_ACCESS_TOKEN in the site’s environment and redeploy.'
        : Genius.state === 'absent'
          ? 'Annotations need the site’s own /api/genius route, which this deploy has not got.'
          : 'Still asking Genius…';
    // no need to repeat the line: it is directly above this panel
    return `<p class="tm-line-why">${why}</p>
      <a href="${search}" target="_blank" rel="noopener">Look this line up on Genius</a>`;
  },

  /**
   * Swap the baked cue points for the whole song once LRCLIB answers.
   *
   * The window is already open and usable by the time this lands, so it
   * replaces the list in place rather than making anyone wait for it. If
   * nothing comes back, what is already on screen stays.
   */
  async loadWords(name, genius) {
    const album = this.album;
    const live = await Lyrics.get(name, album && album.title);
    if (!live || !live.lines.length) {
      if (window.Diag) Diag.set('lyrics', 'baked');
      return;
    }
    // the window may have moved on while that was in flight
    if (!this.overlay || this.overlay.hidden) return;
    if (this.album !== album || this.album.tracks[this.idx].name !== name) return;

    const host = this.overlay.querySelector('.tm-lines');
    const empty = this.overlay.querySelector('.tm-empty');
    const anchor = host || empty;
    if (!anchor) return;

    /* Keep whichever duration is the song's: LRCLIB reports the real one,
       and the baked entry falls back to a written running time. */
    this.words = {
      track: name,
      duration: live.duration || (this.words && this.words.duration) || 0,
      lines: live.lines,
      synced: live.synced,
      source: 'lrclib'
    };

    const wrap = document.createElement('div');
    wrap.innerHTML = this.linesMarkup(this.words, genius);
    /* The old markup is a list plus a paragraph of explanation; both go. */
    const stale = [anchor, anchor.nextElementSibling]
      .filter(el => el && (el.classList.contains('tm-lines') ||
                           el.classList.contains('tm-hint') ||
                           el.classList.contains('tm-empty')));
    stale.slice(1).forEach(el => el.remove());
    anchor.replaceWith(...wrap.childNodes);

    this.bindLines(name);
    if (this.rawNotes) this.renderLeftoverNotes(this.attachNotes(this.rawNotes));
    if (window.Diag) Diag.set('lyrics', live.synced ? 'lrclib · timed' : 'lrclib · plain');
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

    this.renderStats(live);

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
   * The numbers and relationships Genius keeps on a song.
   *
   * Every field is optional — the API fills in what it has for a given
   * song and omits the rest — so each row is only drawn when it exists.
   */
  renderStats(live) {
    const host = this.overlay.querySelector('[data-tm="stats"]');
    if (!host || !live) return;

    const num = n => Number(n).toLocaleString('en-GB');
    const rows = [];
    if (live.pageviews) rows.push(['Views', num(live.pageviews)]);
    if (live.shares) rows.push(['Shares', num(live.shares)]);
    if (live.annotations) rows.push(['Annotations', num(live.annotations)]);
    if (live.contributors) rows.push(['Contributors', num(live.contributors)]);
    if (live.releaseDate) rows.push(['Released', esc(live.releaseDate)]);
    if (live.recordedAt) rows.push(['Recording location', esc(live.recordedAt)]);
    if (live.featured && live.featured.length)
      rows.push(['Featuring', esc(live.featured.join(', '))]);

    const rel = (live.relationships || []).map(r => `
      <div class="tm-rel">
        <span class="tm-rel-kind">${esc(r.kind)}</span>
        ${r.songs.map(sg =>
          `<a href="${esc(sg.url)}" target="_blank" rel="noopener">${esc(sg.title)}</a>`
        ).join('')}
      </div>`).join('');

    const media = (live.media || []).map(m =>
      `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.provider)}</a>`
    ).join('');

    if (!rows.length && !rel && !media) return;

    host.innerHTML = `
      <h4 class="tm-h">On Genius${live.hot ? ' <span class="tm-hot">hot</span>' : ''}</h4>
      ${rows.length ? `<dl class="tm-dl">${rows.map(([k, v]) =>
        `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
      ${rel ? `<div class="tm-rels">${rel}</div>` : ''}
      ${media ? `<div class="tm-links tm-media">${media}</div>` : ''}`;
  },

  /**
   * Attach annotations to the lines they belong to.
   *
   * Genius returns referents — a fragment of the song, and what the
   * community wrote about it. Our lines and their fragments are separate
   * transcriptions of the same words, so they are matched loosely:
   * normalise both, then look for one containing the other. What matches
   * is folded into the line; the rest stays in its own list below.
   */
  attachNotes(notes) {
    const words = this.words;
    if (!words || !notes) return notes || [];

    const norm = t => String(t).toLowerCase()
      .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

    /* "crawling" and "crawlin" are the same word, and which one a
       transcription writes down is a coin toss on a band who drop the g
       on most of them. Folding the ending is worth more here than any
       amount of tuning the threshold below. */
    const terms = t => norm(t).split(' ')
      .filter(w => w.length > 2)
      .map(w => w.replace(/ing$/, 'in'));

    /* How much of a line is in a fragment.

       Containment on its own missed most of what it should have caught:
       our lines and Genius' fragments are separate transcriptions of the
       same words, and one "cause" for "'cause", one comma inside a word,
       or a fragment that begins mid-line was enough. The share of a
       line's words that appear in the fragment survives all three, and
       the reverse share — with an allowance, because a fragment is often
       several lines long and only one of them is this one — keeps a
       four-word line from matching a paragraph it merely appears in. */
    const share = (a, b) => {
      if (!a.length) return 0;
      const set = new Set(b);
      let n = 0;
      for (const w of a) if (set.has(w)) n++;
      return n / a.length;
    };

    const pool = notes.map((n, j) => ({
      n, j, norm: norm(n.fragment), terms: terms(n.fragment)
    }));
    const used = new Set();
    this.lineNotes = {};

    words.lines.forEach((line, i) => {
      const a = norm(line.text);
      // bracketed stage directions are ours, not the song's
      if (!a || a.length < 8 || /^\[/.test(line.text)) return;
      const at = terms(line.text);

      let best = null, bestScore = 0;
      for (const cand of pool) {
        if (used.has(cand.j) || cand.norm.length < 7) continue;
        const score = (cand.norm.includes(a) || a.includes(cand.norm))
          ? 1
          : Math.min(share(at, cand.terms), share(cand.terms, at) + 0.34);
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      if (!best || bestScore < 0.7) return;

      used.add(best.j);
      this.lineNotes[i] = best.n;

      const row = this.overlay.querySelector(`.tm-line-row[data-line="${i}"]`);
      if (!row) return;
      row.classList.add('has-note');
      const flag = row.querySelector('.tm-note-flag');
      if (flag) flag.hidden = false;
      row.querySelector('.tm-line').setAttribute(
        'aria-label', `${line.text} — read the annotation`);

      /* A line opened before its annotation landed is showing the panel
         that says there is not one. Swap it for the annotation. */
      const body = row.querySelector('.tm-line-note');
      if (body && !body.hidden && body.dataset.filled === 'none') {
        body.hidden = true;
        body.dataset.filled = '';
        this.toggleLineNote(i);
      }
    });

    return notes.filter((_, j) => !used.has(j));
  },

  /** Open or close what sits under one line. */
  toggleLineNote(i) {
    const row = this.overlay.querySelector(`.tm-line-row[data-line="${i}"]`);
    if (!row) return;
    const line = this.words && this.words.lines[i];
    if (!line || !line.text || line.text === '♪') return;

    const note = this.lineNotes && this.lineNotes[i];
    const body = row.querySelector('.tm-line-note');
    const btn = row.querySelector('.tm-line');
    const open = body.hidden;

    /* Re-filled rather than filled once: an annotation can arrive after a
       line was already opened without one, and the panel should then be
       the annotation rather than the note saying there is not one. */
    const filled = note ? 'note' : 'none';
    if (open && body.dataset.filled !== filled) {
      body.innerHTML = note
        ? `<p>${esc(note.annotation).replace(/\n{2,}/g, '</p><p>')}</p>
           ${note.url ? `<a href="${esc(note.url)}" target="_blank" rel="noopener">
             On Genius${note.votes ? ` · ${note.votes} votes` : ''}</a>` : ''}`
        : this.noNoteMarkup(line);
      body.dataset.filled = filled;
      body.classList.toggle('is-bare', !note);
    }
    body.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
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
    // kept so they can be re-attached when the full words replace the cues
    this.rawNotes = notes;

    if (!notes || !notes.length) {
      /* "None yet" is only true when Genius was actually asked. Said on a
         deploy with no token it reads as a fact about the song rather
         than about the deploy, which is how this went unnoticed. */
      const page = `<a href="${geniusUrl}" target="_blank" rel="noopener">the song\u2019s Genius page</a>`;
      const why = Genius.state === 'connected'
        ? `No annotations for this one yet. Anyone can write one on ${page}.`
        : Genius.state === 'no-token'
          ? `Annotations need a Genius token. Add <code>GENIUS_ACCESS_TOKEN</code> to the
             site\u2019s environment variables and redeploy, or run
             <code>tools/fetch_am_data.py --genius</code> once with a token and they
             travel inside the site. Until then they are on ${page}.`
          : `Nothing is answering for Genius on this deploy, and nothing was baked
             into it. Either deploy the function beside the site, or run
             <code>tools/fetch_am_data.py --genius</code> once with a token \u2014 which
             is the shape that works on a host that only serves files. They are
             on ${page}.`;
      host.innerHTML = `<p class="tm-empty">${why}</p>`;
      return;
    }

    // anything that matched a line now lives on that line
    this.renderLeftoverNotes(this.attachNotes(notes));
  },

  /**
   * The annotations that matched no line, listed under the words.
   *
   * Drawn again whenever the matching is redone. It is redone once per
   * window: the notes arrive while the cue points are still on screen and
   * are matched against those, and then the whole song replaces them and
   * matches far more. Without this the list underneath stayed the one
   * computed against six cue points, so annotations appeared twice —
   * once on their line, once again as left over.
   */
  renderLeftoverNotes(rest) {
    const host = this.overlay.querySelector('[data-tm="notes"]');
    if (!host) return;
    if (!rest || !rest.length) {
      host.innerHTML = `<p class="tm-hint">Every annotation Genius has for this
        one is attached to its line above.</p>`;
      return;
    }

    host.innerHTML = rest.map((n, i) => `
      <details class="tm-note-item"${i === 0 ? ' open' : ''}>
        <summary>${esc(n.fragment)}</summary>
        <div class="tm-note-body">
          <p>${esc(n.annotation).replace(/\n{2,}/g, '</p><p>')}</p>
          ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">
            Read it on Genius${n.votes ? ` · ${n.votes} votes` : ''}</a>` : ''}
        </div>
      </details>`).join('');
  },

  /**
   * Mark the line that was pressed.
   *
   * Nothing else moves it. A timer used to walk it down the song in step
   * with playback, scrolling the list to keep it in view — which meant
   * the text you were reading slid out from under you every few seconds,
   * and a line you had opened scrolled away while you read it. The
   * timecodes are still there and still seek when you press one; the
   * reading order is now yours.
   */
  mark(i) {
    this.overlay.querySelectorAll('.tm-line').forEach((b, j) => {
      b.classList.toggle('now', j === i);
    });
  }
};
