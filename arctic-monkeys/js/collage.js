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
  /* Spacing is enforced at runtime by spaceOut(); these are the intended
     positions. Three to five per gutter, chosen for the section they sit
     beside — tape and film for the history, instruments for the band,
     sleeves and stickers for the records, hand-lettered lyrics wherever
     the words are the subject. */

  // hero
  ['.hero', 'vinyl',        'vl',  16, 22, 172,  -7, 0.60, 34],
  ['.hero', 'rumine',       'vl',  30, 62, 104,   6, 0.62, 28],
  ['.hero', 'smokes',       'vl',  26, 88, 108,   9, 0.50, 30],
  ['.hero', 'moon',         'vr',  20,  6, 126,   4, 0.60, 40],
  ['.hero', 'pick',         'vr',  34, 46,  86,  -9, 0.58, 26],
  ['.hero', 'star-spiral',  'vr',  30, 82,  70, -12, 0.52, 24],

  // lore — how the demos travelled, and what got said
  ['#lore', 'vhs',          'vl',  16,  4, 138,  -6, 0.55, 35],
  ['#lore', 'cassette-line','vl',  22, 22, 132,   5, 0.55, 30],
  ['#lore', 'filmstrip',    'vl',  20, 44, 146,  -4, 0.48, 36],
  ['#lore', 'walk-two',     'vl',  26, 64, 130,   3, 0.52, 32],
  ['#lore', 'whothefuck',   'vl',  24, 86, 132,   5, 0.55, 31],
  ['#lore', 'tapes',        'vr',  18, 10, 134,   7, 0.52, 32],
  ['#lore', 'band-strip',   'vr',  16, 30, 150,  -3, 0.48, 34],
  ['#lore', 'poster',       'vr',  24, 52, 116,  -5, 0.50, 27],
  ['#lore', 'ticket',       'vr',  20, 72, 130,   4, 0.52, 29],
  ['#lore', 'illuminations','vr',  18, 92, 148,   3, 0.50, 26],
  ['#lore', 'receipt-cut',  'vl',  30, 96,  84,  -4, 0.42, 33],
  ['#lore', 'letter',       'vr',  22, 40, 128,  -6, 0.50, 28],

  // members
  ['#members', 'knight',    'vl',  30, 14,  76,  -7, 0.55, 29],
  ['#members', 'guitar-line','vl', 24, 48, 104,   6, 0.52, 31],
  ['#members', 'dice',      'vl',  22, 80, 112,  -5, 0.55, 30],
  ['#members', 'bass',      'vr',  30,  8,  74,   9, 0.55, 33],
  ['#members', 'figure-a',  'vr',  30, 44,  84,  -4, 0.50, 28],
  ['#members', 'skeleton',  'vr',  26, 78,  90,   6, 0.48, 25],

  // discography
  ['#discography', 'headphones',   'vl', 22,  4, 108,   8, 0.52, 28],
  ['#discography', 'vinyl-wave',   'vl', 16, 22, 132,  -4, 0.52, 30],
  ['#discography', 'spotify',      'vl', 14, 42, 146,  -4, 0.48, 30],
  ['#discography', 'player-widget','vl', 16, 62, 150,   3, 0.48, 27],
  ['#discography', 'vinyl-label',  'vl', 20, 82, 130,   5, 0.52, 38],
  ['#discography', 'advisory',     'vr', 14,  6, 134,   4, 0.52, 32],
  ['#discography', 'hotel',        'vr', 20, 26, 142,   6, 0.52, 34],
  ['#discography', 'whyd',         'vr', 18, 48, 138,  -5, 0.55, 29],
  ['#discography', 'logo-script',  'vr', 20, 70, 138,   5, 0.48, 31],
  ['#discography', 'globe',        'vr', 26, 90,  98,  -7, 0.50, 27],
  ['#discography', 'vinyl-moon',   'vl', 20, 12, 126,   4, 0.48, 36],
  ['#discography', 'wave-fat',     'vl', 18, 52, 140,  -3, 0.44, 25],
  ['#discography', 'logo-rough',   'vr', 22, 16, 126,  -5, 0.46, 30],
  ['#discography', 'ticket-hotel', 'vr', 20, 58, 138,   4, 0.46, 28],
  ['#discography', 'eye-vinyl',    'vr', 24, 80, 120,   6, 0.44, 29],

  // singles
  ['#singles', 'moon-full',    'vl', 24, 12, 100,   6, 0.55, 37],
  ['#singles', 'laserquest',   'vl', 20, 44, 126,  -5, 0.55, 28],
  ['#singles', 'teddy',        'vl', 20, 78, 126,  -6, 0.52, 28],
  ['#singles', 'star-marquee', 'vr', 26,  8,  84, -10, 0.55, 24],
  ['#singles', 'fluorescent',  'vr', 16, 40, 144,   5, 0.50, 29],
  ['#singles', 'rainyday',     'vr', 22, 74, 120,   4, 0.52, 30],
  ['#singles', 'spotify-hearts','vl', 18, 60, 140,   3, 0.44, 27],
  ['#singles', 'logo-lower',   'vr', 24, 56, 118,  -4, 0.46, 31],

  // quizzes
  ['#quiz', 'heart-music',   'vl', 24, 12,  98,  -6, 0.55, 27],
  ['#quiz', 'scales',        'vl', 26, 48, 100,   5, 0.52, 31],
  ['#quiz', 'saturn',        'vl', 22, 84, 120,   7, 0.50, 33],
  ['#quiz', 'twin',          'vr', 26, 16,  94,   8, 0.55, 26],
  ['#quiz', 'numbers',       'vr', 30, 52,  54,  -3, 0.50, 29],
  ['#quiz', 'am-square',     'vr', 26, 86,  80,   4, 0.48, 25],
  ['#quiz', 'letter-c',      'vl', 30, 66,  70,  -5, 0.46, 28],
  ['#quiz', 'brickbybrick',  'vr', 24, 68, 104,   5, 0.48, 27]
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

