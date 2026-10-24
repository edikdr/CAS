/* ==========================================================================
   Input: device buttons (mouse / touch), keyboard, sticks, real gamepads.
   Everything becomes one PL.bus 'press' event carrying the button name:
   up down left right a b x y l r plus minus home capture power volup voldown ls rs
   ========================================================================== */
window.PL = window.PL || {};

PL.bus = (function () {
  var map = {};
  return {
    on: function (evt, fn) { (map[evt] = map[evt] || []).push(fn); },
    emit: function (evt, data) { (map[evt] || []).forEach(function (fn) { fn(data); }); },
  };
})();

PL.input = (function () {
  var DIRS = { up: 1, down: 1, left: 1, right: 1 };
  var STICK_R = 13;           // stick travel in design pixels
  var held = {};              // name -> press time (for a minimum highlight duration)
  var pointerHeld = {};       // pointerId -> name
  var sticks = {
    left:  { x: 0, y: 0, src: null, el: null, lastDir: null, next: 0 },
    right: { x: 0, y: 0, src: null, el: null },
  };
  var unlocked = false;
  var hoverCapable = window.matchMedia && matchMedia('(hover: hover)').matches;

  function els(name) { return document.querySelectorAll('[data-btn="' + name + '"]'); }

  function ripple(el) {
    var r = document.createElement('span');
    r.className = 'ripple';
    el.appendChild(r);
    setTimeout(function () { r.remove(); }, 460);
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    PL.audio.unlock();
    PL.bus.emit('unlock');
  }

  function pressStart(name, src) {
    held[name] = performance.now();
    els(name).forEach(function (el, i) {
      el.classList.add('is-pressed');
      if (i === 0 && el.matches('.dbtn, .fbtn, .jc-home, .jc-capture')) ripple(el);
    });
    if (src !== 'proxy' && src !== 'stick') PL.audio.play('btndown');   // quiet mechanical click
    PL.bus.emit('press', { name: name, src: src });
  }

  function pressEnd(name) {
    var t = held[name];
    if (t === undefined) return;
    delete held[name];
    var wait = Math.max(0, 110 - (performance.now() - t));
    setTimeout(function () {
      if (held[name] !== undefined) return;
      els(name).forEach(function (el) { el.classList.remove('is-pressed'); });
      PL.audio.play('btnup');
    }, wait);
  }

  /* short tap (proxy buttons and sticks) */
  function tap(name, src) { pressStart(name, src); pressEnd(name); }

  /* ---------- mouse / touch on buttons ---------- */
  document.addEventListener('pointerdown', function (e) {
    unlock();
    hideTip();
    var el = e.target.closest('[data-btn], [data-btn-proxy]');
    if (!el) return;
    e.preventDefault();
    if (e.pointerType === 'touch' && navigator.vibrate) navigator.vibrate(8);
    if (el.dataset.btnProxy) { tap(el.dataset.btnProxy, 'proxy'); return; }
    var name = el.dataset.btn;
    pointerHeld[e.pointerId] = name;
    pressStart(name, 'pointer');
  });
  function releasePointer(e) {
    var name = pointerHeld[e.pointerId];
    if (!name) return;
    delete pointerHeld[e.pointerId];
    pressEnd(name);
  }
  document.addEventListener('pointerup', releasePointer);
  document.addEventListener('pointercancel', releasePointer);

  /* ---------- keyboard ---------- */
  var KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Enter: 'a', Space: 'a', NumpadEnter: 'a',
    Escape: 'b', Backspace: 'b',
    KeyX: 'x', KeyY: 'y', KeyQ: 'l', KeyE: 'r',
    Equal: 'plus', NumpadAdd: 'plus', Slash: 'plus',
    Minus: 'minus', NumpadSubtract: 'minus', KeyM: 'minus',
    KeyH: 'home', KeyC: 'capture', KeyP: 'power',
    BracketLeft: 'voldown', BracketRight: 'volup',
  };
  function typing(e) { return e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName); }
  function onPill(e) { return e.target && e.target.closest && e.target.closest('.lang-seg'); }   // segmented buttons keep native Enter / Space
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || onPill(e)) return;
    if (typing(e)) {   // inside text fields keys behave normally; Esc / Enter leave the field
      if (e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); } return; }     // Enter makes a new line in a textarea
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); e.target.blur(); }
      return;
    }
    var name = KEYS[e.code];
    if (!name) return;
    e.preventDefault();
    unlock();
    if (e.repeat) {
      if (DIRS[name] || name === 'volup' || name === 'voldown') PL.bus.emit('press', { name: name, src: 'key' });
      return;
    }
    pressStart(name, 'key');
  });
  document.addEventListener('keyup', function (e) {
    if (typing(e) || onPill(e)) return;
    var name = KEYS[e.code];
    if (name) pressEnd(name);
  });
  window.addEventListener('blur', function () { Object.keys(held).forEach(pressEnd); });

  /* ---------- sticks (drag with mouse or finger) ---------- */
  function setCap(side, x, y) {
    var s = sticks[side];
    if (!s.el) return;
    s.el.style.setProperty('--sx', (x * STICK_R).toFixed(2) + 'px');
    s.el.style.setProperty('--sy', (y * STICK_R).toFixed(2) + 'px');
    s.el.style.setProperty('--kx', x.toFixed(3));   // -1..1: CSS derives cap tilt and shadow offset
    s.el.style.setProperty('--ky', y.toFixed(3));
  }

  document.querySelectorAll('[data-stick]').forEach(function (el) {
    var side = el.dataset.stick;
    var s = sticks[side];
    s.el = el;
    var start = null;

    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging', 'is-down');
      var r = el.getBoundingClientRect();
      start = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, t: performance.now(), moved: 0 };
      s.src = 'pointer';
    });
    el.addEventListener('pointermove', function (e) {
      if (!start) return;
      var scale = PL.scale || 1;
      var dx = (e.clientX - start.cx) / scale;
      var dy = (e.clientY - start.cy) / scale;
      var len = Math.hypot(dx, dy);
      start.moved = Math.max(start.moved, len);
      if (start.moved > 5) el.classList.remove('is-down');   // dragged: no longer a stick click
      var lim = STICK_R * 1.6; // drag distance to full travel
      var k = len > lim ? lim / len : 1;
      s.x = (dx * k) / lim;
      s.y = (dy * k) / lim;
      setCap(side, s.x, s.y);
    });
    function end() {
      if (!start) return;
      var quick = performance.now() - start.t < 280 && start.moved < 5;
      start = null;
      s.x = 0; s.y = 0; s.src = null;
      s.lastDir = null;
      el.classList.remove('is-dragging', 'is-down');
      setCap(side, 0, 0);
      if (quick) tap(side === 'left' ? 'ls' : 'rs', 'stick');
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  });

  /* ---------- real gamepads (standard mapping) ---------- */
  // positional layout: right face button = A, bottom = B, top = X, left = Y
  var GP = { 0: 'b', 1: 'a', 2: 'y', 3: 'x', 4: 'l', 5: 'r', 6: 'l', 7: 'r', 8: 'minus', 9: 'plus',
             10: 'ls', 11: 'rs', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 16: 'home', 17: 'capture' };
  var padPrev = {};
  var padRepeat = {}; // name -> next repeat time

  window.addEventListener('gamepadconnected', function (e) {
    PL.bus.emit('gamepad', { connected: true, id: e.gamepad.id });
  });
  window.addEventListener('gamepaddisconnected', function () {
    PL.bus.emit('gamepad', { connected: false });
  });

  function dead(v) { return Math.abs(v) < 0.22 ? 0 : v; }

  function pollPads(now) {
    if (!navigator.getGamepads) return;
    var pads = navigator.getGamepads();
    for (var p = 0; p < pads.length; p++) {
      var gp = pads[p];
      if (!gp) continue;
      var prev = padPrev[gp.index] || (padPrev[gp.index] = {});
      for (var b in GP) {
        var btn = gp.buttons[b];
        if (!btn) continue;
        var down = btn.pressed || btn.value > 0.5;
        var name = GP[b];
        if (down && !prev[b]) { unlock(); pressStart(name, 'pad'); padRepeat[name] = now + 360; }
        else if (!down && prev[b]) { pressEnd(name); delete padRepeat[name]; }
        else if (down && DIRS[name] && now >= padRepeat[name]) {
          PL.bus.emit('press', { name: name, src: 'pad' });
          padRepeat[name] = now + 120;
        }
        prev[b] = down;
      }
      // gamepad sticks move the drawn sticks
      [['left', 0, 1], ['right', 2, 3]].forEach(function (a) {
        var s = sticks[a[0]];
        if (s.src === 'pointer') return;
        var x = dead(gp.axes[a[1]] || 0), y = dead(gp.axes[a[2]] || 0);
        if (x || y) {
          s.src = 'pad'; s.x = x; s.y = y;
          s.el && s.el.classList.add('is-pad');
          setCap(a[0], x, y);
        } else if (s.src === 'pad') {
          s.src = null; s.x = 0; s.y = 0; s.lastDir = null;
          s.el && s.el.classList.remove('is-pad');
          setCap(a[0], 0, 0);
        }
      });
    }
  }

  /* ---------- loop: sticks -> navigation / scrolling ---------- */
  function loop(now) {
    requestAnimationFrame(loop);
    pollPads(now);

    var L = sticks.left;
    var mag = Math.hypot(L.x, L.y);
    if (mag > 0.5) {
      var dir = Math.abs(L.x) > Math.abs(L.y) ? (L.x > 0 ? 'right' : 'left') : (L.y > 0 ? 'down' : 'up');
      if (dir !== L.lastDir) { L.lastDir = dir; L.next = now + 380; PL.bus.emit('press', { name: dir, src: 'stick' }); }
      else if (now >= L.next) { L.next = now + 140; PL.bus.emit('press', { name: dir, src: 'stick' }); }
    } else if (mag < 0.3) {
      L.lastDir = null;
    }

    var R = sticks.right;
    if (Math.hypot(R.x, R.y) > 0.15) PL.bus.emit('scroll', { x: R.x, y: R.y });
  }
  requestAnimationFrame(loop);

  /* ---------- tooltips on buttons ---------- */
  var tip = document.getElementById('tip');
  var tipTimer = 0;
  function hideTip() { clearTimeout(tipTimer); tip.classList.remove('is-show'); document.body.classList.remove('tip-on'); }
  if (hoverCapable) {
    document.addEventListener('pointerover', function (e) {
      if (e.pointerType !== 'mouse') return;
      var el = e.target.closest('[data-tip]');
      if (!el) return;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () {
        tip.innerHTML = '';
        tip.append(el.dataset.tip);
        if (el.dataset.key) {
          var k = document.createElement('kbd');
          k.textContent = el.dataset.key;
          tip.appendChild(k);
        }
        tip.classList.add('is-show');
        document.body.classList.add('tip-on');
      }, 180);
    });
    document.addEventListener('pointerout', function (e) {
      var el = e.target.closest('[data-tip]');
      if (el && !el.contains(e.relatedTarget)) hideTip();
    });
  }

  return { tap: tap, sticks: sticks };
})();
