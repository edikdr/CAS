/* ==========================================================================
   Содержимое вкладок (разделов) главного меню.
   Каждый раздел — «контроллер»: рисует себя в контейнер и обрабатывает кнопки.
   Общие детали: сетка с навигацией стрелками/стиком/мышью и панель-«лист»
   с подробностями (покемон, регион, тип, поколение, персонаж, предмет).
   ========================================================================== */
window.PL = window.PL || {};

PL.sections = (function () {
  var esc = function (s) { return PL.tcg.esc(s); };
  var D = PL.data;
  var GT = PL.gameTypes;
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  var STAT_RU = ['HP', _('Attack'), _('Defense'), _('Sp. Atk'), _('Sp. Def'), _('Speed')];
  var ctx = null;
  var current = null;
  var pref = {};   // «открой раздел сразу на этой вкладке»: pref.legends = 'dossier'
  function takePref(id) { var v = pref[id]; delete pref[id]; return v; }

  function pad3(n) { return String(n).padStart(3, '0'); }
  function art(id) { return D.artUrl(id); }
  function typePill(t) {
    var g = GT[t] || GT.normal;
    return '<span class="tpill" style="--tc:' + g.c + '">' + PL.icon(g.icon) + g.ru + '</span>';
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  /* {123} в тексте → русское имя покемона №123 */
  function fillMons(t) { return String(t).replace(/\{(\d+)\}/g, function (m, id) { var p = D.dexById[+id]; return p ? p.ru : m; }); }
  function store(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; }
  function sortByDate(ids) {
    return ids.slice().sort(function (a, b) {
      var x = (D.setMeta[D.setOf(a)] || {}).d || '', y = (D.setMeta[D.setOf(b)] || {}).d || '';
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  /* ---------- плитка покемона ---------- */
  function dexTile(p, big) {
    var g = GT[p.t[0]] || GT.normal;
    return '<button class="gi dtile' + (big ? ' big' : '') + (PL.fav.has('dex', p.id) ? ' is-fav' : '') + '" data-dex="' + p.id + '" style="--tc:' + g.c + '">' +
      '<span class="dt-num">' + pad3(p.id) + '</span>' +
      '<img src="' + art(p.id) + '" alt="" loading="lazy" draggable="false">' +
      '<b>' + esc(p.ru) + '</b><i class="dt-fav">' + PL.icon('heart') + '</i></button>';
  }

  /* ---------- навигация по элементам .gi в контейнере (по геометрии) ---------- */
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

  /* ---------- базовый контроллер раздела ---------- */
  function Section(root, opts) {
    var self = this;
    this.root = root;
    this.opts = opts;
    root.innerHTML =
      '<div class="sec-head">' + (opts.head || '') + '</div>' +
      '<div class="sec-scroll"></div>' +
      '<div class="sheet"><div class="sheet-in"></div><button class="sheet-x" aria-label="' + _('Close') + '">' + PL.icon('close') + '</button></div>';
    this.head = root.querySelector('.sec-head');
    this.scroll = root.querySelector('.sec-scroll');
    this.sheet = root.querySelector('.sheet');
    this.sheetIn = root.querySelector('.sheet-in');
    this.sel = null;
    this.sheetOpen = false;
    this.sheetNav = null;   // { list:[...], i, show(i) }

    this._move = function (e) {
      if (e.pointerType !== 'mouse' || (!e.movementX && !e.movementY) || self.sheetOpen) return;
      var g = e.target.closest('.gi');
      if (g && g !== self.sel && self.root.contains(g)) self.select(g, true);
    };
    this._click = function (e) {
      if (e.target.closest('.sheet-x')) return self.closeSheet();
      var inSheet = e.target.closest('.sheet');
      var act = e.target.closest('[data-act]');
      if (act) { self.action(act.dataset.act, act); return; }
      var g = e.target.closest('.gi');
      if (g && !inSheet) { self.select(g, true); self.activate(g); }
      else if (g && inSheet) self.activate(g);
    };
    root.addEventListener('pointermove', this._move);
    root.addEventListener('click', this._click);
    this.head.addEventListener('input', function (e) { if (opts.onInput) opts.onInput.call(self, e.target.value); });
  }
  /* корень один на все вкладки: перед новой вкладкой старые обработчики снимаем */
  Section.prototype.destroy = function () {
    this.root.removeEventListener('pointermove', this._move);
    this.root.removeEventListener('click', this._click);
  };
  Section.prototype.select = function (el, quiet) {
    if (this.sel) this.sel.classList.remove('is-sel');
    this.sel = el;
    if (!el) return;
    el.classList.add('is-sel');
    if (!quiet || !this.root.querySelector('.sec-head').contains(el)) ensureVisible(this.scroll.contains(el) ? this.scroll : null, el);
    if (this.opts.onSelect) this.opts.onSelect.call(this, el);
  };
  Section.prototype.selectFirst = function () {
    var first = this.scroll.querySelector('.gi') || this.root.querySelector('.gi');
    this.select(first, true);
  };
  Section.prototype.activate = function (el) {
    if (el.dataset.dex) { ctx.audio('open'); return this.openDex(+el.dataset.dex, this.listIds()); }
    if (this.opts.onActivate) this.opts.onActivate.call(this, el);
  };
  Section.prototype.listIds = function () {
    return Array.prototype.map.call(this.scroll.querySelectorAll('[data-dex]'), function (e) { return +e.dataset.dex; });
  };
  Section.prototype.action = function (act, el) {
    if (act === 'dex') { ctx.audio('open'); return this.openDex(+el.dataset.id, (el.dataset.list || '').split(',').filter(Boolean).map(Number)); }
    if (act === 'fav-dex') return this.toggleFavDex(+el.dataset.id);
    if (act === 'dex-cards') return ctx.openAlbum({ dex: +el.dataset.id });
    if (act === 'card') return this.openCardFrom(el);
    if (this.opts.onAction) this.opts.onAction.call(this, act, el);
  };
  Section.prototype.openCardFrom = function (el) {
    var list = this.cardList || [];
    var i = +el.dataset.i;
    if (list[i]) ctx.openCards(list, i);
  };
  /* добавить в избранное: сначала покемона «затягивает» в покебол, и только потом он попадает в список */
  Section.prototype.toggleFavDex = function (id) {
    var self = this;
    if (PL.fav.has('dex', id) || !ctx.capture) return this.applyFavDex(id);
    if (this.capturing) return;
    var scope = this.sheetOpen ? this.sheet : this.root;
    var src = this.sheetOpen ? this.sheet.querySelector('.ds-art img') : scope.querySelector('[data-dex="' + id + '"] img');
    var tgt = this.sheetOpen ? this.sheet.querySelector('.fav-btn') : scope.querySelector('[data-dex="' + id + '"] .dt-fav') || scope.querySelector('[data-dex="' + id + '"]');
    if (!src) return this.applyFavDex(id);
    this.capturing = true;
    ctx.capture(src, tgt, function () { self.capturing = false; self.applyFavDex(id); });
  };
  Section.prototype.applyFavDex = function (id) {
    var on = PL.fav.toggle('dex', id);
    ctx.audio(on ? 'select' : 'back');
    ctx.toast(on ? _('Added to favorites') : _('Removed from favorites'));
    this.root.querySelectorAll('[data-dex="' + id + '"]').forEach(function (e) { e.classList.toggle('is-fav', on); });
    var b = this.sheet.querySelector('.fav-btn[data-id="' + id + '"]');
    if (b) b.classList.toggle('is-on', on);
    ctx.favChanged();
  };

  /* --- лист с подробностями --- */
  Section.prototype.showSheet = function (html, color) {
    this.sheetIn.innerHTML = html;
    this.sheet.style.setProperty('--sc', color || '#6b7280');
    this.sheet.scrollTop = 0;
    this.sheetIn.scrollTop = 0;
    if (!this.sheetOpen) { this.sheet.classList.add('is-open'); this.sheetOpen = true; }
    else { this.sheetIn.classList.remove('swap'); void this.sheetIn.offsetWidth; this.sheetIn.classList.add('swap'); }
    if (color) ctx.ambient(color);
    ctx.hints();
  };
  Section.prototype.closeSheet = function () {
    if (!this.sheetOpen) return false;
    this.sheet.classList.remove('is-open');
    this.sheetOpen = false;
    this.sheetNav = null;
    ctx.audio('back');
    if (this.sel && this.opts.onSelect) this.opts.onSelect.call(this, this.sel);
    ctx.hints();
    return true;
  };

  /* --- лист покемона (общий для всех разделов) --- */
  Section.prototype.openDex = function (id, list) {
    var self = this;
    list = list && list.length ? list : [id];
    var i = list.indexOf(id);
    /* покемона нет в переданном списке (например, форма эволюции вне результатов поиска) —
       листаем его семью, а не подставляем соседа из чужого списка */
    if (i < 0) { list = familyIds(id); i = list.indexOf(id); }
    this.sheetNav = { list: list, i: i, show: function (k) {
      self.sheetNav.i = k;
      var extra = self.opts.dexExtra ? self.opts.dexExtra(list[k]) : '';
      self.showSheet(dexSheet(list[k], list, extra), (GT[D.dexById[list[k]].t[0]] || GT.normal).c);
      self.cardList = previewCards;
    } };
    this.sheetNav.show(i);
  };

  Section.prototype.press = function (name) {
    if (this.sheetOpen) {
      switch (name) {
        case 'b': return this.closeSheet();
        case 'up': case 'down': this.sheetIn.scrollBy({ top: name === 'down' ? 80 : -80, behavior: 'smooth' }); return true;
        case 'left': case 'right': case 'l': case 'r':
          if (!this.sheetNav || this.sheetNav.list.length < 2) { ctx.audio('error'); return true; }
          var d = (name === 'left' || name === 'l') ? -1 : 1, n = this.sheetNav.list.length;
          ctx.audio('tick');
          this.sheetNav.show((this.sheetNav.i + d + n) % n);
          return true;
        case 'y': {
          var fb = this.sheet.querySelector('.fav-btn');
          if (fb) { this.toggleFavDex(+fb.dataset.id); return true; }
          var sc = this.sheet.querySelector('[data-secondary]');
          if (sc) { this.action(sc.dataset.act, sc); return true; }
          return false;
        }
        case 'x': case 'a': {
          var pa = this.sheet.querySelector('[data-primary]');
          if (pa) { this.action(pa.dataset.act, pa); return true; }
          ctx.audio('click');
          return true;
        }
        case 'home': this.closeSheet(); return false;
      }
      return false;
    }
    switch (name) {
      case 'up': case 'down': case 'left': case 'right': {
        var next = navMove(this.root, this.sel, name);
        if (next) { this.select(next); ctx.audio('tick'); } else ctx.audio('error');
        return true;
      }
      case 'a':
        if (this.sel) this.activate(this.sel);
        return true;
      case 'y':
        if (this.sel && this.sel.dataset.dex) { this.toggleFavDex(+this.sel.dataset.dex); return true; }
        return false;
      case 'x':
        if (this.opts.onX) { this.opts.onX.call(this); return true; }
        return false;
    }
    return false;
  };
  Section.prototype.scrollBy = function (d) {
    (this.sheetOpen ? this.sheetIn : this.scroll).scrollTop += d.y * 16;
  };
  Section.prototype.hints = function () {
    if (this.sheetOpen) {
      var h = [];
      if (this.sheetNav && this.sheetNav.list.length > 1) h.push([['l', 'r'], _('Browse')]);
      if (this.sheet.querySelector('.fav-btn')) h.push([['y'], _('Favorites')]);
      else if (this.sheet.querySelector('[data-secondary]')) h.push([['y'], this.sheet.querySelector('[data-secondary]').dataset.label || _('Action')]);
      if (this.sheet.querySelector('[data-primary]')) h.push([['x'], this.sheet.querySelector('[data-primary]').dataset.label || _('Open')]);
      h.push([['b'], _('Back')]);
      return h;
    }
    var base = [[['l', 'r'], _('Sections')]];
    if (this.opts.xLabel) base.push([['x'], this.opts.xLabel]);
    if (this.sel && this.sel.dataset.dex) base.push([['y'], _('Add to favorites')]);
    base.push([['b'], _('Back')], [['a'], _('Open')]);
    return base;
  };

  /* ---------- содержимое листа покемона ---------- */
  function evoChain(p) {
    var members = D.dex.filter(function (x) { return x.ch === p.ch; });
    var depth = {};
    function dep(x) { if (depth[x.id] != null) return depth[x.id]; var f = D.dexById[x.from]; depth[x.id] = f && f.ch === x.ch ? dep(f) + 1 : 0; return depth[x.id]; }
    members.forEach(dep);
    var cols = [];
    members.forEach(function (x) { (cols[depth[x.id]] = cols[depth[x.id]] || []).push(x); });
    return cols;
  }

  /* вся линия эволюции по порядку стадий: [Пичу, Пикачу, Райчу] */
  function familyIds(id) {
    var p = D.dexById[id];
    if (!p) return [id];
    var ids = [];
    evoChain(p).forEach(function (col) { col.forEach(function (x) { ids.push(x.id); }); });
    return ids.length ? ids : [id];
  }

  var previewCards = [];
  /* 3–4 карточки покемона из разных лет: самая новая, самая старая и пара из середины */
  function previewRows(id) {
    var rows = D.rowsByDex(id), n = rows.length;
    if (n <= 4) return rows;
    return uniq([rows[0], rows[Math.round(n / 3)], rows[Math.round(n * 2 / 3)], rows[n - 1]]);
  }
  function dexSheet(id, list, extra) {
    var p = D.dexById[id];
    var g = GT[p.t[0]] || GT.normal;
    var cards = D.rowsByDex(id);
    previewCards = cards.length ? D.lights(previewRows(id)) : [];
    var region = Object.keys(PL.regionsRu).filter(function (k) { return PL.regionsRu[k].gen === p.gen && k !== 'hisui'; })[0];
    var stats = p.st.map(function (v, k) {
      return '<div class="stat"><span>' + STAT_RU[k] + '</span><b>' + v + '</b><i><em style="width:' + Math.min(100, v / 2.2) + '%"></em></i></div>';
    }).join('');
    var total = p.st.reduce(function (a, b) { return a + b; }, 0);
    var chain = evoChain(p);
    var evo = chain.length > 1 ? '<div class="sh-sub">' + _('Evolution') + '</div><div class="evo">' + chain.map(function (col, k) {
      return (k ? '<span class="evo-arrow">' + PL.icon('next') + '</span>' : '') + '<div class="evo-col">' + col.map(function (x) {
        return '<button class="evo-mon' + (x.id === id ? ' is-cur' : '') + '" data-act="dex" data-id="' + x.id + '" data-list="' + (list.indexOf(x.id) >= 0 ? list : familyIds(x.id)).join(',') + '"><img src="' + art(x.id) + '" alt="" loading="lazy"><span>' + esc(x.ru) + '</span></button>';
      }).join('') + '</div>';
    }).join('') + '</div>' : '';
    var badges = (p.leg ? '<span class="badge-l">' + _('Legendary') + '</span>' : '') + (p.myth ? '<span class="badge-l myth">' + _('Mythical') + '</span>' : '') + (p.baby ? '<span class="badge-l baby">' + _('Baby') + '</span>' : '');

    return '<div class="dex-sheet">' +
      '<div class="ds-art"><div class="ds-glow"></div><img src="' + art(id) + '" alt="' + esc(p.en) + '" draggable="false"><span class="ds-num">' + _('№') + pad3(id) + '</span>' +
        '<button class="fav-btn' + (PL.fav.has('dex', id) ? ' is-on' : '') + '" data-act="fav-dex" data-id="' + id + '">' + PL.icon('heart') + '<span>' + _('Favorites') + '</span></button></div>' +
      '<div class="ds-info">' +
        '<div class="ds-name"><b>' + esc(p.ru) + '</b>' + (p.ru === p.en ? '' : '<span>' + esc(p.en) + '</span>') + '</div>' +
        '<div class="ds-genus">' + esc(p.g) + (badges ? ' ' + badges : '') + '</div>' +
        '<div class="ds-types">' + p.t.map(typePill).join('') + '</div>' +
        (extra || '') +
        '<div class="ds-facts">' +
          '<div><span>' + _('Height') + '</span><b>' + _('{n} m', { n: (p.h / 10).toLocaleString(PL.loc) }) + '</b></div>' +
          '<div><span>' + _('Weight') + '</span><b>' + _('{n} kg', { n: (p.w / 10).toLocaleString(PL.loc) }) + '</b></div>' +
          '<div><span>' + _('Generation') + '</span><b>' + ROMAN[p.gen] + '</b></div>' +
          '<div><span>' + _('Region') + '</span><b>' + (region ? PL.regionsRu[region].ru : '—') + '</b></div>' +
        '</div>' +
        (p.fl ? '<p class="ds-flavor"><span>' + _('Pokédex entry') + '</span>' + esc(p.fl) + '</p>' : '') +
        '<div class="sh-sub">' + _('Base stats') + ' <em>' + _('total {n}', { n: total }) + '</em></div><div class="stats" style="--tc:' + g.c + '">' + stats + '</div>' +
        (p.ab.length ? '<div class="sh-sub">' + _('Abilities') + '</div><div class="abils">' + p.ab.map(function (a) { return '<span' + (a.h ? ' class="hid" title="' + _('Hidden Ability') + '"' : '') + '>' + esc(a.n) + (a.h ? ' · ' + _('hidden') : '') + '</span>'; }).join('') + '</div>' : '') +
        evo +
        (cards.length ? '<div class="sh-sub">' + _('Cards') + ' <em>' + cards.length + '</em></div><div class="mini-cards dex-cards">' + miniCards(previewCards) + '</div>' +
          '<button class="sh-btn" data-act="dex-cards" data-id="' + id + '" data-primary data-label="' + _('All cards') + '">' + PL.icon('album') + _('All {name} cards: {n}', { name: esc(p.ru), n: cards.length }) + '</button>' : '') +
      '</div></div>';
  }

  /* ================================================================== */
  /* ---------- Покедекс ---------- */
  function pokedex(root) {
    var gen = 0, query = '';
    var chips = '<button class="gi chip-f is-on" data-gen="0">' + _('All') + '</button>' + ROMAN.slice(1).map(function (r, k) { return '<button class="gi chip-f" data-gen="' + (k + 1) + '">' + r + '</button>'; }).join('');
    var sec = new Section(root, {
      head: '<div class="filters">' + chips + '</div><label class="search">' + PL.icon('search') + '<input type="search" placeholder="' + _('Name or number') + '" aria-label="' + _('Pokémon search') + '"></label><span class="sec-count"></span>',
      xLabel: _('Search'),
      onX: function () { var inp = root.querySelector('.search input'); inp.focus(); inp.select(); },
      onInput: function (v) { query = v.trim().toLowerCase(); render(); },
      onActivate: function (el) {
        if (el.dataset.gen != null) {
          gen = +el.dataset.gen;
          root.querySelectorAll('.chip-f').forEach(function (c) { c.classList.toggle('is-on', +c.dataset.gen === gen); });
          ctx.audio('select');
          render();
        }
      },
      onSelect: function (el) { if (el.dataset.dex) ctx.ambient((GT[D.dexById[+el.dataset.dex].t[0]] || GT.normal).c); },
    });
    function render() {
      var list = D.dex.filter(function (p) {
        if (gen && p.gen !== gen) return false;
        if (!query) return true;
        return p.ru.toLowerCase().indexOf(query) !== -1 || p.en.toLowerCase().indexOf(query) !== -1 || String(p.id) === query.replace(/^0+/, '');
      });
      sec.scroll.innerHTML = list.length ? '<div class="grid g-dex">' + list.map(function (p) { return dexTile(p); }).join('') + '</div>' : '<p class="empty">' + _('No Pokémon found.') + '</p>';
      root.querySelector('.sec-count').textContent = list.length + ' ' + _n(list.length, 'Pokémon|Pokémon');
      sec.scroll.scrollTop = 0;
    }
    render();
    sec.selectFirst();
    return sec;
  }

  /* ---------- Легенды и мифы: мифы мира · досье героев · интернет-теории · все легенды ---------- */
  function mythSheet(m) {
    var lead = D.dexById[m.lead];
    return '<div class="info-sheet">' +
      '<div class="is-art" style="--tc:' + m.c + '"><div class="ds-glow"></div><img src="' + art(m.lead) + '" alt=""><span class="is-cap">' + esc(lead.ru) + '</span></div>' +
      '<div class="is-body">' +
        '<div class="ds-name"><b>' + esc(m.title) + '</b><span>' + esc(m.kicker) + '</span></div>' +
        '<p class="is-text">' + esc(fillMons(m.text)) + '</p>' +
        '<div class="sh-sub">' + _('Heroes of the myth') + '</div>' + monRow(m.mons) +
        '<p class="ds-flavor"><span>' + _('Where it comes from') + '</span>' + esc(m.src) + '</p>' +
      '</div></div>';
  }
  function dossierExtra(id) {
    var d = (PL.dossiersRu || []).filter(function (x) { return x.id === id; })[0];
    return d ? '<div class="sh-sub">' + _('Dossier · {role}', { role: esc(d.role) }) + '</div><p class="is-text dossier">' + esc(fillMons(d.text)) + '</p>' : '';
  }
  function theoryCard(t, voted) {
    var k = PL.theoryKinds[t.kind] || PL.theoryKinds.fan;
    var v = voted[t.id];
    return '<div class="gi theory" data-theory="' + t.id + '" style="--kc:' + k.c + '">' +
      '<div class="th-top"><span class="th-kind">' + k.ru + '</span><b>' + esc(t.title) + '</b><i class="th-chev">' + PL.icon('next') + '</i></div>' +
      '<p class="th-teaser">' + esc(t.teaser) + '</p>' +
      '<div class="th-more">' +
        '<div class="th-block"><span>' + _('The story') + '</span><p>' + esc(fillMons(t.story)) + '</p></div>' +
        '<div class="th-block th-truth"><span>' + _('What we actually know') + '</span><p>' + esc(fillMons(t.truth)) + '</p></div>' +
        (t.mons && t.mons.length ? monRow(t.mons) : '') +
        '<div class="th-vote">' + _('What do you think?') +
          '<button data-act="vote" data-id="' + t.id + '" data-v="1" class="' + (v === 1 ? 'is-on' : '') + '">' + _('Believe') + '</button>' +
          '<button data-act="vote" data-id="' + t.id + '" data-v="0" class="' + (v === 0 ? 'is-on no' : '') + '">' + _('Doubt') + '</button>' +
        '</div>' +
      '</div></div>';
  }

  function legends(root) {
    var TABS_L = [['myths', _('World myths')], ['dossier', _('Dossiers')], ['theories', _('Theories')], ['all', _('All legends')]];
    var cur = takePref('legends') || 'myths', cardsOf = null;
    var leg = D.dex.filter(function (p) { return p.leg; }), myth = D.dex.filter(function (p) { return p.myth; });
    var voted = store('pl-votes', {});
    var HUM = PL.charactersRu || [];
    function humanCards(ch) {
      if (!cardsOf) {
        cardsOf = {};
        HUM.forEach(function (h) { cardsOf[h.id] = sortByDate((PL.tcgSupporters || []).filter(function (s) { return matchChar(h, s[1]); }).map(function (s) { return s[0]; })); });
      }
      return cardsOf[ch.id] || [];
    }
    var sec = new Section(root, {
      head: '<div class="filters">' + TABS_L.map(function (t, k) { return '<button class="gi chip-f' + (t[0] === cur ? ' is-on' : '') + '" data-ltab="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><span class="sec-count"></span>',
      dexExtra: dossierExtra,
      onSelect: function (el) {
        if (el.dataset.dex) ctx.ambient((GT[D.dexById[+el.dataset.dex].t[0]] || GT.normal).c);
        else if (el.dataset.myth) ctx.ambient(PL.mythsRu.filter(function (m) { return m.id === el.dataset.myth; })[0].c);
        else if (el.dataset.ch) ctx.ambient((GT[D.dexById[HUM[+el.dataset.ch].partner].t[0]] || GT.normal).c);
        else if (el.dataset.theory) ctx.ambient((PL.theoryKinds[PL.theoriesRu.filter(function (t) { return t.id === el.dataset.theory; })[0].kind] || {}).c || '#b28cff');
      },
      onActivate: function (el) {
        if (el.dataset.ltab) {
          cur = el.dataset.ltab;
          root.querySelectorAll('.chip-f').forEach(function (c) { c.classList.toggle('is-on', c.dataset.ltab === cur); });
          ctx.audio('select');
          return render();
        }
        if (el.dataset.myth) {
          ctx.audio('open');
          var ids = PL.mythsRu.map(function (m) { return m.id; });
          sec.sheetNav = { list: ids, i: ids.indexOf(el.dataset.myth), show: function (k) { sec.sheetNav.i = k; var m = PL.mythsRu[k]; sec.showSheet(mythSheet(m), m.c); } };
          return sec.sheetNav.show(sec.sheetNav.i);
        }
        if (el.dataset.ch != null && el.dataset.ch !== '') {
          ctx.audio('open');
          var idx = HUM.map(function (_, k) { return k; });
          sec.sheetNav = { list: idx, i: +el.dataset.ch, show: function (k) { sec.sheetNav.i = k; showChar(sec, HUM[k], humanCards(HUM[k])); } };
          return sec.sheetNav.show(sec.sheetNav.i);
        }
        if (el.dataset.theory) {
          el.classList.toggle('is-open');
          ctx.audio(el.classList.contains('is-open') ? 'select' : 'back');
          ensureVisible(sec.scroll, el);
        }
      },
      onAction: function (act, el) {
        if (act === 'vote') {
          var id = el.dataset.id, v = +el.dataset.v;
          if (voted[id] === v) delete voted[id]; else voted[id] = v;
          save('pl-votes', voted);
          ctx.audio('select');
          var row = el.parentNode;
          Array.prototype.forEach.call(row.children, function (b) { b.classList.remove('is-on', 'no'); });
          if (voted[id] != null) { el.classList.add('is-on'); if (!v) el.classList.add('no'); }
        }
      },
    });

    function count(n, w) { root.querySelector('.sec-count').textContent = n + ' ' + w; }
    function render() {
      sec.select(null);
      if (cur === 'myths') {
        sec.scroll.innerHTML = '<p class="grp-note">' + _('Eleven tales about how the Pokémon world works: from Arceus’s egg to the Paradox Pokémon of Paldea.') + '</p>' +
          '<div class="grid g-myth">' + PL.mythsRu.map(function (m) {
            return '<button class="gi mtile" data-myth="' + m.id + '" style="--rc:' + m.c + '"><img src="' + art(m.lead) + '" alt="" loading="lazy"><span class="mt-k">' + esc(m.kicker) + '</span><b>' + esc(m.title) + '</b></button>';
          }).join('') + '</div>';
        count(PL.mythsRu.length, _n(PL.mythsRu.length, 'myth|myths'));
      } else if (cur === 'dossier') {
        var dos = PL.dossiersRu;
        sec.scroll.innerHTML =
          '<h3 class="grp">' + _('Legends and main heroes') + ' <em>' + dos.length + '</em><span>' + _('Tap to read the dossier: lore, Pokédex, cards') + '</span></h3>' +
          '<div class="grid g-big">' + dos.map(function (d) { return dexTile(D.dexById[d.id], true).replace('</button>', '<span class="dt-role">' + esc(d.role) + '</span></button>'); }).join('') + '</div>' +
          '<h3 class="grp">' + _('People') + ' <em>' + HUM.length + '</em><span>' + _('Trainers, Gym Leaders, Champions and their partners') + '</span></h3>' +
          '<div class="grid g-char">' + HUM.map(function (ch, k) {
            var p = D.dexById[ch.partner], g = GT[p.t[0]] || GT.normal;
            return '<button class="gi ctile" data-ch="' + k + '" style="--tc:' + g.c + '"><img src="' + art(ch.partner) + '" alt="" loading="lazy"><b>' + esc(ch.ru) + '</b><span>' + esc(ch.role) + '</span></button>';
          }).join('') + '</div>';
        count(dos.length + HUM.length, _n(dos.length + HUM.length, 'dossier|dossiers'));
      } else if (cur === 'theories') {
        sec.scroll.innerHTML = '<p class="grp-note">' + _('What the internet is talking about: fan theories, urban legends and true stories. Each one is tagged as canon or fiction. Tap to expand it and say whether you believe it.') + '</p>' +
          '<div class="theories">' + PL.theoriesRu.map(function (t) { return theoryCard(t, voted); }).join('') + '</div>';
        count(PL.theoriesRu.length, _n(PL.theoriesRu.length, 'story|stories'));
      } else {
        sec.scroll.innerHTML =
          '<h3 class="grp">' + _('Legendary') + ' <em>' + leg.length + '</em><span>' + _('The rarest Pokémon, the ones regional myths are built around') + '</span></h3><div class="grid g-big">' + leg.map(function (p) { return dexTile(p, true); }).join('') + '</div>' +
          '<h3 class="grp">' + _('Mythical') + ' <em>' + myth.length + '</em><span>' + _('Almost impossible to find in a regular playthrough: special events only') + '</span></h3><div class="grid g-big">' + myth.map(function (p) { return dexTile(p, true); }).join('') + '</div>';
        count(leg.length + myth.length, _n(leg.length + myth.length, 'Pokémon|Pokémon'));
      }
      sec.scroll.scrollTop = 0;
      sec.select(sec.scroll.querySelector('.gi'), true);
    }
    render();
    return sec;
  }

  /* ---------- Регионы ---------- */
  function regions(root) {
    var keys = Object.keys(PL.regionsRu);
    var sec = new Section(root, {
      head: '<span class="sec-title">' + _('Regions of the Pokémon world') + '</span><span class="sec-count">' + keys.length + '</span>',
      onSelect: function (el) { if (el.dataset.region) ctx.ambient(PL.regionsRu[el.dataset.region].c); },
      onActivate: function (el) {
        if (!el.dataset.region) return;
        ctx.audio('open');
        sec.sheetNav = { list: keys, i: keys.indexOf(el.dataset.region), show: function (k) { sec.sheetNav.i = k; sec.showSheet(regionSheet(keys[k]), PL.regionsRu[keys[k]].c); } };
        sec.sheetNav.show(sec.sheetNav.i);
      },
    });
    sec.scroll.innerHTML = '<div class="grid g-region">' + keys.map(function (k) {
      var r = PL.regionsRu[k];
      return '<button class="gi rtile" data-region="' + k + '" style="--rc:' + r.c + '">' +
        '<img class="rt-leg" src="' + art(r.legends[0]) + '" alt="" loading="lazy">' +
        '<span class="rt-gen">' + _('Generation {n}', { n: ROMAN[r.gen] }) + '</span><b>' + r.ru + '</b>' +
        '<span class="rt-st">' + r.starters.map(function (s) { return '<img src="' + art(s) + '" alt="" loading="lazy">'; }).join('') + '</span></button>';
    }).join('') + '</div>';
    sec.selectFirst();
    return sec;
  }
  function monRow(ids, list) {
    return '<div class="mon-row">' + ids.map(function (id) {
      var p = D.dexById[id];
      return '<button class="mon" data-act="dex" data-id="' + id + '" data-list="' + (list || ids).join(',') + '"><img src="' + art(id) + '" alt="" loading="lazy"><span>' + esc(p.ru) + '</span></button>';
    }).join('') + '</div>';
  }
  function regionSheet(k) {
    var r = PL.regionsRu[k];
    var g = (PL.world.generations || []).filter(function (x) { return x.id === r.gen; })[0] || { games: [] };
    var natives = k === 'hisui' ? [] : D.dex.filter(function (p) { return p.gen === r.gen; }).map(function (p) { return p.id; });
    return '<div class="info-sheet">' +
      '<div class="is-art"><div class="ds-glow"></div><img src="' + art(r.legends[0]) + '" alt=""><span class="is-cap">' + esc(D.dexById[r.legends[0]].ru) + '</span></div>' +
      '<div class="is-body">' +
        '<div class="ds-name"><b>' + r.ru + '</b><span>' + _('Generation {n}', { n: ROMAN[r.gen] }) + '</span></div>' +
        '<p class="is-text">' + esc(r.text) + '</p>' +
        '<div class="sh-sub">' + _('Starter Pokémon') + '</div>' + monRow(r.starters) +
        '<div class="sh-sub">' + _('Legends of the region') + '</div>' + monRow(r.legends) +
        (g.games.length ? '<div class="sh-sub">' + _('Games') + '</div><div class="abils">' + uniq(g.games).map(function (x) { return '<span>Pokémon ' + esc(x) + '</span>'; }).join('') + '</div>' : '') +
        (natives.length ? '<div class="sh-sub">' + _('Pokémon of the region') + ' <em>' + natives.length + '</em></div><div class="grid g-mini">' + natives.map(function (id) { var p = D.dexById[id]; return '<button class="mini" data-act="dex" data-id="' + id + '" data-list="' + natives.join(',') + '" title="' + esc(p.ru) + '"><img src="' + art(id) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>' : '') +
      '</div></div>';
  }

  /* ---------- Типы ---------- */
  function types(root) {
    var order = PL.gameTypeOrder;
    var count = {};
    D.dex.forEach(function (p) { p.t.forEach(function (t) { count[t] = (count[t] || 0) + 1; }); });
    var sec = new Section(root, {
      head: '<span class="sec-title">' + _('18 types and their strengths and weaknesses') + '</span>',
      onSelect: function (el) { if (el.dataset.type) ctx.ambient(GT[el.dataset.type].c); },
      onActivate: function (el) {
        if (!el.dataset.type) return;
        ctx.audio('open');
        sec.sheetNav = { list: order, i: order.indexOf(el.dataset.type), show: function (k) { sec.sheetNav.i = k; sec.showSheet(typeSheet(order[k]), GT[order[k]].c); } };
        sec.sheetNav.show(sec.sheetNav.i);
      },
    });
    sec.scroll.innerHTML = '<div class="grid g-type">' + order.map(function (t) {
      var g = GT[t];
      return '<button class="gi ttile" data-type="' + t + '" style="--tc:' + g.c + '">' + PL.icon(g.icon) + '<b>' + g.ru + '</b><span>' + (count[t] || 0) + ' ' + _n(count[t] || 0, 'Pokémon|Pokémon') + '</span></button>';
    }).join('') + '</div>';
    sec.selectFirst();
    return sec;
  }
  function typeSheet(t) {
    var order = PL.gameTypeOrder, chart = PL.typeChart || {};
    var ti = order.indexOf(t) + 1;
    var atk = chart[ti] || {};
    var groups = { 2: [], 0.5: [], 0: [] }, defg = { 2: [], 0.5: [], 0: [] };
    order.forEach(function (o, k) {
      var f = atk[k + 1]; if (f !== 1 && groups[f]) groups[f].push(o);
      var df = (chart[k + 1] || {})[ti]; if (df !== 1 && defg[df]) defg[df].push(o);
    });
    function row(label, list, note) { return '<div class="eff"><span class="eff-l">' + label + '</span><div>' + (list.length ? list.map(typePill).join('') : '<em class="none">—</em>') + '</div>' + (note ? '<i>' + note + '</i>' : '') + '</div>'; }
    var mons = D.dex.filter(function (p) { return p.t.indexOf(t) !== -1; }).map(function (p) { return p.id; });
    var g = GT[t];
    return '<div class="info-sheet">' +
      '<div class="is-art type-art" style="--tc:' + g.c + '"><div class="ds-glow"></div>' + PL.icon(g.icon) + '<span class="is-cap">' + g.ru + '</span></div>' +
      '<div class="is-body">' +
        '<div class="ds-name"><b>' + _('{type} type', { type: g.ru }) + '</b><span>' + mons.length + ' ' + _n(mons.length, 'Pokémon|Pokémon') + '</span></div>' +
        '<div class="sh-sub">' + _('Attacks of this type') + '</div>' +
        row(_('×2 vs'), groups[2], _('super effective')) + row(_('×½ vs'), groups[0.5], _('not very effective')) + row(_('×0 vs'), groups[0], _('no effect')) +
        '<div class="sh-sub">' + _('Defense of a Pokémon of this type') + '</div>' +
        row(_('×2 from'), defg[2], _('weak')) + row(_('×½ from'), defg[0.5], _('resists')) + row(_('×0 from'), defg[0], _('immune')) +
        '<div class="sh-sub">' + _('Pokémon of this type') + ' <em>' + mons.length + '</em></div><div class="grid g-mini">' + mons.map(function (id) { var p = D.dexById[id]; return '<button class="mini" data-act="dex" data-id="' + id + '" data-list="' + mons.join(',') + '" title="' + esc(p.ru) + '"><img src="' + art(id) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>' +
      '</div></div>';
  }

  /* ---------- Хронология ---------- */
  function timeline(root) {
    var gens = (PL.world.generations || []).slice().sort(function (a, b) { return a.id - b.id; });
    var series = {};
    D.sets.forEach(function (s) { if (!series[s.se] || s.d < series[s.se].d) series[s.se] = { name: s.se, d: s.d, sets: 0, cards: 0 }; });
    D.sets.forEach(function (s) { series[s.se].sets++; series[s.se].cards += s.c || 0; });
    var events = gens.map(function (g) { return { kind: 'gen', year: PL.generationsRu[g.id].year, g: g }; })
      .concat(Object.keys(series).map(function (k) { return { kind: 'tcg', year: +series[k].d.slice(0, 4), s: series[k] }; }))
      .sort(function (a, b) { return a.year - b.year || (a.kind === 'gen' ? -1 : 1); });
    var sec = new Section(root, {
      head: '<span class="sec-title">' + _('Timeline of the games and the Trading Card Game') + '</span><span class="sec-count">1996 — ' + new Date().getFullYear() + '</span>',
      onSelect: function (el) { if (el.dataset.gen) { var r = regionOfGen(+el.dataset.gen); ctx.ambient(r ? r.c : '#6b7280'); } },
      onActivate: function (el) {
        if (!el.dataset.gen) return;
        ctx.audio('open');
        var ids = gens.map(function (g) { return g.id; });
        sec.sheetNav = { list: ids, i: ids.indexOf(+el.dataset.gen), show: function (k) { sec.sheetNav.i = k; var r = regionOfGen(ids[k]); sec.showSheet(genSheet(gens[k]), r ? r.c : '#6b7280'); } };
        sec.sheetNav.show(sec.sheetNav.i);
      },
    });
    sec.scroll.innerHTML = '<div class="tl">' + events.map(function (e) {
      if (e.kind === 'tcg') return '<div class="tl-row tl-tcg"><span class="tl-year">' + e.year + '</span><span class="tl-dot"></span><div class="tl-tcg-card">' + PL.icon('album') + '<b>' + _('Trading Card Game: {name} series', { name: esc(e.s.name) }) + '</b><span>' + e.s.sets + ' ' + _n(e.s.sets, 'set|sets') + ' · ' + e.s.cards + ' ' + _n(e.s.cards, 'card|cards') + '</span></div></div>';
      var g = e.g, info = PL.generationsRu[g.id], r = regionOfGen(g.id);
      return '<div class="tl-row"><span class="tl-year">' + e.year + '</span><span class="tl-dot" style="--rc:' + (r ? r.c : '#888') + '"></span>' +
        '<button class="gi tl-gen" data-gen="' + g.id + '" style="--rc:' + (r ? r.c : '#888') + '">' +
          '<span class="tl-roman">' + ROMAN[g.id] + '</span>' +
          '<div class="tl-mid"><b>' + _('Generation {n}', { n: ROMAN[g.id] }) + ' · ' + (r ? r.ru : '') + '</b><p>' + esc(info.text) + '</p><span class="tl-games">' + uniq(g.games).slice(0, 6).map(esc).join(' · ') + '</span></div>' +
          '<span class="tl-mascots">' + info.mascots.map(function (m) { return '<img src="' + art(m) + '" alt="" loading="lazy">'; }).join('') + '</span>' +
          '<em class="tl-count">+' + g.count + '</em>' +
        '</button></div>';
    }).join('') + '</div>';
    sec.selectFirst();
    return sec;
  }
  function regionOfGen(gen) { var k = Object.keys(PL.regionsRu).filter(function (x) { return PL.regionsRu[x].gen === gen && x !== 'hisui'; })[0]; return k ? PL.regionsRu[k] : null; }
  function genSheet(g) {
    var info = PL.generationsRu[g.id], r = regionOfGen(g.id);
    var ids = D.dex.filter(function (p) { return p.gen === g.id; }).map(function (p) { return p.id; });
    return '<div class="info-sheet">' +
      '<div class="is-art"><div class="ds-glow"></div><img src="' + art(info.mascots[0]) + '" alt=""><span class="is-cap">' + info.year + '</span></div>' +
      '<div class="is-body">' +
        '<div class="ds-name"><b>' + _('Generation {n}', { n: ROMAN[g.id] }) + '</b><span>' + info.year + ' · ' + (r ? r.ru : '') + '</span></div>' +
        '<p class="is-text">' + esc(info.text) + '</p>' +
        '<div class="sh-sub">' + _('Games') + '</div><div class="abils">' + uniq(g.games).map(function (x) { return '<span>Pokémon ' + esc(x) + '</span>'; }).join('') + '</div>' +
        '<div class="sh-sub">' + _('New Pokémon') + ' <em>' + ids.length + '</em></div><div class="grid g-mini">' + ids.map(function (id) { var p = D.dexById[id]; return '<button class="mini" data-act="dex" data-id="' + id + '" data-list="' + ids.join(',') + '" title="' + esc(p.ru) + '"><img src="' + art(id) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>' +
      '</div></div>';
  }

  /* ---------- Персонажи (теперь внутри «Легенд и мифов» → «Досье») ---------- */
  function matchChar(ch, name) {
    return ch.match.some(function (m) {
      return name === m || name.indexOf(m + "'s ") === 0 || name.indexOf(m + ' (') === 0 || name.indexOf('(' + m + ')') !== -1 || name.indexOf(m + ' & ') === 0 || name.indexOf(' & ' + m) !== -1 ||
        (m.length > 2 && name.indexOf(m + ' ') === 0 && !/^[A-Z][a-z]+'s/.test(name.slice(m.length + 1)));
    });
  }
  function showChar(sec, ch, ids) {
    var p = D.dexById[ch.partner], g = GT[p.t[0]] || GT.normal;
    sec.cardList = [];
    sec.showSheet('<div class="info-sheet">' +
      '<div class="is-art"><div class="ds-glow"></div><img src="' + art(ch.partner) + '" alt=""><span class="is-cap">' + _('Partner: {name}', { name: esc(p.ru) }) + '</span></div>' +
      '<div class="is-body">' +
        '<div class="ds-name"><b>' + esc(ch.ru) + '</b><span>' + esc(ch.role) + '</span></div>' +
        '<p class="is-text">' + esc(ch.bio) + '</p>' +
        '<div class="sh-sub">' + _('Partner') + '</div>' + monRow([ch.partner]) +
        '<div class="sh-sub">' + _('Character cards') + ' <em>' + ids.length + '</em></div><div class="mini-cards" data-cards>' + (ids.length ? '<p class="empty">' + _('Loading cards…') + '</p>' : '<p class="empty">' + _('No cards feature this character.') + '</p>') + '</div>' +
      '</div></div>', g.c);
    if (ids.length) {
      sec.cardList = D.lightsByIds(ids);
      var box = sec.sheet.querySelector('[data-cards]');
      if (box) box.innerHTML = miniCards(sec.cardList);
    }
  }
  function miniCards(cards) {
    return cards.map(function (c, i) { return '<button class="mcard" data-act="card" data-i="' + i + '" title="' + esc(c.en + ' · ' + c.set) + '"><span class="mc-in">' + PL.tcg.html(c) + '</span></button>'; }).join('');
  }

  /* ---------- Предметы ---------- */
  function items(root) {
    var groups = Object.keys(PL.itemGroupsRu);
    var grp = groups[0];
    var all = (PL.world.items || []);
    var sec = new Section(root, {
      head: '<div class="filters">' + groups.map(function (g, k) { return '<button class="gi chip-f' + (k ? '' : ' is-on') + '" data-grp="' + g + '">' + PL.itemGroupsRu[g].ru + '</button>'; }).join('') + '</div><span class="sec-count"></span>',
      onActivate: function (el) {
        if (el.dataset.grp) {
          grp = el.dataset.grp;
          root.querySelectorAll('.chip-f').forEach(function (c) { c.classList.toggle('is-on', c.dataset.grp === grp); });
          ctx.audio('select');
          return render();
        }
        if (el.dataset.item) {
          ctx.audio('open');
          var list = Array.prototype.map.call(sec.scroll.querySelectorAll('[data-item]'), function (e) { return +e.dataset.item; });
          sec.sheetNav = { list: list, i: list.indexOf(+el.dataset.item), show: function (k) { sec.sheetNav.i = k; sec.showSheet(itemSheet(all.filter(function (x) { return x.id === list[k]; })[0]), '#b28cff'); } };
          sec.sheetNav.show(sec.sheetNav.i);
        }
      },
    });
    function render() {
      var list = all.filter(function (x) { return x.grp === grp; });
      sec.scroll.innerHTML = '<p class="grp-note">' + esc(PL.itemGroupsRu[grp].text) + '</p><div class="grid g-item">' + list.map(function (it) {
        return '<button class="gi itile" data-item="' + it.id + '"><img src="' + PL.img.item(it.k) + '" alt="" loading="lazy"><b>' + esc(it.n) + '</b></button>';
      }).join('') + '</div>';
      root.querySelector('.sec-count').textContent = list.length;
      sec.scroll.scrollTop = 0;
    }
    render();
    sec.selectFirst();
    return sec;
  }
  function itemSheet(it) {
    return '<div class="info-sheet">' +
      '<div class="is-art item-art"><div class="ds-glow"></div><img src="' + PL.img.item(it.k) + '" alt=""></div>' +
      '<div class="is-body">' +
        '<div class="ds-name"><b>' + esc(it.n) + '</b><span>' + PL.itemGroupsRu[it.grp].ru + '</span></div>' +
        '<p class="is-text">' + esc(PL.itemGroupsRu[it.grp].text) + '</p>' +
        (it.fl ? '<p class="ds-flavor"><span>' + _('In-game description') + '</span>' + esc(it.fl) + '</p>' : '') +
      '</div></div>';
  }

  /* ---------- Новости: хронология за год ---------- */
  var MONTHS_N = [_('January'), _('February'), _('March'), _('April'), _('May'), _('June'), _('July'), _('August'), _('September'), _('October'), _('November'), _('December')];
  var NK = { game: [_('Game'), '#7dffaa'], tcg: [_('Cards'), '#ffd27a'], event: [_('Event'), '#b28cff'], live: [_('Online'), '#5ee0f6'], anime: [_('Anime'), '#ff7eb8'], merch: [_('Merch'), '#ff9a4a'] };
  var NF = [['all', _('All')], ['game', _('Games')], ['tcg', _('Cards')], ['event', _('Events')], ['live', _('Online')], ['words', _('Creators’ words')]];

  function news(root) {
    var f = 'all', games = null, status = { local: 'ok', tcg: 'load', games: 'load', live: 'load' };
    var remote = { tcg: null, live: null };
    var today = PL.news.iso(new Date()), from = PL.news.sinceIso(366);

    var sec = new Section(root, {
      head: '<div class="filters">' + NF.map(function (c, k) { return '<button class="gi chip-f' + (k ? '' : ' is-on') + '" data-nf="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div><span class="sec-count"></span>',
      xLabel: _('Refresh'),
      onX: function () { ctx.audio('select'); ctx.toast(_('Refreshing news…')); fetchNews(true); },
      onSelect: function (el) { if (el.dataset.nk) ctx.ambient((NK[el.dataset.nk] || NK.event)[1]); },
      onActivate: function (el) {
        if (el.dataset.nf) {
          f = el.dataset.nf;
          root.querySelectorAll('.chip-f').forEach(function (c) { c.classList.toggle('is-on', c.dataset.nf === f); });
          ctx.audio('select');
          return render();
        }
        if (el.dataset.url) { ctx.audio('open'); window.open(el.dataset.url, '_blank', 'noopener'); return; }
        if (el.dataset.mon) { ctx.audio('open'); return sec.openDex(+el.dataset.mon, [+el.dataset.mon]); }
        ctx.audio('click');
      },
    });

    function allItems() {
      var out = [], have = {};
      var local = (PL.tcgSets || []).filter(function (s) { return s.d >= from; });
      local.forEach(function (s) {
        have[s.id] = 1;
        out.push({ d: s.d, k: 'tcg', t: _('Card set “{name}”', { name: s.n }), x: _('{count} · {series} series', { count: s.c + ' ' + _n(s.c, 'card|cards'), series: s.se }), mons: [] });
      });
      (remote.tcg || []).forEach(function (s) {
        if (have[s.id] || !s.isNew) return;
        out.push({ d: s.d, k: 'tcg', t: _('Card set “{name}”', { name: s.n }), x: s.c ? _('{count} · {series} series · via API', { count: s.c + ' ' + _n(s.c, 'card|cards'), series: s.se }) : _('{series} series · via API', { series: s.se }), mons: [], live: 1 });
      });
      PL.newsCurated.forEach(function (n) { if (n.d >= from) out.push({ d: n.d, k: n.k, t: n.t, x: n.x, mons: n.mons || [], soft: n.soft }); });
      (remote.live || []).forEach(function (a) { if (a.d >= from) out.push({ d: a.d, k: 'live', t: a.t, x: a.dom, url: a.url, mons: [] }); });
      return out;
    }

    function row(n, i) {
      var k = NK[n.k] || NK.event;
      var cls = 'gi nw' + (n.url ? ' has-url' : '');
      var attrs = ' data-nk="' + n.k + '"' + (n.url ? ' data-url="' + esc(n.url) + '"' : '') + (n.mons && n.mons[0] && !n.url ? ' data-mon="' + n.mons[0] + '"' : '');
      var dd = n.d.slice(8, 10) + '.' + n.d.slice(5, 7);
      var soon = n.d > today ? '<em class="nw-soon">' + _('soon') + '</em>' : '';
      return '<div class="tl-row nw-row"><span class="tl-year">' + dd + '</span><span class="tl-dot" style="--rc:' + k[1] + '"></span>' +
        '<div class="' + cls + '"' + attrs + ' style="--kc:' + k[1] + '">' +
          '<div class="nw-top"><span class="nw-kind">' + k[0] + '</span>' + soon + (n.live ? '<em class="nw-api">API</em>' : '') + (n.soft ? '<em class="nw-api">' + _('verify') + '</em>' : '') + '</div>' +
          '<b>' + esc(n.t) + '</b>' + (n.x ? '<p>' + esc(n.x) + '</p>' : '') +
          (n.mons && n.mons.length ? '<span class="nw-mons">' + n.mons.slice(0, 4).map(function (id) { return '<img src="' + art(id) + '" alt="" loading="lazy">'; }).join('') + '</span>' : '') +
          (n.url ? '<i class="nw-open">' + PL.icon('next') + '</i>' : '') +
        '</div></div>';
    }

    function srcBar() {
      var names = { local: _('archive'), tcg: 'pokemon-tcg-data', games: 'PokéAPI', live: _('GDELT (media)') };
      return '<div class="nw-src"><span>' + _('Sources:') + '</span>' + Object.keys(names).map(function (k) {
        return '<i class="' + status[k] + '" title="' + (status[k] === 'ok' ? _('connected') : status[k] === 'load' ? _('loading…') : _('no response')) + '">' + names[k] + '</i>';
      }).join('') + '</div>';
    }

    function render() {
      var html = '', list = [], total = 0;
      if (f === 'words') {
        html = '<p class="grp-note">' + _('The series’ creators in their own words, paraphrased from public interviews and developer talks, with no invented quotes.') + '</p><div class="words">' + PL.creatorsRu.map(function (w) {
          return '<div class="gi word"><span class="wd-q">' + _('«') + '</span><p>' + esc(fillMons(w.text)) + '</p><b>' + esc(w.who) + '</b><span>' + esc(w.role) + ' · ' + esc(w.src) + '</span></div>';
        }).join('') + '</div>';
        total = PL.creatorsRu.length;
      } else {
        list = allItems().filter(function (n) { return f === 'all' || n.k === f; }).sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
        total = list.length;
        var cur = '';
        html = '<p class="grp-note">' + _('Timeline for the past year: {from} — {to}. Games and events are hand-picked, card sets come from the data, and the latest news is pulled from the web.', { from: from.split('-').reverse().join('.'), to: today.split('-').reverse().join('.') }) + '</p>' + srcBar();
        if (games && games.length && (f === 'all' || f === 'game')) {
          html += '<div class="nw-games"><span>' + _('Latest games in the PokéAPI database') + '</span>' + games.map(function (g) { return '<b>' + esc(g.ru) + '</b>'; }).join('') + '</div>';
        }
        html += '<div class="tl nw-tl">';
        list.forEach(function (n) {
          var m = n.d.slice(0, 7);
          if (m !== cur) { cur = m; html += '<h4 class="nw-month">' + MONTHS_N[+n.d.slice(5, 7) - 1] + ' ' + n.d.slice(0, 4) + '</h4>'; }
          html += row(n);
        });
        html += '</div>';
        if (!list.length) html += '<p class="empty">' + _('Nothing in this category for the past year.') + '</p>';
        if (status.live === 'fail' && (f === 'all' || f === 'live')) html += '<p class="grp-note">' + _('Online headlines failed to load: no internet connection, or the service did not respond. The archive and editorial milestones work offline.') + '</p>';
      }
      sec.scroll.innerHTML = html;
      root.querySelector('.sec-count').textContent = total + '';
      var keep = sec.sel && sec.scroll.contains(sec.sel) ? null : sec.scroll.querySelector('.gi');
      if (keep || !sec.sel) sec.select(sec.scroll.querySelector('.gi'), true);
    }

    function fetchNews(force) {
      status.tcg = status.games = status.live = 'load';
      render();
      PL.news.load(force, function (e) {
        status[e.src] = e.ok ? 'ok' : 'fail';
        if (e.ok) { if (e.src === 'tcg') remote.tcg = e.data; else if (e.src === 'live') remote.live = e.data; else if (e.src === 'games') games = e.data; }
        if (document.body.contains(root) && root.isConnected) { var y = sec.scroll.scrollTop; render(); sec.scroll.scrollTop = y; }
      });
    }
    render();
    fetchNews(false);
    return sec;
  }

  /* ---------- Избранное: покемоны · карточки · снимки экрана ---------- */
  function shotDate(t) { var d = new Date(t); return d.toLocaleDateString(PL.loc, { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(PL.loc, { hour: '2-digit', minute: '2-digit' }); }
  function shotSheet(s) {
    return '<div class="shot-sheet"><div class="ss-img"><img src="' + s.url + '" alt="' + _('Screenshot') + '"></div>' +
      '<div class="ss-info"><div class="ds-name"><b>' + esc(s.title) + '</b><span>' + esc(s.sub || '') + '</span></div>' +
      '<p class="is-text">' + shotDate(s.t) + (s.fallback ? '. ' + _('Simplified screenshot: the full screen could not be captured.') : '') + '</p>' +
      '<div class="ss-btns"><button class="sh-btn" data-act="shot-dl" data-id="' + s.id + '" data-primary data-label="' + _('Download') + '">' + PL.icon('album') + _('Download') + '</button>' +
      '<button class="sh-btn danger" data-act="shot-del" data-id="' + s.id + '" data-secondary data-label="' + _('Delete') + '">' + PL.icon('close') + _('Delete') + '</button></div></div></div>';
  }
  function favorites(root) {
    var sec = new Section(root, {
      head: '<span class="sec-title">' + _('Favorites') + '</span><span class="sec-count"></span>',
      onSelect: function (el) { if (el.dataset.dex) ctx.ambient((GT[D.dexById[+el.dataset.dex].t[0]] || GT.normal).c); },
      onActivate: function (el) {
        if (el.dataset.mi != null) { var mc = mineList[+el.dataset.mi]; if (mc) { ctx.audio('open'); ctx.openCards(mineList, +el.dataset.mi); } return; }
        if (el.dataset.scan) return ctx.openScan && ctx.openScan();
        if (el.dataset.i != null && el.dataset.i !== '' && !el.dataset.shot) return sec.openCardFrom(el);
        if (el.dataset.shot) {
          ctx.audio('open');
          var ids = PL.shot.list().map(function (x) { return x.id; });
          sec.sheetNav = { list: ids, i: ids.indexOf(el.dataset.shot), show: function (k) { sec.sheetNav.i = k; var sh = PL.shot.list().filter(function (x) { return x.id === ids[k]; })[0]; if (sh) sec.showSheet(shotSheet(sh), '#5ee0f6'); } };
          sec.sheetNav.show(sec.sheetNav.i);
        }
      },
      onAction: function (act, el) {
        if (act === 'shot-dl') { PL.shot.download(el.dataset.id); ctx.toast(_('Downloading screenshot')); }
        if (act === 'shot-del') {
          var id = el.dataset.id;
          PL.shot.remove(id).then(function () { sec.closeSheet(); ctx.toast(_('Screenshot deleted')); ctx.favChanged(); draw(); });
        }
      },
    });
    var dexIds = PL.fav.list('dex'), cardIds = PL.fav.list('cards'), mineList = [];
    sec.cardList = cardIds.length ? D.lightsByIds(cardIds) : [];
    function drawMine() {
      var host = sec.scroll.querySelector('[data-mine]');
      if (!host) return;
      host.innerHTML = (mineList.length ? mineList.map(function (c, i) { return '<button class="gi mcard" data-mi="' + i + '"><span class="mc-in">' + PL.tcg.html(c) + '</span></button>'; }).join('') : '') +
        '<button class="gi mcard mc-add" data-scan="1"><span class="mc-in"><b>' + PL.icon('scan') + '</b><em>' + _('Scan card').replace(' ', '<br>') + '</em></span></button>';
      var hh = sec.scroll.querySelector('.grp-mine em'); if (hh) hh.textContent = mineList.length;
      root.querySelector('.sec-count').textContent = (dexIds.length + cardIds.length + PL.shot.list().length + mineList.length) + '';
    }
    function draw() {
      var shots = PL.shot.list();
      root.querySelector('.sec-count').textContent = (dexIds.length + cardIds.length + shots.length + mineList.length) + '';
      var host = sec.scroll.querySelector('[data-shots]');
      if (!host) return;
      host.innerHTML = shots.length ? '<div class="grid g-shots">' + shots.map(function (s) {
        return '<button class="gi shot" data-shot="' + s.id + '"><img src="' + s.url + '" alt="" loading="lazy"><span>' + esc(s.title) + (s.sub ? ' · ' + esc(s.sub) : '') + '</span></button>';
      }).join('') + '</div>' : '<p class="empty">' + _('Nothing here yet. Press ◉ on the left Joy-Con (key C) anywhere and the screenshot will show up here.') + '</p>';
      var hh = sec.scroll.querySelector('.grp-shots em'); if (hh) hh.textContent = shots.length;
    }
    sec.scroll.innerHTML =
      '<h3 class="grp">' + _('Pokémon') + ' <em>' + dexIds.length + '</em><span>' + _('Heart on a Pokémon card or the Y button: a Poké Ball will catch the Pokémon') + '</span></h3>' +
      (dexIds.length ? '<div class="grid g-dex">' + dexIds.map(function (id) { return dexTile(D.dexById[id]); }).join('') + '</div>' : '<p class="empty">' + _('Nothing here yet. Open the Pokédex and mark your favorite Pokémon.') + '</p>') +
      '<h3 class="grp">' + _('Cards') + ' <em>' + cardIds.length + '</em><span>' + _('Heart in the card window or the Y button') + '</span></h3>' +
      '<div class="mini-cards fav-cards" data-cards>' + (cardIds.length ? '<p class="empty">' + _('Loading cards…') + '</p>' : '<p class="empty">' + _('Nothing here yet. Open the Album, pull out a card and tap the heart.') + '</p>') + '</div>' +
      '<h3 class="grp grp-mine">' + _('My collection') + ' <em>0</em><span>' + _('Cards you scanned or uploaded from your device') + '</span></h3><div class="mini-cards fav-cards" data-mine></div>' +
      '<h3 class="grp grp-shots">' + _('Screenshots') + ' <em>0</em><span>' + _('The ◉ button on the Joy-Con captures what is on the screen') + '</span></h3><div data-shots></div>';
    if (cardIds.length) {
      sec.scroll.querySelector('[data-cards]').innerHTML = sec.cardList.map(function (c, i) { return '<button class="gi mcard" data-i="' + i + '"><span class="mc-in">' + PL.tcg.html(c) + '</span></button>'; }).join('');
    }
    draw();
    drawMine();
    PL.mine.cards().then(function (l) { mineList = l; if (root.isConnected) drawMine(); });
    PL.shot.ready().then(function () { if (root.isConnected && sec.scroll.querySelector('[data-shots]')) draw(); });
    sec.select(sec.scroll.querySelector('.gi'), true);
    sec.scroll.scrollTop = 0;
    return sec;
  }

  var BUILDERS = { regions: regions, pokedex: pokedex, legends: legends, types: types, timeline: timeline, items: items, news: news, favorites: favorites };

  return {
    setContext: function (c) { ctx = c; },
    prefer: function (id, tab) { if (tab) pref[id] = tab; },
    mount: function (id, root) {
      if (current && current.destroy) current.destroy();
      current = BUILDERS[id] ? BUILDERS[id](root) : null;
      return current;
    },
    navMove: navMove,
    ensureVisible: ensureVisible,
  };
})();
