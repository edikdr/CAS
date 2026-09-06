/* ============================================================
   Rendering, search, member window, wiring
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------
   Members
   ------------------------------------------------------------ */
function renderMembers() {
  const host = $('#memberGrid');
  if (!host) return;
  host.innerHTML = MEMBERS.map((m, i) => {
    const photo = Genius.photo(m.name);
    return `
    <button class="member reveal" type="button" data-member="${i}"
            aria-label="${esc(m.name)} — open profile">
      ${photo
        ? `<img class="mono m-photo" src="${esc(photo)}" alt="" loading="lazy" decoding="async">`
        : `<span class="mono">${esc(m.initials)}</span>`}
      <span class="m-body">
        <span class="m-name">${esc(m.name)}</span>
        <span class="m-role">${esc(m.role)}</span>
        <span class="m-bio">${esc(m.bio)}</span>
        <span class="m-tag ${m.status}">${m.status === 'current' ? 'current line-up' : 'former member'}</span>
      </span>
    </button>`;
  }).join('');

  $$('[data-member]', host).forEach(btn =>
    btn.addEventListener('click', () => MemberModal.open(+btn.dataset.member)));
  observeReveals(host);

  // photographs, if Genius is reachable and none were baked in
  MEMBERS.forEach(async (m, i) => {
    if (Genius.photo(m.name)) return;
    const live = await Genius.artistLive(m.name);
    if (!live || !live.photo) return;
    const card = host.querySelector(`[data-member="${i}"] .mono`);
    if (!card || card.tagName === 'IMG') return;
    const img = document.createElement('img');
    img.className = 'mono m-photo';
    img.src = live.photo;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    card.replaceWith(img);
  });
}

const MemberModal = {
  overlay: null, idx: 0, lastFocus: null,

  init() {
    this.overlay = $('#memberModal');
    if (!this.overlay) return;
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });
    document.addEventListener('keydown', e => {
      if (this.overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
      if (e.key === 'Tab') this.trap(e);
    });
  },

  open(i) {
    this.idx = i;
    this.lastFocus = document.activeElement;
    this.render();
    this.overlay.hidden = false;
    document.body.classList.add('locked');
    if (this.dust) this.dust.destroy();
    this.dust = startModalParticles(this.overlay);
    this.overlay.querySelector('.tm-close').focus();
  },

  close() {
    if (this.overlay.hidden) return;
    this.overlay.hidden = true;
    document.body.classList.remove('locked');
    if (this.dust) { this.dust.destroy(); this.dust = null; }
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  step(d) {
    this.idx = (this.idx + d + MEMBERS.length) % MEMBERS.length;
    this.render();
    this.overlay.querySelector('.tm-close').focus();
  },

  trap(e) {
    const items = $$('button, [href]', this.overlay).filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  },

  render() {
    const m = MEMBERS[this.idx];
    this.overlay.innerHTML = `
      <div class="tm mm" role="dialog" aria-modal="true" aria-labelledby="mmTitle">
        <button class="tm-close" type="button" aria-label="Close">×</button>
        <header class="mm-head">
          ${Genius.photo(m.name)
            ? `<img class="mm-mono mm-photo" src="${esc(Genius.photo(m.name))}"
                    alt="" loading="lazy" decoding="async">`
            : `<div class="mm-mono">${esc(m.initials)}</div>`}
          <div>
            <h3 id="mmTitle" class="tm-title">${esc(m.name)}</h3>
            <p class="tm-sub">${esc(m.role)}</p>
          </div>
        </header>
        <div class="mm-body">
          ${m.extra.map(p => `<p>${p}</p>`).join('')}
        </div>
        <dl class="tm-dl mm-dl">
          <dt>Status</dt><dd>${m.status === 'current' ? 'Current line-up' : 'Former member'}</dd>
          <dt>Years</dt><dd>${esc(m.years)}</dd>
          <dt>Born</dt><dd>${esc(m.born)}</dd>
          <dt>Instruments</dt><dd>${esc(m.instruments)}</dd>
          <dt>Notable</dt><dd>${m.notable}</dd>
        </dl>
        <nav class="tm-nav">
          <button type="button" class="tm-prev">← Previous</button>
          <span class="tm-of">${this.idx + 1} / ${MEMBERS.length}</span>
          <button type="button" class="tm-next">Next →</button>
        </nav>
      </div>`;
    this.overlay.querySelector('.tm-close').addEventListener('click', () => this.close());
    this.overlay.querySelector('.tm-prev').addEventListener('click', () => this.step(-1));
    this.overlay.querySelector('.tm-next').addEventListener('click', () => this.step(1));

    mountModalDecor(this.overlay, 'member');
    if (this.dust) this.dust.destroy();
    this.dust = startModalParticles(this.overlay);
  }
};

