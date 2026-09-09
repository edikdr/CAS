/* ============================================================
   The collage layer.

   assets/cut/ is the supplied artwork with its paper background taken
   off: 72 stickers, patches, masks and wordmarks, each one already
   alpha-keyed (tools/cut_assets.py does the cutting). This file is what
   puts them on the page.

   Three rules run the whole thing.

   IT NEVER TOUCHES THE READING COLUMN. Every piece is placed in the
   left or right margin, outside the band the body copy occupies, and the
   band is measured rather than guessed — so the collage thins out by
   itself on a narrow screen instead of ending up behind a paragraph.

   IT IS THE SAME COLLAGE EVERY TIME. Placement runs off a seeded
   generator, not Math.random. A background that rearranges itself on
   every reload reads as the page being unsure of itself; one that is
   always the same reads as artwork.

   IT PARALLAXES IN FOUR PLANES, NOT NINETY-SIX. Each piece belongs to
   one depth group, and scrolling moves four wrapper elements. That is
   four transforms per frame no matter how many pieces are up.

   NOTHING IS PLACED ON TOP OF ANYTHING ELSE. Positions are drawn from
   the seeded generator, but a candidate that would overlap a piece
   already down is rejected and another is drawn — up to a dozen tries,
   after which that piece is dropped rather than stacked. Overlapping
   stickers read as a mistake, not as a pile.
   ============================================================ */

