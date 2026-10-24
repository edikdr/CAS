/* ==========================================================================
   Картриджи: стойка под консолью, выбор, карточка с описанием, вставка в слот.

   • Каждый картридж — настоящий 3D-объект: 14 «срезов» корпуса по 1 px (даёт толщину),
     лицевая сторона и оборот нарисованы в SVG (этикетка: цвет, название, рисунок).
   • Выбор: наведи — приподнимается и следует за курсором, клик — выбран, справа карточка.
   • «Играть»: картридж выходит из ячейки, подлетает к щели под консолью, выравнивается,
     въезжает и защёлкивается (клик, зелёный индикатор, толчок консоли).
     Если выбран боковой, сначала он меняется местами с центральным (проходит спереди).
   • «Достать»: пружинный «выстрел», выезжает и возвращается в свою ячейку.
   API: PL.carts.select(id), insert(id, hooks), eject(hooks), inserted(), on('play'|'eject'|'seated'|'eject-start', fn)
   ========================================================================== */
window.PL = window.PL || {};

PL.carts = (function () {
  var C = PL.config, M = PL.motion, E = M.E, mix = M.mix, seg = M.seg;
  var $ = function (s) { return document.querySelector(s); };
  var clip = $('#rackClip'), stage = $('#rackStage'), info = $('#cartInfo');
  var slotLed = $('#slotLed'), consoleEl = $('#console'), slotEl = $('#cartSlot');
  var defs = C.carts || [];
  var noopApi = {
    on: function () {}, select: function () {}, selected: function () { return null; }, inserted: function () { return null; },
    insert: function () { return Promise.resolve(false); }, eject: function () { return Promise.resolve(false); },
    isBusy: function () { return false; }, hold: function () {}, refresh: function () {}, intro: function () {},
  };
  if (!clip || !stage || !info || !slotEl || !defs.length) return noopApi;

  /* ---------- геометрия (координаты .rack-clip) ---------- */
  var SLOT_X = 310, PITCH = 120;         // ось щели консоли и шаг ячеек (картриджей может быть сколько угодно, ячейки симметричны щели)
  var CELL_X = defs.map(function (d, i) { return SLOT_X + (i - (defs.length - 1) / 2) * PITCH; });   // центры ячеек
  var W = 104, H = 150, D = 15;          // размеры картриджа, толщина (D срезов по 1,2 px)
  var BASE = { y: -15, z: 34, rx: -5 };  // поза «выбран» (то же, что .cart.is-sel .cart-tilt)
  var MOUTH = -44;                       // смещение, когда верх картриджа на линии щели
  var SEAT = -155;                       // смещение в слоте: внутри 80%, снаружи остаётся 30 из 150 (только стрелка ▼)
  var TS = 0.86;                         // обмен местами с центральным
  function rrp(x, y, w, h, rt, rb) {   // скруглённый прямоугольник: радиус сверху rt, снизу rb
    return 'M' + (x + rt) + ' ' + y + 'H' + (x + w - rt) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + rt) +
      'V' + (y + h - rb) + 'Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - rb) + ' ' + (y + h) +
      'H' + (x + rb) + 'Q' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - rb) + 'V' + (y + rt) + 'Q' + x + ' ' + y + ' ' + (x + rt) + ' ' + y + 'Z';
  }
  var PATH = rrp(0, 0, 104, 150, 10, 14);

  var carts = {}, order = [];            // order[ячейка] = id
  var st = { sel: null, ins: null, busy: false, hold: false };
  var handlers = {};
  function emit(n, a) { (handlers[n] || []).forEach(function (f) { f(a); }); }
  function on(n, f) { (handlers[n] = handlers[n] || []).push(f); }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ---------- цифры для карточки (считаются из данных) ---------- */
  function keys(o) { return o ? Object.keys(o).length : 0; }
  var FACTS = {
    legends: function () {
      var dex = (PL.data && PL.data.dex) || PL.dex || [];
      var n = dex.filter(function (p) { return p.leg || p.myth; }).length;
      return n ? [n, _('legendaries & mythicals')] : null;
    },
    regions: function () { var n = keys(PL.regionsRu); return n ? [n, _n(n, 'region|regions')] : null; },
    types: function () { return [18, _('types')]; },
    quiz: function () { return [15, _('questions')]; },
    people: function () { var n = (PL.charactersRu || []).length; return n ? [n, _n(n, 'hero|heroes')] : null; },
    generations: function () { var n = ((PL.world || {}).generations || []).length; return n ? [n, _n(n, 'generation|generations')] : null; },
    catchTime: function () { return [60, _('sec')]; },
    catchBalls: function () { return [8, _('ball types')]; },
    catchExp: function () { return ['+200', 'EXP']; },
    items: function () { var n = ((PL.world || {}).items || []).length; return n ? [n, _n(n, 'item|items')] : null; },
    itemGroups: function () { var g = PL.itemGroupsRu; var n = Array.isArray(g) ? g.length : keys(g); return n ? [n, _n(n, 'group|groups')] : null; },
  };

  /* ==========================================================================
     ЛИЦО И ОБОРОТ КАРТРИДЖА (SVG)
     Этикетка: x 8…96, y 12…118. Ниже (y 118…150) — только корпус со стрелкой ▼:
     когда картридж въехал на 80%, снаружи остаётся именно эта часть.
     ========================================================================== */
  var TRAINER = '<g transform="translate(28.4 57.5) scale(.79)" fill="#8d1f1c">' +
    '<path d="M19.6 10.6C19.6 3.8 24.2.6 30 .6S40.4 3.8 40.4 10.6Z"/>' +
    '<path d="M36.4 8.8C41 8.4 46.6 9.2 48.6 11.4C49 11.9 48.7 12.5 48.1 12.5L36.4 12.2Z"/>' +
    '<circle cx="33.6" cy="6" r="1.7" fill="#d9524a" opacity=".85"/>' +
    '<ellipse cx="30" cy="13.6" rx="6.3" ry="5.9"/>' +
    '<path d="M24 11.8C22 13.2 22.2 16.4 24.6 17.8L25.6 14.2Z"/>' +
    '<rect x="27.2" y="18" width="5.6" height="3.4"/>' +
    '<path d="M16.6 25C16.8 21.8 22 20 30 20S43.2 21.8 43.4 25L45.2 38.2C42 39.6 36 40.2 30 40.2S18 39.6 14.8 38.2Z"/>' +
    '<path d="M18.2 25.4 9.4 32.6" stroke="#8d1f1c" stroke-width="6.6" stroke-linecap="round" fill="none"/>' +
    '<path d="M41.8 25.4 50.6 32.6" stroke="#8d1f1c" stroke-width="6.6" stroke-linecap="round" fill="none"/>' +
    '<path d="M9.4 32.6 6.6 24.2" stroke="#8d1f1c" stroke-width="6.1" stroke-linecap="round" fill="none"/>' +
    '<path d="M50.6 32.6 53.4 24.2" stroke="#8d1f1c" stroke-width="6.1" stroke-linecap="round" fill="none"/>' +
    '<circle cx="6" cy="22.4" r="3.9"/><circle cx="54" cy="22.4" r="3.9"/>' +
    '<path d="M18.4 38.6H30.4L28.6 56.8H16.8Z"/><path d="M29.6 38.6H41.6L43.2 56.8H31.4Z"/>' +
    '<path d="M15.4 55.4H29L28.8 58.2H14.4Z"/><path d="M31 55.4H44.6L45.6 58.2H31.2Z"/>' +
    '<path d="M25 20.8C27.6 23.2 32.4 23.2 35 20.8L36.4 39H23.6Z" fill="#fff"/>' +
    '<path d="M25.2 21.2 23.4 39M34.8 21.2 36.6 39" stroke="#8d1f1c" stroke-width="1.1" fill="none"/></g>';
  var BALL = '<g transform="translate(52 80.8)">' +
    '<circle r="22.2" fill="#fff"/><circle r="18.8" fill="#f3f4f7"/>' +
    '<path d="M-18.8 0A18.8 18.8 0 0 1 18.8 0Z" fill="#e8382c"/>' +
    '<path d="M-13.6 13A18.8 18.8 0 0 0 18.8 0L8.5 2.8Z" fill="#d4d8df" opacity=".75"/>' +
    '<rect x="-18.8" y="-2.5" width="37.6" height="5" fill="#202128"/>' +
    '<circle r="7.5" fill="#f3f4f7" stroke="#202128" stroke-width="3.2"/><circle r="3.1" fill="#d6dae1"/></g>';

  /* ---------- «Master Catcher Edition»: пиксельные покеболы на траве (как на фото) ---------- */
  function catchArt() {
    var g = '', i, h;
    g += '<rect x="8" y="34" width="88" height="56" fill="#62b857"/>';
    for (i = 0; i < 60; i++) {                                    // крапчатая трава: два оттенка блоками 4×4
      h = (i * 2654435761) >>> 0;
      g += '<rect x="' + (8 + (h % 22) * 4) + '" y="' + (34 + ((h >> 8) % 14) * 4) + '" width="4" height="4" fill="' + ((h >> 16) & 1 ? '#58ab4e' : '#6cc460') + '"/>';
    }
    [[16, 52], [38, 44], [60, 86], [84, 62], [30, 80], [92, 80], [52, 38]].forEach(function (t) {   // кустики травы
      g += '<g fill="#3f8f3b" shape-rendering="crispEdges"><rect x="' + t[0] + '" y="' + t[1] + '" width="1.2" height="3"/><rect x="' + (t[0] + 2) + '" y="' + (t[1] + 1) + '" width="1.2" height="2"/><rect x="' + (t[0] - 2) + '" y="' + (t[1] + 1) + '" width="1.2" height="2"/></g>';
    });
    [['great', 12, 36], ['poke', 54, 25], ['ultra', 40, 49], ['master', 62, 60], ['premier', 84, 40], ['dusk', 0, 63]].forEach(function (b) {
      g += '<ellipse cx="' + (b[1] + 13) + '" cy="' + (b[2] + 25) + '" rx="11" ry="3" fill="#2c6a30" opacity=".28"/>';
      g += '<g transform="translate(' + b[1] + ' ' + b[2] + ')">' + PL.pixballs.svg(b[0]) + '</g>';
    });
    g += '<rect x="8" y="90" width="88" height="28" fill="#15284c"/><rect x="8" y="90" width="88" height=".9" fill="#fff" opacity=".14"/>' +
      '<text x="52" y="102.4" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="800" font-size="8.2" letter-spacing=".2" fill="#eef3ff">MASTER CATCHER</text>' +
      '<text x="52" y="112.4" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="800" font-size="8.2" letter-spacing="1.2" fill="#eef3ff">EDITION</text>';
    return g;
  }
  var ARTS = {
    arceus: '<image href="assets/cart/arceus.png" x="33.6" y="56.4" width="36.8" height="48.4" preserveAspectRatio="xMidYMid meet"/>',
    trainer: TRAINER + '<image href="assets/cart/pikachu.png" x="64" y="78" width="31" height="29" preserveAspectRatio="xMidYMid meet"/>',
    ball: BALL,
    catch: catchArt(),
  };

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
      /* корпус: матовый пластик с зерном, ступенчатыми кромками и фаской */
      '<path d="' + PATH + '" fill="url(#h-' + u + ')"/>' +
      '<g clip-path="url(#k-' + u + ')"><rect width="104" height="150" filter="url(#g-' + u + ')" opacity=".2" style="mix-blend-mode:overlay"/></g>' +
      '<path d="' + rrp(2.6, 2.6, 98.8, 144.8, 7.6, 11.6) + '" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="1"/>' +
      '<path d="' + rrp(3.5, 3.5, 97, 143, 6.8, 10.8) + '" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width=".8"/>' +
      '<path d="' + PATH + '" fill="none" stroke="url(#e-' + u + ')" stroke-width="1.7"/>' +
      /* ребристый язычок-захват сверху */
      '<rect x="30.5" y="1.8" width="43" height="7.4" rx="3.2" fill="#070709"/>' +
      '<rect x="32" y="2.6" width="40" height="5.8" rx="2.6" fill="#24252b"/>' + ridges +
      '<rect x="34" y="2.9" width="36" height="1" rx=".5" fill="#fff" opacity=".16"/>' +
      /* этикетка в углублении */
      '<rect x="5.6" y="9.6" width="92.8" height="110.8" rx="5" fill="#030304"/>' +
      '<path d="' + rrp(6.2, 10.2, 91.6, 109.6, 4.4, 4.4) + '" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width=".8"/>' +
      '<g clip-path="url(#c-' + u + ')">' +
        '<rect x="8" y="12" width="88" height="106" fill="' + d.bg + '"/>' +
        ARTS[d.art] +
        '<rect x="8" y="12" width="88" height="22" fill="#ea312a"/><rect x="8" y="33.6" width="88" height="1.2" fill="#000" opacity=".22"/>' +
        '<g fill="none" stroke="#fff" stroke-width="1.6"><circle cx="20.4" cy="23" r="5.6"/><path d="M14.8 23h11.2"/></g>' +
        '<circle cx="20.4" cy="23" r="1.9" fill="#ea312a" stroke="#fff" stroke-width="1.2"/>' +
        '<text x="29.4" y="21.5" font-family="' + FONT + '" font-weight="900" font-size="8.3" letter-spacing="1" fill="#fff">POKÉ</text>' +
        '<text x="29.4" y="30" font-family="' + FONT + '" font-weight="900" font-size="8.3" letter-spacing="1" fill="#fff">LORE</text>' +
        (d.art === 'catch' ? '' :
        '<text x="52.4" y="52.6" text-anchor="middle" font-family="' + FONT + '" font-weight="600" font-size="13.4" letter-spacing=".5" fill="#000" opacity=".22">' + esc(d.title) + '</text>' +
        '<text x="52" y="52" text-anchor="middle" font-family="' + FONT + '" font-weight="600" font-size="13.4" letter-spacing=".5" fill="' + d.tc + '">' + esc(d.title) + '</text>' +
        '<rect x="8" y="105" width="88" height="13" fill="#0b0b0e"/><rect x="8" y="105" width="88" height=".8" fill="#fff" opacity=".1"/>' +
        '<text x="52" y="114.2" text-anchor="middle" font-family="' + FONT + '" font-weight="800" font-size="' + capFs + '" letter-spacing=".25" fill="#f2f2f4"' + capAttr + '>' + esc(d.cap) + '</text>') +
        '<rect x="8" y="12" width="88" height="106" fill="url(#l-' + u + ')"/>' +
        '<rect x="8" y="12" width="88" height="106" fill="url(#s-' + u + ')"/>' +
        '<rect x="8" y="12" width="88" height="106" rx="3.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2.6"/>' +
      '</g>' +
      /* низ корпуса: желобок под этикеткой, рёбра и крупная стрелка ▼ (то, что остаётся снаружи в слоте) */
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
      '<text x="52" y="66" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="11" letter-spacing="1.6" fill="#2d2f36">POKÉLORE</text>' +
      '<rect x="64.4" y="82.4" width="23.2" height="23.2" fill="#13141a"/>' + code +
      '<g fill="#25272c"><rect x="18" y="86" width="1.4" height="18"/><rect x="21" y="86" width="2.4" height="18"/><rect x="25.4" y="86" width="1" height="18"/><rect x="28.4" y="86" width="2.8" height="18"/><rect x="33.2" y="86" width="1.4" height="18"/><rect x="36.4" y="86" width="1" height="18"/><rect x="39.4" y="86" width="2.4" height="18"/><rect x="43.8" y="86" width="1.4" height="18"/><rect x="47.4" y="86" width="1" height="18"/></g>' +
      '<rect x="14" y="131" width="76" height="16" rx="3" fill="#08080a"/>' + pins +
    '</svg>';
  }

  /* ==========================================================================
     СБОРКА СТОЙКИ
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
    el.style.setProperty('--ry0', (((defs.length - 1) / 2 - i) * 16) + 'deg');   // крайние чуть повёрнуты к щели
    var layers = '';
    for (var k = 0; k < D; k++) {
      var e = (k === 0 || k === D - 1) ? 1.5 : (k === 1 || k === D - 2) ? 0.7 : 0;   // фаска: крайние срезы чуть меньше
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
    hit.setAttribute('aria-label', _('Cartridge “{name}”: {sub}', { name: d.ru, sub: d.sub }));
    hit.style.setProperty('--cx', CELL_X[i] + 'px');
    stage.appendChild(el);
    stage.appendChild(hit);
    carts[d.id] = { def: d, el: el, hit: hit, home: i, cell: i };
    order[i] = d.id;
  });

  /* ---------- наведение, наклон за курсором, выбор ---------- */
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
      if ((PL.quiz && PL.quiz.active()) || (PL.catcher && PL.catcher.active())) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        if (st.busy || st.hold) return;
        if (st.sel !== id) select(id);                              // первый Enter — выбрать
        else emit(st.ins === id ? 'eject' : 'play', id);            // второй — вставить / достать (то же, что перетащить)
      }
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
    if (m && defs[+m[1] - 1] && !st.busy && !(PL.quiz && PL.quiz.active()) && !(PL.catcher && PL.catcher.active())) select(defs[+m[1] - 1].id);
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
     КАРТОЧКА ВЫБРАННОГО КАРТРИДЖА
     ========================================================================== */

  function cardHTML(d) {
    var inC = st.ins === d.id, idx = defs.indexOf(d) + 1;
    var facts = (d.facts || []).map(function (k) {
      var f = FACTS[k] && FACTS[k]();
      return f ? '<span><b>' + f[0] + '</b> ' + f[1] + '</span>' : '';
    }).join('');
    return '<div class="ci-top"><span>' + _('CARTRIDGE {n}/{total}', { n: pad2(idx), total: pad2(defs.length) }) + '</span>' +
      '<span class="ci-state' + (inC ? ' is-in' : '') + '"><i></i>' + (inC ? _('in console') : _('in rack')) + '</span></div>' +
      '<div class="ci-title"><b>' + esc(d.ru) + '</b><i>' + esc(d.title) + '</i></div>' +
      '<div class="ci-sub">' + esc(d.sub) + '</div>' +
      '<p class="ci-blurb">' + esc(d.blurb) + '</p>' +
      '<div class="ci-chips">' + facts + '</div>' +
      hintHTML(inC ? 'down' : 'up', inC ? _('Drag down to eject') : _('Drag up into the console slot'));
  }
  function emptyHTML() {
    return '<div class="ci-top"><span>' + _('CARTRIDGES · {n}', { n: defs.length }) + '</span><span class="ci-state"><i></i>' + (st.ins ? _('in console') : _('slot empty')) + '</span></div>' +
      '<div class="ci-title"><b>' + _('Pick a cartridge') + '</b></div>' +
      '<p class="ci-blurb">' + _('Three 15-question quizzes and the Poké Ball Catcher arcade. Click a cartridge to peek inside.') + '</p>' +
      '<div class="ci-pick">' + defs.map(function (d) {
        return '<button data-pick="' + d.id + '" style="--cc:' + d.c1 + '"><i></i>' + esc(d.short || d.ru) + '</button>';
      }).join('') + '</div>' +
      hintHTML('up', _('Drag one into the console slot'));
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
  function refreshState() {   // статус и подсказка без перерисовки всей карточки
    var d = st.sel && carts[st.sel] && carts[st.sel].def;
    if (!d || !cardEl) { if (cardEl && !d) renderInfo(false); return; }
    var inC = st.ins === d.id;
    var state = cardEl.querySelector('.ci-state');
    if (state) { state.classList.toggle('is-in', inC); state.lastChild.textContent = inC ? _('in console') : _('in rack'); }
    if (!drag) restoreHint();
  }
  /* подсказка в плашке: что сделать с картриджем (стрелка показывает направление) */
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
    if (!d) return setHint(_('Drag one into the console slot'), 'up');
    setHint(inC ? _('Drag down to eject') : _('Drag up into the console slot'), inC ? 'down' : 'up');
  }
  /* Enter / Space на кнопке карточки жмут её саму, а не «A» консоли */
  info.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
  info.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]');
    if (!b || st.busy) return;
    select(b.dataset.pick);
  });

  /* ==========================================================================
     ХОРЕОГРАФИЯ
     Картриджи не меняются местами: боковой сам едет к щели по воздуху (смещение dx), а при
     извлечении возвращается в свою ячейку. Позы — {x, y, z, rx, ry, rz} относительно ячейки.
     ========================================================================== */
  function led(s) { slotLed.className = 'slot-led' + (s ? ' is-' + s : ''); }
  function setBusy(v) { st.busy = v; stage.classList.toggle('is-busy', v); refreshState(); }
  function dxOf(c) { return SLOT_X - CELL_X[c.cell]; }          // от своей ячейки до щели

  /* путь картриджа в слот: t — секунды, возвращает позу (x = 0 — над своей ячейкой) */
  var T_IN = 2.36;
  function insertAt(t, dx) {
    var x = 0, y, z, rx, ry = 0, rz = 0, u;
    if (t < 0.16) {                                   // присесть перед рывком
      u = E.out2(seg(t, 0, 0.16));
      y = BASE.y + 6 * u; z = BASE.z; rx = BASE.rx + 3 * u;
    } else if (t < 0.74) {                            // выдернуть из ячейки и подать к консоли (боковой — ещё и по воздуху к щели)
      u = seg(t, 0.16, 0.74);
      x = dx * E.io2(u);
      y = mix(BASE.y + 6, -36, E.out5(u)); z = mix(BASE.z, 64, E.out3(u)); rx = mix(BASE.rx + 3, -7, E.out3(u));
      ry = 7 * Math.sin(2 * Math.PI * u) * (1 - u); rz = 1.8 * Math.sin(2 * Math.PI * u * 1.3) * (1 - u);
    } else if (t < 1.04) {                            // прицелиться у щели
      x = dx;
      u = E.io2(seg(t, 0.74, 1.04));
      y = mix(-36, MOUTH, u); z = mix(64, 34, u); rx = mix(-7, -1, u);
    } else if (t < 1.56) {                            // аккуратно завести в щель
      x = dx;
      u = E.io2(seg(t, 1.04, 1.56));
      y = mix(MOUTH, -88, u); z = mix(34, 6, u); rx = mix(-1, 0, u);
    } else if (t < 1.88) {                            // въезжает глубже, ускоряясь
      x = dx;
      u = E.in2(seg(t, 1.56, 1.88));
      y = mix(-88, -144, u); z = mix(6, 0, u); rx = 0;
    } else if (t < 2.04) {                            // твёрдый толчок до упора
      x = dx;
      u = E.in2(seg(t, 1.88, 2.04));
      y = mix(-144, SEAT, u); z = 0; rx = 0;
    } else {                                          // отскок после «клика»
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

  /* картридж встал в слот: фиксируем позу стилями */
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

  /* картридж отпущен у щели: от текущей позы подъезжает к ней и дальше как обычно */
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

  /* извлечение: пружинный «выстрел», вынуть вниз, подать на стойку (боковой уходит в свою ячейку) */
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
    if (!from) {                                       // обычное извлечение из слота
      M.commit(el, { x: dx, y: SEAT, z: 0, rx: 0 });
      a = M.play(el, function (u) { return outAt(u * T_OUT, dx); }, T_OUT * 1000);
      M.cues(a, [
        { t: 0.0, fn: function () { PL.audio.play('eject'); if (hooks && hooks.onEject) hooks.onEject(); } },
        { t: 0.14, fn: function () { PL.audio.play('slide'); led(''); } },
        { t: 1.15, fn: function () { shadows[c.cell].classList.remove('is-gone'); shadows[c.cell].classList.add('is-up'); } },
      ]);
    } else {                                           // вытянули рукой: дальше сама
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

  /* ---------- публичные действия ---------- */
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
    return chain.then(function () { setBusy(false); refreshState(); emit('seated', { id: id }); return true; }, function () { setBusy(false); return false; });
  }
  function eject(hooks) {
    if (st.busy || !st.ins) return Promise.resolve(false);
    setBusy(true);
    return doEject(hooks).then(function () { setBusy(false); refreshState(); return true; }, function () { setBusy(false); return false; });
  }

  /* ==========================================================================
     РУКА: картридж можно взять и перетащить. Вверх, в щель консоли — вставится; из щели вниз — достанется.
     ========================================================================== */
  var drag = null, dragRaf = 0, lastClick = 0;
  var X_RANGE = 380;                                            // насколько далеко от щели можно утащить картридж

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
    setHint(seated ? _('Drag down to eject') : _('Release over the console slot'), 'up');
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
    // у щели картридж выравнивается и тянется к её оси
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
    // наклон по скорости: картридж «тянется» за рукой
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
      if (zone) { PL.audio.play('tick'); setHint(_('Release to insert'), 'ok'); }
      else if (!drag.seated) setHint(drag.zone && st.ins ? _('Slot taken: eject the cartridge first') : _('Release over the console slot'), 'up');
    }
    if (drag.seated) {
      var armed = drag.pull > 60;
      if (armed !== !!drag.armed) { drag.armed = armed; setHint(armed ? _('Release to eject') : _('Drag down to eject'), armed ? 'ok' : 'down'); if (armed) PL.audio.play('tick'); }
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
    if (!d.active) return;                       // не потянули — это обычный клик
    lastClick = performance.now();
    var c = d.c, p = d.pose, el = c.el;
    setBusy(true);
    var done;
    if (d.seated) {
      if (!cancelled && d.pull > 60) {           // вытянули достаточно — достаём
        led('amber');
        done = flyOut(c, null, p).then(function () { restoreHint(); });
      } else {                                   // слишком мало — защёлкивается обратно
        var from = { x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz }, dx = dxOf(c);
        var a = M.play(el, function (u) {
          var k = E.spring(u, 14, 0.5);
          return { x: mix(from.x, dx, k), y: mix(from.y, SEAT, k), z: mix(from.z, 0, k), rx: mix(from.rx, 0, k), ry: mix(from.ry, 0, k), rz: mix(from.rz, 0, k) };
        }, 380);
        M.cues(a, [{ t: 0.12, fn: function () { PL.audio.play('seat'); } }]);
        done = a.finished.then(function () { el.style.zIndex = ''; settleSeated(c, a); led('green'); restoreHint(); });
      }
    } else if (!cancelled && d.zone && st.ins == null) {            // над щелью и слот свободен — вставляем
      var hooks = { onSeat: function () {} };
      done = dropIn(c, p, hooks).then(function () { emit('seated', { id: c.def.id, drag: true }); restoreHint(); });
    } else {                                                          // иначе — обратно на стойку
      var bad = d.zone && st.ins != null;
      if (bad) { PL.audio.play('error'); setHint(_('Slot taken: eject the cartridge first'), 'no'); }
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
      if (e.pointerType !== 'touch' || true) setTimeout(function () { if (document.activeElement === hit) hit.blur(); }, 0);   // мышиный фокус не должен перехватывать Enter консоли
    };
    hit.addEventListener('pointerup', up);
    hit.addEventListener('pointercancel', up);
  });
  window.addEventListener('blur', function () { if (drag && drag.active) endDrag(true); });

  /* ---------- появление стойки при загрузке: картриджи «выезжают» из ячеек ---------- */
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
