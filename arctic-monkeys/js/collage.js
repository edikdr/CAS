/* ============================================================
   Collage engine
   - ransom(): headings built from real cut-paper letter scans
   - drawn cut-outs (vinyl, moon, cassette, VHS, sneaker …),
     all inline SVG so the page stays light
   - scattered text scraps: lyric fragments and song titles
   - drifting dust/grain canvas
   - scroll reveal + nav highlighting
   ============================================================ */

const LETTERS = 'assets/letters';
/* Five alphabets, cut from different magazines. ransom() walks them so
   two neighbouring letters never come from the same sheet. */
const LETTER_SETS = ['mono', 'news', 'warm', 'cut', 'press'];
const IS_LETTER = /^[a-z]$/;

/* A handful of torn-edge shapes, picked per letter. Real cut-out letters
   are never trimmed square. */
const TORN = [
  'polygon(2% 0%, 98% 3%, 100% 96%, 4% 100%, 0% 52%)',
  'polygon(0% 4%, 96% 0%, 100% 94%, 6% 99%, 1% 48%)',
  'polygon(3% 2%, 100% 0%, 97% 98%, 0% 100%, 2% 50%)',
  'polygon(0% 0%, 99% 5%, 96% 100%, 2% 96%, 3% 47%)'
];

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
}

/**
 * Render `text` into `el` as cut-out magazine letters.
 * Deterministic: the same heading is taped down the same way every load.
 */
function ransom(el, text, opts = {}) {
  if (!el) return;
  el.innerHTML = '';
  el.setAttribute('aria-label', text);
  const rnd = seeded(text);
  let i = opts.start || 0;

  text.split(/(\s+)/).forEach(chunk => {
    if (!chunk.trim()) return;
    const word = document.createElement('span');
    word.className = 'word';

    [...chunk].forEach(ch => {
      const low = ch.toLowerCase();

      if (!IS_LETTER.test(low)) {
        // digits and punctuation ride on a torn paper chip
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.setAttribute('aria-hidden', 'true');
        chip.textContent = ch;
        chip.style.setProperty('--r', `${(rnd() * 6 - 3).toFixed(2)}deg`);
        chip.style.clipPath = TORN[Math.floor(rnd() * TORN.length)];
        word.appendChild(chip);
        return;
      }

      const set = LETTER_SETS[i % LETTER_SETS.length];
      i++;

      const glyph = document.createElement('span');
      glyph.className = 'glyph';
      glyph.setAttribute('aria-hidden', 'true');
      glyph.style.setProperty('--r', `${(rnd() * 7 - 3.5).toFixed(2)}deg`);
      glyph.style.setProperty('--dy', `${(rnd() * 6 - 3).toFixed(1)}px`);
      glyph.style.setProperty('--s', (0.9 + rnd() * 0.2).toFixed(3));
      glyph.style.setProperty('--z', String(Math.floor(rnd() * 5)));

      const r = rnd();
      if (r > 0.82) glyph.classList.add('taped');
      else if (r > 0.5) glyph.classList.add('torn');

      const img = document.createElement('img');
      img.src = `${LETTERS}/${set}/${low}.webp`;
      img.alt = '';
      img.draggable = false;
      img.loading = 'lazy';
      if (glyph.classList.contains('torn')) {
        img.style.clipPath = TORN[Math.floor(rnd() * TORN.length)];
      }

      glyph.appendChild(img);
      word.appendChild(glyph);
    });
    el.appendChild(word);
  });
}

/* ------------------------------------------------------------
   The cut-outs.

   Real objects, segmented out of the fan collages the site was designed
   from — vinyl, the moon, a VHS stack, the hotel model, a chess knight,
   the Marlboro pack. Each one is a transparent webp, so they layer over
   the star field the way paper layers on a pinboard.

   Placement is by viewport gutter, never by the content column, so a
   cut-out cannot reach a heading, a button or a receipt at any width.
   Objects are chosen per section: tape and film for the history,
   instruments for the band, sleeves and stickers for the discography.

   [host, file, anchor, inset px, y %, width px, rotation, opacity, drift s]
   ------------------------------------------------------------ */
const CUTS = 'assets/cut';

/* Width ÷ height for every cut-out, so a box has its shape before the
   image arrives. Without this the decor has no height until it loads,
   which makes percentage placement meaningless and shifts the page.
   Generated from the files in assets/cut. */
