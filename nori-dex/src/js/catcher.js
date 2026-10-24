/* ==========================================================================
   «Ловец» — аркада картриджа Master Catcher Edition.

   60 секунд. На поле появляется покемон и носится по нему. Нужно выбрать ПОДХОДЯЩИЙ покебол
   (правила у каждого шара свои, приоритет — справа налево) и поймать покемона бросками.
   EXP: верный шар и поймал +200 · другой шар, но поймал +50 · не поймал −100.
   Результаты попыток сохраняются в историю (localStorage).

   Бросок — как в Pokémon GO: схвати шар, смахни вверх и отпусти. Скорость смаха = дальность и
   скорость полёта, направление = куда летит, круговое движение перед броском = бросок с подкруткой.
   Вокруг покемона сужается цветное кольцо: чем меньше оно в момент попадания, тем выше шанс.
   Режим AR: камера телефона вместо фона, покемон «стоит» в комнате и чуть смещается при повороте.
   Без мыши: стрелки — прицел, A — бросок, L/R или 1–8 — шар.

   API:  PL.catcher.open(cartId) · close() · press(name) · hints() · active() · accent() · status()
         PL.catcher.on('exit' | 'hints', fn)
   ========================================================================== */
window.PL = window.PL || {};

PL.catcher = (function () {
  var GT = PL.gameTypes || {};
  var W = 768, H = 432, RS = 2;
  var DUR = 60, MAX_THROWS = 5, ENC_TIME = 22, MASTER_N = 3, RING_T = 1.7;
  var AIM_CONE = 0.62;                                 // рад (~35°): в этом конусе от направления смаха бросок сам доворачивает на покемона
  var HOME = { x: 384, y: 372 };                       // где лежит шар «в руке»
  var AX0 = 112, AX1 = 650, FY0 = 226, FY1 = 308;      // арена: по какой области ходят «ноги» покемона
  var HORIZON = 152;
  var STORE = 'pl-catch', STORE_AR = 'pl-catch-ar';
  var ACCENT = '#7fdc6a';
  var SP_CDN = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/';
  var SP_RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var crt = document.getElementById('crt');
  var listeners = {};
  var view, E = {}, cv, cx, st = null, raf = 0, lastTs = 0, seq = 0;

  /* ---------- мелочи ---------- */
  function emit(evt, d) { (listeners[evt] || []).forEach(function (f) { f(d); }); }
  function snd(n) { if (PL.audio) PL.audio.play(n); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pad(n, l) { var s = String(n); while (s.length < l) s = '0' + s; return s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n); }
  function has(p, t) { return p.t.indexOf(t) >= 0; }
  function bst(p) { return p.st.reduce(function (a, b) { return a + b; }, 0); }
  function fmtTime(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + pad(sec % 60, 2); }
  function fmtDate(ts) { var d = new Date(ts); return pad(d.getDate(), 2) + '.' + pad(d.getMonth() + 1, 2) + ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2); }
  function later(fn, ms) {
    var tk = st && st.token;
    return setTimeout(function () { if (st && st.token === tk) fn(); }, ms);
  }

  /* ==========================================================================
     ШАРЫ И ПРАВИЛА
     Порядок — слева направо в лотке; приоритет — справа налево: если подходят несколько, берём правый.
     ========================================================================== */
  var BALLS = [
    { k: 'poke',   ru: _('Покебол'),    rule: _('Все остальные покемоны'),          pw: 1.0, test: function () { return true; } },
    { k: 'great',  ru: _('Грейт-бол'),  rule: _('Средние: сумма статов от 400'),    pw: 1.3, test: function (p) { return bst(p) >= 400; } },
    { k: 'ultra',  ru: _('Ультра-бол'), rule: _('Сильные: сумма статов от 500'),    pw: 1.6, test: function (p) { return bst(p) >= 500; } },
    { k: 'fast',   ru: _('Фаст-бол'),   rule: _('Быстрые: скорость от 100'),        pw: 1.0, test: function (p) { return p.st[5] >= 100; } },
    { k: 'heavy',  ru: _('Хэви-бол'),   rule: _('Тяжёлые: от 200 кг'),              pw: 1.0, test: function (p) { return p.w >= 2000; } },
    { k: 'net',    ru: _('Нет-бол'),    rule: _('Водные и насекомые'),              pw: 1.0, test: function (p) { return has(p, 'water') || has(p, 'bug'); } },
    { k: 'dusk',   ru: _('Даск-бол'),   rule: _('Тёмные и призрачные'),             pw: 1.0, test: function (p) { return has(p, 'dark') || has(p, 'ghost'); } },
    { k: 'master', ru: _('Мастер-бол'), rule: _('Легендарные и мифические'),        pw: 99, test: function (p) { return !!(p.leg || p.myth); }, limited: true },
  ];
  var BALL = {};
  BALLS.forEach(function (b, i) { b.i = i; BALL[b.k] = b; });
  function bestBall(p) {
    for (var i = BALLS.length - 1; i >= 0; i--) if (BALLS[i].test(p)) return BALLS[i].k;
    return 'poke';
  }
  var EXP_RIGHT = 200, EXP_OTHER = 50, EXP_FAIL = -100;

  /* категории при выборе очередного покемона: поровну по шарам, легендарные редко */
  var CAT_W = { poke: 16, great: 14, ultra: 12, fast: 12, heavy: 8, net: 16, dusk: 12, master: 6 };
  var buckets = null;
  function buildBuckets() {
    buckets = {};
    (PL.dex || []).forEach(function (p) { var k = bestBall(p); (buckets[k] = buckets[k] || []).push(p); });
  }
  function pickMon() {
    if (!buckets) buildBuckets();
    var keys = Object.keys(CAT_W).filter(function (k) { return buckets[k] && buckets[k].length && (k !== 'master' || st.master > 0); });
    var tot = 0, r, i, k = keys[0];
    keys.forEach(function (x) { tot += CAT_W[x]; });
    r = Math.random() * tot;
    for (i = 0; i < keys.length; i++) { r -= CAT_W[keys[i]]; if (r <= 0) { k = keys[i]; break; } }
    var arr = buckets[k], p = null;
    for (i = 0; i < 12; i++) { p = arr[(Math.random() * arr.length) | 0]; if (!st.seen[p.id]) break; }
    st.seen[p.id] = 1;
    return p;
  }

  /* шанс поймать: у верного шара высокий, у чужого зависит от силы покемона, Мастер-бол — всегда */
  function catchChance(p, ball, q) {
    if (ball === 'master') return 1;
    var base = clamp(0.8 - bst(p) / 1100, 0.12, 0.7);
    var right = ball === bestBall(p);
    var c = right ? clamp(base * 2.8, 0.7, 0.96) : clamp(base * BALL[ball].pw, 0.07, 0.62);
    return clamp(c * q, 0.05, 0.98);
  }

  /* ==========================================================================
     СПРАЙТЫ ПОКЕМОНОВ (PokéAPI/sprites через jsDelivr → raw GitHub; без сети — силуэт)
     ========================================================================== */
  function monUrls(id) {
    var rest;
    if (id <= 386) rest = 'pokemon/versions/generation-iii/firered-leafgreen/' + id + '.png';
    else if (id <= 493) rest = 'pokemon/versions/generation-iv/platinum/' + id + '.png';
    else if (id <= 649) rest = 'pokemon/versions/generation-v/black-white/' + id + '.png';
    else rest = 'pokemon/' + id + '.png';
    var list = [SP_CDN + rest, SP_RAW + rest];
    if (rest !== 'pokemon/' + id + '.png') list.push(SP_CDN + 'pokemon/' + id + '.png', SP_RAW + 'pokemon/' + id + '.png');
    return list;
  }
  var sprites = {};
  function bboxOf(im) {
    var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    try {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d'); g.drawImage(im, 0, 0);
      var d = g.getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = -1, y1 = -1, x, y;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) throw new Error('empty');
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch (e) {
      return { x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 };      // холст «испачкан» чужим адресом: берём середину
    }
  }
  function loadSprite(id, cb) {
    var c = sprites[id];
    if (c) { if (c.done) return cb(c); c.cbs.push(cb); return; }
    c = sprites[id] = { done: false, ok: false, cbs: [cb], id: id };
    var urls = monUrls(id), i = 0;
    function finish() { c.done = true; var l = c.cbs; c.cbs = []; l.forEach(function (f) { f(c); }); }
    (function next() {
      if (i >= urls.length) return finish();
      var u = urls[i++], im = new Image(), over = false;
      var t = setTimeout(function () { if (over) return; over = true; im.onload = im.onerror = null; next(); }, 5500);
      im.crossOrigin = 'anonymous';
      im.onload = function () { if (over) return; over = true; clearTimeout(t); c.img = im; c.ok = true; c.w = im.naturalWidth || im.width; c.h = im.naturalHeight || im.height; c.bb = bboxOf(im); finish(); };
      im.onerror = function () { if (over) return; over = true; clearTimeout(t); next(); };
      im.src = u;
    })();
  }

  /* ==========================================================================
     ХРАНИЛИЩЕ: рекорд, общий опыт, история попыток
     ========================================================================== */
  function readDB() {
    try { var d = JSON.parse(localStorage.getItem(STORE) || 'null'); if (d && d.runs) return d; } catch (e) {}
    return { total: 0, best: null, runs: [] };
  }
  function writeDB(d) { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (e) {} }
  function levelOf(total) { return { lvl: 1 + Math.floor(total / 500), into: (total % 500) / 500 }; }

  /* ==========================================================================
     СБОРКА ЭКРАНА
     ========================================================================== */
  var BG = null;                     // заранее нарисованная сцена (небо, холмы, поле)
  var clouds = [];
  function build() {
    view = document.createElement('section');
    view.className = 'view view-quiz view-catch';
    view.dataset.view = 'catch';
    view.dataset.ph = 'title';
    view.innerHTML =
      '<div class="c-stage">' +
        '<canvas class="c-cv" width="' + (W * RS) + '" height="' + (H * RS) + '"></canvas>' +
        '<video class="c-vid" playsinline muted autoplay></video>' +
        '<div class="c-field"></div>' +
        '<header class="c-hud">' +
          '<div class="c-cart"><i class="q-cart-ico"></i><b>MASTER CATCHER</b></div>' +
          '<div class="c-time"><b>1:00</b><i class="c-bar"><em></em></i></div>' +
          '<div class="c-stat"><span class="c-ar">AR</span><span class="c-exp">EXP <b>0</b></span></div>' +
        '</header>' +
        '<div class="c-info"></div>' +
        '<div class="c-rule"></div>' +
        '<div class="c-tray"></div>' +
        '<div class="c-pop"></div>' +
        '<div class="c-title"><small>' + _('POKÉLORE · КАРТРИДЖ') + '</small><b>' + _('ЛОВЕЦ') + '</b><span>MASTER CATCHER EDITION</span>' +
          '<div class="c-lvl"></div><div class="c-rec"></div></div>' +
        '<div class="c-panel"></div>' +
        '<div class="q-menu" role="listbox"></div>' +
        '<div class="c-count"></div>' +
      '</div>' +
      '<div class="q-fx" aria-hidden="true"><i class="q-flash"></i><i class="q-grade"></i></div>';
    crt.insertBefore(view, crt.querySelector('.connect-osd') || crt.querySelector('.hints'));

    var q = function (s) { return view.querySelector(s); };
    cv = q('.c-cv'); cx = cv.getContext('2d');
    E = {
      stage: q('.c-stage'), vid: q('.c-vid'), field: q('.c-field'),
      time: q('.c-time b'), bar: q('.c-bar em'), timeBox: q('.c-time'), exp: q('.c-exp b'), expBox: q('.c-exp'), ar: q('.c-ar'),
      info: q('.c-info'), rule: q('.c-rule'), tray: q('.c-tray'), pop: q('.c-pop'),
      lvl: q('.c-lvl'), rec: q('.c-rec'), panel: q('.c-panel'), menu: q('.q-menu'), count: q('.c-count'), flash: q('.q-flash'),
    };

    /* лоток шаров справа: клик / тап выбирает шар */
    E.tray.innerHTML = BALLS.map(function (b) {
      return '<button class="c-ball" data-k="' + b.k + '" aria-label="' + esc(b.ru) + '"><img alt="" src="' + PL.pixballs.url(b.k, 3) + '"><i>' + (b.i + 1) + '</i><em></em></button>';
    }).join('');
    E.tray.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    E.tray.addEventListener('click', function (e) {
      var b = e.target.closest('.c-ball');
      if (b && st && st.phase === 'play') selectBall(b.dataset.k, true);
    });

    /* меню: мышь и тап */
    E.menu.addEventListener('pointermove', function (e) {
      var o = e.target.closest('.q-opt');
      if (o && e.pointerType === 'mouse' && st && st.menu && st.menu.sel !== +o.dataset.i && (e.movementX || e.movementY)) setSel(+o.dataset.i, true);
    });
    E.menu.addEventListener('click', function (e) {
      var o = e.target.closest('.q-opt');
      if (o && st && st.menu) { setSel(+o.dataset.i, true); pickMenu(); }
    });
    E.panel.addEventListener('click', function (e) {
      var r = e.target.closest('[data-row]');
      if (r && st && st.phase === 'history') { st.hist.sel = +r.dataset.row; renderHistory(); press('a'); }
    });

    /* бросок */
    E.field.addEventListener('pointerdown', onDown);
    E.field.addEventListener('pointermove', onMove);
    E.field.addEventListener('pointerup', onUp);
    E.field.addEventListener('pointercancel', onUp);

    document.addEventListener('keydown', function (e) {
      if (!st || st.phase !== 'play' || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      var n = +e.key;
      if (n >= 1 && n <= BALLS.length) { e.preventDefault(); selectBall(BALLS[n - 1].k, true); }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && st && st.phase === 'play') pauseGame(); });

    makeScene();
  }

  /* ---------- сцена: небо, солнце, холмы, поле с полосами скоса ---------- */
  function makeScene() {
    var c = document.createElement('canvas'); c.width = W * RS; c.height = H * RS;
    var g = c.getContext('2d');
    g.scale(RS, RS);
    var sk = g.createLinearGradient(0, 0, 0, HORIZON);
    sk.addColorStop(0, '#5fb6ee'); sk.addColorStop(1, '#c8ecff');
    g.fillStyle = sk; g.fillRect(0, 0, W, HORIZON + 2);
    var sun = g.createRadialGradient(612, 62, 4, 612, 62, 70);
    sun.addColorStop(0, 'rgba(255,250,200,1)'); sun.addColorStop(.3, 'rgba(255,244,170,.55)'); sun.addColorStop(1, 'rgba(255,244,170,0)');
    g.fillStyle = sun; g.fillRect(540, 0, 160, 140);
    g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(612, 62, 20, 0, 6.3); g.fill();
    // дальние холмы ступеньками (как пиксели)
    var seed = 11;
    function r2() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    [['#7cc387', 34, 26], ['#5aa862', 24, 18]].forEach(function (L) {
      var x = 0, y = HORIZON - L[1] - 4;
      g.fillStyle = L[0];
      while (x < W) {
        var w = 14 + ((r2() * 26) | 0);
        y = clamp(y + (((r2() * 5) | 0) - 2) * 4, HORIZON - L[1] - 12, HORIZON - 6);
        g.fillRect(x, y, w, HORIZON - y + 1);
        x += w;
      }
    });
    // поле
    var fl = g.createLinearGradient(0, HORIZON, 0, H);
    fl.addColorStop(0, '#74c765'); fl.addColorStop(1, '#4a9a48');
    g.fillStyle = fl; g.fillRect(0, HORIZON, W, H - HORIZON);
    for (var i = 0; i < 12; i++) {                       // полосы скоса: чем ближе, тем шире
      var y0 = HORIZON + Math.pow(i / 12, 1.7) * (H - HORIZON), y1 = HORIZON + Math.pow((i + 1) / 12, 1.7) * (H - HORIZON);
      if (i % 2) { g.fillStyle = 'rgba(255,255,255,.055)'; g.fillRect(0, y0, W, y1 - y0); }
    }
    g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(0, HORIZON, W, 2);
    // кустики травы
    for (i = 0; i < 120; i++) {
      var ty = HORIZON + 8 + Math.pow(r2(), 1.4) * (H - HORIZON - 14), k = 1 + (ty - HORIZON) / 120, tx = r2() * W;
      g.fillStyle = (i % 3) ? '#3f8f3d' : '#8fdc7c';
      g.fillRect(tx, ty, 1.3 * k, 3 * k); g.fillRect(tx + 2 * k, ty + k, 1.3 * k, 2 * k); g.fillRect(tx - 2 * k, ty + k, 1.3 * k, 2 * k);
    }
    BG = c;
    clouds = [];
    for (i = 0; i < 5; i++) clouds.push({ x: r2() * W, y: 18 + r2() * 78, s: .7 + r2() * .8, v: 4 + r2() * 8 });
  }

  /* ==========================================================================
     МЕНЮ С КУРСОРОМ ▶ (как в викторине)
     ========================================================================== */
  function showMenu(items, onPick, opts) {
    opts = opts || {};
    st.menu = { items: items, sel: opts.sel || 0, onPick: onPick, onBack: opts.onBack || null };
    E.menu.className = 'q-menu is-open' + (opts.cls ? ' ' + opts.cls : '');
    E.menu.innerHTML = items.map(function (it, i) {
      return '<button class="q-opt" data-i="' + i + '" role="option"><i class="q-cur"></i><span class="q-ot">' + esc(it) + '</span></button>';
    }).join('');
    setSel(st.menu.sel, false);
    snd('card');
    emit('hints');
  }
  function hideMenu() { if (st) st.menu = null; E.menu.className = 'q-menu'; }
  function setSel(i, sound) {
    var m = st.menu; if (!m) return;
    m.sel = i;
    for (var k = 0; k < E.menu.children.length; k++) E.menu.children[k].classList.toggle('is-sel', k === i);
    if (sound) snd('qcursor');
  }
  function pickMenu() {
    var m = st && st.menu; if (!m) return;
    snd('qpick');
    var row = E.menu.children[m.sel]; if (row) row.classList.add('is-pick');
    var f = m.onPick, i = m.sel;
    f(i);
  }

  /* ==========================================================================
     ФАЗЫ ИГРЫ
     ========================================================================== */
  function setPhase(ph) {
    st.phase = ph;
    view.dataset.ph = ph;
    emit('hints');
  }

  function newState(id) {
    return {
      id: id, token: ++seq, phase: 'title', menu: null, db: readDB(),
      ar: false, left: DUR, exp: 0, dexp: 0, caught: 0, rightN: 0, fled: 0, enc: 0, throws: 0, hits: 0, streak: 0, bestStreak: 0,
      master: MASTER_N, sel: 'poke', seen: {}, log: [], mon: null, next: null, nextMon: null, ball: null, cap: null, drag: null,
      parts: [], floats: [], ring: 0, over: false, paused: false, pad: false, ret: { x: 384, y: 200 }, hint: { fails: 0 }, lastPad: 0,
      hist: { sel: 0, top: 0, open: null, page: 0 }, rulesPage: 0, shake: 0, flashT: 0,
    };
  }

  function open(id) {
    if (!view) build();
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    if (st) close();
    st = newState(id);
    try { st.ar = localStorage.getItem(STORE_AR) === '1'; } catch (e) {}
    view.classList.remove('is-over');
    E.pop.innerHTML = ''; E.panel.innerHTML = ''; E.count.textContent = '';
    updateHud(true);
    openTitle();
    lastTs = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    return true;
  }
  function close() {
    if (!st) return;
    cancelAnimationFrame(raf); raf = 0;
    stopCam();
    st.token = ++seq;
    hideMenu();
    st = null;
  }

  /* ---------- заставка ---------- */
  function openTitle() {
    var db = st.db, L = levelOf(db.total);
    st.mon = null; st.ball = null; st.cap = null;
    setPhase('title');
    E.panel.innerHTML = '';
    E.lvl.innerHTML = _('УР. {lvl} · {total} EXP', { lvl: L.lvl, total: db.total }) + '<i><em style="width:' + Math.round(L.into * 100) + '%"></em></i>';
    E.rec.textContent = db.best != null ? _('Лучшая попытка: {best} EXP · попыток: {n}', { best: signed(db.best), n: db.runs.length }) : _('Попыток пока нет: самое время начать');
    showMenu([_('ИГРАТЬ'), _('ПРАВИЛА'), _('ИСТОРИЯ ПОПЫТОК'), _('РЕЖИМ AR: {state}', { state: st.ar ? _('ВКЛ') : _('ВЫКЛ') }), _('ВЫЙТИ')], function (i) {
      if (i === 0) startRun();
      else if (i === 1) openRules(0);
      else if (i === 2) openHistory();
      else if (i === 3) toggleAR();
      else { hideMenu(); later(function () { emit('exit', { cart: st.id }); }, 120); }
    }, { onBack: function () { hideMenu(); emit('exit', { cart: st.id }); }, cls: 'is-left' });
  }

  /* ---------- правила: три страницы ---------- */
  function ballRow(b) {
    return '<li><img alt="" src="' + PL.pixballs.url(b.k, 2) + '"><b>' + esc(b.ru) + '</b><span>' + esc(b.rule) + '</span></li>';
  }
  var RULE_PAGES = [
    function () {
      return '<h3>' + _('БРОСОК') + '</h3><ul class="c-lines">' +
        '<li><b>1</b><span>' + _('Самое простое: {tap}, и шар полетит точно в него. Или схвати шар и {swipe}.', { tap: '<em>' + _('тапни по покемону') + '</em>', swipe: '<em>' + _('смахни вверх') + '</em>' }) + '</span></li>' +
        '<li><b>2</b><span>' + _('Рамка вокруг покемона загорается, когда смах направлен на него: шар сам доворачивает и догоняет бегущую цель.') + '</span></li>' +
        '<li><b>3</b><span>' + _('Раскрути шар по кругу перед броском: {curve} загибает путь и повышает шанс.', { curve: '<em>' + _('бросок с подкруткой') + '</em>' }) + '</span></li>' +
        '<li><b>4</b><span>' + _('Цветное кольцо сужается. Чем оно меньше в момент попадания, тем надёжнее захват.') + '</span></li>' +
        '<li><b>5</b><span>' + _('Без мыши: {arrows} двигают прицел, {a} бросает, {lr} или {nums} меняют шар.', { arrows: '<em>' + _('стрелки') + '</em>', a: '<em>A</em>', lr: '<em>L / R</em>', nums: '<em>1–8</em>' }) + '</span></li>' +
        '<li><b>6</b><span>' + _('Режим {ar} включает камеру телефона: покемон бегает по твоей комнате.', { ar: '<em>AR</em>' }) + '</span></li></ul>';
    },
    function () {
      return '<h3>' + _('КАКОЙ ШАР') + '</h3><p class="c-note">' + _('Подходит несколько: берём тот, что {right} в лотке.', { right: '<em>' + _('правее') + '</em>' }) + '</p><ul class="c-balls">' +
        BALLS.slice().reverse().map(ballRow).join('') + '</ul>';
    },
    function () {
      return '<h3>EXP</h3><ul class="c-lines">' +
        '<li class="ok"><b>+200</b><span>' + _('Поймал покемона {right} шаром.', { right: '<em>' + _('верным') + '</em>' }) + '</span></li>' +
        '<li class="mid"><b>+50</b><span>' + _('Поймал, но шар был другой.') + '</span></li>' +
        '<li class="bad"><b>−100</b><span>' + _('Не поймал: покемон сбежал (пять бросков или время на него вышло).') + '</span></li>' +
        '<li><b>' + _('60с') + '</b><span>' + _('Время одной попытки. Если оно вышло, пока ловишь, захват доигрывается до конца.') + '</span></li>' +
        '<li><b>×' + MASTER_N + '</b><span>' + _('Мастер-бол ловит всегда, но таких шаров только {n} за попытку.', { n: MASTER_N }) + '</span></li>' +
        '<li><b>≡</b><span>' + _('Все попытки сохраняются в истории.') + '</span></li></ul>';
    },
  ];
  function openRules(page) {
    page = (page + RULE_PAGES.length) % RULE_PAGES.length;
    st.rulesPage = page;
    hideMenu();
    setPhase('rules');
    E.panel.innerHTML = RULE_PAGES[page]() + '<div class="c-pg">' + RULE_PAGES.map(function (x, i) { return '<i' + (i === page ? ' class="on"' : '') + '></i>'; }).join('') + '</div>';
    snd('card');
  }

  /* ---------- история попыток ---------- */
  function openHistory() {
    hideMenu();
    st.hist.sel = 0; st.hist.top = 0; st.hist.open = null;
    setPhase('history');
    renderHistory();
    snd('card');
  }
  function renderHistory() {
    var h = st.hist, runs = st.db.runs.slice().reverse();      // свежие сверху
    if (h.open != null) {
      var r = runs[h.open];
      E.panel.innerHTML = '<h3>' + _('ПОПЫТКА {date} · {exp} EXP', { date: fmtDate(r.t), exp: signed(r.exp) }) + '</h3><ul class="c-log">' +
        r.log.map(function (l) {
          var good = l.res === 'ok';
          return '<li class="' + (l.res === 'ok' ? (l.d >= EXP_RIGHT ? 'ok' : 'mid') : l.res === 'skip' ? '' : 'bad') + '"><b>' + esc(l.ru) + '</b><span>' +
            (l.res === 'ok' ? esc(BALL[l.ball] ? BALL[l.ball].ru : l.ball) + (l.d >= EXP_RIGHT ? '' : ' ' + _('(нужен {ball})', { ball: esc(BALL[l.best].ru) })) :
             l.res === 'skip' ? _('не успел') : _('сбежал')) + '</span><em>' + (l.res === 'skip' ? '' : signed(l.d)) + '</em></li>';
        }).join('') + '</ul>';
      return;
    }
    if (!runs.length) { E.panel.innerHTML = '<h3>' + _('ИСТОРИЯ ПОПЫТОК') + '</h3><p class="c-empty">' + _('Пока пусто. Сыграй первую попытку: 60 секунд.') + '</p>'; return; }
    var per = 6;
    if (h.sel < h.top) h.top = h.sel;
    if (h.sel >= h.top + per) h.top = h.sel - per + 1;
    var rows = runs.slice(h.top, h.top + per).map(function (r, k) {
      var i = h.top + k, acc = r.enc ? Math.round(r.caught / r.enc * 100) : 0;
      return '<li data-row="' + i + '" class="' + (i === h.sel ? 'is-sel ' : '') + (r.exp >= 0 ? 'pos' : 'neg') + '"><i></i><span class="n">#' + (st.db.runs.length - i) + '</span><span class="d">' + fmtDate(r.t) + '</span>' +
        '<b>' + signed(r.exp) + ' EXP</b><span class="c">' + r.caught + '/' + r.enc + ' · ' + acc + '%</span></li>';
    }).join('');
    E.panel.innerHTML = '<h3>' + _('ИСТОРИЯ ПОПЫТОК') + ' <small>' + runs.length + '</small></h3><ul class="c-hist">' + rows + '</ul>' +
      '<p class="c-note">' + _('▲▼ выбрать · A подробности · B назад') + '</p>';
  }

  /* ---------- AR-режим ---------- */
  var cam = { stream: null, pending: false, a0: null, b0: null, ox: 0, oy: 0, on: false };
  function startCam() {
    if (cam.stream) return Promise.resolve(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('nodev'));
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(function (s) {
      cam.stream = s;
      E.vid.srcObject = s;
      var pl = E.vid.play(); if (pl && pl.catch) pl.catch(function () {});
      cam.a0 = null; cam.ox = cam.oy = 0;
      window.addEventListener('deviceorientation', onOrient);
      return true;
    });
  }
  function stopCam() {
    if (cam.stream) cam.stream.getTracks().forEach(function (t) { t.stop(); });
    cam.stream = null; cam.on = false;
    if (E.vid) E.vid.srcObject = null;
    window.removeEventListener('deviceorientation', onOrient);
    cam.ox = cam.oy = 0;
    if (E.ar) E.ar.classList.remove('is-on');
  }
  function onOrient(e) {
    if (e.alpha == null || e.beta == null) return;
    if (cam.a0 == null) { cam.a0 = e.alpha; cam.b0 = e.beta; }
    var da = ((e.alpha - cam.a0 + 540) % 360) - 180, db = e.beta - cam.b0;
    cam.ox = lerp(cam.ox, clamp(-da * 7, -110, 110), 0.25);
    cam.oy = lerp(cam.oy, clamp(db * 5, -60, 60), 0.25);
  }
  /* включить камеру; если нельзя — спокойно остаёмся на нарисованном поле */
  function enableAR() {
    return startCam().then(function () { cam.on = true; E.ar.classList.add('is-on'); return true; }, function (err) {
      cam.on = false; stopCam();
      var denied = err && /NotAllowed|Permission|Security/i.test(err.name || err.message || '');
      if (PL.app && PL.app.toast) PL.app.toast(denied ? _('Камера не разрешена. Разреши доступ в браузере') : _('Камера недоступна. Нужен https или телефон'));
      return false;
    });
  }
  function refreshArItem() {
    if (!st || st.phase !== 'title' || !st.menu) return;
    var el = E.menu.children[3];
    if (el) el.querySelector('.q-ot').textContent = _('РЕЖИМ AR: {state}', { state: st.ar ? _('ВКЛ') : _('ВЫКЛ') });
  }
  function toggleAR() {
    if (!st) return;
    st.ar = !st.ar;
    try { localStorage.setItem(STORE_AR, st.ar ? '1' : '0'); } catch (e) {}
    try {   // iOS: доступ к датчикам разрешается жестом пользователя
      if (st.ar && window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(function () {});
    } catch (e) {}
    if (st.ar) {
      enableAR().then(function (ok) {
        if (!st) return;
        if (!ok) { st.ar = false; try { localStorage.setItem(STORE_AR, '0'); } catch (e) {} }
        refreshArItem();
      });
    } else stopCam();
    refreshArItem();
    snd('select');
  }

  /* ---------- старт попытки: обратный отсчёт ---------- */
  function startRun() {
    hideMenu();
    var tk = st.token;
    st.left = DUR; st.exp = 0; st.dexp = 0; st.caught = 0; st.rightN = 0; st.fled = 0; st.enc = 0; st.throws = 0; st.hits = 0; st.streak = 0; st.bestStreak = 0;
    st.master = MASTER_N; st.seen = {}; st.log = []; st.over = false; st.paused = false; st.mon = null; st.nextMon = null; st.ball = null; st.cap = null;
    st.parts = []; st.floats = []; st.sel = 'poke';
    view.classList.remove('is-over');
    setPhase('ready');
    updateHud(true); updateTray(); updateInfo();
    E.pop.innerHTML = '';
    var go = function () {
      var n = 3;
      (function tick() {
        if (!st || st.token !== tk) return;
        if (n === 0) { E.count.textContent = _('ЛОВИ!'); E.count.className = 'c-count go'; snd('qstart'); beginPlay(); setTimeout(function () { if (st && st.token === tk) E.count.className = 'c-count'; }, 700); return; }
        E.count.textContent = n; E.count.className = 'c-count'; void E.count.offsetWidth; E.count.className = 'c-count on';
        snd('tick'); n--; setTimeout(tick, 820);
      })();
    };
    prefetch();
    if (st.ar && !cam.on) enableAR().then(function () { go(); }); else go();
  }
  function prefetch() {
    var p = pickMon();
    st.nextMon = { p: p, spr: null };
    loadSprite(p.id, function (c) { if (st && st.nextMon && st.nextMon.p === p) st.nextMon.spr = c; });
  }
  function beginPlay() {
    st.tEnd = performance.now() + DUR * 1000;
    setPhase('play');
    selectBall('poke', false);
    nextEncounter(0);
  }

  /* ==========================================================================
     ПОКЕМОН: появление, движение
     ========================================================================== */
  function scaleAt(fy) { return 1.05 + (fy - FY0) / (FY1 - FY0) * 0.78; }
  function nextEncounter(delay) {
    st.mon = null;
    st.next = { at: st.clock || 0 };
    st.nextDelay = delay || 0;
  }
  function spawnNow() {
    var nm = st.nextMon;
    if (!nm) { prefetch(); nm = st.nextMon; }
    if (!nm.spr) {       // спрайт ещё грузится: подождём, но не дольше 1,6 с (потом — силуэт)
      var sp0 = sprites[nm.p.id];
      if (sp0 && sp0.done) nm.spr = sp0;
      else if ((st.sprWait = (st.sprWait || 0) + 0.12) < 1.6) { st.nextDelay = 0.12; return false; }
      else nm.spr = { ok: false, done: true };
    }
    st.sprWait = 0;
    st.nextMon = null;
    var p = nm.p, spr = nm.spr, bb = spr.ok ? spr.bb : { x: 10, y: 10, w: 76, h: 76 };
    var spe = p.st[5];
    var pat = (p.leg || p.myth) ? 'blink' : has(p, 'water') ? 'swim' : has(p, 'flying') ? 'fly' : spe >= 100 ? 'dash' : 'wander';
    var m = {
      p: p, id: p.id, best: bestBall(p), spr: spr, bb: bb, pat: pat,
      v: (40 + spe * 0.62) * (p.w >= 2000 ? 0.72 : 1),
      x: rnd(AX0 + 40, AX1 - 40), fy: rnd(FY0 + 10, FY1 - 10), lift: 0, t: 0, age: 0, wait: rnd(0.1, 0.4), dir: Math.random() < .5 ? -1 : 1,
      appear: 0, rage: 0, throws: 0, vx: 0, vy: 0, dive: false, fade: 1, dashT: 0, dv: { x: 0, y: 0 }, tx: 0, ty: 0, fy0: 0, hit: 0, blinkT: rnd(2.8, 3.8), pop: 0,
    };
    m.fy0 = m.fy;
    pickTarget(m);
    st.mon = m; st.enc++;
    st.next = null;
    st.ring = 0;
    for (var i = 0; i < 14; i++) addPart(m.x, m.fy - 30, 'dot', '#ffffff', 90);
    snd('sparkle');
    updateInfo();
    return true;
  }
  function pickTarget(m) {
    m.tx = rnd(AX0, AX1); m.ty = rnd(FY0, FY1);
    if (Math.hypot(m.tx - m.x, m.ty - m.fy) < 90) m.tx = clamp(m.x + (Math.random() < .5 ? -1 : 1) * rnd(110, 200), AX0, AX1);
  }
  function stepMon(m, dt) {
    m.t += dt; m.age += dt;
    if (m.appear < 1) m.appear = Math.min(1, m.appear + dt / 0.55);
    if (m.rage > 0) m.rage -= dt;
    if (m.hit > 0) m.hit -= dt;
    var px = m.x, py = m.fy, sp = m.v * (m.rage > 0 ? 1.1 : 1), d, k;
    m.dive = false;
    switch (m.pat) {
      case 'wander': case 'blink':
        if (m.wait > 0) m.wait -= dt;
        else {
          var dx = m.tx - m.x, dy = m.ty - m.fy; d = Math.hypot(dx, dy);
          if (d < 6) { m.wait = rnd(0.1, m.pat === 'blink' ? 0.3 : 0.55); pickTarget(m); }
          else { k = Math.min(d, sp * (m.pat === 'blink' ? 0.6 : 1) * dt); m.x += dx / d * k; m.fy += dy / d * k * 0.85; }
        }
        if (m.pat === 'blink') {                       // легендарные «мигают»: исчезают и появляются в другом месте
          m.blinkT -= dt;
          if (m.blinkT < 0.28) m.fade = clamp(m.blinkT / 0.28, 0, 1);
          if (m.blinkT <= 0) { m.x = rnd(AX0, AX1); m.fy = rnd(FY0, FY1); pickTarget(m); m.blinkT = rnd(3.2, 4.4); for (var i = 0; i < 12; i++) addPart(m.x, m.fy - 40, 'dot', '#e8d0ff', 80); }
          else if (m.blinkT > 0.28 && m.fade < 1) m.fade = Math.min(1, m.fade + dt / 0.25);
        }
        break;
      case 'dash':
        if (m.dashT > 0) {
          m.dashT -= dt; m.x += m.dv.x * dt; m.fy += m.dv.y * dt;
          if (m.x < AX0 || m.x > AX1) { m.dv.x *= -1; m.x = clamp(m.x, AX0, AX1); }
          if (m.fy < FY0 || m.fy > FY1) { m.dv.y *= -1; m.fy = clamp(m.fy, FY0, FY1); }
          if (Math.random() < dt * 20) addPart(m.x, m.fy - 20, 'dot', 'rgba(255,255,255,.8)', 30);
        } else {
          m.wait -= dt;
          if (m.wait <= 0) {
            var ang = rnd(0, 6.283); m.dv = { x: Math.cos(ang) * sp * 1.8, y: Math.sin(ang) * sp * 0.8 };
            if ((m.x < AX0 + 80 && m.dv.x < 0) || (m.x > AX1 - 80 && m.dv.x > 0)) m.dv.x *= -1;
            m.dashT = rnd(0.24, 0.42); m.wait = rnd(0.45, 0.95);
          }
        }
        break;
      case 'fly':
        m.x += m.dir * sp * 0.85 * dt;
        if (m.x < AX0) { m.x = AX0; m.dir = 1; } else if (m.x > AX1) { m.x = AX1; m.dir = -1; }
        m.fy = m.fy0 + Math.sin(m.t * 0.9) * 30; m.lift = 54 + Math.sin(m.t * 1.9) * 22;
        break;
      case 'swim':
        m.x += m.dir * sp * 0.9 * dt;
        if (m.x < AX0) { m.x = AX0; m.dir = 1; } else if (m.x > AX1) { m.x = AX1; m.dir = -1; }
        m.fy = m.fy0 + Math.sin(m.t * 1.6) * 28;
        k = m.t % 4.2; m.dive = k > 3.7;                              // периодически ныряет: в этот момент не поймать
        m.fade = m.dive ? 0.28 : 1;
        if (m.dive && Math.random() < dt * 14) addPart(m.x, m.fy - 6, 'dot', '#cfeaff', 40);
        break;
    }
    m.fy = clamp(m.fy, FY0 - 40, FY1 + 20);
    m.vx = (m.x - px) / Math.max(dt, 0.001); m.vy = (m.fy - py) / Math.max(dt, 0.001);
  }
  /* центр покемона на экране (с учётом сдвига от поворота телефона) и радиус попадания */
  function monGeom(m) {
    var s = scaleAt(m.fy), bb = m.bb, bob = Math.abs(Math.sin(m.t * 8)) * (Math.hypot(m.vx, m.vy) > 25 ? 3 : 0.6);
    var ox = cam.on ? cam.ox : 0, oy = cam.on ? cam.oy * 0.5 : 0;
    var pop = 1 + (m.appear < 1 ? (1 - m.appear) * 0.35 : 0) + (m.hit > 0 ? m.hit * 0.25 : 0);
    var bh = bb.h * s * 0.5;
    return { s: s, x: m.x + ox, fy: m.fy + oy, lift: m.lift, bob: bob, cx: m.x + ox, cy: m.fy + oy - m.lift - bh - bob, r: Math.max(bb.w, bb.h) * s * 0.5 * 1.08 + 10, pop: pop };
  }
  function hittable(m) { return m && m.appear >= 0.85 && !m.dive && m.fade > 0.7 && !st.cap; }

  /* ==========================================================================
     ВВОД: бросок смахиванием (мышь / тач)
     ========================================================================== */
  function toLocal(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  function canThrow() { return st && st.phase === 'play' && !st.paused && !st.cap && !st.ball && st.left > 0 && st.mon && st.mon.appear > 0.4 && !(BALL[st.sel].limited && st.master <= 0); }
  function onDown(e) {
    if (!st || st.phase !== 'play' || st.paused) return;
    e.preventDefault();
    try { E.field.setPointerCapture(e.pointerId); } catch (er) {}
    st.pad = false;
    if (!canThrow()) { if (BALL[st.sel].limited && st.master <= 0 && !st.ball && !st.cap) { snd('error'); pop(_('МАСТЕР-БОЛЫ КОНЧИЛИСЬ'), 'bad', 900); } return; }
    var p = toLocal(e);
    st.drag = { id: e.pointerId, x: p.x, y: p.y, o: { x: p.x, y: p.y }, pts: [{ x: p.x, y: p.y, t: e.timeStamp }], t0: e.timeStamp, spin: 0 };
    snd('tick');
  }
  function onMove(e) {
    var d = st && st.drag; if (!d || e.pointerId !== d.id) return;
    /* на слабом устройстве события склеиваются в один кадр: берём все промежуточные точки с их настоящим временем */
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (!evs || !evs.length) evs = [e];
    evs.forEach(function (ev) {
      var p = toLocal(ev);
      d.x = p.x; d.y = p.y;
      d.pts.push({ x: p.x, y: p.y, t: ev.timeStamp });
    });
    var now = e.timeStamp;
    while (d.pts.length > 2 && now - d.pts[0].t > 300) d.pts.shift();
    var a0 = d.pts[Math.max(0, d.pts.length - 5)], b0 = d.pts[d.pts.length - 1], ml = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    var cx0 = b0.x - d.o.x, cy0 = b0.y - d.o.y, cl0 = Math.hypot(cx0, cy0);
    d.lock = cl0 > 30 && b0.y < d.o.y ? lockOn(d.o, { x: cx0 / cl0, y: cy0 / cl0 }, 0.7) : null;
    var tn = turnOf(d.pts);
    var spin = Math.abs(tn.turn) > 1.0 && tn.len > 70;
    if (spin && !d.spin) snd('sparkle');
    d.spin = spin;
  }
  /* суммарный поворот направления движения по точкам (радианы) и длина пути */
  function turnOf(pts) {
    var turn = 0, len = 0, i;
    for (i = 2; i < pts.length; i++) {
      var ux = pts[i - 1].x - pts[i - 2].x, uy = pts[i - 1].y - pts[i - 2].y, wx = pts[i].x - pts[i - 1].x, wy = pts[i].y - pts[i - 1].y;
      if (Math.hypot(ux, uy) < 1.2 || Math.hypot(wx, wy) < 1.2) continue;
      turn += Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy);
      len += Math.hypot(wx, wy);
    }
    return { turn: turn, len: len };
  }
  function onUp(e) {
    var d = st && st.drag; if (!d || e.pointerId !== d.id) return;
    st.drag = null;
    var now = e.timeStamp;
    var pts = d.pts.filter(function (q) { return now - q.t <= 300; });
    if (Math.hypot(d.x - d.o.x, d.y - d.o.y) < 18 && now - d.t0 < 380) return tapThrow({ x: d.x, y: d.y });
    if (pts.length < 2) { st.hint.fails++; st.lastFlick = { n: pts.length }; hintThrow(); return; }
    /* скорость: берём большее из окон 110 и 220 мс (пальцы обычно чуть тормозят перед отпусканием) */
    function win(ms) {
      var r = pts.filter(function (q) { return now - q.t <= ms; });
      if (r.length < 2) r = pts.slice(-3);
      var a = r[0], b = r[r.length - 1], dt = Math.max(16, b.t - a.t), vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
      return { vx: vx, vy: vy, sp: Math.hypot(vx, vy), a: a, b: b };
    }
    var w1 = win(110), w2 = win(220), w = w1.sp >= w2.sp * 0.8 ? w1 : w2;
    var sp = Math.max(w1.sp, w2.sp * 0.9), dir = { x: w.vx / (w.sp || 1), y: w.vy / (w.sp || 1) };
    /* подкрутка: суммарный поворот направления движения за последние ~300 мс */
    var tn = turnOf(pts), turn = tn.turn, len = tn.len;
    var curve = (Math.abs(turn) > 1.15 && len > 90) ? clamp(turn * 36, -110, 110) : 0;
    /* направление смаха = хорда от места, где взял шар, до места, где отпустил (она точнее «мгновенной» скорости из пары последних точек) */
    var O = d.o, cdx = d.x - O.x, cdy = d.y - O.y, cl = Math.hypot(cdx, cdy);
    if (!curve && cl > 40 && now - d.t0 < 700 && (cdx * dir.x + cdy * dir.y) / cl > 0.6) dir = { x: cdx / cl, y: cdy / cl };
    else O = pts[0];
    st.lastFlick = { n: pts.length, sp: +sp.toFixed(2), dx: +dir.x.toFixed(2), dy: +dir.y.toFixed(2), turn: +turn.toFixed(2), len: Math.round(len) };
    if (dir.y > -0.12 || sp < 0.16) {                     // не вверх или совсем вяло
      st.hint.fails++; hintThrow(); return;
    }
    st.hint.fails = 0;
    launch({ x: w.b.x, y: w.b.y }, dir, sp, curve, false, O);
  }
  /* быстрый тап: бросок в точку касания (по покемону — точно в него); тап по самому шару — подсказка */
  function tapThrow(pt) {
    var m = st.mon, g = m && monGeom(m);
    var onMon = g && Math.hypot(pt.x - g.cx, pt.y - g.cy) <= g.r * 1.5 + 26;
    if (!onMon && pt.y > HOME.y - 70) { st.hint.fails++; hintThrow(); return; }
    var dx = pt.x - HOME.x, dy = Math.min(pt.y - HOME.y, -40), L = Math.hypot(dx, dy);
    st.hint.fails = 0;
    st.lastFlick = { tap: 1 };
    launch({ x: HOME.x, y: HOME.y }, { x: dx / L, y: dy / L }, 1.3, 0, onMon);
  }
  function hintThrow() { floatText(HOME.x, HOME.y - 44, _('СМАХНИ ВВЕРХ ИЛИ ТАПНИ'), '#fff', 0.9); snd('error'); }

  /* Автонаведение. Если смах идёт примерно в сторону покемона (в конусе AIM_CONE), шар доворачивает
     на упреждающую точку, а недолёт растягивается до цели: достаточно «примерно туда». */
  function lockOn(O, dir, T, force) {          // O — начало линии прицеливания (откуда пошёл смах)
    var m = st.mon; if (!m || !hittable(m)) return null;
    var g = monGeom(m), pred = { x: g.cx + m.vx * T * 0.9, y: g.cy + m.vy * T * 0.6 };
    var vx = pred.x - O.x, vy = pred.y - O.y;
    if (Math.hypot(vx, vy) < 24) return null;
    var ang = Math.abs(Math.atan2(dir.x * vy - dir.y * vx, dir.x * vx + dir.y * vy));
    if (ang > AIM_CONE && !force) return null;
    return { x: pred.x, y: pred.y, k: force ? 1 : ang < 0.25 ? 1 : 1 - (ang - 0.25) / (AIM_CONE - 0.25) * 0.55, ang: ang };
  }
  /* бросок: P0 — откуда, dir — направление, sp — скорость смаха (px/мс), curve — подкрутка */
  function launch(P0, dir, sp, curve, force, O) {
    var D = clamp(120 + sp * 70, 130, 430), T = clamp(1.0 - sp * 0.14, 0.42, 1.0);
    var A = { x: P0.x + dir.x * D, y: P0.y + dir.y * D };
    A.y = Math.max(A.y, HORIZON - 20);
    var lk = lockOn(O || P0, dir, T, force);
    if (lk) { A.x = lerp(A.x, lk.x, lk.k); A.y = lerp(A.y, lk.y, lk.k); }
    if (st.lastFlick) st.lastFlick.lk = lk ? +lk.k.toFixed(2) : 0;
    startBall(P0, A, T, curve, sp);
  }
  function startBall(P0, A, T, curve, sp) {
    var b = BALL[st.sel];
    st.ball = { k: b.k, p0: P0, a: A, T: T, t: 0, cur: curve, rot: 0, x: P0.x, y: P0.y, e: 0, sc: 1, hit: false, sp: sp || 2 };
    st.throws++; st.mon.throws++;
    if (b.limited) { st.master--; updateTray(); }
    snd('throw');
  }
  /* бросок с клавиатуры / геймпада: летит в прицел */
  function padThrow() {
    if (!canThrow()) { if (st && st.phase === 'play' && BALL[st.sel].limited && st.master <= 0) { snd('error'); pop(_('МАСТЕР-БОЛЫ КОНЧИЛИСЬ'), 'bad', 900); } return; }
    var r = st.ret, aim = { x: r.x, y: r.y };
    if (st.mon) {                                       // небольшая помощь: прицел подтягивается к упреждающей точке
      var g = monGeom(st.mon), pred = { x: g.cx + st.mon.vx * 0.7 * 0.9, y: g.cy + st.mon.vy * 0.4 };
      var dd = Math.hypot(aim.x - pred.x, aim.y - pred.y);
      if (dd < 210) { var kk = clamp(1.2 - dd / 190, 0.35, 1); aim = { x: lerp(aim.x, pred.x, kk), y: lerp(aim.y, pred.y, kk) }; }
    }
    startBall({ x: HOME.x, y: HOME.y }, aim, 0.7, 0, 2.2);
  }

  /* ---------- полёт шара ---------- */
  var RING_COL = ['#ff4a4a', '#ff9a3a', '#ffe14a', '#6dff7a'];
  function ringRatio() { var ph = (st.ring % RING_T) / RING_T; return 1 - ph * 0.78; }      // 1 → 0.22
  function ringColor(q) { return q <= 0.34 ? RING_COL[0] : q <= 0.52 ? RING_COL[1] : q <= 0.7 ? RING_COL[2] : RING_COL[3]; }
  function stepBall(dt) {
    var b = st.ball; if (!b) return;
    if (b.land) {                                       // упал мимо: подпрыгивает и исчезает
      b.land += dt;
      if (b.land > 0.9) { st.ball = null; afterMiss(); }
      return;
    }
    b.t += dt;
    var u = clamp(b.t / b.T, 0, 1), e = 1 - Math.pow(1 - u, 1.6);
    var arc = Math.sin(Math.PI * e) * (50 + Math.hypot(b.a.x - b.p0.x, b.a.y - b.p0.y) * 0.16);
    b.e = e;
    b.x = lerp(b.p0.x, b.a.x, e) + Math.sin(Math.PI * e) * b.cur;
    b.y = lerp(b.p0.y, b.a.y, e) - arc;
    b.sc = 1 - 0.52 * e;
    b.rot += dt * (b.cur ? 16 : 7) * (b.cur < 0 ? -1 : 1);
    if (Math.random() < dt * 40) addPart(b.x, b.y, 'dot', b.cur ? '#b8f7ff' : 'rgba(255,255,255,.85)', 24);
    var m = st.mon;
    if (m && e > 0.5) {
      var g = monGeom(m), rr = g.r * (b.cur ? 1.2 : 1.1) + 12 * b.sc;
      if (hittable(m) && Math.hypot(b.x - g.cx, b.y - g.cy) <= rr) return onHit(b, g);
    }
    if (u >= 1) {
      if (m) {          // добивающая «подтяжка»: почти попал — считаем попаданием
        var g2 = monGeom(m);
        if (hittable(m) && Math.hypot(b.x - g2.cx, b.y - g2.cy) <= g2.r * 1.6 + 18) return onHit(b, g2);
        if (m.dive && Math.hypot(b.x - g2.cx, b.y - g2.cy) <= g2.r * 1.1) floatText(g2.cx, g2.cy - 40, _('НЫРНУЛ!'), '#cfeaff', 1);
      }
      b.land = 0.001; b.lx = b.x; b.ly = b.y;
      snd('click');
    }
  }
  function afterMiss() {
    var m = st.mon; if (!m) return;
    m.rage = 2.2;
    floatText(m.x, monGeom(m).cy - 30, _('МИМО'), '#fff', 0.9);
    if (m.throws >= MAX_THROWS) fleeNow('throws');
  }

  /* ==========================================================================
     ПОПАДАНИЕ И ЗАХВАТ
     ========================================================================== */
  function onHit(b, g) {
    var m = st.mon;
    var q = 1, label = '', col = '#fff';
    var rm = ringRatio(), ringR = m.ringMax || g.r * 1.45;
    ringR = g.r * 1.2 * rm;
    if (Math.hypot(b.x - g.cx, b.y - g.cy) <= ringR + 10) {
      if (rm <= 0.34) { q = 1.5; label = _('ОТЛИЧНО!'); col = '#ff6a5a'; }
      else if (rm <= 0.7) { q = 1.25; label = _('ЗДОРОВО!'); col = '#ffd24a'; }
      else { q = 1.1; label = _('ХОРОШО'); col = '#7dffaa'; }
    }
    if (b.cur) { q *= 1.15; label = (label ? label + ' ' : '') + _('ПОДКРУТКА'); if (!col || col === '#fff') col = '#9ff4ff'; }
    st.hits++;
    st.ball = null;
    m.hit = 0.4; st.flashT = 0.12; st.shake = 0.12;
    snd('ballhit');
    if (label) floatText(g.cx, g.cy - g.r - 12, label, col, 1.1);
    for (var i = 0; i < 16; i++) addPart(b.x, b.y, 'dot', '#fff', 120);
    var ok = Math.random() < catchChance(m.p, b.k, q);
    st.cap = { k: b.k, x: g.cx, y: g.cy, gx: g.x, gy: g.fy, t: 0, ph: 'open', ok: ok, shakes: ok ? 3 : 1 + ((Math.random() * 3) | 0), done: 0, q: q, rot: 0, ping: 0, s: g.s, label: label };
    snd('ballcatch');
  }

  function stepCap(dt) {
    var c = st.cap; if (!c) return;
    var m = st.mon;
    c.t += dt;
    switch (c.ph) {
      case 'open':                                                   // покемон втягивается красным светом
        if (c.t >= 0.34) { c.ph = 'drop'; c.t = 0; c.by = c.y; c.vy = -40; m.vis = 0; }
        break;
      case 'drop': {
        c.vy += 900 * dt; c.by += c.vy * dt;
        if (c.by >= c.gy - 4) { c.by = c.gy - 4; c.vy = -c.vy * 0.38; c.bounces = (c.bounces || 0) + 1; if (Math.abs(c.vy) < 60 || c.bounces > 2) { c.ph = 'wait'; c.t = 0; c.vy = 0; snd('click'); } else snd('tick'); }
        break;
      }
      case 'wait':
        if (c.t >= 0.38) { c.ph = 'shake'; c.t = 0; c.ping = 0; }
        break;
      case 'shake': {
        var T = 0.8;
        c.rot = Math.sin(Math.min(1, c.t / 0.5) * Math.PI * 2) * 0.42 * (c.t < 0.5 ? 1 : 0);
        if (c.t >= 0.5 && !c.ping) { c.ping = 1; snd('ballping'); }
        if (c.t >= T) {
          c.done++; c.t = 0; c.ping = 0; c.rot = 0;
          if (!c.ok && c.done >= c.shakes) { c.ph = 'break'; c.t = 0; snd('error'); flash('bad'); breakOut(); }
          else if (c.ok && c.done >= c.shakes) { c.ph = 'click'; c.t = 0; snd('ballshut'); }
        }
        break;
      }
      case 'click':
        if (c.t >= 0.12 && !c.fx) { c.fx = 1; for (var i = 0; i < 26; i++) addPart(c.x, c.gy - 14, 'star', ['#ffe14a', '#fff', '#7dffaa', '#ff9ad0'][i % 4], 160); snd('qwin'); caught(); }
        if (c.t >= 1.0) { st.cap = null; }
        break;
      case 'break':
        if (c.t >= 0.5) { st.cap = null; }
        break;
    }
  }
  function breakOut() {                                              // шар раскрылся: покемон на месте
    var m = st.mon, c = st.cap;
    m.vis = 1; m.appear = 0.4; m.x = c.x; m.fy = c.gy; m.rage = 2.6; m.wait = 0.2;
    pickTarget(m);
    floatText(c.x, c.gy - 70, _('ВЫРВАЛСЯ!'), '#ff8a6a', 1.1);
    for (var i = 0; i < 18; i++) addPart(c.x, c.gy - 20, 'dot', '#ff7a5a', 110);
    if (m.throws >= MAX_THROWS) later(function () { fleeNow('throws'); }, 650);
  }
  function caught() {
    var m = st.mon, c = st.cap, right = c.k === m.best, d = right ? EXP_RIGHT : EXP_OTHER;
    st.exp += d; st.caught++; if (right) st.rightN++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak);
    st.log.push({ id: m.id, ru: m.p.ru, best: m.best, ball: c.k, res: 'ok', d: d, th: m.throws, q: c.label });
    pop('<b>' + _('ПОЙМАН!') + '</b> ' + esc(m.p.ru) + '<small>' + signed(d) + ' EXP' + (right ? ' · ' + _('верный шар') : ' · ' + _('нужен был {ball}', { ball: esc(BALL[m.best].ru) })) + '</small>', right ? 'good' : 'ok', 1500);
    expFloat(d);
    updateHud(false);
    st.mon = null;
    nextEncounter(1.15);
    updateInfo();
  }
  function fleeNow(why) {
    var m = st.mon; if (!m || st.cap) return;
    var d = EXP_FAIL;
    st.exp += d; st.fled++; st.streak = 0;
    st.log.push({ id: m.id, ru: m.p.ru, best: m.best, ball: null, res: 'fled', d: d, th: m.throws });
    var g = monGeom(m);
    st.runAway = { id: m.id, spr: m.spr, bb: m.bb, x: g.x, fy: g.fy, lift: m.lift, s: g.s, dir: m.x < W / 2 ? -1 : 1, t: 0 };
    snd('flee'); flash('bad'); st.shake = 0.2;
    pop('<b>' + _('СБЕЖАЛ!') + '</b> ' + esc(m.p.ru) + '<small>' + signed(d) + ' EXP · ' + _('нужен был {ball}', { ball: esc(BALL[m.best].ru) }) + '</small>', 'bad', 1500);
    expFloat(d);
    updateHud(false);
    st.mon = null; st.ball = null;
    nextEncounter(1.0);
    updateInfo();
  }

  /* ==========================================================================
     ВРЕМЯ, ЗАВЕРШЕНИЕ ПОПЫТКИ
     ========================================================================== */
  function finishRun() {
    if (st.phase === 'result') return;
    var m = st.mon;
    if (m && !st.cap) {              // время вышло в разгар ловли: если уже бросал — покемон убежал
      if (m.throws > 0) {
        st.exp += EXP_FAIL; st.fled++; st.streak = 0;
        st.log.push({ id: m.id, ru: m.p.ru, best: m.best, ball: null, res: 'fled', d: EXP_FAIL, th: m.throws });
        expFloat(EXP_FAIL);
      } else {
        st.log.push({ id: m.id, ru: m.p.ru, best: m.best, ball: null, res: 'skip', d: 0, th: 0 });
        st.enc--;
      }
    }
    st.mon = null; st.ball = null; st.drag = null;
    var run = { t: Date.now(), exp: st.exp, caught: st.caught, right: st.rightN, enc: st.enc, fled: st.fled, throws: st.throws, hits: st.hits, streak: st.bestStreak, ar: !!cam.on, log: st.log };
    var db = readDB(), newBest = db.best == null || run.exp > db.best;
    db.runs.push(run); while (db.runs.length > 40) db.runs.shift();
    db.total = Math.max(0, db.total + run.exp);
    if (newBest) db.best = run.exp;
    writeDB(db); st.db = db;
    snd('timeup');
    later(function () { showResult(run, newBest); }, 650);
    setPhase('result');
    view.classList.add('is-over');
    E.panel.innerHTML = '';
    pop('<b>' + _('ВРЕМЯ!') + '</b>', 'info', 700);
  }
  function showResult(run, newBest, quiet) {
    var acc = run.throws ? Math.round(run.hits / run.throws * 100) : 0;
    var L = levelOf(st.db.total);
    E.panel.innerHTML =
      '<h3>' + _('РЕЗУЛЬТАТ') + (newBest ? ' <em class="rec">' + _('НОВЫЙ РЕКОРД!') + '</em>' : '') + '</h3>' +
      '<div class="c-big ' + (run.exp >= 0 ? 'pos' : 'neg') + '">' + signed(run.exp) + '<small>EXP</small></div>' +
      '<div class="c-sum"><span><b>' + run.caught + '/' + run.enc + '</b>' + _('поймано') + '</span><span><b>' + run.right + '</b>' + _('верным шаром') + '</span><span><b>' + acc + '%</b>' + _('меткость') + '</span><span><b>' + run.streak + '</b>' + _('серия') + '</span></div>' +
      '<ul class="c-chips">' + run.log.slice(0, 12).map(function (l) {
        return '<li class="' + (l.res === 'ok' ? (l.d >= EXP_RIGHT ? 'ok' : 'mid') : l.res === 'skip' ? 'skip' : 'bad') + '">' + esc(l.ru) + ' <b>' + (l.res === 'skip' ? '·' : signed(l.d)) + '</b></li>';
      }).join('') + '</ul>' +
      '<div class="c-lvl c-lvl--r">' + _('УР. {lvl} · {total} EXP', { lvl: L.lvl, total: st.db.total }) + '<i><em style="width:' + Math.round(L.into * 100) + '%"></em></i></div>';
    if (!quiet) snd(run.exp > 0 ? 'qwin' : 'qlose');
    showMenu([_('ЕЩЁ РАЗ'), _('ИСТОРИЯ'), _('ВЫЙТИ')], function (i) {
      hideMenu();
      if (i === 0) startRun();
      else if (i === 1) { st.hist.back = 'result'; openHistory(); }
      else later(function () { emit('exit', { cart: st.id }); }, 120);
    }, { onBack: function () { hideMenu(); emit('exit', { cart: st.id }); }, cls: 'is-bar is-result' });
  }

  /* ---------- пауза ---------- */
  function pauseGame() {
    if (!st || st.phase !== 'play' || st.paused) return;
    st.paused = true; st.drag = null; st.leftAtPause = st.left;
    view.classList.add('is-paused');
    showMenu([_('ПРОДОЛЖИТЬ'), _('В МЕНЮ')], function (i) {
      hideMenu();
      if (i === 0) resumeGame();
      else { st.paused = false; view.classList.remove('is-paused'); stopRunToTitle(); }
    }, { onBack: function () { hideMenu(); resumeGame(); }, cls: 'is-pause' });
  }
  function resumeGame() { if (!st) return; st.tEnd = performance.now() + (st.leftAtPause != null ? st.leftAtPause : st.left) * 1000; st.paused = false; view.classList.remove('is-paused'); emit('hints'); }
  function stopRunToTitle() {
    st.mon = null; st.ball = null; st.cap = null; st.drag = null; st.next = null; st.nextMon = null; st.over = false;
    E.pop.innerHTML = '';
    view.classList.remove('is-over');
    openTitle();
  }

  /* ==========================================================================
     ВЫБОР ШАРА, ЛОТОК, ИНФОРМАЦИЯ О ПОКЕМОНЕ
     ========================================================================== */
  function selectBall(k, sound) {
    if (!BALL[k]) return;
    st.sel = k;
    updateTray();
    var b = BALL[k];
    E.rule.innerHTML = '<b>' + esc(b.ru) + '</b><span>' + esc(b.rule) + '</span>';
    E.rule.classList.remove('is-pulse'); void E.rule.offsetWidth; E.rule.classList.add('is-pulse');
    if (sound) snd(b.limited && st.master <= 0 ? 'error' : 'lift');
  }
  function cycleBall(d) {
    var i = (BALL[st.sel].i + d + BALLS.length) % BALLS.length;
    selectBall(BALLS[i].k, true);
  }
  function updateTray() {
    if (!st) return;
    Array.prototype.forEach.call(E.tray.children, function (el) {
      var k = el.dataset.k;
      el.classList.toggle('is-sel', k === st.sel);
      el.classList.toggle('is-empty', !!(BALL[k].limited && st.master <= 0));   // !!: toggle(x, undefined) переключал бы класс
      if (BALL[k].limited) el.querySelector('em').textContent = '×' + st.master;
    });
  }
  function updateInfo() {
    var m = st && st.mon;
    if (!m) { E.info.classList.remove('is-on'); return; }
    var p = m.p;
    E.info.innerHTML =
      '<div class="c-in"><b>' + esc(p.ru) + '</b><small>№' + pad(p.id, 3) + '</small></div>' +
      '<div class="c-it">' + p.t.map(function (t) { var g = GT[t] || { ru: t, c: '#888' }; return '<span style="--tc:' + g.c + '">' + g.ru + '</span>'; }).join('') + '</div>' +
      '<div class="c-is"><span>' + _('ВЕС') + ' <b>' + (p.w / 10).toLocaleString(PL.loc) + ' ' + _('кг') + '</b></span><span>' + _('СКОР') + ' <b>' + p.st[5] + '</b></span><span>' + _('СУММА') + ' <b>' + bst(p) + '</b></span></div>' +
      ((p.leg || p.myth) ? '<div class="c-il">' + (p.myth ? _('МИФИЧЕСКИЙ') : _('ЛЕГЕНДАРНЫЙ')) + '</div>' : '');
    E.info.classList.add('is-on');
    E.info.classList.remove('is-pop'); void E.info.offsetWidth; E.info.classList.add('is-pop');
  }
  function updateHud(force) {
    if (!st) return;
    var t = st.left;
    var txt = fmtTime(t);
    if (E.time.textContent !== txt || force) E.time.textContent = txt;
    E.bar.style.width = (clamp(t / DUR, 0, 1) * 100).toFixed(1) + '%';
    E.timeBox.classList.toggle('is-warn', t <= 10 && st.phase === 'play');
    var shown = Math.round(st.dexp);
    E.exp.textContent = signed(shown) === '' ? '0' : signed(shown);
    E.expBox.classList.toggle('neg', shown < 0);
    E.ar.classList.toggle('is-on', !!cam.on);
  }
  function pop(html, kind, ms) {
    var el = document.createElement('div');
    el.className = 'c-msg ' + (kind || 'info');
    el.innerHTML = html;
    E.pop.innerHTML = '';
    E.pop.appendChild(el);
    var tk = st && st.token;
    setTimeout(function () { if (el.parentNode) { el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.remove(); }, 260); } }, ms || 1200);
  }
  function flash(kind) {
    var f = E.flash; f.className = 'q-flash'; void f.offsetWidth; f.className = 'q-flash go ' + (kind || '');
  }

  /* ==========================================================================
     ЧАСТИЦЫ И ВСПЛЫВАЮЩИЙ ТЕКСТ
     ========================================================================== */
  function addPart(x, y, kind, col, spd) {
    if (st.parts.length > 160) return;
    var a = rnd(0, 6.283), s = rnd(0.3, 1) * (spd || 80);
    st.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'star' ? 50 : 10), life: 0, max: rnd(0.35, 0.8), kind: kind, col: col, sz: kind === 'star' ? rnd(3, 5) : rnd(2, 3.5) });
  }
  function floatText(x, y, text, col, life) { st.floats.push({ x: x, y: y, text: text, col: col || '#fff', t: 0, life: life || 1 }); }
  function expFloat(d) { floatText(W / 2, 120, signed(d) + ' EXP', d >= EXP_RIGHT ? '#7dffaa' : d > 0 ? '#ffe14a' : '#ff6f8a', 1.4); }

  /* ==========================================================================
     ЦИКЛ: обновление и отрисовка
     ========================================================================== */
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (!st) return;
    var dt = lastTs ? Math.min(0.066, (ts - lastTs) / 1000) : 0.016; lastTs = ts;
    if (!view.classList.contains('is-active')) return;
    update(dt);
    draw(ts / 1000);
  }

  function update(dt) {
    if (st.flashT > 0) st.flashT -= dt;
    if (st.shake > 0) st.shake -= dt;
    st.clock = (st.clock || 0) + dt;
    st.dexp += (st.exp - st.dexp) * Math.min(1, dt * 9);
    if (Math.abs(st.exp - st.dexp) < 0.5) st.dexp = st.exp;
    // облака
    clouds.forEach(function (c) { c.x += c.v * dt; if (c.x > W + 60) c.x = -60; });
    if (st.phase === 'play' && !st.paused) {
      var prev = Math.ceil(st.left);
      if (st.left > 0) st.left = Math.max(0, (st.tEnd - performance.now()) / 1000);      // по часам, а не по кадрам: на слабом телефоне время не растягивается
      if (Math.ceil(st.left) !== prev && st.left > 0 && st.left <= 10) snd('tictoc');
      st.ring += dt;
      if (st.left <= 0) { st.left = 0; if (!st.over) { st.over = true; floatText(W / 2, 150, _('ВРЕМЯ!'), '#ffe14a', 1); } }
      // следующий покемон
      if (!st.mon && st.next && !st.over) {
        st.nextDelay -= dt;
        if (st.nextDelay <= 0) { if (st.left > 3.2 || st.enc === 0) spawnNow(); else st.next = null; }
      }
      if (st.mon && !st.cap) {
        stepMon(st.mon, dt);
        if (st.mon.age > ENC_TIME && !st.ball) fleeNow('time');
      } else if (st.mon && st.cap) st.mon.t += dt * 0.2;
      stepBall(dt);
      stepCap(dt);
      if (st.runAway) { st.runAway.t += dt; if (st.runAway.t > 0.8) st.runAway = null; }
      if (st.over && !st.ball && !st.cap) finishRun();
      if (!st.over && !st.nextMon && st.left > 8 && st.enc >= 0 && !st.prefetching) { st.prefetching = true; prefetch(); setTimeout(function () { if (st) st.prefetching = false; }, 200); }
      if (st.nextMon && !st.nextMon.spr) { var sp = sprites[st.nextMon.p.id]; if (sp && sp.done) st.nextMon.spr = sp; }
    }
    // частицы и тексты
    st.parts = st.parts.filter(function (p) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.kind === 'star' ? 180 : 30) * dt; return p.life < p.max; });
    st.floats = st.floats.filter(function (f) { f.t += dt; return f.t < f.life; });
    updateHud(false);
  }

  function drawBallSprite(k, x, y, px, rot, alpha) {
    var s = PL.pixballs.canvas(k);
    cx.save();
    cx.translate(x, y); if (rot) cx.rotate(rot);
    if (alpha != null) cx.globalAlpha = alpha;
    cx.imageSmoothingEnabled = false;
    cx.drawImage(s, -6.5 * px, -6.5 * px, 13 * px, 13 * px);
    cx.restore();
  }
  function drawSprite(spr, bb, x, fy, lift, s, bob, alpha, tint) {
    cx.save();
    cx.imageSmoothingEnabled = false;
    cx.globalAlpha = alpha;
    if (spr && spr.ok) {
      var dx = x - (bb.x + bb.w / 2) * s, dy = fy - lift - (bb.y + bb.h) * s - bob;
      cx.drawImage(spr.img, dx, dy, spr.w * s, spr.h * s);
    } else {                                          // нет сети: силуэт-«облачко» с вопросом
      var r = 34 * s;
      cx.fillStyle = 'rgba(30,40,70,.85)'; cx.beginPath(); cx.arc(x, fy - lift - r - bob, r, 0, 6.3); cx.fill();
      cx.fillStyle = '#fff'; cx.font = (28 * s) + 'px Tiny5, monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('?', x, fy - lift - r - bob + 2);
    }
    cx.restore();
  }
  function drawScene(t) {
    cx.setTransform(RS, 0, 0, RS, 0, 0);
    var sh = st.shake > 0 ? (Math.random() - .5) * 6 * (st.shake / 0.2) : 0;
    cx.translate(sh, sh * 0.5);
    if (cam.on && E.vid.readyState >= 2 && E.vid.videoWidth) {
      var vw = E.vid.videoWidth, vh = E.vid.videoHeight, k = Math.max(W / vw, H / vh);
      cx.drawImage(E.vid, (W - vw * k) / 2, (H - vh * k) / 2, vw * k, vh * k);
      cx.fillStyle = 'rgba(6,14,10,.16)'; cx.fillRect(0, 0, W, H);
    } else {
      cx.drawImage(BG, 0, 0, W, H);
      cx.fillStyle = 'rgba(255,255,255,.88)';
      clouds.forEach(function (c) {
        var w = 46 * c.s, h = 11 * c.s;
        cx.fillRect(c.x, c.y, w, h); cx.fillRect(c.x + 8 * c.s, c.y - 7 * c.s, w * .6, 8 * c.s); cx.fillRect(c.x + 20 * c.s, c.y + h, w * .6, 5 * c.s);
      });
    }
  }
  function draw(t) {
    drawScene(t);
    var m = st.mon, i;
    // тень и покемон
    if (m && m.vis !== 0) {
      var g = monGeom(m), sc = g.s * g.pop, fade = m.fade * clamp(m.appear * 1.6, 0, 1);
      cx.fillStyle = 'rgba(0,0,0,' + (0.26 * fade) + ')';
      cx.beginPath(); cx.ellipse(g.x, g.fy + 3, m.bb.w * g.s * (m.lift ? 0.3 : 0.42), 7 * g.s, 0, 0, 6.3); cx.fill();
      if (m.dive) { cx.strokeStyle = 'rgba(210,240,255,.7)'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(g.x, g.fy + 2, 34 * g.s + Math.sin(t * 8) * 3, 9 * g.s, 0, 0, 6.3); cx.stroke(); }
      // вспышка при появлении
      if (m.appear < 1) { cx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - m.appear)) + ')'; cx.beginPath(); cx.arc(g.cx, g.cy, g.r * (0.6 + m.appear), 0, 6.3); cx.fill(); }
      // красное втягивание
      var capOpen = st.cap && st.cap.ph === 'open';
      var ck = capOpen ? clamp(st.cap.t / 0.34, 0, 1) : 0;
      if (!st.cap || capOpen) drawSprite(m.spr, m.bb, g.x, g.fy, g.lift, sc * (1 - ck * 0.85), g.bob, fade * (1 - ck * 0.6));
      if (capOpen) {
        var gl = cx.createRadialGradient(g.cx, g.cy, 2, g.cx, g.cy, g.r * (1.1 - 0.5 * ck));
        gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(0.5, 'rgba(255,70,50,.7)'); gl.addColorStop(1, 'rgba(255,70,50,0)');
        cx.fillStyle = gl; cx.beginPath(); cx.arc(g.cx, g.cy, g.r * 1.2, 0, 6.3); cx.fill();
      }
      if (m.hit > 0 && !st.cap) { cx.save(); cx.globalAlpha = Math.min(0.6, m.hit * 1.5); cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(g.cx, g.cy, g.r * 0.9, 0, 6.3); cx.fill(); cx.restore(); }
      // кольцо ловли
      if (hittable(m) && st.phase === 'play') {
        var q = ringRatio(), rr = g.r * 1.2;
        cx.lineWidth = 2.5; cx.strokeStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.arc(g.cx, g.cy, rr, 0, 6.3); cx.stroke();
        cx.lineWidth = 4; cx.strokeStyle = ringColor(q); cx.beginPath(); cx.arc(g.cx, g.cy, rr * q, 0, 6.3); cx.stroke();
      }
    }
    // убегающий покемон
    if (st.runAway) {
      var ra = st.runAway, rk = ra.t / 0.8;
      drawSprite(ra.spr, ra.bb, ra.x + ra.dir * rk * 520, ra.fy, ra.lift, ra.s, 0, 1 - rk);
    }
    // шар на земле при захвате
    var c = st.cap;
    if (c && c.ph !== 'open') {
      var px = 3.6 * (c.s || 1) * 0.9 + 0.8;
      drawBallSprite(c.k, c.x, c.by != null ? c.by : c.y, px, c.rot || 0, c.ph === 'break' ? 1 - c.t / 0.5 : 1);
      if (c.ph === 'shake' || c.ph === 'wait') {
        for (i = 0; i < 3; i++) { cx.fillStyle = i < c.done ? '#ffe14a' : 'rgba(255,255,255,.35)'; cx.fillRect(c.x - 12 + i * 10, c.gy + 12, 6, 6); }
      }
    }
    // шар в полёте / в руке
    if (st.ball) {
      var b = st.ball;
      if (b.land) {
        var hh = Math.abs(Math.sin(b.land * 7)) * 22 * Math.max(0, 1 - b.land);
        drawBallSprite(b.k, b.lx, b.ly - hh, 3.2 * b.sc, b.rot + b.land * 6, clamp(1.6 - b.land * 1.6, 0, 1));
      } else {
        cx.fillStyle = 'rgba(0,0,0,.2)'; cx.beginPath(); cx.ellipse(lerp(b.p0.x, b.a.x, b.e), lerp(b.p0.y, b.a.y, b.e) + 8, 12 * b.sc, 4 * b.sc, 0, 0, 6.3); cx.fill();
        drawBallSprite(b.k, b.x, b.y, 3.7 * b.sc, b.rot, 1);
      }
    } else if (st.phase === 'play' && !st.over) {
      var d = st.drag;
      if (d) {
        // след пальца и шар под ним
        d.pts.forEach(function (q, ix) { cx.fillStyle = 'rgba(255,255,255,' + (0.1 + 0.4 * ix / d.pts.length) + ')'; cx.beginPath(); cx.arc(q.x, q.y, 3 + ix * 0.15, 0, 6.3); cx.fill(); });
        if (d.spin) {
          var gl2 = cx.createRadialGradient(d.x, d.y, 4, d.x, d.y, 34);
          gl2.addColorStop(0, 'rgba(160,245,255,.8)'); gl2.addColorStop(1, 'rgba(160,245,255,0)');
          cx.fillStyle = gl2; cx.beginPath(); cx.arc(d.x, d.y, 34, 0, 6.3); cx.fill();
          if (Math.random() < 0.5) addPart(d.x, d.y, 'star', '#bff8ff', 70);
        }
        drawBallSprite(st.sel, d.x, d.y, 3.7, d.spin ? t * 9 : Math.atan2(d.y - HOME.y, d.x - HOME.x) * 0.2, 1);
        if (d.lock && m && hittable(m)) {                 // рамка «цель захвачена»
          var lg = monGeom(m), lr = lg.r * 1.2 + 4 + Math.sin(t * 12) * 2, ll = lr * 0.42;
          cx.strokeStyle = d.lock.k > 0.8 ? '#6dff7a' : '#ffe14a'; cx.lineWidth = 3;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
            var ex = lg.cx + c[0] * lr, ey = lg.cy + c[1] * lr;
            cx.beginPath(); cx.moveTo(ex - c[0] * ll, ey); cx.lineTo(ex, ey); cx.lineTo(ex, ey - c[1] * ll); cx.stroke();
          });
        }
      } else if (!st.cap && !(BALL[st.sel].limited && st.master <= 0)) {
        var bob = Math.sin(t * 3) * 3;
        cx.fillStyle = 'rgba(0,0,0,.22)'; cx.beginPath(); cx.ellipse(HOME.x, HOME.y + 22, 16, 5, 0, 0, 6.3); cx.fill();
        drawBallSprite(st.sel, HOME.x, HOME.y + bob, 3.7, 0, st.cap ? 0.3 : 1);
      }
    }
    // прицел для клавиатуры и геймпада
    if (st.pad && st.phase === 'play' && !st.ball && !st.cap) {
      var r = st.ret;
      cx.strokeStyle = '#fff'; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(r.x, r.y, 16, 0, 6.3); cx.moveTo(r.x - 24, r.y); cx.lineTo(r.x - 8, r.y); cx.moveTo(r.x + 8, r.y); cx.lineTo(r.x + 24, r.y); cx.moveTo(r.x, r.y - 24); cx.lineTo(r.x, r.y - 8); cx.moveTo(r.x, r.y + 8); cx.lineTo(r.x, r.y + 24); cx.stroke();
    }
    // частицы
    st.parts.forEach(function (p) {
      cx.globalAlpha = clamp(1 - p.life / p.max, 0, 1); cx.fillStyle = p.col;
      if (p.kind === 'star') { cx.fillRect(p.x - p.sz / 2, p.y - 1, p.sz, 2); cx.fillRect(p.x - 1, p.y - p.sz / 2, 2, p.sz); }
      else cx.fillRect(p.x, p.y, p.sz, p.sz);
    });
    cx.globalAlpha = 1;
    // всплывающие подписи (пиксельным шрифтом, с чёрной обводкой)
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    st.floats.forEach(function (f) {
      var k = f.t / f.life, y = f.y - k * 34, a = k > 0.7 ? (1 - k) / 0.3 : 1;
      cx.globalAlpha = a; cx.font = '28px Tiny5, monospace';
      cx.lineWidth = 5; cx.strokeStyle = '#06101c'; cx.strokeText(f.text, f.x, y);
      cx.fillStyle = f.col; cx.fillText(f.text, f.x, y);
    });
    cx.globalAlpha = 1;
    if (st.flashT > 0) { cx.fillStyle = 'rgba(255,255,255,' + (st.flashT / 0.12 * 0.35) + ')'; cx.fillRect(0, 0, W, H); }
    // в заставке по полю катятся все шары
    if (st.phase === 'title' || st.phase === 'rules' || st.phase === 'history') {
      BALLS.forEach(function (b, ix) {
        var x = ((ix * 112 + t * 38) % (W + 80)) - 40, y = 336 + Math.sin(t * 2 + ix) * 5;
        cx.fillStyle = 'rgba(0,0,0,.2)'; cx.beginPath(); cx.ellipse(x, y + 22, 15, 4, 0, 0, 6.3); cx.fill();
        drawBallSprite(b.k, x, y, 3.2, Math.sin(t + ix) * 0.18, 1);
      });
    }
  }

  /* ==========================================================================
     КНОПКИ КОНСОЛИ
     ========================================================================== */
  function press(name) {
    if (!st || !view.classList.contains('is-active')) return false;
    var m = st.menu;
    if (m && (st.phase === 'title' || st.phase === 'result' || st.paused)) {
      var bar = /is-bar/.test(E.menu.className);
      switch (name) {
        case 'up': setSel((m.sel + m.items.length - 1) % m.items.length, true); return true;
        case 'down': setSel((m.sel + 1) % m.items.length, true); return true;
        case 'left': if (bar) setSel((m.sel + m.items.length - 1) % m.items.length, true); return true;
        case 'right': if (bar) setSel((m.sel + 1) % m.items.length, true); return true;
        case 'a': pickMenu(); return true;
        case 'b': case 'home': if (m.onBack) { snd('back'); m.onBack(); } return true;
        case 'x': if (st.phase === 'title') toggleAR(); return true;
      }
      return true;
    }
    switch (st.phase) {
      case 'rules':
        if (name === 'left' || name === 'l') openRules(st.rulesPage - 1);
        else if (name === 'right' || name === 'r' || name === 'a') { if (name === 'a' && st.rulesPage === RULE_PAGES.length - 1) { openTitle(); snd('back'); } else openRules(st.rulesPage + 1); }
        else if (name === 'b' || name === 'home') { snd('back'); openTitle(); }
        return true;
      case 'history': {
        var h = st.hist, n = st.db.runs.length;
        if (h.open != null) { if (name === 'b' || name === 'a' || name === 'home') { h.open = null; renderHistory(); snd('back'); } return true; }
        if (name === 'up') { if (n) { h.sel = (h.sel + n - 1) % n; renderHistory(); snd('tick'); } }
        else if (name === 'down') { if (n) { h.sel = (h.sel + 1) % n; renderHistory(); snd('tick'); } }
        else if (name === 'a') { if (n) { h.open = h.sel; renderHistory(); snd('select'); } else snd('error'); }
        else if (name === 'b' || name === 'home') { snd('back'); if (h.back === 'result') { h.back = null; setPhase('result'); showResult(st.db.runs[st.db.runs.length - 1], false, true); } else openTitle(); }
        return true;
      }
      case 'play':
        switch (name) {
          case 'left': case 'right': case 'up': case 'down': {
            st.pad = true;
            var dx = name === 'left' ? -34 : name === 'right' ? 34 : 0, dy = name === 'up' ? -30 : name === 'down' ? 30 : 0;
            st.ret.x = clamp(st.ret.x + dx, 40, W - 90); st.ret.y = clamp(st.ret.y + dy, HORIZON - 10, 330);
            return true;
          }
          case 'a': st.pad = true; padThrow(); return true;
          case 'l': cycleBall(-1); return true;
          case 'r': cycleBall(1); return true;
          case 'x': toggleAR(); return true;
          case 'b': case 'home': case 'plus': pauseGame(); return true;
        }
        return true;
    }
    return true;
  }

  function hints() {
    if (!st) return [];
    if (st.menu && (st.phase === 'title' || st.phase === 'result' || st.paused)) {
      var h = [[['up', 'down'], _('Выбор')], [['a'], _('Выбрать')]];
      if (st.phase === 'title') h.push([['x'], 'AR']);
      if (st.menu.onBack) h.push([['b'], _('Назад')]);
      return h;
    }
    switch (st.phase) {
      case 'rules': return [[['l', 'r'], _('Страница')], [['a'], _('Дальше')], [['b'], _('Назад')]];
      case 'history': return [[['up', 'down'], _('Выбор')], [['a'], _('Подробно')], [['b'], _('Назад')]];
      case 'play': return [[['up', 'down'], _('Прицел')], [['a'], _('Бросок')], [['l', 'r'], _('Шар')], [['x'], 'AR'], [['b'], _('Пауза')]];
    }
    return [];
  }

  /* ---------- публичное API ---------- */
  build_guard();
  function build_guard() { if (!view) build(); }

  return {
    open: open, close: close, press: press, hints: hints,
    active: function () { return !!st; },
    accent: function () { return ACCENT; },
    status: function () {
      if (!st) return { title: _('Ловец'), line: '' };
      return { title: _('Ловец покеболов'), line: st.phase === 'play' ? 'EXP ' + signed(st.exp) + ' · ' + fmtTime(st.left) : st.phase === 'result' ? _('итог {exp} EXP', { exp: signed(st.exp) }) : _('меню') };
    },
    stats: function () { var d = readDB(); return { total: d.total, best: d.best, runs: d.runs.length }; },
    bestBall: bestBall, catchChance: catchChance, BALLS: BALLS,
    on: function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    /* для автотестов */
    _state: function () { return st; },
    _spawn: function (id) { var p = PL.dex[id - 1]; st.nextMon = { p: p, spr: null }; loadSprite(id, function (c) { if (st && st.nextMon) st.nextMon.spr = c; }); },
    _geom: function () { return st && st.mon ? monGeom(st.mon) : null; },
    _throw: function (x, y, sp) { var P0 = { x: HOME.x, y: HOME.y }, dx = x - P0.x, dy = y - P0.y, d = Math.hypot(dx, dy) || 1; if (!canThrow()) return false; startBall(P0, { x: x, y: y }, clamp(1.0 - (sp || 2) * 0.14, 0.42, 1.0), 0, sp || 2); return d; },
    _startRun: function () { startRun(); },
    _finish: function () { if (st) { st.left = 0; st.over = true; } },
  };
})();
