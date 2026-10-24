/* ==========================================================================
   Картинки «из API», ничего не храня в архиве.

   • Арты покемонов и иконки предметов: репозиторий PokéAPI/sprites через jsDelivr,
     запасной адрес — raw.githubusercontent.com, затем локальная копия (если есть).
   • Сканы карточек: у каждой карты несколько источников, которые пробуются по очереди:
       1) images.pokemontcg.io или images.scrydex.com (какой указан в базе для этого набора)
       2) второй из этих двух
       3) TCGdex через API (сам находит нужный набор и карту)
     Если картинки нет нигде, карточка рисуется стилями (см. tcg.js → scanFail).
   • Какой источник сработал для набора, запоминается: следующие карты этого набора
     сразу идут в него, а не перебирают все по очереди.
   Всё работает через <img>: ошибка загрузки перехватывается одним общим обработчиком.
   ========================================================================== */
window.PL = window.PL || {};

PL.img = (function () {
  var SPR_CDN = 'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/';
  var SPR_RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/';
  var TCGDEX = 'https://api.tcgdex.net/v2';
  var meta = PL.dataMeta || {};
  var local = meta.local || {};
  var map = PL.tcgImgMap || { sx: [], ex: {}, logo: {} };
  var sx = {};
  (map.sx || []).forEach(function (id) { sx[id] = 1; });

  /* ---------- арты покемонов и предметы ---------- */
  function sprite(rest) { return SPR_CDN + rest; }
  function art(id) { return local.art ? 'assets/pokemon/' + id + '.png' : sprite('pokemon/other/official-artwork/' + id + '.png'); }
  function item(k) { return local.items ? 'assets/items/' + k + '.png' : sprite('items/' + k + '.png'); }

  /* следующий адрес для спрайтов: jsDelivr → GitHub raw → локальная копия */
  function nextSprite(src) {
    var rest;
    if (src.indexOf(SPR_CDN) === 0) return SPR_RAW + src.slice(SPR_CDN.length);
    if (src.indexOf(SPR_RAW) === 0) {
      rest = src.slice(SPR_RAW.length);
      var m = rest.match(/^pokemon\/other\/official-artwork\/(\d+)\.png$/);
      if (m) return 'assets/pokemon/' + m[1] + '.png';
      m = rest.match(/^items\/(.+)$/);
      if (m) return 'assets/items/' + m[1];
    }
    return null;
  }

  /* ---------- логотипы наборов ---------- */
  function logoUrls(setId) {
    var o = map.logo && map.logo[setId];
    return o ? [o[0]] : ['https://images.pokemontcg.io/' + setId + '/logo.png', 'https://images.scrydex.com/pokemon/' + setId + '-logo/logo'];
  }

  /* ---------- сканы карточек ---------- */
  var best = {};
  try { best = JSON.parse(localStorage.getItem('pl-imgsrc') || '{}') || {}; } catch (e) {}
  function remember(setId, kind) {
    if (best[setId] === kind) return;
    best[setId] = kind;
    try { localStorage.setItem('pl-imgsrc', JSON.stringify(best)); } catch (e) {}
  }
  function kindOf(url) {
    if (url.indexOf('images.pokemontcg.io') !== -1) return 'pt';
    if (url.indexOf('scrydex.com') !== -1) return 'sx';
    if (url.indexOf('tcgdex.net') !== -1) return 'td';
    return 'local';
  }

  function enc(s) { return encodeURIComponent(s); }
  function chain(card, big) {
    if (card.photo) return [card.photo];            // отсканированная пользователем карточка
    var out = [];
    var imgs = PL.tcgImages || {};
    if ((imgs.sets || {})[card.setId]) {
      var miss = (imgs.miss || {})[card.setId];
      if (!miss || miss.indexOf(card.localId) === -1) out.push('assets/cards/' + card.setId + '/' + String(card.localId).replace(/[^a-z0-9_-]/gi, '_') + '.png');
    }
    var sid = card.setId, loc = enc(card.localId), cid = enc(sid) + '-' + loc;
    var pt = ['https://images.pokemontcg.io/' + sid + '/' + loc + '.png', 'https://images.pokemontcg.io/' + sid + '/' + loc + '_hires.png'];
    var sc = ['https://images.scrydex.com/pokemon/' + cid + '/small', 'https://images.scrydex.com/pokemon/' + cid + '/large'];
    var ex = card.imgs || (map.ex || {})[card.id];
    var first = ex || (sx[sid] ? sc : pt);
    var second = first === sc ? pt : sc;
    var pairs = [{ k: kindOf(first[0]), u: first }, { k: kindOf(second[0]), u: second }];
    if (ex && pairs[0].k === pairs[1].k) pairs[1] = { k: pairs[1].k === 'sx' ? 'pt' : 'sx', u: pairs[1].k === 'sx' ? pt : sc };
    if (best[sid] && pairs[1].k === best[sid]) pairs.reverse();
    pairs.forEach(function (p) { if (big) out.push(p.u[1]); out.push(p.u[0]); });
    out = out.filter(function (u, i) { return u && out.indexOf(u) === i; });
    out.push('@tcgdex');
    return out;
  }
  function scanAttrs(card, big) {
    var c = chain(card, big);
    return 'src="' + PL.tcg.esc(c[0]) + '" data-chain="' + PL.tcg.esc(c.join('|')) + '" data-ci="0" data-sid="' + PL.tcg.esc(card.setId) + '" data-lid="' + PL.tcg.esc(card.localId) + '" data-big="' + (big ? 1 : 0) + '" referrerpolicy="no-referrer"';
  }

  /* ---------- TCGdex: найти набор и картинку через API ---------- */
  var tdSets = {}, tdList = null;
  function normLocal(s) { return String(s).toLowerCase().replace(/^0+(?=\d)/, ''); }
  function normName(s) { return String(s).toLowerCase().replace(/&/g, 'and').replace(/pok[eé]mon|tcg|trading card game/g, '').replace(/[^a-z0-9]+/g, ''); }
  function candidateIds(id) {
    var out = [id], m;
    if ((m = id.match(/^(sv|me)(\d+)(?:pt(\d+))?$/))) out.push(m[1] + ('0' + m[2]).slice(-2) + (m[3] ? '.' + m[3] : ''));
    if ((m = id.match(/^([a-z]+\d+)pt(\d+)/))) out.push(m[1] + '.' + m[2]);
    if ((m = id.match(/^([a-z]+)(\d+)5$/)) && m[2]) out.push(m[1] + m[2] + '.5');
    return out.filter(function (x, i) { return out.indexOf(x) === i; });
  }
  function getJSON(url) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = ctl && setTimeout(function () { ctl.abort(); }, 9000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (t) clearTimeout(t); return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function plausible(d, ours) {
    if (normName(d.name || '') === normName(ours.n)) return true;
    var c = d.cardCount || {};
    return (ours.pt && c.official === ours.pt) || (ours.c && (c.total === ours.c || c.official === ours.c));
  }
  function tdSet(setId) {
    if (tdSets[setId]) return tdSets[setId];
    var ours = (PL.data && PL.data.setMeta[setId]) || { id: setId, n: setId };
    tdSets[setId] = (function () {
      var ids = candidateIds(setId), i = 0;
      function tryNext() {
        if (i >= ids.length) return byName();
        return getJSON(TCGDEX + '/en/sets/' + encodeURIComponent(ids[i++])).then(function (d) { return d && d.cards && plausible(d, ours) ? d : tryNext(); });
      }
      function byName() {
        var p = tdList ? Promise.resolve(tdList) : getJSON(TCGDEX + '/en/sets').then(function (l) { return (tdList = l || []); });
        return p.then(function (list) {
          var nn = normName(ours.n || '');
          var cand = list.filter(function (s) { return normName(s.name) === nn; });
          if (!cand.length && ours.pt) cand = list.filter(function (s) { return s.cardCount && s.cardCount.official === ours.pt && (normName(s.name).indexOf(nn) !== -1 || nn.indexOf(normName(s.name)) !== -1); });
          if (!cand.length) return null;
          return getJSON(TCGDEX + '/en/sets/' + encodeURIComponent(cand[0].id)).then(function (d) { return d && d.cards ? d : null; });
        });
      }
      return tryNext().then(function (d) {
        if (!d) return null;
        var m = {};
        d.cards.forEach(function (c) { if (c.image) m[normLocal(c.localId)] = c.image; });
        return m;
      });
    })();
    return tdSets[setId];
  }
  function tdUrl(el) {
    return tdSet(el.dataset.sid).then(function (m) {
      var base = m && m[normLocal(el.dataset.lid)];
      return base ? base + '/' + (el.dataset.big === '1' ? 'high' : 'low') + '.webp' : null;
    });
  }

  /* ---------- общий обработчик ошибок и успехов загрузки ---------- */
  function exhaust(el) {
    if (el.classList.contains('scan-img') && PL.tcg && PL.tcg.scanFail) PL.tcg.scanFail(el);
    else el.style.visibility = 'hidden';
  }
  function step(el) {
    var list = (el.dataset.chain || '').split('|');
    var i = (+el.dataset.ci || 0) + 1;
    (function go() {
      if (i >= list.length) return exhaust(el);
      el.dataset.ci = i;
      if (list[i] === '@tcgdex') {
        tdUrl(el).then(function (u) { if (u) el.src = u; else { i++; go(); } });
      } else el.src = list[i];
    })();
  }
  document.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    if (el.dataset.chain) return step(el);
    var src = el.getAttribute('src') || '';
    var nx = nextSprite(src);
    if (nx) el.src = nx; else if (src) exhaust(el);
  }, true);
  document.addEventListener('load', function (e) {
    var el = e.target;
    if (el && el.tagName === 'IMG' && el.dataset.sid && el.src && (kindOf(el.src) === 'pt' || kindOf(el.src) === 'sx')) remember(el.dataset.sid, kindOf(el.src));
  }, true);

  return { art: art, item: item, logoUrls: logoUrls, scanAttrs: scanAttrs, chain: chain, sprite: sprite };
})();
