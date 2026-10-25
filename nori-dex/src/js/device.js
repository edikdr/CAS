/* ==========================================================================
   The Mana Communicator: body art and the attunement.

   • Two layouts share one DOM: 'wide' (1200 x 848 design px, 768 x 432 screen) and
     'tall' for phones in portrait (400 x 920 design px, 368 x 404 screen). The layout
     is set on <html data-layout> by app.js -> fit(); CSS places everything per layout.
   • The phone is its own model, not a shrunken desktop: a crown with the logo window and
     the mana crystal as its finial, shoulders carrying the power stud and the socket, and
     a deck where two grips rise towards a brass spine (Help, maker's mark, relic slot). relocate() moves those buttons between grips and body when the layout changes.
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
      w: 392, h: 676,
      outline: 'M0 90Q0 58 32 58H72Q84 58 84 46V40C84 16 136 0 196 0C256 0 308 16 308 40V46Q308 58 320 58H360Q392 58 392 90V626Q392 676 342 676H50Q0 676 0 626Z',
      window: 'M106 60V36C106 22 146 14 196 14C246 14 286 22 286 36V60Z',   // the logo's arched window in the crown
      glass: [8, 74, 376, 412],
      wing: { w: 164, h: 168 },
      grips: [-2, 230, 504],   // left edge of each grip box, and their top (the spine between them is 68 wide)
      runes: function () {     // one row between the glass and the grips
        var out = [];
        for (var i = 0; i < 16; i++) out.push([22 + i * 23.2, 497]);
        return out;
      },
      veins: function () {     // from the slot up the spine, along the rune row, round the glass and over the crown to the crystal
        return [
          'M196 662V510Q196 498 184 498H14Q4.5 498 4.5 488V76Q4.5 64.5 15 64.5H80Q90 64.5 90 54V40C90 20 140 7 196 7',
          'M196 662V510Q196 498 208 498H378Q387.5 498 387.5 488V76Q387.5 64.5 377 64.5H312Q302 64.5 302 54V40C302 20 252 7 196 7',
        ];
      },
    },
  };

  function rr(x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) +
      'V' + (y + h - r) + 'Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - r) + ' ' + (y + h) +
      'H' + (x + r) + 'Q' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - r) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'Z';
  }

  var DEFS =
    '<linearGradient id="dvEnamel" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#1d2c58"/><stop offset=".55" stop-color="#132049"/><stop offset="1" stop-color="#0b1533"/></linearGradient>' +
    '<linearGradient id="dvBrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e19a"/><stop offset=".4" stop-color="#d4a341"/><stop offset="1" stop-color="#8a5c1a"/></linearGradient>' +
    '<filter id="dvGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="5"/><feColorMatrix type="saturate" values="0"/></filter>';

  function build(layout) {
    if (!svg) return;
    var g = L[layout] || L.wide;
    current = layout;
    var w = g.w, h = g.h, i;
    var runeMarkup = g.runes().map(function (p, k) {
      return '<use href="#rn' + ((k * 5 + 3) % 12) + '" class="dv-rune" style="--i:' + k + '" x="' + (p[0] - 4) + '" y="' + (p[1] - 6.4) + '" width="8" height="12.8"/>';
    }).join('');
    var veinPaths = g.veins();
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.innerHTML = (layout === 'tall' ? phoneArt(g) : desktopArt(g)) +
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
    relocate(layout);
    buildWings(layout);
  }

  /* desktop: a wide enamel slab that is nearly all glass; the grips carry the ornament */
  function desktopArt(g) {
    var w = g.w, h = g.h, gl = g.glass;
    return '<defs>' + DEFS + '<clipPath id="dvClip"><path d="' + rr(0, 0, w, h, g.r) + '"/></clipPath></defs>' +
      '<path d="' + rr(0, 0, w, h, g.r) + '" fill="url(#dvEnamel)"/>' +
      '<g clip-path="url(#dvClip)"><rect width="' + w + '" height="' + h + '" filter="url(#dvGrain)" opacity=".16" style="mix-blend-mode:overlay"/>' +
        '<path d="M0 ' + (h * 0.62) + 'Q' + (w / 2) + ' ' + (h * 0.48) + ' ' + w + ' ' + (h * 0.62) + 'V' + h + 'H0Z" fill="#000" opacity=".12"/></g>' +
      /* brass rim */
      '<path d="' + rr(3, 3, w - 6, h - 6, Math.max(4, g.r - 3)) + '" fill="none" stroke="url(#dvBrass)" stroke-width="5"/>' +
      /* side rails the grips slide on */
      '<path d="M2 26V484M' + (w - 2) + ' 26V484" stroke="#03060f" stroke-width="5"/><path d="M4.5 30V480M' + (w - 4.5) + ' 30V480" stroke="url(#dvBrass)" stroke-width="1.4" opacity=".8"/>' +
      /* brass bezel around the glass */
      '<path d="' + rr(gl[0] - 6, gl[1] - 6, gl[2] + 12, gl[3] + 12, 18) + '" fill="#070b18" stroke="url(#dvBrass)" stroke-width="3"/>';
  }

  /* phone: crown, shoulders and a deck with a spine. The thickness is drawn here (no box can take
     this silhouette), and under each grip there is a dark socket that shows while it is swapped. */
  function phoneArt(g) {
    var w = g.w, h = g.h, gl = g.glass, P = g.outline, top = g.grips[2], GW = g.wing.w, GP = wingPath('tall');
    var layers = [[28, '#000', 0.16], [16, '#000', 0.3], [14, '#3b2506'], [12, '#8a5c1a'], [10, '#060b1a'], [8, '#070c1e'], [6, '#080e22'], [4, '#091027'], [2, '#0a1229']];
    var sockets = [' transform="translate(' + g.grips[0] + ' ' + top + ')"', ' transform="translate(' + (g.grips[1] + GW) + ' ' + top + ') scale(-1 1)"'];
    var spineX = g.grips[0] + GW, spineW = g.grips[1] - spineX;
    return '<defs>' + DEFS + '<clipPath id="dvClip"><path d="' + P + '"/></clipPath></defs>' +
      /* thickness and the brass underside, then the shadow it casts */
      layers.map(function (l) { return '<path d="' + P + '" transform="translate(0 ' + l[0] + ')" fill="' + l[1] + '"' + (l[2] ? ' opacity="' + l[2] + '"' : '') + '/>'; }).join('') +
      '<path d="' + P + '" fill="url(#dvEnamel)"/>' +
      '<g clip-path="url(#dvClip)">' +
        /* an engraved line and a gold hairline following the silhouette (wide strokes, clipped to the inside) */
        '<path d="' + P + '" fill="none" stroke="#E8B93A" stroke-opacity=".3" stroke-width="30.4"/>' +
        '<path d="' + P + '" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="28"/>' +
        '<path d="' + P + '" fill="none" stroke="url(#dvEnamel)" stroke-width="25.4"/>' +
        '<rect width="' + w + '" height="' + h + '" filter="url(#dvGrain)" opacity=".16" style="mix-blend-mode:overlay"/>' +
        '<rect y="' + (gl[1] + gl[3]) + '" width="' + w + '" height="' + (h - gl[1] - gl[3]) + '" fill="#000" opacity=".14"/>' +
        '<path d="' + P + '" fill="none" stroke="url(#dvBrass)" stroke-width="9"/>' +
      '</g>' +
      /* the logo window in the crown (the crest's sky plate sits inside it) */
      '<path d="' + g.window + '" fill="#070b18" stroke="url(#dvBrass)" stroke-width="4" stroke-linejoin="round"/>' +
      /* brass bezel around the glass */
      '<path d="' + rr(gl[0] - 6, gl[1] - 6, gl[2] + 12, gl[3] + 12, 16) + '" fill="#070b18" stroke="url(#dvBrass)" stroke-width="3"/>' +
      /* grip sockets, and the spine between them with its two rails */
      '<g fill="#050913" stroke="#000" stroke-opacity=".6" stroke-width="2">' + sockets.map(function (t) { return '<path d="' + GP + '"' + t + '/>'; }).join('') + '</g>' +
      '<path d="' + rr(spineX + 4, top, spineW - 8, g.wing.h, 16) + '" fill="#0a1330" stroke="#000" stroke-opacity=".5" stroke-width="1.5"/>' +
      '<path d="' + rr(spineX + 7, top + 3, spineW - 14, g.wing.h - 6, 13) + '" fill="none" stroke="#E8B93A" stroke-opacity=".28" stroke-width=".9"/>' +
      '<path d="M' + spineX + ' ' + (top + 4) + 'V' + (top + g.wing.h - 4) + 'M' + (spineX + spineW) + ' ' + (top + 4) + 'V' + (top + g.wing.h - 4) + '" stroke="#03060f" stroke-width="5"/>' +
      '<path d="M' + spineX + ' ' + (top + 8) + 'V' + (top + g.wing.h - 8) + 'M' + (spineX + spineW) + ' ' + (top + 8) + 'V' + (top + g.wing.h - 8) + '" stroke="url(#dvBrass)" stroke-width="1.4" opacity=".8"/>';
  }

  /* phone: Help moves onto the spine, Home and Photo onto the right grip (its four buttons mirror the compass); on desktop they go back */
  var MOVES = [['home', 'r'], ['plus', 'body'], ['capture', 'r']], homes = null;
  function relocate(layout) {
    if (!homes) {
      homes = MOVES.map(function (m) {
        var el = document.querySelector('[data-btn="' + m[0] + '"]');
        return el && { el: el, parent: el.parentNode, next: el.nextElementSibling, to: m[1] };
      }).filter(Boolean);
    }
    if (layout === 'tall') {
      homes.forEach(function (m) { (m.to === 'body' ? bodyEl : document.querySelector('.wing--' + m.to + ':not(.wing-ghost)')).appendChild(m.el); });
    } else {
      homes.slice().reverse().forEach(function (m) { m.parent.insertBefore(m.el, m.next && m.next.parentNode === m.parent ? m.next : null); });
    }
  }

  /* ---------- grips ---------- */
  /* silhouettes; the inner edge (rail side) is straight, the outer edge a carved double curve */
  function wingPath(layout) {
    if (layout === 'tall') return 'M164 0V168H50Q0 168 0 118V40Q0 26 14 22C58 10 114 2 164 0Z';   // its top rises towards the spine
    return 'M170 0H72Q14 0 9 62Q4 150 20 255Q4 360 9 448Q14 510 72 510H170Z';
  }
  var wingSeq = 0;   // every wing (and every drag ghost) gets its own gradient ids: an id must be unique in the page
  function wingArt(side, layout) {
    var k = ++wingSeq, g = L[layout] || L.wide, W = g.wing.w, H = g.wing.h, P = wingPath(layout), tall = layout === 'tall';
    var flip = side === 'r' ? ' transform="translate(' + W + ' 0) scale(-1 1)"' : '';
    var dark = function (k) { return 'fill:color-mix(in srgb, var(--gl) ' + k + '%, #000)'; };
    var screws = tall ? [[14, 56], [52, 158], [152, 12], [154, 158]] : [[46, 48], [46, 462], [150, 26], [150, 484]];
    var feathers = tall
      ? '<path d="M26 32C68 20 118 12 144 10M8 70Q4 96 8 122"/>'
      : '<path d="M24 120Q12 190 30 255M36 140Q26 195 40 250M24 390Q12 320 30 255M36 370Q26 315 40 260"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + (H + 14) + '" width="' + W + '" height="' + (H + 14) + '" aria-hidden="true">' +
      '<defs><linearGradient id="wgSheen' + k + '" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".35" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>' +
      '<linearGradient id="wgBrass' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e19a"/><stop offset=".45" stop-color="#d4a341"/><stop offset="1" stop-color="#7d5216"/></linearGradient>' +
      '<clipPath id="wgClip' + k + '"><path d="' + P + '"/></clipPath></defs>' +
      '<g' + flip + '>' +
        /* thickness: the silhouette stacked downwards in darker tones, then a soft contact shadow */
        '<path d="' + P + '" transform="translate(0 13)" fill="#000" opacity=".28"/>' +
        '<path d="' + P + '" transform="translate(0 9)" style="' + dark(45) + '"/>' +
        '<path d="' + P + '" transform="translate(0 6)" style="' + dark(65) + '"/>' +
        '<path d="' + P + '" transform="translate(0 3)" style="' + dark(85) + '"/>' +
        /* enamel face with a sheen from the top left */
        '<path d="' + P + '" style="fill:var(--gm)"/>' +
        '<g clip-path="url(#wgClip' + k + ')">' +
          '<path d="' + P + '" fill="url(#wgSheen' + k + ')"/>' +
          '<ellipse cx="' + (W * 0.35) + '" cy="' + (H * 0.12) + '" rx="' + (W * 0.5) + '" ry="' + (H * 0.12) + '" style="fill:var(--gh)" opacity=".45"/>' +
          /* rail strip on the inner edge */
          '<rect x="' + (W - 10) + '" y="0" width="10" height="' + H + '" fill="#03060f" opacity=".85"/>' +
          '<rect x="' + (W - 11) + '" y="0" width="1.6" height="' + H + '" fill="url(#wgBrass' + k + ')"/>' +
          /* brass trim along the silhouette (inner half of a wide stroke, clipped) */
          '<path d="' + P + '" fill="none" stroke="url(#wgBrass' + k + ')" stroke-width="7"/>' +
        '</g>' +
        /* phone, right grip: an engraved dial under the four buttons, the counterpart of the left grip's compass */
        (tall && side === 'r' ? dial(79, 90, k) : '') +
        /* engraved feathers along the outer edge */
        '<g fill="none" stroke-linecap="round" stroke-width="2.2" style="stroke:color-mix(in srgb, var(--gl) 70%, #000)" opacity=".7">' + feathers + '</g>' +
        '<g fill="none" stroke-linecap="round" stroke-width=".9" style="stroke:var(--gh)" opacity=".55" transform="translate(-.8 -.8)">' + feathers + '</g>' +
        /* screws */
        screws.map(function (c) {
          return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="4.6" fill="url(#wgBrass' + k + ')" stroke="#3b2506" stroke-width=".8"/>' +
            '<path d="M' + (c[0] - 2.6) + ' ' + (c[1] - 1.4) + 'L' + (c[0] + 2.6) + ' ' + (c[1] + 1.4) + '" stroke="#3b2506" stroke-width="1.1"/>';
        }).join('') +
      '</g></svg>';
  }
  /* a ring and a small crystal hub, centred at (cx, cy) in grip coordinates; the four buttons sit on the ring */
  function dial(cx, cy, k) {
    return '<g transform="translate(' + cx + ' ' + cy + ')" fill="none">' +
      '<circle r="46" stroke="#000" stroke-opacity=".4" stroke-width="7"/>' +
      '<circle r="46" stroke="url(#wgBrass' + k + ')" stroke-width="2.2"/>' +
      '<circle r="46" stroke="#fff" stroke-opacity=".25" stroke-width=".7" transform="translate(-.6 -.6)"/>' +
      '<path d="M0-46V46M-46 0H46" stroke="#000" stroke-opacity=".28" stroke-width="2"/>' +
      '<path d="M0-13 8 0 0 13-8 0Z" fill="url(#wgBrass' + k + ')" stroke="#3b2506" stroke-width=".8"/>' +
      '<path d="M0-8 4 0 0 8-4 0Z" fill="#fff" fill-opacity=".55"/></g>';
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
