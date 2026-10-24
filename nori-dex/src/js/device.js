/* ==========================================================================
   The Mana Communicator: body art and the attunement.

   • Two layouts share one DOM: 'wide' (1200 x 848 design px, 768 x 432 screen) and
     'tall' for phones in portrait (400 x 920 design px, 368 x 404 screen). The layout
     is set on <html data-layout> by app.js -> fit(); CSS places everything per layout.
   • build() draws the body art for the current layout as one static SVG: silhouette,
     enamel, brass rim, corner filigree, 16 engraved runes and the mana veins that run
     from the relic slot up to the crest. Nothing in it animates unless attuning.
   • attune(color) is the device's big moment: when a relic seats, mana runs up the veins
     from the slot, the runes light one after another and the crest crystal flares in the
     relic's colour. theme(color) keeps that colour on the device afterwards.
   API: PL.device.build(layout), theme(color|null), attune(color) -> Promise, layout()
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
      w: 1100, h: 510, r: 46,
      glass: [142, 22, 816, 466],
      crest: [400, 700], port: 790, slot: 550,
      runes: function () {   // top and bottom margins around the glass, clear of crest, socket and slot
        var out = [];
        [190, 232, 274, 316, 832, 874, 916, 958].forEach(function (x) { out.push([x, 11]); });
        [170, 214, 258, 302, 798, 842, 886, 930].forEach(function (x) { out.push([x, 499]); });
        return out;
      },
      veins: function () {
        return [
          'M550 510V499H150Q138 499 138 487V30Q138 11 157 11H400',
          'M550 510V499H950Q962 499 962 487V30Q962 11 943 11H700',
        ];
      },
    },
    tall: {
      w: 392, h: 620, r: 34,
      glass: [8, 26, 376, 412],
      crest: [76, 316], port: 300, slot: 196,
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
      '<path d="' + rr(3, 3, w - 6, h - 6, g.r - 3) + '" fill="none" stroke="url(#dvBrass)" stroke-width="5"/>' +
      '<path d="' + rr(12, 12, w - 24, h - 24, g.r - 10) + '" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="1.6"/>' +
      '<path d="' + rr(13, 13, w - 26, h - 26, g.r - 11) + '" fill="none" stroke="#E8B93A" stroke-opacity=".22" stroke-width=".8"/>' +
      /* brass bezel around the glass */
      '<path d="' + rr(gl[0] - 6, gl[1] - 6, gl[2] + 12, gl[3] + 12, 18) + '" fill="#070b18" stroke="url(#dvBrass)" stroke-width="3"/>' +
      /* corner filigree */
      '<g class="dv-filigree" fill="none" stroke="url(#dvBrass)" stroke-width="2.2" stroke-linecap="round" opacity=".85">' +
        scroll(10, 10, 1, 1) + scroll(w - 10, 10, -1, 1) + scroll(10, h - 10, 1, -1) + scroll(w - 10, h - 10, -1, -1) + '</g>' +
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
    sizes: L,
  };
})();
