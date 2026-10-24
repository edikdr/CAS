/* ==========================================================================
   Доступ к данным.
   • Индекс ВСЕХ карточек (data/tcg/index.js, ~0,7 МБ) лежит в архиве: по нему работают
     поиск, фильтры и «все карточки» — без запросов, «лёгкие» карточки (имя, тип, номер).
   • Полные данные карточки (атаки, слабость…) грузятся из API при открытии:
     jsDelivr / GitHub (pokemon-tcg-data), по одному набору за раз. Если данные набора
     есть локально (build-data.mjs --cache-sets), берутся они.
   • Избранное хранится в браузере.
   ========================================================================== */
window.PL = window.PL || {};

(function () {
  var meta = PL.dataMeta || {};
  var LOCAL_SETS = !!(meta.local && meta.local.sets);
  var CDN = [
    'https://cdn.jsdelivr.net/gh/PokemonTCG/pokemon-tcg-data@master/cards/en/',
    'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/',
  ];
  var cache = {}, loading = {};

  /* вызывается из data/tcg/sets/<id>.js (только при локальном кэше) */
  PL.tcgSet = function (id, cards) { cache[id] = cards; };

  /* сырая карточка pokemon-tcg-data → компактный вид (как в data/tcg/sets/*.js) */
  var T = { Grass: 'grass', Fire: 'fire', Water: 'water', Lightning: 'lightning', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'dark', Metal: 'steel', Dragon: 'dragon', Fairy: 'fairy', Colorless: 'colorless' };
  function tt(x) { return T[x] || 'colorless'; }
  function compactRaw(c) {
    var o = { i: c.id.slice(c.id.indexOf('-') + 1), n: c.name, s: c.supertype === 'Pokémon' ? 'P' : c.supertype === 'Trainer' ? 'T' : 'E' };
    if (c.subtypes && c.subtypes.length) o.sb = c.subtypes;
    if (c.hp) o.hp = +c.hp || c.hp;
    if (c.types && c.types.length) o.t = c.types.map(tt);
    if (c.evolvesFrom) o.ef = c.evolvesFrom;
    if (c.abilities && c.abilities.length) o.ab = c.abilities.map(function (a) { return [a.name, a.text || '', a.type || '']; });
    if (c.attacks && c.attacks.length) o.at = c.attacks.map(function (a) { return [a.name, (a.cost || []).map(tt), a.damage || '', a.text || '']; });
    if (c.weaknesses && c.weaknesses.length) o.wk = c.weaknesses.map(function (w) { return [tt(w.type), w.value]; });
    if (c.resistances && c.resistances.length) o.rs = c.resistances.map(function (w) { return [tt(w.type), w.value]; });
    if (c.convertedRetreatCost) o.rt = c.convertedRetreatCost;
    if (c.rules && c.rules.length) o.ru = c.rules;
    if (c.artist) o.ar = c.artist;
    if (c.rarity) o.ra = c.rarity;
    if (c.flavorText) o.fl = c.flavorText;
    if (c.nationalPokedexNumbers && c.nationalPokedexNumbers.length) o.d = c.nationalPokedexNumbers;
    if (c.images && c.images.small) o.im = [c.images.small, c.images.large || c.images.small];
    return o;
  }

  function fetchJSON(url) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = ctl && setTimeout(function () { ctl.abort(); }, 20000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (t) clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function fromCDN(id) {
    return fetchJSON(CDN[0] + encodeURIComponent(id) + '.json').catch(function () { return fetchJSON(CDN[1] + encodeURIComponent(id) + '.json'); })
      .then(function (raw) { return raw.map(compactRaw); });
  }
  function fromLocal(id) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'data/tcg/sets/' + id + '.js';
      s.onload = function () { cache[id] ? res(cache[id]) : rej(new Error(_('empty'))); };
      s.onerror = function () { rej(new Error(_('no local set'))); };
      document.head.appendChild(s);
    });
  }
  function loadSet(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    if (loading[id]) return loading[id];
    var p = (LOCAL_SETS ? fromLocal(id).catch(function () { return fromCDN(id); }) : fromCDN(id)).then(function (cards) {
      cache[id] = cards;
      delete loading[id];
      return cards;
    }, function (e) { delete loading[id]; throw e; });
    loading[id] = p;
    return p;
  }

  var sets = PL.tcgSets || [];
  var setMeta = {};
  sets.forEach(function (s) { setMeta[s.id] = s; });
  var dex = PL.dex || [];
  var dexById = {};
  dex.forEach(function (p) { dexById[p.id] = p; });

  function rarityKey(raw) {
    var r = (raw || '').toLowerCase();
    if (!r) return 'common';
    if (/special illustration|hyper|secret|gold|rainbow|shiny ultra|crown/.test(r)) return 'special';
    if (/illustration|ultra|double rare|amazing|radiant|ace spec|\bex\b|\bv\b|vmax|vstar|gx|break|prime|legend|star|shining/.test(r)) return 'ultra';
    if (/holo|rare/.test(r)) return 'rare';
    if (/uncommon/.test(r)) return 'uncommon';
    return 'common';
  }

  var STAGE = { 'Basic': 0, 'Stage 1': 1, 'Stage 2': 2 };
  var SPECIAL_STAGE = ['BREAK', 'LEVEL-UP', 'MEGA', 'VMAX', 'VSTAR', 'V-UNION', 'Restored', 'Baby'];
  var SUFFIX = ['ex', 'EX', 'GX', 'VMAX', 'VSTAR', 'V'];
  var ENERGY = { Grass: 'grass', Fire: 'fire', Water: 'water', Lightning: 'lightning', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'dark', Metal: 'steel', Fairy: 'fairy' };
  var TRAINER_KIND = { Supporter: _('Supporter'), Item: _('Item'), Stadium: _('Stadium'), 'Pokémon Tool': _('Pokémon Tool'), 'Technical Machine': _('Technical Machine'), 'Rocket\'s Secret Machine': _('Rocket’s Secret Machine') };

  function ruName(name, dexNum) {
    var p = dexNum ? dexById[dexNum] : null;
    return p && name.indexOf(p.en) === 0 ? p.ru + name.slice(p.en.length) : name;
  }

  /* полная карточка из компактных данных набора */
  function normalize(raw, setId) {
    var set = setMeta[setId] || {};
    var sb = raw.sb || [];
    var d = raw.d || [];
    var card = {
      id: setId + '-' + raw.i, setId: setId, set: set.n || setId, series: set.se, date: set.d,
      localId: raw.i, total: set.pt, en: raw.n, name: ruName(raw.n, d.length === 1 ? d[0] : 0),
      super: raw.s, sub: sb, num: d[0] || 0, dex: d,
      hp: raw.hp || 0, illus: raw.ar || '', rarity: rarityKey(raw.ra), rarityName: raw.ra || '',
      attacks: (raw.at || []).map(function (a) { return { name: a[0], cost: a[1], dmg: a[2], text: a[3] }; }),
      ability: raw.ab ? { name: raw.ab[0][0], text: raw.ab[0][1], kind: raw.ab[0][2] } : null,
      weak: raw.wk ? { type: raw.wk[0][0], val: raw.wk[0][1] } : null,
      resist: raw.rs ? { type: raw.rs[0][0], val: raw.rs[0][1].replace('-', '−') } : null,
      retreat: raw.rt || 0, rules: raw.ru || [], from: raw.ef || null,
      imgs: raw.im || null,
    };

    if (raw.s === 'P') {
      card.type = (raw.t || [])[0] || 'colorless';
      card.stage = 0;
      for (var k = 0; k < sb.length; k++) {
        if (sb[k] in STAGE) card.stage = STAGE[sb[k]];
        if (SPECIAL_STAGE.indexOf(sb[k]) !== -1) card.stageLabel = sb[k];
      }
      for (var j = 0; j < SUFFIX.length; j++) if (sb.indexOf(SUFFIX[j]) !== -1) { card.suffix = SUFFIX[j]; break; }
      if (card.suffix === 'VMAX' || card.suffix === 'VSTAR') card.stageLabel = card.suffix;
    } else if (raw.s === 'E') {
      var m = raw.n.match(/^(\w+) Energy/);
      card.type = m && ENERGY[m[1]] ? ENERGY[m[1]] : 'colorless';
      card.kind = sb.indexOf('Special') !== -1 ? _('Special Energy') : _('Basic Energy');
    } else {
      card.type = 'colorless';
      card.kind = sb.map(function (s) { return TRAINER_KIND[s]; }).filter(Boolean)[0] || _('Trainer');
    }

    var p = card.num ? dexById[card.num] : null;
    var lore = (PL.loreRu || {})[card.num];
    card.lore = lore || raw.fl || (p && p.fl) || '';
    card.loreLang = lore ? 'ru' : 'en';
    card.art = card.num ? PL.img.art(card.num) : null;
    card.scan = true;
    return card;
  }

  function cardsOf(setId) {
    return loadSet(setId).then(function (raw) { return raw.map(function (r) { return normalize(r, setId); }); });
  }
  function setOf(cardId) { return cardId.slice(0, cardId.indexOf('-')); }

  /* ---------- индекс всех карточек: «лёгкие» карточки без запросов ---------- */
  var IDX = PL.tcgIndex || { rarities: [], rows: [] };
  var ROWS = IDX.rows;
  var CARD_TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'dark', 'steel', 'dragon', 'fairy', 'colorless'];
  var lightCache = {};

  function light(i) {
    if (lightCache[i]) return lightCache[i];
    var r = ROWS[i], s = sets[r[0]] || {};
    var kindSuper = ['P', 'T', 'E'][r[3]];
    var rn = IDX.rarities[r[5]] || '';
    var c = lightCache[i] = {
      id: s.id + '-' + r[1], setId: s.id, set: s.n, series: s.se, date: s.d, localId: r[1], total: s.pt,
      en: r[2], name: ruName(r[2], r[6]), super: kindSuper, sub: [], num: r[6], dex: r[6] ? [r[6]] : [],
      hp: r[7], type: r[4] >= 0 ? CARD_TYPES[r[4]] : 'colorless', rarityName: rn, rarity: rarityKey(rn),
      attacks: [], ability: null, weak: null, resist: null, retreat: 0, rules: [], from: null, illus: '', stage: 0,
      kind: kindSuper === 'T' ? _('Trainer') : kindSuper === 'E' ? _('Energy') : '', lore: '', imgs: null,
      art: r[6] ? PL.img.art(r[6]) : null, scan: true, light: true, row: i,
    };
    return c;
  }

  var idMap = null, dexRows = null, lowNames = null, ruToEn = null;
  function buildIdMap() {
    idMap = {};
    for (var i = 0; i < ROWS.length; i++) idMap[(sets[ROWS[i][0]] || {}).id + '-' + ROWS[i][1]] = i;
  }
  function lightsByIds(ids) {
    if (!idMap) buildIdMap();
    return ids.map(function (id) { return idMap[id] != null ? light(idMap[id]) : null; }).filter(Boolean);
  }
  function rowsByDex(n) {
    if (!dexRows) {
      dexRows = {};
      for (var i = 0; i < ROWS.length; i++) if (ROWS[i][6]) (dexRows[ROWS[i][6]] = dexRows[ROWS[i][6]] || []).push(i);
    }
    return (dexRows[n] || []).slice().reverse();   // новые сверху
  }

  /* поиск по индексу: имя (рус. или англ.) + фильтры {type, rarity, sup}; новые наборы сверху */
  function search(q, f) {
    f = f || {};
    q = (q || '').trim().toLowerCase();
    if (!lowNames) { lowNames = ROWS.map(function (r) { return r[2].toLowerCase(); }); }
    var terms = null;
    if (q) {
      terms = [q];
      if (/[а-яё]/.test(q)) {   // i18n-ok
        if (!ruToEn) ruToEn = dex.map(function (p) { return [p.ru.toLowerCase(), p.en.toLowerCase()]; });
        ruToEn.forEach(function (x) { if (x[0].indexOf(q) !== -1 && terms.length < 60) terms.push(x[1]); });
        terms.shift();
        if (!terms.length) terms = [q];
      }
    }
    var out = [];
    for (var i = ROWS.length - 1; i >= 0; i--) {
      var r = ROWS[i];
      if (f.sup != null && r[3] !== f.sup) continue;
      if (f.type != null && r[4] !== f.type) continue;
      if (f.rarity && rarityKey(IDX.rarities[r[5]]) !== f.rarity) continue;
      if (terms) {
        var n = lowNames[i], ok = false;
        for (var k = 0; k < terms.length; k++) if (n.indexOf(terms[k]) !== -1) { ok = true; break; }
        if (!ok) continue;
      }
      out.push(i);
    }
    return out;
  }
  function allRows() { var o = []; for (var i = ROWS.length - 1; i >= 0; i--) o.push(i); return o; }

  /* лёгкая карточка → полная (нужен один запрос набора) */
  function fullCard(c) {
    if (!c.light) return Promise.resolve(c);
    return loadSet(c.setId).then(function (raw) {
      for (var i = 0; i < raw.length; i++) if (raw[i].i === c.localId) {
        var f = normalize(raw[i], c.setId);
        if (c.mine) { f.photo = c.photo; f.mine = c.mine; f.mineT = c.mineT; f.baseId = c.baseId; f.id = c.id; }   // своя карточка: данные из базы, лицо — твоё фото
        return f;
      }
      return c;
    }).catch(function (e) {
      if (c.mine) { c.light = false; return c; }                  // нет сети: открываем с тем, что есть
      throw e;
    });
  }

  /* полные карточки по списку id (разные наборы) */
  function cardsByIds(ids) {
    var need = {};
    ids.forEach(function (id) { need[setOf(id)] = 1; });
    return Promise.all(Object.keys(need).map(function (s) { return cardsOf(s).catch(function () { return []; }); })).then(function (lists) {
      var all = {};
      lists.forEach(function (l) { l.forEach(function (c) { all[c.id] = c; }); });
      return ids.map(function (id) { return all[id]; }).filter(Boolean);
    });
  }

  /* ---------- избранное (покемоны и карточки), хранится в браузере ---------- */
  var FAV_KEY = 'pl-fav';
  var fav = { dex: [], cards: [] };
  try { var s = JSON.parse(localStorage.getItem(FAV_KEY) || 'null'); if (s) fav = { dex: s.dex || [], cards: s.cards || [] }; } catch (e) {}
  function saveFav() { try { localStorage.setItem(FAV_KEY, JSON.stringify(fav)); } catch (e) {} }

  PL.fav = {
    has: function (kind, id) { return fav[kind].indexOf(id) !== -1; },
    toggle: function (kind, id) {
      var i = fav[kind].indexOf(id);
      if (i === -1) fav[kind].unshift(id); else fav[kind].splice(i, 1);
      saveFav();
      return i === -1;
    },
    list: function (kind) { return fav[kind].slice(); },
    count: function () { return fav.dex.length + fav.cards.length; },
  };

  PL.data = {
    loadSet: loadSet, cardsOf: cardsOf, cardsByIds: cardsByIds, setOf: setOf, fullCard: fullCard,
    light: light, lights: function (rows) { return rows.map(light); }, lightsByIds: lightsByIds,
    search: search, allRows: allRows, rowsByDex: rowsByDex, rowCount: ROWS.length,
    sets: sets, setMeta: setMeta, dex: dex, dexById: dexById, artUrl: PL.img.art, rarityKey: rarityKey,
    typeIdx: CARD_TYPES,
    totalCards: ROWS.length || sets.reduce(function (a, s) { return a + (s.c || 0); }, 0),
  };
})();
