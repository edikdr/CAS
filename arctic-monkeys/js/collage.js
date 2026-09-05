/* ============================================================
   Collage engine
   - ransom(): headings built from real cut-paper letter scans
   - drawn cut-outs (vinyl, moon, cassette, VHS, sneaker …),
     all inline SVG so the page stays light
   - scattered text scraps: lyric fragments and song titles
   - drifting dust/grain canvas
   - scroll reveal + nav highlighting
   ============================================================ */

const LETTERS = '../assets/letters';
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
   Drawn cut-outs. Everything the fan collages are made of —
   vinyl, the moon, a cassette, a VHS stack, a hi-top, dice,
   a chess knight — as inline SVG rather than photographs.
   ------------------------------------------------------------ */
const SHAPES = {
  vinyl: `<svg viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="49" fill="#0b0b0b" stroke="#e8e5de" stroke-width="1.2"/>
    ${Array.from({ length: 11 }, (_, i) =>
      `<circle cx="50" cy="50" r="${16 + i * 3}" fill="none" stroke="#2a2a2a" stroke-width=".6"/>`).join('')}
    <circle cx="50" cy="50" r="14" fill="#d8d4cc"/><circle cx="50" cy="50" r="2" fill="#0b0b0b"/>
    <path d="M50 40 a10 10 0 0 1 0 20" fill="none" stroke="#0b0b0b" stroke-width="1.2"/></svg>`,

  moon: `<svg viewBox="0 0 100 100"><defs><radialGradient id="mg" cx="38%" cy="34%">
    <stop offset="0%" stop-color="#e9e6df"/><stop offset="72%" stop-color="#b3afa6"/>
    <stop offset="100%" stop-color="#6e6b65"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#mg)"/>
    <circle cx="34" cy="36" r="9" fill="#8e8b84" opacity=".55"/>
    <circle cx="62" cy="30" r="5" fill="#8e8b84" opacity=".45"/>
    <circle cx="68" cy="60" r="12" fill="#8e8b84" opacity=".4"/>
    <circle cx="41" cy="66" r="6" fill="#8e8b84" opacity=".5"/>
    <circle cx="24" cy="56" r="4" fill="#8e8b84" opacity=".4"/></svg>`,

  cassette: `<svg viewBox="0 0 140 90"><rect width="140" height="90" rx="5" fill="#111"/>
    <rect x="7" y="7" width="126" height="40" rx="2" fill="#e8e5de"/>
    <line x1="14" y1="20" x2="126" y2="20" stroke="#111" stroke-width="1.4"/>
    <line x1="14" y1="30" x2="100" y2="30" stroke="#111" stroke-width="1.4"/>
    <rect x="30" y="53" width="80" height="28" rx="3" fill="#2a2a2a"/>
    <circle cx="50" cy="67" r="9" fill="#e8e5de"/><circle cx="90" cy="67" r="9" fill="#e8e5de"/>
    <circle cx="50" cy="67" r="3" fill="#111"/><circle cx="90" cy="67" r="3" fill="#111"/></svg>`,

  vhs: `<svg viewBox="0 0 130 96"><g stroke="#111" stroke-width="2" fill="#e8e5de">
    <rect x="6" y="60" width="118" height="28" rx="2"/>
    <rect x="12" y="36" width="112" height="26" rx="2" transform="rotate(-2 68 49)"/>
    <rect x="4" y="12" width="112" height="26" rx="2" transform="rotate(2 60 25)"/></g>
    <g fill="#111" font-family="monospace" font-size="9">
    <text x="18" y="78">HOME TAPE 03</text><text x="24" y="54">SPACE DOCTOR</text>
    <text x="14" y="30">MONKEYS — LIVE</text></g></svg>`,

  sneaker: `<svg viewBox="0 0 130 90"><path d="M8 66c0-16 4-30 10-42 3-6 12-8 16-2l10 16c4 6 10 9 18 11l38 9c12 3 20 8 20 16v6c0 4-3 7-7 7H15c-4 0-7-3-7-7z"
    fill="#111" stroke="#e8e5de" stroke-width="2"/>
    <path d="M8 66h112" stroke="#e8e5de" stroke-width="3"/>
    <circle cx="40" cy="42" r="11" fill="#e8e5de"/>
    <text x="40" y="45" text-anchor="middle" font-family="monospace" font-size="6" fill="#111">AM</text>
    <g stroke="#e8e5de" stroke-width="1.6">
    <line x1="22" y1="34" x2="30" y2="30"/><line x1="24" y1="44" x2="32" y2="40"/>
    <line x1="26" y1="54" x2="34" y2="50"/></g></svg>`,

  dice: `<svg viewBox="0 0 100 60"><g fill="#f2efe8" stroke="#111" stroke-width="2">
    <rect x="4" y="10" width="40" height="40" rx="7"/><rect x="54" y="6" width="40" height="40" rx="7"
    transform="rotate(12 74 26)"/></g><g fill="#111">
    <circle cx="16" cy="22" r="3.4"/><circle cx="32" cy="22" r="3.4"/>
    <circle cx="16" cy="38" r="3.4"/><circle cx="32" cy="38" r="3.4"/>
    <circle cx="74" cy="26" r="3.4"/><circle cx="63" cy="16" r="3.4"/><circle cx="85" cy="36" r="3.4"/></g></svg>`,

  knight: `<svg viewBox="0 0 70 90"><path d="M20 84h34c0-8-4-10-4-16 0-14 10-18 10-32 0-14-12-22-22-22-4 0-6 2-9 6l-6 8-8 4c-3 2-4 6-1 8l6 3-6 12c-2 5 0 9 4 11 4 2 6 6 6 10 0 4-2 6-4 8z"
    fill="#111" stroke="#e8e5de" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="40" cy="26" r="2.6" fill="#e8e5de"/></svg>`,

  heart: `<svg viewBox="0 0 100 90"><path d="M50 84S6 56 6 30C6 15 17 6 29 6c9 0 17 5 21 13 4-8 12-13 21-13 12 0 23 9 23 24 0 26-44 54-44 54z"
    fill="#111" stroke="#e8e5de" stroke-width="2"/></svg>`,

  star: `<svg viewBox="0 0 100 100"><path d="M50 2l11 33h35L67 56l11 34-28-21-28 21 11-34L4 35h35z"
    fill="#111" stroke="#e8e5de" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="50" cy="52" r="9" fill="#e8e5de"/></svg>`,

  spiral: `<svg viewBox="0 0 100 100"><path fill="none" stroke="#111" stroke-width="6"
    d="M50 50c0-6 6-10 12-8s8 10 4 17-16 9-24 4-10-20-3-29 24-11 34-2 12 28 2 39-32 13-45 3"/></svg>`,

  filmstrip: `<svg viewBox="0 0 160 60">
    <rect x="1" y="1" width="158" height="58" fill="#111" stroke="#e8e5de" stroke-width="1.5"/>
    ${Array.from({ length: 9 }, (_, i) =>
      `<rect x="${5 + i * 18}" y="4" width="10" height="7" fill="#e8e5de"/>
       <rect x="${5 + i * 18}" y="49" width="10" height="7" fill="#e8e5de"/>`).join('')}
    <rect x="8" y="16" width="66" height="28" fill="#3a3a3a"/>
    <rect x="86" y="16" width="66" height="28" fill="#2b2b2b"/></svg>`,

  ticket: `<svg viewBox="0 0 140 56"><path d="M4 4h132v16a8 8 0 0 0 0 16v16H4V36a8 8 0 0 0 0-16z"
    fill="#e8e5de" stroke="#111" stroke-width="2"/>
    <line x1="98" y1="6" x2="98" y2="50" stroke="#111" stroke-width="1.4" stroke-dasharray="3 3"/>
    <text x="16" y="26" font-family="monospace" font-size="12" fill="#111">ADMIT ONE</text>
    <text x="16" y="42" font-family="monospace" font-size="9" fill="#111">SHEFFIELD</text>
    <text x="112" y="34" font-family="monospace" font-size="12" fill="#111">505</text></svg>`,

  eye: `<svg viewBox="0 0 100 70"><path d="M4 35h92M6 35c14-20 34-30 44-30s30 10 44 30"
    fill="none" stroke="#111" stroke-width="2.5"/>
    <path d="M6 35c14 20 34 30 44 30s30-10 44-30" fill="none" stroke="#111" stroke-width="2.5"/>
    <circle cx="50" cy="35" r="13" fill="none" stroke="#111" stroke-width="2.5"/>
    <circle cx="50" cy="35" r="5" fill="#111"/></svg>`,

  headphones: `<svg viewBox="0 0 100 84"><path d="M12 60V46a38 38 0 0 1 76 0v14"
    fill="none" stroke="#111" stroke-width="6"/>
    <rect x="2" y="54" width="20" height="28" rx="7" fill="#111"/>
    <rect x="78" y="54" width="20" height="28" rx="7" fill="#111"/></svg>`,

  guitar: `<svg viewBox="0 0 60 130"><rect x="26" y="4" width="8" height="66" fill="#111"/>
    <rect x="22" y="0" width="16" height="12" rx="2" fill="#111"/>
    <ellipse cx="30" cy="96" rx="26" ry="32" fill="#111"/>
    <circle cx="30" cy="92" r="8" fill="#e8e5de"/>
    <rect x="27" y="112" width="6" height="12" fill="#e8e5de"/></svg>`,

  advisory: `<svg viewBox="0 0 150 60"><rect width="150" height="60" fill="#111"/>
    <text x="75" y="26" text-anchor="middle" font-family="Arial Black, sans-serif"
      font-size="17" font-weight="900" fill="#fff" letter-spacing="1.5">PARENTAL</text>
    <text x="75" y="46" text-anchor="middle" font-family="Arial, sans-serif"
      font-size="11" fill="#fff" letter-spacing="1">ADVISORY</text></svg>`,

  bars: `<svg viewBox="0 0 160 46"><rect width="160" height="46" rx="8" fill="#111"/>
    ${Array.from({ length: 23 }, (_, i) => {
      const h = 6 + ((i * 37) % 26);
      return `<rect x="${9 + i * 6.2}" y="${23 - h / 2}" width="3" height="${h}" rx="1.5" fill="#e8e5de"/>`;
    }).join('')}</svg>`,

  cig: `<svg viewBox="0 0 120 26"><rect x="0" y="6" width="86" height="14" fill="#f2efe8" stroke="#111" stroke-width="1.6"/>
    <rect x="86" y="6" width="30" height="14" fill="#c9a06a" stroke="#111" stroke-width="1.6"/>
    <circle cx="3" cy="13" r="3" fill="#111" opacity=".7"/></svg>`,

  triangle: `<svg viewBox="0 0 90 78"><path d="M45 4 86 74H4z" fill="none" stroke="#111" stroke-width="3"/>
    <circle cx="45" cy="50" r="9" fill="none" stroke="#111" stroke-width="3"/>
    <circle cx="45" cy="50" r="3" fill="#111"/></svg>`
};

