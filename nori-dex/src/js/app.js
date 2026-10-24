/* ==========================================================================
   App shell: screens, navigation, reactions to device buttons.
   Views: static (idle mist + Awaken) -> boot (dawn) -> home (relic altar) -> section (a relic's screen)
   The seated relic decides the screen: seating one attunes the device and opens its screen,
   drawing it out returns to the altar. The altar also carries the campaign (countdown,
   Kickstarter, Steam, Discord).
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
  var hintsRight = $('#hintsRight');
  var helpEl = $('#help');
  var toastEl = $('#toast');
  var playBtn = $('#playBtn');
  var attuneEl = $('#attune');
  var homeView = $('.view-home');
  var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var sky = PL.sky || {};

  var views = {};
  document.querySelectorAll('.view').forEach(function (v) { views[v.dataset.view] = v; });

  var S = {
    power: false,
    awake: false,      // Awaken (boot) has run since power on
    view: 'static',
    help: false,
    busy: true,
    row: 'tiles',      // altar focus: 'tiles' | 'links' | 'dock'
    tile: 0,
    link: 0,
    dock: 0,
    relic: null,       // id of the relic whose screen is shown
    stack: [],         // screens opened on top of the relic's screen (e.g. the Spirit Quiz)
  };

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  if (store.get('nd-glass', true) === false) body.classList.add('retro-off');

  function cartById(id) { return C.carts.filter(function (x) { return x.id === id; })[0]; }
  function cartIndex(id) { for (var i = 0; i < C.carts.length; i++) if (C.carts[i].id === id) return i; return -1; }
  function sectionTitle(id) { var s = C.sections.filter(function (x) { return x.id === id; })[0]; return s ? s.title : id; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- layout and scale ---------- */
  var layout = null;
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var next = vw / vh < 0.82 ? 'tall' : 'wide';
    if (next !== layout) {
      layout = next;
      root.dataset.layout = layout;
      PL.device.build(layout);
    }
    var s;
    if (layout === 'tall') {
      s = Math.min(vw / 400, vh / 920);
      PL.rackScale = 0.6;
    } else {
      var tight = vw < 760 || vh < 520;
      s = Math.min((vw * (tight ? 0.995 : 0.975)) / 1200, (vh - (tight ? 4 : 20)) / 848);
      PL.rackScale = 1;
    }
    PL.scale = s;
    wrap.style.setProperty('--scale', s.toFixed(4));
    wrap.style.setProperty('--rack-k', PL.rackScale);
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
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-show'); }, 2200);
  }
  function flash() { var f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  function crtAnim(name) {
    crt.classList.remove('power-on', 'power-off', 'tune', 'flip');
    void crt.offsetWidth;
    if (name) crt.classList.add(name);
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function tickClock() {
    var d = new Date(), t = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    $('#clock').textContent = t;
    $('#osdClock').textContent = t;
  }
  tickClock();
  setInterval(tickClock, 15000);
  function whenReady(cond, cb) { (function w() { if (cond()) cb(); else setTimeout(w, 60); })(); }

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
    var c = '#000000', cd = S.relic && cartById(S.relic);
    if (S.power) {
      if (S.view === 'static') c = '#7FD6DF';
      else if (S.view === 'boot') c = '#E8B93A';
      else if (S.view === 'home') c = (C.carts[S.tile] || {}).crystal || '#7FD6DF';
      else if (S.view === 'section') c = sectionAmbient || (cd && cd.crystal) || '#7FD6DF';
    }
    root.style.setProperty('--ambient', c);
  }

  /* relic status on the idle screen */
  function updateOsd() {
    var ins = PL.carts.inserted(), cd = ins && cartById(ins);
    $('#osdRelic').innerHTML = cd ? esc(cd.title) : '<span class="blink">NO RELIC</span>';
  }

  /* ---------- bottom hint bar ---------- */
  var BADGE = { a: '◆', b: '◆', y: '◐', l: '‹', r: '›', plus: '?', minus: '♪', up: '▲', down: '▼', home: '⌂' };
  var secCtrl = null;
  function hint(btns, label) {
    return '<span class="hint" data-btn-proxy="' + btns[btns.length - 1] + '">' +
      btns.map(function (b) { return '<b class="badge' + (b === 'a' ? ' badge--a' : b === 'b' ? ' badge--b' : '') + '">' + BADGE[b] + '</b>'; }).join('') +
      ' ' + label + '</span>';
  }
  function updateHints() {
    var h = [];
    if (S.help) h = [hint(['b'], _('Close'))];
    else if (S.view === 'home') {
      if (S.row === 'tiles') h = [hint(['plus'], _('Help')), hint(['a'], _('Seat relic'))];
      else if (S.row === 'links') h = [hint(['up'], _('Relics')), hint(['a'], _('Open link'))];
      else h = [hint(['up'], _('Back')), hint(['a'], _('Select'))];
    } else if (S.view === 'section') h = (secCtrl ? secCtrl.hints() : []).map(function (x) { return hint(x[0], x[1]); });
    hintsRight.innerHTML = h.join('');
  }

  /* ---------- power ---------- */
  function powerOn() {
    S.busy = true;
    S.power = true;
    S.awake = false;
    body.classList.add('is-on');
    crt.classList.remove('is-off');
    setView('static');
    updateOsd();
    PL.static.setMode('static');
    crtAnim('power-on');
    PL.audio.play('on');
    PL.audio.hum(true);
    setTimeout(function () { crtAnim(null); S.busy = false; }, 700);
  }

  function powerOff() {
    S.busy = true;
    closeHelp(true);
    PL.audio.play('off');
    PL.audio.hum(false);
    crtAnim('power-off');
    toastEl.classList.remove('is-show');
    setTimeout(function () {
      S.power = false;
      S.awake = false;
      body.classList.remove('is-on');
      crtAnim(null);
      crt.classList.add('is-off');
      PL.static.setMode('off');
      unmountScreen();
      setView('static');
      S.busy = false;
    }, 560);
  }

  /* wake the device: plug the conduit in if needed (fast), or skip its animation */
  function wake() {
    if (S.power) return;
    if (PL.cable.isPlugged()) { if (!S.busy) powerOn(); return; }
    if (PL.cable.busy()) { PL.cable.snap(); return; }
    PL.cable.plugIn({ fast: true });
  }

  PL.cable.on('contact', function () {
    body.classList.add('is-plugged');
    var sp = $('#portSpark');
    if (sp) { sp.classList.remove('go'); void sp.offsetWidth; sp.classList.add('go'); }
    PL.audio.play('plug');
    bump(0, 1.2);
    if (!S.power) setTimeout(powerOn, reduceMotion ? 0 : 420);    // the mana pulse reaches the socket first
  });
  PL.cable.on('pull', function () {          // plug pulled or clicked: unplug (the conduit handles its animation)
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

  var consoleEl = $('#console');
  function bump(dx, dy) {
    if (reduceMotion || !consoleEl.animate) return;
    dy = dy || 1.6;
    consoleEl.animate([
      { transform: 'translate(0,0)' }, { transform: 'translate(' + (dx * 0.8) + 'px,' + dy + 'px)', offset: 0.25 },
      { transform: 'translate(' + (-dx * 0.4) + 'px,' + (-dy * 0.5) + 'px)', offset: 0.55 }, { transform: 'translate(0,0)' },
    ], { duration: 280, easing: 'ease-out' });
  }

  /* ---------- Awaken: mist -> tuning -> dawn boot with the logo -> next ---------- */
  function runBoot(sub, then, quick) {
    S.busy = true;
    closeHelp(true);
    var k = quick ? 0.7 : 1;
    $('#bootSub').textContent = sub || C.tagline;
    setTimeout(function () { crtAnim('tune'); PL.static.setMode('tune'); PL.audio.play('tune'); }, 200 * k);
    setTimeout(function () { crtAnim('flip'); flash(); }, 700 * k);
    setTimeout(function () { setView('boot'); PL.static.setMode('grain'); playBtn.classList.remove('is-launching'); }, 940 * k);
    setTimeout(function () { crtAnim(null); }, 1220 * k);
    setTimeout(function () { PL.audio.play('boot'); }, 1500 * k);
    setTimeout(function () { S.awake = true; then(); }, 3300 * k);
  }

  function startPlay() {
    if (S.busy || S.view !== 'static' || !S.power) return;
    var ins = PL.carts.inserted();
    playBtn.classList.add('is-launching');
    PL.audio.play('select');
    if (ins) return bootCart(ins);
    runBoot(C.tagline, function () { goHome(); S.busy = false; });
  }

  /* ---------- relics ---------- */
  var launching = false;

  /* the attunement: device veins and runes (js/device.js) + the relic's art blooming on the screen */
  function attune(cd) {
    var img = attuneEl.querySelector('.at-art');
    if (cd.art) { img.src = cd.art; img.classList.remove('is-empty'); }
    else { img.removeAttribute('src'); img.classList.add('is-empty'); }
    attuneEl.querySelector('.at-name').textContent = cd.title;
    attuneEl.classList.remove('is-on'); void attuneEl.offsetWidth;
    if (!reduceMotion) attuneEl.classList.add('is-on');
    PL.audio.play('attune', cd.crystal);
    return PL.device.attune(cd.crystal);
  }

  /* A relic is seated. With the device awake it attunes and opens the relic's screen;
     otherwise it waits for power and Awaken. */
  function bootCart(id) {
    var cd = cartById(id);
    updateOsd();
    renderTiles();
    if (!cd || launching) return;
    if (!S.power) { PL.device.theme(cd.crystal); return; }
    launching = true;
    PL.carts.hold(true);
    function finish() { launching = false; PL.carts.hold(false); }
    whenReady(function () { return !S.busy; }, function () {
      if (!S.power || PL.carts.inserted() !== id) { playBtn.classList.remove('is-launching'); return finish(); }
      closeHelp(true);
      function open() {
        S.busy = true;
        attune(cd);
        setTimeout(function () { openRelic(id); }, reduceMotion ? 0 : 620);
        setTimeout(function () { attuneEl.classList.remove('is-on'); S.busy = false; finish(); }, reduceMotion ? 0 : 1500);
      }
      if (S.awake) open();
      else runBoot(cd.title, open, true);
    });
  }
  PL.carts.on('seated', function (e) { bootCart(e.id); });

  /* keyboard (Enter on the selected relic), an altar tile, L / R or a tab: insert it; 'seated' does the rest */
  function launchCart(id, fast) { PL.carts.insert(id, { fast: !!fast, onSeat: function () { flash(); } }); }

  function ejectCart() {
    if (launching || !PL.carts.inserted()) return;
    PL.carts.eject({});
  }
  PL.carts.on('eject-start', function (e) {
    if (!e.swap) PL.device.theme(null);
    if (S.power && S.view === 'section' && !e.swap) whenReady(function () { return !S.busy; }, function () { goHome(); });
  });
  PL.carts.on('play', function (id) { launchCart(id); });
  PL.carts.on('eject', ejectCart);
  setInterval(function () { if (!PL.carts.isBusy()) updateOsd(); }, 1000);

  /* back to the idle mist (the relic stays seated) */
  function goStatic() {
    S.busy = true;
    PL.audio.play('back');
    crtAnim('flip');
    setTimeout(function () {
      closeHelp(true);
      unmountScreen();
      S.awake = false;
      setView('static');
      updateOsd();
      PL.static.setMode('static');
    }, 240);
    setTimeout(function () { crtAnim(null); S.busy = false; }, 520);
  }

  /* ---------- altar (home): relic tiles, campaign, system buttons ---------- */
  function renderTiles() {
    var ins = PL.carts.inserted();
    tilesEl.innerHTML = C.carts.map(function (cd, i) {
      return '<div class="tile' + (ins === cd.id ? ' is-seated' : '') + '" role="listitem" data-i="' + i + '" style="--c1:' + cd.crystal + ';--i:' + i + '" aria-label="' + esc(_('Seat the relic {name}', { name: cd.name })) + '">' +
        '<div class="tile-art">' +
          '<div class="tile-img' + (cd.art ? '' : ' is-empty') + '">' + (cd.art ? '<img src="' + esc(cd.art) + '" alt="" width="160" height="120" loading="lazy" decoding="async">' : '') + '</div>' +
          '<span class="tile-name">' + esc(cd.name) + '</span>' +
          (cd.placeholder ? '<span class="tile-tag"><span class="ph-tag">' + _('Placeholder') + '</span></span>' : '') +
          '<span class="tile-num">' + (i + 1) + '</span><i class="tile-gem"></i>' +
        '</div></div>';
    }).join('');
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
    if (S.view === 'home') updateHome();
  }

  /* campaign: countdown to the end of the Kickstarter (computed locally; hidden after the date),
     Kickstarter / Steam / Discord. A missing URL renders a disabled "link pending" button. */
  var campaignEl = document.createElement('section');
  campaignEl.className = 'campaign';
  campaignEl.setAttribute('aria-label', _('Campaign'));
  homeView.insertBefore(campaignEl, dockEl);
  function daysLeft() {
    var c = sky.campaign;
    if (!c || !c.endsOn) return 0;
    return Math.ceil((new Date(c.endsOn + 'T23:59:59') - Date.now()) / 864e5);
  }
  function renderCampaign() {
    var L = sky.links || {}, c = sky.campaign || {}, d = daysLeft();
    var ends = c.endsOn ? new Date(c.endsOn + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    function link(label, url, alt) {
      return url
        ? '<a class="cp-link' + (alt ? ' is-alt' : '') + '" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + '<i>↗</i></a>'
        : '<span class="cp-link is-pending" role="link" aria-disabled="true">' + esc(label) + '<i>' + _('link pending') + '</i></span>';
    }
    campaignEl.innerHTML =
      '<div class="cp-head"><span class="cp-kicker">KICKSTARTER</span>' +
      (d > 0 ? '<div class="cp-count"><b>' + d + '</b><span>' + _n(d, 'day left|days left') + '</span></div>' : '') + '</div>' +
      '<p class="cp-note">' + (d > 0 ? _('Campaign ends {date}. Goal EUR {goal}, funded within hours.', { date: ends, goal: (c.goalEUR || 0).toLocaleString('en-GB') })
        : _('Goal EUR {goal}, funded within hours.', { goal: (c.goalEUR || 0).toLocaleString('en-GB') })) + '</p>' +
      '<div class="cp-links">' + link('Kickstarter', L.kickstarter) + link('Steam', L.steam, true) + link('Discord', L.discord, true) + '</div>';
    campaignEl.querySelectorAll('.cp-link').forEach(function (el, i) {
      el.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse' || S.view !== 'home' || S.busy || S.help) return;
        if (S.row !== 'links' || S.link !== i) { S.row = 'links'; S.link = i; updateHome(); }
      });
      el.addEventListener('click', function () { if (el.classList.contains('is-pending')) toast(_('Link pending: the studio will add it soon')); });
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
    campaignEl.querySelectorAll('.cp-link').forEach(function (b, i) { b.classList.toggle('is-selected', S.row === 'links' && i === S.link); });
    dockEl.querySelectorAll('.dock-btn').forEach(function (b, i) { b.classList.toggle('is-selected', S.row === 'dock' && i === S.dock); });
    var cd = C.carts[S.tile];
    titleEl.querySelector('b').textContent = cd.name;
    titleEl.querySelector('span').textContent = _('Opens: {screen}', { screen: sectionTitle(cd.opens) });
    if (swapTitle) { titleEl.classList.remove('swap'); void titleEl.offsetWidth; titleEl.classList.add('swap'); }
    updateHints();
    updateAmbient();
  }

  function moveHome(dir) {
    var rows = ['tiles', 'links', 'dock'];
    var counts = { tiles: C.carts.length, links: campaignEl.querySelectorAll('.cp-link').length, dock: C.dock.length };
    var key = { tiles: 'tile', links: 'link', dock: 'dock' }[S.row];
    if (dir === 'left' || dir === 'right') {
      var v = S[key] + (dir === 'right' ? 1 : -1);
      if (v < 0 || v >= counts[S.row]) return PL.audio.play('error');
      S[key] = v;
      PL.audio.play('tick');
      return updateHome(S.row === 'tiles');
    }
    var r = rows.indexOf(S.row) + (dir === 'down' ? 1 : -1);
    if (r < 0 || r >= rows.length) return PL.audio.play('error');
    S.row = rows[r];
    PL.audio.play('tick');
    updateHome();
  }

  function goHome() {
    unmountScreen();
    S.row = 'tiles';
    if (PL.carts.inserted()) S.tile = Math.max(0, cartIndex(PL.carts.inserted()));
    renderCampaign();
    setView('home');
    updateHome(true);
  }

  /* an altar tile seats its relic (the relic decides the screen) */
  function openTile(i) {
    var cd = C.carts[i];
    if (!cd) return;
    if (PL.carts.inserted() === cd.id) return openRelic(cd.id);
    launchCart(cd.id);
  }
  function activateLink(i) {
    var el = campaignEl.querySelectorAll('.cp-link')[i];
    if (!el) return;
    if (el.tagName === 'A') { PL.audio.play('select'); el.click(); }
    else { PL.audio.play('error'); toast(_('Link pending: the studio will add it soon')); }
  }

  function activateDock(i) {
    switch (C.dock[i].id) {
      case 'controls': openHelp(); break;
      case 'retro': toggleRetro(); break;
      case 'sound': toggleSound(); break;
      case 'exit': goStatic(); break;
    }
  }

  /* ---------- the relic's screen (content: js/sections.js) ---------- */
  function unmountScreen() {
    if (secCtrl && secCtrl.destroy) secCtrl.destroy();
    secCtrl = null;
    S.stack = [];
  }

  function renderTabs() {
    tabList.innerHTML = C.carts.map(function (cd, i) {
      return '<button class="tab' + (cd.id === S.relic ? ' is-active' : '') + '" data-i="' + i + '" style="--tc:' + cd.crystal + '" aria-label="' + esc(cd.name) + '"><i></i><span>' + esc(cd.name) + '</span></button>';
    }).join('');
    tabList.querySelectorAll('.tab').forEach(function (tabEl) {
      tabEl.addEventListener('click', function () {
        var cd = C.carts[+tabEl.dataset.i];
        if (cd.id !== S.relic && !S.busy && !PL.carts.isBusy()) { PL.audio.play('tick'); launchCart(cd.id, true); }
      });
    });
  }

  function mount(id, opts, animate) {
    if (secCtrl && secCtrl.destroy) secCtrl.destroy();
    scrollEl.className = 'section-scroll sec-host';
    sectionAmbient = null;
    secCtrl = PL.sections.mount(id, scrollEl, opts || {});
    if (animate) { scrollEl.classList.remove('swap'); void scrollEl.offsetWidth; scrollEl.classList.add('swap'); }
    updateAmbient();
    updateHints();
  }

  function openRelic(id) {
    var cd = cartById(id);
    if (!cd) return;
    S.relic = id;
    S.stack = [];
    S.tile = cartIndex(id);
    renderTabs();
    mount(cd.opens, { tab: cd.tab, relic: id }, false);
    setView('section');
    scrollEl.scrollTop = 0;
  }

  /* screens opened from a screen (e.g. the bestiary opens the Spirit Quiz); B comes back */
  function go(id, tab) {
    var cd = cartById(S.relic);
    S.stack.push({ id: id, tab: tab });
    PL.audio.play('open');
    mount(id, { tab: tab, relic: S.relic, from: cd && cd.opens }, true);
  }
  function back() {
    if (!S.stack.length) return false;
    S.stack.pop();
    var top = S.stack[S.stack.length - 1], cd = cartById(S.relic);
    PL.audio.play('back');
    if (top) mount(top.id, { tab: top.tab, relic: S.relic }, true);
    else mount(cd.opens, { tab: cd.tab, relic: S.relic }, true);
    return true;
  }

  /* L / R or a tab: seat the neighbouring relic (fast swap; the screen follows the relic) */
  function switchRelic(delta) {
    if (PL.carts.isBusy()) return;
    var n = C.carts.length, i = (cartIndex(S.relic) + delta + n) % n;
    PL.audio.play('tick');
    launchCart(C.carts[i].id, true);
  }

  PL.sections.setContext({
    audio: function (n) { PL.audio.play(n); },
    toast: function (m) { toast(m); },
    ambient: function (c) { sectionAmbient = c; updateAmbient(); },
    hints: function () { updateHints(); },
    eject: function () { ejectCart(); },
    swap: function (id) { launchCart(id, true); },
    go: function (id, tab) { go(id, tab); },
    back: function () { return back(); },
  });

  /* ---------- help ---------- */
  var HELP = [
    [['▲▼◀▶'], _('Navigate'), '← ↑ → ↓'],
    [['◆'], _('Select / open'), 'Enter'],
    [['◆'], _('Back, or draw the relic out'), 'Esc'],
    [['‹', '›'], _('Neighbouring relic'), 'Q / E'],
    [['1-3'], _('Pick a relic in the rack, then Enter'), '1 2 3'],
    [['◐'], _('Glass effect'), 'Y'],
    [['?'], _('This help'), '+'],
    [['♪'], _('Sound on / off'), 'M'],
    [['⌂'], _('Relic altar'), 'H'],
    [['◉'], _('Save a photo of the screen'), 'C'],
    [['⏻'], _('Power'), 'P'],
    [['−', '+'], _('Volume'), '[ ]'],
  ];
  $('#helpGrid').innerHTML = HELP.map(function (r, i) {
    return '<div class="help-row"><span class="hb">' +
      r[0].map(function (b) { return '<b class="badge' + (i === 1 ? ' badge--a' : i === 2 ? ' badge--b' : '') + '">' + b + '</b>'; }).join('') +
      '</span><span>' + r[1] + '</span><span class="hk">' + r[2] + '</span></div>';
  }).join('');
  if (sky.credits) {
    var cr = document.createElement('div');
    cr.className = 'help-credits';
    cr.textContent = (sky.meta ? sky.meta.game + ' · ' + sky.meta.studio + ' · ' : '') + sky.credits.map(function (c) { return c.role + ': ' + c.name; }).join(' · ');
    $('.help-panel').appendChild(cr);
  }

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
    var v = PL.audio.getVolume(), muted = PL.audio.isMuted();
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
    var t = _('Relic altar'), cd = S.relic && cartById(S.relic);
    if (S.view === 'static') t = 'Nori-Dex';
    else if (S.view === 'section' && cd) t = cd.name;
    return { title: t, sub: '', color: getComputedStyle(root).getPropertyValue('--ambient').trim() || '#7FD6DF' };
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
      else PL.audio.play('click');
      return;
    }

    if (S.view === 'home') {
      switch (name) {
        case 'up': case 'down': case 'left': case 'right': return moveHome(name);
        case 'l': case 'r': S.row = 'tiles'; return moveHome(name === 'l' ? 'left' : 'right');
        case 'a':
          if (S.row === 'tiles') return openTile(S.tile);
          if (S.row === 'links') return activateLink(S.link);
          return activateDock(S.dock);
        case 'b':
          if (S.row !== 'tiles') { S.row = 'tiles'; PL.audio.play('back'); return updateHome(); }
          return PL.audio.play('click');
        case 'home': S.row = 'tiles'; S.tile = 0; PL.audio.play('tick'); return updateHome(true);
        case 'y': return toggleRetro();
        default: return PL.audio.play('click');
      }
    }

    if (S.view === 'section') {
      if (secCtrl && secCtrl.press(name)) return;
      switch (name) {
        case 'l': return switchRelic(-1);
        case 'r': return switchRelic(1);
        case 'b': if (back()) return; return PL.carts.inserted() ? ejectCart() : goHome();
        case 'home': return goHome();
        case 'y': return toggleRetro();
        default: return PL.audio.play('click');
      }
    }
  });

  PL.bus.on('scroll', function (d) { if (S.view === 'section' && !S.help && secCtrl) secCtrl.scrollBy(d); });
  PL.bus.on('gamepad', function (g) { toast(g.connected ? _('Gamepad connected') : _('Gamepad disconnected')); });
  document.addEventListener('visibilitychange', function () { PL.audio.pause(document.hidden); });

  playBtn.addEventListener('click', startPlay);

  /* ---------- start ---------- */
  PL.mountIcons();
  PL.static.init($('#static'));
  renderTiles();
  renderCampaign();
  renderDock();
  crt.classList.add('is-off');

  /* intro: device -> the conduit drops in from the top -> relics rise out of the rack */
  setTimeout(function () { PL.cable.dangle(); PL.carts.intro(500); }, reduceMotion ? 50 : 450);
  setTimeout(function () { body.classList.remove('is-intro'); }, 1700);

  PL.app = { state: S, toast: toast };   // for debugging from the console
})();