const Collage = {
  layer: null,
  planes: [],
  pieces: 0,

  /* FOUR PLANES, AND ONE OF THEM IS ALLOWED BEHIND THE WORDS.

     The first three live in the margins and get progressively larger,
     sharper and faster as they come forward. `deep` is the new one and
     it breaks the margin rule on purpose: it spans the full width,
     including the reading column, at an opacity and a blur where it
     reads as texture in the paper rather than as a picture behind a
     paragraph. That is what stops the middle of the page being an empty
     black strip between two decorated edges.

     `drift` is multiplied by the scroll offset. */
  PLANES: [
    { key: 'deep', drift: -0.014, soft: true,  op: 0.15, scale: [0.75, 1.6], full: true },
    { key: 'far',  drift: -0.032, soft: true,  op: 0.42, scale: [0.34, 0.62] },
    { key: 'mid',  drift: -0.064, soft: false, op: 0.60, scale: [0.55, 0.95] },
    { key: 'near', drift: -0.108, soft: false, op: 0.78, scale: [0.85, 1.45] }
  ],

  async init() {
    this.layer = document.getElementById('collage');
    if (!this.layer) return;

    let items;
    try {
      const r = await fetch('assets/cut/manifest.json');
      if (!r.ok) throw new Error('manifest ' + r.status);
      items = await r.json();
    } catch (e) {
      /* Opened from file:// or the folder was deployed without its
         manifest. The page is fully readable without any of this. */
      Diag.note('collage.manifest', e);
      return;
    }
    if (!Array.isArray(items) || !items.length) return;

    this.build(items);
    this.watch();
    Diag.set('collage', `${this.pieces} pieces / ${this.planes.length} planes`);
  },

  /* ----------------------------------------------------------
     Deterministic noise — the same generator the bone frame uses.
     ---------------------------------------------------------- */
  rand(seed) {
    let t = (seed + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  /**
   * How much room there is beside the reading column, as a fraction of
   * the viewport, and how many pieces that is worth.
   *
   * .section is capped at --wrap and centred, so the margin is whatever
   * is left over on each side. Below about 60px of it there is nowhere to
   * put a sticker that is not also behind a sentence, and the collage
   * stands down rather than getting in the way.
   */
  margins() {
    const probe = document.querySelector('.section') || document.body;
    const colW = probe.getBoundingClientRect().width;
    const pad = parseFloat(getComputedStyle(probe).paddingLeft) || 0;
    const free = (innerWidth - (colW - pad * 2)) / 2;
    return { free, band: Math.max(0, free / innerWidth) };
  },

  build(items) {
    const { free, band } = this.margins();
    /* A phone has no margin, so the margin planes stand down — but the
       deep plane does not need one, and a page with no artwork on it at
       all is not what was asked for. Below the threshold the collage
       runs on `deep` alone. */
    const narrow = free < 62;

    /* Kinds are weighted rather than shuffled flat. The big skulls and
       masks are the anchors and want to be rare; the small glyphs are
       filler and want to be common. */
    const by = k => items.filter(i => i.kind === k);
    const pools = [
      { rows: by('skull'), weight: 1, size: 1.35 },
      { rows: by('relic'), weight: 1, size: 1.15 },
      { rows: by('mark'),  weight: 2, size: 1.00 },
      { rows: by('icon'),  weight: 4, size: 0.80 }
    ].filter(p => p.rows.length);
    if (!pools.length) return;

    const bag = [];
    pools.forEach(p => { for (let i = 0; i < p.weight; i++) bag.push(p); });

    /* Density follows the page, not the window: a long page gets more
       pieces so the spacing stays even from top to bottom. */
    const pageH = Math.max(document.body.scrollHeight, innerHeight);
    const budget = narrow
      ? Math.min(22, Math.round((pageH / innerHeight) * 2.6))
      : Math.min(96, Math.round((pageH / innerHeight) * 11 * Math.min(1, free / 170)));

    /* Every rectangle already committed, in layer pixels, so a candidate
       can be tested against them. Planes share one list on purpose: a
       near piece sitting exactly over a deep one looks like a stacking
       error even though they are at different depths. */
    const taken = [];
    const clashes = (x, y, w, h) => {
      /* A margin, so pieces are not merely non-overlapping but visibly
         apart. Proportional to the piece, so small glyphs can sit closer
         together than a hoodie can. */
      const m = Math.max(14, Math.min(w, h) * 0.22);
      for (let k = 0; k < taken.length; k++) {
        const r = taken[k];
        if (x - m < r.x + r.w && x + w + m > r.x &&
            y - m < r.y + r.h && y + h + m > r.y) return true;
      }
      return false;
    };

    const layerW = innerWidth;
    const layerH = pageH;

    const frag = document.createDocumentFragment();
    this.planes = this.PLANES.filter(cfg => cfg.full || !narrow).map(cfg => {
      const el = document.createElement('div');
      el.className = 'collage-plane';
      el.dataset.drift = String(cfg.drift);
      frag.appendChild(el);
      return { cfg, el };
    });

    for (let n = 0; n < budget; n++) {
      const r = i => this.rand(n * 7919 + i * 104729);

      const plane = this.planes[Math.floor(r(1) * this.planes.length)];
      const pool = bag[Math.floor(r(2) * bag.length)];
      const item = pool.rows[Math.floor(r(3) * pool.rows.length)];

      const [lo, hi] = plane.cfg.scale;
      /* Width comes from the artwork's own, so a wordmark stays a
         wordmark and a skull stays a skull. Margin pieces are capped to
         the gutter they live in; deep ones are not, because they are
         meant to be larger than the column and read as scenery. */
      const raw = item.w * 0.52 * pool.size * (lo + r(4) * (hi - lo));
      const w = plane.cfg.full ? Math.min(innerWidth * 0.34, raw * 1.5)
                               : Math.min(free * 1.18, raw);
      const h = w * (item.h / Math.max(1, item.w));

      /* Up to a dozen seeded attempts at somewhere this fits. The band
         a piece may be placed in is the same either way — the tries
         only move it within that band. */
      let x = 0, y = 0, placed = false;
      for (let attempt = 0; attempt < 12 && !placed; attempt++) {
        const a = j => this.rand(n * 7919 + attempt * 31337 + j * 104729);

        let fx;
        if (plane.cfg.full) {
          /* The deep plane uses the whole width. Pieces are still pushed
             away from dead centre — a wordmark sitting exactly behind a
             column of text is legible enough to fight it, one drifting
             past the shoulder is not. */
          const side = a(5) > 0.5 ? 1 : -1;
          fx = 0.5 + side * (0.08 + a(6) * 0.44);
        } else {
          const into = (0.06 + a(6) * 0.78) * band;
          fx = a(5) > 0.5 ? (1 - into) : into;
        }

        /* Spread down the page by index, so the density is even top to
           bottom, with the attempt allowed to slide it within its slot. */
        const fy = 0.012 + ((n + a(7) * 0.9) / budget) * 0.975;

        x = fx * layerW - w / 2;
        y = fy * layerH;
        if (!clashes(x, y, w, h)) placed = true;
      }
      /* Twelve misses means this band is full. Dropping the piece is the
         right answer; stacking it is not. */
      if (!placed) continue;

      taken.push({ x, y, w, h });

      const el = document.createElement('img');
      /* THE FAR PLANES LOAD A DIFFERENT FILE, THEY ARE NOT BLURRED HERE.

         These planes used to carry `filter: blur()`. Measured on a
         1440x900 window it took the page from 44fps to 13 — a CSS blur
         on a layer the size of the document is re-rasterised on every
         composite, and the parallax composites on every scroll frame.

         So the softness is baked: assets/cut/soft/ holds each piece at
         half resolution with the blur already in it, and the browser
         upsamples it back to the display width, which softens it again
         for nothing. Same depth cue, no per-frame cost, and the files
         are a fifth of the size of the sharp ones. */
      el.src = (plane.cfg.soft && item.soft) ? item.soft : item.src;
      el.alt = '';
      el.loading = 'lazy';
      el.decoding = 'async';
      /* Intrinsic size on the element itself. Without it the browser has
         no aspect ratio until the bitmap lands, so every arrival is a
         layout change inside a promoted layer — which is a re-raster of
         that whole layer. With it, the box is right from the first
         frame and the image just fills it. */
      el.width = Math.round(w);
      el.height = Math.round(h);
      el.className = 'collage-piece';

      el.style.cssText =
        `left:${(x / layerW * 100).toFixed(3)}%;` +
        `top:${(y / layerH * 100).toFixed(3)}%;` +
        `width:${w.toFixed(0)}px;` +
        `opacity:${(plane.cfg.op * (0.74 + r(8) * 0.5)).toFixed(3)};` +
        `--rot:${((r(9) * 2 - 1) * 15).toFixed(1)}deg;` +
        `--sway:${(7 + r(10) * 9).toFixed(1)}s;` +
        `animation-delay:${(-r(11) * 12).toFixed(1)}s`;

      plane.el.appendChild(el);
      this.pieces++;
    }

    this.layer.appendChild(frag);
  },

  /* ----------------------------------------------------------
     Parallax.

     One rAF, coalesced: scroll fires far more often than the screen
     redraws, and moving three elements once per frame is the whole
     budget this effect gets.
     ---------------------------------------------------------- */
  watch() {
    if (REDUCED || !this.planes.length) return;

    let queued = false;
    let last = null;
    const paint = () => {
      queued = false;
      const y = scrollY;
      /* Rounded to the pixel and compared against the last value. A
         sub-pixel transform forces the compositor to resample the whole
         layer, and a scroll of zero pixels — which fires plenty, from
         inertia and from the address bar — forces it for nothing. */
      if (y === last) return;
      last = y;
      for (let i = 0; i < this.planes.length; i++) {
        const p = this.planes[i];
        p.el.style.transform = `translate3d(0,${Math.round(y * p.cfg.drift)}px,0)`;
      }
    };
    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    }, { passive: true });
    paint();
  }
};
