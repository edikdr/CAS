/* ==========================================================================
   «Моя коллекция»: карточки, отсканированные или загруженные самим пользователем.
   Фото (уже выровненное и обрезанное до формата карточки) хранится в IndexedDB браузера,
   на сервер ничего не уходит. Если карточку удалось опознать, к ней привязаны данные из
   базы (набор, номер, атаки и т.д.), и в альбоме она открывается как обычная карточка,
   только вместо скана из сети показано твоё фото.

   API: PL.mine.add(rec) → Promise<id>   rec: {cardId?, name, blob, w, h, src, conf?}
        PL.mine.update(id, {title?, note?}) → Promise — правка своего названия и описания
        PL.mine.cards() → Promise<card[]> (для альбома)   PL.mine.remove(id)   PL.mine.count()
        PL.mine.on(fn) — вызывается после любого изменения
   ========================================================================== */
window.PL = window.PL || {};

PL.mine = (function () {
  var DB = 'pokelore-mine', STORE = 'cards', LS = 'pl-mine-n';
  var db = null, mem = [], memOnly = false, urls = {}, subs = [];

  function count() { var n = 0; try { n = +localStorage.getItem(LS) || 0; } catch (e) {} return n; }
  function setCount(n) { try { localStorage.setItem(LS, String(n)); } catch (e) {} }
  function notify() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      var r;
      try { r = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = function () { db = r.result; res(db); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('blocked')); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, mode), s = t.objectStore(STORE), out = fn(s);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function all() {
    if (memOnly) return Promise.resolve(mem.slice());
    return tx('readonly', function (s) { return s.getAll(); }).catch(function () { memOnly = true; return mem.slice(); });
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function add(rec) {
    rec = rec || {};
    rec.id = rec.id || uid();
    rec.t = rec.t || Date.now();
    var p = memOnly ? (mem.push(rec), Promise.resolve()) : tx('readwrite', function (s) { return s.put(rec); }).catch(function () { memOnly = true; mem.push(rec); });
    return p.then(function () { setCount(count() + 1); notify(); return rec.id; });
  }
  function remove(id) {
    if (urls[id]) { try { URL.revokeObjectURL(urls[id]); } catch (e) {} delete urls[id]; }
    var p = memOnly ? (mem = mem.filter(function (r) { return r.id !== id; }), Promise.resolve()) : tx('readwrite', function (s) { return s.delete(id); }).catch(function () {});
    return p.then(function () { setCount(Math.max(0, count() - 1)); notify(); });
  }
  /* правка записи: своё название (title) и описание (note) */
  function update(id, patch) {
    function apply(r) { Object.keys(patch).forEach(function (k) { r[k] = patch[k]; }); return r; }
    if (memOnly) { mem.forEach(function (r) { if (r.id === id) apply(r); }); notify(); return Promise.resolve(); }
    return tx('readwrite', function (s) {
      var g = s.get(id);
      g.onsuccess = function () { if (g.result) s.put(apply(g.result)); };
      return g;
    }).then(function () { notify(); });
  }
  function urlFor(rec) {
    if (rec.url) return rec.url;
    if (!urls[rec.id]) urls[rec.id] = URL.createObjectURL(rec.blob);
    return urls[rec.id];
  }

  /* запись → карточка для альбома. Опознанная — копия «лёгкой» карточки из индекса, иначе — пустая заготовка */
  function toCard(rec) {
    var D = PL.data, base = rec.cardId && D && D.lightsByIds ? D.lightsByIds([rec.cardId])[0] : null, c;
    if (base) {
      c = {};
      Object.keys(base).forEach(function (k) { c[k] = base[k]; });
    } else {
      c = {
        setId: '', set: _('My collection'), series: '', date: '', localId: rec.localId || '', total: 0, en: rec.name || _('Card'), name: rec.name || _('My card'),
        super: 'P', sub: [], num: 0, dex: [], hp: 0, type: 'colorless', rarityName: '', rarity: 'common', attacks: [], ability: null, weak: null, resist: null,
        retreat: 0, rules: [], from: null, illus: '', stage: 0, kind: '', lore: '', imgs: null, art: null, scan: true, light: false,
      };
    }
    c.baseId = c.id;
    c.baseName = c.name;
    if (rec.title) c.name = rec.title;                // своё название поверх базового
    c.note = rec.note || '';                          // своё описание
    c.id = 'mine-' + rec.id;
    c.mine = rec.id;
    c.mineT = rec.t;
    c.photo = urlFor(rec);
    return c;
  }
  function cards() {
    return all().then(function (list) {
      list.sort(function (a, b) { return b.t - a.t; });
      if (list.length !== count()) setCount(list.length);
      return list.map(toCard);
    });
  }

  return { add: add, update: update, remove: remove, cards: cards, count: count, on: function (f) { subs.push(f); }, urlFor: urlFor, _all: all };
})();
