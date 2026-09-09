/* ============================================================
   Rendering, the panels, and the boot sequence.
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const mmss = ms => ms
  ? `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}` : '';


/* ------------------------------------------------------------
   Embers inside a panel.

   The bone modal gets its sparks on the GPU (js/boneframe.js). The
   flat panels are HTML, so they get the same 2D engine the page runs
   on, sized to the panel instead of to the window and weighted much
   further towards embers — a small, hot, slow drift behind the copy
   rather than a snowfall.

   Torn down with the panel: an orphaned rAF behind a closed modal is
   the classic way a page ends up burning a core for nothing.
   ------------------------------------------------------------ */
function mountPanelMotes(panel) {
  if (REDUCED || !panel) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'panel-motes';
  canvas.setAttribute('aria-hidden', 'true');
  panel.prepend(canvas);

  const fall = new Ashfall(canvas, {
    host: panel, count: 74, speed: 0.62, embers: 0.52, dust: 0.3
  });
  /* The panel is sized by its content, which arrives after this runs,
     so the canvas is re-measured once the layout has settled. */
  requestAnimationFrame(() => { fall.resize(); fall.seed(); });
  return () => fall.destroy();
}

/* ------------------------------------------------------------
   The roster.

   Each tile is one cell of assets/masks.webp — a 2-column, 3-row sheet.
   With background-size at 200% 300% a percentage position lands the cell
   exactly, at any width, with no pixel arithmetic: (col x 100%) (row x 50%).
   ------------------------------------------------------------ */
function renderRoster() {
  const host = $('#roster');
  if (!host) return;

  host.innerHTML = ROSTER.map((m, i) => {
    const [col, row] = m.cell;
    return `
      <button class="member reveal" type="button" data-member="${i}"
              aria-label="${esc(m.name)} — open profile">
        <span class="member-tag${m.status === 'past' ? ' past' : ''}">
          ${m.status === 'past' ? 'former' : 'current'}</span>
        <span class="member-art" style="background-position:${col * 100}% ${row * 50}%"></span>
        <span class="member-frame"></span>
        <span class="member-body">
          <span class="member-name">${esc(m.name)}</span>
          <span class="member-real">${esc(m.real)}</span>
          <span class="member-role">${esc(m.role)}</span>
          <span class="member-short">${esc(m.short)}</span>
        </span>
      </button>`;
  }).join('');

  $$('[data-member]', host).forEach(btn =>
    btn.addEventListener('click', () => openMember(ROSTER[+btn.dataset.member])));

  observeReveals(host);
}

/**
 * Open a member.
 *
 * The bone frame is the intended way in. It needs WebGL, and a machine
 * without it should still be able to read the profile, so the plain
 * panel is a fallback rather than an error.
 */
function openMember(member) {
  if (BoneFrame.layer && hasWebGL()) {
    BoneFrame.show(member);
    if (BoneFrame.open) return;
  }
  MemberPanel.open(member);
}

