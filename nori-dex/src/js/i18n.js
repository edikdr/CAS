/* ==========================================================================
   Interface language. Loaded FIRST.

   The rule (see HANDOFF.md):
   • English is the source language. Every user-visible string in code is written
     in English and wrapped: _('Seat a relic'). The English text IS the key.
   • _('Found {n} Noris', { n: 5 })     → placeholder substitution {name}
   • _n(5, 'Nori|Noris')                 → plural form without the number ('one|other')
   • Another language = one dictionary file, e.g. js/i18n/es.js:
       PL.i18n.add('es', { 'Seat a relic': 'Coloca una reliquia', 'Nori|Noris': 'Nori|Noris' });
     listed in index.html right after this file (and in build.mjs CORE).
     Missing keys fall back to English, and are collected in PL.i18n.missing.
   • Language choice: ?lang=xx in the URL, then localStorage 'nd-lang', then the
     browser language; only languages with a loaded dictionary are used.
   ========================================================================== */
window.PL = window.PL || {};

(function () {
  var dicts = {}, missing = {};
  var lang = 'en';

  function pickLang() {
    var want = [];
    try {
      var q = /[?&]lang=([a-z]{2})\b/.exec(location.search);
      if (q) want.push(q[1]);
      var s = localStorage.getItem('nd-lang');
      if (s) want.push(s);
    } catch (e) {}
    if (navigator.language) want.push(navigator.language.slice(0, 2).toLowerCase());
    for (var i = 0; i < want.length; i++) if (want[i] === 'en' || dicts[want[i]]) return want[i];
    return 'en';
  }

  function fill(s, v) {
    if (!v) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; });
  }

  function lookup(key) {
    if (lang === 'en') return key;
    var t = dicts[lang] && dicts[lang][key];
    if (t == null) { missing[key] = 1; return key; }
    return t;
  }

  window._ = function (key, vars) { return fill(lookup(key), vars); };

  window._n = function (n, forms) {
    var f = lookup(forms).split('|');
    return Math.abs(n) === 1 || f.length < 2 ? f[0] : f[1];
  };

  PL.i18n = {
    missing: missing,
    /* add(lang, dict): register (or extend) a dictionary; re-picks the language */
    add: function (l, o) {
      var d = dicts[l] = dicts[l] || {};
      for (var k in o) d[k] = o[k];
      PL.i18n.use(pickLang());
    },
    use: function (l) {
      lang = l;
      PL.lang = l;
      PL.loc = l === 'en' ? 'en-GB' : l;
      document.documentElement.lang = l;
    },
    set: function (l) {
      try { localStorage.setItem('nd-lang', l); } catch (e) {}
      try {                                   // a ?lang= in the address would win over the choice just made
        var u = new URL(location.href);
        if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); location.replace(u.toString()); return; }
      } catch (e) {}
      location.reload();
    },
    current: function () { return lang; },
    /* Translate the static text of the page (index.html is not wrapped in _()): text nodes, and the labels,
       tooltips, alt texts, the title and the description. An exact match with a dictionary key is replaced;
       anything else is left alone. Runs once, from the dictionary file, when the language is not English. */
    page: function (root) {
      if (lang === 'en') return;
      var d = dicts[lang] || {}, ATTRS = ['aria-label', 'data-tip', 'alt', 'title'];
      function tr(t) { var k = t.replace(/\s+/g, ' ').trim(); return k && d[k] != null ? t.replace(k, d[k]) : t; }
      var el = root || document.body, w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, list = [];
      while ((n = w.nextNode())) { if (!/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) list.push(n); }
      list.forEach(function (t) { var v = tr(t.nodeValue); if (v !== t.nodeValue) t.nodeValue = v; });
      el.querySelectorAll('[aria-label],[data-tip],[alt],[title]').forEach(function (e) {
        ATTRS.forEach(function (a) { if (e.hasAttribute(a)) { var v = tr(e.getAttribute(a)); if (v !== e.getAttribute(a)) e.setAttribute(a, v); } });
      });
      if (!root) {
        document.title = tr(document.title);
        var m = document.querySelector('meta[name="description"]'); if (m) m.setAttribute('content', tr(m.getAttribute('content')));
      }
    },
  };
  PL.i18n.use('en');
})();
