/* ============================================================
   Collage engine
   - ransom(): headings built from real cut-paper letter scans,
     alternating the warm/colour set with the newsprint set
   - floating cut-out objects with drift + scroll parallax
   - drifting ash canvas
   - scroll reveal
   ============================================================ */

const LETTER_SETS = ['warm', 'mono'];
const HAS_LETTER = /^[a-z]$/;

/* deterministic jitter so a heading looks the same on every reload */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

/**
 * Render `text` into `el` as cut-out paper letters.
 * @param {HTMLElement} el
 * @param {string} text
 * @param {{start?:number}} [opts] start = which letter set the first glyph uses
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
      const rot = (rnd() * 5 - 2.5).toFixed(2);

      if (HAS_LETTER.test(low)) {
        const set = LETTER_SETS[i % LETTER_SETS.length];
        i++;
        const img = document.createElement('img');
        img.src = asset(`letters/${set}/${low}`);
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.draggable = false;
        img.style.setProperty('--r', `${rot}deg`);
        img.style.setProperty('--dy', `${(rnd() * 4 - 2).toFixed(1)}px`);
        word.appendChild(img);
      } else {
        // digits, punctuation, & — a small paper chip carries them
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.setAttribute('aria-hidden', 'true');
        chip.textContent = ch;
        chip.style.setProperty('--r', `${rot}deg`);
        word.appendChild(chip);
      }
    });
    el.appendChild(word);
  });
}

/* ------------------------------------------------------------
   Floating cut-outs. Each entry is placed inside a host section.
   x/y are percentages, w is a width in px (clamped on mobile).
   ------------------------------------------------------------ */
const DECOR = [
  // hero
  { host: '.hero', key: 'cut/fingerprint_heart', x: 78, y: 16, w: 210, rot: -9, op: 0.5, blend: 'screen', dur: 19 },
  { host: '.hero', key: 'cut/yourlips_torn', x: 4, y: 60, w: 250, rot: 3, op: 0.42, blend: 'screen', dur: 23, sm: false },
  { host: '.hero', key: 'cut/cig_lit', x: 30, y: 7, w: 340, rot: -2, op: 0.34, blend: 'screen', dur: 27, sm: false },
  { host: '.hero', key: 'cut/moon_sm', x: 86, y: 72, w: 130, rot: 6, op: 0.4, blend: 'screen', dur: 25, sm: false },
  { host: '.hero', key: 'cut/stars_red', x: 8, y: 12, w: 165, rot: -7, op: 0.6, dur: 21, sm: false },

  // about
  { host: '#about', key: 'cut/eye', x: 46, y: 3, w: 128, rot: 4, op: 0.4, blend: 'screen', dur: 22, sm: false },
  { host: '#about', key: 'cut/time_444', x: 3, y: 78, w: 110, rot: -8, op: 0.34, blend: 'screen', dur: 18, sm: false },
  { host: '#about', key: 'cut/eiffel', x: 90, y: 58, w: 78, rot: 5, op: 0.3, blend: 'screen', dur: 26, sm: false },
  { host: '#about', key: 'cut/note', x: 84, y: 8, w: 92, rot: -11, op: 0.36, blend: 'screen', dur: 20, sm: false },

  // members
  { host: '#members', key: 'cut/think_bubble', x: 68, y: 2, w: 260, rot: -3, op: 0.34, blend: 'screen', dur: 24, sm: false },
  { host: '#members', key: 'cut/heart_anatomy', x: 2, y: 40, w: 96, rot: 7, op: 0.3, blend: 'screen', dur: 19, sm: false },
  { host: '#members', key: 'cut/crying_room', x: 91, y: 74, w: 104, rot: -6, op: 0.32, dur: 23, sm: false },
  { host: '#members', key: 'cut/pick_heals', x: 5, y: 88, w: 120, rot: -14, op: 0.4, dur: 21, sm: false },

  // discography
  { host: '#discography', key: 'cut/cd_disc', x: 86, y: 5, w: 190, rot: 0, op: 0.24, dur: 30, sm: false },
  { host: '#discography', key: 'cut/tracklist_box', x: 2, y: 30, w: 130, rot: 4, op: 0.3, blend: 'screen', dur: 25, sm: false },
  { host: '#discography', key: 'cut/cig_pack', x: 92, y: 56, w: 150, rot: -8, op: 0.26, blend: 'screen', dur: 27, sm: false },
  { host: '#discography', key: 'cut/marquee', x: 1, y: 82, w: 175, rot: 3, op: 0.26, dur: 22, sm: false },

  // singles
  { host: '#singles', key: 'cut/stars_blue', x: 88, y: 10, w: 96, rot: -9, op: 0.42, blend: 'screen', dur: 18, sm: false },
  { host: '#singles', key: 'cut/vinyl', x: 3, y: 62, w: 150, rot: 6, op: 0.3, dur: 29, sm: false },
  { host: '#singles', key: 'cut/censored', x: 78, y: 84, w: 140, rot: -12, op: 0.4, dur: 20, sm: false },

  // lyrics / api
  { host: '#lyrics', key: 'cut/headphones', x: 90, y: 6, w: 130, rot: 5, op: 0.28, dur: 24, sm: false },
  { host: '#lyrics', key: 'cut/yourlips_serif', x: 1, y: 72, w: 190, rot: -4, op: 0.24, blend: 'screen', dur: 26, sm: false },
  { host: '#lyrics', key: 'cut/cry_player', x: 74, y: 90, w: 210, rot: 3, op: 0.3, dur: 21, sm: false },

  // quiz
  { host: '#quiz', key: 'cut/eight_ball', x: 8, y: 12, w: 84, rot: 8, op: 0.4, dur: 19, sm: false },
  { host: '#quiz', key: 'cut/good_night', x: 82, y: 16, w: 165, rot: -7, op: 0.34, blend: 'screen', dur: 23, sm: false },
  { host: '#quiz', key: 'cut/people_write', x: 4, y: 80, w: 165, rot: 5, op: 0.3, blend: 'screen', dur: 25, sm: false },
  { host: '#quiz', key: 'cut/music_heals', x: 88, y: 82, w: 82, rot: -10, op: 0.42, dur: 18, sm: false },
  { host: '#quiz', key: 'cut/forever', x: 46, y: 94, w: 150, rot: 2, op: 0.34, dur: 27, sm: false }
];