/* ------------------------------------------------------------
   Where the cut-outs go.

   Anchoring is to the *viewport* gutters, not to the content column, so
   a cut-out physically cannot land on a heading, a button or a receipt:
     vl / vr   the empty margin outside the 1180px column
     ir        inside the column on the right, only where the text is
               narrow enough to leave room (the hero)
   Everything is hidden below 1240px, where those margins run out.

   The objects are chosen per section rather than scattered: tape and
   film for the history, instruments for the band, records and sleeves
   for the discography.

   [host, shape, anchor, inset px, y %, width px, rotation, opacity, drift s]
   ------------------------------------------------------------ */
const DECOR = [
  // hero — the record, the moon it gets played under
  ['.hero', 'vinyl',      'vl',  18, 46, 168,  -7, 0.50, 34],
  ['.hero', 'cig',        'vl',  34, 76, 118,   9, 0.30, 30],
  ['.hero', 'moon',       'ir',  10, 10, 140,   4, 0.44, 40],
  ['.hero', 'star',       'ir',  96, 60,  62, -12, 0.34, 26],
  ['.hero', 'triangle',   'vr',  26, 30,  58,   6, 0.28, 28],

  // lore — the formats the demos travelled on
  ['#lore', 'vhs',        'vl',  14,  8, 134,  -6, 0.32, 35],
  ['#lore', 'filmstrip',  'vl',  22, 44, 158,  -4, 0.26, 36],
  ['#lore', 'spiral',     'vl',  40, 80,  74,  -9, 0.28, 31],
  ['#lore', 'cassette',   'vr',  16, 18, 130,   7, 0.32, 32],
  ['#lore', 'ticket',     'vr',  20, 62, 142,   5, 0.32, 27],

  // members — what they actually play
  ['#members', 'knight',  'vl',  40, 30,  62,  -7, 0.30, 29],
  ['#members', 'dice',    'vl',  24, 74, 104,  -5, 0.30, 30],
  ['#members', 'guitar',  'vr',  40, 12,  58,   9, 0.32, 33],
  ['#members', 'heart',   'vr',  30, 68,  72,  11, 0.28, 25],

  // discography — sleeves, players, stickers
  ['#discography', 'headphones', 'vl', 26, 10,  92,   8, 0.28, 28],
  ['#discography', 'bars',       'vl', 14, 40, 148,  -4, 0.26, 30],
  ['#discography', 'vinyl',      'vl', 20, 74, 132,   5, 0.24, 38],
  ['#discography', 'advisory',   'vr', 16, 16, 130,   4, 0.26, 32],
  ['#discography', 'eye',        'vr', 34, 48,  86,   7, 0.28, 26],
  ['#discography', 'vhs',        'vr', 18, 80, 126,  -6, 0.24, 35],

  // singles
  ['#singles', 'moon',     'vl', 26, 40,  98,   6, 0.30, 37],
  ['#singles', 'star',     'vr', 32, 14,  62, -10, 0.32, 24],
  ['#singles', 'cassette', 'vr', 20, 66, 100,  -8, 0.28, 29],

  // colophon
  ['#colophon', 'triangle', 'vl', 30, 30, 56,  -6, 0.26, 28],
  ['#colophon', 'spiral',   'vr', 28, 55, 68,   8, 0.24, 31]
];

