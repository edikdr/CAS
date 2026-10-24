/* ==========================================================================
   Викторина картриджа — экран в духе GBA-покемонов (FireRed / Emerald):
   диалоговая рамка с печатью текста по буквам, рамка со спрайтом, меню с курсором ▶,
   три сердца, «Кто это?» с силуэтом и финал «Зал Славы» с конфетти.
   Цветокор — в стиле сайта (тёмный неон), поверх лёгкие помехи ЭЛТ.

   Спрайты тянутся из API при показе вопроса: PokéAPI/sprites (покемоны, предметы) и
   smogon/sprites (тренеры) через jsDelivr с запасным адресом raw.githubusercontent.com.
   Нет сети — вместо картинки рисуется покебол, а викторина продолжается.

   API:  PL.quiz.open(cartId)  — показать заставку картриджа
         PL.quiz.press(name)   — кнопка консоли (true, если обработана)
         PL.quiz.hints()       — подсказки внизу экрана
         PL.quiz.on('exit' | 'section' | 'hints', fn)
   ========================================================================== */
window.PL = window.PL || {};

PL.quiz = (function () {
  var C = PL.config;
  var DATA = PL.quizData || {};
  var TOTAL = 15, LIVES = 3;

  var SP_CDN = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/';
  var SP_RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
  var TR_CDN = 'https://cdn.jsdelivr.net/gh/smogon/sprites@master/src/_uncategorized/';
  var TR_RAW = 'https://raw.githubusercontent.com/smogon/sprites/master/src/_uncategorized/';

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var crt = document.getElementById('crt');
  var listeners = {};
  var view, st = null, E = {}, seq = 0;

  /* ---------- мелочи ---------- */
  function emit(evt, d) { (listeners[evt] || []).forEach(function (f) { f(d); }); }
  function snd(n) { if (PL.audio) PL.audio.play(n); }
  function pad(n, l) { var s = String(n); while (s.length < l) s = '0' + s; return s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function monName(id) { var d = PL.dex && PL.dex[id - 1]; return d ? d.ru : '№' + id; }
  function fill(s) { return String(s).replace(/\{(\d+)\}/g, function (m, id) { return monName(+id); }); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function cartCfg(id) { return C.carts.filter(function (c) { return c.id === id; })[0]; }

  /* всё, что происходит «по таймеру», привязано к токену: закрыли викторину — старые колбэки молчат */
  function later(fn, ms) {
    var tk = st && st.token;
    return setTimeout(function () { if (st && st.token === tk) fn(); }, ms);
  }

  /* ---------- пиксель-арт: покебол, сердце ---------- */
  var PAL = {
    k: '#0d1019', r: '#ee4a46', R: '#b3292f', h: '#ffa59c', w: '#f5f7fb', g: '#aeb7cc', W: '#ffffff',
    X: '#ff3d7a', s: '#c21e55', H: '#ffd3e2', o: '#6f5f93', e: '#171229', f: '#3a2f5e', Y: '#ffd24a', y: '#b07e12',
  };
  var BALL = [
    '.....kkkkkk.....',
    '...kkrrrrrrkk...',
    '..krrhhrrrrrRk..',
    '.krhhrrrrrrrrRk.',
    '.krhrrrrrrrrrRk.',
    'krrrrrrrrrrrrRRk',
    'krrrrkkkkkkrrRRk',
    'kkkkkkkWWkkkkkkk',
    'kkkkkkkWWkkkkkkk',
    'kwwwwkkkkkkwwwgk',
    'kwwwwwwwwwwwwwgk',
    '.kwwwwwwwwwwwggk',
    '.kwwwwwwwwwwggk.',
    '..kwwwwwwwwggk..',
    '...kkwwwwggkk...',
    '.....kkkkkk.....',
  ];
  var HEART = [
    '.kkk.kkk.',
    'kXXXkXXXk',
    'kXHHXXXXk',
    'kXHXXXXsk',
    'kXXXXXXsk',
    '.kXXXXsk.',
    '..kXXsk..',
    '...kXk...',
    '....k....',
  ];
  var HEART_E = [
    '.ooo.ooo.',
    'oeeeoeeeo',
    'oeffeeeeo',
    'oefeeeeeo',
    'oeeeeeeeo',
    '.oeeeeeo.',
    '..oeeeo..',
    '...oeo...',
    '....o....',
  ];
  function pix(map, cls, rep) {
    var h = map.length, w = map[0].length, d = '', fills = {};
    map.forEach(function (row, y) {
      var x = 0;
      while (x < w) {
        var c = row.charAt(x);
        if (c === '.') { x++; continue; }
        var x0 = x;
        while (x < w && row.charAt(x) === c) x++;
        (fills[c] = fills[c] || []).push('M' + x0 + ' ' + y + 'h' + (x - x0) + 'v1h-' + (x - x0) + 'z');
      }
    });
    Object.keys(fills).forEach(function (c) { d += '<path fill="' + ((rep && rep[c]) || PAL[c]) + '" d="' + fills[c].join('') + '"/>'; });
    return '<svg class="' + cls + '" viewBox="0 0 ' + w + ' ' + h + '" shape-rendering="crispEdges" aria-hidden="true">' + d + '</svg>';
  }

  /* ---------- загрузка спрайтов (цепочка адресов, ничего не блокирует) ---------- */
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
  function specUrls(sp) {
    if (sp.mon) return monUrls(sp.mon);
    if (sp.tr) return [TR_CDN + sp.tr + '.png', TR_RAW + sp.tr + '.png'];
    if (sp.item) return [SP_CDN + 'items/' + sp.item + '.png', SP_RAW + 'items/' + sp.item + '.png'];
    return [];
  }
  var SCALES = [1, 1.5, 2, 3, 4, 5, 6];
  function fitScale(w, h, box, max) {
    var s = 1, m = Math.max(w, h);
    SCALES.forEach(function (k) { if (m * k <= box && k <= (max || 6)) s = k; });
    return s;
  }
  /* грузит первый сработавший адрес; onOk(img) / onFail() */
  function loadInto(imgEl, urls, onOk, onFail) {
    var tk = imgEl._tk = (imgEl._tk || 0) + 1, i = 0;
    (function next() {
      if (imgEl._tk !== tk) return;
      if (i >= urls.length) { if (onFail) onFail(); return; }
      var u = urls[i++], im = new Image(), done = false;
      var t = setTimeout(function () { if (!done) { done = true; im.onload = im.onerror = null; next(); } }, 6500);
      im.onload = function () {
        if (done) return; done = true; clearTimeout(t);
        if (imgEl._tk !== tk) return;
        imgEl.src = u;
        if (onOk) onOk(im);
      };
      im.onerror = function () { if (done) return; done = true; clearTimeout(t); next(); };
      im.src = u;
    })();
  }
  function preload(sp) { var u = specUrls(sp)[0]; if (u) { var im = new Image(); im.src = u; } }

  /* силуэт гор (ступеньками, как пиксели) и неоновый пол с перспективой */
  function scenery() {
    var d = 'M0 24', x = 0, y = 15, sd = 21;
    function r2() { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; }
    while (x < 192) {
      var w = 6 + ((r2() * 10) | 0);
      y = Math.max(5, Math.min(20, y + (((r2() * 5) | 0) - 2) * 2));
      d += 'V' + y + 'h' + w; x += w;
    }
    d += 'V24z';
    var ln = '', xb;
    [0.5, 3, 6.5, 11.5, 18.5, 27].forEach(function (yy) { ln += '<line class="qh" x1="0" x2="96" y1="' + yy + '" y2="' + yy + '"/>'; });
    for (xb = -84; xb <= 180; xb += 12) ln += '<line x1="48" y1="-36" x2="' + xb + '" y2="28"/>';
    return '<svg class="q-hills" viewBox="0 0 192 24" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/></svg>' +
           '<svg class="q-floor" viewBox="0 0 96 28" preserveAspectRatio="none" aria-hidden="true">' + ln + '</svg>';
  }

  /* ---------- сборка экрана ---------- */
  function build() {
    view = document.createElement('section');
    view.className = 'view view-quiz';
    view.dataset.view = 'quiz';
    view.innerHTML =
      '<div class="q-stage">' +
        '<div class="q-sky" aria-hidden="true"><i class="q-stars"></i><i class="q-glow"></i>' +
          scenery() + '</div>' +
        '<header class="q-hud">' +
          '<div class="q-cart"><i class="q-cart-ico"></i><b class="q-cart-name"></b></div>' +
          '<div class="q-prog"><span class="q-qn">' + _('ВОПРОС') + ' <b>01</b>/' + TOTAL + '</span><div class="q-pips"></div></div>' +
          '<div class="q-stat"><span class="q-exp">EXP <b>0000</b></span><div class="q-hearts"></div></div>' +
        '</header>' +
        '<div class="q-title"><small>POKÉLORE · ' + _('КАРТРИДЖ') + '</small><b class="q-title-name"></b><span class="q-title-sub"></span></div>' +
        '<div class="q-hero"><i class="q-plat"></i><img class="q-hero-tr" alt=""><img class="q-hero-mon" alt=""></div>' +
        '<div class="q-subject">' +
          '<div class="q-spwrap">' +
            '<div class="q-frame"><i class="q-rays"></i><img class="q-sprite" alt=""><span class="q-ballwrap"></span><b class="q-gain"></b></div>' +
            '<i class="q-plat q-plat--s"></i>' +
          '</div>' +
          '<div class="q-plate"></div>' +
        '</div>' +
        '<div class="q-menu" role="listbox"></div>' +
        '<div class="q-dialog"><div class="q-who"></div><div class="q-text"><span class="tw-a"></span><span class="tw-b"></span></div><div class="q-text q-meas" aria-hidden="true">Ag</div><i class="q-more"></i></div>' +
        '<div class="q-end"><i class="qe-rays"></i><canvas class="qe-confetti" width="384" height="216"></canvas>' +
          '<div class="qe-head"><b></b><span></span></div>' +
          '<div class="qe-row"></div><div class="qe-floor"></div></div>' +
        '<div class="q-wipe"></div>' +
      '</div>' +
      '<div class="q-fx" aria-hidden="true"><i class="q-flash"></i><i class="q-grade"></i><canvas class="q-noise" width="256" height="144"></canvas></div>';
    crt.insertBefore(view, crt.querySelector('.connect-osd') || crt.querySelector('.hints'));

    var q = function (s) { return view.querySelector(s); };
    E = {
      stage: q('.q-stage'), hud: q('.q-hud'), cartName: q('.q-cart-name'), qn: q('.q-qn b'), pips: q('.q-pips'),
      exp: q('.q-exp b'), hearts: q('.q-hearts'),
      title: q('.q-title'), titleName: q('.q-title-name'), titleSub: q('.q-title-sub'),
      hero: q('.q-hero'), heroTr: q('.q-hero-tr'), heroMon: q('.q-hero-mon'),
      subject: q('.q-subject'), spwrap: q('.q-spwrap'), frame: q('.q-frame'), sprite: q('.q-sprite'), ballwrap: q('.q-ballwrap'),
      gain: q('.q-gain'), plate: q('.q-plate'),
      menu: q('.q-menu'), dialog: q('.q-dialog'), who: q('.q-who'), ta: q('.tw-a'), tb: q('.tw-b'), meas: q('.q-meas'), more: q('.q-more'),
      end: q('.q-end'), endHead: q('.qe-head'), endRow: q('.qe-row'), confetti: q('.qe-confetti'),
      wipe: q('.q-wipe'), flash: q('.q-flash'), noise: q('.q-noise'),
    };

    /* звёзды на небе: одна тень-строка = много точек */
    var stars = [], i, seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    for (i = 0; i < 46; i++) stars.push(((rnd() * 764) | 0) + 'px ' + ((rnd() * 190) | 0) + 'px 0 ' + (rnd() < .2 ? '1px' : '0') + ' rgba(' + (rnd() < .5 ? '190,240,255' : '255,210,235') + ',' + (.25 + rnd() * .6).toFixed(2) + ')');
    E.stage.querySelector('.q-stars').style.boxShadow = stars.join(',');

    /* ячейки прогресса и сердца */
    var p = '';
    for (i = 0; i < TOTAL; i++) p += '<i></i>';
    E.pips.innerHTML = p;
    var h = '';
    for (i = 0; i < LIVES; i++) h += '<span class="q-heart">' + pix(HEART, 'on') + pix(HEART_E, 'off') + '</span>';
    E.hearts.innerHTML = h;
    E.ballwrap.innerHTML = pix(BALL, 'q-ball');

    /* ввод: клик по диалогу = «A», мышь по меню */
    E.dialog.addEventListener('pointerdown', function () { press('a'); });
    E.menu.addEventListener('pointermove', function (e) {
      var o = e.target.closest('.q-opt');
      if (o && e.pointerType === 'mouse' && st && st.menu && st.menu.sel !== +o.dataset.i && (e.movementX || e.movementY)) setSel(+o.dataset.i, true);
    });
    E.menu.addEventListener('click', function (e) {
      var o = e.target.closest('.q-opt');
      if (o && st && st.menu) { setSel(+o.dataset.i, true); pick(); }
    });
    document.addEventListener('keydown', function (e) {
      if (!st || !st.menu || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      var n = +e.key;
      if (n >= 1 && n <= st.menu.items.length) { e.preventDefault(); setSel(n - 1, true); pick(); }
    });

    initNoise();
    if (document.fonts && document.fonts.load) document.fonts.load('30px Tiny5', 'Ag Аб').catch(function () {}); // i18n-ok
  }

  /* ---------- помехи ЭЛТ: зерно + срывы строк + редкий «глюк» ---------- */
  var nz = { cx: null, img: null, buf: null, raf: 0, last: 0, run: false, burst: 0, nextGlitch: 0, seed: 12345 };
  function nrand() { var s = nz.seed; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; nz.seed = s; return s; }
  function initNoise() {
    var cv = E.noise;
    nz.cx = cv.getContext('2d');
    nz.img = nz.cx.createImageData(cv.width, cv.height);
    nz.buf = new Uint32Array(nz.img.data.buffer);
  }
  function noiseFrame(ts) {
    if (!nz.run) return;
    nz.raf = requestAnimationFrame(noiseFrame);
    var gap = reduce ? 160 : 70;
    if (ts - nz.last < gap) return;
    nz.last = ts;

    var W = 256, H = 144, buf = nz.buf, i, x, y;
    var dens = nz.burst > 0 ? 0.13 : 0.045;
    var thr = (dens * 4294967295) >>> 0;
    for (i = 0; i < buf.length; i++) {
      var r = nrand();
      if (r < thr) {
        var v = 90 + (r & 127);                       // яркость «снежинки»
        buf[i] = (((v * 0.3) | 0) << 24) | (255 << 16) | (((v * 0.95) | 0) << 8) | ((v * 0.7) | 0); // холодный бело-голубой, лёгкая прозрачность
      } else buf[i] = 0;
    }
    /* катящаяся светлая полоса (медленно ползёт вниз) */
    var roll = ((ts * 0.02) % (H + 50)) - 25;
    for (y = Math.max(0, roll | 0); y < Math.min(H, (roll | 0) + 9); y++) {
      for (x = 0; x < W; x++) if ((nrand() & 3) === 0) buf[y * W + x] = (22 << 24) | (255 << 16) | (240 << 8) | 200;
    }
    /* случайные срывы строк */
    var tears = nz.burst > 0 ? 8 : (nrand() % 14 === 0 ? 1 : 0);
    for (var t = 0; t < tears; t++) {
      var ty = nrand() % H, th = 1 + (nrand() % 2);
      for (y = ty; y < Math.min(H, ty + th); y++) {
        var off = (nrand() % 9) - 4;
        for (x = 0; x < W; x++) if ((x + off + (y >> 1)) % 7 < 4) buf[y * W + x] = ((nz.burst > 0 ? 80 : 38) << 24) | (255 << 16) | (245 << 8) | 215;
      }
    }
    nz.cx.putImageData(nz.img, 0, 0);

    if (nz.burst > 0) nz.burst--;
    else if (!reduce && ts > nz.nextGlitch) {
      nz.burst = 3;
      nz.nextGlitch = ts + 5500 + (nrand() % 6500);
      E.stage.classList.remove('is-glitch'); void E.stage.offsetWidth; E.stage.classList.add('is-glitch');
    }
  }
  function noiseOn(on) {
    if (on === nz.run) return;
    nz.run = on;
    if (on) { nz.nextGlitch = performance.now() + 3200; nz.raf = requestAnimationFrame(noiseFrame); }
    else { cancelAnimationFrame(nz.raf); nz.cx.clearRect(0, 0, 256, 144); }
  }
  document.addEventListener('visibilitychange', function () { if (nz.run && document.hidden) { cancelAnimationFrame(nz.raf); } else if (nz.run) nz.raf = requestAnimationFrame(noiseFrame); });

  /* ---------- вспышка и «шторки» перехода (как в бою FireRed) ---------- */
  function flash(kind) {
    var f = E.flash;
    f.className = 'q-flash';
    void f.offsetWidth;
    f.className = 'q-flash go ' + (kind || '');
  }
  function wipe(mid, done) {
    var w = E.wipe, bars = '', i;
    if (!w.firstChild) { for (i = 0; i < 9; i++) bars += '<i style="--i:' + i + '"></i>'; w.innerHTML = bars; }
    st.busy = true;
    w.className = 'q-wipe in';
    later(function () {
      if (mid) mid();
      w.className = 'q-wipe out';
      later(function () { w.className = 'q-wipe'; st.busy = false; if (done) done(); }, reduce ? 60 : 420);
    }, reduce ? 60 : 470);
  }

  /* ---------- печать текста ---------- */
  var tw = { full: '', i: 0, timer: 0, done: null, on: false };
  function typeStop() { clearTimeout(tw.timer); tw.on = false; E.dialog.classList.remove('is-typing'); }
  function typeText(text, done) {
    typeStop();
    tw.full = text; tw.i = 0; tw.done = done; tw.on = true;
    E.ta.textContent = ''; E.tb.textContent = text;
    E.more.classList.remove('is-on');
    E.dialog.classList.add('is-typing');
    if (reduce) { tw.i = text.length; E.ta.textContent = text; E.tb.textContent = ''; return finishType(); }
    (function step() {
      if (!st) return typeStop();
      var ch = tw.full.charAt(tw.i);
      tw.i++;
      E.ta.textContent = tw.full.slice(0, tw.i);
      E.tb.textContent = tw.full.slice(tw.i);
      if (ch !== ' ' && ch !== ' ' && (tw.i % 2) === 0) snd('blip');
      if (tw.i >= tw.full.length) return finishType();
      var nxt = tw.full.charAt(tw.i), d = 30;
      if (/[.!?…]/.test(ch) && (nxt === ' ' || nxt === '')) d = 300;
      else if (/[,;:—]/.test(ch)) d = 140;
      tw.timer = setTimeout(step, d);
    })();
  }
  function finishType() {
    clearTimeout(tw.timer);
    tw.on = false;
    E.dialog.classList.remove('is-typing');
    var cb = tw.done; tw.done = null;
    if (cb) cb();
  }
  function typeSkip() {
    if (!tw.on) return false;
    clearTimeout(tw.timer);
    tw.i = tw.full.length;
    E.ta.textContent = tw.full; E.tb.textContent = '';
    finishType();
    return true;
  }

  /* делим длинный текст на «страницы» по три строки: сначала по предложениям, потом по словам;
     ширину строки меряем скрытой копией текстового блока */
  function nlines(t) { E.meas.textContent = t; return Math.round(E.meas.offsetHeight / 33); }
  function paginate(text) {
    if (nlines(text) <= 3) return [text];
    var sents = text.match(/[^.!?…]+[.!?…]+[»)"]*\s*|[^.!?…]+$/g) || [text];
    var pages = [], cur = '', out = [];
    sents.forEach(function (x) {
      x = x.replace(/^\s+|\s+$/g, '');
      if (!x) return;
      var cand = cur ? cur + ' ' + x : x;
      if (nlines(cand) <= 3) cur = cand; else { if (cur) pages.push(cur); cur = x; }
    });
    if (cur) pages.push(cur);
    pages.forEach(function (p) {
      if (nlines(p) <= 3) return out.push(p);
      var c = '';
      p.split(' ').forEach(function (w) { var cand = c ? c + ' ' + w : w; if (nlines(cand) <= 3) c = cand; else { out.push(c); c = w; } });
      if (c) out.push(c);
    });
    return out;
  }

  /* реплика в одну или несколько «страниц»: между страницами ждём «A» */
  function say(pages, who, done) {
    if (typeof pages === 'string') pages = [pages];
    pages = [].concat.apply([], pages.map(paginate));
    var k = 0;
    if (who != null) setWho(who);
    st.phase = 'type';
    emit('hints');
    (function page() {
      typeText(pages[k], function () {
        if (k < pages.length - 1) {
          st.phase = 'wait'; E.more.classList.add('is-on');
          st.onA = function () { k++; st.onA = null; st.phase = 'type'; E.more.classList.remove('is-on'); snd('click'); emit('hints'); page(); };
          emit('hints');
        } else if (done) done();
      });
    })();
  }
  function waitA(fn) {
    st.phase = 'wait'; E.more.classList.add('is-on');
    st.onA = function () { st.onA = null; E.more.classList.remove('is-on'); snd('click'); fn(); };
    emit('hints');
  }
  function setWho(w) {
    E.who.textContent = w || '';
    E.who.style.display = w ? '' : 'none';
  }

  /* ---------- меню с курсором ▶ ---------- */
  function showMenu(items, onPick, opts) {
    opts = opts || {};
    st.phase = 'menu';
    st.menu = { items: items, sel: opts.sel || 0, onPick: onPick, onBack: opts.onBack || null };
    E.menu.className = 'q-menu is-open' + (opts.cls ? ' ' + opts.cls : '');
    E.menu.innerHTML = items.map(function (it, i) {
      return '<button class="q-opt" data-i="' + i + '" role="option"><i class="q-cur"></i><span class="q-num">' + (opts.nums === false ? '' : (i + 1)) + '</span><span class="q-ot">' + esc(it) + '</span></button>';
    }).join('');
    setSel(st.menu.sel, false);
    snd('card');
    emit('hints');
  }
  function hideMenu() {
    st.menu = null;
    E.menu.className = 'q-menu';
  }
  function setSel(i, sound) {
    var m = st.menu; if (!m) return;
    m.sel = i;
    var rows = E.menu.children;
    for (var k = 0; k < rows.length; k++) rows[k].classList.toggle('is-sel', k === i);
    if (sound) snd('qcursor');
  }
  function pick() {
    var m = st && st.menu; if (!m) return;
    var i = m.sel, f = m.onPick;
    snd('qpick');
    var row = E.menu.children[i];
    if (row) { row.classList.add('is-pick'); }
    f(i);
  }

  /* ---------- сердца, EXP, прогресс ---------- */
  function renderHud() {
    var cd = st.cd;
    E.cartName.textContent = cd.title;
    E.qn.textContent = pad(Math.min(st.idx + 1, TOTAL), 2);
    var pips = E.pips.children;
    for (var i = 0; i < pips.length; i++) {
      var r = st.res[i];
      pips[i].className = r === 1 ? 'ok' : r === 0 ? 'bad' : (i === st.idx && st.phase !== 'title' ? 'cur' : '');
    }
    E.exp.textContent = pad(st.exp, 4);
    for (var h = 0; h < LIVES; h++) {
      var he = E.hearts.children[h];
      he.classList.toggle('is-lost', h >= st.hearts);
      if (h < st.hearts) he.classList.remove('is-break');
    }
  }
  function countExp(from, to) {
    var t0 = performance.now(), dur = 520;
    (function f(t) {
      if (!st) return;
      var k = Math.min(1, (t - t0) / dur);
      E.exp.textContent = pad(Math.round(from + (to - from) * k), 4);
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  }
  function breakHeart(index) {
    var el = E.hearts.children[index];
    if (!el) return;
    el.classList.add('is-break');
    snd('qheart');
    /* осколки */
    var r = el.getBoundingClientRect(), host = E.stage.getBoundingClientRect(), sc = PL.scale || 1;
    for (var i = 0; i < 7; i++) {
      var s = document.createElement('i');
      s.className = 'q-shard';
      s.style.left = ((r.left - host.left) / sc + 10) + 'px';
      s.style.top = ((r.top - host.top) / sc + 8) + 'px';
      s.style.setProperty('--dx', (Math.random() * 56 - 28).toFixed(0) + 'px');
      s.style.setProperty('--dy', (Math.random() * 46 + 18).toFixed(0) + 'px');
      s.style.setProperty('--rt', (Math.random() * 360).toFixed(0) + 'deg');
      E.stage.appendChild(s);
      (function (x) { setTimeout(function () { x.remove(); }, 800); })(s);
    }
  }

  /* ---------- герой с напарником, спрайт вопроса ---------- */
  function showHero(big) {
    var hd = st.data.hero;
    E.hero.className = 'q-hero' + (big ? ' is-big' : '');
    E.heroTr.removeAttribute('src'); E.heroMon.removeAttribute('src');
    E.heroTr.style.opacity = E.heroMon.style.opacity = 0;
    var k = big ? 3 : 2;
    loadInto(E.heroTr, specUrls({ tr: hd.tr }), function (im) {
      E.heroTr.style.width = (im.naturalWidth * k) + 'px'; E.heroTr.style.height = (im.naturalHeight * k) + 'px'; E.heroTr.style.opacity = 1;
    });
    loadInto(E.heroMon, specUrls({ mon: hd.mon }), function (im) {
      var s = big ? 2 : 2;
      E.heroMon.style.width = (im.naturalWidth * s) + 'px'; E.heroMon.style.height = (im.naturalHeight * s) + 'px'; E.heroMon.style.opacity = 1;
    });
  }

  function subjectOf(q) { return q; }
  function showSubject(q, quick) {
    var sp = subjectOf(q), hide = !!q.hide;
    E.subject.classList.toggle('is-sil', hide);
    E.subject.classList.remove('is-reveal', 'is-happy', 'is-sad');
    E.frame.classList.remove('is-ball');
    E.sprite.removeAttribute('src');
    E.sprite.style.opacity = 0;
    E.ballwrap.classList.remove('is-on');
    var nm = q.mon ? monName(q.mon) : (q.nm || '');
    E.plate.textContent = hide ? '? ? ?' : nm.toUpperCase();
    E.plate.classList.toggle('is-hid', hide);
    st.subjName = nm.toUpperCase();

    var wrap = E.spwrap;
    wrap.classList.remove('is-in'); void wrap.offsetWidth;
    if (!quick) wrap.classList.add('is-in');

    if (q.ball || !specUrls(sp).length) { E.frame.classList.add('is-ball'); E.ballwrap.classList.add('is-on'); return; }
    var tk = st.token;
    loadInto(E.sprite, specUrls(sp), function (im) {
      if (!st || st.token !== tk) return;
      var box = q.item ? 120 : 144;
      var s = fitScale(im.naturalWidth, im.naturalHeight, box, q.item ? 4 : 3);
      E.sprite.style.width = (im.naturalWidth * s) + 'px';
      E.sprite.style.height = (im.naturalHeight * s) + 'px';
      E.sprite.style.opacity = 1;
      E.frame.classList.remove('is-ball'); E.ballwrap.classList.remove('is-on');
    }, function () {
      if (!st || st.token !== tk) return;
      E.frame.classList.add('is-ball'); E.ballwrap.classList.add('is-on');
    });
  }

  /* ---------- сцены ---------- */
  function reset(id) {
    var cd = cartCfg(id);
    st = {
      id: id, cd: cd, data: DATA[id], idx: 0, hearts: LIVES, exp: 0, ok: 0, streak: 0, res: [], phase: 'title',
      menu: null, onA: null, busy: false, token: ++seq, order: null, cur: null,
    };
    view.style.setProperty('--qa', cd.c1);
    view.dataset.cart = id;
    hideMenu();
    typeStop();
  }

  function scene(mode) {
    view.classList.remove('is-title', 'is-ask', 'is-end', 'is-win', 'is-lose');
    view.classList.add(mode === 'title' ? 'is-title' : mode === 'end' ? 'is-end' : 'is-ask');
  }

  /* заставка картриджа: название, герой с напарником, реплика ведущего и меню */
  function openTitle(short) {
    var cd = st.cd, d = st.data;
    st.phase = 'type'; st.res = []; st.idx = 0; st.hearts = LIVES; st.exp = 0; st.ok = 0; st.streak = 0;
    scene('title');
    view.classList.remove('is-lose', 'is-win');
    E.end.classList.remove('is-on');
    renderHud();
    E.titleName.textContent = cd.title;
    E.titleSub.innerHTML = esc(cd.sub.toUpperCase()) + '<br><em>' + _('{n} ВОПРОСОВ · ♥♥♥', { n: TOTAL }) + '</em>';
    showHero(false);
    var emb = { lore: { mon: 493, nm: _('Аркеус') }, trainers: { ball: 1, nm: _('Тренеры') }, items: { item: 'master-ball', nm: _('Мастербол') } }[st.id] || { ball: 1, nm: cd.ru };
    showSubject(emb, false);
    E.subject.classList.remove('is-sil'); E.plate.classList.remove('is-hid');
    var best = readBest(st.id);
    var lines = short ? [_('Ещё раз? Три сердца, пятнадцать вопросов — теперь ты знаешь, чего ждать.')]
                      : d.intro.slice();
    if (!short && best && best.wins) lines.push(best.stars ? _('Твой рекорд: {exp} EXP · {stars}. Побьёшь?', { exp: best.exp, stars: stars(best.stars) }) : _('Твой рекорд: {exp} EXP. Побьёшь?', { exp: best.exp }));
    snd('qstart');
    say(lines, d.host, function () { titleMenu(); });
  }
  function stars(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆'; return s; }

  function titleMenu() {
    var cd = st.cd;
    showMenu([_('ИГРАТЬ'), _('ЧИТАТЬ РАЗДЕЛ'), _('ВЫЙТИ')], function (i) {
      hideMenu();
      if (i === 0) startRun();
      else if (i === 1) { later(function () { emit('section', { cart: st.id }); }, 120); }
      else { later(function () { emit('exit', { cart: st.id }); }, 120); }
    }, { onBack: function () { hideMenu(); emit('exit', { cart: st.id }); }, cls: 'is-wide' });
  }

  function startRun() {
    st.phase = 'type';
    snd('qstart'); flash('white');
    wipe(function () {
      scene('ask');
      st.idx = 0; st.hearts = LIVES; st.exp = 0; st.ok = 0; st.streak = 0; st.res = [];
      setWho('');
      E.ta.textContent = ''; E.tb.textContent = '';
      showHero(false);
      renderHud();
    }, function () { nextQuestion(); });
  }

  function nextQuestion() {
    var q = st.data.q[st.idx];
    st.cur = q;
    var opts = q.o.map(function (t, i) { return { t: fill(t), right: i === 0 }; });
    shuffle(opts);
    st.opts = opts;
    st.right = opts.map(function (o) { return o.right; }).indexOf(true);
    st.phase = 'type';
    renderHud();
    showSubject(q, false);
    snd('qnext');
    var nq = st.data.q[st.idx + 1];
    if (nq) preload(nq);
    later(function () {
      say(fill(q.q), q.s, function () {
        showMenu(opts.map(function (o) { return o.t; }), answer, {
          onBack: function () { askQuit('menu'); },
        });
      });
    }, reduce ? 0 : 260);
  }

  function reveal() {
    if (!st.cur.hide) return;
    E.subject.classList.remove('is-sil');
    E.subject.classList.add('is-reveal');
    E.plate.classList.remove('is-hid');
    E.plate.textContent = st.subjName;
    flash('white');
    snd('qreveal');
  }

  function answer(i) {
    var ok = i === st.right, q = st.cur;
    st.menu = null; // меню остаётся на экране ещё мгновение, чтобы подсветить выбор
    var rows = E.menu.children;
    for (var k = 0; k < rows.length; k++) {
      rows[k].classList.toggle('is-right', k === st.right);
      rows[k].classList.toggle('is-wrong', k === i && !ok);
    }
    st.phase = 'type';
    reveal();
    var gain = 0, from = st.exp;
    st.res[st.idx] = ok ? 1 : 0;
    if (ok) {
      st.ok++; st.streak++;
      gain = 100 + Math.min(st.streak - 1, 4) * 25;
      st.exp += gain;
      snd('qcorrect');
      flash('good');
      E.subject.classList.add('is-happy');
      popGain('+' + gain);
      countExp(from, st.exp);
    } else {
      st.streak = 0;
      st.hearts--;
      snd('qwrong');
      flash('bad');
      E.stage.classList.remove('is-shake'); void E.stage.offsetWidth; E.stage.classList.add('is-shake');
      E.subject.classList.add('is-sad');
      breakHeart(st.hearts);
    }
    renderHud();
    later(function () {
      hideMenu();
      var xx = fill(q.x), pages;
      if (ok) pages = [pickOf([_('Верно!'), _('Точно!'), _('Так и есть!'), _('Отлично!')]) + (st.streak >= 3 ? ' ' + _('Серия: {n}!', { n: st.streak }) : '') + ' ' + xx];
      else pages = [_('Неверно! Правильный ответ: {a}.', { a: st.opts[st.right].t }) + ' ' + xx];
      say(pages, q.s, function () { waitA(advance); });
    }, reduce ? 0 : 520);
  }
  function pickOf(a) { return a[(Math.random() * a.length) | 0]; }
  function popGain(t) {
    var g = E.gain;
    g.textContent = t; g.classList.remove('go'); void g.offsetWidth; g.classList.add('go');
  }

  function advance() {
    if (st.hearts <= 0) return endLose();
    if (st.idx >= TOTAL - 1) return endWin();
    st.idx++;
    wipeLite(nextQuestion);
  }
  /* между вопросами — короткая вспышка и «сползание» картинки, без полных шторок */
  function wipeLite(fn) {
    E.frame.classList.remove('is-wrongflash');
    st.phase = 'type';
    E.ta.textContent = ''; E.tb.textContent = '';
    E.subject.classList.add('is-out');
    later(function () { E.subject.classList.remove('is-out'); fn(); }, reduce ? 0 : 220);
  }

  function askQuit(from) {
    var prev = st.phase, pm = st.menu, pOpts = E.menu.innerHTML, sel = pm ? pm.sel : 0;
    var keep = { phase: prev, menu: pm, html: pOpts, cls: E.menu.className };
    snd('card');
    showMenu([_('ДА, ВЫЙТИ'), _('НЕТ, ПРОДОЛЖИТЬ')], function (i) {
      if (i === 0) { hideMenu(); st.phase = 'type'; wipe(function () { openTitle(true); }, null); }
      else restoreMenu(keep, sel);
    }, { onBack: function () { restoreMenu(keep, sel); }, nums: false, cls: 'is-confirm' });
  }
  function restoreMenu(keep, sel) {
    snd('back');
    if (keep.menu) {
      st.phase = 'menu';
      st.menu = keep.menu;
      E.menu.className = keep.cls;
      E.menu.innerHTML = keep.html;
      setSel(st.menu.sel, false);
    } else {
      hideMenu();
      st.phase = keep.phase;
    }
    emit('hints');
  }

  /* ---------- финалы ---------- */
  function rank() {
    var lost = LIVES - st.hearts;
    return lost === 0 ? { n: _('МАСТЕР-ТРЕНЕР'), s: 3 } : lost === 1 ? { n: _('ЭЛИТНЫЙ ТРЕНЕР'), s: 2 } : { n: _('ТРЕНЕР'), s: 1 };
  }
  function partyRow(grey) {
    var hd = st.data.hero, html = '<div class="qe-tr"><img class="qe-hero" alt=""></div>';
    st.data.party.forEach(function (id, i) {
      html += '<div class="qe-mon" style="--i:' + i + '"><img alt=""><b>' + esc(monName(id).toUpperCase()) + '</b></div>';
    });
    E.endRow.innerHTML = html;
    var im = E.endRow.querySelector('.qe-hero');
    loadInto(im, specUrls({ tr: hd.tr }), function (n) { im.style.width = (n.naturalWidth * 2) + 'px'; im.style.height = (n.naturalHeight * 2) + 'px'; im.classList.add('is-on'); });
    var mons = E.endRow.querySelectorAll('.qe-mon img');
    st.data.party.forEach(function (id, i) {
      var el = mons[i];
      loadInto(el, monUrls(id), function (n) {
        var s = fitScale(n.naturalWidth, n.naturalHeight, 104, 2);
        el.style.width = (n.naturalWidth * s) + 'px'; el.style.height = (n.naturalHeight * s) + 'px'; el.parentNode.classList.add('is-on');
      }, function () { el.parentNode.classList.add('is-on', 'is-miss'); });
    });
  }

  function endWin() {
    var r = rank();
    st.phase = 'type';
    snd('qwin');
    flash('white');
    wipe(function () {
      scene('end'); view.classList.add('is-win'); view.classList.remove('is-lose');
      hideMenu();
      E.ta.textContent = ''; E.tb.textContent = '';
      E.endHead.firstChild.textContent = _('ЗАЛ СЛАВЫ');
      E.endHead.lastChild.textContent = st.cd.title + ' · ' + stars(r.s);
      E.end.classList.add('is-on');
      partyRow(false);
      startConfetti();
      saveBest(r);
    }, function () {
      var d = st.data;
      say([_('Добро пожаловать в Зал Славы!'),
           _('Верных ответов: {ok} из {total}. Сердец осталось: {hearts}. EXP: {exp}. Ранг — {rank}!', { ok: st.ok, total: TOTAL, hearts: st.hearts, exp: st.exp, rank: r.n })],
          d.host, function () { endMenu(); });
    });
  }

  function endLose() {
    st.phase = 'type';
    snd('qlose');
    wipe(function () {
      scene('end'); view.classList.add('is-lose'); view.classList.remove('is-win');
      hideMenu();
      E.ta.textContent = ''; E.tb.textContent = '';
      E.endHead.firstChild.textContent = _('КОНЕЦ ИГРЫ');
      E.endHead.lastChild.textContent = _('сердец не осталось');
      E.end.classList.add('is-on');
      partyRow(true);
      stopConfetti();
    }, function () {
      say([_('Все три сердца потеряны… Но каждый тренер проигрывал, прежде чем стать лучшим.'),
           _('Верных ответов: {ok} из {total}. Попробуешь ещё раз?', { ok: st.ok, total: TOTAL })],
          st.data.host, function () { endMenu(); });
    });
  }

  function endMenu() {
    showMenu([_('ЕЩЁ РАЗ'), _('ЧИТАТЬ РАЗДЕЛ'), _('ВЫЙТИ')], function (i) {
      hideMenu();
      if (i === 0) { st.phase = 'type'; stopConfetti(); wipe(function () { openTitle(true); }, null); }
      else if (i === 1) later(function () { emit('section', { cart: st.id }); }, 120);
      else later(function () { emit('exit', { cart: st.id }); }, 120);
    }, { onBack: function () { hideMenu(); emit('exit', { cart: st.id }); }, cls: 'is-bar', nums: false });
  }

  /* ---------- рекорды ---------- */
  function readAll() { try { return JSON.parse(localStorage.getItem('pl-quiz') || '{}') || {}; } catch (e) { return {}; } }
  function readBest(id) { return readAll()[id] || null; }
  function saveBest(r) {
    var all = readAll(), b = all[st.id] || { wins: 0, exp: 0, stars: 0 };
    b.wins++; b.exp = Math.max(b.exp, st.exp); b.stars = Math.max(b.stars, r.s);
    all[st.id] = b;
    try { localStorage.setItem('pl-quiz', JSON.stringify(all)); } catch (e) {}
    emit('record', { id: st.id, best: b });
  }

  /* ---------- конфетти (Зал Славы) ---------- */
  var cf = { raf: 0, parts: [], on: false };
  var CF_COL = ['#ff5a8a', '#ffd24a', '#5ee0f6', '#9b7bff', '#7dffaa', '#ffffff', '#ff9a4a'];
  function startConfetti() {
    var cv = E.confetti, cx = cv.getContext('2d');
    cf.on = true; cf.parts = [];
    for (var i = 0; i < 70; i++) cf.parts.push(newPart(true));
    var last = 0;
    function newPart(init) {
      return { x: Math.random() * 384, y: init ? Math.random() * 216 : -6, w: 2 + ((Math.random() * 2) | 0), h: 3 + ((Math.random() * 3) | 0),
               vy: 22 + Math.random() * 38, vx: (Math.random() - .5) * 14, ph: Math.random() * 6.28, c: CF_COL[(Math.random() * CF_COL.length) | 0] };
    }
    (function loop(ts) {
      if (!cf.on) return;
      cf.raf = requestAnimationFrame(loop);
      if (ts - last < (reduce ? 120 : 50)) return;
      var dt = Math.min(0.1, (ts - last) / 1000); last = ts;
      cx.clearRect(0, 0, 384, 216);
      cf.parts.forEach(function (p, i) {
        p.y += p.vy * dt; p.x += (p.vx + Math.sin(p.ph + ts * .004) * 10) * dt;
        if (p.y > 220) cf.parts[i] = newPart(false);
        cx.fillStyle = p.c;
        cx.fillRect(Math.round(p.x), Math.round(p.y), (Math.sin(p.ph + ts * .01) > 0) ? p.w : 1, p.h);
      });
    })(0);
  }
  function stopConfetti() { cf.on = false; cancelAnimationFrame(cf.raf); var cx = E.confetti.getContext('2d'); cx.clearRect(0, 0, 384, 216); }

  /* ---------- ввод ---------- */
  function press(name) {
    if (!st || !view.classList.contains('is-active')) return false;
    if (st.busy) return true;
    var m = st.menu;
    if (m && st.phase === 'menu') {
      switch (name) {
        case 'up': case 'left': setSel((m.sel + m.items.length - 1) % m.items.length, true); return true;
        case 'down': case 'right': setSel((m.sel + 1) % m.items.length, true); return true;
        case 'a': pick(); return true;
        case 'b': case 'home': if (m.onBack) { snd('back'); m.onBack(); } return true;
        case 'x': case 'y': return true;
      }
      return false;
    }
    if (tw.on) { if (name === 'a' || name === 'b') typeSkip(); return name === 'a' || name === 'b' || name === 'up' || name === 'down'; }
    if (st.phase === 'wait' && st.onA) {
      if (name === 'a') { st.onA(); return true; }
      if (name === 'b' || name === 'home') { if (st.idx > 0 || st.res.length) askQuit('wait'); else { snd('back'); emit('exit', { cart: st.id }); } return true; }
      return name === 'up' || name === 'down' || name === 'left' || name === 'right';
    }
    return name === 'a' || name === 'b' || name === 'up' || name === 'down' || name === 'left' || name === 'right';
  }

  function hints() {
    if (!st) return [];
    if (st.phase === 'menu' && st.menu) {
      return st.menu.onBack ? [[['up', 'down'], _('Выбор')], [['a'], _('Выбрать')], [['b'], _('Назад')]] : [[['up', 'down'], _('Выбор')], [['a'], _('Выбрать')]];
    }
    if (st.phase === 'wait') return [[['a'], _('Дальше')], [['b'], _('Выйти')]];
    return [[['a'], _('Пропустить печать')], [['b'], _('Пропустить')]];
  }

  /* ---------- открытие / закрытие ---------- */
  function open(id) {
    if (!view) build();
    if (!DATA[id]) return false;
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    reset(id);
    noiseOn(true);
    openTitle(false);
    return true;
  }
  function close() {
    if (!st) return;
    typeStop(); stopConfetti(); noiseOn(false);
    st.token = ++seq;
    st.menu = null; st = null;
  }

  build_guard();
  function build_guard() { if (!view) build(); }

  return {
    open: open, close: close, press: press, hints: hints,
    active: function () { return !!st; },
    accent: function () { return st ? st.cd.c1 : '#19e3ff'; },
    best: readBest,
    status: function () { return st ? { title: st.cd.title, line: st.phase === 'title' ? _('заставка') : _('вопрос {n} из {total} · ♥ {hearts}', { n: Math.min(st.idx + 1, TOTAL), total: TOTAL, hearts: st.hearts }) } : { title: '', line: '' }; },
    stars: stars,
    on: function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    _state: function () { return st; }, _paginate: paginate, _nlines: nlines, _fill: fill,
  };
})();