const CUT_ASPECT = {
  'advisory': 1.6989,
  'am-square': 1.008,
  'bass': 0.317,
  'dice': 1.6203,
  'filmstrip': 0.8128,
  'fluorescent': 2.6176,
  'globe': 1.0094,
  'guitar': 0.9474,
  'headphones': 0.9911,
  'heart-glitter': 1.1364,
  'heart-music': 0.9274,
  'hotel': 1.365,
  'iloveyou': 2.5152,
  'knight': 0.5191,
  'logo-block': 1.2903,
  'logo-bold': 1.301,
  'logo-script': 1.5882,
  'meteors': 1.407,
  'moon-full': 1.0,
  'moon': 1.0405,
  'poster': 0.7598,
  'saturn': 1.6681,
  'shots': 1.6848,
  'skeleton': 0.365,
  'smokes': 0.6974,
  'spotify': 3.3516,
  'star-marquee': 0.8456,
  'star-spiral': 1.1389,
  'tapes': 2.2927,
  'teddy': 1.8963,
  'ticket': 2.1111,
  'vhs': 1.1164,
  'vinyl-label': 0.9934,
  'vinyl': 0.9943,
  'whothefuck': 1.0195
};

const DECOR = [
  /* Spacing rule: within one section and one gutter, no two objects are
     closer than 30% of the section height, and each gutter carries at
     most three. They are meant to be found, not stacked. */

  // hero — the record, and the moon it gets played under
  ['.hero', 'vinyl',        'vl',  18, 30, 168,  -7, 0.34, 34],
  ['.hero', 'smokes',       'vl',  26, 76, 112,   9, 0.26, 30],
  ['.hero', 'moon',         'vr',  22,  8, 124,   4, 0.32, 40],
  ['.hero', 'star-spiral',  'vr',  34, 68,  68, -12, 0.26, 26],

  // lore — the formats the demos travelled on
  ['#lore', 'vhs',          'vl',  16,  6, 132,  -6, 0.28, 35],
  ['#lore', 'filmstrip',    'vl',  22, 42, 140,  -4, 0.24, 36],
  ['#lore', 'whothefuck',   'vl',  26, 80, 128,   5, 0.26, 31],
  ['#lore', 'tapes',        'vr',  18, 20, 130,   7, 0.28, 32],
  ['#lore', 'poster',       'vr',  24, 56, 112,  -5, 0.24, 27],
  ['#lore', 'ticket',       'vr',  20, 90, 126,   4, 0.26, 29],

  // members — what they actually play
  ['#members', 'knight',    'vl',  32, 18,  70,  -7, 0.28, 29],
  ['#members', 'dice',      'vl',  22, 66, 108,  -5, 0.28, 30],
  ['#members', 'bass',      'vr',  32, 12,  70,   9, 0.28, 33],
  ['#members', 'skeleton',  'vr',  26, 72,  86,   6, 0.24, 25],

  // discography — sleeves, players, stickers
  ['#discography', 'headphones',  'vl', 24,  6, 104,   8, 0.26, 28],
  ['#discography', 'spotify',     'vl', 14, 38, 140,  -4, 0.24, 30],
  ['#discography', 'vinyl-label', 'vl', 20, 70, 128,   5, 0.26, 38],
  ['#discography', 'advisory',    'vr', 16, 12, 130,   4, 0.26, 32],
  ['#discography', 'hotel',       'vr', 22, 46, 138,   6, 0.26, 34],
  ['#discography', 'logo-script', 'vr', 20, 82, 134,   5, 0.24, 31],

  // singles
  ['#singles', 'moon-full',    'vl', 26, 26,  96,   6, 0.30, 37],
  ['#singles', 'teddy',        'vl', 20, 74, 122,  -6, 0.26, 28],
  ['#singles', 'star-marquee', 'vr', 28, 18,  80, -10, 0.28, 24],
  ['#singles', 'fluorescent',  'vr', 18, 68, 136,   5, 0.24, 29],

  // quizzes
  ['#quiz', 'heart-music',   'vl', 26, 20,  94,  -6, 0.28, 27],
  ['#quiz', 'saturn',        'vl', 22, 72, 118,   7, 0.26, 33],
  ['#quiz', 'iloveyou',      'vr', 24, 28, 110,   8, 0.26, 26],
  ['#quiz', 'am-square',     'vr', 26, 80,  78,   4, 0.24, 25]
];

/** Position one element against a viewport gutter (see the note above). */
function place(el, anchor, inset, y) {
  el.dataset.anchor = anchor;
  el.style.setProperty('--inset', inset + 'px');
  el.style.top = y + '%';
}

