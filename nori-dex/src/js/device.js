/* ==========================================================================
   The Mana Communicator: body art and the attunement.

   • Two layouts share one DOM: 'wide' (1200 x 848 design px, 768 x 432 screen) and
     'tall' for phones in portrait (400 x 920 design px, 368 x 404 screen). The layout
     is set on <html data-layout> by app.js -> fit(); CSS places everything per layout.
   • build() draws the body art for the current layout as one static SVG: silhouette,
     enamel, brass rim, corner filigree, 16 engraved runes and the mana veins that run
     from the relic slot up to the crest. Nothing in it animates unless attuning.
   • It also draws both grips (the interchangeable controller halves): carved enamel with
     stacked thickness, brass trim, a rail strip on the inner edge, screws and engraved
     feathers. Grip colours are CSS variables on each grip (--gh --gm --gl --gt), so a
     grip set is swapped by changing variables, and a cloned grip keeps its old colours.
   • attune(color) is the device's big moment: when a relic seats, mana runs up the veins
     from the slot, the runes light one after another and the crest crystal flares in the
     relic's colour. theme(color) keeps that colour on the device afterwards.
   API: PL.device.build(layout), theme(color|null), attune(color) -> Promise, layout(), wingArt(side)
   ========================================================================== */
window.PL = window.PL || {};

