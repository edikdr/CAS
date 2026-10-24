/* ==========================================================================
   App shell: screens, navigation, reactions to device buttons.
   Views: static (idle mist + Awaken) -> boot -> home (relic altar) -> section (a relic's screen)
   A seated relic always decides which screen is shown; ejecting it returns to the altar.
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
  var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  var views = {};
  document.querySelectorAll('.view').forEach(function (v) { views[v.dataset.view] = v; });

  var S = {
    power: false,
    view: 'static',
    help: false,
    busy: true,
    row: 'tiles',      // altar focus: 'tiles' | 'dock'
    tile: 0,
    dock: 0,
    section: 0,
  };

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  if (store.get('nd-glass', true) === false) body.classList.add('retro-off');

  function planeOf(id) { return (C.planes || {})[id] || { c1: '#7FD6DF', c2: '#2E7F95' }; }
  function sectionById(id) { for (var i = 0; i < C.sections.length; i++) if (C.sections[i].id === id) return i; return -1; }
  function cartById(id) { return C.carts.filter(function (x) { return x.id === id; })[0]; }

  /* ---------- scale the device to the window ---------- */
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var tight = vw < 760 || vh < 520;
    var s = Math.min((vw * (tight ? 0.995 : 0.975)) / 1200, (vh - (tight ? 4 : 40)) / 818);
    PL.scale = s;
    wrap.style.setProperty('--scale', s.toFixed(4));
    if (PL.cable) PL.cable.resize();
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------- small helpers ---------- */
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

  /* ---------- views ---------- */
  function setView(name) {
    Object.keys(views).forEach(function (k) { views[k].classList.toggle('is-active', k === name); });
    S.view = name;
    screen.classList.toggle('is-content', name === 'home' || name === 'section');
    updateHints();
    updateAmbient();
  }

  var sectionAmbient = null;
  function updateAmbient() {
    var c = '#000000';
    if (S.power) {
      if (S.view === 'static') c = '#7FD6DF';
      else if (S.view === 'boot') c = '#E8B93A';
      else if (S.view === 'home') c = planeOf(C.sections[S.tile].plane).c1;
      else if (S.view === 'section') c = sectionAmbient || planeOf(C.sections[S.section].plane).c1;
    }
    root.style.setProperty('--ambient', c);
  }

  /* ---------- bottom hint bar ---------- */
  var BADGE = { a: 'A', b: 'B', x: 'X', y: 'Y', l: 'L', r: 'R', plus: '+', minus: '−', up: '▲', down: '▼' };
  var secCtrl = null;
  function hint(btns, label) {
    return '<span class="hint" data-btn-proxy="' + btns[btns.length - 1] + '">' +
      btns.map(function (b) { return '<b class="badge">' + BADGE[b] + '</b>'; }).join('') +
      ' ' + label + '</span>';
  }
  function updateHints() {
    var h = [];
    if (S.help) h = [hint(['b'], _('Close'))];
    else if (S.view === 'home') h = S.row === 'tiles'
      ? [hint(['plus'], _('Help')), hint(['a'], _('Seat relic'))]
      : [hint(['b'], _('To relics')), hint(['a'], _('Select'))];
    else if (S.view === 'section') h = (secCtrl ? secCtrl.hints() : []).map(function (x) { return hint(x[0], x[1]); });
    hintsRight.innerHTML = h.join('');
  }

  /* ---------- power ---------- */
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

  /* ---------- power: cable -> screen ---------- */
  /* wake the device: plug the cable in if needed (fast), or skip the cable animation */
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
  PL.cable.on('pull', function () {          // plug pulled or clicked: unplug (the cable handles its animation)
    if (launching || PL.cable.busy()) return false;
    if (S.power && S.busy) return false;
    if (S.power) powerOff();
    PL.audio.play('unplug');
    body.classList.remove('is-plugged');
  });
  PL.cable.on('push', function () {          // click on the empty socket: plug in
    if (!PL.cable.isPlugged() && !PL.cable.busy()) PL.cable.plugIn({ fast: true });
  });
  screen.addEventListener('pointerdown', function () { if (!S.power && PL.cable.busy()) PL.cable.snap(); });

  /* small jolt of the device when something latches */
  var consoleEl = $('#console');
  function bump(dx, dy) {
    if (reduceMotion || !consoleEl.animate) return;
    dy = dy || 1.6;
    consoleEl.animate([
      { transform: 'translate(0,0)' }, { transform: 'translate(' + (dx * 0.8) + 'px,' + dy + 'px)', offset: 0.25 },
      { transform: 'translate(' + (-dx * 0.4) + 'px,' + (-dy * 0.5) + 'px)', offset: 0.55 }, { transform: 'translate(0,0)' },
    ], { duration: 280, easing: 'ease-out' });
  }

  /* ---------- Awaken: mist -> tuning -> boot -> altar (or the seated relic) ---------- */
  function runBoot(sub, then, quick) {
    S.busy = true;
    closeHelp(true);
    var k = quick ? 0.6 : 1;
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
    var ins = PL.carts.inserted();
    playBtn.classList.add('is-launching');
    PL.audio.play('select');
    if (ins) return bootCart(ins);
    runBoot(C.tagline, function () {
      S.row = 'tiles';
      setView('home');
      updateHome(true);
      S.busy = false;
    });
  }

  /* ---------- relics ---------- */
  var launching = false;

  /* A relic is seated. With power on it boots its screen; otherwise it waits for power and Awaken. */
  function bootCart(id) {
    var cd = cartById(id);
    if (!cd || launching) return;
    if (!S.power) { toast(_('Relic seated. Plug in the conduit to wake the device')); return; }
    launching = true;
    PL.carts.hold(true);
    function finish() { launching = false; PL.carts.hold(false); }
    whenReady(function () { return !S.busy; }, function () {
      if (!S.power || PL.carts.inserted() !== id) { playBtn.classList.remove('is-launching'); return finish(); }
      closeHelp(true);
      var fromAltar = S.view === 'home' || S.view === 'section';
      function open() { openSection(cd.opens, cd.tab); S.busy = false; finish(); }
      if (fromAltar) { S.busy = true; PL.audio.play('open'); setTimeout(open, 200); }
      else runBoot(_('{name} · {sub}', { name: cd.name, sub: cd.sub }), open, true);
    });
  }
  PL.carts.on('seated', function (e) { bootCart(e.id); });

  /* keyboard (Enter on the selected relic) or altar tile: insert it; 'seated' does the rest */
  function launchCart(id) { PL.carts.insert(id, { onSeat: function () { flash(); } }); }

  function ejectCart() {
    if (launching || !PL.carts.inserted()) return;
    PL.carts.eject({});
  }
  PL.carts.on('eject-start', function () {
    if (S.power && S.view === 'section') whenReady(function () { return !S.busy; }, function () { backHome(); });
  });
  PL.carts.on('play', launchCart);
  PL.carts.on('eject', ejectCart);

  /* back to the idle mist (the relic stays seated unless asked) */
  function goStatic(ejectToo) {
    S.busy = true;
    PL.audio.play('back');
    crtAnim('flip');
    if (ejectToo && PL.carts.inserted()) PL.carts.eject();
    setTimeout(function () {
      closeHelp(true);
      setView('static');
      PL.static.setMode('static');
      PL.audio.hiss(1);
    }, 240);
    setTimeout(function () { crtAnim(null); S.busy = false; }, 520);
  }

  /* ---------- altar (home) ---------- */
  function renderHome() {
    tilesEl.innerHTML = C.sections.map(function (s, i) {
      var p = planeOf(s.plane);
      return '<div class="tile" data-i="' + i + '" style="--c1:' + p.c1 + ';--c2:' + p.c2 + ';--i:' + i + '">' +
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
    tilesEl.querySelectorAll('.tile').forEach(function (t, i) { t.classList.toggle('is-selected', S.row === 'tiles' && i === S.tile); });
    dockEl.querySelectorAll('.dock-btn').forEach(function (b, i) { b.classList.toggle('is-selected', S.row === 'dock' && i === S.dock); });
    var s = C.sections[S.tile];
    titleEl.querySelector('b').textContent = s.title;
    titleEl.querySelector('span').textContent = s.subtitle;
    if (swapTitle) { titleEl.classList.remove('swap'); void titleEl.offsetWidth; titleEl.classList.add('swap'); }
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

  /* an altar tile seats the matching relic (the relic decides the screen) */
  function openTile(i) {
    var s = C.sections[i];
    var cd = C.carts.filter(function (x) { return x.opens === s.id; })[0];
    tilesEl.children[i].classList.add('is-opening');
    setTimeout(function () { tilesEl.children[i].classList.remove('is-opening'); }, 300);
    if (cd && PL.carts.inserted() !== cd.id) return launchCart(cd.id);
    openSection(s.id);
  }

  function activateDock(i) {
    switch (C.dock[i].id) {
      case 'controls': openHelp(); break;
      case 'retro': toggleRetro(); break;
      case 'sound': toggleSound(); break;
      case 'exit': goStatic(false); break;
    }
  }

  /* ---------- relic screen (content: js/sections.js) ---------- */
  function openSection(id, tab) {
    var i = sectionById(id);
    if (i < 0) return;
    S.section = i;
    S.tile = i;
    renderSection(false, tab);
    setView('section');
    scrollEl.scrollTop = 0;
  }

  function renderSection(animate, tab) {
    var s = C.sections[S.section], p = planeOf(s.plane);
    sectionView.style.setProperty('--sc', p.c1);
    sectionView.style.setProperty('--sc2', p.c2);
    tabList.innerHTML = C.sections.map(function (x, i) {
      return '<span class="tab' + (i === S.section ? ' is-active' : '') + '" data-i="' + i + '">' + x.title + '</span>';
    }).join('');
    tabList.querySelectorAll('.tab').forEach(function (tabEl) {
      tabEl.addEventListener('click', function () {
        var i = +tabEl.dataset.i;
        if (i !== S.section && !S.busy) switchTo(i);
      });
    });
    scrollEl.className = 'section-scroll sec-host';
    sectionAmbient = null;
    secCtrl = PL.sections.mount(s.id, scrollEl, { tab: tab });
    if (animate) { scrollEl.classList.remove('swap'); void scrollEl.offsetWidth; scrollEl.classList.add('swap'); }
    updateAmbient();
    updateHints();
  }

  /* L / R or a tab: seat the neighbouring relic (the screen follows the relic) */
  function switchTo(i) {
    var s = C.sections[i];
    var cd = C.carts.filter(function (x) { return x.opens === s.id; })[0];
    PL.audio.play('tick');
    if (cd && !PL.carts.isBusy()) return launchCart(cd.id);
    S.section = i;
    renderSection(true);
  }
  function switchSection(delta) {
    var n = C.sections.length;
    switchTo((S.section + delta + n) % n);
  }

  function backHome() {
    S.tile = S.section;
    S.row = 'tiles';
    if (secCtrl && secCtrl.destroy) secCtrl.destroy();
    secCtrl = null;
    PL.audio.play('back');
    setView('home');
    updateHome(true);
  }

  PL.sections.setContext({
    audio: function (n) { PL.audio.play(n); },
    toast: function (m) { toast(m); },
    ambient: function (c) { sectionAmbient = c; updateAmbient(); },
    hints: function () { updateHints(); },
    eject: function () { ejectCart(); },
    swap: function (id) { launchCart(id); },
  });

  /* ---------- help ---------- */
  var HELP = [
    [['▲▼◀▶'], _('Navigate'), '← ↑ → ↓'],
    [['A'], _('Select / open'), 'Enter'],
    [['B'], _('Back / eject relic'), 'Esc'],
    [['L', 'R'], _('Neighbouring relic'), 'Q / E'],
    [['1-4'], _('Pick a relic in the rack'), '1 2 3 4'],
    [['Y'], _('Glass effect'), 'Y'],
    [['+'], _('This help'), '+'],
    [['−'], _('Sound on / off'), 'M'],
    [['⌂'], _('Relic altar'), 'H'],
    [['◉'], _('Save a photo of the screen'), 'C'],
    [['⏻'], _('Power'), 'P'],
    [['−', '+'], _('Volume'), '[ ]'],
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

  /* ---------- system actions ---------- */
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
    store.set('nd-glass', !off);
    PL.audio.play('select');
    toast(off ? _('Glass effect off') : _('Glass effect on'));
    renderDock();
  }

  /* photo caption: what is on screen */
  function captureMeta() {
    var t = _('Relic altar'), sub = '';
    if (S.view === 'static') t = 'Nori-Dex';
    else if (S.view === 'section') t = C.sections[S.section].title;
    return { title: t, sub: sub, color: getComputedStyle(root).getPropertyValue('--ambient').trim() || '#7FD6DF' };
  }
  var shooting = false;
  function capture() {
    if (shooting) return;
    shooting = true;
    var meta = captureMeta();
    meta.onBuilt = function () { flash(); PL.audio.play('shutter'); };      // flash only after the screen has been copied
    PL.shot.take(meta).then(function (rec) {
      shooting = false;
      toast(rec.fallback ? _('Photo saved (simplified)') : _('Photo saved'));
    }, function () { shooting = false; toast(_('The photo could not be saved')); });
  }

  /* ---------- main button handler ---------- */
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

    if (S.view === 'static') {
      if (name === 'a' || name === 'home') {
        playBtn.classList.add('is-pressed');
        setTimeout(function () { playBtn.classList.remove('is-pressed'); }, 120);
        startPlay();
      } else if (name === 'y') toggleRetro();
      else if (e.src !== 'stick') PL.audio.play('click');
      return;
    }

    if (S.view === 'home') {
      switch (name) {
        case 'up': case 'down': case 'left': case 'right': return moveHome(name);
        case 'l': case 'r': S.row = 'tiles'; return moveHome(name === 'l' ? 'left' : 'right');
        case 'a': return S.row === 'tiles' ? openTile(S.tile) : activateDock(S.dock);
        case 'b':
          if (S.row === 'dock') { S.row = 'tiles'; PL.audio.play('back'); return updateHome(); }
          return PL.audio.play('click');
        case 'home': S.row = 'tiles'; S.tile = 0; PL.audio.play('tick'); return updateHome(true);
        case 'y': return toggleRetro();
        default: return PL.audio.play('click');
      }
    }

    if (S.view === 'section') {
      if (secCtrl && secCtrl.press(name)) return;
      switch (name) {
        case 'left': case 'l': return switchSection(-1);
        case 'right': case 'r': return switchSection(1);
        case 'b': return PL.carts.inserted() ? ejectCart() : backHome();
        case 'home': return backHome();
        case 'y': return toggleRetro();
        default: return PL.audio.play('click');
      }
    }
  });

  PL.bus.on('scroll', function (d) {
    if (S.view === 'section' && !S.help && secCtrl) secCtrl.scrollBy(d);
  });

  PL.bus.on('unlock', function () {
    if (S.power && S.view === 'static') PL.audio.hiss(1);
  });

  PL.bus.on('gamepad', function (g) {
    toast(g.connected ? _('Gamepad connected') : _('Gamepad disconnected'));
  });

  playBtn.addEventListener('click', startPlay);

  /* ---------- start ---------- */
  $('#hintsBrand').textContent = C.siteName;
  var logo = $('#bootLogo');
  logo.textContent = C.siteName;
  logo.dataset.text = C.siteName;
  $('#bootSub').textContent = C.tagline;
  body.classList.remove('jc-off');

  PL.mountIcons();
  PL.static.init($('#static'));
  renderHome();
  crt.classList.add('is-off');

  /* intro: device -> the cable drops in from the top -> relics rise out of the rack */
  setTimeout(function () { PL.cable.dangle(); PL.carts.intro(500); }, reduceMotion ? 50 : 450);
  setTimeout(function () { body.classList.remove('is-intro'); }, 1700);

  PL.app = { state: S, toast: toast };   // for debugging from the console
})();
