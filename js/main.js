/* ============================================================
   Rendering + member modal + discography search
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ------------------------------------------------------------
   MEMBERS
   ------------------------------------------------------------ */
function renderMembers() {
  const host = $('#membersGrid');
  if (!host) return;
  host.innerHTML = '';

  MEMBERS.forEach((m, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'member-card reveal';
    card.dataset.index = idx;
    card.style.setProperty('--tilt', ((idx % 3) - 1) * 0.55 + 'deg');
    card.setAttribute('aria-haspopup', 'dialog');
    card.setAttribute('aria-label', `${m.name} — ${m.role}. Open full profile`);

    const figure = m.photo
      ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy" />`
      : `<div class="initials" aria-hidden="true">${esc(m.initials)}</div>`;

    card.innerHTML = `
      <span class="tape ${idx % 2 ? 'tr' : 'tl'}" aria-hidden="true"></span>
      <div class="member-photo">
        ${figure}
        <span class="zoom-hint" aria-hidden="true">Open profile</span>
      </div>
      <div class="member-body">
        <div class="member-role">${esc(m.role)}</div>
        <div class="member-name">${esc(m.name)}</div>
        <p class="member-bio">${esc(m.bio)}</p>
        <div class="chipline">
          <span class="status ${m.status === 'past' ? 'past' : ''}">${m.status === 'current' ? 'Current' : 'Former'}</span>
          <span class="status past">${esc(m.years)}</span>
        </div>
      </div>`;

    card.addEventListener('click', () => openMember(idx));
    host.appendChild(card);
  });
  observeReveals(host);
}

/* ------------------------------------------------------------
   MEMBER MODAL
   Closes on ×, on backdrop click and on Escape.
   Arrow keys walk the line-up; focus is trapped and restored.
   ------------------------------------------------------------ */
