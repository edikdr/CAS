/* ==========================================================================
   Приложение: экраны, навигация, реакции на кнопки.
   Экраны: static (помехи + PLAY) → boot (загрузка) → home (меню) → section
   ========================================================================== */
(function () {
  var C = PL.config;
  var $ = function (s) { return document.querySelector(s); };
  var body = document.body;
  var root = document.documentElement;
  var wrap = $('#consoleWrap');
  var screen = $('#screen');
  var crt = $('#crt');
  var tilesEl = $('#tiles');
  var dockEl = $('#dock');
  var titleEl = $('#homeTitle');
  var tabList = $('#tabList');
  var scrollEl = $('#sectionScroll');
  var sectionView = $('.view-section');
  var hintsRight = $('#hintsRight');
  var helpEl = $('#help');
  var toastEl = $('#toast');
  var playBtn = $('#playBtn');
  var binderEl = $('#binder');
  var pageL = $('#pageL');
  var pageR = $('#pageR');
  var flyLayer = $('#flyLayer');
  var cmEl = $('#cardModal');
  var cmStage = $('#cmStage');
  var cmBox = $('#cmBox');
  var cmChips = $('#cmChips');

  var views = {};
  document.querySelectorAll('.view').forEach(function (v) { views[v.dataset.view] = v; });

  var S = {
    power: false,
    view: 'static',
    help: false,
    busy: true,
    row: 'tiles',
    tile: 0,
    dock: 0,
    section: 0,
    tx: 0,
    captures: 0,
    card: 0,
    spread: 0,
    top: 0,
    picker: false,
    connected: false,
    modal: null,
  };

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  if (store.get('pl-retro', true) === false) body.classList.add('retro-off');

  /* ---------- масштаб консоли под окно ---------- */
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var tight = vw < 760 || vh < 520;
    var s = Math.min((vw * (tight ? 0.995 : 0.975)) / 1200, (vh - (tight ? 4 : 40)) / 818);
    PL.scale = s;
    wrap.style.setProperty('--scale', s.toFixed(4));
    wrap.style.setProperty('--sk', Math.min(2.3, Math.max(1, 0.62 / s)).toFixed(3));   // на телефоне в портрете консоль мелкая: поля на экране PLAY увеличиваем, чтобы в них можно было попасть пальцем
    if (PL.cable) PL.cable.resize();
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------- утилиты ---------- */
  var toastTimer = 0;
  function toast(msg) {
    if (!S.power) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 1900);
  }

  function flash() {
    var f = $('#flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  function crtAnim(name) {
    crt.classList.remove('power-on', 'power-off', 'tune', 'flip');
    void crt.offsetWidth;
    if (name) crt.classList.add(name);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function tickClock() {
    var d = new Date();
    var t = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    $('#clock').textContent = t;
    $('#osdClock').textContent = t;
  }
  tickClock();
  setInterval(tickClock, 10000);

  /* ---------- экраны ---------- */
  function setView(name) {
    Object.keys(views).forEach(function (k) { views[k].classList.toggle('is-active', k === name); });
    if (S.view === 'quiz' && name !== 'quiz') PL.quiz.close();
    if (S.view === 'catch' && name !== 'catch') PL.catcher.close();
    if (S.view === 'scan' && name !== 'scan') PL.scan.close();
    S.view = name;
    screen.classList.toggle('is-content', name === 'home' || name === 'section' || name === 'album' || name === 'quiz' || name === 'catch' || name === 'scan');
    updateHints();
    updateAmbient();
  }

  function updateAmbient() {
    var c = '#000000';
    if (S.power) {
      if (S.view === 'static') c = '#39ff7a';
      else if (S.view === 'boot') c = '#ff6a52';
      else if (S.view === 'quiz') c = PL.quiz.accent();
      else if (S.view === 'catch') c = PL.catcher.accent();
      else if (S.view === 'scan') c = PL.scan.accent();
      else if (S.view === 'home') c = C.sections[S.tile].c1;
      else if (S.view === 'section') c = sectionAmbient || TABS[S.section].c1;
      else if (S.view === 'album') {
        var ac = S.modal ? dk(S.modal.i) : albumGet(S.card);
        c = ac ? PL.types[ac.type].c1 : '#b28cff';
      }
    }
    root.style.setProperty('--ambient', c);
  }

  var BADGE = { a: 'A', b: 'B', x: 'X', y: 'Y', l: 'L', r: 'R', plus: '+', minus: '−', up: '▲', down: '▼' };
  var sectionAmbient = null;
  var secCtrl = null;
  function hint(btns, label) {
    return '<span class="hint" data-btn-proxy="' + btns[btns.length - 1] + '">' +
      btns.map(function (b) { return '<b class="badge">' + BADGE[b] + '</b>'; }).join('') +
      ' ' + label + '</span>';
  }
  function updateHints() {
    var h = [];
    if (S.help) h = [hint(['b'], _('Close'))];
    else if (S.modal && S.modal.editing) h = [hint(['a'], _('Save')), hint(['b'], _('Cancel'))];
    else if (S.modal) h = [hint(['l', 'r'], _('Card')), hint(['up', 'down'], _('Detail')), hint(['y'], dk(S.modal.i) && dk(S.modal.i).mine ? _('Edit') : _('Favorites')), hint(['b'], _('Close'))];
    else if (S.picker) h = [hint(['b'], _('Close')), hint(['a'], _('Select set'))];
    else if (S.view === 'quiz') h = PL.quiz.hints().map(function (x) { return hint(x[0], x[1]); });
    else if (S.view === 'catch') h = PL.catcher.hints().map(function (x) { return hint(x[0], x[1]); });
    else if (S.view === 'scan') h = PL.scan.hints().map(function (x) { return hint(x[0], x[1]); });
    else if (S.view === 'album') h = [hint(['l', 'r'], _('Page')), hint(['x'], _('Sets')), hint(['y'], _('Scan')), hint(['b'], _('Back')), hint(['a'], _('Pull out'))];
    else if (S.view === 'home' && S.row === 'top') h = [hint(['b'], _('To tiles')), hint(['a'], S.top === 2 ? _('Open scanner') : S.top ? _('Open favorites') : _('Open album'))];
    else if (S.view === 'home') h = S.row === 'tiles'
      ? [hint(['plus'], _('Help')), hint(['a'], _('Open'))]
      : [hint(['b'], _('To tiles')), hint(['a'], _('Select'))];
    else if (S.view === 'section') h = (secCtrl ? secCtrl.hints() : []).map(function (x) { return hint(x[0], x[1]); });
    hintsRight.innerHTML = h.join('');
  }

  /* ---------- питание ---------- */
  function powerOn() {
    S.busy = true;
    S.power = true;
    body.classList.add('is-on');
    crt.classList.remove('is-off');
    setView('static');
    PL.static.setMode('static');
    crtAnim('power-on');
    PL.audio.play('on');
    PL.audio.hiss(1);
    setTimeout(function () { crtAnim(null); S.busy = false; }, 700);
  }

  function powerOff() {
    S.busy = true;
    closeHelp(true);
    closeCard(true);
    PL.audio.play('off');
    PL.audio.hiss(0);
    crtAnim('power-off');
    toastEl.classList.remove('is-show');
    setTimeout(function () {
      S.power = false;
      body.classList.remove('is-on');
      crtAnim(null);
      crt.classList.add('is-off');
      PL.static.setMode('off');
      setView('static');
      S.busy = false;
    }, 560);
  }

  /* ---------- питание: кабель → экран ---------- */
  /* включить консоль: если кабеля нет — воткнуть (быстро), если он ещё летит — пропустить анимацию */
  function wake() {
    if (S.power) return;
    if (PL.cable.isPlugged()) { if (!S.busy) powerOn(); return; }
    if (PL.cable.busy()) { PL.cable.snap(); return; }
    PL.cable.plugIn({ fast: true });
  }

  function whenReady(cond, cb) { (function w() { if (cond()) cb(); else setTimeout(w, 60); })(); }

  PL.cable.on('contact', function () {
    body.classList.add('is-plugged');
    var sp = $('#portSpark');
    if (sp) { sp.classList.remove('go'); void sp.offsetWidth; sp.classList.add('go'); }
    PL.audio.play('plug');
    bump(0, 1.2);
    if (!S.power) powerOn();
  });
  PL.cable.on('pull', function () {          // штекер потянули или кликнули: выдернуть (кабель сам разберётся с анимацией)
    if (launching || PL.cable.busy()) return false;
    if (S.power && S.busy) return false;
    if (S.power) powerOff();
    PL.audio.play('unplug');
    body.classList.remove('is-plugged');
  });
  PL.cable.on('push', function () {          // клик по пустому разъёму: воткнуть
    if (!PL.cable.isPlugged() && !PL.cable.busy()) PL.cable.plugIn({ fast: true });
  });
  screen.addEventListener('pointerdown', function () { if (!S.power && PL.cable.busy()) PL.cable.snap(); });

  /* ---------- джойконы: прилёт по рельсам, защёлкивание, отсоединение ---------- */
  var Mo = PL.motion, Ease = Mo.E, mix = Mo.mix;
  var consoleEl = $('#console'), bodyEl = $('.body'), bodyShell = $('.body-shell');
  var jcL = $('.joycon--left'), jcR = $('.joycon--right');
  var T_ATT = 1.8;
  ['l', 'r'].forEach(function (k) { var i = document.createElement('i'); i.className = 'seam seam--' + k; i.setAttribute('aria-hidden', 'true'); bodyEl.appendChild(i); });

  /* поза прилёта. side: −1 — левый джойкон, +1 — правый (с какой стороны консоли);
     vdir: откуда по рельсам (−1 сверху, +1 снизу; по умолчанию левый сверху, правый снизу) */
  function attachPose(side, vdir) {
    if (vdir == null) vdir = side;
    return function (u) {
      var t = u * T_ATT, y, x, z, rz, ry, sh;
      if (t < 0.9) {                           // подлёт по дуге: приближается сбоку и сверху/снизу, разворачивается
        var a = Ease.out3(t / 0.9);
        y = vdir * mix(560, 64, a); x = side * 100 * (1 - a); z = mix(170, 22, a);
        rz = vdir * 11 * (1 - a); ry = -side * 24 * (1 - a);
        sh = 1 - 0.85 * a;
      } else if (t < 1.14) {                   // выровнялся над рельсами, на миг завис
        var b = Ease.io2((t - 0.9) / 0.24);
        y = vdir * mix(64, 48, b); x = 0; z = mix(22, 6, b); rz = 0; ry = 0; sh = 0.15 * (1 - b * 0.5);
      } else if (t < 1.42) {                   // скольжение по рельсам: ускоряется
        var c = Ease.in2((t - 1.14) / 0.28);
        y = vdir * mix(48, -3.2, c); x = 0; z = mix(6, 0, c); rz = 0; ry = 0; sh = 0.07 * (1 - c);
      } else {                                 // защёлкнулся, короткий отскок
        var d = (t - 1.42) / (T_ATT - 1.42);
        y = vdir * (-3.2 * (1 - Ease.spring(d, 15, 0.4))); x = 0; z = 0; rz = 0; ry = 0; sh = 0;
      }
      return { persp: 1700, x: x, y: y, z: z, rz: rz, ry: ry, filter: 'drop-shadow(0 ' + (20 * sh).toFixed(1) + 'px ' + (22 * sh).toFixed(1) + 'px rgba(0,0,0,' + (0.55 * sh).toFixed(2) + '))' };
    };
  }
  /* отсоединение: щелчок назад, затем уезжает вдоль рельсов и в сторону, растворяясь */
  function leavePose(side) {
    return function (u) {
      var t = u * 0.95, y, x = 0, z = 0, rz = 0, ry = 0, o = 1;
      if (t < 0.1) {
        y = -side * 6 * Ease.out2(t / 0.1);
      } else {
        var b = Ease.in3((t - 0.1) / 0.85);
        y = mix(-side * 6, side * 640, b); x = side * mix(0, 96, b); z = mix(0, 170, b);
        rz = side * mix(0, 14, b); ry = -side * mix(0, 26, b); o = 1 - Mo.seg(b, 0.78, 1);
      }
      return { persp: 1700, x: x, y: y, z: z, rz: rz, ry: ry, o: o };
    };
  }

  /* толчок консоли: мелкая отдача при защёлкивании */
  function bump(dx, dy) {
    if (reduceMotion || !consoleEl.animate) return;
    dy = dy || 1.6;
    consoleEl.animate([
      { transform: 'translate(0,0)' }, { transform: 'translate(' + (dx * 0.8) + 'px,' + dy + 'px)', offset: 0.25 },
      { transform: 'translate(' + (-dx * 0.4) + 'px,' + (-dy * 0.5) + 'px)', offset: 0.55 }, { transform: 'translate(0,0)' },
    ], { duration: 280, easing: 'ease-out' });
  }
  function seamFlash(side) {
    var sm = bodyEl.querySelector('.seam--' + (side < 0 ? 'l' : 'r'));
    if (sm && sm.animate && !reduceMotion) sm.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.14 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
  }

  /* один джойкон: подлёт, рельсы, защёлка. delay и k — для второго джойкона и для смены цвета */
  function attachOne(el, side, delay, k, vdir) {
    k = k || 1;
    var a = Mo.play(el, attachPose(side, vdir), T_ATT * k * 1000, { delay: delay * 1000 });
    Mo.cues(a, [
      { t: delay + 0.05, fn: function () { PL.audio.play('swoosh'); } },
      { t: delay + 1.14 * k, fn: function () { PL.audio.play('slide'); } },
      { t: delay + 1.42 * k, fn: function () { PL.audio.play('snap'); seamFlash(side); bump(side * 1.4, 1.4); } },
    ]);
    return a.finished.then(function () { el.style.transform = ''; el.style.filter = ''; a.cancel(); }, function () {});
  }

  /* PLAY: джойконы прилетают сверху и снизу и подключаются к консоли */
  function connectJoycons(done) {
    if (S.connected || reduceMotion) { S.connected = true; body.classList.remove('jc-off'); return done && done(); }
    S.busy = true;
    body.classList.remove('jc-off');
    var osd = $('#connectOsd');
    Promise.all([attachOne(jcL, -1, 0, 1), attachOne(jcR, 1, 0.16, 1)]).then(function () {
      S.connected = true;
      osd.classList.add('is-show');
      PL.audio.play('select');
      setTimeout(function () {
        osd.classList.remove('is-show');
        S.busy = false;
        if (done) done();
      }, 1150);
    });
  }

  /* смена раскраски: старые джойконы отъезжают и уезжают, новые прилетают и защёлкиваются */
  var SKIN_VARS = ['--jc-red', '--jc-red-hi', '--jc-red-lo', '--jc-blue', '--jc-blue-hi', '--jc-blue-lo', '--body', '--body-hi', '--body-lo', '--body-rim', '--btn', '--btn-hi', '--btn-lo', '--btn-sym'];
  var swapping = false, queuedSkin = null, currentSkin = null;

  function sweep() {
    var sw = bodyShell.querySelector('.body-sweep');
    if (!sw) { sw = document.createElement('div'); sw.className = 'body-sweep'; bodyShell.appendChild(sw); }
    sw.classList.remove('go'); void sw.offsetWidth; sw.classList.add('go');
  }

  function swapSkin(sk) {
    swapping = true;
    var cs = getComputedStyle(root);
    function ghost(jc, left) {   // копия со старыми цветами, лежит поверх настоящего джойкона
      var g = jc.cloneNode(true);
      g.classList.add('jc-ghost');
      g.setAttribute('aria-hidden', 'true');
      g.style.left = jc.offsetLeft + 'px';
      SKIN_VARS.forEach(function (v) { g.style.setProperty(v, cs.getPropertyValue(v).trim()); });
      consoleEl.appendChild(g);
      return g;
    }
    var gl = ghost(jcL), gr = ghost(jcR);
    consoleEl.classList.add('is-swapping');
    applySkin(sk.id, false);   // настоящие джойконы и корпус получают новые цвета
    sweep();
    PL.audio.play('slide');
    var ps = [];
    [[gl, -1, 0], [gr, 1, 0.07]].forEach(function (g) {
      var a = Mo.play(g[0], leavePose(g[1]), 950, { delay: g[2] * 1000 });
      var rm = function () { g[0].remove(); };
      ps.push(a.finished.then(rm, rm));
    });
    // новые прилетают с противоположной стороны рельсов: левый снизу, правый сверху — пути не пересекаются
    ps.push(attachOne(jcL, -1, 0.4, 0.82, 1));
    ps.push(attachOne(jcR, 1, 0.52, 0.82, -1));
    return Promise.all(ps).then(function () { swapping = false; consoleEl.classList.remove('is-swapping'); });
  }

  function changeSkin(id) {
    var sk = C.skins.filter(function (x) { return x.id === id; })[0];
    if (!sk || sk.id === currentSkin) return;
    if (swapping) { queuedSkin = id; return; }
    if (S.connected && !reduceMotion) {
      swapSkin(sk).then(function () {
        if (queuedSkin) { var q = queuedSkin; queuedSkin = null; changeSkin(q); }
      });
    } else { applySkin(sk.id, true); sweep(); }
  }

  /* ---------- PLAY: помехи → настройка канала → загрузка → меню ---------- */
  /* общий запуск экрана: настройка канала, вспышка, загрузка, затем then() */
  function runBoot(sub, then, quick) {
    S.busy = true;
    closeHelp(true);
    var k = quick ? 0.78 : 1;
    $('#bootSub').textContent = sub || C.tagline;
    setTimeout(function () {
      crtAnim('tune');
      PL.static.setMode('tune');
      PL.audio.play('tune');
    }, 200 * k);
    setTimeout(function () {
      crtAnim('flip');
      flash();
      PL.audio.hiss(0);
    }, 700 * k);
    setTimeout(function () {
      setView('boot');
      PL.static.setMode('grain');
      playBtn.classList.remove('is-launching');
    }, 940 * k);
    setTimeout(function () { crtAnim(null); }, 1220 * k);
    setTimeout(function () { PL.audio.play('boot'); }, 2080 * k);
    setTimeout(then, 3500 * k);
  }

  function startPlay() {
    if (S.busy || S.view !== 'static' || !S.power) return;
    if (!S.connected) return connectJoycons(startPlay);
    var ins = PL.carts.inserted();
    if (ins) { playBtn.classList.add('is-launching'); PL.audio.play('select'); return bootCart(ins); }
    playBtn.classList.add('is-launching');
    PL.audio.play('select');
    runBoot(C.tagline, function () {
      S.row = 'tiles';
      setView('home');
      updateHome(true);
      S.busy = false;
    });
  }

  /* ---------- картриджи ---------- */
  var launching = false;

  /* Картридж уже в слоте. Консоль включена и джойконы подключены — сразу загрузка и викторина.
     Иначе картридж ждёт: включи кабель, нажми PLAY, и запустится он. */
  function bootCart(id) {
    var cd = C.carts.filter(function (x) { return x.id === id; })[0];
    if (!cd || launching) return;
    if (!S.power) { toast(_('Cartridge is in the slot. Drag the cable to the USB-C port')); return; }
    if (!S.connected) { toast(_('Cartridge is in the slot. Press PLAY')); return; }
    launching = true;
    PL.carts.hold(true);
    function finish() { launching = false; PL.carts.hold(false); }
    whenReady(function () { return !S.busy; }, function () {
      if (!S.power || PL.carts.inserted() !== id) { playBtn.classList.remove('is-launching'); return finish(); }
      closeHelp(true); closeCard(true); closePicker(true);
      S.busy = true;
      runBoot(_('«{name}» · {sub}', { name: cd.ru, sub: cd.sub }), function () {
        if (cd.game === 'catch') { PL.catcher.open(id); setView('catch'); }
        else { PL.quiz.open(id); setView('quiz'); }
        S.busy = false;
        finish();
      }, true);
    });
  }
  PL.carts.on('seated', function (e) { bootCart(e.id); });

  /* с клавиатуры (Enter на выбранном картридже): вставить; дальше всё сделает 'seated' */
  function launchCart(id) { PL.carts.insert(id, { onSeat: function () { flash(); } }); }

  /* из викторины: открыть раздел картриджа (картридж остаётся в слоте) / вынуть картридж */
  function openCartSection(id) {
    var cd = C.carts.filter(function (x) { return x.id === id; })[0];
    if (!cd || S.busy) return;
    var idx = 0;
    TABS.forEach(function (t, i) { if (t.id === cd.opens) idx = i; });
    PL.sections.prefer(cd.opens, cd.tab);
    S.busy = true;
    PL.audio.play('open');
    setTimeout(function () {
      S.section = idx;
      renderSection(false);
      setView('section');
      scrollEl.scrollTop = 0;
      S.busy = false;
    }, 160);
  }
  PL.quiz.on('section', function (e) { openCartSection(e.cart); });
  PL.quiz.on('exit', function () { ejectCart(); });
  PL.quiz.on('hints', function () { if (S.view === 'quiz') updateHints(); });
  PL.catcher.on('exit', function () { ejectCart(); });
  PL.catcher.on('hints', function () { if (S.view === 'catch') updateHints(); });

  /* «Достать»: картридж выезжает, экран возвращается на PLAY (так же, если его вытянули рукой) */
  function ejectCart() {
    if (launching || !PL.carts.inserted()) return;
    PL.carts.eject({});
  }
  PL.carts.on('eject-start', function () {
    if (S.power && S.view !== 'static') whenReady(function () { return !S.busy; }, function () { goStatic(true); });
  });
  PL.carts.on('play', launchCart);
  PL.carts.on('eject', ejectCart);

  /* выход из меню обратно на помехи (картридж при этом выезжает) */
  function goStatic(keepCart) {
    S.busy = true;
    PL.audio.play('back');
    crtAnim('flip');
    if (!keepCart && PL.carts.inserted()) PL.carts.eject();
    setTimeout(function () {
      closeHelp(true);
      closeCard(true);
      setView('static');
      PL.static.setMode('static');
      PL.audio.hiss(1);
    }, 240);
    setTimeout(function () { crtAnim(null); S.busy = false; }, 520);
  }

  /* ---------- главное меню ---------- */
  function renderHome() {
    tilesEl.innerHTML = C.sections.map(function (s, i) {
      return '<div class="tile" data-i="' + i + '" style="--c1:' + s.c1 + ';--c2:' + s.c2 + ';--i:' + i + '">' +
        '<div class="tile-art">' +
          '<span class="tile-num">' + pad2(i + 1) + '</span>' +
          '<span class="tile-icon">' + PL.icon(s.icon) + '</span>' +
          '<span class="tile-name">' + s.title + '</span>' +
        '</div></div>';
    }).join('');
    renderDock();

    tilesEl.querySelectorAll('.tile').forEach(function (t) {
      var i = +t.dataset.i;
      t.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY) || S.view !== 'home' || S.busy || S.help) return;
        if (S.row !== 'tiles' || S.tile !== i) { S.row = 'tiles'; S.tile = i; updateHome(true); }
      });
      t.addEventListener('click', function () {
        if (S.view !== 'home' || S.busy || S.help) return;
        S.row = 'tiles'; S.tile = i; updateHome(true);
        openTile(i);
      });
    });
  }

  function renderDock() {
    dockEl.innerHTML = C.dock.map(function (d, i) {
      var icon = d.id === 'sound' && PL.audio.isMuted() ? 'mute' : d.icon;
      var off = (d.id === 'sound' && PL.audio.isMuted()) || (d.id === 'retro' && body.classList.contains('retro-off'));
      return '<button class="dock-btn' + (off ? ' is-off' : '') + '" data-i="' + i + '" style="--dc:' + d.color + ';--i:' + i + '" aria-label="' + d.label + '">' +
        PL.icon(icon) + '<span class="dock-label">' + d.label + '</span></button>';
    }).join('');
    dockEl.querySelectorAll('.dock-btn').forEach(function (b) {
      var i = +b.dataset.i;
      b.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY) || S.view !== 'home' || S.busy || S.help) return;
        if (S.row !== 'dock' || S.dock !== i) { S.row = 'dock'; S.dock = i; updateHome(); }
      });
      b.addEventListener('click', function () {
        if (S.view !== 'home' || S.busy || S.help) return;
        S.row = 'dock'; S.dock = i; updateHome();
        activateDock(i);
      });
    });
    if (S.view === 'home') updateHome();
  }

  function updateHome(swapTitle) {
    tilesEl.querySelectorAll('.tile').forEach(function (t, i) {
      t.classList.toggle('is-selected', S.row === 'tiles' && i === S.tile);
    });
    dockEl.querySelectorAll('.dock-btn').forEach(function (b, i) {
      b.classList.toggle('is-selected', S.row === 'dock' && i === S.dock);
    });
    $('#hudAlbum').classList.toggle('is-selected', S.row === 'top' && S.top === 0);
    $('#hudFav').classList.toggle('is-selected', S.row === 'top' && S.top === 1);
    $('#hudScan').classList.toggle('is-selected', S.row === 'top' && S.top === 2);

    var s = C.sections[S.tile];
    titleEl.querySelector('b').textContent = s.title;
    titleEl.querySelector('span').textContent = s.subtitle;
    if (swapTitle) { titleEl.classList.remove('swap'); void titleEl.offsetWidth; titleEl.classList.add('swap'); }

    // прокрутка ленты, чтобы выбранная плитка была видна
    var step = 166 + 16, padX = 36, vw = 768;
    var x = padX + S.tile * step + S.tx;
    if (x < padX) S.tx += padX - x;
    if (x + 166 > vw - padX) S.tx -= x + 166 - (vw - padX);
    tilesEl.style.setProperty('--tx', S.tx + 'px');

    updateHints();
    updateAmbient();
  }

  function moveHome(dir) {
    var n = C.sections.length, m = C.dock.length;
    if (S.row === 'tiles') {
      if (dir === 'left' || dir === 'right') {
        var t = S.tile + (dir === 'right' ? 1 : -1);
        if (t < 0 || t >= n) return PL.audio.play('error');
        S.tile = t;
        PL.audio.play('tick');
        return updateHome(true);
      }
      if (dir === 'down') { S.row = 'dock'; PL.audio.play('tick'); return updateHome(); }
      if (dir === 'up') { S.row = 'top'; PL.audio.play('tick'); return updateHome(); }
      return PL.audio.play('error');
    }
    if (S.row === 'top') {
      if (dir === 'down') { S.row = 'tiles'; PL.audio.play('tick'); return updateHome(); }
      if ((dir === 'right' && S.top < 2) || (dir === 'left' && S.top > 0)) { S.top += dir === 'right' ? 1 : -1; PL.audio.play('tick'); return updateHome(); }
      return PL.audio.play('error');
    }
    if (dir === 'left' || dir === 'right') {
      var d = S.dock + (dir === 'right' ? 1 : -1);
      if (d < 0 || d >= m) return PL.audio.play('error');
      S.dock = d;
      PL.audio.play('tick');
      return updateHome();
    }
    if (dir === 'up') { S.row = 'tiles'; PL.audio.play('tick'); return updateHome(); }
    PL.audio.play('error');
  }

  function openTile(i) {
    S.busy = true;
    var t = tilesEl.children[i];
    t.classList.add('is-opening');
    PL.audio.play('open');
    setTimeout(function () {
      t.classList.remove('is-opening');
      S.section = i;
      renderSection(false);
      setView('section');
      scrollEl.scrollTop = 0;
      S.busy = false;
    }, 230);
  }

  function activateDock(i) {
    var d = C.dock[i];
    switch (d.id) {
      case 'news': openNews(); break;
      case 'search': searchToast(); break;
      case 'controls': openHelp(); break;
      case 'retro': toggleRetro(); break;
      case 'sound': toggleSound(); break;
      case 'exit': goStatic(); break;
    }
  }

  /* ---------- раздел (содержимое — js/sections.js) ---------- */
  var TABS = C.sections.concat([
    { id: 'news', title: _('News'), subtitle: _('What’s new this year'), icon: 'news', c1: '#ff6a52', c2: '#a8321e' },
    { id: 'favorites', title: _('Favorites'), subtitle: _('Favorite Pokémon, cards and screenshots'), icon: 'heart', c1: '#ff5f8f', c2: '#a3204f' },
  ]);

  function renderSection(animate) {
    var s = TABS[S.section];
    sectionView.style.setProperty('--sc', s.c1);
    sectionView.style.setProperty('--sc2', s.c2);

    tabList.innerHTML = TABS.map(function (x, i) {
      return '<span class="tab' + (i === S.section ? ' is-active' : '') + (x.id === 'favorites' ? ' tab-fav' : '') + '" data-i="' + i + '">' + (x.id === 'favorites' ? PL.icon('heart') : '') + x.title + '</span>';
    }).join('');
    tabList.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var i = +tab.dataset.i;
        if (i !== S.section && !S.busy && !S.modal) { S.section = i; PL.audio.play('tick'); renderSection(true); }
      });
    });
    var active = tabList.querySelector('.is-active');
    tabList.scrollTo({ left: active.offsetLeft - (tabList.clientWidth - active.offsetWidth) / 2, behavior: animate ? 'smooth' : 'auto' });

    scrollEl.className = 'section-scroll sec-host';
    sectionAmbient = null;
    secCtrl = PL.sections.mount(s.id, scrollEl);
    if (animate) { scrollEl.classList.remove('swap'); void scrollEl.offsetWidth; scrollEl.classList.add('swap'); }
    if (S.section < C.sections.length) S.tile = S.section;
    updateAmbient();
    updateHints();
  }

  function switchSection(delta) {
    var n = TABS.length;
    S.section = (S.section + delta + n) % n;
    PL.audio.play('tick');
    renderSection(true);
  }

  function backHome() {
    S.tile = Math.min(S.section, C.sections.length - 1);
    var tid = TABS[S.section].id;
    S.row = tid === 'news' ? 'dock' : S.section >= C.sections.length ? 'top' : 'tiles';
    if (tid === 'news') S.dock = 0;
    else if (S.row === 'top') S.top = 1;
    PL.audio.play('back');
    setView('home');
    updateHome(true);
  }

  function openNews() {
    S.busy = true;
    PL.audio.play('open');
    setTimeout(function () {
      S.section = TABS.length - 2;
      renderSection(false);
      setView('section');
      scrollEl.scrollTop = 0;
      S.busy = false;
    }, 160);
  }

  function openFavorites() {
    S.busy = true;
    PL.audio.play('open');
    setTimeout(function () {
      S.section = TABS.length - 1;
      renderSection(false);
      setView('section');
      S.busy = false;
    }, 160);
  }

  /* ---------- сканер карточек ---------- */
  var scanBack = 'home';
  function openScan(opts) {
    if (S.busy || S.modal || S.help || S.picker) return;
    if (S.view === 'home' || S.view === 'album' || S.view === 'section') scanBack = S.view;
    S.busy = true;
    PL.audio.play('open');
    setTimeout(function () {
      PL.scan.open(opts || {});
      setView('scan');
      S.busy = false;
    }, 160);
  }
  function leaveScan(then) {
    var back = scanBack || 'home';
    setView(back);
    if (back === 'home') { S.row = 'top'; S.top = 2; updateHome(); }
    else if (back === 'album') { if (albumSpec.mine) { S.busy = false; openAlbum({ mine: 1 }); } else updateAlbum(); }
    else if (back === 'section' && TABS[S.section].id === 'favorites') renderSection(false);
    updateFavCount();
    if (then) then();
  }
  PL.scan.on('exit', function () { leaveScan(); });
  PL.scan.on('album', function () { leaveScan(function () { S.busy = false; openAlbum({ mine: 1 }); }); });
  PL.scan.on('hints', function () { if (S.view === 'scan') updateHints(); });
  /* совпадения сканера: превью карточки поверх сканера (листаются L/R) и переход к ней в основном альбоме */
  PL.scan.on('preview', function (e) { openCardDeck(e.list, e.at); });
  PL.scan.on('open-album', function (e) {
    var c = D.light(e.row);
    leaveScan(function () { S.busy = false; openAlbum(c.num ? { dex: c.num } : { set: c.setId }, false, c.id); });
  });
  /* перетащил картинки на сайт — сканер откроется сам */
  PL.scan.on('drop', function (e) {
    if (!S.power || S.modal || S.help) { toast(_('Turn on the console to add cards')); return; }
    if (S.view === 'scan') return PL.scan.addFiles(e.files);
    if (S.view === 'home' || S.view === 'album' || S.view === 'section') openScan({ files: e.files });
  });

  function updateFavCount() {
    $('#hudFavCount').textContent = PL.fav.count() + PL.shot.count() + PL.mine.count();
    $('#hudScanCount').textContent = PL.mine.count();
  }
  PL.mine.on(function () { updateFavCount(); });
  PL.shot.on('change', function () { updateFavCount(); });


  /* ---------- «поймать» покемона в покебол перед добавлением в избранное ---------- */
  var BALL_SVG = '<svg viewBox="0 0 56 56" class="cap-ball" aria-hidden="true">' +
    '<defs><radialGradient id="capRg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff8a7e"/><stop offset=".55" stop-color="#e8382c"/><stop offset="1" stop-color="#a81c1c"/></radialGradient>' +
    '<radialGradient id="capWg" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e3e6ee"/><stop offset="1" stop-color="#aab1c2"/></radialGradient></defs>' +
    '<g class="cb-bot"><path d="M4 28A24 24 0 0 0 52 28Z" fill="url(#capWg)" stroke="#1b1d27" stroke-width="2.4" stroke-linejoin="round"/></g>' +
    '<g class="cb-top"><path d="M4 28A24 24 0 0 1 52 28Z" fill="url(#capRg)" stroke="#1b1d27" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 22A18 18 0 0 1 26 10" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
    '<rect x="4" y="26" width="48" height="4" fill="#1b1d27"/>' +
    '<circle cx="28" cy="28" r="7.5" fill="#f6f7fb" stroke="#1b1d27" stroke-width="2.6"/><circle cx="28" cy="28" r="3.2" class="cb-btn" fill="#cfd4df"/></svg>';

  function captureAnim(srcEl, tgtEl, done) {
    var sc = PL.scale || 1, cr = crt.getBoundingClientRect();
    if (!srcEl || !srcEl.getBoundingClientRect || reduceMotion || !srcEl.animate) return done();
    var r = srcEl.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return done();
    function pt(rect) { return { x: (rect.left + rect.width / 2 - cr.left) / sc, y: (rect.top + rect.height / 2 - cr.top) / sc, w: rect.width / sc, h: rect.height / sc }; }
    var s0 = pt(r), t0 = pt((tgtEl || srcEl).getBoundingClientRect());
    var layer = document.createElement('div');
    layer.className = 'cap-layer';
    // мордочка-призрак на месте картинки; сама картинка прячется, пока идёт «ловля»
    var ghost = document.createElement('img');
    ghost.className = 'cap-ghost';
    ghost.src = srcEl.currentSrc || srcEl.src;
    ghost.style.cssText = 'left:' + (s0.x - s0.w / 2) + 'px;top:' + (s0.y - s0.h / 2) + 'px;width:' + s0.w + 'px;height:' + s0.h + 'px';
    var ball = document.createElement('div');
    ball.className = 'cap-ballwrap';
    ball.innerHTML = BALL_SVG;
    var BX = s0.x, BY = Math.max(40, s0.y - s0.h * 0.5 - 8);        // шар парит над мордочкой
    ball.style.cssText = 'left:' + (BX - 28) + 'px;top:' + (BY - 28) + 'px';
    var flashEl = document.createElement('i'); flashEl.className = 'cap-flash';
    flashEl.style.cssText = 'left:' + (BX - 60) + 'px;top:' + (BY - 60) + 'px';
    layer.appendChild(flashEl); layer.appendChild(ghost); layer.appendChild(ball);
    crt.appendChild(layer);
    var prevVis = srcEl.style.visibility;
    srcEl.style.visibility = 'hidden';
    S.busy = true;

    var top = ball.querySelector('.cb-top');
    top.style.transformOrigin = '4px 28px';
    top.style.transform = 'rotate(-72deg)';
    var T = 0;
    function after(ms, fn) { T = ms; return setTimeout(fn, ms); }
    var anims = [];
    function A(el, kf, o) { var a = el.animate(kf, o); anims.push(a); return a; }

    // 0–260: шар появляется и раскрывается
    A(ball, [{ transform: 'scale(.2) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'forwards' });
    PL.audio.play('ballcatch');
    // 240–760: красное «засасывание»: мордочка белеет, краснеет и втягивается в шар
    var dx = BX - s0.x, dy = BY - s0.y;
    A(ghost, [
      { transform: 'translate(0,0) scale(1)', filter: 'brightness(1)', opacity: 1, offset: 0 },
      { transform: 'translate(0,0) scale(1.04)', filter: 'brightness(5) saturate(0)', opacity: 1, offset: .22 },
      { transform: 'translate(' + dx * .35 + 'px,' + dy * .35 + 'px) scale(.7)', filter: 'grayscale(1) brightness(1.4) sepia(1) hue-rotate(-52deg) saturate(9)', opacity: .95, offset: .6 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.04)', filter: 'grayscale(1) brightness(2) sepia(1) hue-rotate(-52deg) saturate(9)', opacity: .9, offset: 1 },
    ], { duration: 560, delay: 240, easing: 'cubic-bezier(.5,0,.9,.55)', fill: 'both' });
    A(flashEl, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: .9, offset: .4 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 620, delay: 240, easing: 'ease-out', fill: 'both' });

    // 800: шар захлопывается
    after(800, function () {
      ghost.style.display = 'none';
      top.style.transition = 'transform .14s cubic-bezier(.5,0,1,1)';
      top.style.transform = 'rotate(0deg)';
      PL.audio.play('ballshut');
      A(flashEl, [{ transform: 'scale(.5)', opacity: .8 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 340, easing: 'ease-out', fill: 'both' });
    });
    // 960–1150: падает и пружинит
    after(960, function () {
      A(ball, [
        { transform: 'translateY(0)', offset: 0 },
        { transform: 'translateY(' + (s0.h * 0.5 + 6) + 'px) scaleY(1)', offset: .55, easing: 'cubic-bezier(.5,0,1,.6)' },
        { transform: 'translateY(' + (s0.h * 0.5 + 6) + 'px) scale(1.12,.86)', offset: .66 },
        { transform: 'translateY(' + (s0.h * 0.5 - 6) + 'px) scale(.96,1.05)', offset: .82 },
        { transform: 'translateY(' + (s0.h * 0.5 + 6) + 'px) scale(1,1)', offset: 1 },
      ], { duration: 420, fill: 'forwards' });
      PL.audio.play('tick');
    });
    // 1360–2260: три покачивания с щелчками
    var DROP = s0.h * 0.5 + 6;
    after(1360, function () {
      var wob = A(ball, [
        { transform: 'translateY(' + DROP + 'px) rotate(0)' },
        { transform: 'translateY(' + DROP + 'px) rotate(-20deg)', offset: .1 }, { transform: 'translateY(' + DROP + 'px) rotate(18deg)', offset: .2 }, { transform: 'translateY(' + DROP + 'px) rotate(0)', offset: .27 },
        { transform: 'translateY(' + DROP + 'px) rotate(0)', offset: .35 },
        { transform: 'translateY(' + DROP + 'px) rotate(-14deg)', offset: .45 }, { transform: 'translateY(' + DROP + 'px) rotate(12deg)', offset: .55 }, { transform: 'translateY(' + DROP + 'px) rotate(0)', offset: .62 },
        { transform: 'translateY(' + DROP + 'px) rotate(0)', offset: .72 },
        { transform: 'translateY(' + DROP + 'px) rotate(-8deg)', offset: .8 }, { transform: 'translateY(' + DROP + 'px) rotate(6deg)', offset: .88 }, { transform: 'translateY(' + DROP + 'px) rotate(0)', offset: 1 },
      ], { duration: 900, easing: 'ease-in-out', fill: 'forwards' });
      [0, 300, 600].forEach(function (d) { setTimeout(function () { PL.audio.play('click'); }, d + 80); });
    });
    // 2500: «пойман!» — кнопка гаснет, искры
    after(2290, function () {
      ball.classList.add('is-caught');
      PL.audio.play('ballping');
      for (var i = 0; i < 8; i++) {
        var sp = document.createElement('i');
        sp.className = 'cap-spark';
        var ang = i / 8 * Math.PI * 2;
        sp.style.cssText = 'left:' + BX + 'px;top:' + (BY + DROP) + 'px;--dx:' + Math.cos(ang) * 38 + 'px;--dy:' + Math.sin(ang) * 30 + 'px';
        layer.appendChild(sp);
      }
    });
    // 2900: шар летит в сердечко и растворяется
    after(2620, function () {
      var fx = t0.x - BX, fy = t0.y - BY;
      A(ball, [
        { transform: 'translate(0,' + DROP + 'px) scale(1)', opacity: 1 },
        { transform: 'translate(' + fx * .5 + 'px,' + (DROP + (fy - DROP) * .4 - 24) + 'px) scale(.8)', opacity: 1, offset: .5 },
        { transform: 'translate(' + fx + 'px,' + fy + 'px) scale(.25)', opacity: 0 },
      ], { duration: 460, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' });
      PL.audio.play('swoosh');
    });
    after(3090, function () {
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
      layer.remove();
      srcEl.style.visibility = prevVis;
      S.busy = false;
      done();
    });
  }

  PL.sections.setContext({
    capture: captureAnim,
    audio: function (n) { PL.audio.play(n); },
    toast: function (m) { toast(m); },
    openCards: function (cards, i) { openCardDeck(cards, i); },
    openAlbum: function (spec) { openAlbum(spec, true); },
    openScan: function () { openScan(); },
    ambient: function (c) { sectionAmbient = c; updateAmbient(); },
    hints: function () { updateHints(); },
    favChanged: function () { updateFavCount(); },
  });

  /* ---------- альбом-журнал ---------- */
  var PER_PAGE = 6, PER_SPREAD = 12;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var D = PL.data;
  /* если загрузка из сети затянулась, показываем подсказку */
  function withHint(p, msg) {
    var t = setTimeout(function () { toast(msg); }, 450);
    function done() { clearTimeout(t); }
    p.then(done, done);
    return p;
  }
  var albumList = [];   // карточки (объекты) или номера строк индекса (создаются по требованию)
  var albumSpec = store.get('pl-album-set', null);
  if (!albumSpec || (albumSpec.set && !D.setMeta[albumSpec.set])) albumSpec = D.setMeta.sv3pt5 ? { set: 'sv3pt5' } : D.sets.length ? { set: D.sets[D.sets.length - 1].id } : { fav: 1 };
  var albumReturn = 'home';

  function albumGet(i) {
    var x = albumList[i];
    if (typeof x === 'number') x = albumList[i] = D.light(x);
    return x;
  }

  function albumSlots() { return Math.max(PER_SPREAD, Math.ceil(albumList.length / PER_SPREAD) * PER_SPREAD); }
  function spreads() { return albumSlots() / PER_SPREAD; }

  function loadAlbum(spec) {
    if (spec.set) return D.cardsOf(spec.set);                                  // полный набор (один запрос)
    if (spec.fav) return Promise.resolve(D.lightsByIds(PL.fav.list('cards')));
    if (spec.mine) return PL.mine.cards();
    if (spec.dex) return Promise.resolve(D.rowsByDex(spec.dex));
    var f = spec.search || {};
    return Promise.resolve(f.q || f.type != null || f.rarity || f.sup != null ? D.search(f.q, f) : D.allRows());
  }
  var RAR_RU = { common: _('common'), uncommon: _('uncommon'), rare: _('rare'), ultra: _('ultra'), special: _('special') };
  var SUP_RU = [_('Pokémon'), _('trainers'), _('energy')];
  function filterText(f) {
    var out = [];
    if (f.type != null) out.push((PL.types[D.typeIdx[f.type]] || {}).name || '');
    if (f.rarity) out.push(RAR_RU[f.rarity]);
    if (f.sup != null) out.push(SUP_RU[f.sup]);
    return out.filter(Boolean).join(', ');
  }
  function albumHeader() {
    var spec = albumSpec, title = _('Trainer’s Album'), sub;
    var n = albumList.length + ' ' + _n(albumList.length, 'card|cards');
    if (spec.set) {
      var m = D.setMeta[spec.set] || {};
      sub = m.n + ' · ' + m.se + ' · ' + (m.d || '').slice(0, 4) + ' · ' + n;
    } else if (spec.fav) { title = _('Favorite cards'); sub = n; }
    else if (spec.mine) { title = _('My collection'); sub = n + ' · ' + _('your scans and photos'); }
    else if (spec.dex) { var p = D.dexById[spec.dex]; title = _('{name} cards', { name: p ? p.ru : '' }); sub = _('{n} from all sets', { n: n }); }
    else {
      var f = spec.search || {};
      title = f.q ? _('Search: “{q}”', { q: f.q }) : _('All cards');
      sub = n + (filterText(f) ? ' · ' + filterText(f) : '') + ' · ' + _('newest first');
    }
    $('#albumTitle').textContent = title;
    $('#albumSub').textContent = sub;
  }

  function pageHTML(page) {
    var html = '<div class="page-grid">';
    for (var k = 0; k < PER_PAGE; k++) {
      var i = page * PER_PAGE + k;
      var c = i < albumList.length ? albumGet(i) : null;
      html += c
        ? '<div class="pocket" data-i="' + i + '" style="--i:' + k + '"><div class="pk-card">' + PL.tcg.html(c) + '</div><div class="pk-sleeve"></div></div>'
        : '<div class="pocket is-empty" data-i="' + i + '" style="--i:' + k + '"><div class="pk-card"><span class="pk-empty"></span></div><div class="pk-sleeve"></div></div>';
    }
    return html + '</div><span class="page-num">' + _('PAGE {n}', { n: pad2(page + 1) }) + '</span>';
  }

  function renderSpread() {
    pageL.innerHTML = pageHTML(S.spread * 2);
    pageR.innerHTML = pageHTML(S.spread * 2 + 1);
    updateAlbum();
  }

  function renderAlbum() {
    albumHeader();
    renderSpread();
  }

  function pocketEl(i) { return binderEl.querySelector('.binder-page .pocket[data-i="' + i + '"]'); }

  function updateAlbum() {
    binderEl.querySelectorAll('.binder-page .pocket').forEach(function (p) {
      p.classList.toggle('is-selected', +p.dataset.i === S.card);
    });
    $('#albumSpread').innerHTML = _('SPREAD {n} / {total}', { n: '<b>' + (S.spread + 1) + '</b>', total: spreads() });
    updateHints();
    updateAmbient();
  }

  /* мышь / тач по кармашкам (делегирование — страницы перерисовываются) */
  binderEl.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY) || S.view !== 'album' || S.modal || S.busy || S.help) return;
    var p = e.target.closest('.binder-page .pocket');
    if (p && S.card !== +p.dataset.i) { S.card = +p.dataset.i; updateAlbum(); }
  });
  binderEl.addEventListener('click', function (e) {
    var p = e.target.closest('.binder-page .pocket');
    if (!p || S.view !== 'album' || S.modal || S.busy || S.help) return;
    S.card = +p.dataset.i;
    updateAlbum();
    openCard(S.card);
  });

  function openAlbum(spec, fromSection, focusId) {
    if (S.busy) return;
    S.busy = true;
    PL.audio.play('open');
    spec = spec || albumSpec;
    if (S.view === 'home' || S.view === 'section') albumReturn = S.view;
    withHint(loadAlbum(spec), _('Loading set…')).then(function (cards) {
      albumSpec = spec;
      if (spec.set) store.set('pl-album-set', spec);
      albumList = cards;
      S.card = 0;
      S.spread = 0;
      if (focusId) {                                   // открыть сразу на нужной карточке
        for (var fi = 0; fi < cards.length; fi++) {
          var fx = cards[fi];
          if ((typeof fx === 'number' ? D.light(fx).id : fx.id) === focusId) { S.card = fi; S.spread = Math.floor(fi / PER_SPREAD); break; }
        }
      }
      renderAlbum();
      binderEl.classList.add('album-enter');
      setTimeout(function () { binderEl.classList.remove('album-enter'); }, 1000);
      setView('album');
      updateAlbum();
      S.busy = false;
      if (!cards.length) toast(spec.fav ? _('No favorite cards yet — tap the heart on a card') : spec.mine ? _('Nothing here yet. Press Y or “Scan” to add your first card') : _('No cards'));
    }).catch(function () {
      S.busy = false;
      if (spec.set) {   // данные набора недоступны — показываем каталог по локальному индексу (он работает без интернета)
        toast(_('Couldn’t load the set (internet required). Showing the catalog of all cards'));
        return openAlbum({ search: {} });
      }
      toast(_('Couldn’t load data: internet required (jsDelivr / GitHub)'));
    });
  }

  function leaveAlbum() {
    PL.audio.play('back');
    if (albumReturn === 'section') { setView('section'); updateHints(); return; }
    S.row = 'top';
    S.top = 0;
    setView('home');
    updateHome();
  }

  /* ---------- выбор набора и поиск по всем карточкам ---------- */
  var pickerEl = $('#picker'), pickerSel = null;
  var pf = { q: '', type: null, rarity: null, sup: null };
  var RARS = [['common', _('Common')], ['uncommon', _('Uncommon')], ['rare', _('Rare')], ['ultra', _('Ultra')], ['special', _('Special')]];
  var SUPS = [['0', _('Pokémon')], ['1', _('Trainers')], ['2', _('Energy')]];

  function pickerFilter() { return { q: pf.q.trim(), type: pf.type, rarity: pf.rarity, sup: pf.sup }; }
  function pickerActive() { return !!(pf.q.trim() || pf.type != null || pf.rarity || pf.sup != null); }
  function refreshPickerGo() {
    var go = $('#pkGo');
    var n = pickerActive() ? D.search(pf.q, pickerFilter()).length : D.rowCount;
    go.innerHTML = PL.icon('album') + (pickerActive() ? _('Show cards') : _('All cards')) + '<em>' + n.toLocaleString(PL.loc) + '</em>';
    go.classList.toggle('is-zero', n === 0);
  }
  function renderPickerChips() {
    $('#pkTypes').innerHTML = D.typeIdx.map(function (t, i) {
      var ty = PL.types[t];
      return '<button class="gi pk-chip pk-t' + (pf.type === i ? ' is-on' : '') + '" data-t="' + i + '" title="' + ty.name + '" style="--o1:' + ty.c1 + ';--o2:' + ty.c2 + '">' + PL.icon(ty.icon) + '</button>';
    }).join('');
    $('#pkRar').innerHTML = RARS.map(function (r) {
      return '<button class="gi pk-chip' + (pf.rarity === r[0] ? ' is-on' : '') + '" data-r="' + r[0] + '">' + r[1] + '</button>';
    }).join('') + '<i class="pk-sep"></i>' + SUPS.map(function (r) {
      return '<button class="gi pk-chip' + (pf.sup === +r[0] ? ' is-on' : '') + '" data-sp="' + r[0] + '">' + r[1] + '</button>';
    }).join('');
  }
  function openPicker() {
    S.picker = true;
    var bySeries = [], seen = {};
    D.sets.slice().reverse().forEach(function (s) { if (!seen[s.se]) { seen[s.se] = []; bySeries.push(s.se); } seen[s.se].push(s); });
    var cur = albumSpec.set;
    pickerEl.querySelector('.picker-grid').innerHTML =
      '<button class="gi pset pset-fav" data-fav="1">' + PL.icon('heart') + '<b>' + _('Favorite cards') + '</b><span>' + PL.fav.list('cards').length + ' ' + _n(PL.fav.list('cards').length, 'card|cards') + '</span></button>' +
      '<button class="gi pset pset-mine" data-mine="1">' + PL.icon('scan') + '<b>' + _('My collection') + '</b><span>' + PL.mine.count() + ' ' + _n(PL.mine.count(), 'card|cards') + ' · ' + _('your scans') + '</span></button>' +
      bySeries.map(function (se) {
        return '<h4>' + PL.tcg.esc(se) + '</h4>' + seen[se].map(function (s) {
          var lg = PL.img.logoUrls(s.id);
          return '<button class="gi pset' + (s.id === cur ? ' is-cur' : '') + '" data-set="' + s.id + '">' +
            '<img src="' + PL.tcg.esc(lg[0]) + '" data-chain="' + PL.tcg.esc(lg.join('|')) + '" data-ci="0" alt="" loading="lazy" referrerpolicy="no-referrer">' +
            '<b>' + PL.tcg.esc(s.n) + '</b><span>' + s.d.slice(0, 4) + ' · ' + s.c + ' ' + _n(s.c, 'card|cards') + '</span></button>';
        }).join('');
      }).join('');
    renderPickerChips();
    refreshPickerGo();
    pickerEl.classList.add('is-open');
    selectPicker(pickerEl.querySelector('.pset.is-cur') || $('#pkGo'));
    pickerEl.querySelector('.picker-grid').scrollTop = 0;
    PL.audio.play('select');
    updateHints();
  }
  function selectPicker(el) {
    if (pickerSel) pickerSel.classList.remove('is-sel');
    pickerSel = el;
    if (el) {
      el.classList.add('is-sel');
      var grid = pickerEl.querySelector('.picker-grid');
      if (grid.contains(el)) PL.sections.ensureVisible(grid, el);
    }
  }
  function closePicker(silent) {
    if (!S.picker) return;
    S.picker = false;
    pickerEl.classList.remove('is-open');
    $('#pkQ').blur();
    if (!silent) PL.audio.play('back');
    updateHints();
  }
  function choosePicker(el) {
    if (!el) return;
    if (el.dataset.focus) { $('#pkQ').focus(); return; }
    if (el.dataset.t != null || el.dataset.r || el.dataset.sp != null) {
      if (el.dataset.t != null) pf.type = pf.type === +el.dataset.t ? null : +el.dataset.t;
      else if (el.dataset.r) pf.rarity = pf.rarity === el.dataset.r ? null : el.dataset.r;
      else pf.sup = pf.sup === +el.dataset.sp ? null : +el.dataset.sp;
      PL.audio.play('select');
      renderPickerChips();
      refreshPickerGo();
      var again = el.dataset.t != null ? pickerEl.querySelector('[data-t="' + el.dataset.t + '"]') : el.dataset.r ? pickerEl.querySelector('[data-r="' + el.dataset.r + '"]') : pickerEl.querySelector('[data-sp="' + el.dataset.sp + '"]');
      selectPicker(again);
      return;
    }
    closePicker(true);
    S.busy = false;
    if (el.id === 'pkGo') return openAlbum({ search: pickerFilter() });
    openAlbum(el.dataset.fav ? { fav: 1 } : el.dataset.mine ? { mine: 1 } : { set: el.dataset.set });
  }
  pickerEl.addEventListener('click', function (e) {
    if (e.target === pickerEl || e.target.closest('.picker-x')) return closePicker();
    var el = e.target.closest('.gi');
    if (el && pickerEl.contains(el)) { selectPicker(el); choosePicker(el); }
  });
  $('#pkQ').addEventListener('input', function (e) { pf.q = e.target.value; refreshPickerGo(); });
  $('#pkQ').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); closePicker(true); S.busy = false; openAlbum({ search: pickerFilter() }); }
  });
  pickerEl.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY)) return;
    var el = e.target.closest('.gi');
    if (el && el !== pickerSel && pickerEl.contains(el)) selectPicker(el);
  });

  /* перелистывание: правая страница поворачивается вокруг корешка */
  function flip(d, after) {
    var ns = S.spread + d;
    if (ns < 0 || ns >= spreads()) { PL.audio.play('error'); return false; }
    var oldL = pageHTML(S.spread * 2), oldR = pageHTML(S.spread * 2 + 1);
    var newL = pageHTML(ns * 2), newR = pageHTML(ns * 2 + 1);
    S.spread = ns;
    if (after) after();
    PL.audio.play('card');

    if (reduceMotion) { renderSpread(); return true; }
    S.busy = true;
    var fl = document.createElement('div');
    fl.className = 'flipper ' + (d > 0 ? 'to-next' : 'to-prev');
    if (d > 0) {
      pageR.innerHTML = newR;
      fl.innerHTML = '<div class="flip-face front is-right">' + oldR + '</div><div class="flip-face back is-left">' + newL + '</div>';
    } else {
      pageL.innerHTML = newL;
      fl.innerHTML = '<div class="flip-face front is-left">' + oldL + '</div><div class="flip-face back is-right">' + newR + '</div>';
    }
    binderEl.appendChild(fl);
    updateAlbum();
    var anim = fl.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(' + (d > 0 ? -180 : 180) + 'deg)' }],
      { duration: 620, easing: 'cubic-bezier(.5, .05, .3, 1)' }
    );
    anim.onfinish = function () {
      if (d > 0) pageL.innerHTML = newL; else pageR.innerHTML = newR;
      fl.remove();
      updateAlbum();
      S.busy = false;
    };
    return true;
  }

  function slotPos(i) {
    var rem = i % PER_SPREAD, page = Math.floor(rem / PER_PAGE);
    var r = Math.floor((rem % PER_PAGE) / 3), cp = rem % 3;
    return { c: page * 3 + cp, r: r };
  }
  function slotAt(spread, c, r) { return spread * PER_SPREAD + (c >= 3 ? PER_PAGE : 0) + r * 3 + (c % 3); }

  function moveAlbum(dir) {
    var pos = slotPos(S.card), c = pos.c, r = pos.r;
    if (dir === 'up' || dir === 'down') {
      r += dir === 'down' ? 1 : -1;
      if (r < 0 || r > 1) return PL.audio.play('error');
      S.card = slotAt(S.spread, c, r);
      PL.audio.play('tick');
      return updateAlbum();
    }
    c += dir === 'right' ? 1 : -1;
    if (c < 0 || c > 5) {
      var d = c < 0 ? -1 : 1;
      return flip(d, function () { S.card = slotAt(S.spread, d > 0 ? 0 : 5, r); });
    }
    S.card = slotAt(S.spread, c, r);
    PL.audio.play('tick');
    updateAlbum();
  }

  function flipPage(d) {
    var pos = slotPos(S.card);
    flip(d, function () { S.card = slotAt(S.spread, pos.c, pos.r); });
  }

  /* ---------- анимация «достать карточку из кармашка» ---------- */
  function rectIn(el) {
    var r = el.getBoundingClientRect(), sr = screen.getBoundingClientRect(), k = sr.width / 768;
    return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
  }

  /* карточка летит из прямоугольника a в b с «шагом в сторону» возле a или возле b */
  function fly(card, a, b, side, dur, sideAtEnd) {
    var el = document.createElement('div');   // анимируем обёртку: внутри карточка может перерисоваться (битый скан)
    el.className = 'fly-card';
    el.innerHTML = PL.tcg.html(card);
    flyLayer.appendChild(el);
    function tf(r, rot, k) {
      return 'translate(' + (r.x + r.w / 2 - 126).toFixed(1) + 'px,' + (r.y + r.h / 2 - 176).toFixed(1) + 'px) rotate(' + rot + 'deg) scale(' + (r.w / 252 * k).toFixed(4) + ')';
    }
    var base = sideAtEnd ? b : a;
    var mid = { x: base.x + side * base.w * 0.85, y: base.y - base.h * 0.1, w: base.w, h: base.h };
    var anim = el.animate([
      { transform: tf(a, 0, 1), offset: 0 },
      { transform: tf(mid, side * 9, 1.14), offset: sideAtEnd ? 0.7 : 0.3 },
      { transform: tf(b, 0, 1), offset: 1 },
    ], { duration: dur, easing: 'cubic-bezier(.45, .05, .25, 1)', fill: 'forwards' });
    return new Promise(function (res) {
      anim.onfinish = function () { el.remove(); res(); };
    });
  }

  function sideOf(i) { return slotPos(i).c < 3 ? -1 : 1; } // левая страница — влево, правая — вправо

  function markOut(i, on) {
    var p = pocketEl(i);
    if (!p) return;
    p.classList.add('no-tr');
    p.classList.toggle('is-pulling', on);
    p.classList.toggle('is-out', on);
    void p.offsetWidth;
    p.classList.remove('no-tr');
  }

  function ensureSpreadFor(i) {
    var sp = Math.floor(i / PER_SPREAD);
    if (sp !== S.spread) { S.spread = sp; renderSpread(); }
  }

  /* ---------- модальное окно карточки ---------- */
  var cmItems = [];

  var deck = [], deckFromAlbum = false;
  function dk(i) {
    var x = deck[i];
    if (typeof x === 'number') x = deck[i] = D.light(x);
    return x;
  }
  /* лёгкая карточка → полная (данные набора берутся из API) */
  function ensureFull(i) {
    var c = dk(i);
    if (!c || !c.light) return Promise.resolve(c);
    return D.fullCard(c).then(function (f) { deck[i] = f; return f; });
  }
  function loadFail() { S.busy = false; toast(_('Couldn’t load card data: internet required')); }
  function showCard(i, dir) {
    var c = dk(i);
    S.modal = { i: i, item: 0 };
    cmItems = PL.tcg.items(c);
    if (c.mine) cmItems.unshift({ id: 'mynote', label: _('Mine'), tag: _('Mine'), mine: true, title: _('My notes'), value: '', text: c.note || _('No notes yet. Tap ✎ and jot down where you got it, what condition it’s in and what makes it special.'), note: '' });
    cmStage.innerHTML = PL.tcg.html(c, { big: true });
    var card = cmStage.querySelector('.tcg');
    card.classList.add('is-live');
    if (rot.base !== ROT_REST) card.style.setProperty('--ry', rot.base + 'deg');
    if (dir) {
      card.style.setProperty('--from', (dir * 46) + 'px');
      card.style.setProperty('--fry', (-dir * 26) + 'deg');
      cmStage.classList.remove('swap'); void cmStage.offsetWidth; cmStage.classList.add('swap');
    }
    $('#cmName').textContent = c.name;
    $('#cmCount').innerHTML = '<b>' + (i + 1) + '</b> / ' + deck.length;
    $('#cmEn').textContent = (c.name === c.en ? '' : c.en + ' · ') + c.set + (c.localId ? ' · ' + c.localId + (c.total ? '/' + c.total : '') : '');
    $('#cmFav').classList.toggle('is-on', PL.fav.has('cards', c.id));
    $('#cmFav').style.display = c.mine ? 'none' : '';
    $('#cmEditBtn').hidden = !c.mine;
    $('#cmPanel').style.setProperty('--cc', PL.types[c.type].c1);
    cmChips.innerHTML = cmItems.map(function (it, k) {
      return '<button class="chip-btn" data-k="' + k + '">' + PL.tcg.esc(it.label) + '</button>';
    }).join('');
    S.card = i;
    selectItem(0, true);
    updateAlbum();
  }

  function selectItem(k, silent) {
    var n = cmItems.length;
    k = (k + n) % n;
    S.modal.item = k;
    var it = cmItems[k];
    cmChips.querySelectorAll('.chip-btn').forEach(function (b, j) { b.classList.toggle('is-on', j === k); });
    cmStage.querySelectorAll('[data-part]').forEach(function (el) { el.classList.toggle('is-on', el.dataset.part === it.id); });
    cmBox.innerHTML =
      '<div class="cm-tt"><span class="cm-tag' + (it.tag === _('Lore') ? ' lore' : '') + (it.mine ? ' mine' : '') + '">' + it.tag + '</span><b>' + PL.tcg.esc(it.title) + '</b><em>' + PL.tcg.esc(it.value) + '</em></div>' +
      '<p class="cm-text' + (it.mine ? ' is-note' : '') + '">' + PL.tcg.esc(it.text) + '</p>' +
      (it.note ? '<p class="cm-note">' + PL.tcg.esc(it.note) + '</p>' : '');
    cmBox.classList.remove('swap'); void cmBox.offsetWidth; cmBox.classList.add('swap');
    if (!silent) PL.audio.play('tick');
  }

  /* ---------- свои карточки: правка названия и описания ---------- */
  function canEdit() { return !!(S.modal && !S.busy && dk(S.modal.i) && dk(S.modal.i).mine); }
  function startEdit() {
    if (!canEdit() || S.modal.editing) return;
    var c = dk(S.modal.i);
    S.modal.editing = true;
    $('#cmPanel').classList.add('is-editing');
    cmChips.querySelectorAll('.chip-btn').forEach(function (b) { b.classList.remove('is-on'); });
    var P = PL.tcg.esc;
    cmBox.innerHTML = '<div class="cm-edit">' +
      '<label><span>' + P(_('Name')) + '</span><input id="cmEdName" type="text" maxlength="40" value="' + P(c.name) + '" placeholder="' + P(c.baseName || _('My card')) + '" autocomplete="off"></label>' +
      '<label><span>' + P(_('Description')) + '</span><textarea id="cmEdNote" maxlength="600" rows="4" placeholder="' + P(_('Where you got it, its condition, what makes it special…')) + '">' + P(c.note || '') + '</textarea></label>' +
      '<div class="cm-edit-acts"><button class="chip-btn is-on" data-ed="save">' + P(_('Save')) + '</button><button class="chip-btn" data-ed="cancel">' + P(_('Cancel')) + '</button></div></div>';
    cmBox.classList.remove('swap'); void cmBox.offsetWidth; cmBox.classList.add('swap');
    PL.audio.play('open');
    updateHints();
    var ta = $('#cmEdNote'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  function cancelEdit() {
    if (!S.modal || !S.modal.editing) return;
    S.modal.editing = false;
    $('#cmPanel').classList.remove('is-editing');
    PL.audio.play('back');
    showCard(S.modal.i, 0);
    updateHints();
  }
  function saveEdit() {
    if (!S.modal || !S.modal.editing) return;
    var c = dk(S.modal.i), title = ($('#cmEdName').value || '').trim().slice(0, 40), note = ($('#cmEdNote').value || '').trim().slice(0, 600);
    var patch = { title: title, note: note };
    if (!c.baseId) patch.name = title || c.baseName;       // не опознанная карточка: название хранится в name
    PL.mine.update(c.mine, patch).then(function () {
      c.name = title || c.baseName || c.name; c.note = note;
      if (!c.baseId) c.en = c.name;
      S.modal.editing = false;
      $('#cmPanel').classList.remove('is-editing');
      PL.audio.play('select');
      toast(_('Saved'));
      showCard(S.modal.i, 0);
      updateHints();
    }, function () { toast(_('Couldn’t save')); PL.audio.play('error'); });
  }
  $('#cmEditBtn').addEventListener('click', function () { startEdit(); });
  cmBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ed]');
    if (!b) return;
    if (b.dataset.ed === 'save') saveEdit(); else cancelEdit();
  });

  function openModalShell(i) {
    showCard(i, 0);
    cmEl.classList.add('is-open', 'no-pop');
    cmEl.setAttribute('aria-hidden', 'false');
    updateHints();
  }

  function openCardDeck(cards, i) {
    if (!cards[i] || S.busy) return;
    deck = cards;
    deckFromAlbum = false;
    S.busy = true;
    withHint(ensureFull(i), _('Loading card…')).then(function () {
      S.busy = false;
      PL.audio.play('open');
      openModalShell(i);
    }, loadFail);
  }

  function toggleFavCard() {
    var c = dk(S.modal.i);
    var on = PL.fav.toggle('cards', c.id);
    $('#cmFav').classList.toggle('is-on', on);
    PL.audio.play(on ? 'select' : 'back');
    toast(on ? _('Card added to favorites') : _('Removed from favorites'));
    updateFavCount();
    favDirty = true;
  }
  var favDirty = false;
  $('#cmFav').addEventListener('click', function () { if (S.modal && !S.busy) toggleFavCard(); });

  function openCard(i) {
    if (!albumGet(i)) { PL.audio.play('error'); return toast(_('This pocket is empty')); }
    deck = albumList;
    deckFromAlbum = true;
    if (dk(i).light) {
      S.busy = true;
      return withHint(ensureFull(i), _('Loading card…')).then(function () { S.busy = false; openCard(i); }, loadFail);
    }
    var p = pocketEl(i);
    if (reduceMotion || !p) { PL.audio.play('open'); openModalShell(i); markOut(i, true); return; }

    S.busy = true;
    PL.audio.play('card');
    p.classList.add('is-pulling');               // 1. карточка выезжает вверх из топлоадера
    setTimeout(function () {
      var from = rectIn(p.querySelector('.tcg'));
      openModalShell(i);
      cmStage.classList.add('is-hidden');
      var sc = stageCard();
      sc.classList.add('flat');
      var to = rectIn(sc);
      p.classList.add('is-out');                 // 2. в кармашке остаётся пустой пластик
      PL.audio.play('open');
      fly(dk(i), from, to, sideOf(i), 640, false).then(function () {   // 3. уходит в сторону и летит в окно
        cmStage.classList.remove('is-hidden');
        void sc.offsetWidth;
        sc.classList.remove('flat');                 // 4. и разворачивается углом
        PL.audio.play('select');
        S.busy = false;
      });
    }, 360);
  }

  function closeCard(silent) {
    if (!S.modal) return;
    var i = S.modal.i;
    S.modal = null;
    $('#cmPanel').classList.remove('is-editing');
    cmEl.setAttribute('aria-hidden', 'true');
    updateHints();
    updateAmbient();

    if (favDirty && S.view === 'section' && TABS[S.section].id === 'favorites') { favDirty = false; setTimeout(function () { renderSection(false); }, 260); }
    if (silent || reduceMotion || S.view !== 'album' || !deckFromAlbum) {
      cmEl.classList.remove('is-open');
      if (deckFromAlbum) { ensureSpreadFor(i); markOut(i, false); }
      if (!silent) PL.audio.play('back');
      return;
    }

    S.busy = true;
    ensureSpreadFor(i);
    var p = pocketEl(i);
    p.classList.add('no-tr', 'is-pulling', 'is-out');
    void p.offsetWidth;
    var sc = stageCard();
    sc.classList.add('flat');
    var from = rectIn(sc);
    var to = rectIn(p.querySelector('.tcg'));
    cmStage.classList.add('is-hidden');
    cmEl.classList.remove('is-open');
    PL.audio.play('back');
    fly(dk(i), from, to, sideOf(i), 540, true).then(function () {   // летит обратно к кармашку
      p.classList.remove('is-out');
      void p.offsetWidth;
      p.classList.remove('no-tr');
      requestAnimationFrame(function () {
        p.classList.remove('is-pulling');        // и задвигается в топлоадер
        PL.audio.play('card');
      });
      cmStage.classList.remove('is-hidden');
      setTimeout(function () { S.busy = false; }, 360);
    });
  }

  function stepCard(d) {
    if (S.busy) return;
    var n = deck.length;
    var i = S.modal.i + d;
    if (i < 0 || i >= n) return PL.audio.play('error');
    var from = S.modal.i;
    S.busy = true;
    withHint(ensureFull(i), _('Loading card…')).then(function () {
      S.busy = false;
      if (!S.modal) return;
      if (deckFromAlbum) {
        markOut(from, false);
        ensureSpreadFor(i);
        markOut(i, true);
      }
      PL.audio.play('card');
      showCard(i, d);
    }, loadFail);
  }

  $('#cmClose').addEventListener('click', function () { closeCard(); });
  $('#cmPrev').addEventListener('click', function () { if (S.modal) stepCard(-1); });
  $('#cmNext').addEventListener('click', function () { if (S.modal) stepCard(1); });
  cmEl.addEventListener('click', function (e) { if (e.target === cmEl) closeCard(); });
  cmChips.addEventListener('click', function (e) {
    var b = e.target.closest('.chip-btn');
    if (b && S.modal) selectItem(+b.dataset.k);
  });
  cmStage.addEventListener('click', function (e) {
    var part = e.target.closest('[data-part]');
    if (!part || !S.modal) return;
    for (var k = 0; k < cmItems.length; k++) {
      if (cmItems[k].id === part.dataset.part) { PL.audio.play('select'); return selectItem(k, true); }
    }
  });

  /* ---------- поворот карточки: стоит углом, её можно вертеть ---------- */
  var ROT_REST = -20, ROT_MIN = -42, ROT_MAX = 42;
  var rot = { base: ROT_REST, down: null, dragged: false };

  function stageCard() { return cmStage.querySelector('.tcg'); }
  function clampRot(v) { return Math.max(ROT_MIN, Math.min(ROT_MAX, v)); }

  function applyRot(hx, hy) {
    var card = stageCard();
    if (!card) return;
    card.style.setProperty('--ry', (rot.base + (hx || 0) * 10).toFixed(2) + 'deg');
    card.style.setProperty('--rx', (5 - (hy || 0) * 10).toFixed(2) + 'deg');
  }
  function setShine(x, y) {
    var card = stageCard();
    if (!card) return;
    if (x == null) { ['--mx', '--my', '--hx', '--hy'].forEach(function (v) { card.style.removeProperty(v); }); return; }
    card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    card.style.setProperty('--hx', (x * 100).toFixed(1) + '%');
    card.style.setProperty('--hy', (y * 100).toFixed(1) + '%');
  }

  cmStage.addEventListener('pointerdown', function (e) {
    if (!S.modal || S.busy) return;
    rot.down = { x: e.clientX, base: rot.base };
    rot.dragged = false;
  });
  cmStage.addEventListener('pointermove', function (e) {
    var card = stageCard();
    if (!card || !S.modal || S.busy) return;
    var r = cmStage.getBoundingClientRect();
    var x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    var y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    if (rot.down) {
      var dx = (e.clientX - rot.down.x) / (PL.scale || 1);
      if (Math.abs(dx) > 4) rot.dragged = true;
      if (rot.dragged) {
        rot.base = clampRot(rot.down.base + dx * 0.35);
        card.classList.add('is-dragging');
        applyRot(0, 0);
        setShine(x, y);
        return;
      }
    }
    if (e.pointerType === 'mouse') {
      card.classList.add('is-tilting');
      applyRot(x - 0.5, y - 0.5);
      setShine(x, y);
    }
  });
  function endRot() {
    var card = stageCard();
    rot.down = null;
    if (!card) return;
    card.classList.remove('is-dragging', 'is-tilting');
    applyRot(0, 0);
    setShine(null);
  }
  document.addEventListener('pointerup', function () { if (rot.down) endRot(); });
  cmStage.addEventListener('pointerleave', function () { if (!rot.down) endRot(); });
  cmStage.addEventListener('pointercancel', endRot);
  /* после перетаскивания не считать отпускание кликом по части карточки */
  cmStage.addEventListener('click', function (e) {
    if (rot.dragged) { e.stopImmediatePropagation(); rot.dragged = false; }
  }, true);

  /* ---------- справка ---------- */
  var HELP = [
    [['✚', 'LS'], _('Navigate'), '← ↑ → ↓'],
    [['A'], _('Select / open'), 'Enter'],
    [['B'], _('Back'), 'Esc'],
    [['L', 'R'], _('Previous / next section'), 'Q / E'],
    [['RS'], _('Scroll · rotate card'), _('wheel')],
    [['X'], _('Search'), 'X'],
    [['Y'], _('Retro filter'), 'Y'],
    [['+'], _('This help'), '+'],
    [['−'], _('Sound on / off'), 'M'],
    [['⌂'], _('Main menu'), 'H'],
    [['◉'], _('Screenshot (saved to Favorites)'), 'C'],
    [['⏻'], _('Power (top)'), 'P'],
    [['−', '+'], _('Volume (top)'), '[ ]'],
    [['🎮'], _('Gamepad'), 'USB / BT'],
  ];
  $('#helpGrid').innerHTML = HELP.map(function (r) {
    return '<div class="help-row"><span class="hb">' +
      r[0].map(function (b) { return '<b class="badge">' + b + '</b>'; }).join('') +
      '</span><span>' + r[1] + '</span><span class="hk">' + r[2] + '</span></div>';
  }).join('');

  function openHelp() {
    S.help = true;
    helpEl.classList.add('is-open');
    helpEl.setAttribute('aria-hidden', 'false');
    PL.audio.play('select');
    updateHints();
  }
  function closeHelp(silent) {
    if (!S.help) return;
    S.help = false;
    helpEl.classList.remove('is-open');
    helpEl.setAttribute('aria-hidden', 'true');
    if (!silent) PL.audio.play('back');
    updateHints();
  }
  helpEl.addEventListener('click', function (e) { if (e.target === helpEl) closeHelp(); });

  /* ---------- системные действия ---------- */
  var volTimer = 0;
  function showVolume() {
    var v = PL.audio.getVolume();
    var muted = PL.audio.isMuted();
    $('#osdVolLabel').textContent = muted ? 'MUTE' : 'VOL';
    var bars = '';
    for (var i = 0; i < 10; i++) bars += '<i class="' + (!muted && i < v ? 'on' : '') + '"></i>';
    $('#osdVolBars').innerHTML = bars;
    var el = $('#osdVol');
    el.classList.add('is-show');
    clearTimeout(volTimer);
    volTimer = setTimeout(function () { el.classList.remove('is-show'); }, 1600);
  }

  function changeVolume(d) {
    PL.audio.setVolume(PL.audio.getVolume() + d);
    PL.audio.play('vol');
    showVolume();
    renderDock();
  }

  function toggleSound() {
    var muted = PL.audio.toggleMute();
    if (!muted) PL.audio.play('select');
    toast(muted ? _('Sound off') : _('Sound on'));
    showVolume();
    renderDock();
  }

  function toggleRetro() {
    var off = body.classList.toggle('retro-off');
    store.set('pl-retro', !off);
    PL.audio.play('select');
    toast(off ? _('Retro filter off') : _('Retro filter on'));
    renderDock();
  }

  /* подпись снимка: что сейчас на экране */
  function captureMeta() {
    var t = _('Main menu'), sub = '';
    if (S.view === 'static') t = _('PLAY screen');
    else if (S.view === 'quiz') { var q = PL.quiz.status(); t = _('Quiz “{t}”', { t: q.title }); sub = q.line; }
    else if (S.view === 'catch') { var cq = PL.catcher.status(); t = cq.title; sub = cq.line; }
    else if (S.view === 'scan') { var sq = PL.scan.status(); t = sq.title; sub = sq.line; }
    else if (S.view === 'album') t = _('Card album');
    else if (S.view === 'section') {
      t = TABS[S.section].title;
      var nm = sectionView.querySelector('.sheet.is-open .ds-name b');
      if (nm) sub = nm.textContent;
    }
    return { title: t, sub: sub, color: getComputedStyle(root).getPropertyValue('--ambient').trim() || '#19e3ff' };
  }
  var shooting = false;
  function capture() {
    if (shooting) return;
    shooting = true;
    S.captures++;
    var meta = captureMeta();
    meta.onBuilt = function () { flash(); PL.audio.play('shutter'); };      // вспышка уже после того, как экран «сфотографирован»
    PL.shot.take(meta).then(function (rec) {
      shooting = false;
      toast(rec.fallback ? _('Screenshot saved (simplified)') : _('Screenshot saved to Favorites'));
      updateFavCount();
    }, function () { shooting = false; toast(_('Couldn’t save the screenshot')); });
  }

  function searchToast() {
    PL.audio.play('select');
    toast(_('Search is coming with more content'));
  }

  /* ---------- главный обработчик кнопок ---------- */
  PL.bus.on('press', function (e) {
    var name = e.name;

    if (name === 'power') { if (S.power) { if (!S.busy && !launching) powerOff(); } else wake(); return; }
    if (!S.power) { if (name === 'home' || name === 'a') wake(); return; }
    if (name === 'volup' || name === 'voldown') return changeVolume(name === 'volup' ? 1 : -1);
    if (name === 'minus') return toggleSound();
    if (name === 'capture') return capture();
    if (S.busy) return;

    if (S.help) {
      if (name === 'b' || name === 'plus' || name === 'a') closeHelp();
      return;
    }
    if (name === 'plus') return openHelp();
    if (name === 'y' && !S.modal && S.view !== 'section' && S.view !== 'album' && S.view !== 'scan') return toggleRetro();

    if (S.modal) {
      if (S.modal.editing) { if (name === 'b' || name === 'home') cancelEdit(); else if (name === 'a') saveEdit(); return; }
      switch (name) {
        case 'up': return selectItem(S.modal.item - 1);
        case 'down': case 'a': return selectItem(S.modal.item + 1);
        case 'left': case 'l': return stepCard(-1);
        case 'right': case 'r': return stepCard(1);
        case 'b': case 'home': return closeCard();
        case 'y': return dk(S.modal.i).mine ? startEdit() : toggleFavCard();
        default: return PL.audio.play('click');
      }
    }

    if (S.picker) {
      switch (name) {
        case 'up': case 'down': case 'left': case 'right': {
          var nx = PL.sections.navMove(pickerEl, pickerSel, name);
          if (nx) { selectPicker(nx); PL.audio.play('tick'); } else PL.audio.play('error');
          return;
        }
        case 'a': return choosePicker(pickerSel);
        case 'b': case 'x': case 'home': return closePicker();
        default: return PL.audio.play('click');
      }
    }

    if (S.view === 'quiz') {
      PL.quiz.press(name);
      return;
    }

    if (S.view === 'catch') {
      PL.catcher.press(name);
      return;
    }

    if (S.view === 'scan') {
      PL.scan.press(name);
      return;
    }

    if (S.view === 'album') {
      switch (name) {
        case 'up': case 'down': case 'left': case 'right': return moveAlbum(name);
        case 'l': return flipPage(-1);
        case 'r': return flipPage(1);
        case 'a': return openCard(S.card);
        case 'b': case 'home': return leaveAlbum();
        case 'x': return openPicker();
        case 'y': return openScan();
        default: return PL.audio.play('click');
      }
    }

    if (S.view === 'static') {
      if (name === 'a' || name === 'home') {
        playBtn.classList.add('is-pressed');
        setTimeout(function () { playBtn.classList.remove('is-pressed'); }, 120);
        startPlay();
      } else if (e.src !== 'stick') PL.audio.play('click');
      return;
    }

    if (S.view === 'home') {
      switch (name) {
        case 'up': case 'down': case 'left': case 'right': return moveHome(name);
        case 'l': case 'r': S.row = 'tiles'; return moveHome(name === 'l' ? 'left' : 'right');
        case 'a': return S.row === 'tiles' ? openTile(S.tile) : S.row === 'top' ? (S.top === 2 ? openScan() : S.top ? openFavorites() : openAlbum()) : activateDock(S.dock);
        case 'b':
          if (S.row === 'dock' || S.row === 'top') { S.row = 'tiles'; PL.audio.play('back'); return updateHome(); }
          return PL.audio.play('click');
        case 'home': S.row = 'tiles'; S.tile = 0; PL.audio.play('tick'); return updateHome(true);
        case 'x': return searchToast();
        default: return PL.audio.play('click');
      }
    }

    if (S.view === 'section') {
      if (secCtrl && secCtrl.press(name)) return;
      switch (name) {
        case 'left': case 'l': return switchSection(-1);
        case 'right': case 'r': return switchSection(1);
        case 'b': case 'home': return backHome();
        case 'x': return searchToast();
        case 'y': return toggleRetro();
        default: return PL.audio.play('click');
      }
    }
  });

  PL.bus.on('scroll', function (d) {
    if (S.modal && !S.busy && !S.help) { rot.base = clampRot(rot.base + d.x * 2.4); applyRot(0, 0); return; }
    if (S.view === 'section' && !S.help && secCtrl) secCtrl.scrollBy(d);
  });

  PL.bus.on('unlock', function () {
    if (S.power && S.view === 'static') PL.audio.hiss(1);
  });

  PL.bus.on('gamepad', function (g) {
    toast(g.connected ? _('🎮 Gamepad connected') : _('Gamepad disconnected'));
  });

  playBtn.addEventListener('click', startPlay);

  /* ---------- альбом в верхней панели ---------- */
  var hudAlbum = $('#hudAlbum');
  [['#hudAlbum', 0], ['#hudFav', 1], ['#hudScan', 2]].forEach(function (x) {
    var el = $(x[0]);
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY) || S.view !== 'home' || S.busy || S.help) return;
      if (S.row !== 'top' || S.top !== x[1]) { S.row = 'top'; S.top = x[1]; updateHome(); }
    });
    el.addEventListener('click', function () {
      if (S.view !== 'home' || S.busy || S.help) return;
      S.row = 'top'; S.top = x[1]; updateHome();
      if (x[1] === 2) openScan(); else if (x[1]) openFavorites(); else openAlbum();
    });
  });

  /* ---------- раскраска консоли (переключатель в доке под консолью) ---------- */
  var skinsEl = $('#skins');
  function applySkin(id, announce) {
    var sk = C.skins.filter(function (x) { return x.id === id; })[0] || C.skins[0];
    currentSkin = sk.id;
    if (sk.id === 'neon') delete root.dataset.skin; else root.dataset.skin = sk.id;
    store.set('pl-skin', sk.id);
    skinsEl.querySelectorAll('.skin').forEach(function (b) { b.classList.toggle('is-on', b.dataset.id === sk.id); });
    $('#skinName').textContent = sk.name;
    if (announce) PL.audio.play('snap');
  }
  skinsEl.innerHTML = '<div class="skins-title">' + _('Skin') + '</div><div class="skins-row">' + C.skins.map(function (sk) {
    return '<button class="skin" data-id="' + sk.id + '" style="--l:' + sk.l + ';--r:' + sk.r + ';--b:' + sk.b + '" aria-label="' + _('Skin: {name}', { name: sk.name }) + '"></button>';
  }).join('') + '</div><div class="skins-label">' + _('Shell: {name}', { name: '<b id="skinName"></b>' }) + '</div>';
  skinsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.skin');
    if (b) changeSkin(b.dataset.id);
  });
  skinsEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
  applySkin(store.get('pl-skin', 'neon'), false);

  /* ---------- старт ---------- */
  /* имя тренера: вводится на экране PLAY, показывается в шапке меню вместо «Тренер» */
  var nameIn = $('#nameIn'), userNameEl = $('#userName');
  function showName() { userNameEl.textContent = (nameIn.value || '').trim() || C.userName; }
  nameIn.value = store.get('pl-name', '');
  nameIn.addEventListener('input', function () { store.set('pl-name', nameIn.value.trim().slice(0, 14)); showName(); });
  nameIn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  showName();
  $('#hintsBrand').textContent = C.siteName;
  var logo = $('#bootLogo');
  logo.textContent = C.siteName;
  logo.dataset.text = C.siteName;
  $('#bootSub').textContent = C.tagline;

  PL.mountIcons();
  PL.static.init($('#static'));
  renderHome();
  renderSection(false);
  $('#hudAlbumCount').textContent = (D.totalCards / 1000).toFixed(1).replace('.', PL.lang === 'ru' ? ',' : '.') + 'k';
  updateFavCount();
  crt.classList.add('is-off');

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* вступление: консоль → кабель сверху подлетает и втыкается в разъём → экран включается */
  setTimeout(function () { PL.cable.dangle(); PL.carts.intro(500); }, reduce ? 50 : 450);
  setTimeout(function () { body.classList.remove('is-intro'); }, 1700);

  PL.app = { state: S, toast: toast }; // для отладки из консоли
})();
