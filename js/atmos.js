/* ============================================================
   Atmosphere: ash, embers, reveals, and the error trap.

   One canvas, one requestAnimationFrame for the whole page. The loop
   stops dead in a hidden tab and while the WebGL modal is up, so two
   render loops never run at once.
   ============================================================ */

const Diag = {
  build: 'hu-1',
  errors: [],
  counts: {},
  note(where, e) {
    const msg = `${where}: ${(e && e.message) || e}`;
    this.errors.push(msg);
    console.warn('[hu]', msg);
  },
  set(k, v) { this.counts[k] = v; }
};

/** Run a mounting step inside its own trap: one failure cannot take the
    rest of the page down with it. */
function safely(where, fn) {
  try { return fn(); } catch (e) { Diag.note(where, e); return null; }
}

const REDUCED = !!(window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ------------------------------------------------------------
   Ash, embers and dust.

   THREE POPULATIONS ON ONE CANVAS. Embers are born low in the fire band,
   are coral and quick, and burn out before they reach the middle. Ash is
   steel, slow, and drifts the whole height. Dust is the new one: barely
   visible specks with almost no upward speed, there to give the black
   between the other two some grain. All of them rise, because everything
   in the artwork below them is on fire.

   ------------------------------------------------------------
   WHY THERE ARE THREE TIMES AS MANY AND IT COSTS LESS
   ------------------------------------------------------------

   The old loop drew every mote as ctx.arc() + ctx.fill(), and set
   ctx.shadowBlur on each ember to make it glow. Canvas shadow blur is
   the single most expensive thing in the 2D API — it re-rasterises the
   shape through a gaussian, per particle, per frame — and it was being
   asked for it about forty times a frame. That is what kept the count at
   110.

   Each species is now rasterised ONCE into a small offscreen canvas,
   glow and all, and every mote is a single drawImage of that sprite.
   No shadow state, no path building, no per-particle fill colour. The
   count went to 300 and the frame got cheaper, which is the whole trick:
   the glow was never the expensive part, recomputing it 40 times a frame
   was.

   Two more things keep it honest. Motes are drawn grouped by species, so
   the context's alpha is set a handful of times a frame instead of once
   per mote. And the loop measures itself: if frames run long for a
   stretch it sheds motes until they do not, so a weak machine gets a
   thinner snowfall rather than a stuttering one.
   ------------------------------------------------------------ */

/** One species, rasterised once: a radial glow with a hot core. */
function moteSprite(rgb, size, core) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${rgb}, 1)`);
  grad.addColorStop(core, `rgba(${rgb}, .55)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  return c;
}

class Ashfall {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.opts = Object.assign({
      count: 300,
      speed: 1,
      host: null,        // size to this element instead of the window
      embers: 0.30,      // share of the population that burns
      dust: 0.34         // share that is barely-there grain
    }, opts);

    /* The palette, from css/style.css: coral for what is burning, steel
       for what has already burnt. */
    this.sprites = {
      ember: moteSprite('255, 108, 78', 48, 0.22),
      ash: moteSprite('186, 187, 186', 34, 0.3),
      dust: moteSprite('150, 146, 138', 20, 0.42)
    };

    this.motes = [];
    this.running = false;
    this.paused = false;
    this.raf = 0;
    this.slow = 0;

    this.onResize = () => { this.resize(); this.seed(); };
    this.onVis = () => (document.hidden ? this.stop() : this.start());