const Modal = {
  overlay: null, current: -1, lastFocus: null,

  init() {
    this.overlay = $('#memberModal');
    if (!this.overlay) return;

    // × button
    $('#modalClose').addEventListener('click', () => this.close());

    // click outside the card
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // keyboard: Escape closes, arrows navigate, Tab is trapped
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
      else if (e.key === 'Tab') this.trap(e);
    });

    $('#modalPrev').addEventListener('click', () => this.step(-1));
    $('#modalNext').addEventListener('click', () => this.step(1));
  },

  isOpen() { return this.overlay && this.overlay.classList.contains('open'); },

  open(idx) {
    const m = MEMBERS[idx];
    if (!m) return;
    this.current = idx;
    this.lastFocus = document.activeElement;
    this.fill(m);
    this.overlay.classList.add('open');
    this.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    // focus the close button so Escape/Tab behave predictably
    requestAnimationFrame(() => $('#modalClose').focus());
  },

  close() {
    if (!this.isOpen()) return;
    this.overlay.classList.remove('open');
    this.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  step(dir) {
    const next = (this.current + dir + MEMBERS.length) % MEMBERS.length;
    this.current = next;
    this.fill(MEMBERS[next]);
    $('.modal').scrollTop = 0;
    // keep the underlying grid in sync for when the modal closes
    const card = $(`.member-card[data-index="${next}"]`);
    if (card) this.lastFocus = card;
  },

  fill(m) {
    const fig = $('#modalFigure');
    fig.innerHTML = m.photo
      ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" />`
      : `<div class="initials" aria-hidden="true">${esc(m.initials)}</div>`;

    $('#modalRole').textContent = m.role;
    $('#modalName').textContent = m.name;
    $('#modalLead').textContent = m.bio;
    $('#modalText').innerHTML = (m.extra || []).map(p => `<p>${p}</p>`).join('');
    $('#modalMeta').innerHTML = `
      <div><dt>Status</dt><dd>${m.status === 'current' ? 'Current member' : 'Former member'}</dd></div>
      <div><dt>Years</dt><dd>${esc(m.years)}</dd></div>
      <div><dt>Instruments</dt><dd>${esc(m.instruments)}</dd></div>
      <div><dt>Based</dt><dd>${esc(m.origin)}</dd></div>
      ${m.notable ? `<div style="grid-column:1/-1"><dt>Notable</dt><dd>${esc(m.notable)}</dd></div>` : ''}`;
    this.overlay.setAttribute('aria-label', `${m.name} — ${m.role}`);
  },

  trap(e) {
    const focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', this.overlay)
      .filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
};

function openMember(idx) { Modal.open(idx); }

/* ------------------------------------------------------------
   DISCOGRAPHY
   ------------------------------------------------------------ */
function renderAlbums(filter = '') {
  const host = $('#albumsList');
  if (!host) return;
  const q = filter.toLowerCase().trim();
  host.innerHTML = '';
  let shownAlbums = 0, shownTracks = 0;

  ALBUMS.forEach(album => {
    const albumHit = album.title.toLowerCase().includes(q) || String(album.year).includes(q);
    const tracks = album.tracks.filter(t => !q || albumHit || t.name.toLowerCase().includes(q));
    if (q && !albumHit && tracks.length === 0) return;
    shownAlbums++;
    shownTracks += tracks.length;

    const el = document.createElement('article');
    el.className = 'album reveal';
    const isDisc = album.cover && album.cover.tone === 'disc';

    el.innerHTML = `
      <div class="sleeve">
        <div class="sleeve-stack" aria-hidden="true">
          <div class="sleeve-back"></div>
          <div class="sleeve-mid"></div>
        </div>
        <div class="sleeve-front">
          <div class="art ${isDisc ? 'disc' : ''}" style="background-image:url('${esc(album.cover ? album.cover.art : '')}')" aria-hidden="true"></div>
          <div class="scrim" aria-hidden="true"></div>
          <div class="yr">${album.year}</div>
          <div class="ransom sm" data-ransom="${esc(album.title)}"></div>
          <div class="kind">${esc(album.type)}</div>
        </div>
      </div>
      <div class="album-meta">
        <h3 class="ransom md" data-ransom="${esc(album.title)}"></h3>
        <div class="album-sub">${album.year} · ${esc(album.type)}</div>
        ${album.note ? `<p class="album-note">${esc(album.note)}</p>` : ''}
        <ol class="tracklist">
          ${tracks.map((t) => {
            const i = album.tracks.indexOf(t);
            return `
            <li class="track" data-album="${esc(album.id)}" data-index="${i}" tabindex="0"
                role="button" aria-label="${esc(t.name)} — open words and links">
              <span class="track-num">${String(i + 1).padStart(2, '0')}</span>
              <button type="button" class="track-play" data-play="${i}"
                      aria-label="Preview ${esc(t.name)}">&#9654;</button>
              <span class="track-name">${esc(t.name)}</span>
              ${hasLyrics(t.name) ? '<span class="track-flag">words</span>' : ''}
              <span class="track-dur">${esc(t.duration)}</span>
              <span class="track-open" aria-hidden="true">open</span>
            </li>`;
          }).join('')}
        </ol>
        <div class="cas-player" data-album-player="${esc(album.id)}"></div>
      </div>`;
    host.appendChild(el);
  });

  if (!shownAlbums) {
    host.innerHTML = `<p class="no-results">Nothing matches “${esc(filter)}”. Try <em>Apocalypse</em>, <em>Heavenly</em>, <em>Tejano</em> or a year.</p>`;
  }

  // cut-paper album titles
  $$('[data-ransom]', host).forEach((el, i) => ransom(el, el.dataset.ransom, { start: i }));

  // a designed player per record, in place of any third-party embed
  $$('[data-album-player]', host).forEach(el => {
    el.innerHTML = playerFaceHTML({ compact: false });
    bindPlayerFace(el, 'album', el.dataset.albumPlayer);
  });

  // the row opens the words; the ▶ button only previews
  $$('.track', host).forEach(row => {
    const open = () => TrackModal.open(row.dataset.album, Number(row.dataset.index));
    row.addEventListener('click', e => {
      if (e.target.closest('.track-play')) return;
      open();
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    const pb = row.querySelector('.track-play');
    if (pb) pb.addEventListener('click', e => {
      e.stopPropagation();
      Player.playTrack(row.dataset.album, Number(pb.dataset.play));
    });
  });

  $('#searchMeta').textContent = q
    ? `${shownTracks} track${shownTracks === 1 ? '' : 's'} across ${shownAlbums} release${shownAlbums === 1 ? '' : 's'}`
    : `${ALBUMS.length} releases · ${ALBUMS.reduce((n, a) => n + a.tracks.length, 0)} tracks`;

  observeReveals(host);
}

function hasLyrics(name) {
  return LYRICS.some(l => l.track.toLowerCase() === name.toLowerCase());
}

/* ------------------------------------------------------------
   SINGLES
   ------------------------------------------------------------ */
function renderSingles() {
  const host = $('#singlesGrid');
  if (!host) return;
  host.innerHTML = '';
  [...SINGLES].reverse().forEach((s, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'single-card reveal';
    card.style.setProperty('--tilt', ((i % 4) - 1.5) * 0.4 + 'deg');
    card.setAttribute('aria-label', `Open ${s.title}`);
    card.innerHTML = `
      <div class="yr">${s.year}</div>
      <h4>${esc(s.title)}</h4>
      ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}
      <span class="go">Words & platforms →</span>`;
    card.addEventListener('click', () => {
      if (typeof TrackModal !== 'undefined') TrackModal.openSingle(s.title);
    });
    host.appendChild(card);
  });
  observeReveals(host);
}

/* ------------------------------------------------------------
   BOOT
   ------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  // ---- what the first screen is made of --------------------------------
  ransom($('#heroTitle'), 'Cigarettes After Sex');
  mountDecor();
  watchDeferred();
  startAsh();
  watchNav();
  Modal.init();

  /**
   * Everything below the fold.
   *
   * The discography alone builds five thousand pixels of tracklists and
   * player faces, none of it on screen when the page opens, and building it
   * inline held the main thread for a sixth of a second at a stretch. It runs
   * after the hero has painted instead.
   */
  const below = () => {
    $$('[data-ransom-static]').forEach((el, i) => ransom(el, el.dataset.ransomStatic, { start: i % 2 }));
    renderMembers();
    renderAlbums();
    renderSingles();
    // `const Player = …` is a lexical global, not a property of window
    if (typeof Player !== 'undefined') Player.init();
    if (typeof TrackModal !== 'undefined') TrackModal.init();
    if (typeof Quiz !== 'undefined') Quiz.init();

    const search = $('#searchInput');
    if (search) {
      search.addEventListener('input', e => renderAlbums(e.target.value));
      // "/" focuses search from anywhere
      document.addEventListener('keydown', e => {
        if (e.key === '/' && !Modal.isOpen() && !TrackModal.isOpen() && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
          e.preventDefault(); search.focus();
        }
      });
    }

    observeReveals();

    // footer XOXO cut-out
    const xo = $('#footerXoxo');
    if (xo) xo.src = asset('cut/xoxo');
  };

  if (location.hash) {
    // arrived at #discography or similar: the target has to exist before the
    // browser can scroll to it, so this one pays the cost up front
    below();
    const target = document.getElementById(location.hash.slice(1));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  } else {
    // two frames, so the hero is on screen before the rest is built
    requestAnimationFrame(() => requestAnimationFrame(below));
  }
});