function mountDecor() {
  const parallax = [];
  DECOR.forEach((d, idx) => {
    const host = document.querySelector(d.host);
    if (!host) return;
    const src = asset(d.key);
    if (!src) return;

    const box = document.createElement('div');
    box.className = 'deco float' + (d.blend === 'screen' ? ' screen' : '') + (d.sm === false ? ' hide-sm' : '');
    box.style.left = d.x + '%';
    box.style.top = d.y + '%';
    box.style.width = d.w + 'px';
    box.style.opacity = d.op;
    box.style.setProperty('--rot', (d.rot || 0) + 'deg');
    box.style.setProperty('--dur', (d.dur || 20) + 's');
    box.style.setProperty('--dx', (idx % 2 ? 8 : -8) + 'px');
    box.style.setProperty('--dy2', (idx % 3 ? -14 : -8) + 'px');

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.loading = 'lazy';
    img.draggable = false;
    box.appendChild(img);

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(box);
    parallax.push({ box, speed: 0.012 + (idx % 5) * 0.006 });
  });

  // gentle scroll parallax on top of the drift animation
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = null;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      const y = window.scrollY;
      parallax.forEach(p => {
        // clamped so a cut-out never drifts far enough to leave its section
        const shift = Math.max(-70, Math.min(70, -y * p.speed + 30));
        p.box.style.marginTop = shift.toFixed(1) + 'px';
      });
      raf = null;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ------------------------------------------------------------
   Ash / ember canvas
   ------------------------------------------------------------ */
function startAsh() {
  const canvas = document.getElementById('ash');
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    w = canvas.width = Math.floor(window.innerWidth * dpr);
    h = canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  class Bit {
    constructor(kind) { this.kind = kind; this.reset(true); }
    reset(init) {
      this.x = Math.random() * w;
      this.y = init ? Math.random() * h : -20 * dpr;
      if (this.kind === 'ash') {
        this.r = (Math.random() * 1.9 + 0.3) * dpr;
        this.vy = (Math.random() * 0.42 + 0.1) * dpr;
        this.vx = (Math.random() - 0.5) * 0.34 * dpr;
        this.a = Math.random() * 0.26 + 0.05;
        this.c = '196,167,125';
      } else {
        this.r = (Math.random() * 1.3 + 0.4) * dpr;
        this.vy = (Math.random() * 0.24 + 0.05) * dpr;
        this.vx = (Math.random() - 0.5) * 0.15 * dpr;
        this.a = Math.random() * 0.42 + 0.14;
        this.c = '214,132,84';
        this.life = 1;
      }
    }
    step() {
      this.y += this.vy; this.x += this.vx;
      if (this.kind === 'ember') {
        this.life -= 0.0028;
        this.a = Math.max(0, this.life * 0.4);
        if (this.life <= 0) this.reset(false);
      }
      if (this.y > h + 20 * dpr) this.reset(false);
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.c},${this.a})`;
      ctx.fill();
    }
  }

  const bits = [];
  for (let i = 0; i < 80; i++) bits.push(new Bit('ash'));
  for (let i = 0; i < 22; i++) bits.push(new Bit('ember'));
  (function loop() {
    ctx.clearRect(0, 0, w, h);
    bits.forEach(b => { b.step(); b.draw(); });
    requestAnimationFrame(loop);
  })();
}

/* ------------------------------------------------------------
   Scroll reveal + nav highlighting
   ------------------------------------------------------------ */
function observeReveals(root = document) {
  const els = root.querySelectorAll('.reveal:not(.in)');
  if (!('IntersectionObserver' in window)) {
    els.forEach(e => e.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  els.forEach(e => io.observe(e));
}

function watchNav() {
  const links = [...document.querySelectorAll('.nav-links a')];
  const sections = links
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => io.observe(s));
}
