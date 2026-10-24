/* ==========================================================================
   Relic cartridges: the rack under the device, selection, info card, insertion.

   • Every relic is a real 3D object: 15 one-pixel slices give it thickness,
     the face and the back are drawn in SVG (label: colour, title, art).
   • Selection: hover lifts it and it tilts after the pointer, click selects it, info card on the right.
   • Insert: the relic leaves its cell, flies to the slot under the device, lines up,
     slides in and latches (click, indicator, device jolt).
     A side relic flies across to the slot through the air.
   • Eject: spring kick, slides out and returns to its own cell.
   API: PL.carts.select(id), insert(id, hooks), eject(hooks), inserted(), on('play'|'eject'|'seated'|'eject-start', fn)
   ========================================================================== */
window.PL = window.PL || {};

PL.carts = (function () {
  var C = PL.config, M = PL.motion, E = M.E, mix = M.mix, seg = M.seg;
  var $ = function (s) { return document.querySelector(s); };
  var clip = $('#rackClip'), stage = $('#rackStage'), info = $('#cartInfo');
  var slotLed = $('#slotLed'), consoleEl = $('#console'), slotEl = $('#cartSlot');
  var defs = (C.carts || []).map(function (d) {   // crystal colour = accent of the relic everywhere
    return Object.assign({ c1: d.crystal || '#7FD6DF', tint: { stone: ['#a3a39f', '#74746f', '#45454a'], runes: ['#ffd36b', '#ffd36b'], vine: '#6f9a3e' } }, d);
  });
  var noopApi = {
    on: function () {}, select: function () {}, selected: function () { return null; }, inserted: function () { return null; },
    insert: function () { return Promise.resolve(false); }, eject: function () { return Promise.resolve(false); },
    isBusy: function () { return false; }, hold: function () {}, refresh: function () {}, intro: function () {},
  };
  if (!clip || !stage || !info || !slotEl || !defs.length) return noopApi;

  /* ---------- geometry (coordinates of .rack-clip) ---------- */
  var SLOT_X = 310, PITCH = 120;         // slot axis and cell pitch (any number of relics; cells are symmetric around the slot)
  var CELL_X = defs.map(function (d, i) { return SLOT_X + (i - (defs.length - 1) / 2) * PITCH; });   // cell centres
  var W = 104, H = 150, D = 15;          // relic size and thickness (D slices of 1.2 px)
  var BASE = { y: -15, z: 34, rx: -5 };  // 'selected' pose (same as .cart.is-sel .cart-tilt)
  var RISE = 30;                         // gap between the slot and the rack, so a seated relic's pommel never touches the middle relic
  var MOUTH = -44 - RISE;                // offset when the top of the relic is at the slot mouth
  var SEAT = -155 - RISE;                // offset when seated: 80% inside, the bottom 30 of 150 (pommel and crystal) stays visible
  var AR = { x: 52, y: 50, b: 12 };      // arched top (radii) and bottom corner radius

  var carts = {}, order = [];            // order[cell] = id
  var st = { sel: null, ins: null, busy: false, hold: false };
  var handlers = {};
  function emit(n, a) { (handlers[n] || []).forEach(function (f) { f(a); }); }
  function on(n, f) { (handlers[n] = handlers[n] || []).push(f); }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function seedOf(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  /* ---------- numbers for the info card (computed from PL.sky) ---------- */
  var FACTS = {
    noris: function () { var n = ((PL.sky || {}).noris || []).length; return n ? [n, _n(n, 'Nori|Noris')] : null; },
    planes: function () { var n = ((PL.sky || {}).planes || []).length; return n ? [n, _n(n, 'plane|planes')] : null; },
    days: function () {
      var c = (PL.sky || {}).campaign, d = c && Math.ceil((new Date(c.endsOn + 'T23:59:59') - Date.now()) / 864e5);
      return d > 0 ? [d, _n(d, 'day left|days left')] : null;
    },
  };

  /* ==========================================================================
     RELIC FACE AND BACK (SVG, 104 x 150)
     Body style after the studio's reference renders: carved stone in the relic's tint,
     brass frame and keystone, vines (thorny on the Abyssal relic), glowing rune columns.
     Silhouette: an arched slab. Top to bottom:
       y  0..24   arch with brass keystone and the insert chevron
       y 26..92   arched label window (official art, or an intentional "art pending" state)
       y 96..109  brass plaque with the engraved title (the title never covers the art)
       y 111..119 sub line, or the Placeholder tag
       y 120..150 pommel: brass collar and the crystal. This part stays visible when seated.
     ========================================================================== */
  var SIL = 'M0 50A52 50 0 0 1 104 50V138Q104 150 92 150H12Q0 150 0 138Z';
  var RIM = 'M2.6 50.4A49.4 47.8 0 0 1 101.4 50.4V137.6Q101.4 147.4 91.6 147.4H12.4Q2.6 147.4 2.6 137.6Z';
  var WIN = 'M15 92V56A37 30 0 0 1 89 56V92Z';
  var WBOX = { x: 15, y: 26, w: 74, h: 66 };
  var GEM = '52,123.5 60.5,133.5 52,146.5 43.5,133.5';

  function runeUse(n, x, y, color, cls) {
    var href = '#rn' + (n % 12);
    return '<g class="' + cls + '" transform="translate(' + (x - 3) + ' ' + y + ') scale(.6)" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
      '<use href="' + href + '" width="10" height="16" stroke="' + color + '" stroke-width="4.6" opacity=".32"/>' +
      '<use href="' + href + '" width="10" height="16" stroke="' + color + '" stroke-width="1.9"/>' +
      '<use href="' + href + '" width="10" height="16" stroke="#fff" stroke-width=".7" opacity=".55"/></g>';
  }

  function artOf(d, u) {
    if (!d.art) {                                  // intentional empty state: dark window, rune ring, crystal
      var r = d.tint.runes, ring = '';
      for (var k = 0; k < 8; k++) {
        var a = k / 8 * Math.PI * 2 - Math.PI / 2;
        ring += runeUse(seedOf(d.id) + k * 5, 52 + Math.cos(a) * 25, 57 + Math.sin(a) * 21 - 4.8, r[k % 2], 'rc-rune');
      }
      return '<rect x="15" y="26" width="74" height="66" fill="url(#vd-' + u + ')"/>' +
        '<ellipse cx="52" cy="61" rx="25" ry="21" fill="none" stroke="' + r[0] + '" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="2 2.4"/>' + ring +
        '<path d="M52 49 57 57 52 68 47 57Z" fill="' + d.crystal + '" opacity=".75"/><path d="M52 49 52 68M47 57H57" stroke="#fff" stroke-opacity=".35" stroke-width=".5"/>' +
        '<text x="52" y="79" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="5.4" letter-spacing="1.1" fill="' + r[1] + '">ART PENDING</text>' +
        '<text x="52" y="85.4" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="700" font-size="3.6" letter-spacing=".5" fill="#f4d9c8" opacity=".7">FROM THE STUDIO</text>';
    }
    var sz = d.artSize || [1, 1], c = d.crop || [0, 0, sz[0], sz[1]];
    var k2 = Math.max(WBOX.w / c[2], WBOX.h / c[3]);
    var x = WBOX.x + (WBOX.w - c[2] * k2) / 2 - c[0] * k2, y = WBOX.y + (WBOX.h - c[3] * k2) / 2 - c[1] * k2;
    return '<image href="' + esc(d.art) + '" x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + (sz[0] * k2).toFixed(2) + '" height="' + (sz[1] * k2).toFixed(2) + '" preserveAspectRatio="none"/>' +
      '<rect x="15" y="26" width="74" height="66" fill="url(#vg-' + u + ')"/>';
  }

  function vines(d) {
    var v = d.tint.vine, out = '<g class="rc-vines" fill="none" stroke-linecap="round">';
    var paths = ['M1 40C9 47 3 60 10 68S5 88 13 96S8 108 4 116', 'M103 84C96 92 102 104 93 111S99 124 92 128', 'M14 30C22 21 31 19 40 15'];
    paths.forEach(function (p) {
      out += '<path d="' + p + '" stroke="#000" stroke-opacity=".35" stroke-width="2.8" transform="translate(.5 .8)"/>' +
             '<path d="' + p + '" stroke="' + v + '" stroke-width="2.1"/>' +
             '<path d="' + p + '" stroke="#fff" stroke-opacity=".18" stroke-width=".6" transform="translate(-.3 -.4)"/>';
    });
    var marks = [[7, 55, -30], [11, 79, 25], [6, 104, -20], [97, 96, 30], [95, 118, -25], [26, 21, 60], [34, 17, -50]];
    marks.forEach(function (m) {
      out += d.tint.thorns
        ? '<path d="M' + m[0] + ' ' + m[1] + 'l3.2 -2.2" stroke="' + v + '" stroke-width="1.1" transform="rotate(' + m[2] + ' ' + m[0] + ' ' + m[1] + ')"/>'
        : '<ellipse cx="' + m[0] + '" cy="' + m[1] + '" rx="3" ry="1.5" fill="' + v + '" stroke="#24390f" stroke-width=".4" transform="rotate(' + m[2] + ' ' + m[0] + ' ' + m[1] + ')"/>';
    });
    return out + '</g>';
  }

  function frontSVG(d) {
    var u = d.id, t = d.tint, FONT = 'Nunito, system-ui, sans-serif', seed = seedOf(d.id), i;
    var runes = '';
    for (i = 0; i < 4; i++) {
      runes += runeUse(seed + i * 3, 9, 52 + i * 12, t.runes[0], 'rc-rune');
      runes += runeUse(seed + i * 7 + 1, 95, 52 + i * 12, t.runes[1], 'rc-rune');
    }
    var titleLen = d.title.length * 0.7 * 6.6, tl = titleLen > 70 ? ' textLength="70" lengthAdjust="spacingAndGlyphs"' : '';
    var sub = d.placeholder
      ? '<rect x="29" y="111.2" width="46" height="7.6" rx="1.6" fill="rgba(10,14,30,.55)" stroke="#E8B93A" stroke-width=".6" stroke-dasharray="1.6 1.1"/>' +
        '<text x="52" y="116.9" text-anchor="middle" font-family="' + FONT + '" font-weight="900" font-size="4.6" letter-spacing=".9" fill="#E8B93A">PLACEHOLDER</text>'
      : '<text x="52" y="117" text-anchor="middle" font-family="' + FONT + '" font-weight="800" font-size="4.4" letter-spacing=".9" fill="#f6efe0" opacity=".78">' + esc(d.sub || '') + '</text>';
    var rust = '';
    if (t.thorns) for (i = 0; i < 9; i++) { var h = (seed * (i + 3) * 2654435761) >>> 0; rust += '<ellipse cx="' + (6 + h % 92) + '" cy="' + (30 + (h >>> 8) % 112) + '" rx="' + (2 + (h >>> 4) % 5) + '" ry="' + (1.4 + (h >>> 6) % 3) + '" fill="#c4622c" opacity=".22"/>'; }
    return '<svg viewBox="0 0 104 150" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="st-' + u + '" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="' + t.stone[0] + '"/><stop offset=".5" stop-color="' + t.stone[1] + '"/><stop offset="1" stop-color="' + t.stone[2] + '"/></linearGradient>' +
        '<linearGradient id="br-' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e19a"/><stop offset=".45" stop-color="#c99432"/><stop offset="1" stop-color="#7d5216"/></linearGradient>' +
        '<linearGradient id="vg-' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>' +
        '<radialGradient id="vd-' + u + '" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="#2b1612"/><stop offset="1" stop-color="#080404"/></radialGradient>' +
        '<linearGradient id="gm-' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="' + d.crystal + '"/><stop offset="1" stop-color="#1a1020"/></linearGradient>' +
        '<clipPath id="k-' + u + '"><path d="' + SIL + '"/></clipPath>' +
        '<clipPath id="w-' + u + '"><path d="' + WIN + '"/></clipPath>' +
        '<filter id="n-' + u + '" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="' + (seed % 97) + '"/><feColorMatrix type="saturate" values="0"/></filter>' +
      '</defs>' +
      /* carved stone body with grain, rust, cracks */
      '<path d="' + SIL + '" fill="url(#st-' + u + ')"/>' +
      '<g clip-path="url(#k-' + u + ')"><rect width="104" height="150" filter="url(#n-' + u + ')" opacity=".34" style="mix-blend-mode:multiply"/>' + rust +
        '<path d="M70 120 74 128 71 134M30 22 34 27 33 31M98 64 94 70" stroke="#000" stroke-opacity=".35" stroke-width=".6" fill="none"/></g>' +
      '<path d="' + RIM + '" fill="none" stroke="url(#br-' + u + ')" stroke-width="1.8"/>' +
      '<path d="' + SIL + '" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="1"/>' +
      /* keystone: brass halo and the insert chevron (the arch goes into the slot first) */
      '<ellipse cx="52" cy="9.5" rx="10" ry="3.4" fill="none" stroke="url(#br-' + u + ')" stroke-width="1.8"/>' +
      '<path d="M46.5 20.5 52 15 57.5 20.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M46.5 20 52 14.5 57.5 20" fill="none" stroke="url(#br-' + u + ')" stroke-width="1.3" stroke-linecap="round"/>' +
      /* label window: art (or the empty state) inside a brass frame */
      '<path d="' + WIN + '" fill="#0b0d16"/>' +
      '<g clip-path="url(#w-' + u + ')">' + artOf(d, u) + '</g>' +
      '<path d="' + WIN + '" fill="none" stroke="#f5ead0" stroke-opacity=".5" stroke-width=".7"/>' +
      '<path d="' + WIN + '" fill="none" stroke="url(#br-' + u + ')" stroke-width="2.4" transform="translate(0 .2)" style="paint-order:stroke" stroke-linejoin="round"/>' +
      '<g fill="none" stroke="url(#br-' + u + ')" stroke-width="1.3" stroke-linecap="round">' +
        '<path d="M15 92q-6 0-6 5.5 0 3.5 3.5 3.5 2.6 0 2.6-2.6"/><path d="M89 92q6 0 6 5.5 0 3.5-3.5 3.5-2.6 0-2.6-2.6"/>' +
        '<path d="M15 57q-5-1-6.5-5"/><path d="M89 57q5-1 6.5-5"/></g>' +
      runes +
      /* plaque with the engraved title */
      '<rect x="14" y="96" width="76" height="13" rx="2.4" fill="url(#br-' + u + ')" stroke="#5c3b0c" stroke-width=".6"/>' +
      '<rect x="15.4" y="97.3" width="73.2" height="10.4" rx="1.6" fill="none" stroke="#fff3c8" stroke-opacity=".45" stroke-width=".5"/>' +
      '<text x="52" y="105.6" text-anchor="middle" font-family="' + FONT + '" font-weight="900" font-size="6.6" letter-spacing=".5" fill="#fff6d6" opacity=".55"' + tl + '>' + esc(d.title) + '</text>' +
      '<text x="52" y="105.1" text-anchor="middle" font-family="' + FONT + '" font-weight="900" font-size="6.6" letter-spacing=".5" fill="#3b2506"' + tl + '>' + esc(d.title) + '</text>' +
      sub +
      /* pommel: brass collar and the crystal (lit when seated) */
      '<path d="M7 121.2H97" stroke="#000" stroke-opacity=".4" stroke-width="2.4"/><path d="M7 120.6H97" stroke="url(#br-' + u + ')" stroke-width="1.5"/>' +
      '<polygon points="52,121.2 62.6,133.5 52,149 41.4,133.5" fill="url(#br-' + u + ')" stroke="#5c3b0c" stroke-width=".5"/>' +
      '<polygon class="rc-gem" points="' + GEM + '" fill="url(#gm-' + u + ')"/>' +
      '<path d="M52 123.5V146.5M43.5 133.5H60.5M52 123.5 47.6 133.5 52 146.5 56.4 133.5Z" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".45"/>' +
      '<circle cx="15" cy="136" r="1.8" fill="url(#br-' + u + ')"/><circle cx="89" cy="136" r="1.8" fill="url(#br-' + u + ')"/>' +
      '<path d="M22 136q6-6 12 0M70 136q6-6 12 0" fill="none" stroke="url(#br-' + u + ')" stroke-width="1.1" stroke-linecap="round"/>' +
      vines(d) +
    '</svg>';
  }

  function backSVG(d) {
    var u = d.id, t = d.tint, ring = '', seed = seedOf(d.id);
    for (var k = 0; k < 10; k++) {
      var a = k / 10 * Math.PI * 2 - Math.PI / 2;
      ring += runeUse(seed + k * 7, 52 + Math.cos(a) * 26, 72 + Math.sin(a) * 26 - 4.8, t.runes[k % 2], 'rc-rune');
    }
    var pins = '';
    for (var i = 0; i < 9; i++) pins += '<rect x="' + (31 + i * 5).toFixed(1) + '" y="20" width="3" height="9" rx=".8" fill="url(#bb-' + u + ')"/>';
    return '<svg viewBox="0 0 104 150" aria-hidden="true">' +
      '<defs><linearGradient id="bs-' + u + '" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + t.stone[1] + '"/><stop offset="1" stop-color="' + t.stone[2] + '"/></linearGradient>' +
      '<linearGradient id="bb-' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e19a"/><stop offset="1" stop-color="#8a5c1a"/></linearGradient></defs>' +
      '<path d="' + SIL + '" fill="url(#bs-' + u + ')"/>' +
      '<path d="' + RIM + '" fill="none" stroke="url(#bb-' + u + ')" stroke-width="1.6"/>' + pins +
      '<circle cx="52" cy="72" r="33" fill="rgba(0,0,0,.18)" stroke="url(#bb-' + u + ')" stroke-width="1.6"/>' + ring +
      '<path d="M52 60 60 72 52 86 44 72Z" fill="' + d.crystal + '" opacity=".6"/>' +
      '<text x="52" y="122" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="8" letter-spacing="1.4" fill="#000" opacity=".35">NORI-DEX</text>' +
    '</svg>';
  }

  /* ==========================================================================
     RACK ASSEMBLY
     ========================================================================== */
  var trayBack = mk('div', 'tray-back'), trayFront = mk('div', 'tray-front');
  var shadows = [];
  var TRAY_L = CELL_X[0] - 82, TRAY_W = CELL_X[CELL_X.length - 1] - CELL_X[0] + 164;
  trayBack.style.left = trayFront.style.left = TRAY_L + 'px';
  trayBack.style.width = trayFront.style.width = TRAY_W + 'px';
  CELL_X.forEach(function (x, i) {
    trayBack.appendChild(mk('i', 'tray-slot')).style.left = (x - TRAY_L - 54) + 'px';
    var sh = mk('i', 'cart-shadow'); sh.style.left = x + 'px'; shadows[i] = sh;
    var no = mk('span', 'tray-no', pad2(i + 1)); no.style.left = (x - TRAY_L) + 'px';
    var led = mk('i', 'tray-led'); led.style.left = (x - TRAY_L) + 'px';
    trayFront.appendChild(no); trayFront.appendChild(led);
  });
  clip.insertBefore(trayBack, stage);
  shadows.forEach(function (s) { clip.insertBefore(s, stage); });
  clip.insertBefore(trayFront, stage.nextSibling);

  defs.forEach(function (d, i) {
    var el = mk('div', 'cart');
    el.dataset.id = d.id; el.dataset.cell = i;
    el.style.setProperty('--cx', CELL_X[i] + 'px');
    el.style.setProperty('--cc', d.c1);
    el.style.setProperty('--st0', d.tint.stone[0]); el.style.setProperty('--st1', d.tint.stone[1]); el.style.setProperty('--st2', d.tint.stone[2]);
    el.style.setProperty('--i', i);
    el.style.setProperty('--ry0', (((defs.length - 1) / 2 - i) * 16) + 'deg');   // outer relics turn slightly towards the slot
    var layers = '';
    for (var k = 0; k < D; k++) {
      var e = (k === 0 || k === D - 1) ? 1.5 : (k === 1 || k === D - 2) ? 0.7 : 0;   // bevel: outer slices are slightly smaller
      layers += '<i class="cl" style="transform:translateZ(' + ((k - (D - 1) / 2) * 1.2).toFixed(2) + 'px)' + (e ? ';inset:' + e + 'px;border-radius:' +
        (AR.x - e) + 'px ' + (AR.x - e) + 'px ' + (AR.b - e) + 'px ' + (AR.b - e) + 'px / ' + (AR.y - e) + 'px ' + (AR.y - e) + 'px ' + (AR.b - e) + 'px ' + (AR.b - e) + 'px' : '') + '"></i>';
    }
    el.innerHTML =
      '<div class="cart-tilt"><div class="cart-3d"><div class="cart-glow"></div>' + layers +
        '<div class="cart-face cart-front">' + frontSVG(d) + '</div>' +
        '<div class="cart-face cart-back">' + backSVG(d) + '</div>' +
        '<i class="cart-gem"></i>' +
      '</div></div>';
    var hit = mk('div', 'cart-hit');
    hit.dataset.id = d.id;
    hit.tabIndex = 0;
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-pressed', 'false');
    hit.setAttribute('aria-label', _('Relic: {name}', { name: d.name }));
    hit.style.setProperty('--cx', CELL_X[i] + 'px');
    stage.appendChild(el);
    stage.appendChild(hit);
    carts[d.id] = { def: d, el: el, hit: hit, home: i, cell: i };
    order[i] = d.id;
  });

  /* ---------- hover, tilt after the pointer, selection ---------- */
  function track(c, e) {
    var r = c.hit.getBoundingClientRect(), el = c.el;
    var px = ((e.clientX - r.left) / r.width - 0.5) * 2, py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.setProperty('--px', M.clamp(px, -1, 1).toFixed(3));
    el.style.setProperty('--py', M.clamp(py, -1, 1).toFixed(3));
  }
  Object.keys(carts).forEach(function (id) {
    var c = carts[id], el = c.el, hit = c.hit;
    hit.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'touch') return;
      if (!st.busy && !el.classList.contains('is-seated')) { el.classList.add('is-hover'); PL.audio.play('tick'); }
    });
    hit.addEventListener('pointermove', function (e) { if (e.pointerType !== 'touch' && !st.busy && el.classList.contains('is-hover')) track(c, e); });
    hit.addEventListener('pointerleave', function () {
      el.classList.remove('is-hover'); el.style.removeProperty('--px'); el.style.removeProperty('--py');
    });
    hit.addEventListener('click', function () { if (!st.busy && performance.now() - lastClick > 350) select(id); });
    hit.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        if (st.busy || st.hold) return;
        if (st.sel !== id) select(id);                              // first Enter selects
        else emit(st.ins === id ? 'eject' : 'play', id);            // second Enter inserts / ejects (same as dragging)
      }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
    if (!m || !defs[+m[1] - 1] || st.busy) return;
    var id = defs[+m[1] - 1].id;
    select(id);
    try { carts[id].hit.focus({ preventScroll: true }); } catch (err) {}   // so the next Enter seats (or draws out) this relic
  });

  function select(id, quiet) {
    if (!carts[id] || st.sel === id) return;
    st.sel = id;
    stage.classList.add('has-sel');
    Object.keys(carts).forEach(function (k) {
      var on = k === id;
      carts[k].el.classList.toggle('is-sel', on);
      carts[k].hit.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    updateLeds();
    renderInfo(true);
    if (!quiet) PL.audio.play('lift');
  }

  function updateLeds() {
    var leds = trayFront.querySelectorAll('.tray-led');
    CELL_X.forEach(function (x, i) {
      var id = order[i], on = id && id === st.sel && id !== st.ins && !carts[id].el.classList.contains('is-flying');
      leds[i].classList.toggle('is-on', !!on);
      if (on) leds[i].style.setProperty('--cc', carts[id].def.c1);
    });
  }

  /* ==========================================================================
     INFO CARD OF THE SELECTED RELIC
     ========================================================================== */

  function opensLabel(d) {
    var sec = (C.sections || []).filter(function (x) { return x.id === d.opens; })[0];
    return _('Opens: {screen}', { screen: sec ? sec.title : d.opens });
  }
  function cardHTML(d) {
    var inC = st.ins === d.id, idx = defs.indexOf(d) + 1;
    var facts = (d.facts || []).map(function (k) {
      var f = FACTS[k] && FACTS[k]();
      return f ? '<span><b>' + f[0] + '</b> ' + f[1] + '</span>' : '';
    }).join('');
    return '<div class="ci-top"><span>' + _('RELIC {n}/{total}', { n: pad2(idx), total: pad2(defs.length) }) + '</span>' +
      '<span class="ci-state' + (inC ? ' is-in' : '') + '"><i></i>' + (inC ? _('seated') : _('in the rack')) + '</span></div>' +
      '<div class="ci-title"><b>' + esc(d.name) + '</b>' + (d.placeholder ? '<span class="ph-tag">' + _('Placeholder') + '</span>' : '') + '</div>' +
      '<div class="ci-sub">' + esc(opensLabel(d)) + '</div>' +
      '<p class="ci-blurb">' + esc(d.blurb) + '</p>' +
      '<div class="ci-chips">' + facts + '</div>' +
      hintHTML(inC ? 'down' : 'up', inC ? _('Drag down to draw it out') : _('Drag it up into the slot'));
  }
  function emptyHTML() {
    return '<div class="ci-top"><span>' + _('RELICS · {n}', { n: defs.length }) + '</span><span class="ci-state"><i></i>' + (st.ins ? _('seated') : _('slot open')) + '</span></div>' +
      '<div class="ci-title"><b>' + _('Choose a relic') + '</b></div>' +
      '<p class="ci-blurb">' + _('Three relics. Seat one in the slot to open its screen. Tap a relic to see what it holds.') + '</p>' +
      '<div class="ci-pick">' + defs.map(function (d) {
        return '<button data-pick="' + d.id + '" style="--cc:' + d.c1 + '"><i></i>' + esc(d.short || d.name) + '</button>';
      }).join('') + '</div>' +
      hintHTML('up', _('Drag any relic into the slot'));
  }

  var cardEl = null;
  function renderInfo(animate) {
    var d = st.sel && carts[st.sel] && carts[st.sel].def;
    var card = mk('div', 'ci-card' + (d ? '' : ' ci-empty') + (animate ? ' is-in' : ''), d ? cardHTML(d) : emptyHTML());
    card.style.setProperty('--cc', d ? d.c1 : '#8d94a3');
    if (cardEl) {
      var old = cardEl;
      if (animate) { old.classList.remove('is-in'); old.classList.add('is-out'); setTimeout(function () { old.remove(); }, 200); } else old.remove();
    }
    info.appendChild(card);
    cardEl = card;
    info.style.setProperty('--cc', d ? d.c1 : '#8d94a3');
  }
  function refreshState() {   // state and hint without redrawing the whole card
    var d = st.sel && carts[st.sel] && carts[st.sel].def;
    if (!d || !cardEl) { if (cardEl && !d) renderInfo(false); return; }
    var inC = st.ins === d.id;
    var state = cardEl.querySelector('.ci-state');
    if (state) { state.classList.toggle('is-in', inC); state.lastChild.textContent = inC ? _('seated') : _('in the rack'); }
    if (!drag) restoreHint();
  }
  /* hint on the card: what to do with the relic (the arrow shows the direction) */
  function hintHTML(kind, text) {
    return '<div class="ci-hint" data-kind="' + kind + '"><i class="ci-arrow"><svg viewBox="0 0 16 16"><path d="M8 2 14 9H10v5H6V9H2z"/></svg></i><span>' + esc(text) + '</span></div>';
  }
  function setHint(text, kind) {
    var el = info.querySelector('.ci-card:not(.is-out) .ci-hint');
    if (!el) return;
    el.dataset.kind = kind || 'up';
    el.lastChild.textContent = text;
  }
  function restoreHint() {
    var d = st.sel && carts[st.sel] && carts[st.sel].def;
    var inC = d && st.ins === d.id;
    if (!d) return setHint(_('Drag any relic into the slot'), 'up');
    setHint(inC ? _('Drag down to draw it out') : _('Drag it up into the slot'), inC ? 'down' : 'up');
  }
  /* Enter / Space on a card button press that button, not the device's confirm key */
  info.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
  info.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]');
    if (!b || st.busy) return;
    select(b.dataset.pick);
  });

  /* ==========================================================================
     CHOREOGRAPHY
     Relics never swap places: a side relic flies to the slot by itself (offset dx) and
     returns to its own cell when ejected. Poses are {x, y, z, rx, ry, rz} relative to the cell.
     ========================================================================== */
  function led(s) { slotLed.className = 'slot-led' + (s ? ' is-' + s : ''); }
  function setBusy(v) { st.busy = v; stage.classList.toggle('is-busy', v); refreshState(); }
  function dxOf(c) { return SLOT_X - CELL_X[c.cell]; }          // from its own cell to the slot

  /* path into the slot: t in seconds, returns a pose (x = 0 is above its own cell) */
  var T_IN = 2.36;
  function insertAt(t, dx) {
    var x = 0, y, z, rx, ry = 0, rz = 0, u;
    if (t < 0.16) {                                   // crouch before the lift
      u = E.out2(seg(t, 0, 0.16));
      y = BASE.y + 6 * u; z = BASE.z; rx = BASE.rx + 3 * u;
    } else if (t < 0.74) {                            // pull out of the cell and carry to the device (a side relic also flies to the slot)
      u = seg(t, 0.16, 0.74);
      x = dx * E.io2(u);
      y = mix(BASE.y + 6, -36 - RISE, E.out5(u)); z = mix(BASE.z, 64, E.out3(u)); rx = mix(BASE.rx + 3, -7, E.out3(u));
      ry = 7 * Math.sin(2 * Math.PI * u) * (1 - u); rz = 1.8 * Math.sin(2 * Math.PI * u * 1.3) * (1 - u);
    } else if (t < 1.04) {                            // aim at the slot
      x = dx;
      u = E.io2(seg(t, 0.74, 1.04));
      y = mix(-36 - RISE, MOUTH, u); z = mix(64, 34, u); rx = mix(-7, -1, u);
    } else if (t < 1.56) {                            // guide it into the slot
      x = dx;
      u = E.io2(seg(t, 1.04, 1.56));
      y = mix(MOUTH, -88 - RISE, u); z = mix(34, 6, u); rx = mix(-1, 0, u);
    } else if (t < 1.88) {                            // slides deeper, speeding up
      x = dx;
      u = E.in2(seg(t, 1.56, 1.88));
      y = mix(-88 - RISE, -144 - RISE, u); z = mix(6, 0, u); rx = 0;
    } else if (t < 2.04) {                            // firm push to the stop
      x = dx;
      u = E.in2(seg(t, 1.88, 2.04));
      y = mix(-144 - RISE, SEAT, u); z = 0; rx = 0;
    } else {                                          // bounce after the click
      x = dx;
      u = seg(t, 2.04, T_IN);
      y = SEAT + 3.2 * Math.sin(Math.PI * u) * (1 - 0.5 * u); z = 0; rx = 0.7 * Math.sin(Math.PI * u);
    }
    return { x: x, y: y, z: z, rx: rx, ry: ry, rz: rz };
  }

  function seatFx(hooks) {
    PL.audio.play('seat');
    led('green');
    var ring = slotEl.querySelector('.slot-ring');
    if (!ring) ring = slotEl.appendChild(mk('i', 'slot-ring'));
    ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
    if (consoleEl && consoleEl.animate && !M.reduce) {
      consoleEl.animate([
        { transform: 'translateY(0)' }, { transform: 'translateY(2.6px)', offset: 0.22 },
        { transform: 'translateY(-1.5px)', offset: 0.5 }, { transform: 'translateY(.6px)', offset: 0.75 }, { transform: 'translateY(0)' },
      ], { duration: 340, easing: 'ease-out' });
    }
    if (hooks && hooks.onSeat) hooks.onSeat();
  }

  /* relic seated: commit the pose as styles */
  function settleSeated(c, a) {
    var dx = dxOf(c), el = c.el;
    el.classList.remove('is-flying', 'is-hover', 'is-dragging');
    el.classList.add('is-seated');
    M.commit(el, { x: dx, y: SEAT, z: 0, rx: 0 });
    if (a) a.cancel();
    shadows[c.cell].classList.remove('is-up'); shadows[c.cell].classList.add('is-gone');
    c.hit.style.transform = 'translate(' + dx + 'px,' + SEAT + 'px)';
    st.ins = c.def.id;
    c.pose = null;
    updateLeds();
  }

  /* hooks.fast: a swap from the screen plays the same path faster (K scales time) */
  function speed(hooks) { return hooks && hooks.fast && !M.reduce ? 0.6 : 1; }
  function flyIn(c, hooks) {
    var el = c.el, dx = dxOf(c), K = speed(hooks);
    el.classList.add('is-flying');
    el.style.zIndex = 6;
    shadows[c.cell].classList.add('is-up');
    var a = M.play(el, function (u) { return insertAt(u * T_IN, dx); }, T_IN * 1000 * K);
    M.cues(a, [
      { t: 0.16 * K, fn: function () { PL.audio.play('lift'); } },
      { t: 0.74 * K, fn: function () { led('amber'); if (hooks && hooks.onAlign) hooks.onAlign(); } },
      { t: 1.04 * K, fn: function () { PL.audio.play('slide'); } },
      { t: 2.04 * K, fn: function () { seatFx(hooks); } },
    ]);
    return a.finished.then(function () { el.style.zIndex = ''; settleSeated(c, a); });
  }

  /* relic released at the slot: from the current pose it moves to the mouth and continues as usual */
  var T_CATCH = 0.3;
  function dropIn(c, from, hooks) {
    var el = c.el, dx = dxOf(c);
    var to = insertAt(1.04, dx);
    var rest = T_IN - 1.04, total = T_CATCH + rest;
    el.classList.add('is-flying');
    el.style.zIndex = 6;
    shadows[c.cell].classList.add('is-up');
    led('amber');
    var a = M.play(el, function (u) {
      var t = u * total;
      if (t < T_CATCH) {
        var k = E.io2(t / T_CATCH);
        return { x: mix(from.x, to.x, k), y: mix(from.y, to.y, k), z: mix(from.z, to.z, k), rx: mix(from.rx, to.rx, k), ry: mix(from.ry, 0, k), rz: mix(from.rz, 0, k) };
      }
      return insertAt(1.04 + (t - T_CATCH), dx);
    }, total * 1000);
    M.cues(a, [
      { t: T_CATCH, fn: function () { PL.audio.play('slide'); } },
      { t: T_CATCH + 2.04 - 1.04, fn: function () { seatFx(hooks); } },
    ]);
    return a.finished.then(function () { el.style.zIndex = ''; settleSeated(c, a); });
  }

  /* eject: spring kick, pull down, back to the rack (a side relic returns to its cell) */
  var T_OUT = 1.62;
  function outAt(t, dx) {
    var x = dx, y, z, rx = 0, ry = 0, u;
    if (t < 0.12) {
      u = E.out3(seg(t, 0, 0.12));
      y = SEAT + 10 * u; z = 0;
    } else if (t < 0.98) {
      u = E.io2(seg(t, 0.12, 0.98));
      y = mix(SEAT + 10, MOUTH, u); z = mix(0, 34, u); rx = mix(0, -1, u);
    } else {
      u = seg(t, 0.98, T_OUT);
      x = dx * (1 - E.io2(u));
      y = mix(MOUTH, BASE.y, E.out3(u)); z = BASE.z; rx = mix(-1, BASE.rx, E.out3(u));
      ry = 5 * Math.sin(2 * Math.PI * u) * (1 - u);
    }
    return { x: x, y: y, z: z, rx: rx, ry: ry, rz: 0 };
  }
  function finishOut(c, a) {
    var el = c.el;
    el.style.transform = '';
    el.style.zIndex = '';
    el.classList.remove('is-flying', 'is-dragging');
    if (a) a.cancel();
    shadows[c.cell].classList.remove('is-up');
    c.hit.style.transform = '';
    c.pose = null;
    st.ins = null;
    updateLeds();
  }
  function flyOut(c, hooks, from) {
    var el = c.el, dx = dxOf(c), K = speed(hooks);
    el.classList.remove('is-seated');
    el.classList.add('is-flying');
    el.style.zIndex = 6;
    led('amber');
    emit('eject-start', { id: c.def.id, swap: !!(hooks && hooks.swap) });
    var a;
    if (!from) {                                       // regular eject from the slot
      M.commit(el, { x: dx, y: SEAT, z: 0, rx: 0 });
      a = M.play(el, function (u) { return outAt(u * T_OUT, dx); }, T_OUT * 1000 * K);
      M.cues(a, [
        { t: 0.0, fn: function () { PL.audio.play('eject'); if (hooks && hooks.onEject) hooks.onEject(); } },
        { t: 0.14 * K, fn: function () { PL.audio.play('slide'); led(''); } },
        { t: 1.15 * K, fn: function () { shadows[c.cell].classList.remove('is-gone'); shadows[c.cell].classList.add('is-up'); } },
      ]);
    } else {                                           // pulled by hand: it finishes by itself
      var t0 = 0.12, total = 0.34 + (T_OUT - 0.98);
      var mouth = outAt(0.98, dx);
      PL.audio.play('eject'); if (hooks && hooks.onEject) hooks.onEject();
      a = M.play(el, function (u) {
        var t = u * total;
        if (t < 0.34) {
          var k = E.out2(t / 0.34);
          return { x: mix(from.x, mouth.x, k), y: mix(from.y, mouth.y, k), z: mix(from.z, mouth.z, k), rx: mix(from.rx, mouth.rx, k), ry: mix(from.ry, 0, k), rz: mix(from.rz, 0, k) };
        }
        return outAt(0.98 + (t - 0.34), dx);
      }, total * 1000);
      M.cues(a, [
        { t: 0.05, fn: function () { PL.audio.play('slide'); led(''); } },
        { t: 0.4, fn: function () { shadows[c.cell].classList.remove('is-gone'); shadows[c.cell].classList.add('is-up'); } },
      ]);
    }
    return a.finished.then(function () { finishOut(c, a); });
  }

  function doEject(hooks) { return flyOut(carts[st.ins], hooks); }

  function releaseFocus() {
    var a = document.activeElement;
    if (a && a.classList && a.classList.contains('cart-hit')) a.blur();
  }

  /* ---------- public actions ---------- */
  function insert(id, hooks) {
    var c = carts[id];
    if (!c || st.busy) return Promise.resolve(false);
    if (st.ins === id) return Promise.resolve(true);
    setBusy(true);
    var hovered = false;
    Object.keys(carts).forEach(function (k) { if (carts[k].el.classList.contains('is-hover')) hovered = true; carts[k].el.classList.remove('is-hover'); });
    var chain = Promise.resolve();
    var K = speed(hooks);
    if (st.ins) chain = chain.then(function () { return doEject(Object.assign({ swap: true }, hooks)); });
    chain = chain.then(function () {
      if (st.sel !== id) { select(id, true); return M.wait(460 * K); }
      return M.wait(hovered ? 340 * K : 60);
    });
    chain = chain.then(function () { return flyIn(c, hooks); });
    return chain.then(function () { setBusy(false); refreshState(); releaseFocus(); emit('seated', { id: id }); return true; }, function () { setBusy(false); return false; });
  }
  function eject(hooks) {
    if (st.busy || !st.ins) return Promise.resolve(false);
    setBusy(true);
    return doEject(hooks).then(function () { setBusy(false); refreshState(); return true; }, function () { setBusy(false); return false; });
  }

  /* ==========================================================================
     HAND: a relic can be grabbed and dragged. Up into the slot inserts it; down out of the slot ejects it.
     ========================================================================== */
  var drag = null, dragRaf = 0, lastClick = 0;
  var X_RANGE = 380;                                            // how far from the slot a relic can be dragged

  function startDrag(c, e) {
    var seated = st.ins === c.def.id;
    if (!seated) select(c.def.id, true);
    var el = c.el;
    el.classList.remove('is-hover');
    el.style.removeProperty('--px'); el.style.removeProperty('--py');
    el.classList.add('is-flying', 'is-dragging');
    el.style.zIndex = 6;
    var pose = seated ? { x: dxOf(c), y: SEAT, z: 0, rx: 0, ry: 0, rz: 0 } : { x: 0, y: BASE.y, z: BASE.z, rx: BASE.rx, ry: 0, rz: 0 };
    M.commit(el, pose);
    drag.active = true; drag.pose = pose; drag.seated = seated; drag.zone = false; drag.last = performance.now();
    if (seated) el.classList.remove('is-seated');
    shadows[c.cell].classList.add('is-up');
    stage.classList.add('is-grab');
    document.body.classList.add('is-cart-drag');
    PL.audio.play('lift');
    setHint(seated ? _('Drag down to draw it out') : _('Let go over the slot'), 'up');
    updateLeds();
    if (!dragRaf) dragRaf = requestAnimationFrame(dragFrame);
  }

  function dragTarget() {
    var c = drag.c, dx0 = dxOf(c), tx = drag.tx || 0, ty = drag.ty || 0, p;
    if (drag.seated) {
      var pull = M.clamp(ty, 0, 200);
      p = { x: dx0 + M.clamp(tx * 0.18, -16, 16), y: SEAT + pull, z: pull > 60 ? mix(0, 34, M.seg(pull, 60, 150)) : 0, rx: 0, ry: 0, rz: 0 };
      drag.zone = false; drag.pull = pull;
      return p;
    }
    var x = M.clamp(tx, SLOT_X - X_RANGE - CELL_X[c.cell], SLOT_X + X_RANGE - CELL_X[c.cell]);
    var y = M.clamp(BASE.y + ty, -250 - RISE, 70);
    var worldX = CELL_X[c.cell] + x;
    var zoneK = M.clamp(1 - Math.abs(worldX - SLOT_X) / 90, 0, 1) * M.clamp((-52 - RISE - (y - BASE.y)) / 40 + 0.4, 0, 1);
    var inZone = Math.abs(worldX - SLOT_X) < 62 && (y - BASE.y) < -58 - RISE;
    drag.zone = inZone;
    // near the slot the relic straightens and is pulled to its axis
    x += (SLOT_X - worldX) * 0.55 * zoneK;
    return { x: x, y: y, z: mix(BASE.z + 26, 40, zoneK), rx: mix(BASE.rx, -1, zoneK), ry: 0, rz: 0, k: zoneK };
  }

  function dragFrame(now) {
    dragRaf = 0;
    if (!drag || !drag.active) return;
    var dt = Math.min(0.05, (now - drag.last) / 1000); drag.last = now;
    var t = dragTarget(), p = drag.pose, k = 1 - Math.exp(-dt * 24);
    var lagX = t.x - p.x, lagY = t.y - p.y;
    p.x = mix(p.x, t.x, k); p.y = mix(p.y, t.y, k); p.z = mix(p.z, t.z, k);
    var kz = t.k || 0;
    // tilt from velocity: the relic trails the hand
    p.rz = mix(p.rz, M.clamp(-lagX * 0.22, -11, 11) * (1 - kz), 0.3);
    p.ry = mix(p.ry, M.clamp(lagX * 0.3, -16, 16) * (1 - kz), 0.3);
    p.rx = mix(p.rx, t.rx + M.clamp(lagY * 0.12, -6, 6), 0.3);
    M.commit(drag.c.el, p);
    var zone = drag.zone && st.ins == null;
    if (zone !== !!drag.zoneOn) {
      drag.zoneOn = zone;
      stage.classList.toggle('is-zone', zone);
      led(zone ? 'amber' : '');
      slotEl.classList.toggle('is-hot', zone);
      if (zone) { PL.audio.play('tick'); setHint(_('Let go to seat it'), 'ok'); }
      else if (!drag.seated) setHint(drag.zone && st.ins ? _('Slot taken: draw the other relic out first') : _('Let go over the slot'), 'up');
    }
    if (drag.seated) {
      var armed = drag.pull > 60;
      if (armed !== !!drag.armed) { drag.armed = armed; setHint(armed ? _('Let go to draw it out') : _('Drag down to draw it out'), armed ? 'ok' : 'down'); if (armed) PL.audio.play('tick'); }
    }
    dragRaf = requestAnimationFrame(dragFrame);
  }

  function endDrag(cancelled) {
    if (!drag) return;
    var d = drag; drag = null;
    cancelAnimationFrame(dragRaf); dragRaf = 0;
    stage.classList.remove('is-grab', 'is-zone');
    slotEl.classList.remove('is-hot');
    document.body.classList.remove('is-cart-drag');
    if (!d.active) return;                       // not dragged: this was a plain click
    lastClick = performance.now();
    var c = d.c, p = d.pose, el = c.el;
    setBusy(true);
    var done;
    if (d.seated) {
      if (!cancelled && d.pull > 60) {           // pulled far enough: eject
        led('amber');
        done = flyOut(c, null, p).then(function () { restoreHint(); });
      } else {                                   // not far enough: snaps back in
        var from = { x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz }, dx = dxOf(c);
        var a = M.play(el, function (u) {
          var k = E.spring(u, 14, 0.5);
          return { x: mix(from.x, dx, k), y: mix(from.y, SEAT, k), z: mix(from.z, 0, k), rx: mix(from.rx, 0, k), ry: mix(from.ry, 0, k), rz: mix(from.rz, 0, k) };
        }, 380);
        M.cues(a, [{ t: 0.12, fn: function () { PL.audio.play('seat'); } }]);
        done = a.finished.then(function () { el.style.zIndex = ''; settleSeated(c, a); led('green'); restoreHint(); });
      }
    } else if (!cancelled && d.zone && st.ins == null) {            // over the slot and the slot is free: insert
      var hooks = { onSeat: function () {} };
      done = dropIn(c, p, hooks).then(function () { emit('seated', { id: c.def.id, drag: true }); restoreHint(); });
    } else {                                                          // otherwise: back to the rack
      var bad = d.zone && st.ins != null;
      if (bad) { PL.audio.play('error'); setHint(_('Slot taken: draw the other relic out first'), 'no'); }
      var f2 = { x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz };
      var a2 = M.play(el, function (u) {
        var k = E.spring(u, 11, 0.55);
        return { x: mix(f2.x, 0, k), y: mix(f2.y, BASE.y, k), z: mix(f2.z, BASE.z, k), rx: mix(f2.rx, BASE.rx, k), ry: mix(f2.ry, 0, k), rz: mix(f2.rz, 0, k) };
      }, 520);
      done = a2.finished.then(function () {
        el.style.transform = ''; el.style.zIndex = '';
        el.classList.remove('is-flying', 'is-dragging');
        a2.cancel();
        shadows[c.cell].classList.remove('is-up');
        updateLeds();
        if (!bad) restoreHint(); else setTimeout(restoreHint, 1600);
      });
    }
    done.then(function () { setBusy(false); refreshState(); }, function () { setBusy(false); });
  }

  Object.keys(carts).forEach(function (id) {
    var c = carts[id], hit = c.hit;
    hit.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || st.busy || st.hold || drag) return;
      drag = { c: c, sx: e.clientX, sy: e.clientY, active: false, pid: e.pointerId };
      try { hit.setPointerCapture(e.pointerId); } catch (err) {}
    });
    hit.addEventListener('pointermove', function (e) {
      if (!drag || drag.c !== c || e.pointerId !== drag.pid) return;
      var sc = (PL.scale || 1) * (PL.rackScale || 1);
      drag.tx = (e.clientX - drag.sx) / sc; drag.ty = (e.clientY - drag.sy) / sc;
      if (!drag.active && Math.sqrt(drag.tx * drag.tx + drag.ty * drag.ty) > 6) startDrag(c, e);
    });
    var up = function (e) {
      if (drag && drag.c === c && e.pointerId === drag.pid) endDrag(e.type === 'pointercancel');
      if (e.pointerType !== 'touch' || true) setTimeout(function () { if (document.activeElement === hit) hit.blur(); }, 0);   // mouse focus must not capture the device's Enter
    };
    hit.addEventListener('pointerup', up);
    hit.addEventListener('pointercancel', up);
  });
  window.addEventListener('blur', function () { if (drag && drag.active) endDrag(true); });

  /* ---------- rack intro on load: relics rise out of their cells ---------- */
  function intro(delay) {
    if (M.reduce) return;
    clip.classList.add('rack-intro');
    var done = 0;
    defs.forEach(function (d, i) {
      var c = carts[d.id];
      var a = M.play(c.el, function (u) {
        return { y: 74 * (1 - E.spring(u, 11, 0.5)), z: 0 };
      }, 900, { delay: (delay || 0) + i * 130 });
      a.finished.then(function () {
        c.el.style.transform = ''; a.cancel();
        if (++done === defs.length) clip.classList.remove('rack-intro');
      }, function () {});
    });
  }

  renderInfo(false);
  updateLeds();

  return {
    on: on, select: select, selected: function () { return st.sel; }, inserted: function () { return st.ins; },
    insert: insert, eject: eject, isBusy: function () { return st.busy; },
    hold: function (v) { st.hold = !!v; refreshState(); },
    refresh: function () { renderInfo(false); }, intro: intro,
    cart: function (id) { return carts[id]; },
  };
})();
