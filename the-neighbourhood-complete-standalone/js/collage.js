/* ---------------------------------------------------------------------------
   COLLAGE — the scattered paper layer behind the site.
   Every object is drawn as inline SVG so it stays monochrome-themeable,
   weightless and fully self-contained in the single-file build.
--------------------------------------------------------------------------- */

const Collage = (() => {
  'use strict';

  /* deterministic pseudo-random: chaotic, but the same chaos on every load */
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* an irregular, hand-torn rectangle outline */
  const tornRect = (w, h, rand, bite = 3.2) => {
    const step = 9;
    const points = [];
    const edge = (from, to, count, normal) => {
      for (let i = 0; i < count; i += 1) {
        const k = i / count;
        const x = from[0] + (to[0] - from[0]) * k + normal[0] * (rand() - .5) * bite;
        const y = from[1] + (to[1] - from[1]) * k + normal[1] * (rand() - .5) * bite;
        points.push([x, y]);
      }
    };
    edge([0, 0], [w, 0], Math.max(3, Math.round(w / step)), [0, 1]);
    edge([w, 0], [w, h], Math.max(3, Math.round(h / step)), [1, 0]);
    edge([w, h], [0, h], Math.max(3, Math.round(w / step)), [0, 1]);
    edge([0, h], [0, 0], Math.max(3, Math.round(h / step)), [1, 0]);
    return `M${points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`;
  };

  const starPoints = (cx, cy, outer, inner, rand, jitter = 0) => {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const r = (i % 2 ? inner : outer) + (jitter ? (rand() - .5) * jitter : 0);
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
    }
    return pts.join(' ');
  };

  /* ---- the object catalogue ------------------------------------------- */

  const PIECES = {
    starPink(rand) {
      return `<svg viewBox="0 0 120 120" class="pc pc-star">
        <polygon class="ink-paper" points="${starPoints(60, 60, 56, 23, rand, 3)}"/>
        <polygon class="ink-dark" points="${starPoints(60, 60, 48, 19, rand, 2)}"/>
        <polygon class="ink-blush" points="${starPoints(60, 60, 38, 15, rand, 1)}"/>
      </svg>`;
    },
    starSilver(rand) {
      return `<svg viewBox="0 0 120 120" class="pc pc-star">
        <polygon fill="url(#nb-silver)" filter="url(#nb-grit)" points="${starPoints(60, 60, 54, 21, rand, 3)}"/>
        <polygon class="ink-line" fill="none" stroke-width="2" points="${starPoints(60, 60, 54, 21, rand, 3)}"/>
      </svg>`;
    },
    starOutline(rand) {
      return `<svg viewBox="0 0 120 120" class="pc pc-star">
        <polygon class="ink-line" fill="none" stroke-width="3.5" stroke-linejoin="round" points="${starPoints(60, 60, 50, 20, rand, 5)}"/>
      </svg>`;
    },
    tape(rand) {
      const w = 220, h = 46;
      return `<svg viewBox="0 0 ${w} ${h}" class="pc pc-tape">
        <path class="ink-tape" d="${tornRect(w, h, rand, 5)}"/>
        <path class="ink-tape-line" d="M0 ${h / 2}H${w}" stroke-dasharray="6 7" stroke-width="1"/>
      </svg>`;
    },
    tornNote(rand) {
      const w = 200, h = 96;
      const lines = ['i hate it when you re gone', 'welcome to the neighbourhood', 'all i am is a man', 'inside this place is warm', 'outside it starts to pour'];
      const text = lines[Math.floor(rand() * lines.length)];
      return `<svg viewBox="0 0 ${w} ${h}" class="pc pc-note">
        <path class="ink-paper" filter="url(#nb-grit)" d="${tornRect(w, h, rand, 6)}"/>
        <text class="ink-type" x="18" y="${h / 2 + 5}" font-size="15">${text}</text>
      </svg>`;
    },
    notepaper(rand) {
      const w = 150, h = 180;
      const rows = Array.from({ length: 5 }, (_, i) => `<path class="ink-rule" d="M26 ${44 + i * 26}H${w - 16}"/>`).join('');
      const holes = Array.from({ length: 4 }, (_, i) => `<circle class="ink-hole" cx="14" cy="${34 + i * 38}" r="5"/>`).join('');
      const ticks = ['sweater weather', 'daddy issues', 'empathy', 'softcore', 'afraid']
        .map((t, i) => `<text class="ink-hand" x="30" y="${40 + i * 26}" font-size="12">♡ ${t}</text>`).join('');
      return `<svg viewBox="0 0 ${w} ${h}" class="pc pc-paper">
        <path class="ink-paper" d="${tornRect(w, h, rand, 3)}"/>${rows}${ticks}${holes}
      </svg>`;
    },
    polaroid(rand) {
      const w = 128, h = 152;
      return `<svg viewBox="0 0 ${w} ${h}" class="pc pc-polaroid">
        <rect class="ink-paper" x="0" y="0" width="${w}" height="${h}" rx="1"/>
        <rect class="ink-photo" x="9" y="9" width="${w - 18}" height="${h - 44}"/>
        <rect x="9" y="9" width="${w - 18}" height="${h - 44}" fill="url(#nb-silver)" opacity=".35" filter="url(#nb-grit)"/>
        <path class="ink-line" fill="none" stroke-width="2" d="M22 ${h - 52}l24-26 20 20 16-14 24 20"/>
        <circle class="ink-line" fill="none" stroke-width="2" cx="94" cy="30" r="7"/>
        <text class="ink-hand" x="${w / 2}" y="${h - 13}" font-size="12" text-anchor="middle">♡ ♡ ♡</text>
      </svg>`;
    },
    vinyl() {
      return `<svg viewBox="0 0 140 140" class="pc pc-vinyl">
        <circle class="ink-dark" cx="70" cy="70" r="66"/>
        <g class="ink-groove" fill="none" stroke-width="1">
          ${[58, 50, 42, 34].map(r => `<circle cx="70" cy="70" r="${r}"/>`).join('')}
        </g>
        <circle class="ink-paper" cx="70" cy="70" r="22"/>
        <circle class="ink-dark" cx="70" cy="70" r="4"/>
        <path class="ink-groove" fill="none" stroke-width="1" d="M70 8a62 62 0 0 1 44 18"/>
      </svg>`;
    },
    moon() {
      return `<svg viewBox="0 0 140 140" class="pc pc-moon">
        <circle class="ink-paper" cx="70" cy="70" r="64" filter="url(#nb-grit)"/>
        <g class="ink-crater">
          <circle cx="48" cy="52" r="13"/><circle cx="92" cy="44" r="8"/>
          <circle cx="84" cy="92" r="16"/><circle cx="46" cy="98" r="7"/>
          <circle cx="66" cy="70" r="5"/>
        </g>
      </svg>`;
    },
    house() {
      return `<svg viewBox="0 0 140 140" class="pc pc-house">
        <g class="ink-line" fill="none" stroke-width="6" stroke-linejoin="miter">
          <path d="M22 20h96v56H22z"/>
          <path d="M40 34h22v28H40z"/>
          <path d="M80 34h22v28H80z"/><path d="M91 34v28M80 48h22"/>
          <path d="M22 76h96l-48 46z"/>
          <path d="M96 96v26h14V82"/>
        </g>
      </svg>`;
    },
    bow() {
      return `<svg viewBox="0 0 160 110" class="pc pc-bow">
        <path class="ink-dark" d="M78 52c-16-26-58-34-64-8-5 22 30 32 64 8z"/>
        <path class="ink-dark" d="M82 52c16-26 58-34 64-8 5 22-30 32-64 8z"/>
        <path class="ink-dark" d="M72 56c-10 16-16 34-14 48 12-4 22-20 26-38z"/>
        <path class="ink-dark" d="M88 56c10 16 16 34 14 48-12-4-22-20-26-38z"/>
        <ellipse class="ink-dark" cx="80" cy="53" rx="13" ry="11"/>
        <path class="ink-sheen" fill="none" stroke-width="2" d="M30 40c14 4 26 10 34 16M130 40c-14 4-26 10-34 16"/>
      </svg>`;
    },
    heartPatch() {
      return `<svg viewBox="0 0 140 130" class="pc pc-heart">
        <path class="ink-dark" d="M70 122C22 88 8 64 8 44 8 24 24 10 42 10c12 0 22 6 28 16 6-10 16-16 28-16 18 0 34 14 34 34 0 20-14 44-62 78z"/>
        <path class="ink-stitch" fill="none" stroke-width="2" stroke-dasharray="6 6" d="M70 112C28 82 16 62 16 45 16 29 29 18 43 18c11 0 20 6 27 16 7-10 16-16 27-16 14 0 27 11 27 27 0 17-12 37-54 67z"/>
        <g class="ink-face" stroke-width="4" stroke-linecap="round">
          <path d="M46 46l12 12M58 46L46 58"/><path d="M82 46l12 12M94 46L82 58"/>
          <path class="ink-face" fill="none" d="M52 84c10-10 26-10 36 0"/>
        </g>
      </svg>`;
    },
    lips() {
      return `<svg viewBox="0 0 160 100" class="pc pc-lips">
        <path class="ink-blush" filter="url(#nb-grit)" d="M80 34c14-20 44-26 60-14 12 9 8 26-6 40-16 16-38 28-54 28s-38-12-54-28C12 46 8 29 20 20c16-12 46-6 60 14z"/>
        <path class="ink-lipline" fill="none" stroke-width="2" d="M20 32c20 6 40 8 60 8s40-2 60-8"/>
      </svg>`;
    },
    ransom(rand) {
      const words = ['NBHD', 'VOID', 'LOVE', 'NOIR', 'STAY'];
      const word = words[Math.floor(rand() * words.length)];
      const tileW = 34;
      const tiles = [...word].map((ch, i) => {
        const dark = rand() > .5;
        const rot = (rand() - .5) * 16;
        return `<g transform="translate(${i * (tileW + 3)} ${(rand() - .5) * 8}) rotate(${rot.toFixed(1)} ${tileW / 2} 20)">
          <rect class="${dark ? 'ink-dark' : 'ink-paper'}" width="${tileW}" height="40"/>
          <text class="${dark ? 'ink-cut-light' : 'ink-cut-dark'}" x="${tileW / 2}" y="30" font-size="26" text-anchor="middle">${ch}</text>
        </g>`;
      }).join('');
      return `<svg viewBox="0 0 ${word.length * (tileW + 3)} 52" class="pc pc-ransom">${tiles}</svg>`;
    },
    scribble(rand) {
      let d = 'M8 60';
      for (let i = 1; i <= 6; i += 1) {
        d += ` q ${18 + rand() * 12} ${i % 2 ? -46 : 46} ${30 + rand() * 8} 0`;
      }
      return `<svg viewBox="0 0 220 120" class="pc pc-scribble">
        <path class="ink-line" fill="none" stroke-width="2.5" stroke-linecap="round" d="${d}"/>
      </svg>`;
    },
    musicNote() {
      return `<svg viewBox="0 0 90 120" class="pc pc-mnote">
        <path class="ink-dark" d="M36 14l44-10v18L36 32z"/>
        <path class="ink-dark" d="M30 18h6v72h-6zM74 8h6v62h-6z"/>
        <ellipse class="ink-dark" cx="18" cy="92" rx="19" ry="14" transform="rotate(-16 18 92)"/>
        <ellipse class="ink-dark" cx="62" cy="72" rx="19" ry="14" transform="rotate(-16 62 72)"/>
      </svg>`;
    },
    filmstrip() {
      const holes = Array.from({ length: 7 }, (_, i) => `<rect class="ink-paper" x="${10 + i * 26}" y="7" width="14" height="10" rx="2"/><rect class="ink-paper" x="${10 + i * 26}" y="73" width="14" height="10" rx="2"/>`).join('');
      return `<svg viewBox="0 0 200 90" class="pc pc-film">
        <rect class="ink-dark" width="200" height="90"/>
        ${holes}
        <rect x="10" y="24" width="180" height="42" fill="url(#nb-silver)" opacity=".4" filter="url(#nb-grit)"/>
      </svg>`;
    },
    barcode(rand) {
      const bars = Array.from({ length: 26 }, (_, i) => {
        const w = 1 + Math.round(rand() * 3);
        return `<rect class="ink-dark" x="${i * 6}" y="0" width="${w}" height="${58 + rand() * 10}"/>`;
      }).join('');
      return `<svg viewBox="0 0 160 76" class="pc pc-barcode">${bars}
        <text class="ink-type" x="0" y="74" font-size="11">0 000000 000212</text></svg>`;
    },
    clip() {
      return `<svg viewBox="0 0 90 100" class="pc pc-clip">
        <path class="ink-dark" d="M14 30h62v54H14z"/>
        <path class="ink-line" fill="none" stroke-width="4" d="M26 30V14c0-6 6-10 19-10s19 4 19 10v16"/>
        <path class="ink-sheen" fill="none" stroke-width="2" d="M22 38h46"/>
      </svg>`;
    },
    palmCircle() {
      return `<svg viewBox="0 0 140 140" class="pc pc-palm">
        <circle class="ink-paper" cx="70" cy="70" r="64"/>
        <path class="ink-dark" d="M70 6a64 64 0 0 1 0 128z" opacity=".08"/>
        <g class="ink-cut-dark">
          <path d="M70 42c-13 0-24 7-28 17 7-6 16-9 24-8-9 3-16 9-19 17 7-7 16-10 25-9-8 5-13 12-15 20h13c1-13 6-24 14-31 8 7 13 18 14 31h13c-2-8-7-15-15-20 9-1 18 2 25 9-3-8-10-14-19-17 8-1 17 2 24 8-4-10-15-17-28-17z"/>
          <path d="M20 96c9-6 18-6 25 0 7-6 16-6 25 0 9-6 18-6 25 0 7-6 16-6 25 0v9c-9-6-18-6-25 0-7-6-16-6-25 0-9-6-18-6-25 0-7-6-16-6-25 0z"/>
          <path d="M92 30c4-4 9-6 14-6-4 3-7 7-8 12z"/>
        </g>
      </svg>`;
    },
    monoSplit() {
      return `<svg viewBox="0 0 140 140" class="pc pc-mono">
        <circle class="ink-dark" cx="70" cy="70" r="64"/>
        <path class="ink-paper" d="M70 6a64 64 0 0 1 0 128z"/>
        <circle class="ink-line" fill="none" stroke-width="2" cx="70" cy="70" r="64"/>
        <text class="ink-cut-light" x="38" y="78" font-size="17" text-anchor="middle">000</text>
        <text class="ink-cut-dark" x="102" y="78" font-size="17" text-anchor="middle">FFF</text>
      </svg>`;
    },
    starShot(rand) {
      /* the star lifted out of the overlay clip, drawn back as a paper cut-out */
      const r = () => (rand() - .5) * 2.4;
      return `<svg viewBox="0 0 130 130" class="pc pc-starshot">
        <defs><radialGradient id="nb-halo-${Math.floor(rand() * 1e6)}" cx=".5" cy=".5" r=".5">
          <stop offset=".38" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient></defs>
        <polygon class="ink-paper" points="${starPoints(65, 66, 50 + r(), 20 + r(), rand, 2)}"/>
        <polygon class="ink-line" fill="none" stroke-width="1.5" opacity=".5" points="${starPoints(65, 66, 56, 23, rand, 4)}"/>
      </svg>`;
    },
    stamp() {
      return `<svg viewBox="0 0 130 130" class="pc pc-stamp">
        <circle class="ink-line" fill="none" stroke-width="3" cx="65" cy="65" r="58"/>
        <circle class="ink-line" fill="none" stroke-width="1.5" cx="65" cy="65" r="49"/>
        <text class="ink-cut-dark" x="65" y="58" font-size="20" text-anchor="middle">EST.</text>
        <text class="ink-cut-dark" x="65" y="84" font-size="26" text-anchor="middle">2011</text>
      </svg>`;
    }
  };

  /* ---- shared SVG defs -------------------------------------------------- */

  const DEFS = `<svg class="collage-defs" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="nb-silver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f2f2f4"/><stop offset=".38" stop-color="#9a9aa2"/>
      <stop offset=".62" stop-color="#e6e6ea"/><stop offset="1" stop-color="#77777f"/>
    </linearGradient>
    <filter id="nb-grit"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/>
      <feComposite in2="SourceGraphic" operator="in" result="grain"/>
      <feBlend in="SourceGraphic" in2="grain" mode="multiply"/></filter>
  </defs></svg>`;

  /* ---- scatter ---------------------------------------------------------- */

  const SETS = {
    dark: ['starPink', 'starSilver', 'starOutline', 'starShot', 'tape', 'tornNote', 'polaroid', 'vinyl', 'moon', 'house', 'palmCircle', 'monoSplit', 'bow', 'heartPatch', 'ransom', 'scribble', 'musicNote', 'filmstrip', 'stamp', 'lips'],
    paper: ['starOutline', 'starPink', 'tape', 'tornNote', 'notepaper', 'polaroid', 'vinyl', 'house', 'palmCircle', 'monoSplit', 'bow', 'ransom', 'scribble', 'musicNote', 'barcode', 'clip', 'stamp'],
    sparse: ['starOutline', 'tape', 'scribble', 'starSilver', 'musicNote']
  };

  const SIZES = {
    starPink: [58, 128], starSilver: [46, 104], starOutline: [34, 84], tape: [150, 300],
    tornNote: [140, 240], notepaper: [110, 175], polaroid: [96, 180], vinyl: [80, 165],
    moon: [78, 160], house: [70, 145], bow: [90, 175], heartPatch: [70, 140],
    palmCircle: [64, 132], monoSplit: [58, 118], starShot: [44, 116],
    lips: [78, 150], ransom: [96, 190], scribble: [120, 240], musicNote: [44, 92],
    filmstrip: [130, 240], barcode: [90, 165], clip: [46, 92], stamp: [70, 130]
  };

  function place(host, options) {
    const set = SETS[options.set] || SETS.dark;
    const rand = rng(options.seed);
    const layer = document.createElement('div');
    layer.className = 'debris';
    layer.setAttribute('aria-hidden', 'true');

    const placed = [];
    const total = options.count;
    let guard = 0;

    while (placed.length < total && guard < total * 40) {
      guard += 1;
      const x = rand();
      const y = rand();
      /* keep the middle of the section readable */
      const dx = (x - .5) / (options.keepout?.[0] ?? .40);
      const dy = (y - .5) / (options.keepout?.[1] ?? .40);
      if (dx * dx + dy * dy < 1) continue;
      /* no clumping */
      if (placed.some(p => Math.hypot((p.x - x) * 2.1, p.y - y) < .16)) continue;
      placed.push({ x, y, r: rand(), s: rand(), o: rand(), t: rand() });
    }

    layer.innerHTML = placed.map((p, index) => {
      const name = set[Math.floor(p.s * set.length) % set.length];
      const [min, max] = SIZES[name] || [70, 140];
      const size = min + p.r * (max - min);
      const rot = (p.o - .5) * (options.spin ?? 46);
      const depth = .12 + p.t * .9;
      const opacity = (options.opacity?.[0] ?? .2) + p.o * ((options.opacity?.[1] ?? .5) - (options.opacity?.[0] ?? .2));
      return `<div class="debris-piece" style="
        left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%;
        width:${size.toFixed(0)}px;opacity:${opacity.toFixed(3)};
        --rot:${rot.toFixed(1)}deg;--depth:${depth.toFixed(2)};
        --float:${(7 + p.t * 11).toFixed(1)}s;--delay:-${(p.s * 9).toFixed(1)}s;
        z-index:${Math.round(depth * 5)}">${PIECES[name](rng(options.seed + index * 977))}</div>`;
    }).join('');

    host.appendChild(layer);
    return layer;
  }

  /* ---- parallax --------------------------------------------------------- */

  function parallax(layers) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let ticking = false;
    const frame = () => {
      const centre = window.innerHeight / 2;
      layers.forEach(layer => {
        const box = layer.getBoundingClientRect();
        if (box.bottom < -300 || box.top > window.innerHeight + 300) return;
        const shift = ((box.top + box.height / 2) - centre) / window.innerHeight;
        layer.style.setProperty('--shift', `${(shift * -34).toFixed(2)}px`);
      });
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    frame();
  }

  function build() {
    document.body.insertAdjacentHTML('afterbegin', DEFS);
    const hosts = [...document.querySelectorAll('[data-debris]')];
    const layers = [];

    const fill = (host, index) => {
      if (host.dataset.debrisBuilt) return;
      host.dataset.debrisBuilt = '1';
      const [set, count] = host.dataset.debris.split(':');
      layers.push(place(host, {
        set,
        count: Number(count) || 10,
        seed: 1471 + index * 7919,
        opacity: set === 'paper' ? [.14, .40] : [.18, .55],
        keepout: host.dataset.keepout ? host.dataset.keepout.split(',').map(Number) : undefined,
        spin: Number(host.dataset.spin) || 46
      }));
    };

    if (!('IntersectionObserver' in window)) {
      hosts.forEach(fill);
      parallax(layers);
      return;
    }

    /* what is on screen now is built now; the rest arrives before it is seen */
    const observer = new IntersectionObserver((entries, self) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        fill(entry.target, hosts.indexOf(entry.target));
        self.unobserve(entry.target);
      });
    }, { rootMargin: '900px 0px' });
    hosts.forEach(host => observer.observe(host));
    parallax(layers);
  }

  return { build, PIECES, place, seeded: rng };
})();