let webglAnswer = null;
function hasWebGL() {
  if (webglAnswer !== null) return webglAnswer;
  try {
    const c = document.createElement('canvas');
    webglAnswer = !!(window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { webglAnswer = false; }
  return webglAnswer;
}

/** The same profile without the 3D — used when WebGL is unavailable. */
const MemberPanel = {
  overlay: null,
  init() {
    this.overlay = $('#memberModal');
    if (!this.overlay) return;
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });
    document.addEventListener('keydown', e => {
      if (!this.overlay.hidden && e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
  },
  open(m) {
    this.overlay.innerHTML = `
      <div class="panel boned" role="dialog" aria-modal="true" aria-labelledby="mpTitle">
        <span class="panel-bg" aria-hidden="true"></span>
        <div class="panel-in">
          <button class="close" type="button" aria-label="Close">×</button>
          <h2 class="tp-title" id="mpTitle">${esc(m.name)}</h2>
          <p class="tp-sub">${esc(m.real)} · ${esc(m.years)}</p>
          <div style="margin-top:18px">${m.story.map(p => `<p class="tp-note">${p}</p>`).join('')}</div>
          <dl class="tp-dl" style="margin-top:18px">
            <dt>Role</dt><dd>${esc(m.role)}</dd>
            <dt>Mask</dt><dd>${esc(m.mask)}</dd>
            <dt>Poster</dt><dd>“${esc(m.poster)}”, Day of the Dead</dd>
          </dl>
        </div>
      </div>`;
    this.overlay.hidden = false;
    document.body.classList.add('locked');
    this.motes = mountPanelMotes(this.overlay.querySelector('.panel'));
    const x = this.overlay.querySelector('.close');
    x.addEventListener('click', () => this.close());
    x.focus();
  },
  close() {
    if (this.motes) { this.motes(); this.motes = null; }
    this.overlay.hidden = true;
    document.body.classList.remove('locked');
  }
};


/**
 * Put an album cover into a well, once it is actually ready to paint.
 *
 * NEVER SET loading="lazy" ON A DETACHED IMAGE. That is what this
 * function exists to stop anyone doing again. The sleeve is preloaded
 * off-document and inserted on completion, and lazy loading defers a
 * fetch until the element approaches the viewport — an element that is
 * not in the document never approaches anything, so the load simply
 * never starts and the well keeps its stand-in forever. It looks exactly
 * like the store not answering, which is why it survived a rewrite.
 *
 * decode() rather than the load event: it resolves once the bitmap is
 * ready to be painted, so inserting it cannot cost a frame. Older
 * browsers without it fall back to load.
 */
function coverInto(host, url, alt, replace) {
  const img = new Image();
  img.decoding = 'async';
  img.alt = alt || '';
  img.src = url;

  const show = () => {
    if (replace) host.replaceChildren(img);
    else host.prepend(img);
    host.classList.add('has-art');
  };
  if (img.decode) img.decode().then(show).catch(() => { /* 404, or CORS */ });
  else img.addEventListener('load', show, { once: true });
}

/* ------------------------------------------------------------
   The records.

   THE SLEEVE HANGS BESIDE EACH RECORD. It comes from the store with the
   listing, at 600px, and until it lands the space holds a drawn
   stand-in with the title set in it — so the row never collapses and
   never jumps when the image arrives.

   Drawn immediately from the seed in js/data.js so the section is
   readable on the first frame, then replaced by the store's own listing
   as each lookup lands. Nothing waits on the network.
   ------------------------------------------------------------ */
function renderAlbums() {
  const host = $('#albums');
  if (!host) return;

  host.innerHTML = ALBUMS.map(a => `
    <article class="album reveal" id="album-${a.id}">
      <div class="sleeve" data-sleeve="${a.id}">
        <span class="sleeve-fallback">${esc(a.title)}</span>
        <span class="sleeve-sheen" aria-hidden="true"></span>
      </div>
      <div class="album-body">
        <div class="album-head">
          <span class="album-year">${a.year}</span>
          <h3 class="album-title">${esc(a.title)}</h3>
        </div>
        <p class="album-meta">${esc(a.label)} · ${esc(a.era)}</p>
        <p class="album-note">${a.note}</p>
        <ol class="tracks" data-tracks="${a.id}">
          ${a.seed.map((name, i) => trackRow(name, i, a, 0)).join('')}
        </ol>
        <p class="tracks-note" data-note="${a.id}">best-known songs · full listing loading…</p>
      </div>
    </article>`).join('');

  bindTracks(host);
  observeReveals(host);
  ALBUMS.forEach(a => safely('album:' + a.id, () => hydrateAlbum(a)));
}

function trackRow(name, i, album, ms) {
  return `
    <li>
      <button class="track" type="button"
              data-track="${esc(name)}" data-album="${esc(album.title)}" data-i="${i}">
        <span class="track-n">${String(i + 1).padStart(2, '0')}</span>
        <span class="track-name">${esc(name)}</span>
        <span class="track-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="track-open" aria-hidden="true">open</span>
        <span class="track-time">${mmss(ms)}</span>
      </button>
    </li>`;
}

/**
 * One click, one thing.
 *
 * It used to be that a click played and shift-click opened the words,
 * which meant the words were behind a shortcut nobody was told about and
 * the panel effectively did not exist. Now a track opens its panel, and
 * the panel is where the player is — so the press that starts the song
 * and the page about the song are the same press.
 */
function bindTracks(root) {
  $$('.track', root).forEach(btn => {
    btn.addEventListener('click', () => {
      const album = ALBUMS.find(a => a.title === btn.dataset.album);
      if (album) TrackPanel.open(album, +btn.dataset.i, btn.dataset.track);
    });
  });
}

/** Replace the seed with the store's own listing. */
async function hydrateAlbum(album) {
  const live = await Catalogue.album(album);
  const note = $(`[data-note="${album.id}"]`);

  if (!live) {
    if (note) note.textContent = 'best-known songs · the store could not be reached';
    return;
  }

  const sleeve = $(`[data-sleeve="${album.id}"]`);
  if (sleeve && live.cover) coverInto(sleeve, live.cover, `${album.title} — album cover`);

  const list = $(`[data-tracks="${album.id}"]`);
  if (list && live.tracks.length) {
    list.innerHTML = live.tracks.map((t, i) => trackRow(t.name, i, album, t.ms)).join('');
    bindTracks(list);
  }
  if (note) {
    note.textContent =
      `${live.tracks.length} tracks · listing and previews via iTunes · click any one to open it`;
  }
}

/* ============================================================
   The track panel.

   The song, its player, its words and its credits, in one window. The
   transport is mounted inside it (js/player.js) rather than pinned to
   the bottom of the screen, so the controls and the thing they control
   are in the same place.

   The words arrive from LRCLIB and the credits from Genius, both through
   js/words.js — which works out for itself whether there is a back end
   with a token behind this page or whether it is a plain static folder,
   and says which at the bottom of the panel.
   ============================================================ */
const TrackPanel = {
  overlay: null,
  album: null,
  tracks: null,
  index: 0,
  unfollow: null,

  init() {
    this.overlay = $('#trackModal');
    if (!this.overlay) return;
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });
    document.addEventListener('keydown', e => {
      if (this.overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      /* ← → walk the record, the same as they do in the member panel.
         Not while a text field has focus, and not while a modifier is
         held, so browser shortcuts still work. */
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          !e.metaKey && !e.ctrlKey && !e.altKey &&
          !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        Player.step(e.key === 'ArrowRight' ? 1 : -1);
      }
    });
  },

  /**
   * Open the panel on one track of one record.
   *
   * The window is drawn and shown before anything is fetched. The
   * tracklist, the preview, the words and the credits all land into it
   * afterwards, each on its own — a panel that waited for the network
   * before appearing would feel broken on a slow connection, and the
   * title and the record are already known from the row that was
   * pressed.
   */
  async open(album, index, name) {
    this.album = album;
    this.index = index;

    this.overlay.innerHTML = `
      <div class="panel track-panel boned" role="dialog" aria-modal="true" aria-labelledby="tpTitle">
        <span class="panel-bg" aria-hidden="true"></span>
        <div class="panel-in">
          <button class="close" type="button" aria-label="Close">×</button>

          <header class="tp-head">
            <p class="tp-kicker">${esc(album.title)} · ${album.year} · ${esc(album.label)}</p>
            <h2 class="tp-title" id="tpTitle" data-tp="title">${esc(name)}</h2>
            <p class="tp-sub" data-tp="sub"></p>
          </header>

          <div class="tp-player" data-tp="player"></div>

          <section class="tp-sec">
            <h3 class="tp-h">The words</h3>
            <div data-tp="words"><p class="hint">looking them up…</p></div>
          </section>

          <section class="tp-sec">
            <h3 class="tp-h">Credits</h3>
            <div data-tp="credits"><p class="hint">looking them up…</p></div>
          </section>

          <section class="tp-sec">
            <h3 class="tp-h">Hear it in full</h3>
            <div class="tp-links" data-tp="links"></div>
          </section>

          <p class="tp-attr" data-tp="attr"></p>
        </div>
      </div>`;

    this.overlay.hidden = false;
    document.body.classList.add('locked');
    this.motes = mountPanelMotes(this.overlay.querySelector('.panel'));
    const x = this.overlay.querySelector('.close');
    x.addEventListener('click', () => this.close());
    x.focus();

    this.paintLinks(name);
    this.load(name);

    /* The store's listing is what the player queues, so prev/next walks
       the real record and not the six-song seed. Until it lands, the
       queue is whatever the page is already showing. */
    const live = await Catalogue.album(album);
    if (this.overlay.hidden || this.album !== album) return;


    this.tracks = (live && live.tracks.length)
      ? live.tracks
      : album.seed.map(n => ({ name: n, preview: null, ms: 0 }));

    /* The row that was pressed may be at a different index in the store's
       listing than it was in the seed, so it is found by name and the
       index is only a fallback. */
    const at = this.tracks.findIndex(t => t.name === name);
    Player.mount($('[data-tp="player"]', this.overlay), this.tracks, album.title,
      at >= 0 ? at : Math.min(index, this.tracks.length - 1));

    /* Prev and next inside the player move the panel too — the window is
       about whichever song is sounding. */
    Player.onStep = (track) => {
      if (this.overlay.hidden) return;
      this.paintLinks(track.name);
      this.load(track.name);
    };
  },

  /** Title, sub-line, words, credits and attribution for one track. */
  async load(name) {
    const box = sel => $(`[data-tp="${sel}"]`, this.overlay);
    box('title').textContent = name;
    box('words').innerHTML = '<p class="hint">looking them up…</p>';
    box('credits').innerHTML = '<p class="hint">looking them up…</p>';
    box('attr').textContent = '';
    if (this.unfollow) { this.unfollow(); this.unfollow = null; }

    const seed = notesFor(name);
    const result = await Words.track(name, this.album.title);
    if (this.overlay.hidden) return;
    /* Prev/next may have moved on while this was in flight. */
    if (box('title').textContent !== name) return;

    this.paintWords(box('words'), result, name);
    this.paintCredits(box('credits'), result, seed, name);
    this.paintAttribution(box('attr'), result);

    const s = result.song;
    box('sub').textContent = s
      ? [s.album && s.album.name, s.releaseDate].filter(Boolean).join(' · ')
      : '';
  },

  /* ----------------------------------------------------------
     The words, and following them.

     THE HONEST PROBLEM WITH SYNCING TO A PREVIEW. LRCLIB's timed
     transcriptions carry each line's real position in the full song, and
     what plays here is a 30-second excerpt taken from somewhere inside
     it. The store does not say where from. So the preview's clock and
     the transcription's clock have an unknown offset between them, and
     any automatic highlight would be a guess presented as a fact — off
     by a verse, confidently.

     So the panel asks. Press the line you can actually hear and the
     offset is known from that moment; every line after it follows on its
     own, and pressing a different line corrects it. Nothing is shown as
     the current line until somebody has said which one it is.
     ---------------------------------------------------------- */
  paintWords(host, result, name) {
    const w = result.lyrics;
    if (!w || !w.lines.length) {
      host.innerHTML = `<p class="empty">No transcription found for this one.
        The words are on <a href="${geniusUrl(name)}" target="_blank" rel="noopener">its Genius page</a>.</p>`;
      return;
    }

    host.innerHTML = `
      <div class="tp-words${w.synced ? ' synced' : ''}" data-tp="lines">
        ${w.lines.map((l, i) => `
          <button class="tp-line" type="button" data-t="${l.t == null ? '' : l.t}" data-i="${i}"
                  ${l.t == null ? 'disabled' : ''}>
            <span class="t">${l.t == null ? '' : fmtLrc(l.t)}</span>
            <span class="w">${esc(l.text)}</span>
          </button>`).join('')}
      </div>
      <p class="hint" data-tp="follow">${w.synced
        ? 'Timed transcription. The preview is 30 seconds from somewhere inside the song and the '
          + 'store does not say where, so press the line you can hear and the rest will follow it.'
        : 'No timed transcription for this one, so there are no timecodes and nothing to follow.'}</p>`;

    if (!w.synced) return;

    const box = $('.tp-words', host);
    const note = $('[data-tp="follow"]', host);
    const lines = $$('.tp-line', host);
    let anchor = null;      // { songT, playT } — the two clocks, tied together
    let lit = -1;

    const light = i => {
      if (i === lit) return;
      lit = i;
      lines.forEach((el, k) => el.classList.toggle('on', k === i));
      const el = lines[i];
      if (el) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    };

    lines.forEach(btn => btn.addEventListener('click', () => {
      const songT = Number(btn.dataset.t);
      if (!Number.isFinite(songT) || !Player.audio) return;
      anchor = { songT, playT: Player.audio.currentTime || 0 };
      box.classList.add('following');
      note.textContent = 'Following from that line. Press another one if it drifts.';
      light(+btn.dataset.i);
    }));

    this.unfollow = Player.onTime(t => {
      if (!anchor) return;
      const songT = anchor.songT + (t - anchor.playT);
      /* The last line whose stamp has passed. A linear scan over a few
         dozen lines, once per timeupdate — about four times a second —
         which is far cheaper than the bookkeeping to avoid it. */
      let at = -1;
      for (let i = 0; i < w.lines.length; i++) {
        if (w.lines[i].t != null && w.lines[i].t <= songT + 0.25) at = i; else break;
      }
      if (at >= 0) light(at);
    });
  },

  /* ----------------------------------------------------------
     Credits.

     Three sources, in order of how much they actually know: Genius when
     a token is configured, the liner notes written into js/data.js when
     one is not, and a link when there is neither.
     ---------------------------------------------------------- */
  paintCredits(host, result, seed, name) {
    const s = result.song;
    const rows = [];

    if (s) {
      if (s.writers.length) rows.push(['Written by', esc(s.writers.join(', '))]);
      if (s.producers.length) rows.push(['Produced by', esc(s.producers.join(', '))]);
      if (s.featured.length) rows.push(['Featuring', esc(s.featured.join(', '))]);
      if (s.album) rows.push(['Album', s.album.url
        ? `<a href="${s.album.url}" target="_blank" rel="noopener">${esc(s.album.name)}</a>`
        : esc(s.album.name)]);
      if (s.releaseDate) rows.push(['Released', esc(s.releaseDate)]);
      if (s.annotations) rows.push(['Annotations', `${s.annotations} on Genius`]);

      host.innerHTML =
        (s.description ? `<p class="tp-note">${esc(s.description)}</p>` : '') +
        (rows.length ? `<dl class="tp-dl">${rows.map(([k, v]) =>
          `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : '') +
        (s.media.length ? `<div class="tp-links tight">${s.media.map(m =>
          `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.provider)}</a>`).join('')}</div>` : '');
      return;
    }

    if (seed) {
      host.innerHTML = `
        <p class="tp-note">${seed.annotation}</p>
        <dl class="tp-dl">
          <dt>Written by</dt><dd>${esc(seed.writers.join(', '))}</dd>
          <dt>Produced by</dt><dd>${esc(seed.producers.join(', '))}</dd>
          <dt>Album</dt><dd>${esc(seed.album)}</dd>
        </dl>
        ${result.bridge && !result.configured
          ? `<p class="hint">These are this site's own notes. Set
             <code>GENIUS_ACCESS_TOKEN</code> in the environment and the real
             credits come from Genius instead.</p>` : ''}`;
      return;
    }

    host.innerHTML = `<p class="hint">${result.error ? esc(result.error) + ' ' : ''}No credits
      for this one here. They are on
      <a href="${geniusUrl(name)}" target="_blank" rel="noopener">its Genius page</a>.</p>`;
  },

  /**
   * Say where all of this came from, every time.
   *
   * And say which mode the page is running in, because a fan archive
   * that quietly showed less because a token was missing would be worse
   * than one that tells you a token is missing.
   */
  paintAttribution(host, result) {
    const a = result.attribution || {};
    const bits = [];

    bits.push(a.lyrics
      ? `Words: <a href="${a.lyrics.url}" target="_blank" rel="noopener">${esc(a.lyrics.name)}</a>
         (${esc(a.lyrics.note)}), fetched when this opened and stored nowhere.`
      : 'Words: none found for this one.');

    if (a.metadata) {
      bits.push(`Credits and annotations:
        <a href="${a.metadata.url}" target="_blank" rel="noopener">Genius</a>.`);
    } else if (result.bridge) {
      bits.push(`Credits: Genius is not connected —
        <code>GENIUS_ACCESS_TOKEN</code> is not set in this deployment's environment.`);
    } else {
      bits.push('Credits: Genius needs a back end to hold its token; this copy is a static folder.');
    }

    bits.push('Previews and listings: iTunes Search API. Unofficial fan page.');
    host.innerHTML = bits.join(' ');
  },

  paintLinks(name) {
    const host = $('[data-tp="links"]', this.overlay);
    if (!host) return;
    host.innerHTML = PLATFORMS.map(p =>
      `<a href="${p.url(name)}" target="_blank" rel="noopener">${p.name}</a>`).join('')
      + `<a href="${geniusUrl(name)}" target="_blank" rel="noopener">Genius</a>`;
  },

  close() {
    if (this.motes) { this.motes(); this.motes = null; }
    if (this.unfollow) { this.unfollow(); this.unfollow = null; }
    Player.onStep = null;
    Player.detach();          // closing the song stops the song
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
    this.album = null;
    document.body.classList.remove('locked');
  }
};

