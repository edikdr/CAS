/* ==========================================================================
   Снимки экрана консоли → Избранное.

   Как это работает (без серверов и разрешений):
   • то, что сейчас на экране консоли (#crt), копируется в SVG-«фотографию»: каждому элементу
     проставляются его вычисленные стили, псевдоэлементы (::before / ::after) превращаются в
     обычные узлы, canvas — в картинки, картинки из сети — в data-URL (через fetch: источники
     спрайтов и сканов отдают CORS-заголовки), прокрученные списки сдвигаются на scrollTop;
   • шрифты вшиваются из js/shot-fonts.js (подгружается только при первом снимке);
   • SVG рисуется на canvas и сохраняется как JPEG в IndexedDB браузера (если его нет — в
     localStorage, но не больше 6 снимков).
   Если чего-то нельзя встроить (картинка не отдалась), на снимке остаётся пустое место,
   но сам снимок всё равно сохраняется.
   API: PL.shot.take(meta) → Promise<снимок>; list(); remove(id); count(); download(id); on('change', fn)
   ========================================================================== */
window.PL = window.PL || {};

PL.shot = (function () {
  var W = 768, H = 432, SCALE = 2;
  var DB = 'pl-shots', STORE = 'shots', LS = 'pl-shots-ls';
  var db = null, items = [], handlers = [], ready = null;

  function emit() { handlers.forEach(function (f) { try { f(); } catch (e) {} }); }

  /* ---------- хранилище ---------- */
  function open() {
    if (ready) return ready;
    ready = new Promise(function (resolve) {
      var done = function () { items.sort(function (a, b) { return b.t - a.t; }); emit(); resolve(); };
      try {
        var rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE, { keyPath: 'id' }); };
        rq.onsuccess = function () {
          db = rq.result;
          var all = db.transaction(STORE).objectStore(STORE).getAll();
          all.onsuccess = function () { items = all.result || []; done(); };
          all.onerror = done;
        };
        rq.onerror = function () { db = null; fromLS(); done(); };
        rq.onblocked = function () { db = null; fromLS(); done(); };
      } catch (e) { db = null; fromLS(); done(); }
    });
    return ready;
  }
  function fromLS() { try { items = JSON.parse(localStorage.getItem(LS) || '[]') || []; } catch (e) { items = []; } }
  function toLS() { try { localStorage.setItem(LS, JSON.stringify(items.slice(0, 6))); } catch (e) {} }

  function put(rec) {
    return open().then(function () {
      items.unshift(rec);
      return new Promise(function (resolve) {
        if (db) {
          try {
            var tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(rec);
            tx.oncomplete = function () { emit(); resolve(rec); };
            tx.onerror = function () { emit(); resolve(rec); };
            return;
          } catch (e) { /* ниже — localStorage */ }
        }
        toLS(); emit(); resolve(rec);
      });
    });
  }
  function remove(id) {
    return open().then(function () {
      items = items.filter(function (x) { return x.id !== id; });
      if (db) { try { db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); } catch (e) {} } else toLS();
      emit();
    });
  }

  /* ---------- копия DOM со стилями ---------- */
  var iframe = null, idoc = null, defCache = {};
  function sandbox() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    idoc = iframe.contentDocument;
    idoc.open(); idoc.write('<!doctype html><html><body></body></html>'); idoc.close();
  }
  /* стили «по умолчанию» для тега — в чистом документе без CSS страницы: сравниваем с ними, чтобы копировать только отличия */
  function defaultsFor(ns, tag) {
    var key = ns + '|' + tag;
    if (defCache[key]) return defCache[key];
    var el = ns === 'http://www.w3.org/1999/xhtml' ? idoc.createElement(tag) : idoc.createElementNS(ns, tag);
    idoc.body.appendChild(el);
    var cs = iframe.contentWindow.getComputedStyle(el), map = {};
    for (var i = 0; i < cs.length; i++) map[cs[i]] = cs.getPropertyValue(cs[i]);
    idoc.body.removeChild(el);
    return (defCache[key] = map);
  }
  var SKIP = { 'animation': 1, 'animation-name': 1, 'animation-duration': 1, 'animation-delay': 1, 'animation-timing-function': 1, 'animation-iteration-count': 1, 'animation-fill-mode': 1, 'animation-direction': 1, 'animation-play-state': 1, 'animation-composition': 1, 'animation-timeline': 1, 'animation-range-start': 1, 'animation-range-end': 1,
    'transition': 1, 'transition-property': 1, 'transition-duration': 1, 'transition-delay': 1, 'transition-timing-function': 1, 'transition-behavior': 1, 'cursor': 1, 'pointer-events': 1, 'will-change': 1, 'user-select': 1 };

  function styleText(cs, def) {
    var out = '';
    for (var i = 0; i < cs.length; i++) {
      var n = cs[i];
      if (SKIP[n]) continue;
      var v = cs.getPropertyValue(n);
      if (def[n] === v) continue;
      out += n + ':' + v + ';';
    }
    return out;
  }

  function cssUnquote(c) {
    var m = /^"([\s\S]*)"$/.exec(c) || /^'([\s\S]*)'$/.exec(c);
    if (!m) return null;
    return m[1].replace(/\\([0-9a-fA-F]{1,6}) ?/g, function (x, h) { return String.fromCodePoint(parseInt(h, 16)); }).replace(/\\(.)/g, '$1');
  }

  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  function toDataURL(url) {
    return new Promise(function (resolve) {
      var ctl = window.AbortController ? new AbortController() : null;
      var t = setTimeout(function () { if (ctl) ctl.abort(); resolve(null); }, 5000);
      fetch(url, ctl ? { signal: ctl.signal, mode: 'cors' } : { mode: 'cors' }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
        var fr = new FileReader();
        fr.onload = function () { clearTimeout(t); resolve(fr.result); };
        fr.onerror = function () { clearTimeout(t); resolve(null); };
        fr.readAsDataURL(b);
      }).catch(function () { clearTimeout(t); resolve(null); });
    });
  }

  var view = null;                     // прямоугольник экрана на странице: всё, что целиком за его пределами, в снимок не попадает
  function outside(el, cs) {
    if (cs.position === 'absolute' || cs.position === 'fixed') return false;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    var m = 80;
    return r.right < view.left - m || r.left > view.right + m || r.bottom < view.top - m || r.top > view.bottom + m;
  }
  function build(src, pend) {
    if (src.nodeType === 3) return src.cloneNode(false);
    if (src.nodeType !== 1) return null;
    var cs = getComputedStyle(src);
    if (cs.display === 'none' || cs.opacity === '0' || outside(src, cs)) return null;
    var ns = src.namespaceURI, tag = src.localName;
    if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'noscript') return null;
    var dst;
    if (tag === 'canvas') {
      dst = document.createElement('img');
      try { dst.setAttribute('src', src.toDataURL('image/png')); } catch (e) { dst.setAttribute('src', BLANK); }
    } else {
      dst = src.cloneNode(false);
      if (tag === 'img') {
        var u = src.currentSrc || src.src;
        dst.removeAttribute('srcset'); dst.removeAttribute('loading');
        dst.setAttribute('src', BLANK);
        if (u && !/^data:/.test(u) && src.complete && src.naturalWidth) {
          pend.push(toDataURL(u).then(function (d) { if (d) dst.setAttribute('src', d); }));
        } else if (/^data:/.test(u || '')) dst.setAttribute('src', u);
      }
      if (tag === 'input') dst.setAttribute('value', src.value);
    }
    dst.removeAttribute('class'); dst.removeAttribute('id'); dst.removeAttribute('style');
    var css = styleText(cs, defaultsFor(ns, tag === 'canvas' ? 'img' : tag));
    if (/(^|;)overflow(-x|-y)?:\s*(auto|scroll)/.test(css)) css += 'overflow:hidden;';
    dst.setAttribute('style', css);

    var sx = src.scrollLeft || 0, sy = src.scrollTop || 0;
    var host = dst;
    if (tag !== 'img' && tag !== 'canvas' && tag !== 'input' && (sx || sy)) {     // прокрученный список: сдвигаем содержимое
      host = document.createElement('div');
      host.setAttribute('style', 'position:relative;min-width:100%;min-height:100%;transform:translate(' + (-sx) + 'px,' + (-sy) + 'px)');
      dst.appendChild(host);
    }
    if (tag !== 'img' && tag !== 'canvas') {
      pseudo(src, host, '::before', true);
      for (var c = src.firstChild; c; c = c.nextSibling) { var k = build(c, pend); if (k) host.appendChild(k); }
      pseudo(src, host, '::after', false);
    }
    return dst;
  }

  function pseudo(src, host, which, first) {
    var pcs = getComputedStyle(src, which), c = pcs.content;
    if (!c || c === 'none' || c === 'normal') return;
    var span = document.createElement('span');
    var txt = cssUnquote(c);
    var m = /^attr\((.+)\)$/.exec(c);
    if (m) txt = src.getAttribute(m[1]) || '';
    if (txt == null) return;                              // url(), counter() и т. п. не переносим
    span.textContent = txt;
    var def = defaultsFor('http://www.w3.org/1999/xhtml', 'span');
    span.setAttribute('style', styleText(pcs, def));
    if (first) host.insertBefore(span, host.firstChild); else host.appendChild(span);
  }

  function loadFonts() {
    if (PL.shotFontsCSS) return Promise.resolve();
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'js/shot-fonts.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
  }

  /* DOM → картинка (canvas.toDataURL JPEG) */
  function render(node, onBuilt) {
    sandbox();
    return loadFonts().then(function () {
      var pend = [];
      view = node.getBoundingClientRect();
      var root = build(node, pend);
      if (!root) throw new Error('пустой экран');   // i18n-ok
      if (onBuilt) { try { onBuilt(); } catch (e) {} }          // экран уже скопирован: можно мигать вспышкой
      return Promise.all(pend).then(function () { return root; });
    }).then(function (root) {
      root.setAttribute('style', (root.getAttribute('style') || '') + ';position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;');
      var wrap = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      wrap.setAttribute('style', 'position:relative;width:' + W + 'px;height:' + H + 'px;overflow:hidden;background:#000');
      var st = document.createElement('style');
      st.textContent = PL.shotFontsCSS || '';
      wrap.appendChild(st);
      wrap.appendChild(root);
      var xml = new XMLSerializer().serializeToString(wrap);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' + xml + '</foreignObject></svg>';
      return new Promise(function (resolve, reject) {
        var img = new Image();
        var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        img.onload = function () {
          try {
            var cv = document.createElement('canvas');
            cv.width = W * SCALE; cv.height = H * SCALE;
            var cx = cv.getContext('2d');
            cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height);
            cx.drawImage(img, 0, 0, cv.width, cv.height);
            resolve(cv.toDataURL('image/jpeg', 0.88));
          } catch (e) { reject(e); }
        };
        img.onerror = function () { reject(new Error('не удалось собрать снимок')); };   // i18n-ok
        img.src = url;
      });
    });
  }

  /* запасной вариант: если «фотография» не собралась, сохраняем карточку-снимок (заголовок и цвет экрана) */
  function fallback(meta) {
    var cv = document.createElement('canvas');
    cv.width = W * 2; cv.height = H * 2;
    var cx = cv.getContext('2d'), c = (meta && meta.color) || '#19e3ff';
    var g = cx.createLinearGradient(0, 0, cv.width, cv.height);
    g.addColorStop(0, '#0b0d12'); g.addColorStop(1, '#1b1f2e');
    cx.fillStyle = g; cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = c; cx.globalAlpha = 0.18; cx.fillRect(0, 0, cv.width, 14); cx.globalAlpha = 1;
    cx.fillStyle = '#fff'; cx.font = '800 64px Nunito, sans-serif'; cx.textAlign = 'center';
    cx.fillText((meta && meta.title) || 'PokéLore', cv.width / 2, cv.height / 2 - 10);
    cx.fillStyle = c; cx.font = '700 34px Nunito, sans-serif';
    cx.fillText((meta && meta.sub) || '', cv.width / 2, cv.height / 2 + 60);
    return cv.toDataURL('image/jpeg', 0.85);
  }

  function take(meta) {
    meta = meta || {};
    var node = document.getElementById('crt');
    return open().then(function () { return render(node, meta.onBuilt).catch(function (e) { meta.fallback = true; if (meta.onBuilt) meta.onBuilt(); return fallback(meta); }); }).then(function (url) {
      var rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), url: url, title: meta.title || _('Снимок экрана'), sub: meta.sub || '', fallback: !!meta.fallback };
      return put(rec);
    });
  }

  function download(id) {
    var s = items.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var a = document.createElement('a');
    a.href = s.url;
    a.download = 'pokelore-' + new Date(s.t).toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.jpg';
    document.body.appendChild(a); a.click(); a.remove();
  }

  open();
  return {
    take: take, remove: remove, download: download,
    list: function () { return items.slice(); },
    count: function () { return items.length; },
    ready: open,
    on: function (evt, fn) { if (evt === 'change') handlers.push(fn); },
    _render: render,
  };
})();
