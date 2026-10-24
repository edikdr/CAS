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
      location.reload();
    },
  };
  PL.i18n.use('en');
})();
