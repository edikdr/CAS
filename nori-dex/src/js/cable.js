/* ==========================================================================
   Power cable: it always dangles from the top, and to switch the device on it
   has to be pulled to the socket on the body.

   • Physics: a 34-point rope (Verlet), so the cable is real: it hangs from the top edge
     of the window, sways in the breeze and under the hand, follows the plug, sags when plugged.
     The plug is heavier than the cable, so it hangs tip down and swings like a pendulum.
   • Control: grab the plug with mouse or finger and pull it to the socket. Near the socket
     the plug snaps into alignment; pull it home and it goes in and the screen powers on.
     To unplug, pull it away from the socket (or click it).
   • Drawing: a canvas above the device; the cable is a shaded tube (shadow, dark edge, body,
     highlight), the plug has a collar, body and tip. The tip disappears BEHIND the body edge.
   All sizes inside the simulation are design pixels (screen pixels / device scale).
   API: dangle() drops the cable from the top, plugIn({fast}) plugs it in, unplug(), snap(),
        isPlugged(), busy(), on('contact' | 'pull' | 'push' | 'grab' | 'drop', fn)
        'pull' can be cancelled by returning false.
   ========================================================================== */
window.PL = window.PL || {};

PL.cable = (function () {
  var cv = document.getElementById('cable');
  var port = document.querySelector('.port');
  var NOOP = { plugIn: function () { return Promise.resolve(); }, unplug: function () { return Promise.resolve(); }, dangle: function () {}, snap: function () {}, isPlugged: function () { return false; }, busy: function () { return false; }, on: function () {}, resize: function () {} };
  if (!cv || !port) return NOOP;
  var cx = cv.getContext('2d');
  var M = PL.motion;

  var N = 34;                 // rope points
  var LEN = 150;              // rope length from the top edge to the plug (recomputed for the window height)
  var SEG = LEN / (N - 1);
  var PLUG = { relief: 13, house: 27, tip: 16, w: 30 };   // plug dimensions
  var PLUG_LEN = PLUG.relief + PLUG.house + PLUG.tip;
  var DEPTH = 15;             // how deep the tip goes into the body (almost all of it)
  var SOCKET = 5;             // how much of that stays visible inside the socket
  var CABLE_W = 9;
  var AX = 74;                // the cable's top end sits this far right of the socket
  var MAG = 64;               // radius in which the plug snaps to the socket
  var DEG = Math.PI / 180;

  var dpr = 1, W = 0, H = 0;
  var S = 1;                  // device scale
  var P = [], Q = [];         // positions and previous positions (design coordinates)
  var state = 'away';         // away | dangle | drag | seq | plugged
  var seq = null;             // scripted sequence: { kind, def, resolve }
  var tSim = 0, raf = 0, lastT = 0, rest = 0, clock = 0;
  var slow = 1;
  var axis = { x: 0, y: 1 };  // plug direction (towards the tip)
  var end = { x: 0, y: 0 };   // where the cable enters the plug
  var plugged = false;
  var handlers = {};
  var grab = null;            // { ox, oy, startX, startY, fromPlug, moved }
  var near = false;           // plug is in the socket zone
  var hot = false;            // pointer is over the plug
  var idleSince = 0;

  function emit(n, a) {
    var ok = true;
    (handlers[n] || []).forEach(function (f) { if (f(a) === false) ok = false; });
    return ok;
  }
  function on(n, f) { (handlers[n] = handlers[n] || []).push(f); }

  function portInfo() {   // top edge of the body at the socket centre, in design coordinates
    var r = port.getBoundingClientRect();
    return { x: (r.left + r.width / 2) / S, y: (r.top + 1) / S };
  }
  function anchorPos() { var pi = portInfo(); return { x: pi.x + AX, y: -20 }; }
  /* cable length: the plug hangs just below the top edge of the body and can still reach the socket */
  function setLen() {
    var pi = portInfo(), dx = AX, dy = pi.y + DEPTH - PLUG_LEN + 20;     // distance from the window edge to a plug seated in the socket
    LEN = Math.max(120, pi.y + 12, Math.sqrt(dx * dx + dy * dy) + 8);
    SEG = LEN / (N - 1);
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    S = PL.scale || 1;
    W = window.innerWidth;
    // draw only in the band above the device (plus margin): a much smaller canvas, cheaper frames
    var pr = port.getBoundingClientRect();
    H = Math.max(80, Math.min(window.innerHeight, Math.ceil(pr.top + 110)));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (state === 'plugged') { setLen(); place(); settle(); }
    else if (state === 'dangle' || state === 'drag') { setLen(); hang(); }
    wake();
  }

  /* ---------- rope ---------- */
  function lineInit(a, b) {
    P = []; Q = [];
    for (var i = 0; i < N; i++) {
      var k = i / (N - 1);
      var p = { x: M.mix(a.x, b.x, k), y: M.mix(a.y, b.y, k) };
      P.push(p); Q.push({ x: p.x, y: p.y });
    }
  }

  /* ctl: { anchor, end (plug point, or null for a free end), axis, wind } */
  function stepPhysics(h, ctl) {
    var g = 1700, free = !ctl.end, damp = free ? (ctl.calm ? 0.982 : 0.989) : 0.9935;
    var i, last = free ? N : N - 1;
    for (i = 1; i < last; i++) {
      var p = P[i], q = Q[i];
      var vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp;
      q.x = p.x; q.y = p.y;
      var m = (free && i >= N - 4) ? 2.5 : 1;                      // the plug is heavy
      p.x += vx + (ctl.wind || 0) * h * h * (0.4 + i / N);
      p.y += vy + g * m * h * h;
    }
    /* bending stiffness: each point is pulled slightly towards the straight continuation */
    for (i = 2; i < last; i++) {
      var tx = P[i - 1].x + (P[i - 1].x - P[i - 2].x), ty = P[i - 1].y + (P[i - 1].y - P[i - 2].y);
      P[i].x += (tx - P[i].x) * 0.055; P[i].y += (ty - P[i].y) * 0.055;
    }
    for (var it = 0; it < 18; it++) {
      P[0].x = ctl.anchor.x; P[0].y = ctl.anchor.y;
      if (!free) { P[N - 1].x = ctl.end.x; P[N - 1].y = ctl.end.y; }
      for (i = 0; i < N - 1; i++) {
        var a = P[i], b = P[i + 1];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        var diff = (d - SEG) / d;
        var wa = i === 0 ? 0 : 1, wb = (!free && i + 1 === N - 1) ? 0 : 1;
        var ws = wa + wb || 1;
        a.x += dx * diff * (wa / ws); a.y += dy * diff * (wa / ws);
        b.x -= dx * diff * (wb / ws); b.y -= dy * diff * (wb / ws);
      }
    }
    P[0].x = ctl.anchor.x; P[0].y = ctl.anchor.y;
    if (!free) {
      P[N - 1].x = ctl.end.x; P[N - 1].y = ctl.end.y;
      /* strain relief: the last points lie along the plug axis */
      for (i = 1; i <= 5; i++) {
        var f = 0.55 / i;
        var gx = ctl.end.x - ctl.axis.x * SEG * i, gy = ctl.end.y - ctl.axis.y * SEG * i;
        var pt = P[N - 1 - i];
        pt.x += (gx - pt.x) * f; pt.y += (gy - pt.y) * f;
      }
    } else {
      end.x = P[N - 1].x; end.y = P[N - 1].y;
    }
  }

  /* plug direction at a free end: along the last links, with smooth follow */
  function freeAxis() {
    var a = P[N - 4], b = P[N - 1];
    var dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l; dy /= l;
    var ax = M.mix(axis.x, dx, 0.3), ay = M.mix(axis.y, dy, 0.3), al = Math.sqrt(ax * ax + ay * ay) || 1;
    axis.x = ax / al; axis.y = ay / al;
  }

  /* ---------- poses ---------- */
  /* the cable just hangs from the top edge: plug slightly right of and below the body edge */
  function hang() {
    var A = anchorPos();
    var e = { x: A.x - 6, y: A.y + LEN };
    end.x = e.x; end.y = e.y; axis.x = 0; axis.y = 1;
    lineInit(A, e);
    for (var i = 1; i < N - 1; i++) { P[i].x -= 5 * Math.sin(i / N * 3); Q[i].x = P[i].x; }
    var ctl = { anchor: A, end: null, axis: axis };
    for (var k = 0; k < 120; k++) stepPhysics(1 / 120, ctl);
    for (i = 0; i < N; i++) { Q[i].x = P[i].x; Q[i].y = P[i].y; }
    freeAxis();
  }
  /* dropped from the top: the cable lies along the top edge and falls, swaying */
  function drop() {
    var A = anchorPos();
    lineInit(A, { x: A.x + 90, y: A.y - LEN * 0.9 });
    end.x = P[N - 1].x; end.y = P[N - 1].y;
    axis.x = 0.3; axis.y = -0.95;
  }

  function place() {   // cable plugged: put everything in place
    var pi = portInfo();
    var A = anchorPos();
    var tip = { x: pi.x, y: pi.y + DEPTH };
    var e = { x: tip.x, y: tip.y - PLUG_LEN };
    end.x = e.x; end.y = e.y; axis.x = 0; axis.y = 1;
    lineInit(A, e);
  }
  function settle() {
    var ctl = { anchor: anchorPos(), end: end, axis: axis };
    for (var i = 0; i < 300; i++) stepPhysics(1 / 120, ctl);
    for (i = 0; i < N; i++) { Q[i].x = P[i].x; Q[i].y = P[i].y; }
  }

  /* ---------- scripted sequences (plug and unplug without a hand) ---------- */
  function seqPlug(opts, from) {
    var pi = portInfo();
    var px = pi.x, py = pi.y;
    var hover = { x: px, y: py - 46 };
    var inside = { x: px, y: py + DEPTH };
    var T_SWOOP = opts.fast ? 0.5 : 0.85, T_HOVER = opts.fast ? 0.12 : 0.3, T_INS = 0.26;
    var total = T_SWOOP + T_HOVER + T_INS;
    var tip0 = { x: from.x, y: from.y };
    return {
      total: total,
      fn: function (t) {
        var pi2 = portInfo(), dx = pi2.x - px, dy = pi2.y - py;
        var tip, align = 0;
        if (t < T_SWOOP) {
          var u = M.E.io3(t / T_SWOOP);
          tip = { x: M.bez(tip0.x, tip0.x - 30, px + 60, hover.x, u) + dx, y: M.bez(tip0.y, tip0.y - 50, py - 90, hover.y, u) + dy };
          align = M.seg(u, 0.35, 1);
        } else if (t < T_SWOOP + T_HOVER) {
          var h = t - T_SWOOP;
          tip = { x: hover.x + dx + Math.sin(h * 13) * 1.6 * Math.exp(-h * 5), y: hover.y + dy + Math.sin(h * 11) * 2.4 * Math.exp(-h * 4) };
          align = 1;
        } else {
          var k = M.clamp((t - T_SWOOP - T_HOVER) / T_INS, 0, 1);
          tip = { x: hover.x + dx, y: M.mix(hover.y, inside.y, M.E.in3(k)) + dy };
          align = 1;
        }
        return { tip: tip, align: align };
      },
    };
  }
  function seqUnplug() {
    var pi = portInfo(), px = pi.x, py = pi.y;
    var inside = { x: px, y: py + DEPTH };
    var T = 0.24;
    return {
      total: T,
      fn: function (t) {
        var u = M.E.out2(t / T);
        return { tip: { x: px, y: M.mix(inside.y, py - 34, u) }, align: 1 };
      },
    };
  }

  /* ---------- frame ---------- */
  function wind() { return hot ? 0 : Math.sin(clock * 0.9) * 15 + Math.sin(clock * 2.3 + 1) * 7; }

  function frame(now) {
    raf = 0;
    if (state === 'dangle' && !hot && now - lastT < 30) { raf = requestAnimationFrame(frame); return; }   // at rest: 30 fps
    var dt = Math.min(0.05, (now - lastT) / 1000) * slow;
    lastT = now;
    clock += dt;
    S = PL.scale || S;
    var steps = Math.max(1, Math.round(dt * 120)), h = dt / steps, s;

    if (state === 'seq' && seq) {
      var A = anchorPos();
      for (s = 0; s < steps; s++) {
        tSim += h;
        var c = seq.def.fn(Math.min(tSim, seq.def.total));
        var ax = end.x - P[N - 2].x, ay = end.y - P[N - 2].y;
        var al = Math.sqrt(ax * ax + ay * ay) || 1; ax /= al; ay /= al;
        var vx = M.mix(ax, 0, c.align), vy = M.mix(ay, 1, c.align);
        var vl = Math.sqrt(vx * vx + vy * vy) || 1; vx /= vl; vy /= vl;
        axis.x = vx; axis.y = vy;
        var ex = c.tip.x - vx * PLUG_LEN, ey = c.tip.y - vy * PLUG_LEN;
        var rx = ex - A.x, ry = ey - A.y, rl = Math.sqrt(rx * rx + ry * ry), mx = LEN * 0.995;
        if (rl > mx) { ex = A.x + rx / rl * mx; ey = A.y + ry / rl * mx; }
        end.x = ex; end.y = ey;
        stepPhysics(h, { anchor: A, end: end, axis: axis });
        if (tSim >= seq.def.total) break;
      }
      if (tSim >= seq.def.total) {
        var done = seq;
        seq = null;
        if (done.kind === 'plug') {
          state = 'plugged'; plugged = true; rest = 0;
          place(); settle();
          for (var k = 3; k < N - 6; k++) P[k].y += 1.6 * Math.sin(k);       // small jolt from the impact when plugging in
          emit('contact');
        } else {
          // released: the plug falls and swings
          state = 'dangle'; plugged = false; idleSince = performance.now();
          for (var j = 0; j < N; j++) { Q[j].y = P[j].y + 3 * (j / N); Q[j].x = P[j].x - 1.5 * (j / N); }
        }
        done.resolve();
      }
    } else if (state === 'drag') {
      dragStep(dt, steps, h);
    } else if (state === 'dangle') {
      var A2 = anchorPos(), w = wind();
      for (s = 0; s < steps; s++) stepPhysics(h, { anchor: A2, end: null, axis: axis, wind: w, calm: hot });
      freeAxis();
      near = tipNearPort();
    } else if (state === 'plugged') {
      stepPhysics(h * steps, { anchor: anchorPos(), end: end, axis: axis });
      rest++;
    }

    draw();
    updateHint();
    if (state === 'seq' || state === 'drag' || state === 'dangle' || (state === 'plugged' && rest < 140)) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && state !== 'away') { lastT = performance.now(); raf = requestAnimationFrame(frame); } }

  /* ---------- hand: dragging the plug ---------- */
  var pointer = { x: 0, y: 0 };      // in design coordinates
  function toDesign(e) { return { x: e.clientX / S, y: e.clientY / S }; }

  function tipOf() { return { x: end.x + axis.x * PLUG_LEN, y: end.y + axis.y * PLUG_LEN }; }
  function tipNearPort() {
    var pi = portInfo(), t = tipOf();
    return Math.abs(t.x - pi.x) < MAG * 0.8 && t.y > pi.y - MAG * 1.1 && t.y < pi.y + 40;
  }

  function dragStep(dt, steps, h) {
    var A = anchorPos(), pi = portInfo();
    // desired position of the plug's held point -> end of the cable
    var ox = grab.ox, oy = grab.oy;
    var hx = pointer.x - ox, hy = pointer.y - oy;
    // the plug follows the cable, and near the socket it turns vertical
    var ax = end.x - P[N - 3].x, ay = end.y - P[N - 3].y;
    var al = Math.sqrt(ax * ax + ay * ay) || 1; ax /= al; ay /= al;
    var tipx = hx + axis.x * PLUG_LEN * 0.5, tipy = hy + axis.y * PLUG_LEN * 0.5;
    var dist = Math.sqrt((tipx - pi.x) * (tipx - pi.x) + (tipy - pi.y) * (tipy - pi.y));
    var align = M.seg(MAG * 1.4 - dist, 0, MAG * 1.4 - 8);
    align = align * align * (3 - 2 * align);
    near = align > 0.15 && tipy < pi.y + 24;
    var vx = M.mix(ax, 0, align), vy = M.mix(ay, 1, align), vl = Math.sqrt(vx * vx + vy * vy) || 1;
    axis.x = M.mix(axis.x, vx / vl, 0.35); axis.y = M.mix(axis.y, vy / vl, 0.35);
    var al2 = Math.sqrt(axis.x * axis.x + axis.y * axis.y) || 1; axis.x /= al2; axis.y /= al2;
    // plug centre is pulled to the hand, near the socket to the socket axis
    var cx0 = hx - axis.x * PLUG_LEN * 0.5, cy0 = hy - axis.y * PLUG_LEN * 0.5;
    if (align > 0) cx0 = M.mix(cx0, pi.x - axis.x * PLUG_LEN, align * 0.8) ;
    var k = 1 - Math.exp(-dt * 38);
    var ex = M.mix(end.x, cx0, k), ey = M.mix(end.y, cy0, k);
    // the cable does not stretch: the plug cannot go beyond full tension
    var rx = ex - A.x, ry = ey - A.y, rl = Math.sqrt(rx * rx + ry * ry), mx = LEN * 0.997;
    if (rl > mx) { ex = A.x + rx / rl * mx; ey = A.y + ry / rl * mx; }
    end.x = ex; end.y = ey;
    for (var s = 0; s < steps; s++) stepPhysics(h, { anchor: A, end: end, axis: axis, wind: 0 });

    // pulled home: tip on the socket rim and straight above it -> it goes in by itself
    var t = tipOf();
    if (!grab.armed && t.y < pi.y - 12) grab.armed = true;       // just pulled out of the socket: do not plug straight back in
    if (grab.armed && near && t.y >= pi.y + 6 && Math.abs(t.x - pi.x) < 14) { finishPlug(); }
  }
  function finishPlug() {
    grab = null;
    document.body.classList.remove('is-cable-drag');
    var from = tipOf();
    startSeq('plug', seqPlug({ fast: true }, from));
    cv.style.cursor = '';
  }

  function overPlug(e) {
    if (state === 'away' || state === 'seq') return false;
    var a = { x: end.x * S, y: end.y * S }, b = { x: (end.x + axis.x * PLUG_LEN) * S, y: (end.y + axis.y * PLUG_LEN) * S };
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    var t = M.clamp(((e.clientX - a.x) * dx + (e.clientY - a.y) * dy) / l2, 0, 1);
    var qx = a.x + dx * t, qy = a.y + dy * t;
    var d = Math.sqrt((e.clientX - qx) * (e.clientX - qx) + (e.clientY - qy) * (e.clientY - qy));
    return d < 27 * S;
  }
  function overPort(e) {
    var r = port.getBoundingClientRect();
    return e.clientX > r.left - 14 && e.clientX < r.right + 14 && e.clientY > r.top - 24 && e.clientY < r.bottom + 14;
  }

  document.addEventListener('pointerdown', function (e) {
    if (state === 'seq' || e.button > 0) return;
    if (overPlug(e) && (state === 'dangle' || state === 'plugged')) {
      var d = toDesign(e), hx = end.x + axis.x * PLUG_LEN * 0.5, hy = end.y + axis.y * PLUG_LEN * 0.5;
      grab = { ox: d.x - hx, oy: d.y - hy, sx: e.clientX, sy: e.clientY, fromPlug: state === 'plugged', id: e.pointerId, armed: state !== 'plugged' };
      pointer = d;
      e.preventDefault();
      if (state === 'dangle') beginDrag();
      return;
    }
    if (state === 'dangle' && overPort(e)) emit('push');
  });
  function beginDrag() {
    state = 'drag'; plugged = false;
    document.body.classList.add('is-cable-drag');
    cv.style.cursor = 'grabbing';
    emit('grab');
    wake();
  }
  document.addEventListener('pointermove', function (e) {
    var d = toDesign(e);
    pointer = d;
    if (grab && grab.fromPlug && state === 'plugged') {       // pulling a seated plug: unplug
      var mv = Math.sqrt((e.clientX - grab.sx) * (e.clientX - grab.sx) + (e.clientY - grab.sy) * (e.clientY - grab.sy));
      if (mv > 14 * S) {
        if (emit('pull', { drag: true }) === false) { grab = null; return; }
        beginDrag();
        document.body.classList.remove('is-plugged');
      }
    }
    var over = (state === 'dangle' || state === 'plugged' || state === 'drag') && !grab && overPlug(e);
    if (over !== hot) { hot = over; document.body.classList.toggle('over-plug', over); }
  });
  function release() {
    if (!grab) return;
    var g = grab; grab = null;
    document.body.classList.remove('is-cable-drag');
    cv.style.cursor = '';
    if (state === 'plugged' && g.fromPlug) {                  // a plain click on a seated plug
      if (emit('pull', { drag: false }) !== false) startSeq('unplug', seqUnplug());
      return;
    }
    if (state === 'drag') {
      // released: near the socket plug in, otherwise the cable falls and swings
      var pi = portInfo(), t = tipOf();
      if (g.armed && (near || (Math.abs(t.x - pi.x) < 26 && t.y > pi.y - 70 && t.y < pi.y + 40))) { startSeq('plug', seqPlug({ fast: true }, t)); return; }
      state = 'dangle'; idleSince = performance.now();
      for (var i = 0; i < N; i++) { Q[i].x = P[i].x; Q[i].y = P[i].y; }
      emit('drop');
    }
  }
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);

  /* ---------- drawing: the cable and the plug ---------- */
  var LIGHT = { x: -0.52, y: -0.85 };      // light from top left (normalized)

  function smoothPoints() {
    // Catmull-Rom spline through the rope points -> dense polyline with normals
    var out = [];
    var n = P.length;
    for (var i = 0; i < n - 1; i++) {
      var p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
      for (var k = 0; k < 3; k++) {
        var t = k / 3, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    out.push({ x: P[n - 1].x, y: P[n - 1].y });
    for (var j = 0; j < out.length; j++) {
      var a = out[Math.max(0, j - 1)], b = out[Math.min(out.length - 1, j + 1)];
      var tx = b.x - a.x, ty = b.y - a.y, l = Math.sqrt(tx * tx + ty * ty) || 1;
      out[j].nx = -ty / l; out[j].ny = tx / l;
      out[j].l = out[j].nx * LIGHT.x + out[j].ny * LIGHT.y;      // how much the normal faces the light (-1..1)
    }
    return out;
  }

  /* path through points shifted along the normal by k*W (for highlights and half tones) */
  function pathOffset(pts, k, from, to) {
    cx.beginPath();
    for (var i = from; i < to; i++) {
      var p = pts[i], o = k * p.l * CABLE_W;
      if (i === from) cx.moveTo(p.x + p.nx * o, p.y + p.ny * o); else cx.lineTo(p.x + p.nx * o, p.y + p.ny * o);
    }
  }

  function drawCable() {
    var pts = smoothPoints(), np = pts.length, i;
    cx.lineCap = 'round'; cx.lineJoin = 'round';

    // soft shadow on the background: three offset translucent strokes (cheaper than shadowBlur)
    cx.save();
    cx.translate(5, 9);
    var sw = [CABLE_W * 1.9, CABLE_W * 1.3, CABLE_W * 0.8], sa = [0.08, 0.12, 0.19];
    for (var q = 0; q < 3; q++) {
      cx.strokeStyle = 'rgba(0,0,0,' + sa[q] + ')'; cx.lineWidth = sw[q];
      cx.beginPath(); cx.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < np; i++) cx.lineTo(pts[i].x, pts[i].y);
      cx.stroke();
    }
    cx.restore();

    // faint rim so a dark cable does not vanish against a dark background
    cx.strokeStyle = 'rgba(165,170,190,.16)'; cx.lineWidth = CABLE_W + 1.8;
    cx.beginPath(); cx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < np; i++) cx.lineTo(pts[i].x, pts[i].y);
    cx.stroke();

    // matte sheath
    cx.strokeStyle = '#0b0b0e'; cx.lineWidth = CABLE_W;
    cx.stroke();

    // soft half tone and a broad highlight shifted towards the light (like on a cylinder)
    cx.strokeStyle = '#16171b'; cx.lineWidth = CABLE_W * 0.66; pathOffset(pts, 0.13, 0, np); cx.stroke();
    cx.strokeStyle = '#25272d'; cx.lineWidth = CABLE_W * 0.3; pathOffset(pts, 0.26, 0, np); cx.stroke();
    // thin highlight along the cable (in long pieces, no ribbing)
    var chunk = 11, alphas = [0.3, 0.24, 0.32, 0.26, 0.3];
    for (var c0 = 0, ci = 0; c0 < np - 1; c0 += chunk, ci++) {
      cx.strokeStyle = 'rgba(190,196,214,' + alphas[ci % alphas.length] + ')';
      cx.lineWidth = CABLE_W * 0.08;
      pathOffset(pts, 0.31, c0, Math.min(np, c0 + chunk + 1));
      cx.stroke();
    }
  }

  function rr(x, y, w, h, r) {
    cx.beginPath();
    cx.moveTo(x + r, y); cx.lineTo(x + w - r, y); cx.quadraticCurveTo(x + w, y, x + w, y + r);
    cx.lineTo(x + w, y + h - r); cx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    cx.lineTo(x + r, y + h); cx.quadraticCurveTo(x, y + h, x, y + h - r);
    cx.lineTo(x, y + r); cx.quadraticCurveTo(x, y, x + r, y); cx.closePath();
  }

  function drawPlug(clipY) {
    cx.save();
    if (clipY != null) { cx.beginPath(); cx.rect(-60, -60, W / S + 120, clipY + 60); cx.clip(); }
    cx.translate(end.x, end.y);
    cx.rotate(Math.atan2(-axis.x, axis.y));
    var w = PLUG.w, hw = w / 2, rl = PLUG.relief, hs = PLUG.house, tp = PLUG.tip;
    var y0 = rl, y1 = rl + hs;

    // plug shadow on the background
    cx.save();
    cx.translate(4, 8);
    for (var q = 0; q < 3; q++) {
      cx.fillStyle = 'rgba(0,0,0,' + [0.07, 0.1, 0.16][q] + ')';
      var gr2 = [4, 2.5, 1][q];
      rr(-hw + 2 - gr2, y0 - gr2, w - 4 + gr2 * 2, hs + gr2 * 2, 7 + gr2); cx.fill();
    }
    cx.restore();

    // ---- metal tip ----
    var tw = 10.5, ty0 = y1 - 4, ty1 = y1 + tp;
    var mg = cx.createLinearGradient(-tw, 0, tw, 0);
    mg.addColorStop(0, '#8d929d'); mg.addColorStop(0.22, '#e4e7ed'); mg.addColorStop(0.5, '#b7bcc7'); mg.addColorStop(0.78, '#f1f3f7'); mg.addColorStop(1, '#868b97');
    cx.fillStyle = mg; rr(-tw, ty0, tw * 2, ty1 - ty0, 4.6); cx.fill();
    cx.strokeStyle = 'rgba(40,44,54,.55)'; cx.lineWidth = 0.9; cx.stroke();
    // tip end: dark socket with a tongue (visible until the tip is inside the body)
    cx.fillStyle = '#0c0d10'; rr(-tw + 2, ty1 - 4.4, tw * 2 - 4, 3.4, 1.7); cx.fill();
    cx.fillStyle = '#6b707c'; cx.fillRect(-tw + 4.5, ty1 - 3.1, tw * 2 - 9, 0.9);

    // ---- body: smooth matte shell with a soft bevel ----
    var hg = cx.createLinearGradient(-hw, 0, hw, 0);
    hg.addColorStop(0, '#2c2d33'); hg.addColorStop(0.2, '#17181c'); hg.addColorStop(0.62, '#0d0d10'); hg.addColorStop(1, '#050506');
    cx.fillStyle = hg; rr(-hw, y0, w, hs, 6); cx.fill();
    var vg = cx.createLinearGradient(0, y0, 0, y1);
    vg.addColorStop(0, 'rgba(255,255,255,.06)'); vg.addColorStop(0.45, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(0,0,0,.3)');
    cx.fillStyle = vg; rr(-hw, y0, w, hs, 6); cx.fill();
    cx.lineWidth = 1;
    cx.strokeStyle = 'rgba(190,196,216,.2)'; cx.beginPath(); cx.moveTo(-hw + 5, y0 + 0.7); cx.lineTo(hw - 5, y0 + 0.7); cx.stroke();
    cx.strokeStyle = 'rgba(190,196,216,.14)'; cx.beginPath(); cx.moveTo(-hw + 0.7, y0 + 5); cx.lineTo(-hw + 0.7, y1 - 5); cx.stroke();

    // ---- short smooth collar blending into the cable ----
    var cb = CABLE_W * 0.5, bh = hw * 0.62;
    var bg = cx.createLinearGradient(-bh, 0, bh, 0);
    bg.addColorStop(0, '#2a2b31'); bg.addColorStop(0.3, '#141519'); bg.addColorStop(1, '#050506');
    cx.fillStyle = bg;
    cx.beginPath();
    cx.moveTo(-cb, 0); cx.quadraticCurveTo(-cb - 0.6, rl * 0.5, -bh, rl + 1);
    cx.lineTo(bh, rl + 1); cx.quadraticCurveTo(cb + 0.6, rl * 0.5, cb, 0); cx.closePath(); cx.fill();
    cx.strokeStyle = 'rgba(190,196,216,.12)'; cx.lineWidth = 0.9; cx.stroke();
    cx.restore();
  }


  function draw() {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, W, H);
    if (state === 'away') return;
    cx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    drawCable();
    var pi = portInfo();
    // the tip goes behind the edge only right at the socket
    var t = tipOf();
    var inserted = (state === 'plugged' || state === 'seq' || state === 'drag') && t.y > pi.y + 0.5 && Math.abs(t.x - pi.x) < 18;
    if (inserted || state === 'plugged') {
      var gr = cx.createRadialGradient(pi.x, pi.y, 2, pi.x, pi.y, 44);
      gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = gr; cx.fillRect(pi.x - 48, pi.y - 40, 96, 48);
    }
    drawPlug(inserted ? pi.y + SOCKET : null);
    // outline while hovering the plug (it can be grabbed)
    if (hot && state !== 'drag') {
      cx.save();
      cx.translate(end.x, end.y); cx.rotate(Math.atan2(-axis.x, axis.y));
      cx.strokeStyle = 'rgba(120,235,255,.75)'; cx.lineWidth = 1.6;
      rr(-PLUG.w / 2 - 3, PLUG.relief - 3, PLUG.w + 6, PLUG.house + 6, 9); cx.stroke();
      cx.restore();
    }
  }

  /* ---------- hint next to the plug and socket highlight ---------- */
  var hintEl = document.createElement('div');
  hintEl.className = 'cable-hint';
  hintEl.setAttribute('aria-hidden', 'true');
  hintEl.innerHTML = '<i></i><b>' + _('Pull the cable to USB-C') + '</b>';
  document.body.appendChild(hintEl);
  function updateHint() {
    var show = state === 'dangle' && !hot && performance.now() - idleSince > 1400 && !document.body.classList.contains('is-on');
    hintEl.classList.toggle('is-show', show);
    if (show) {
      var cxp = (end.x + axis.x * PLUG_LEN * 0.4) * S;
      var cyp = (end.y + axis.y * PLUG_LEN * 0.4) * S;
      hintEl.style.transform = 'translate(' + Math.round(cxp + 32 * S) + 'px,' + Math.round(cyp - 12) + 'px)';
    }
    var hotPort = (state === 'drag' && near) || (state === 'dangle' && near);
    port.classList.toggle('is-near', hotPort);
    port.classList.toggle('is-call', state === 'dangle' && show);
  }

  /* ---------- API ---------- */
  function startSeq(kind, def) {
    return new Promise(function (resolve) {
      S = PL.scale || S;
      tSim = 0; seq = { kind: kind, def: def, resolve: resolve };
      state = 'seq'; if (kind === 'plug') plugged = false;
      hintEl.classList.remove('is-show');
      wake();
    });
  }

  /* the cable falls from the top and sways at the window edge */
  function dangle(opts) {
    opts = opts || {};
    S = PL.scale || S;
    setLen();
    plugged = false; seq = null; grab = null;
    state = 'dangle';
    idleSince = performance.now();
    if (opts.still || PL.motion.reduce) hang(); else drop();
    wake();
  }
  function plugIn(opts) {
    opts = opts || {};
    if (state === 'plugged') return Promise.resolve();
    if (state === 'seq') return Promise.resolve();
    if (PL.motion.reduce) { snap(); return Promise.resolve(); }
    if (state === 'away') dangle({ still: true });
    var from = tipOf();
    grab = null; document.body.classList.remove('is-cable-drag');
    return startSeq('plug', seqPlug(opts, from));
  }
  function unplug() {
    if (state !== 'plugged') return Promise.resolve();
    return startSeq('unplug', seqUnplug());
  }
  function snap() {
    S = PL.scale || S;
    var pending = seq;
    setLen();
    state = 'plugged'; plugged = true; seq = null; grab = null;
    place(); settle(); rest = 0;
    draw();
    emit('contact');
    if (pending) pending.resolve();
  }
  function isPlugged() { return plugged && state === 'plugged'; }
  function busy() { return state === 'seq'; }

  resize();   // from here on app.js -> fit() -> PL.cable.resize() keeps the size right

  /* debugging: advance the simulation by exactly dt seconds (with setSlow(0) gives frame-by-frame capture) */
  function debugStep(dt) { var s = slow; slow = 1; while (dt > 1e-6) { var d = Math.min(0.05, dt); lastT = 0; frame(d * 1000); dt -= d; } slow = s; }

  return {
    dangle: dangle, plugIn: plugIn, unplug: unplug, snap: snap, isPlugged: isPlugged, busy: busy, on: on, resize: resize,
    setSlow: function (v) { slow = v; }, _step: debugStep,
    state: function () { return state; }, tip: tipOf, portPos: portInfo, _over: overPlug, _end: function () { return { end: end, axis: axis, S: S }; },
  };
})();