PL.device = (function () {
  var svg = document.getElementById('bodyArt');
  var bodyEl = document.getElementById('deviceBody');
  var root = document.documentElement;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var current = null, veins = [], runes = [], attuneTimer = 0;

  var L = {
    wide: {
      w: 860, h: 510, r: 16,
      glass: [22, 22, 816, 466],
      crest: [280, 580], port: 640, slot: 430,
      wing: { w: 170, h: 510 },
      runes: function () {   // top and bottom margins around the glass, clear of crest, socket, maker's plate and slot
        var out = [];
        [60, 104, 148, 192, 694, 738, 782, 826].forEach(function (x) { out.push([x, 11]); });
        [520, 564, 608, 652, 696, 740, 784, 828].forEach(function (x) { out.push([x, 499]); });
        return out;
      },
      veins: function () {
        return [
          'M430 510V499H30Q11 499 11 480V30Q11 11 30 11H280',
          'M430 510V499H830Q849 499 849 480V30Q849 11 830 11H580',
        ];
      },
    },
    tall: {
      w: 392, h: 620, r: 34,
      glass: [8, 26, 376, 412],
      crest: [76, 316], port: 300, slot: 196,
      wing: { w: 184, h: 146 },
      bays: [[6, 442, 188, 152], [198, 442, 188, 152]],
      runes: function () {
        var out = [];
        for (var i = 0; i < 16; i++) out.push([22 + i * 23.2, 445]);
        return out;
      },
      veins: function () {
        return [
          'M196 620V600Q196 452 180 445H12Q4 445 4 437V36Q4 18 22 18H76',
          'M196 620V600Q196 452 212 445H380Q388 445 388 437V36Q388 18 370 18H316',
        ];
      },
    },
  };

  function rr(x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) +
      'V' + (y + h - r) + 'Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - r) + ' ' + (y + h) +
      'H' + (x + r) + 'Q' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - r) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Z';
  }

  /* corner filigree: a brass scroll, mirrored into each corner */
  function scroll(x, y, sx, sy) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + sx + ' ' + sy + ')">' +
      '<path d="M8 40C8 20 20 8 40 8M14 46C14 28 28 14 46 14" />' +
      '<path d="M40 8C52 8 58 16 54 24 51 30 43 29 43 23 43 19 47 18 49 20" />' +
      '<path d="M8 40C8 52 16 58 24 54 30 51 29 43 23 43 19 43 18 47 20 49" /></g>';
  }

  function build(layout) {
    if (!svg) return;
    var g = L[layout] || L.wide;
    current = layout;
    var w = g.w, h = g.h, gl = g.glass, i;
    var runeMarkup = g.runes().map(function (p, k) {
      return '<use href="#rn' + ((k * 5 + 3) % 12) + '" class="dv-rune" style="--i:' + k + '" x="' + (p[0] - 4) + '" y="' + (p[1] - 6.4) + '" width="8" height="12.8"/>';
    }).join('');
    var veinPaths = g.veins();
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.innerHTML =
      '<defs>' +
        '<linearGradient id="dvEnamel" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#1d2c58"/><stop offset=".55" stop-color="#132049"/><stop offset="1" stop-color="#0b1533"/></linearGradient>' +
        '<linearGradient id="dvBrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e19a"/><stop offset=".4" stop-color="#d4a341"/><stop offset="1" stop-color="#8a5c1a"/></linearGradient>' +
        '<filter id="dvGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="5"/><feColorMatrix type="saturate" values="0"/></filter>' +
        '<clipPath id="dvClip"><path d="' + rr(0, 0, w, h, g.r) + '"/></clipPath>' +
      '</defs>' +
      '<path d="' + rr(0, 0, w, h, g.r) + '" fill="url(#dvEnamel)"/>' +
      '<g clip-path="url(#dvClip)"><rect width="' + w + '" height="' + h + '" filter="url(#dvGrain)" opacity=".16" style="mix-blend-mode:overlay"/>' +
        '<path d="M0 ' + (h * 0.62) + 'Q' + (w / 2) + ' ' + (h * 0.48) + ' ' + w + ' ' + (h * 0.62) + 'V' + h + 'H0Z" fill="#000" opacity=".12"/></g>' +
      /* brass rim and the engraved inner groove */
      '<path d="' + rr(3, 3, w - 6, h - 6, Math.max(4, g.r - 3)) + '" fill="none" stroke="url(#dvBrass)" stroke-width="5"/>' +
      (layout === 'tall' ? '<path d="' + rr(12, 12, w - 24, h - 24, g.r - 10) + '" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="1.6"/>' +
        '<path d="' + rr(13, 13, w - 26, h - 26, g.r - 11) + '" fill="none" stroke="#E8B93A" stroke-opacity=".22" stroke-width=".8"/>' : '') +
      /* side rails the grips slide on (desktop) */
      (layout === 'wide' ? '<path d="M2 26V484M' + (w - 2) + ' 26V484" stroke="#03060f" stroke-width="5"/><path d="M4.5 30V480M' + (w - 4.5) + ' 30V480" stroke="url(#dvBrass)" stroke-width="1.4" opacity=".8"/>' : '') +
      /* brass bezel around the glass */
      '<path d="' + rr(gl[0] - 6, gl[1] - 6, gl[2] + 12, gl[3] + 12, 18) + '" fill="#070b18" stroke="url(#dvBrass)" stroke-width="3"/>' +
      /* corner filigree (the desktop body is nearly all glass: its filigree lives on the grips) */
      (layout === 'tall' ? '<g class="dv-filigree" fill="none" stroke="url(#dvBrass)" stroke-width="2.2" stroke-linecap="round" opacity=".85">' +
        scroll(10, 10, 1, 1) + scroll(w - 10, 10, -1, 1) + '</g>' : '') +
      /* phone: recessed bays the grips slide into, with brass rails along their edges */
      (g.bays || []).map(function (b) {
        return '<path d="' + rr(b[0], b[1], b[2], b[3], 24) + '" fill="#050913" stroke="#000" stroke-opacity=".6" stroke-width="2"/>' +
          '<path d="M' + (b[0] + 18) + ' ' + (b[1] + 3) + 'H' + (b[0] + b[2] - 18) + 'M' + (b[0] + 18) + ' ' + (b[1] + b[3] - 3) + 'H' + (b[0] + b[2] - 18) + '" stroke="url(#dvBrass)" stroke-width="2" opacity=".7"/>';
      }).join('') +
      /* mana veins: an engraved groove, and the light that runs through it while attuning */
      '<g class="dv-veins" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        veinPaths.map(function (d) { return '<path class="dv-groove" d="' + d + '"/>'; }).join('') +
        veinPaths.map(function (d) { return '<path class="dv-light" d="' + d + '"/>'; }).join('') + '</g>' +
      /* runes engraved around the glass */
      '<g class="dv-runes" fill="none" stroke-linecap="round" stroke-linejoin="round">' + runeMarkup + '</g>';
    veins = Array.prototype.slice.call(svg.querySelectorAll('.dv-light'));
    veins.forEach(function (p) {
      var len = p.getTotalLength ? Math.ceil(p.getTotalLength()) : 2000;
      p.style.setProperty('--len', len);
    });
    runes = Array.prototype.slice.call(svg.querySelectorAll('.dv-rune'));
    for (i = 0; i < runes.length; i++) runes[i].style.setProperty('--n', runes.length);
    buildWings(layout);
  }

  /* ---------- grips ---------- */
  /* silhouettes; the inner edge (rail side) is straight, the outer edge a carved double curve */
  function wingPath(layout) {
    if (layout === 'tall') return 'M184 0H26Q0 0 0 26V106Q0 146 40 146H184Z';
    return 'M170 0H72Q14 0 9 62Q4 150 20 255Q4 360 9 448Q14 510 72 510H170Z';
  }
  function wingArt(side, layout) {
    var g = L[layout] || L.wide, W = g.wing.w, H = g.wing.h, P = wingPath(layout), tall = layout === 'tall';
    var flip = side === 'r' ? ' transform="translate(' + W + ' 0) scale(-1 1)"' : '';
    var dark = function (k) { return 'fill:color-mix(in srgb, var(--gl) ' + k + '%, #000)'; };
    var screws = tall ? [[24, 22], [24, 124], [168, 18], [168, 128]] : [[46, 48], [46, 462], [150, 26], [150, 484]];
    var feathers = tall
      ? '<path d="M14 36Q6 73 14 110M24 44Q18 73 24 102"/>'
      : '<path d="M24 120Q12 190 30 255M36 140Q26 195 40 250M24 390Q12 320 30 255M36 370Q26 315 40 260"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + (H + 14) + '" width="' + W + '" height="' + (H + 14) + '" aria-hidden="true">' +
      '<defs><linearGradient id="wgSheen" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".35" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>' +
      '<linearGradient id="wgBrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e19a"/><stop offset=".45" stop-color="#d4a341"/><stop offset="1" stop-color="#7d5216"/></linearGradient>' +
      '<clipPath id="wgClip-' + layout + '"><path d="' + P + '"/></clipPath></defs>' +
      '<g' + flip + '>' +
        /* thickness: the silhouette stacked downwards in darker tones, then a soft contact shadow */
        '<path d="' + P + '" transform="translate(0 13)" fill="#000" opacity=".28"/>' +
        '<path d="' + P + '" transform="translate(0 9)" style="' + dark(45) + '"/>' +
        '<path d="' + P + '" transform="translate(0 6)" style="' + dark(65) + '"/>' +
        '<path d="' + P + '" transform="translate(0 3)" style="' + dark(85) + '"/>' +
        /* enamel face with a sheen from the top left */
        '<path d="' + P + '" style="fill:var(--gm)"/>' +
        '<g clip-path="url(#wgClip-' + layout + ')">' +
          '<path d="' + P + '" fill="url(#wgSheen)"/>' +
          '<ellipse cx="' + (W * 0.35) + '" cy="' + (H * 0.12) + '" rx="' + (W * 0.5) + '" ry="' + (H * 0.12) + '" style="fill:var(--gh)" opacity=".45"/>' +
          /* rail strip on the inner edge */
          '<rect x="' + (W - 10) + '" y="0" width="10" height="' + H + '" fill="#03060f" opacity=".85"/>' +
          '<rect x="' + (W - 11) + '" y="0" width="1.6" height="' + H + '" fill="url(#wgBrass)"/>' +
          /* brass trim along the silhouette (inner half of a wide stroke, clipped) */
          '<path d="' + P + '" fill="none" stroke="url(#wgBrass)" stroke-width="7"/>' +
        '</g>' +
        /* engraved feathers along the outer edge */
        '<g fill="none" stroke-linecap="round" stroke-width="2.2" style="stroke:color-mix(in srgb, var(--gl) 70%, #000)" opacity=".7">' + feathers + '</g>' +
        '<g fill="none" stroke-linecap="round" stroke-width=".9" style="stroke:var(--gh)" opacity=".55" transform="translate(-.8 -.8)">' + feathers + '</g>' +
        /* screws */
        screws.map(function (c) {
          return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="4.6" fill="url(#wgBrass)" stroke="#3b2506" stroke-width=".8"/>' +
            '<path d="M' + (c[0] - 2.6) + ' ' + (c[1] - 1.4) + 'L' + (c[0] + 2.6) + ' ' + (c[1] + 1.4) + '" stroke="#3b2506" stroke-width="1.1"/>';
        }).join('') +
      '</g></svg>';
  }
  function buildWings(layout) {
    document.querySelectorAll('.wing:not(.wing-ghost)').forEach(function (w) {
      var art = w.querySelector('.wing-art');
      if (art) art.outerHTML = wingArt(w.dataset.side, layout).replace('<svg ', '<svg class="wing-art" ');
    });
  }

  function theme(color) {
    if (color) root.style.setProperty('--plane', color);
    else root.style.removeProperty('--plane');
    root.classList.toggle('is-attuned', !!color);
  }

  /* the attunement: veins, runes in sequence, crest flare (about 1.6 s; instant with reduced motion) */
  function attune(color) {
    theme(color);
    if (!bodyEl) return Promise.resolve();
    clearTimeout(attuneTimer);
    bodyEl.classList.remove('is-attune');
    void bodyEl.offsetWidth;
    if (reduce) return Promise.resolve();
    bodyEl.classList.add('is-attune');
    return new Promise(function (resolve) {
      attuneTimer = setTimeout(function () { bodyEl.classList.remove('is-attune'); resolve(); }, 1900);
    });
  }

  return {
    build: build,
    theme: theme,
    attune: attune,
    layout: function () { return current; },
    wingArt: function (side) { return wingArt(side, current || 'wide'); },
    sizes: L,
  };
})();
