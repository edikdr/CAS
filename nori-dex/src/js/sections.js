/* ==========================================================================
   Screens shown when a relic is seated. Owner: Sonnet.

     PL.sections.mount(id, root, opts) -> controller
       controller.press(name)  -> true if the key was handled
                                  (names: up down left right a b x y l r home)
       controller.hints()      -> [[['a'], 'Open'], [['b'], 'Back'], ...]
       controller.scrollBy({x, y})   (wheel / scroll keys)
       controller.destroy()
       opts = { tab, relic }   tab: sub-view to open at (Worlds: plane id 'p1'..'p4')
     PL.sections.setContext(ctx)  ctx = { audio(name), toast(msg), ambient(color|null), hints(),
                                          eject(), swap(relicId), go(screenId, tab), back() }
     ids: 'dex' | 'worlds' | 'spirit'   (relics open 'dex' and 'worlds'; the bestiary opens 'spirit'
          with ctx.go('spirit'); B returns via the app). 'spirit' lives in js/spirit.js and joins
          with PL.sections.register(id, builder).
     The campaign links and countdown live on the altar (app.js, helpers in js/hub.js).

   This file: the shared controller (grid navigation, detail sheet, hints, keys), the Nori-Dex
   (Kael's hero panel, the five Noris, the dex card) and Worlds.
   ========================================================================== */
window.PL = window.PL || {};

