/* ==========================================================================
   Input: device buttons (mouse / touch), keyboard, real gamepads.
   Everything becomes one PL.bus 'press' event carrying the button name:
   up down left right a b y l r plus minus home capture power volup voldown
   The gamepad is polled only while one is connected, so there is no idle loop.
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
  var held = {};              // name -> press time (for a minimum highlight duration)
  var pointerHeld = {};       // pointerId -> name
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
      if (i === 0 && el.matches('.petal, .gem, .stud')) ripple(el);
    });
    if (src !== 'proxy') PL.audio.play('btndown');   // quiet mechanical click
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

  /* short tap (proxy buttons drawn on the screen) */
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
    KeyY: 'y', KeyQ: 'l', KeyE: 'r',
    Equal: 'plus', NumpadAdd: 'plus', Slash: 'plus',
    Minus: 'minus', NumpadSubtract: 'minus', KeyM: 'minus',
    KeyH: 'home', KeyC: 'capture', KeyP: 'power',
    BracketLeft: 'voldown', BracketRight: 'volup',
  };
  function typing(e) { return e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName); }
  /* real links and buttons inside the screen keep their native Enter / Space */
  function nativeControl(e) {
    var t = e.target;
    return t && t.closest && t.closest('a[href], .screen button, .cart-info button') && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter');
  }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e)) {   // inside text fields keys behave normally; Esc / Enter leave the field
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      return;
    }
    if (nativeControl(e)) return;
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
    if (typing(e)) return;
    var name = KEYS[e.code];
    if (name) pressEnd(name);
  });
  window.addEventListener('blur', function () { Object.keys(held).forEach(pressEnd); });

  /* ---------- real gamepads (standard mapping), polled only while connected ---------- */
  // positional layout: right face button = select, bottom = back
  var GP = { 0: 'b', 1: 'a', 2: 'y', 4: 'l', 5: 'r', 6: 'l', 7: 'r', 8: 'minus', 9: 'plus',
             12: 'up', 13: 'down', 14: 'left', 15: 'right', 16: 'home', 17: 'capture' };
  var padPrev = {}, padRepeat = {}, pads = 0, padRaf = 0, stickDir = {}, stickNext = {};

  window.addEventListener('gamepadconnected', function (e) {
    pads++;
    PL.bus.emit('gamepad', { connected: true, id: e.gamepad.id });
    if (!padRaf) padRaf = requestAnimationFrame(pollPads);
  });
  window.addEventListener('gamepaddisconnected', function () {
    pads = Math.max(0, pads - 1);
    PL.bus.emit('gamepad', { connected: false });
  });

  function pollPads(now) {
    padRaf = 0;
    if (!pads || !navigator.getGamepads) return;
    if (!document.hidden) {
      var list = navigator.getGamepads();
      for (var p = 0; p < list.length; p++) {
        var gp = list[p];
        if (!gp) continue;
        var prev = padPrev[gp.index] || (padPrev[gp.index] = {});
        for (var b in GP) {
          var btn = gp.buttons[b];
          if (!btn) continue;
          var down = btn.pressed || btn.value > 0.5, name = GP[b];
          if (down && !prev[b]) { unlock(); pressStart(name, 'pad'); padRepeat[name] = now + 360; }
          else if (!down && prev[b]) { pressEnd(name); delete padRepeat[name]; }
          else if (down && DIRS[name] && now >= padRepeat[name]) { PL.bus.emit('press', { name: name, src: 'pad' }); padRepeat[name] = now + 120; }
          prev[b] = down;
        }
        // left stick navigates, right stick scrolls
        var x = gp.axes[0] || 0, y = gp.axes[1] || 0, k = gp.index;
        if (Math.hypot(x, y) > 0.5) {
          var dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
          if (dir !== stickDir[k]) { stickDir[k] = dir; stickNext[k] = now + 380; PL.bus.emit('press', { name: dir, src: 'pad' }); }
          else if (now >= stickNext[k]) { stickNext[k] = now + 140; PL.bus.emit('press', { name: dir, src: 'pad' }); }
        } else stickDir[k] = null;
        var rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
        if (Math.hypot(rx, ry) > 0.2) PL.bus.emit('scroll', { x: rx, y: ry });
      }
    }
    padRaf = requestAnimationFrame(pollPads);
  }

  /* ---------- tooltips on device buttons ---------- */
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

  return { tap: tap };
})();