/* ------------------------------------------------------------
   Discography
   ------------------------------------------------------------ */
function renderAlbums(filter = '') {
  const host = $('#albumList');
  if (!host) return;
  const q = filter.toLowerCase().trim();
  host.innerHTML = '';

  const shown = ALBUMS.filter(album => {
    if (!q) return true;
    return album.title.toLowerCase().includes(q)
      || String(album.year).includes(q)
      || album.producers.toLowerCase().includes(q)
      || album.tracks.some(t => t.name.toLowerCase().includes(q));
  });

  if (!shown.length) {
    host.innerHTML = `<p class="no-results">Nothing matches “${esc(filter)}”.
      Try <em>505</em>, <em>Mardy</em>, <em>Homme</em>, <em>2013</em> or <em>mirrorball</em>.</p>`;
    updateSearchMeta(q, 0);
    return;
  }

  let hits = 0;
  shown.forEach(album => {
    const card = buildAlbumCard(album);
    host.appendChild(card);

    // the sleeve and the note, above the receipt
    const head = document.createElement('div');
    head.className = 'album-head';
    const cover = Genius.cover(album);
    head.innerHTML = `
      ${cover ? `<img class="album-cover" src="${esc(cover)}" alt="${esc(album.title)} sleeve"
                      loading="lazy" decoding="async">` : ''}
      <p class="album-note">
        <strong>${esc(album.type)} · ${esc(album.released)}</strong> ${album.note}
      </p>`;
    card.querySelector('.rc-stage').insertAdjacentElement('beforebegin', head);

    // Choosing a track screws the receipt back up and opens the window —
    // the paper goes away, the song takes over.
    $$('.rc-row', card).forEach(row => {
      const choose = () => {
        setOpen(card, false);
        TrackModal.open(row.dataset.track, album.id);
      };
      row.addEventListener('click', choose);
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
      });

      if (q && row.dataset.track.toLowerCase().includes(q)) {
        row.classList.add('hit');
        hits++;
      }
    });

    measureReceipt(card);

    // a search that matches tracks unfolds that receipt on those tracks
    if (q && card.querySelector('.rc-row.hit')) setOpen(card, true);
  });

  updateSearchMeta(q, shown.length, hits);
  observeReveals(host);
}

function updateSearchMeta(q, albums, hits = 0) {
  const meta = $('#searchMeta');
  if (!meta) return;
  const total = ALBUMS.reduce((s, a) => s + a.tracks.length, 0);
  meta.textContent = q
    ? `${albums} record${albums === 1 ? '' : 's'}${hits ? `, ${hits} track${hits === 1 ? '' : 's'}` : ''} matching “${q}”`
    : `${ALBUMS.length} studio albums · ${total} tracks · press / to search`;
}

/* ------------------------------------------------------------
   Singles + timeline
   ------------------------------------------------------------ */
function renderSingles() {
  const host = $('#singleGrid');
  if (!host) return;
  host.innerHTML = SINGLES.map((s, i) => `
    <button class="single reveal" type="button" data-single="${i}"
            aria-label="${esc(s.title)} — open">
      <span class="s-year">${s.year}</span>
      <span class="s-title">${esc(s.title)}</span>
      <span class="s-note">${s.note}</span>
      <span class="s-open">Open →</span>
    </button>`).join('');

  $$('[data-single]', host).forEach(btn =>
    btn.addEventListener('click', () => openSingle(SINGLES[+btn.dataset.single])));
  observeReveals(host);
}

/**
 * Open a single.
 *
 * Most of them are album tracks, and the track window already holds
 * everything — words, annotations, credits, the player. Only the
 * standalone releases need a window of their own.
 */
function openSingle(single) {
  const album = albumOf(single.title);
  if (album) return TrackModal.open(single.title, album.id);
  SingleModal.open(single);
}