PL.sections = (function () {
  var ctx = null;
  var current = null;
  var sky = PL.sky || {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tag(text) { return '<span class="ph-tag">' + esc(text || _('Placeholder')) + '</span>'; }

  /* ---------- navigation between .gi items in a container (by geometry) ---------- */
  function navMove(root, cur, dir) {
    var items = Array.prototype.slice.call(root.querySelectorAll('.gi'));
    if (!items.length) return null;
    if (!cur || items.indexOf(cur) === -1) return items[0];
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestScore = Infinity;
    items.forEach(function (el) {
      if (el === cur) return;
      var q = el.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
      var dx = x - cx, dy = y - cy, score;
      if (dir === 'left' && dx < -2 && Math.abs(dy) < r.height * 0.6) score = -dx;
      else if (dir === 'right' && dx > 2 && Math.abs(dy) < r.height * 0.6) score = dx;
      else if (dir === 'up' && dy < -r.height * 0.4) score = -dy * 3 + Math.abs(dx);
      else if (dir === 'down' && dy > r.height * 0.4) score = dy * 3 + Math.abs(dx);
      else return;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return best;
  }
  function ensureVisible(scroller, el) {
    if (!el || !scroller) return;
    var s = scroller.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.height / scroller.clientHeight || 1;
    if (r.top < s.top + 6 * k) scroller.scrollTop -= (s.top + 8 * k - r.top) / k;
    else if (r.bottom > s.bottom - 6 * k) scroller.scrollTop += (r.bottom - s.bottom + 8 * k) / k;
  }

  /* ---------- base screen controller ---------- */
  function Section(root, opts) {
    var self = this;
    this.root = root;
    this.opts = opts;
    root.innerHTML =
      '<div class="sec-head">' + (opts.head || '') + '</div>' +
      '<div class="sec-scroll"></div>' +
      '<div class="sheet" role="dialog" aria-modal="false"><div class="sheet-in"></div><button class="sheet-x" aria-label="' + _('Close') + '">' + PL.icon('close') + '</button></div>';
    this.head = root.querySelector('.sec-head');
    this.scroll = root.querySelector('.sec-scroll');
    this.sheet = root.querySelector('.sheet');
    this.sheetIn = root.querySelector('.sheet-in');
    this.sel = null;
    this.sheetOpen = false;

    this._move = function (e) {
      if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY) || self.sheetOpen) return;
      var g = e.target.closest('.gi');
      if (g && g !== self.sel && self.root.contains(g)) self.select(g, true);
    };
    this._click = function (e) {
      if (e.target.closest('.sheet-x')) return self.closeSheet();
      var g = e.target.closest('.gi');
      if (g && !e.target.closest('.sheet')) { self.select(g, true); self.activate(g); }
    };
    root.addEventListener('pointermove', this._move);
    root.addEventListener('click', this._click);
  }
  Section.prototype.destroy = function () {
    this.root.removeEventListener('pointermove', this._move);
    this.root.removeEventListener('click', this._click);
  };
  Section.prototype.select = function (el, quiet) {
    if (this.sel) this.sel.classList.remove('is-sel');
    this.sel = el;
    if (!el) return;
    el.classList.add('is-sel');
    if (!quiet) ensureVisible(this.scroll.contains(el) ? this.scroll : null, el);
  };
  Section.prototype.selectFirst = function () { this.select(this.scroll.querySelector('.gi'), true); };
  Section.prototype.activate = function (el) {
    if (el.tagName === 'A') return;                       // outbound links open by themselves
    if (this.opts.onActivate) this.opts.onActivate.call(this, el);
  };
  Section.prototype.showSheet = function (html, color) {
    this.sheetIn.innerHTML = html;
    var h = this.sheetIn.querySelector('h3');
    if (h) this.sheet.setAttribute('aria-label', h.textContent);     // the dialog is named after its card
    this.sheet.style.setProperty('--sc', color || '#7FD6DF');
    this.sheetIn.scrollTop = 0;
    if (!this.sheetOpen) { this.sheet.classList.add('is-open'); this.sheetOpen = true; }
    if (color) ctx.ambient(color);
    ctx.hints();
  };
  Section.prototype.closeSheet = function () {
    if (!this.sheetOpen) return false;
    this.sheet.classList.remove('is-open');
    this.sheetOpen = false;
    ctx.audio('back');
    ctx.ambient(null);
    ctx.hints();
    return true;
  };
  Section.prototype.press = function (name) {
    if (this.sheetOpen) {
      if (name === 'b' || name === 'a') { this.closeSheet(); return true; }
      if (name === 'up' || name === 'down') { this.sheetIn.scrollBy({ top: name === 'down' ? 80 : -80, behavior: 'smooth' }); return true; }
      return name !== 'l' && name !== 'r' && name !== 'home';
    }
    switch (name) {
      case 'up': case 'down': case 'left': case 'right': {
        var next = navMove(this.root, this.sel, name);
        if (next) { this.select(next); ctx.audio('tick'); } else ctx.audio('error');
        return true;
      }
      case 'a':
        if (this.sel) { if (this.sel.tagName === 'A') this.sel.click(); else this.activate(this.sel); }
        return true;
    }
    return false;
  };
  Section.prototype.scrollBy = function (d) { (this.sheetOpen ? this.sheetIn : this.scroll).scrollTop += d.y * 16; };
  Section.prototype.hints = function () {
    if (this.sheetOpen) return [[['b'], _('Back')]];
    if (this.opts.sub) return [[['b'], _('Back')], [['a'], _('Select')]];
    return [[['l', 'r'], _('Relics')], [['b'], _('Draw out')], [['a'], _('Open')]];
  };

  /* ==========================================================================
     NORI-DEX
       list:  Kael's hero panel (he is a character, not a Nori), the five Noris, and the Spirit Quiz tile
       card:  portrait with a nudge reaction, Regular / Alternate palette, Playtest snapshot, Placeholder tags,
              and a "Fallen" memorial that is remembered in localStorage
     ========================================================================== */
  /* UI accent from each portrait's dominant colour. It is not a type (the types are not public). */
  var ACCENT = { kael: '#E8B93A', zer: '#7FD6DF', saltu: '#8FCB5C', corivel: '#5FB6A8', denal: '#F2A65A', garnia: '#A98BE0' };
  /* the nudge reaction: a class on the portrait, a caption and a sound. The captions are sound-effect
     words for our little animation; they say nothing about the game. */
  var EMOTE = {
    zer: ['em-flicker', _('Flicker, flicker.'), 'sparkle'],
    saltu: ['em-sway', _('Sway, sway.'), 'tick'],
    corivel: ['em-rustle', _('Rustle.'), 'click'],
    denal: ['em-squish', _('Squish!'), 'blip'],
    garnia: ['em-flutter', _('Flap, flap.'), 'swoosh'],
    kael: ['em-boing', _('Boing.'), 'select'],
  };
  /* the Rare palette demo: a hue shift per Nori, until the studio sends real alternate art */
  var RARE_HUE = { zer: 115, saltu: -75, corivel: 85, denal: 195, garnia: 135 };
  var FALL_KEY = 'nd-fallen';

  function loadFallen() { try { var a = JSON.parse(localStorage.getItem(FALL_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveFallen(a) { try { localStorage.setItem(FALL_KEY, JSON.stringify(a)); } catch (e) {} }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function isWide(root) { return root.offsetWidth > 480; }

  function ashHTML() {      // dust that falls from a card that turns to ash (transform and opacity only)
    var out = '';
    for (var i = 0; i < 16; i++) {
      out += '<i style="left:' + (8 + (i * 53) % 84) + '%;--x:' + (((i * 37) % 60) - 30) + 'px;--d:' + (i * 45) + 'ms;--s:' + (3 + (i % 4) * 2) + 'px"></i>';
    }
    return out;
  }

  function dex(root) {
    var noris = sky.noris || [], hero = sky.hero, fallen = loadFallen(), alt = {};
    var guardian = null;                                // the Spirit Quiz result, kept in localStorage 'nd-spirit' (js/spirit.js)
    try { guardian = localStorage.getItem('nd-spirit'); } catch (e) {}
    var timers = [], card = null;
    var sec = new Section(root, { head: '' });

    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function art(n) { return (n.art && n.art.regular) || n.art; }
    function byId(id) { return id === (hero && hero.id) ? hero : noris.filter(function (x) { return x.id === id; })[0]; }

    /* ---------- head and list ---------- */
    function head() {
      sec.head.innerHTML = '<b class="sec-title">' + _('Nori-Dex') + '</b>' +
        '<span class="dx-count">' + _('{n} of 200+ Noris', { n: noris.length }) + '</span>' +
        (fallen.length ? '<span class="dx-lost">' + _('Fallen: {n}', { n: fallen.length }) + '</span>' : '');
    }
    function tileHTML(n) {
      var gone = fallen.indexOf(n.id) > -1;
      return '<button class="gi dx-tile' + (gone ? ' is-fallen' : '') + '" data-id="' + esc(n.id) + '" style="--dc:' + (ACCENT[n.id] || '#7FD6DF') + '" aria-label="' + esc(_('{name}: open the card', { name: n.name })) + '">' +
        '<span class="dx-ph"><img src="' + esc(art(n)) + '" alt="" width="72" height="72" decoding="async"></span>' +
        '<b>' + esc(n.name) + '</b><i class="dx-gone' + (!gone && n.id === guardian ? ' is-mine' : '') + '">' + (gone ? _('Fallen') : n.id === guardian ? _('Your guardian') : '') + '</i></button>';
    }
    sec.scroll.innerHTML =
      '<div class="dx-wrap">' +
        (hero ? '<button class="gi dx-hero" data-hero="1" style="--dc:' + ACCENT.kael + '" aria-label="' + esc(_('{name}, the hero: open the card', { name: hero.name })) + '">' +
          '<span class="dx-hero-ring"><img src="' + esc(hero.art) + '" alt="" width="96" height="96" decoding="async"></span>' +
          '<span class="dx-hero-tag">' + _('Hero') + '</span><b>' + esc(hero.name) + '</b>' +
          '<span class="dx-hero-note">' + _('A character, not a Nori.') + '</span>' +
          '<span class="dx-hero-blurb">' + esc(hero.blurb) + '</span></button>' : '') +
        '<div class="dx-grid">' + noris.map(tileHTML).join('') +
          '<button class="gi dx-quiz" data-act="spirit"><i class="dx-quiz-gem"></i><b>' + _('Spirit Quiz') + '</b>' +
          '<span>' + _('Which Nori is your spirit guardian? Three questions.') + '</span></button>' +
        '</div></div>';
    head();
    sec.select(sec.scroll.querySelector('.dx-tile') || sec.scroll.querySelector('.gi'), true);

    function refreshTiles() {
      noris.forEach(function (n) {
        var t = sec.scroll.querySelector('.dx-tile[data-id="' + n.id + '"]'); if (!t) return;
        var gone = fallen.indexOf(n.id) > -1;
        t.classList.toggle('is-fallen', gone);
        var cap = t.querySelector('.dx-gone');
        cap.classList.toggle('is-mine', !gone && n.id === guardian);
        cap.textContent = gone ? _('Fallen') : n.id === guardian ? _('Your guardian') : '';
      });
      head();
    }

    /* ---------- the card ---------- */
    function cardHTML(n, isHero) {
      var i = noris.indexOf(n), acc = ACCENT[n.id] || '#7FD6DF';
      var rows = isHero
        ? '<div><dt>' + _('Who') + '</dt><dd>' + _('Kael is a character, not a Nori.') + '</dd></div>'
        : '<div><dt>' + _('Playtest snapshot') + '</dt><dd>' + _('Lv {lv} · HP {hp}', n.snapshot) + '<small>' + _('From an early playtest save. Not base stats.') + '</small></dd></div>' +
          '<div><dt>' + _('Type') + '</dt><dd>' + tag() + '<small>' + _('Six types exist. The names are not public yet.') + '</small></dd></div>';
      rows += '<div><dt>' + _('Portrait') + '</dt><dd>' + tag() + '<small>' + _('A HUD portrait. The studio sends the real sprite.') + '</small></dd></div>';
      var seg = isHero ? '' :
        '<div class="dx-seg" role="group" aria-label="' + esc(_('Palette')) + '">' +
          '<button class="dx-row" data-dx="pal-regular" aria-pressed="true">' + _('Regular') + '</button>' +
          '<button class="dx-row" data-dx="pal-alt" aria-pressed="false">' + _('Alternate') + '</button></div><p class="dx-demo"></p>';
      return '<article class="dx-card' + (isHero ? ' is-hero' : '') + '" style="--dc:' + acc + ';--rare:' + (RARE_HUE[n.id] || 0) + 'deg" data-id="' + esc(n.id) + '" aria-label="' + esc(n.name) + '">' +
        '<div class="dx-pane">' +
          '<button class="dx-nudge" data-dx="nudge" aria-label="' + esc(_('Nudge {name}', { name: n.name })) + '">' +
            '<span class="dx-art"><img class="dx-img" src="' + esc(art(n)) + '" alt="' + esc(n.name + ': ' + (n.appearance || n.blurb)) + '" width="140" height="140">' +
            '<i class="dx-star s1"></i><i class="dx-star s2"></i><i class="dx-star s3"></i></span>' +
            '<span class="dx-ash" aria-hidden="true">' + ashHTML() + '</span></button>' +
          '<span class="dx-chip" hidden>' + _('Rare palette (demo)') + '</span>' +
          '<p class="dx-emote" aria-live="polite">&nbsp;</p>' + seg +
        '</div>' +
        '<div class="dx-info">' +
          '<div class="dx-title"><h3>' + esc(n.name) + '</h3>' + (isHero ? '<span class="dx-hero-tag">' + _('Hero') + '</span>' : '<span class="dx-of">' + _('{i} of {n}', { i: i + 1, n: noris.length }) + '</span>') + '</div>' +
          '<p class="dx-app">' + esc(n.appearance || n.blurb) + '</p>' +
          '<dl class="dx-rows">' + rows + '</dl>' +
          '<div class="dx-actions">' +
            (isHero ? '' : '<button class="dx-nav" data-dx="prev" aria-label="' + esc(_('Previous Nori')) + '">‹</button><button class="dx-nav" data-dx="next" aria-label="' + esc(_('Next Nori')) + '">›</button>' +
              '<button class="dx-fall-btn dx-row" data-dx="fall"></button>') +
          '</div>' +
          (isHero ? '' : '<p class="dx-fall-note"></p>') +
        '</div></article>';
    }

    function openCard(id, dir) {
      var n = byId(id); if (!n) return;
      var isHero = n === hero;
      timers.forEach(clearTimeout); timers = [];
      card = { n: n, hero: isHero, row: 0, confirm: false, nudges: 0 };
      sec.sheetIn.className = 'sheet-in dx-in';
      sec.showSheet(cardHTML(n, isHero), ACCENT[n.id]);
      var el = sec.sheetIn.querySelector('.dx-card');
      if (dir) el.classList.add(dir > 0 ? 'go-next' : 'go-prev');
      applyPalette(); applyFallen(); applyRow();
    }
    function q(sel) { return sec.sheetIn.querySelector(sel); }
    function applyPalette() {
      if (!card || card.hero) return;
      var n = card.n, on = !!alt[n.id], real = !!(n.art && n.art.alternate), gone = fallen.indexOf(n.id) > -1;
      q('.dx-art').classList.toggle('is-rare', on && !real && !gone);
      q('.dx-img').src = on && real ? n.art.alternate : n.art.regular;
      var segs = sec.sheetIn.querySelectorAll('.dx-seg button');
      segs[0].setAttribute('aria-pressed', on ? 'false' : 'true'); segs[1].setAttribute('aria-pressed', on ? 'true' : 'false');
      var chip = q('.dx-chip'); chip.hidden = !(on && !real && !gone);
      q('.dx-demo').textContent = on ? (real ? _('The alternate palette, from the studio.') : _('A colour effect for now. Real alternate art goes here when the studio sends it.')) : '';
    }
    function applyFallen() {
      if (!card || card.hero) return;
      var n = card.n, gone = fallen.indexOf(n.id) > -1, b = q('.dx-fall-btn');
      q('.dx-art').classList.toggle('is-fallen', gone);
      b.textContent = card.confirm ? _('Really? Gone for good.') : gone ? _('Bring back') : _('Mark as fallen');
      b.classList.toggle('is-confirm', card.confirm);
      applyPalette();                                    // an ashen portrait carries no rare-palette effect
      q('.dx-fall-note').textContent = gone ? _('Rest well, {name}.', { name: n.name }) : _('In the game, a Nori lost in battle is gone for good.');
    }
    function applyRow() {
      var rows = sec.sheetIn.querySelectorAll('.dx-row');
      var want = card && !card.hero ? (card.row === 0 ? (alt[card.n.id] ? 1 : 0) : 2) : -1;
      for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('is-row', i === want);
      if (want > -1) ensureVisible(sec.sheetIn, rows[want]);
    }
    function togglePalette(to) {
      if (!card || card.hero) return;
      var n = card.n; alt[n.id] = typeof to === 'boolean' ? to : !alt[n.id];
      applyPalette(); applyRow();
      ctx.audio(alt[n.id] ? 'sparkle' : 'tick');
    }
    function nudge() {
      if (!card) return;
      var n = card.n, e = EMOTE[n.id] || EMOTE.kael, art = q('.dx-art'), cap = q('.dx-emote');
      card.nudges++;
      if (fallen.indexOf(n.id) > -1) { cap.textContent = _('Quiet now.'); ctx.audio('tick'); return; }
      if (card.nudges >= 7 && card.nudges % 7 === 0) { cap.textContent = _('That is a lot of nudges.'); ctx.audio('sparkle'); }
      else { cap.textContent = e[1]; ctx.audio(e[2]); }
      art.classList.remove('em-flicker', 'em-sway', 'em-rustle', 'em-squish', 'em-flutter', 'em-boing');
      void art.offsetWidth;
      if (!reduced()) art.classList.add(e[0]);
    }
    function fall() {
      if (!card || card.hero) return;
      var n = card.n, gone = fallen.indexOf(n.id) > -1;
      if (gone) {                                       // bring back
        fallen.splice(fallen.indexOf(n.id), 1); saveFallen(fallen);
        card.confirm = false; applyFallen(); head();
        ctx.audio('on'); ctx.toast(_('{name} is back.', { name: n.name }));
        return;
      }
      if (!card.confirm) {                              // first press: ask once
        card.confirm = true; applyFallen(); ctx.audio('card');
        later(function () { if (card && card.confirm) { card.confirm = false; applyFallen(); } }, 3200);
        return;
      }
      card.confirm = false;                             // second press: ash
      fallen.push(n.id); saveFallen(fallen);
      var a = q('.dx-art'), dust = q('.dx-ash');
      if (!reduced()) { a.classList.add('is-ashing'); dust.classList.add('is-on'); later(function () { a.classList.remove('is-ashing'); dust.classList.remove('is-on'); }, 1700); }
      applyFallen(); head();
      ctx.audio('off');
      q('.dx-emote').textContent = _('Rest well, {name}.', { name: n.name });
    }
    function nav(d) {
      if (!card || card.hero) return;
      var i = (noris.indexOf(card.n) + d + noris.length) % noris.length;
      ctx.audio('tick');
      openCard(noris[i].id, d);
      var t = sec.scroll.querySelector('.dx-tile[data-id="' + noris[i].id + '"]'); if (t) sec.select(t, true);
    }
    function activateRow() {
      if (!card || card.hero) return;
      if (card.row === 0) togglePalette(); else fall();
    }

    /* ---------- input ---------- */
    sec.opts.onActivate = function (el) {
      if (el.dataset.act === 'spirit') return ctx.go('spirit');
      ctx.audio('open');
      openCard(el.dataset.hero ? hero.id : el.dataset.id);
    };
    function onSheetClick(e) {
      var b = e.target.closest('[data-dx]');
      if (!b || !card) return;
      if (e.detail > 0 && b.blur) b.blur();               // after a mouse or touch click, Enter goes back to the device's A key
      switch (b.dataset.dx) {
        case 'nudge': nudge(); break;
        case 'pal-regular': togglePalette(false); break;
        case 'pal-alt': togglePalette(true); break;
        case 'fall': card.row = 1; applyRow(); fall(); break;
        case 'prev': nav(-1); break;
        case 'next': nav(1); break;
      }
    }
    sec.sheet.addEventListener('click', onSheetClick);

    var basePress = sec.press, baseClose = sec.closeSheet, baseDestroy = sec.destroy;
    sec.closeSheet = function () {
      var was = baseClose.call(sec);
      if (was) { card = null; timers.forEach(clearTimeout); timers = []; refreshTiles(); }
      return was;
    };
    sec.press = function (name) {
      if (!sec.sheetOpen || !card) return basePress.call(sec, name);
      switch (name) {
        case 'b': if (card.confirm) { card.confirm = false; applyFallen(); ctx.audio('back'); } else sec.closeSheet(); return true;
        case 'a': activateRow(); return true;
        case 'up': case 'down':
          if (card.hero) return true;
          card.row = card.row ? 0 : 1; applyRow(); ctx.audio('tick'); ctx.hints(); return true;
        case 'left': case 'right': case 'l': case 'r':
          if (card.hero) { ctx.audio('error'); return true; }       // Kael has no neighbours; an open card never swaps the relic
          nav(name === 'left' || name === 'l' ? -1 : 1); return true;
      }
      return false;
    };
    sec.hints = function () {
      if (!sec.sheetOpen || !card) return [[['l', 'r'], _('Relics')], [['b'], _('Draw out')], [['a'], _('Open')]];
      if (card.hero) return [[['b'], _('Back')]];
      var wide = isWide(root), act = card.row === 0 ? _('Palette') : _('Fallen');
      return (wide ? [[['l', 'r'], _('Next Nori')], [['up', 'down'], _('Choose')]] : [[['l', 'r'], _('Next')]]).concat([[['a'], act], [['b'], _('Back')]]);
    };
    sec.destroy = function () {
      timers.forEach(clearTimeout); timers = [];
      sec.sheet.removeEventListener('click', onSheetClick);
      baseDestroy.call(sec);
    };
    var hand = PL.sections.hand && PL.sections.hand.card;     // "Meet Zer" in the Spirit Quiz: open that card
    PL.sections.hand = null;
    if (hand && byId(hand)) {
      var tile = sec.scroll.querySelector('.dx-tile[data-id="' + hand + '"]'); if (tile) sec.select(tile, true);
      later(function () { ctx.audio('open'); openCard(hand); }, 260);
    }
    return sec;
  }

  /* ==========================================================================
     WORLDS: the four planes as a vertical journey (Celestia at the top, the Abyssal Plane, the deepest, at the
     bottom). A mana rail runs down the left; moving down lights the stream up to the plane you are at, and
     that plane unfolds. A opens a closer look. Honest by construction: working titles, unconfirmed art and
     missing descriptions all carry a Placeholder tag, and a plane without art gets an intentional empty state.
     ========================================================================== */
  /* UI tint per plane: the two relic colours the client chose, and a neutral gold for the unconfirmed ones */
  var PLANE_TINT = { p1: '#7FD6DF', p4: '#FF7A3A' };

  function voidHTML(p, big) {
    return '<div class="wl-void' + (big ? ' is-big' : '') + '" style="--wc:' + (PLANE_TINT[p.id] || '#E8B93A') + '">' +
      '<i class="wl-gem"></i><b>' + _('Art pending') + '</b><span>' + _('The studio supplies it.') + '</span></div>';
  }

  function worlds(root, opts) {
    var planes = (sky.planes || []).slice().sort(function (a, b) { return a.order - b.order; });
    var sec = new Section(root, { head: '<b class="sec-title">' + _('Worlds') + '</b><span class="dx-count">' + planes.length + ' ' + _n(planes.length, 'plane|planes') + '</span>' });
    var timers = [], prevSel = null, capTimer = 0;
    function tint(p) { return PLANE_TINT[p.id] || '#E8B93A'; }

    function stopHTML(p, i) {
      var working = p.nameStatus !== 'confirmed';
      var artNote = p.art && p.artStatus !== 'confirmed' ? '<p class="wl-note">' + _('Placeholder art: an in-game screenshot, not yet confirmed for this plane.') + '</p>' : '';
      return '<li class="wl-stop" data-id="' + esc(p.id) + '" style="--wc:' + tint(p) + ';--i:' + i + '">' +
        '<span class="wl-rail" aria-hidden="true"><i class="wl-line"></i><i class="wl-node"></i></span>' +
        '<button class="gi wl-head" data-id="' + esc(p.id) + '" aria-expanded="false" aria-label="' + esc(_('Plane {i} of {n}: {name}', { i: i + 1, n: planes.length, name: p.name })) + '">' +
          '<b>' + esc(p.name) + '</b>' + (working ? tag(_('Working title')) : '<span class="wl-ok">' + _('Official name') + '</span>') +
          '<small>' + _('Plane {i} of {n}', { i: i + 1, n: planes.length }) + '</small></button>' +
        '<div class="wl-body"><div class="wl-in">' +
          '<div class="wl-art">' + (p.art ? '<img class="wl-img" src="' + esc(p.art) + '" alt="" width="320" height="180" loading="lazy" decoding="async">' : voidHTML(p)) + '</div>' +
          '<div class="wl-text"><p class="wl-blurb">' + (p.blurb ? esc(p.blurb) : tag(_('Description pending'))) + '</p>' + artNote + '</div>' +
        '</div></div></li>';
    }
    sec.scroll.innerHTML = '<div class="wl-wrap"><p class="wl-intro">' + esc(sky.facts.planes.text) + ' <span>' + _('Only the Abyssal Plane\'s name is official.') + '</span></p>' +
      '<ol class="wl-list">' + planes.map(stopHTML).join('') + '</ol><p class="wl-end" aria-live="polite"></p></div>';

    var stops = Array.prototype.slice.call(sec.scroll.querySelectorAll('.wl-stop'));
    function idx(el) { return stops.indexOf(el.closest('.wl-stop')); }

    /* the selected plane unfolds; the rail is lit down to it */
    function refresh() {
      var at = sec.sel ? idx(sec.sel) : -1;
      stops.forEach(function (st, k) {
        var open = k === at;
        st.classList.toggle('is-open', open);
        st.classList.toggle('is-lit', k <= at);
        st.classList.toggle('is-passed', k < at);
        var head = st.querySelector('.wl-head'), body = st.querySelector('.wl-body');
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) body.removeAttribute('inert'); else body.setAttribute('inert', '');
      });
      if (at > -1) { ctx.ambient(tint(planes[at])); }
    }
    var baseSelect = sec.select;
    sec.select = function (el, quiet) {
      prevSel = sec.sel;
      baseSelect.call(sec, el, quiet);
      refresh();
      if (el && prevSel !== el) timers.push(setTimeout(function () { if (sec.sel === el) ensureVisible(sec.scroll, el.closest('.wl-stop')); }, 340));
    };
    function caption(text) {
      var c = sec.scroll.querySelector('.wl-end'); c.textContent = text;
      c.classList.remove('is-pop'); void c.offsetWidth; c.classList.add('is-pop');
      clearTimeout(capTimer); capTimer = setTimeout(function () { c.classList.remove('is-pop'); c.textContent = ''; }, 2600);
    }
    function look(p) {
      ctx.audio('open');
      sec.showSheet('<div class="wl-look" style="--wc:' + tint(p) + '"><h3>' + esc(p.name) + '</h3>' +
        (p.art ? '<img src="' + esc(p.art) + '" alt="" width="640" height="360" decoding="async">' : voidHTML(p, true)) +
        '<p>' + (p.blurb ? esc(p.blurb) : tag(_('Description pending'))) + '</p>' +
        (p.art && p.artStatus !== 'confirmed' ? '<p class="wl-note">' + _('Placeholder art: an in-game screenshot, not yet confirmed for this plane.') + '</p>' : '') + '</div>', tint(p));
    }
    sec.opts.onActivate = function (el) {
      var p = planes[idx(el)]; if (!p) return;
      if (prevSel === el) look(p);                    // a tap on the plane that is already open; a tap on another one only unfolds it
    };

    var basePress = sec.press;
    sec.press = function (name) {
      if (sec.sheetOpen) return basePress.call(sec, name);
      if (name === 'up' || name === 'down') {
        var at = idx(sec.sel), to = at + (name === 'down' ? 1 : -1);
        if (to < 0) { ctx.audio('error'); return true; }
        if (to >= stops.length) { ctx.audio('error'); caption(_('No deeper than this.')); return true; }
        sec.select(stops[to].querySelector('.wl-head'));
        ctx.audio(name === 'down' ? 'swoosh' : 'tick');
        return true;
      }
      if (name === 'a') { var p = planes[idx(sec.sel)]; if (p) look(p); return true; }
      return name === 'left' || name === 'right' ? true : basePress.call(sec, name);
    };
    sec.hints = function () {
      if (sec.sheetOpen) return [[['b'], _('Back')]];
      return [[['l', 'r'], _('Relics')], [['up', 'down'], _('Journey')], [['a'], _('Look closer')], [['b'], _('Draw out')]];
    };
    var baseDestroy = sec.destroy;
    sec.destroy = function () { timers.forEach(clearTimeout); clearTimeout(capTimer); baseDestroy.call(sec); };

    var startAt = (opts.tab && sec.scroll.querySelector('.wl-head[data-id="' + opts.tab + '"]')) || stops[0].querySelector('.wl-head');
    sec.select(startAt, true);
    if (opts.tab) timers.push(setTimeout(function () { ensureVisible(sec.scroll, startAt.closest('.wl-stop')); }, 60));
    return sec;
  }

  var BUILDERS = { dex: dex, worlds: worlds };      // 'spirit' joins from js/spirit.js

  return {
    setContext: function (c) { ctx = c; },
    has: function (id) { return !!BUILDERS[id]; },
    mount: function (id, root, opts) {
      if (current && current.destroy) current.destroy();
      current = BUILDERS[id] ? BUILDERS[id](root, opts || {}) : null;
      return current;
    },
    register: function (id, builder) { BUILDERS[id] = builder; },
    ctx: function () { return ctx; },
    accent: ACCENT,
    hand: null,          // a one-shot message between screens, e.g. { card: 'zer' } opens that Nori's card in the dex
    Section: Section,
    esc: esc,
    tag: tag,
    navMove: navMove,
    ensureVisible: ensureVisible,
  };
})();