function mountDecor() {
  const parallax = [];

  DECOR.forEach(([host, file, anchor, inset, y, w, rot, op, dur], idx) => {
    const target = document.querySelector(host);
    if (!target) return;

    const box = document.createElement('div');
    box.className = 'deco float';
    box.setAttribute('aria-hidden', 'true');
    place(box, anchor, inset, y);
    box.style.width = w + 'px';
    if (CUT_ASPECT[file]) box.style.aspectRatio = String(CUT_ASPECT[file]);
    box.style.opacity = op;
    box.style.setProperty('--rot', rot + 'deg');
    box.style.setProperty('--dur', dur + 's');
    box.style.setProperty('--dx', (idx % 2 ? 8 : -8) + 'px');
    box.style.setProperty('--dy2', (idx % 3 ? -13 : -7) + 'px');

    const img = document.createElement('img');
    img.src = `${CUTS}/${file}.webp`;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    box.appendChild(img);

    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.appendChild(box);
    parallax.push({ box, speed: 0.012 + (idx % 5) * 0.006 });
  });

  mountScraps();

  // hand-picked percentages get you close; this guarantees the rest
  requestAnimationFrame(() => spaceOut());

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = null;
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      const y = window.scrollY;
      parallax.forEach(p => {
        const shift = Math.max(-60, Math.min(60, -y * p.speed + 26));
        p.box.style.marginTop = shift.toFixed(1) + 'px';
      });
      raf = null;
    });
  }, { passive: true });
}

/**
 * Push apart anything that ended up too close.
 *
 * Objects and scraps are placed by percentage, and a percentage of a
 * section whose height depends on its text is a guess. This measures what
 * actually landed and walks each gutter top to bottom, moving anything
 * that crowds its neighbour further down. Order is preserved, so the
 * composition stays as written — only the gaps change.
 */
const MIN_GAP = 26;      // px of clear space between two objects

function spaceOut() {
  const groups = new Map();

  document.querySelectorAll('.deco, .scrap').forEach(el => {
    const host = el.closest('.hero, .section');
    if (!host) return;
    // offsetHeight ignores the drift rotation; the rotated bounding box
    // would over-report and open gaps that are not really there
    const r = { top: el.offsetTop, height: el.offsetHeight };
    if (!r.height) return;
    const key = `${host.id || 'hero'}|${el.dataset.anchor}`;
    if (!groups.has(key)) groups.set(key, { host, items: [] });
    groups.get(key).items.push({ el, top: r.top, h: r.height });
  });

  groups.forEach(({ host, items }) => {
    items.sort((a, b) => a.top - b.top);
    const limit = host.offsetHeight;
    let cursor = -Infinity;
    items.forEach(it => {
      let top = Math.max(it.top, cursor + MIN_GAP);
      /* If pushing it down would run it out of the section, there is no
         room for it here — a short section simply carries fewer objects.
         Crowding them together to fit would undo the point of this. */
      if (top + it.h > limit - 8) {
        it.el.hidden = true;
        return;
      }
      it.el.hidden = false;
      if (Math.abs(top - it.top) > 1) it.el.style.top = `${top.toFixed(0)}px`;
      cursor = top + it.h;
    });
  });
}

/* ------------------------------------------------------------
   Text scraps — lyric fragments and titles taped up in the same
   gutters, each sent to the section it belongs to.
   ------------------------------------------------------------ */
const SCRAP_PLAN = [
  // hero: the lines everybody knows
  ['.hero', 'R U MINE?', 'vl', 20, 20], ['.hero', '505', 'vl', 34, 60],
  ['.hero', 'I WANNA BE YOURS', 'vr', 18, 88],
  ['.hero', 'she’s blowing a kiss at me', 'vl', 26, 92],

  // lore: the band's own history in its own words
  ['#lore', 'Who the fuck are Arctic Monkeys?', 'vl', 16, 24],
  ['#lore', 'BENEATH THE BOARDWALK', 'vr', 22, 40],
  ['#lore', 'HIGH GREEN, SHEFFIELD', 'vl', 30, 62],
  ['#lore', 'FRI 14th APRIL', 'vr', 26, 84],

  // members
  ['#members', 'MARDY BUM', 'vl', 22, 12],
  ['#members', 'send a letter to me baby', 'vr', 18, 44],
  ['#members', 'I’M IN A VEST', 'vl', 34, 88],

  // discography: one line per record, in order
  ['#discography', 'A CERTAIN ROMANCE', 'vl', 30, 6],
  ['#discography', 'FLUORESCENT ADOLESCENT', 'vr', 24, 24],
  ['#discography', 'Can I call you her name?', 'vl', 22, 36],
  ['#discography', 'SHALALA SHALALA', 'vr', 30, 52],
  ['#discography', 'CRAWLING BACK TO YOU', 'vl', 26, 62],
  ['#discography', 'TRANQUILITY BASE', 'vr', 20, 72],
  ['#discography', 'MIRRORBALL', 'vl', 32, 88],

  // singles + quiz
  ['#singles', 'LEAVE BEFORE THE LIGHTS COME ON', 'vl', 18, 24],
  ['#singles', 'on a RAINY day', 'vr', 26, 78],
  ['#quiz', 'Make a wish, concentrate?', 'vl', 22, 40],
  ['#quiz', 'PERHAPS VAMPIRES IS A BIT STRONG BUT…', 'vr', 26, 12],
  ['#quiz', 'XOXO', 'vl', 24, 68],
  ['#singles', 'MORE LIKE BLACK TREACLE THAN TAR', 'vr', 20, 44]
];