/* ------------------------------------------------------------ the lore */
function renderTimeline() {
  const host = $('#timeline');
  if (!host) return;
  host.innerHTML = TIMELINE.map(t => `
    <article class="tl reveal">
      <div class="tl-year">${esc(t.year)}</div>
      <h3 class="tl-title">${esc(t.title)}</h3>
      <p>${t.text}</p>
      ${t.detail ? `<p class="tl-detail">${t.detail}</p>` : ''}
    </article>`).join('');
  observeReveals(host);
}

/* ------------------------------------------------------------ boot */
document.addEventListener('DOMContentLoaded', () => {
  safely('noise', mountNoise);

  MemberPanel.init();
  TrackPanel.init();
  safely('boneFrame.init', () => BoneFrame.init());
  safely('player.init', () => Player.init());
  safely('words.probe', () => Words.probe());

  safely('roster', renderRoster);
  safely('albums', renderAlbums);
  safely('timeline', renderTimeline);
  safely('quiz', () => Quiz.init());

  safely('ash', startAsh);
  safely('reveals', () => observeReveals());
  safely('nav', watchNav);

  /* The collage is placed against the finished page, so it waits for the
     sections to exist and be laid out — it measures the reading column
     rather than assuming one. */
  addEventListener('load', () => safely('collage', () => Collage.init()), { once: true });

  /* `?debug` prints what mounted, what the store answered and anything
     that threw — enough to tell a broken deploy from a broken network
     without opening a console. */
  if (/(^|[?&])debug($|[=&])/.test(location.search)) mountDebug();
});

function mountDebug() {
  const box = document.createElement('div');
  box.className = 'debug';
  document.body.appendChild(box);
  setInterval(() => {
    box.innerHTML = `<b>build ${Diag.build}</b><br>` +
      Object.entries(Diag.counts).map(([k, v]) => `${k}: ${v}`).join('<br>') +
      (Diag.errors.length
        ? `<br><span class="bad">${Diag.errors.length} error(s):<br>` +
          Diag.errors.map(e => esc(e)).join('<br>') + '</span>'
        : '<br>no errors');
  }, 700);
}