    this.resize();
    this.seed();
    addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVis);
    if (!REDUCED) this.start();
  }

  resize() {
    /* Device pixel ratio is capped at 2 and then again by area: a 4K
       window at dpr 2 is 33 megapixels of canvas to clear every frame,
       and the layer is atmosphere, not content. */
    const box = this.opts.host
      ? this.opts.host.getBoundingClientRect()
      : { width: innerWidth, height: innerHeight };
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    let dpr = Math.min(devicePixelRatio || 1, 2);
    if (w * h * dpr * dpr > 6.2e6) dpr = Math.max(1, Math.sqrt(6.2e6 / (w * h)));

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = this.opts.host ? '100%' : '';
    this.canvas.style.height = this.opts.host ? '100%' : '';
    this.dpr = dpr;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  /** Population scaled to the area it has to fill, not to a constant. */
  budget() {
    const area = (this.w / this.dpr) * (this.h / this.dpr);
    const n = Math.round(this.opts.count * Math.min(1.25, area / (1440 * 900)));
    return Math.max(24, innerWidth < 700 ? Math.round(n * 0.45) : n);
  }

  seed() {
    const n = this.budget();
    this.motes = Array.from({ length: n }, (_, i) => this.mote(i / n, true));
    if (!this.opts.host) Diag.set('motes', n);
  }

  mote(seed, initial) {
    const d = this.dpr;
    const kind = seed < this.opts.embers ? 'ember'
      : seed < this.opts.embers + this.opts.dust ? 'dust' : 'ash';
    const ember = kind === 'ember';
    const dust = kind === 'dust';

    return {
      kind, ember,
      x: Math.random() * this.w,
      y: initial
        ? Math.random() * this.h
        : this.h + (ember ? Math.random() * this.h * 0.06 : Math.random() * 30 * d),
      r: (ember ? Math.random() * 1.8 + 0.6
        : dust ? Math.random() * 0.9 + 0.25
        : Math.random() * 2.0 + 0.4) * d,
      vy: -(ember ? Math.random() * 0.6 + 0.35
        : dust ? Math.random() * 0.09 + 0.02
        : Math.random() * 0.24 + 0.07) * d * this.opts.speed,
      vx: (Math.random() - 0.5) * 0.24 * d,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: Math.random() * 0.014 + 0.004,
      life: 1,
      // embers die out around the middle, where the fire ends
      fade: ember ? Math.random() * 0.0032 + 0.0016 : 0
    };
  }

  start() {
    if (this.running || REDUCED) return;
    this.running = true;
    /* Capped at 40fps. The motes drift; nothing about them needs to be
       resolved at 120Hz, and on a high-refresh display the old loop was
       doing three times the work for a layer nobody is looking straight
       at. The cap is a floor on the interval, not a timer, so it never
       runs ahead of the display either. */
    const STEP = 1000 / 40;
    let prev = 0;
    const tick = now => {
      if (!this.running) return;
      if (!this.paused && now - prev >= STEP) { prev = now; this.frame(); }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /* Held rather than stopped while the WebGL modal is open — the motes
     keep their positions, so the layer does not jump when it resumes. */
  pause() { this.paused = true; }
  resume() { this.paused = false; }

  frame() {
    const t0 = performance.now();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';

    /* Grouped by species so globalAlpha and the source image change a
       handful of times a frame rather than once per mote. */
    for (const kind of ['dust', 'ash', 'ember']) {
      const sprite = this.sprites[kind];
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        if (m.kind !== kind) continue;

        m.sway += m.swaySpeed;
        m.x += m.vx + Math.sin(m.sway) * 0.35 * this.dpr;
        m.y += m.vy;
        if (m.fade) m.life -= m.fade;

        if (m.y < -20 || m.life <= 0) {
          this.motes[i] = this.mote(m.ember ? 0.1 : 0.9, false);
          continue;
        }

        const a = m.ember ? Math.max(0, m.life) * 0.8
          : m.kind === 'dust' ? 0.10 + 0.05 * Math.sin(m.sway * 1.7)
          : 0.20 + 0.14 * Math.sin(m.sway * 1.7);

        /* The sprite carries the glow, so this is one blit per mote and
           the radius simply scales it. Embers get bigger as they cool,
           which is what a real ember does as its edge goes to smoke. */
        const s = m.r * (m.ember ? 7 + (1 - m.life) * 5 : 5);
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, m.x - s / 2, m.y - s / 2, s, s);
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    /* Adaptive: a run of long frames sheds a tenth of the population,
       down to a floor. A thinner snowfall is a better failure than a
       stuttering one, and nothing else on the page has to know. */
    if (performance.now() - t0 > 9) {
      if (++this.slow > 24 && this.motes.length > 40) {
        this.motes.length = Math.round(this.motes.length * 0.9);
        this.slow = 0;
        if (!this.opts.host) Diag.set('motes', this.motes.length + ' (trimmed)');
      }
    } else if (this.slow > 0) this.slow--;
  }

  destroy() {
    this.stop();
    removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
  }
}

let ashfall = null;

function startAsh() {
  const c = document.getElementById('ash');
  if (!c) return null;
  ashfall = new Ashfall(c);
  return ashfall;
}

/* Held while a WebGL layer is up, so the page never runs two loops. */
function pauseAmbient() { if (ashfall) ashfall.pause(); }
function resumeAmbient() { if (ashfall) ashfall.resume(); }

/* ------------------------------------------------------------
   Reveal on scroll, and the nav underline.
   ------------------------------------------------------------ */
function observeReveals(root = document) {
  const items = [...root.querySelectorAll('.reveal:not(.in)')];
  if (!items.length) return;
  if (REDUCED || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      obs.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  items.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i, 6) * 55}ms`;
    io.observe(el);
  });
}

function watchNav() {
  const links = [...document.querySelectorAll('.nav a')];
  const sections = links
    .map(a => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(a => a.classList.toggle(
        'on', a.getAttribute('href') === '#' + entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  sections.forEach(s => io.observe(s));
}

/* A tiled noise texture for the CRT overlay, generated once and handed to
   CSS as a custom property. Cheaper than shipping a PNG and it cannot go
   missing. */
function mountNoise() {
  const size = 96;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const im = ctx.createImageData(size, size);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 26 + ((Math.random() * 70) | 0);
  }
  ctx.putImageData(im, 0, 0);
  document.documentElement.style.setProperty('--noise', `url(${c.toDataURL('image/png')})`);
}
