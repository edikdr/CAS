/* ==========================================================================
   Screens shown when a relic is seated. Owner: Sonnet (S2 to S5).

   STUB by Opus: the reusable controller (grid navigation, detail sheet,
   hints, keys) is kept from the original; the four builders below are
   deliberately plain placeholders so the device works end to end. Replace
   them, keep the contract:

     PL.sections.mount(id, root, opts) -> controller
       controller.press(name)  -> true if the key was handled
                                  (names: up down left right a b x y l r home)
       controller.hints()      -> [[['a'], 'Open'], [['b'], 'Back'], ...]
       controller.scrollBy({x, y})   (wheel / scroll keys)
       controller.destroy()
     PL.sections.setContext(ctx)  ctx = { audio(name), toast(msg), ambient(color),
                                          hints(), eject(), swap(relicId) }
     ids: 'dex' | 'worlds' | 'spirit' | 'join'  (PL.config.sections / carts.opens)
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
    return [[['l', 'r'], _('Relics')], [['b'], _('Eject')], [['a'], _('Open')]];
  };

  /* ---------- STUB builders (Sonnet replaces) ---------- */
  function dex(root) {
    var noris = sky.noris || [], hero = sky.hero;
    var sec = new Section(root, {
      head: '<b class="sec-title">' + _('Nori-Dex') + '</b><span class="sec-count">' + noris.length + ' ' + _n(noris.length, 'Nori|Noris') + '</span>',
      onActivate: function (el) {
        var n = el.dataset.hero ? hero : noris.filter(function (x) { return x.id === el.dataset.id; })[0];
        if (!n) return;
        ctx.audio('open');
        var art = n.art && n.art.regular ? n.art.regular : n.art;
        this.showSheet(
          '<div class="stub-card"><img src="' + esc(art) + '" alt="" width="150" height="150">' +
          '<div><h3>' + esc(n.name) + (n.verified ? '' : tag()) + '</h3>' +
          '<p>' + esc(n.appearance || n.blurb) + '</p>' +
          (n.snapshot ? '<p class="stub-snap"><b>' + _('Playtest snapshot') + '</b> ' + _('Lv {lv} · HP {hp}', n.snapshot) + '</p>' : '') +
          (el.dataset.hero ? '' : '<p>' + _('Type') + ': ' + tag(_('Unconfirmed')) + '</p>') + '</div></div>');
      },
    });
    sec.scroll.innerHTML = '<div class="stub-grid">' +
      (hero ? '<button class="gi stub-tile is-hero" data-hero="1"><img src="' + esc(hero.art) + '" alt="" width="64" height="64"><b>' + esc(hero.name) + '</b><i>' + _('Hero') + '</i></button>' : '') +
      noris.map(function (n) {
        return '<button class="gi stub-tile" data-id="' + esc(n.id) + '"><img src="' + esc(n.art.regular) + '" alt="" width="64" height="64" loading="lazy"><b>' + esc(n.name) + '</b></button>';
      }).join('') + '</div>';
    sec.selectFirst();
    return sec;
  }

  function worlds(root) {
    var sec = new Section(root, { head: '<b class="sec-title">' + _('Worlds') + '</b>' });
    sec.scroll.innerHTML = '<div class="stub-list">' + (sky.planes || []).map(function (p) {
      return '<div class="gi stub-row" tabindex="-1"><b>' + esc(p.name) + '</b>' + (p.nameStatus === 'confirmed' ? '' : tag(_('Working title'))) +
        '<p>' + (p.blurb ? esc(p.blurb) : tag(_('Description pending'))) + '</p></div>';
    }).join('') + '</div>';
    sec.selectFirst();
    return sec;
  }

  function spirit(root) {
    var sec = new Section(root, { head: '<b class="sec-title">' + _('Spirit Quiz') + '</b>' });
    sec.scroll.innerHTML = '<div class="stub-list"><div class="gi stub-row" tabindex="-1"><b>' + _('Which Nori is your spirit guardian?') + '</b>' + tag() + '<p>' + _('Three questions. This screen arrives in the next pass.') + '</p></div></div>';
    sec.selectFirst();
    return sec;
  }

  function join(root) {
    var L = sky.links || {}, c = sky.campaign || {};
    function link(label, url) {
      return url ? '<a class="gi stub-link" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label) + '</a>'
        : '<span class="gi stub-link is-pending" aria-disabled="true">' + esc(label) + ' · ' + _('link pending') + '</span>';
    }
    var sec = new Section(root, { head: '<b class="sec-title">' + _('Join') + '</b>' });
    sec.scroll.innerHTML = '<div class="stub-list">' +
      '<p class="stub-note">' + _('Kickstarter runs until {d}. Goal: EUR {g}.', { d: esc(c.endsOn), g: (c.goalEUR || 0).toLocaleString('en-GB') }) + '</p>' +
      link('Kickstarter', L.kickstarter) + link('Steam', L.steam) + link('Discord', L.discord) + link(_('Studio site'), L.studioSite) +
      '<p class="stub-note">' + (sky.credits || []).map(function (x) { return esc(x.role) + ': ' + esc(x.name); }).join(' · ') + '</p></div>';
    sec.selectFirst();
    return sec;
  }

  var BUILDERS = { dex: dex, worlds: worlds, spirit: spirit, join: join };

  return {
    setContext: function (c) { ctx = c; },
    has: function (id) { return !!BUILDERS[id]; },
    mount: function (id, root, opts) {
      if (current && current.destroy) current.destroy();
      current = BUILDERS[id] ? BUILDERS[id](root, opts || {}) : null;
      return current;
    },
    navMove: navMove,
    ensureVisible: ensureVisible,
  };
})();