const SingleModal = {
  overlay: null, single: null, face: null, lastFocus: null,

  init() {
    this.overlay = $('#singleModal');
    if (!this.overlay) return;
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });
    document.addEventListener('keydown', e => {
      if (this.overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
  },

  open(single) {
    this.single = single;
    this.lastFocus = document.activeElement;
    this.render();
    this.overlay.hidden = false;
    document.body.classList.add('locked');
    this.overlay.querySelector('.tm-close').focus();
  },

  close() {
    if (this.overlay.hidden) return;
    this.overlay.hidden = true;
    document.body.classList.remove('locked');
    if (this.face) { Player.unregister(this.face); this.face = null; }
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  render() {
    const s = this.single;
    const genius = geniusUrl(s.title);
    this.overlay.innerHTML = `
      <div class="tm" role="dialog" aria-modal="true" aria-labelledby="smTitle">
        <button class="tm-close" type="button" aria-label="Close">×</button>
        <header class="tm-head">
          <div class="tm-no">${s.year}</div>
          <div>
            <h3 id="smTitle" class="tm-title">${esc(s.title)}</h3>
            <p class="tm-sub">Standalone single · ${s.year}</p>
          </div>
        </header>

        <div class="tm-player" data-sm="player"></div>

        <p class="tm-note">${s.note}</p>

        <h4 class="tm-h">Hear it in full</h4>
        <div class="tm-links">
          ${PLATFORMS.map(p =>
            `<a href="${p.url(s.title)}" target="_blank" rel="noopener">${p.name}</a>`).join('')}
          <a href="${videoUrl(s.title)}" target="_blank" rel="noopener">Video</a>
          <a href="${genius}" target="_blank" rel="noopener">Genius</a>
        </div>

        <p class="tm-attr">
          Words and credits: <a href="${genius}" target="_blank" rel="noopener">Genius</a>.
          Preview audio: iTunes Search API. Unofficial fan page.
        </p>
      </div>`;

    this.overlay.querySelector('.tm-close').addEventListener('click', () => this.close());

    // a one-track album, so the transport has something to walk
    const stub = { title: s.title, tracks: [{ name: s.title, duration: '—' }] };
    this.face = new PlayerFace(this.overlay.querySelector('[data-sm="player"]'), stub);

    mountModalDecor(this.overlay, 'member');
    if (this.dust) this.dust.destroy();
    this.dust = startModalParticles(this.overlay);
  }
};

function renderTimeline() {
  const host = $('#timeline');
  if (!host) return;
  host.innerHTML = TIMELINE.map(t => `
    <article class="tl reveal">
      <div class="tl-year">${esc(t.year)}</div>
      <div class="tl-body">
        <h4 class="tl-title">${esc(t.title)}</h4>
        <p>${t.text}</p>
        ${(t.quotes || []).map(q => `
          <blockquote class="tl-quote">
            <p>${esc(q.text)}</p>
            <cite>${esc(q.by)}</cite>
          </blockquote>`).join('')}
        ${t.detail ? `<p class="tl-detail">${t.detail}</p>` : ''}
      </div>
    </article>`).join('');
  observeReveals(host);
}

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  Player.init();
  MemberModal.init();
  TrackModal.init();
  SingleModal.init();
  Quiz.init();

  // cut-paper headings
  $$('[data-ransom]').forEach(el => ransom(el, el.dataset.ransom));

  renderMembers();
  renderTimeline();
  renderAlbums();
  renderSingles();

  mountDecor();
  mountStars();
  startDust();
  observeReveals();
  watchNav();

  /* The sections finish growing after the receipts and singles are in, so
     the gutters get one more pass once the page has settled — and again
     whenever it is resized, since every position is a percentage of a
     height that just changed. */
  requestAnimationFrame(() => spaceOut());
  let spaceTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(spaceTimer);
    spaceTimer = setTimeout(spaceOut, 220);
  });

  const search = $('#searchInput');
  if (search) {
    let t = null;
    search.addEventListener('input', e => {
      clearTimeout(t);
      const v = e.target.value;
      t = setTimeout(() => renderAlbums(v), 120);
    });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        search.focus();
        search.select();
      }
    });
  }

  // "unfold everything" / "fold everything"
  const all = $('#unfoldAll');
  if (all) {
    all.addEventListener('click', () => {
      const opening = !all.classList.contains('on');
      all.classList.toggle('on', opening);
      all.textContent = opening ? 'FOLD THEM ALL BACK' : 'UNFOLD EVERY RECEIPT';
      $$('.album').forEach((card, i) => {
        setTimeout(() => setOpen(card, opening), i * 130);
      });
    });
  }
});
