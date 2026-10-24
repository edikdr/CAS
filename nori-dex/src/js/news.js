/* ==========================================================================
   Новости: что подгружается из сети (всё необязательно — без интернета остаётся архив).

   • pokemon-tcg-data (jsDelivr / GitHub): список карточных наборов — сюда попадают новые
     наборы, которых ещё нет в архиве;
   • PokéAPI/api-data (jsDelivr / GitHub): какие игры уже есть в базе (свежие версии игр);
   • GDELT DOC API: свежие заголовки мировых СМИ про Pokémon (открытый API с CORS).
   Каждый источник независим: упал один — остальные работают. Результат кэшируется на 6 часов.
   API: PL.news.load(force, onUpdate) → Promise; onUpdate({ src, ok, items?, games? }) после каждого источника
   ========================================================================== */
window.PL = window.PL || {};

PL.news = (function () {
  var TTL = 6 * 3600 * 1000, KEY = 'pl-news-cache';
  var TCG = ['https://cdn.jsdelivr.net/gh/PokemonTCG/pokemon-tcg-data@master/sets/en.json', 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json'];
  var VG = ['https://cdn.jsdelivr.net/gh/PokeAPI/api-data@master/data/api/v2/version-group/index.json', 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/version-group/index.json'];
  var GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent('(pokemon OR "pokémon") sourcelang:english') + '&mode=artlist&maxrecords=40&format=json&sort=datedesc&timespan=3months';

  /* как называются свежие версии игр в базе PokéAPI */
  var GAME_RU = {
    'legends-za': 'Pokémon Legends: Z-A', 'mega-dimension': 'Legends: Z-A — Mega Dimension', 'champions': 'Pokémon Champions',
    'scarlet-violet': 'Pokémon Scarlet / Violet', 'the-teal-mask': 'Scarlet / Violet: The Teal Mask', 'the-indigo-disk': 'Scarlet / Violet: The Indigo Disk',
    'legends-arceus': 'Pokémon Legends: Arceus', 'brilliant-diamond-and-shining-pearl': 'Brilliant Diamond / Shining Pearl', 'sword-shield': 'Pokémon Sword / Shield',
  };
  var SKIP = { 'red-green-japan': 1, 'blue-japan': 1 };

  function fetchJSON(urls, ms) {
    urls = [].concat(urls);
    var i = 0;
    return new Promise(function (resolve, reject) {
      (function next() {
        if (i >= urls.length) return reject(new Error(_('нет ответа')));
        var u = urls[i++], ctl = window.AbortController ? new AbortController() : null;
        var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 9000);
        fetch(u, ctl ? { signal: ctl.signal } : {}).then(function (r) {
          clearTimeout(t);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(resolve, function () { clearTimeout(t); next(); });
      })();
    });
  }

  function readCache() { try { var c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && Date.now() - c.t < TTL ? c : null; } catch (e) { return null; } }
  function writeCache(c) { try { c.t = Date.now(); localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function sinceIso(days) { return iso(new Date(Date.now() - days * 86400000)); }

  function load(force, onUpdate) {
    var cache = force ? null : readCache();
    var out = { tcg: null, games: null, live: null };
    var cb = onUpdate || function () {};
    if (cache) {
      ['tcg', 'games', 'live'].forEach(function (k) { if (cache[k]) { out[k] = cache[k]; cb({ src: k, ok: true, cached: true, data: cache[k] }); } });
      return Promise.resolve(out);
    }
    var local = {};
    (PL.tcgSets || []).forEach(function (s) { local[s.id] = 1; });
    var from = sinceIso(366);

    var pTcg = fetchJSON(TCG).then(function (list) {
      var items = list.filter(function (s) { return s.releaseDate && s.releaseDate.replace(/\//g, '-') >= from; }).map(function (s) {
        return { d: s.releaseDate.replace(/\//g, '-'), id: s.id, n: s.name, se: s.series, c: s.total || s.printedTotal, isNew: !local[s.id] };
      });
      out.tcg = items; cb({ src: 'tcg', ok: true, data: items });
    }, function () { cb({ src: 'tcg', ok: false }); });

    var pGames = fetchJSON(VG).then(function (d) {
      var names = (d.results || []).map(function (r) { return r.name; }).filter(function (n) { return !SKIP[n]; }).slice(-3).reverse();
      var games = names.map(function (n) { return { slug: n, ru: GAME_RU[n] || n.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) }; });
      out.games = games; cb({ src: 'games', ok: true, data: games });
    }, function () { cb({ src: 'games', ok: false }); });

    var pLive = fetchJSON(GDELT, 11000).then(function (d) {
      var seen = {};
      var items = (d.articles || []).map(function (a) {
        var m = /^(\d{4})(\d{2})(\d{2})/.exec(a.seendate || '');
        return { d: m ? m[1] + '-' + m[2] + '-' + m[3] : '', t: String(a.title || '').trim(), url: a.url, dom: a.domain || '' };
      }).filter(function (a) {
        if (!a.d || !a.t || !a.url || seen[a.t.toLowerCase()]) return false;
        seen[a.t.toLowerCase()] = 1; return true;
      }).slice(0, 30);
      out.live = items; cb({ src: 'live', ok: true, data: items });
    }, function () { cb({ src: 'live', ok: false }); });

    return Promise.all([pTcg, pGames, pLive]).then(function () {
      if (out.tcg || out.games || out.live) writeCache(out);
      return out;
    });
  }

  return { load: load, GAME_RU: GAME_RU, iso: iso, sinceIso: sinceIso };
})();