/* Objects for the windows: two per corner, small and quiet, chosen so
   each kind of window gets its own furniture. */
const MODAL_DECOR = {
  track:  [['pick', 'tl', 74, -10], ['vinyl-wave', 'br', 96, 8]],
  single: [['star-marquee', 'tl', 66, -8], ['rainyday', 'br', 104, 6]],
  member: [['bass', 'tl', 54, -12], ['dice', 'br', 84, 7]],
  quiz:   [['shalala-circle', 'tl', 78, -9], ['dice', 'br', 80, 6]]
};

/**
 * Tape a couple of cut-outs into the corners of an open window.
 *
 * They sit behind the text on the panel's own stacking context, dimmer
 * than the ones outside, and are torn down with the window.
 */
function mountModalDecor(overlay, kind) {
  const panel = overlay && overlay.querySelector('.tm');
  if (!panel) return;
  panel.querySelectorAll('.tm-deco').forEach(el => el.remove());

  (MODAL_DECOR[kind] || []).forEach(([file, corner, w, rot]) => {
    const box = document.createElement('div');
    box.className = `tm-deco tm-deco-${corner}`;
    box.setAttribute('aria-hidden', 'true');
    box.style.width = w + 'px';
    if (CUT_ASPECT[file]) box.style.aspectRatio = String(CUT_ASPECT[file]);
    box.style.setProperty('--rot', rot + 'deg');

    const img = document.createElement('img');
    img.src = `${CUTS}/${file}.webp`;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    box.appendChild(img);
    panel.appendChild(box);
  });
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
const MIN_GAP = 32;      // px of clear space between two objects

function spaceOut() {
  const groups = new Map();

  document.querySelectorAll('.deco, .scrap').forEach(el => {
    const host = el.closest('.hero, .section');
    if (!host) return;
    el.hidden = false;                       // re-measure from a clean slate
    const hostTop = host.getBoundingClientRect().top;
    const r = el.getBoundingClientRect();
    if (!r.height) return;
    const key = `${host.id || 'hero'}|${el.dataset.anchor}`;
    if (!groups.has(key)) groups.set(key, { host, items: [] });
    /* Measure the rendered box, rotation and drift included — a long
       vertical scrap turned ten degrees covers far more than its
       offsetHeight, which is what let things touch before. `offset` is
       the value actually written back, since `top` is set in that space. */
    groups.get(key).items.push({
      el, top: r.top - hostTop, h: r.height, offset: el.offsetTop
    });
  });

  groups.forEach(({ host, items }) => {
    items.sort((a, b) => a.top - b.top);
    const limit = host.offsetHeight;
    let cursor = -Infinity;
    items.forEach(it => {
      const want = Math.max(it.top, cursor + MIN_GAP);
      /* If pushing it down would run it out of the section, there is no
         room for it here — a short section simply carries fewer objects.
         Crowding them together to fit would undo the point of this. */
      if (want + it.h > limit - 8) {
        it.el.hidden = true;
        return;
      }
      if (Math.abs(want - it.top) > 1) {
        it.el.style.top = `${(it.offset + (want - it.top)).toFixed(0)}px`;
      }
      cursor = want + it.h;
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
    el.style.setProperty('--rot',
      `${(vertical ? rnd() * 6 - 3 : rnd() * 20 - 10).toFixed(1)}deg`);
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
      a: Math.random() * 0.4 + 0.08,
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

/* Where the stars are in assets/bg/stars.webp, as fractions of its own
   width and height. Found by blurring the halftone until each star's dots
   merge into one blob, then taking the centroids and dropping streaks.
   The backdrop is `cover`, so these are mapped through the same crop at
   runtime — see mountStars(). Regenerate if the backdrop changes. */
const STAR_POINTS = [
  { x: 0.26575, y: 0.57469, r: 0.22571, a: 0.558 },
  { x: 0.24233, y: 0.21103, r: 0.17750, a: 0.554 },
  { x: 0.68521, y: 0.34029, r: 0.16214, a: 0.528 },
  { x: 0.51688, y: 0.84089, r: 0.13250, a: 0.528 },
  { x: 0.74978, y: 0.58388, r: 0.09179, a: 0.518 },
  { x: 0.81244, y: 0.08300, r: 0.08143, a: 0.517 },
  { x: 0.78260, y: 0.77722, r: 0.06036, a: 0.504 },
  { x: 0.84220, y: 0.28501, r: 0.05214, a: 0.445 },
  { x: 0.10885, y: 0.40558, r: 0.05071, a: 0.531 },
  { x: 0.56310, y: 0.11619, r: 0.04143, a: 0.486 },
  { x: 0.87681, y: 0.96686, r: 0.03500, a: 0.530 },
  { x: 0.16711, y: 0.90024, r: 0.03250, a: 0.523 },
  { x: 0.48954, y: 0.47714, r: 0.03214, a: 0.577 },
  { x: 0.36269, y: 0.05279, r: 0.03179, a: 0.484 },
  { x: 0.23742, y: 0.78228, r: 0.02893, a: 0.517 },
  { x: 0.92309, y: 0.48347, r: 0.02536, a: 0.533 },
  { x: 0.15957, y: 0.50070, r: 0.02321, a: 0.514 },
  { x: 0.50588, y: 0.69196, r: 0.02286, a: 0.463 },
  { x: 0.56811, y: 0.60795, r: 0.02179, a: 0.568 },
  { x: 0.75335, y: 0.19927, r: 0.02107, a: 0.511 },
  { x: 0.07600, y: 0.04507, r: 0.01821, a: 0.498 },
  { x: 0.48347, y: 0.25383, r: 0.01750, a: 0.514 },
  { x: 0.15096, y: 0.68835, r: 0.01679, a: 0.437 },
  { x: 0.87839, y: 0.87271, r: 0.01607, a: 0.470 },
  { x: 0.27066, y: 0.35989, r: 0.01393, a: 0.503 },
  { x: 0.95206, y: 0.15355, r: 0.01286, a: 0.554 },
  { x: 0.38358, y: 0.95857, r: 0.01286, a: 0.492 },
  { x: 0.66213, y: 0.55326, r: 0.01250, a: 0.421 },
  { x: 0.07143, y: 0.80725, r: 0.01143, a: 0.457 },
  { x: 0.63324, y: 0.03193, r: 0.00964, a: 0.424 },
  { x: 0.52839, y: 0.34874, r: 0.00857, a: 0.428 },
  { x: 0.65988, y: 0.54375, r: 0.00821, a: 0.431 },
  { x: 0.15943, y: 0.69291, r: 0.00821, a: 0.424 },
  { x: 0.80700, y: 0.43246, r: 0.00750, a: 0.389 },
  { x: 0.38544, y: 0.66494, r: 0.00750, a: 0.432 },
  { x: 0.04336, y: 0.19286, r: 0.00714, a: 0.444 },
  { x: 0.64967, y: 0.53890, r: 0.00714, a: 0.429 },
  { x: 0.34317, y: 0.22950, r: 0.00679, a: 0.409 },
  { x: 0.05966, y: 0.38652, r: 0.00679, a: 0.388 },
  { x: 0.77240, y: 0.54569, r: 0.00679, a: 0.414 },
  { x: 0.80518, y: 0.55628, r: 0.00679, a: 0.408 },
  { x: 0.20766, y: 0.64502, r: 0.00679, a: 0.391 },
  { x: 0.51280, y: 0.90833, r: 0.00679, a: 0.402 },
  { x: 0.79087, y: 0.26868, r: 0.00607, a: 0.410 },
  { x: 0.63197, y: 0.34749, r: 0.00607, a: 0.389 },
  { x: 0.64079, y: 0.88739, r: 0.00607, a: 0.420 },
  { x: 0.12233, y: 0.12896, r: 0.00571, a: 0.434 },
  { x: 0.24143, y: 0.17385, r: 0.00571, a: 0.428 },
  { x: 0.59972, y: 0.34419, r: 0.00571, a: 0.384 },
  { x: 0.52625, y: 0.10480, r: 0.00536, a: 0.401 },
  { x: 0.84138, y: 0.55825, r: 0.00536, a: 0.371 },
  { x: 0.39890, y: 0.66904, r: 0.00536, a: 0.394 },
  { x: 0.65191, y: 0.89216, r: 0.00536, a: 0.458 },
  { x: 0.84783, y: 0.55136, r: 0.00500, a: 0.375 },
  { x: 0.62610, y: 0.25354, r: 0.00464, a: 0.392 },
  { x: 0.51660, y: 0.49583, r: 0.00464, a: 0.386 },
  { x: 0.81757, y: 0.05314, r: 0.00429, a: 0.394 },
  { x: 0.76541, y: 0.07825, r: 0.00429, a: 0.445 },
  { x: 0.72521, y: 0.31044, r: 0.00429, a: 0.433 },
  { x: 0.71295, y: 0.38685, r: 0.00429, a: 0.427 },
  { x: 0.72867, y: 0.39474, r: 0.00429, a: 0.408 },
  { x: 0.15663, y: 0.59464, r: 0.00429, a: 0.404 },
  { x: 0.15788, y: 0.60347, r: 0.00429, a: 0.435 },
  { x: 0.66421, y: 0.63041, r: 0.00429, a: 0.437 }
];

/**
 * Light the stars.
 *
 * The backdrop is a `cover` image, so the same crop has to be applied to
 * the coordinates or the glows drift off their stars: work out the
 * scale, centre the overflow, and place each glow at its star. Each one
 * gets its own delay, so they come up in turn rather than pulsing as a
 * block, and the whole layer is re-measured on resize.
 */
function mountStars() {
  const host = document.querySelector('.backdrop');
  if (!host) return;

  let layer = host.querySelector('.star-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'star-layer';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
  }

  // the backdrop's natural size, so `cover` can be reproduced exactly
  const NAT_W = 1400, NAT_H = 2488;

  const place = () => {
    const cw = innerWidth, ch = innerHeight;
    const scale = Math.max(cw / NAT_W, ch / NAT_H);
    const w = NAT_W * scale, h = NAT_H * scale;
    const ox = (cw - w) / 2;
    const oy = 0;                      // the CSS anchors the image to the top

    layer.innerHTML = '';
    STAR_POINTS.forEach((st, i) => {
      const x = ox + st.x * w;
      const y = oy + st.y * h;
      if (x < -80 || x > cw + 80 || y < -80 || y > ch + 80) return;

      const size = Math.max(14, st.r * w * 2.1);
      const el = document.createElement('span');
      el.className = 'star';
      el.style.cssText =
        `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;` +
        `width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;` +
        // one at a time: the delays are spread across the whole cycle
        `--delay:${(i * 0.37).toFixed(2)}s;` +
        `--dur:${(5.5 + (i % 7) * 0.6).toFixed(1)}s;` +
        `--peak:${(0.35 + st.a * 0.5).toFixed(2)}`;
      layer.appendChild(el);
    });
  };

  place();
  let t = null;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(place, 200); });
}

/** The layer behind the whole page. */
function startDust() {
  const canvas = document.getElementById('dust');
  if (!canvas) return;
  return new Particles(canvas, { count: 170, size: 2.0 });
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
  return new Particles(canvas, { count: 70, speed: 0.5, size: 1.5, drift: 0.2 });
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