/* how each scrap is set — picked by its own text, so it never changes */
function scrapStyle(text) {
  if (/^[0-9]+$|^XOXO$|^AM$/.test(text)) return 'huge';
  if (/[a-z]/.test(text) && /[’']/.test(text)) return 'hand';
  if (text === text.toUpperCase() && text.length < 18) return 'box';
  if (/[a-z]/.test(text)) return 'hand';
  return 'plain';
}

function mountScraps() {
  const rnd = seeded('scraps-arctic-monkeys');

  SCRAP_PLAN.forEach(([host, text, anchor, inset, y]) => {
    const target = document.querySelector(host);
    if (!target) return;

    const el = document.createElement('span');
    // long lines run down the gutter instead of being cut off by it
    const vertical = text.length > 15 ? ' vert' : '';
    el.className = `scrap scrap-${scrapStyle(text)}${vertical} float`;
    el.setAttribute('aria-hidden', 'true');
    el.textContent = text;
    place(el, anchor, inset, y);
    el.style.setProperty('--rot', `${(rnd() * 20 - 10).toFixed(1)}deg`);
    el.style.setProperty('--dur', `${(24 + rnd() * 16).toFixed(0)}s`);
    el.style.setProperty('--dx', `${(rnd() * 10 - 5).toFixed(0)}px`);
    el.style.setProperty('--dy2', `${(-5 - rnd() * 9).toFixed(0)}px`);
    el.style.opacity = (0.2 + rnd() * 0.22).toFixed(2);

    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.appendChild(el);
  });
}

/* ------------------------------------------------------------
   Particles.

   One class drives both layers: the drifting motes behind the page, and
   the slower, sparser field inside an open window. A canvas is created
   on demand, sized to its host, and torn down with it — and the whole
   thing stops in a hidden tab and thins out on a phone.
   ------------------------------------------------------------ */
class Particles {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = Object.assign({
      count: 90, speed: 1, size: 1.7, light: 0.35, drift: 0.3
    }, opts);
    this.raf = null;
    this.motes = [];
    this.onResize = () => this.resize();
    this.onVis = () => (document.hidden ? this.stop() : this.start());

    this.resize();
    this.seed();
    addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
    this.start();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const box = this.canvas.getBoundingClientRect();
    const w = box.width || innerWidth;
    const h = box.height || innerHeight;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.dpr = dpr;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  seed() {
    const n = innerWidth < 700 ? Math.round(this.opts.count * 0.42) : this.opts.count;
    this.motes = Array.from({ length: n }, () => this.mote(true));
  }

  mote(init) {
    const d = this.dpr;
    return {
      x: Math.random() * this.w,
      y: init ? Math.random() * this.h : -14 * d,
      r: (Math.random() * this.opts.size + 0.25) * d,
      vy: (Math.random() * 0.34 + 0.06) * d * this.opts.speed,
      vx: (Math.random() - 0.5) * this.opts.drift * d,
      a: Math.random() * 0.3 + 0.05,
      light: Math.random() > this.opts.light
    };
  }

  frame() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    for (const m of this.motes) {
      m.y += m.vy;
      m.x += m.vx;
      if (m.y > h + 14 * this.dpr) Object.assign(m, this.mote(false));
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = m.light
        ? `rgba(232,229,222,${m.a})`
        : `rgba(20,20,20,${m.a * 0.8})`;
      ctx.fill();
    }
    this.raf = requestAnimationFrame(() => this.frame());
  }

  start() {
    if (this.raf || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  stop() {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  }

  destroy() {
    this.stop();
    removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
  }
}

/** The layer behind the whole page. */
function startDust() {
  const canvas = document.getElementById('dust');
  if (!canvas) return;
  return new Particles(canvas, { count: 90 });
}

/**
 * A field inside an open window. Slower and sparser than the page — it
 * should read as dust hanging in the light, not weather.
 */
function startModalParticles(overlay) {
  const panel = overlay && overlay.querySelector('.tm');
  if (!panel || panel.querySelector('.tm-dust')) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'tm-dust';
  canvas.setAttribute('aria-hidden', 'true');
  panel.prepend(canvas);
  // let the panel lay out before the canvas measures it
  return new Particles(canvas, { count: 34, speed: 0.45, size: 1.3, drift: 0.16 });
}

/* ------------------------------------------------------------
   Reveal on scroll + nav state
   ------------------------------------------------------------ */
function observeReveals(root = document) {
  const els = root.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) {
    els.forEach(e => e.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach(e => io.observe(e));
}

function watchNav() {
  const links = [...document.querySelectorAll('.nav-links a')];
  const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));
}