function place(el, anchor, inset, y) {
  el.dataset.anchor = anchor;
  el.style.setProperty('--inset', inset + 'px');
  el.style.top = y + '%';
}

function mountDecor() {
  const parallax = [];

  DECOR.forEach(([host, shape, anchor, inset, y, w, rot, op, dur], idx) => {
    const target = document.querySelector(host);
    if (!target || !SHAPES[shape]) return;

    const box = document.createElement('div');
    box.className = 'deco float';
    box.setAttribute('aria-hidden', 'true');
    place(box, anchor, inset, y);
    box.style.width = w + 'px';
    box.style.opacity = op;
    box.style.setProperty('--rot', rot + 'deg');
    box.style.setProperty('--dur', dur + 's');
    box.style.setProperty('--dx', (idx % 2 ? 8 : -8) + 'px');
    box.style.setProperty('--dy2', (idx % 3 ? -13 : -7) + 'px');

    // shapes can carry gradient ids; keep them unique per instance
    box.innerHTML = SHAPES[shape]
      .replace(/id="([\w-]+)"/g, `id="$1-${idx}"`)
      .replace(/url\(#([\w-]+)\)/g, `url(#$1-${idx})`);

    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.appendChild(box);
    parallax.push({ box, speed: 0.012 + (idx % 5) * 0.006 });
  });

  mountScraps();

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

/* ------------------------------------------------------------
   Text scraps — lyric fragments and titles taped up in the same
   gutters, each sent to the section it belongs to.
   ------------------------------------------------------------ */
const SCRAP_PLAN = [
  // hero: the lines everybody knows
  ['.hero', 'R U MINE?', 'vl', 20, 20], ['.hero', '505', 'vr', 30, 8],
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

  // singles + colophon
  ['#singles', 'TEDDY PICKER', 'vl', 18, 24],
  ['#singles', 'on a RAINY day', 'vr', 26, 78],
  ['#colophon', 'XOXO', 'vl', 24, 60],
  ['#colophon', 'MORE LIKE BLACK TREACLE THAN TAR', 'vr', 20, 20]
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
   Dust canvas — paper grain drifting over everything.
   ------------------------------------------------------------ */
function startDust() {
  const canvas = document.getElementById('dust');
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;

  function resize() {
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
  }
  resize();
  addEventListener('resize', resize);

  class Mote {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * w;
      this.y = init ? Math.random() * h : -14 * dpr;
      this.r = (Math.random() * 1.7 + 0.25) * dpr;
      this.vy = (Math.random() * 0.34 + 0.06) * dpr;
      this.vx = (Math.random() - 0.5) * 0.3 * dpr;
      this.a = Math.random() * 0.3 + 0.05;
      this.light = Math.random() > 0.35;
    }
    step() {
      this.y += this.vy;
      this.x += this.vx;
      if (this.y > h + 14 * dpr) this.reset(false);
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.light
        ? `rgba(232,229,222,${this.a})`
        : `rgba(20,20,20,${this.a * 0.8})`;
      ctx.fill();
    }
  }

  const motes = Array.from({ length: 90 }, () => new Mote());
  (function loop() {
    ctx.clearRect(0, 0, w, h);
    motes.forEach(m => { m.step(); m.draw(); });
    requestAnimationFrame(loop);
  })();
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
