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
  var defs = (C.carts || []).map(function (d) {   // plane colour -> accent, label colours
    var p = (C.planes || {})[d.plane] || { c1: '#7FD6DF', c2: '#2E7F95' };
    return Object.assign({ c1: p.c1, c2: p.c2, bg: '#0F1B3D', tc: p.c1 }, d);
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
  var MOUTH = -44;                       // offset when the top of the relic is at the slot mouth
  var SEAT = -155;                       // offset when seated: 80% inside, the bottom 30 of 150 stays visible
  var TS = 0.86;                         // swap with the centre relic
  function rrp(x, y, w, h, rt, rb) {   // rounded rectangle: top radius rt, bottom radius rb
    return 'M' + (x + rt) + ' ' + y + 'H' + (x + w - rt) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + rt) +
      'V' + (y + h - rb) + 'Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - rb) + ' ' + (y + h) +
      'H' + (x + rb) + 'Q' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - rb) + 'V' + (y + rt) + 'Q' + x + ' ' + y + ' ' + (x + rt) + ' ' + y + 'Z';
  }
  var PATH = rrp(0, 0, 104, 150, 10, 14);

  var carts = {}, order = [];            // order[cell] = id
  var st = { sel: null, ins: null, busy: false, hold: false };
  var handlers = {};
  function emit(n, a) { (handlers[n] || []).forEach(function (f) { f(a); }); }
  function on(n, f) { (handlers[n] = handlers[n] || []).push(f); }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }


  /* ---------- numbers for the info card (computed from PL.sky) ---------- */
  var FACTS = {
    noris: function () { var n = ((PL.sky || {}).noris || []).length; return n ? [n, _n(n, 'Nori|Noris')] : null; },
    planes: function () { var n = ((PL.sky || {}).planes || []).length; return n ? [n, _n(n, 'plane|planes')] : null; },
    questions: function () { return [3, _('questions')]; },
    days: function () {
      var c = (PL.sky || {}).campaign, d = c && Math.ceil((new Date(c.endsOn + 'T23:59:59') - Date.now()) / 864e5);
      return d > 0 ? [d, _n(d, 'day left|days left')] : null;
    },
  };

  /* ==========================================================================
     RELIC FACE AND BACK (SVG)
     Label: x 8..96, y 12..118. Below it (y 118..150) only the body:
     when the relic is 80% inside the slot, exactly this part stays visible.
     ========================================================================== */
  /* label art: an official image from config (cover-cropped into the label window) */
  function artOf(d) {
    return d.art ? '<image href="' + esc(d.art) + '" x="8" y="34" width="88" height="71" preserveAspectRatio="xMidYMid slice"/>' : '';
  }

  function frontSVG(d, idx) {
    var u = d.id, FONT = 'Nunito, system-ui, sans-serif';
    var capFs = 6.6, capLen = d.cap.length * 0.63 * capFs;
    var capAttr = capLen > 76 ? ' textLength="76" lengthAdjust="spacing"' : '';
    var ridges = '';
    for (var k = 0; k < 7; k++) {
      var rx = 37.4 + k * 4.9;
      ridges += '<rect x="' + rx.toFixed(1) + '" y="3" width="1.5" height="4.4" rx=".5" fill="#08080a"/><rect x="' + (rx + 1.5).toFixed(1) + '" y="3" width=".7" height="4.4" fill="#fff" opacity=".08"/>';
    }
    var ribL = '', ribR = '';
    for (k = 0; k < 4; k++) {
      ribL += '<rect x="' + (13 + k * 4.2) + '" y="127" width="2.4" height="17" rx="1.2" fill="#08080a"/><rect x="' + (13 + k * 4.2) + '" y="127" width=".8" height="17" rx=".4" fill="#fff" opacity=".1"/>';
      ribR += '<rect x="' + (74.6 + k * 4.2) + '" y="127" width="2.4" height="17" rx="1.2" fill="#08080a"/><rect x="' + (74.6 + k * 4.2) + '" y="127" width=".8" height="17" rx=".4" fill="#fff" opacity=".1"/>';
    }
    return '<svg viewBox="0 0 104 150" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="h-' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b3c44"/><stop offset=".45" stop-color="#1f2024"/><stop offset="1" stop-color="#0d0d10"/></linearGradient>' +
        '<linearGradient id="e-' + u + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".4" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient>' +
        '<linearGradient id="s-' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>' +
        '<linearGradient id="a-' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a6c79"/><stop offset="1" stop-color="#383a43"/></linearGradient>' +
        '<linearGradient id="n-' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".85"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>' +
        '<clipPath id="c-' + u + '"><rect x="8" y="12" width="88" height="106" rx="3.5"/></clipPath>' +
        '<clipPath id="k-' + u + '"><path d="' + PATH + '"/></clipPath>' +
        '<pattern id="l-' + u + '" width="4" height="2.6" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".07"/></pattern>' +
        '<filter id="g-' + u + '" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="' + (idx * 7 + 3) + '"/><feColorMatrix type="saturate" values="0"/></filter>' +
      '</defs>' +
      /* body with grain, stepped edges and a bevel */
      '<path d="' + PATH + '" fill="url(#h-' + u + ')"/>' +
      '<g clip-path="url(#k-' + u + ')"><rect width="104" height="150" filter="url(#g-' + u + ')" opacity=".2" style="mix-blend-mode:overlay"/></g>' +
      '<path d="' + rrp(2.6, 2.6, 98.8, 144.8, 7.6, 11.6) + '" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="1"/>' +
      '<path d="' + rrp(3.5, 3.5, 97, 143, 6.8, 10.8) + '" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width=".8"/>' +
      '<path d="' + PATH + '" fill="none" stroke="url(#e-' + u + ')" stroke-width="1.7"/>' +
      /* ribbed grip on top */
      '<rect x="30.5" y="1.8" width="43" height="7.4" rx="3.2" fill="#070709"/>' +
      '<rect x="32" y="2.6" width="40" height="5.8" rx="2.6" fill="#24252b"/>' + ridges +
      '<rect x="34" y="2.9" width="36" height="1" rx=".5" fill="#fff" opacity=".16"/>' +
      /* recessed label */
      '<rect x="5.6" y="9.6" width="92.8" height="110.8" rx="5" fill="#030304"/>' +
      '<path d="' + rrp(6.2, 10.2, 91.6, 109.6, 4.4, 4.4) + '" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width=".8"/>' +
      '<g clip-path="url(#c-' + u + ')">' +
        '<rect x="8" y="12" width="88" height="106" fill="' + d.bg + '"/>' +
        artOf(d) +
        '<rect x="8" y="12" width="88" height="22" fill="#0F1B3D"/><rect x="8" y="33.6" width="88" height="1.2" fill="#000" opacity=".22"/>' +
        '<text x="52" y="27" text-anchor="middle" font-family="' + FONT + '" font-weight="900" font-size="9" letter-spacing="1.4" fill="#E8B93A">NORI-DEX</text>' +
        (
        '<text x="52.4" y="52.6" text-anchor="middle" font-family="' + FONT + '" font-weight="600" font-size="13.4" letter-spacing=".5" fill="#000" opacity=".22">' + esc(d.title) + '</text>' +
        '<text x="52" y="52" text-anchor="middle" font-family="' + FONT + '" font-weight="600" font-size="13.4" letter-spacing=".5" fill="' + d.tc + '">' + esc(d.title) + '</text>' +
        '<rect x="8" y="105" width="88" height="13" fill="#0b0b0e"/><rect x="8" y="105" width="88" height=".8" fill="#fff" opacity=".1"/>' +
        '<text x="52" y="114.2" text-anchor="middle" font-family="' + FONT + '" font-weight="800" font-size="' + capFs + '" letter-spacing=".25" fill="#f2f2f4"' + capAttr + '>' + esc(d.cap) + '</text>') +
        '<rect x="8" y="12" width="88" height="106" fill="url(#l-' + u + ')"/>' +
        '<rect x="8" y="12" width="88" height="106" fill="url(#s-' + u + ')"/>' +
        '<rect x="8" y="12" width="88" height="106" rx="3.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2.6"/>' +
      '</g>' +
      /* bottom of the body: groove under the label, ribs and the arrow (the part left outside the slot) */
      '<rect x="12" y="121.6" width="80" height="1.1" rx=".5" fill="#050506"/><rect x="12" y="122.7" width="80" height=".7" rx=".35" fill="#fff" opacity=".07"/>' +
      ribL + ribR +
      '<path d="M32.5 126.4H71.5L66.6 146.6H37.4Z" fill="url(#n-' + u + ')"/>' +
      '<path d="M32.5 126.4H71.5L66.6 146.6H37.4Z" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width=".8"/>' +
      '<path d="M41.8 131H62.2L52 144Z" fill="#000" opacity=".5" transform="translate(.5 .9)"/>' +
      '<path d="M41.8 131H62.2L52 144Z" fill="url(#a-' + u + ')"/>' +
      '<path d="M41.8 131H62.2" stroke="#fff" stroke-opacity=".28" stroke-width=".7"/>' +
      '<circle cx="9.6" cy="143.6" r="1.7" fill="#050506"/><circle cx="94.4" cy="143.6" r="1.7" fill="#050506"/>' +
    '</svg>';
  }

  function backSVG(d, idx) {
    var pins = '', code = '', i, j;
    for (i = 0; i < 12; i++) pins += '<rect x="' + (17 + i * 5.5).toFixed(1) + '" y="134" width="3.4" height="11" rx=".8" fill="#c0a05a"/><rect x="' + (17 + i * 5.5).toFixed(1) + '" y="134" width="1" height="11" rx=".5" fill="#fff" opacity=".25"/>';
    for (i = 0; i < 9; i++) for (j = 0; j < 9; j++) if (((i * 7 + j * 13 + idx * 5) % 5) < 2 || i === 0 || j === 0) code += '<rect x="' + (66 + i * 2.2).toFixed(1) + '" y="' + (84 + j * 2.2).toFixed(1) + '" width="2" height="2" fill="#30323a"/>';
    return '<svg viewBox="0 0 104 150" aria-hidden="true">' +
      '<defs><linearGradient id="bh-' + d.id + '" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34353c"/><stop offset=".55" stop-color="#1c1c20"/><stop offset="1" stop-color="#0e0e10"/></linearGradient>' +
      '<clipPath id="bk-' + d.id + '"><path d="' + PATH + '"/></clipPath>' +
      '<filter id="bg-' + d.id + '" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="' + (idx * 11 + 5) + '"/><feColorMatrix type="saturate" values="0"/></filter></defs>' +
      '<path d="' + PATH + '" fill="url(#bh-' + d.id + ')"/>' +
      '<g clip-path="url(#bk-' + d.id + ')"><rect width="104" height="150" filter="url(#bg-' + d.id + ')" opacity=".2" style="mix-blend-mode:overlay"/></g>' +
      '<path d="' + rrp(2.6, 2.6, 98.8, 144.8, 7.6, 11.6) + '" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>' +
      '<rect x="10" y="13" width="84" height="110" rx="6" fill="#101114"/>' +
      '<rect x="10.5" y="13.5" width="83" height="109" rx="5.6" fill="none" stroke="#fff" stroke-opacity=".07"/>' +
      '<g fill="#2b2d34"><rect x="18" y="24" width="46" height="3" rx="1.2"/><rect x="18" y="31" width="68" height="1.8" rx=".9"/><rect x="18" y="36" width="60" height="1.8" rx=".9"/><rect x="18" y="41" width="64" height="1.8" rx=".9"/></g>' +
      '<text x="52" y="66" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="11" letter-spacing="1.6" fill="#2d2f36">NORI-DEX</text>' +
      '<rect x="64.4" y="82.4" width="23.2" height="23.2" fill="#13141a"/>' + code +
      '<g fill="#25272c"><rect x="18" y="86" width="1.4" height="18"/><rect x="21" y="86" width="2.4" height="18"/><rect x="25.4" y="86" width="1" height="18"/><rect x="28.4" y="86" width="2.8" height="18"/><rect x="33.2" y="86" width="1.4" height="18"/><rect x="36.4" y="86" width="1" height="18"/><rect x="39.4" y="86" width="2.4" height="18"/><rect x="43.8" y="86" width="1.4" height="18"/><rect x="47.4" y="86" width="1" height="18"/></g>' +
      '<rect x="14" y="131" width="76" height="16" rx="3" fill="#08080a"/>' + pins +
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
    el.style.setProperty('--i', i);
    el.style.setProperty('--ry0', (((defs.length - 1) / 2 - i) * 16) + 'deg');   // outer relics turn slightly towards the slot
    var layers = '';
    for (var k = 0; k < D; k++) {
      var e = (k === 0 || k === D - 1) ? 1.5 : (k === 1 || k === D - 2) ? 0.7 : 0;   // bevel: outer slices are slightly smaller
      layers += '<i class="cl" style="transform:translateZ(' + ((k - (D - 1) / 2) * 1.2).toFixed(2) + 'px)' + (e ? ';inset:' + e + 'px;border-radius:' + (10 - e) + 'px ' + (10 - e) + 'px ' + (14 - e) + 'px ' + (14 - e) + 'px' : '') + '"></i>';
    }
    el.innerHTML =
      '<div class="cart-tilt"><div class="cart-3d"><div class="cart-glow"></div>' + layers +
        '<div class="cart-face cart-front">' + frontSVG(d, i) + '</div>' +
        '<div class="cart-face cart-back">' + backSVG(d, i) + '</div>' +
      '</div></div>';
    var hit = mk('div', 'cart-hit');
    hit.dataset.id = d.id;
    hit.tabIndex = 0;
    hit.setAttribute('role', 'button');
    hit.setAttribute('aria-pressed', 'false');
    hit.setAttribute('aria-label', _('Relic “{name}”: {sub}', { name: d.name, sub: d.sub }));
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

  function cardHTML(d) {
    var inC = st.ins === d.id, idx = defs.indexOf(d) + 1;
    var facts = (d.facts || []).map(function (k) {
      var f = FACTS[k] && FACTS[k]();
      return f ? '<span><b>' + f[0] + '</b> ' + f[1] + '</span>' : '';
    }).join('');
    return '<div class="ci-top"><span>' + _('RELIC {n}/{total}', { n: pad2(idx), total: pad2(defs.length) }) + '</span>' +
      '<span class="ci-state' + (inC ? ' is-in' : '') + '"><i></i>' + (inC ? _('seated') : _('in the rack')) + '</span></div>' +
      '<div class="ci-title"><b>' + esc(d.name) + '</b><i>' + esc(d.title) + '</i></div>' +
      '<div class="ci-sub">' + esc(d.sub) + '</div>' +
      '<p class="ci-blurb">' + esc(d.blurb) + '</p>' +
      '<div class="ci-chips">' + facts + '</div>' +
      hintHTML(inC ? 'down' : 'up', inC ? _('Drag down to draw it out') : _('Drag it up into the slot'));
  }
  function emptyHTML() {
    return '<div class="ci-top"><span>' + _('RELICS · {n}', { n: defs.length }) + '</span><span class="ci-state"><i></i>' + (st.ins ? _('seated') : _('slot open')) + '</span></div>' +
      '<div class="ci-title"><b>' + _('Choose a relic') + '</b></div>' +
      '<p class="ci-blurb">' + _('Four relics, four screens: the bestiary, the worlds, a spirit quiz and the campaign. Tap one to see what it holds.') + '</p>' +
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
      y = mix(BASE.y + 6, -36, E.out5(u)); z = mix(BASE.z, 64, E.out3(u)); rx = mix(BASE.rx + 3, -7, E.out3(u));
      ry = 7 * Math.sin(2 * Math.PI * u) * (1 - u); rz = 1.8 * Math.sin(2 * Math.PI * u * 1.3) * (1 - u);
    } else if (t < 1.04) {                            // aim at the slot
      x = dx;
      u = E.io2(seg(t, 0.74, 1.04));
      y = mix(-36, MOUTH, u); z = mix(64, 34, u); rx = mix(-7, -1, u);
    } else if (t < 1.56) {                            // guide it into the slot
      x = dx;
      u = E.io2(seg(t, 1.04, 1.56));
      y = mix(MOUTH, -88, u); z = mix(34, 6, u); rx = mix(-1, 0, u);
    } else if (t < 1.88) {                            // slides deeper, speeding up
      x = dx;
      u = E.in2(seg(t, 1.56, 1.88));
      y = mix(-88, -144, u); z = mix(6, 0, u); rx = 0;
    } else if (t < 2.04) {                            // firm push to the stop
      x = dx;
      u = E.in2(seg(t, 1.88, 2.04));
      y = mix(-144, SEAT, u); z = 0; rx = 0;
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

  function flyIn(c, hooks) {
    var el = c.el, dx = dxOf(c);
    el.classList.add('is-flying');
    el.style.zIndex = 6;
    shadows[c.cell].classList.add('is-up');
    var a = M.play(el, function (u) { return insertAt(u * T_IN, dx); }, T_IN * 1000);
    M.cues(a, [
      { t: 0.16, fn: function () { PL.audio.play('lift'); } },
      { t: 0.74, fn: function () { led('amber'); if (hooks && hooks.onAlign) hooks.onAlign(); } },
      { t: 1.04, fn: function () { PL.audio.play('slide'); } },
      { t: 2.04, fn: function () { seatFx(hooks); } },
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
    var el = c.el, dx = dxOf(c);
    el.classList.remove('is-seated');
    el.classList.add('is-flying');
    el.style.zIndex = 6;
    led('amber');
    emit('eject-start', { id: c.def.id });
    var a;
    if (!from) {                                       // regular eject from the slot
      M.commit(el, { x: dx, y: SEAT, z: 0, rx: 0 });
      a = M.play(el, function (u) { return outAt(u * T_OUT, dx); }, T_OUT * 1000);
      M.cues(a, [
        { t: 0.0, fn: function () { PL.audio.play('eject'); if (hooks && hooks.onEject) hooks.onEject(); } },
        { t: 0.14, fn: function () { PL.audio.play('slide'); led(''); } },
        { t: 1.15, fn: function () { shadows[c.cell].classList.remove('is-gone'); shadows[c.cell].classList.add('is-up'); } },
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
    if (st.ins) chain = chain.then(function () { return doEject(hooks); });
    chain = chain.then(function () {
      if (st.sel !== id) { select(id, true); return M.wait(460); }
      return M.wait(hovered ? 340 : 60);
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
    var y = M.clamp(BASE.y + ty, -250, 70);
    var worldX = CELL_X[c.cell] + x;
    var zoneK = M.clamp(1 - Math.abs(worldX - SLOT_X) / 90, 0, 1) * M.clamp((-52 - (y - BASE.y)) / 40 + 0.4, 0, 1);
    var inZone = Math.abs(worldX - SLOT_X) < 62 && (y - BASE.y) < -58;
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
      var sc = PL.scale || 1;
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
