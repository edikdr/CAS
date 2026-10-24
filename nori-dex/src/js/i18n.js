/* ==========================================================================
   Язык интерфейса (RU / EN). Подключается ПЕРВЫМ скриптом.

   Как это устроено:
   • Ключ перевода — сама русская фраза. В русском режиме _('Текст') возвращает её же,
     в английском берёт перевод из словаря (js/en/*.js → PL.i18n.add({...})).
   • _('Найдено {n} карточек', { n: 5 })      — подстановка {имя}
   • _n(5, 'карточка|карточки|карточек')      — склонение по числу (в EN: 'card|cards')
   • PL.L('js/x.js')                          — подключить скрипт (document.write, по порядку)
     PL.L('js/x.js', 'js/en/x.js')            — в EN вместо x.js грузится англ. версия файла-данных
     PL.L(null, 'js/en/ui.js')                — файл только для EN (словарь)
   • PL.lang — 'ru' | 'en'; PL.loc — локаль для toLocaleString; PL.i18n.set('en') — сохранить и перезагрузить.
   • Язык хранится в localStorage['pl-lang']; ?lang=en в адресе — тоже работает (и запоминается).
   ========================================================================== */
window.PL = window.PL || {};

(function () {
  var lang = 'ru';
  try {
    var q = /[?&]lang=(ru|en)\b/.exec(location.search);
    if (q) { lang = q[1]; try { localStorage.setItem('pl-lang', lang); } catch (e) {} }
    else { var s = localStorage.getItem('pl-lang'); if (s === 'ru' || s === 'en') lang = s; }
  } catch (e) {}

  var dict = {}, missing = {};
  var PLURAL_RU = function (n) {
    n = Math.abs(n) | 0;
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 0;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 1;
    return 2;
  };

  function fill(s, v) {
    if (!v) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; });
  }

  /* _('Русская фраза', {vars}) */
  window._ = function (key, vars) {
    var s = key;
    if (lang !== 'ru') {
      var t = dict[key];
      if (t == null) { if (!missing[key]) missing[key] = 1; }
      else s = t;
    }
    return vars ? fill(s, vars) : s;
  };

  /* _n(n, 'карточка|карточки|карточек') → нужная форма (без самого числа) */
  window._n = function (n, forms) {
    var f;
    if (lang !== 'ru') {
      var t = dict[forms];
      if (t != null) { f = t.split('|'); return n === 1 || f.length < 2 ? f[0] : f[1]; }
      if (!missing[forms]) missing[forms] = 1;
    }
    f = forms.split('|');
    return f[Math.min(PLURAL_RU(n), f.length - 1)];
  };

  PL.lang = lang;
  PL.loc = lang === 'en' ? 'en-US' : 'ru-RU';
  PL.i18n = {
    dict: dict,
    missing: missing,
    add: function (o) { for (var k in o) dict[k] = o[k]; },
    set: function (l) {
      if (l !== 'ru' && l !== 'en') return;
      try { localStorage.setItem('pl-lang', l); } catch (e) {}
      try {
        var u = new URL(location.href);
        u.searchParams.delete('lang');
        location.replace(u.toString());
      } catch (e) { location.reload(); }
    }
  };

  /* загрузчик скриптов: синхронно, в порядке подключения (работает и с file://) */
  PL.L = function (ru, en) {
    var src = lang === 'en' ? (en !== undefined ? en : ru) : ru;
    if (!src) return;
    document.write('<script src="' + src + '"><\/script>');
  };

  /* Разовый проход по статической разметке index.html (тексты и атрибуты → словарь js/en/html.js).
     Динамические тексты переводятся на месте через _(). В RU ничего не делает. */
  var CYR = /[А-Яа-яЁё]/;
  PL.i18n.dom = function (root) {
    if (lang === 'ru') return;
    root = root || document.documentElement;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    function tr(s) {
      var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), t = m[2];
      var r = dict[t];
      if (r == null) { if (!missing[t]) missing[t] = 1; return s; }
      return m[1] + r + m[3];
    }
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) {
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE') continue;
        if (CYR.test(n.nodeValue)) n.nodeValue = tr(n.nodeValue);
      } else {
        var a = n.attributes;
        for (var i = 0; i < a.length; i++) if (CYR.test(a[i].value)) a[i].value = tr(a[i].value);
      }
    }
    if (CYR.test(document.title)) document.title = tr(document.title);
  };

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.lang-seg [data-lang]');
    if (b && b.getAttribute('data-lang') !== lang) PL.i18n.set(b.getAttribute('data-lang'));
  });

  document.documentElement.lang = lang;
  document.documentElement.setAttribute('data-lang', lang);
})();
