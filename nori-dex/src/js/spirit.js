/* ==========================================================================
   Spirit Quiz screen (owner: Sonnet). Registers 'spirit' with PL.sections; the Nori-Dex opens it with
   ctx.go('spirit') and B comes back.

   Flow: the dialog kit (js/quiz.js: typewriter and the menu cursor) asks three questions from
   js/quiz-data.js. Meanwhile the five Noris wait along the top as dim portraits and warm up as the
   answers favour them, so the player can see why. The reveal shows the spirit guardian; the choice is
   kept in localStorage 'nd-spirit' and the Nori-Dex marks that tile.
   Matching rests on each Nori's looks and mood only. It says nothing about stats, types or lore.
   ========================================================================== */
(function () {
  var S = PL.sections, QD = PL.quizData, sky = PL.sky || {};
  var KEY = 'nd-spirit';
  var esc = S.esc;
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function save(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }
  function byId(id) { return (sky.noris || []).filter(function (n) { return n.id === id; })[0]; }

  function spirit(root) {
    var ctx = S.ctx(), n = QD.questions.length;
    var sec = new S.Section(root, { sub: true, head: '<b class="sec-title">' + _('Spirit Quiz') + '</b><span class="dx-count dx-count--left"></span>' });
    var counter = sec.head.querySelector('.dx-count');
    var run = 0, answers = [], result = null, focus = 0, timers = [];
    var d = PL.quiz.dialog(root, { accent: '#E8B93A', onHints: function () { ctx.hints(); } });

    /* the five Noris, waiting */
    sec.scroll.innerHTML =
      '<div class="sq-stage">' +
        '<ul class="sq-row" aria-hidden="true">' + (sky.noris || []).map(function (nn) {
          return '<li class="sq-dot" data-id="' + esc(nn.id) + '" style="--dc:' + (S.accent[nn.id] || '#7FD6DF') + ';--lit:0"><span><img src="' + esc(nn.art.regular) + '" alt="" width="64" height="64" decoding="async"></span><b>' + esc(nn.name) + '</b></li>';
        }).join('') + '</ul>' +
        '<div class="sq-res" role="status" hidden></div>' +
      '</div>';
    var row = sec.scroll.querySelector('.sq-row'), resEl = sec.scroll.querySelector('.sq-res');

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function lights() {            // each Nori warms up by how well the answers so far fit it
      var sc = QD.tally(answers), max = Math.max(2 * answers.length, 1);
      Array.prototype.forEach.call(row.children, function (li) { li.style.setProperty('--lit', Math.min(1, (sc[li.dataset.id] || 0) / max).toFixed(2)); });
    }
    function count(text) { counter.textContent = text || ''; }

    /* ---------- the questions ---------- */
    function start() {
      var my = ++run;
      answers = []; result = null;
      resEl.hidden = true; resEl.innerHTML = '';
      row.classList.remove('is-done'); d.el.style.display = '';
      lights(); count('');
      ctx.hints();
      d.say([_('Which Nori is your spirit guardian?'), _('Three questions. No wrong answers.')], 'Nori-Dex')
        .then(function () { return ask(0, my); });
    }
    function ask(qi, my) {
      if (my !== run) return;
      var q = QD.questions[qi], who = _('Question {i} of {n}', { i: qi + 1, n: n });
      count(who);
      return d.say(q.q, who)
        .then(function () { if (my === run) return d.ask(q.options.map(function (o) { return o.t; })); })
        .then(function (i) {
          if (my !== run || i == null) return;
          answers.push(i); lights();
          if (qi < n - 1) return ask(qi + 1, my);
          return reveal(my);
        });
    }

    /* ---------- the reveal ---------- */
    function reveal(my) {
      var out = QD.outcome(answers), nori = byId(out.winner), acc = S.accent[out.winner] || '#E8B93A';
      save(out.winner);
      return d.say(_('The Nori-Dex hums, and the light settles on…'), 'Nori-Dex').then(function () {
        if (my !== run) return;
        result = { id: out.winner, nori: nori };
        d.el.style.display = 'none';
        row.classList.add('is-done'); count(_('Your guardian'));
        var shards = '';
        for (var k = 0; k < 10; k++) shards += '<i style="--a:' + (k * 36) + 'deg;--r:' + (74 + (k % 3) * 16) + 'px"></i>';
        resEl.style.setProperty('--dc', acc);
        resEl.innerHTML =
          '<div class="sq-pic"><span class="sq-burst" aria-hidden="true">' + shards + '</span><span class="sq-ring"><img src="' + esc(nori.art.regular) + '" alt="' + esc(nori.name + ': ' + nori.appearance) + '" width="120" height="120"></span></div>' +
          '<div class="sq-txt"><p class="sq-kick">' + _('Your spirit guardian') + '</p><h3>' + esc(nori.name) + '</h3>' +
            '<p class="sq-match">' + esc(QD.match[out.winner]) + '</p>' +
            '<p class="sq-look">' + esc(nori.appearance) + '</p>' +
            '<div class="sq-btns"><button class="sq-btn is-sel" data-sq="meet">' + _('Meet {name}', { name: nori.name }) + '</button>' +
            '<button class="sq-btn" data-sq="again">' + _('Try again') + '</button></div>' +
            '<p class="sq-foot">' + _('Matched by looks and mood, just for fun. Not a game stat.') + '</p></div>';
        resEl.hidden = false; focus = 0;
        resEl.classList.remove('is-on'); void resEl.offsetWidth; resEl.classList.add('is-on');
        ctx.audio('sparkle'); later(function () { ctx.audio('seat'); }, 260);
        ctx.ambient(acc);
        ctx.hints();
      });
    }
    function mark() {
      Array.prototype.forEach.call(resEl.querySelectorAll('.sq-btn'), function (b, i) { b.classList.toggle('is-sel', i === focus); });
    }
    function act(which) {
      if (!result) return;
      if (which === 1) { ctx.audio('card'); ctx.ambient(null); return start(); }
      ctx.audio('open');
      S.hand = { card: result.id };
      if (!ctx.back()) S.hand = null;
    }
    function onClick(e) {
      var b = e.target.closest('[data-sq]');
      if (!b || !result) return;
      if (e.detail > 0 && b.blur) b.blur();
      act(b.dataset.sq === 'again' ? 1 : 0);
    }
    root.addEventListener('click', onClick);

    /* ---------- keys and hints ---------- */
    sec.press = function (name) {
      if (result) {
        switch (name) {
          case 'left': case 'up': focus = 0; mark(); ctx.audio('tick'); return true;
          case 'right': case 'down': focus = 1; mark(); ctx.audio('tick'); return true;
          case 'a': act(focus); return true;
        }
        return false;
      }
      return d.press(name) || name === 'a';
    };
    sec.hints = function () {
      if (result) return [[['up', 'down'], _('Choose')], [['a'], _('Select')], [['b'], _('Back')]];
      return d.hints().concat([[['b'], _('Back')]]);
    };
    var baseDestroy = sec.destroy;
    sec.destroy = function () {
      run++; timers.forEach(clearTimeout); timers = [];
      root.removeEventListener('click', onClick);
      d.destroy(); ctx.ambient(null);
      baseDestroy.call(sec);
    };

    start();
    return sec;
  }

  S.register('spirit', spirit);
})();
