/* ==========================================================================
   Dialog kit: the typewriter text box and the ▶ menu of the original quiz
   engine, cut loose from any quiz rules so a screen can embed it.
   Built for the Spirit Quiz (Sonnet, S4) but usable by any screen.

     var d = PL.quiz.dialog(hostElement, { accent: '#E8B93A' });
     d.say(['First page.', 'Second page.'], 'Who speaks')   -> Promise (after the last page)
      .then(function () { return d.ask(['Option one', 'Option two', 'Option three']); })
      .then(function (index) { ... });
     d.press(name) -> true if handled   (forward the screen's key presses here)
     d.hints()     -> [[keys, label], ...] for the bottom bar
     d.destroy()   -> stops typing, removes the markup

   Text longer than three lines is split into pages automatically.
   Keys: A (Enter) skips typing / next page / picks; up/down move the cursor;
   digits 1 to 9 pick directly while a menu is open. Reduced motion prints at once.
   ========================================================================== */
window.PL = window.PL || {};

PL.quiz = (function () {
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function snd(n) { if (PL.audio) PL.audio.play(n); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function dialog(host, opts) {
    opts = opts || {};
    var box = document.createElement('div');
    box.className = 'q-box';
    if (opts.accent) box.style.setProperty('--qa', opts.accent);
    box.innerHTML =
      '<div class="q-menu" role="listbox"></div>' +
      '<div class="q-dialog" aria-live="polite"><div class="q-who"></div>' +
        '<div class="q-text"><span class="tw-a"></span><span class="tw-b" aria-hidden="true"></span></div>' +
        '<div class="q-text q-meas" aria-hidden="true">Ag</div><i class="q-more"></i></div>';
    host.appendChild(box);
    var E = {
      dialog: box.querySelector('.q-dialog'), who: box.querySelector('.q-who'), ta: box.querySelector('.tw-a'), tb: box.querySelector('.tw-b'),
      meas: box.querySelector('.q-meas'), more: box.querySelector('.q-more'), menu: box.querySelector('.q-menu'),
    };
    var st = { phase: 'idle', onA: null, menu: null, alive: true };
    var tw = { full: '', i: 0, timer: 0, done: null, on: false };

    /* ---------- typewriter ---------- */
    function typeStop() { clearTimeout(tw.timer); tw.on = false; E.dialog.classList.remove('is-typing'); }
    function finishType() {
      clearTimeout(tw.timer);
      tw.on = false;
      E.dialog.classList.remove('is-typing');
      var cb = tw.done; tw.done = null;
      if (cb) cb();
    }
    function typeText(text, done) {
      typeStop();
      tw.full = text; tw.i = 0; tw.done = done; tw.on = true;
      E.ta.textContent = ''; E.tb.textContent = text;
      E.more.classList.remove('is-on');
      E.dialog.classList.add('is-typing');
      if (reduce) { tw.i = text.length; E.ta.textContent = text; E.tb.textContent = ''; return finishType(); }
      (function step() {
        if (!st.alive) return typeStop();
        var ch = tw.full.charAt(tw.i);
        tw.i++;
        E.ta.textContent = tw.full.slice(0, tw.i);
        E.tb.textContent = tw.full.slice(tw.i);
        if (ch !== ' ' && (tw.i % 2) === 0) snd('blip');
        if (tw.i >= tw.full.length) return finishType();
        var nxt = tw.full.charAt(tw.i), d = 30;
        if (/[.!?…]/.test(ch) && (nxt === ' ' || nxt === '')) d = 300;
        else if (/[,;:—]/.test(ch)) d = 140;
        tw.timer = setTimeout(step, d);
      })();
    }
    function typeSkip() {
      if (!tw.on) return false;
      clearTimeout(tw.timer);
      tw.i = tw.full.length;
      E.ta.textContent = tw.full; E.tb.textContent = '';
      finishType();
      return true;
    }

    /* split long text into pages of three lines: by sentence first, then by word;
       line width is measured with a hidden copy of the text block */
    function nlines(t) {
      E.meas.textContent = t;
      var lh = parseFloat(getComputedStyle(E.meas).lineHeight) || 24;
      return Math.round(E.meas.offsetHeight / lh);
    }
    function paginate(text) {
      if (nlines(text) <= 3) return [text];
      var sents = text.match(/[^.!?…]+[.!?…]+[)"]*\s*|[^.!?…]+$/g) || [text];
      var pages = [], cur = '', out = [];
      sents.forEach(function (x) {
        x = x.replace(/^\s+|\s+$/g, '');
        if (!x) return;
        var cand = cur ? cur + ' ' + x : x;
        if (nlines(cand) <= 3) cur = cand; else { if (cur) pages.push(cur); cur = x; }
      });
      if (cur) pages.push(cur);
      pages.forEach(function (p) {
        if (nlines(p) <= 3) return out.push(p);
        var c = '';
        p.split(' ').forEach(function (w) { var cand = c ? c + ' ' + w : w; if (nlines(cand) <= 3) c = cand; else { out.push(c); c = w; } });
        if (c) out.push(c);
      });
      return out;
    }

    function setWho(w) {
      E.who.textContent = w || '';
      E.who.style.display = w ? '' : 'none';
    }

    /* one or more pages; between pages wait for A */
    function say(pages, who) {
      return new Promise(function (resolve) {
        if (!st.alive) return;
        if (typeof pages === 'string') pages = [pages];
        pages = [].concat.apply([], pages.map(paginate));
        var k = 0;
        setWho(who);
        hideMenu();
        st.phase = 'type';
        changed();
        (function page() {
          typeText(pages[k], function () {
            if (k < pages.length - 1) {
              st.phase = 'wait'; E.more.classList.add('is-on');
              st.onA = function () { k++; st.onA = null; st.phase = 'type'; E.more.classList.remove('is-on'); snd('click'); changed(); page(); };
              changed();
            } else { st.phase = 'idle'; changed(); resolve(); }
          });
        })();
      });
    }

    /* ---------- ▶ menu ---------- */
    function ask(items, o) {
      o = o || {};
      return new Promise(function (resolve) {
        if (!st.alive) return;
        st.phase = 'menu';
        st.menu = { items: items, sel: o.sel || 0, resolve: resolve };
        E.menu.className = 'q-menu is-open' + (o.cls ? ' ' + o.cls : '');
        E.menu.innerHTML = items.map(function (it, i) {
          return '<button class="q-opt" data-i="' + i + '" role="option"><i class="q-cur"></i><span class="q-num">' + (i + 1) + '</span><span class="q-ot">' + esc(it) + '</span></button>';
        }).join('');
        setSel(st.menu.sel, false);
        snd('card');
        changed();
      });
    }
    function hideMenu() { st.menu = null; E.menu.className = 'q-menu'; }
    function setSel(i, sound) {
      var m = st.menu; if (!m) return;
      m.sel = i;
      var rows = E.menu.children;
      for (var k = 0; k < rows.length; k++) { rows[k].classList.toggle('is-sel', k === i); rows[k].setAttribute('aria-selected', k === i ? 'true' : 'false'); }
      if (sound) snd('qcursor');
    }
    function pick() {
      var m = st.menu; if (!m) return;
      var i = m.sel, row = E.menu.children[i];
      snd('qpick');
      if (row) row.classList.add('is-pick');
      st.menu = null; st.phase = 'idle';
      setTimeout(function () { if (st.alive) { E.menu.className = 'q-menu'; m.resolve(i); changed(); } }, reduce ? 0 : 220);
    }

    /* ---------- input ---------- */
    E.dialog.addEventListener('pointerdown', function () { press('a'); });
    E.menu.addEventListener('pointermove', function (e) {
      var o = e.target.closest('.q-opt');
      if (o && e.pointerType === 'mouse' && st.menu && st.menu.sel !== +o.dataset.i && (e.movementX || e.movementY)) setSel(+o.dataset.i, true);
    });
    E.menu.addEventListener('click', function (e) {
      var o = e.target.closest('.q-opt');
      if (o && st.menu) { setSel(+o.dataset.i, true); pick(); }
    });
    function onKey(e) {
      if (!st.menu || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      var n = +e.key;
      if (n >= 1 && n <= st.menu.items.length) { e.preventDefault(); e.stopImmediatePropagation(); setSel(n - 1, true); pick(); }
    }
    document.addEventListener('keydown', onKey, true);

    function press(name) {
      if (!st.alive) return false;
      var m = st.menu;
      if (m) {
        switch (name) {
          case 'up': case 'left': setSel((m.sel + m.items.length - 1) % m.items.length, true); return true;
          case 'down': case 'right': setSel((m.sel + 1) % m.items.length, true); return true;
          case 'a': pick(); return true;
        }
        return false;
      }
      if (tw.on) { if (name === 'a') { typeSkip(); return true; } return false; }
      if (st.phase === 'wait' && st.onA && name === 'a') { st.onA(); return true; }
      return false;
    }
    function hints() {
      if (st.menu) return [[['up', 'down'], _('Choose')], [['a'], _('Select')]];
      if (st.phase === 'wait') return [[['a'], _('Next')]];
      if (tw.on) return [[['a'], _('Skip text')]];
      return [];
    }
    function changed() { if (opts.onHints) opts.onHints(); }

    if (document.fonts && document.fonts.load) document.fonts.load('24px Tiny5', 'Ag').catch(function () {});

    return {
      say: say, ask: ask, press: press, hints: hints, skip: typeSkip,
      destroy: function () {
        st.alive = false; typeStop(); hideMenu();
        document.removeEventListener('keydown', onKey, true);
        box.remove();
      },
      el: box,
    };
  }

  return { dialog: dialog };
})();
