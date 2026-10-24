/* ==========================================================================
   Движение: плавные анимации по «позе».
   Анимация описывается функцией pose(u) от 0 до 1 → {x, y, z, rx, ry, rz, s, o, blur, shadow}
   и превращается в плотные ключевые кадры Web Animations (transform + opacity),
   поэтому можно делать дуги, пружины и составные пути, которых не даёт CSS.
   ========================================================================== */
window.PL = window.PL || {};

PL.motion = (function () {
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---- кривые плавности ---- */
  var E = {
    lin: function (u) { return u; },
    in2: function (u) { return u * u; },
    in3: function (u) { return u * u * u; },
    out2: function (u) { return 1 - (1 - u) * (1 - u); },
    out3: function (u) { return 1 - Math.pow(1 - u, 3); },
    out5: function (u) { return 1 - Math.pow(1 - u, 5); },
    io2: function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; },
    io3: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    io5: function (u) { return u < 0.5 ? 16 * Math.pow(u, 5) : 1 - Math.pow(-2 * u + 2, 5) / 2; },
    /* «мягкий» вход и выход (sin) */
    sine: function (u) { return -(Math.cos(Math.PI * u) - 1) / 2; },
    /* с «перелётом» в конце */
    back: function (u, k) { k = k == null ? 1.70158 : k; var m = u - 1; return 1 + (k + 1) * m * m * m + k * m * m; },
    /* затухающая пружина: приходит в 1, один-два раза «перелетая»; в конце ровно 1 */
    spring: function (u, w, z) {
      w = w || 12; z = z || 0.45;
      function step(t) {
        var wd = w * Math.sqrt(1 - z * z);
        return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t));
      }
      return step(u) + (1 - step(1)) * u * u * u;
    },
  };

  function mix(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  /* отрезок [a, b] по u → 0…1 */
  function seg(u, a, b) { return clamp((u - a) / (b - a), 0, 1); }
  function bez(p0, p1, p2, p3, t) {
    var m = 1 - t;
    return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
  }

  function toTransform(p) {
    var t = p.persp ? 'perspective(' + p.persp + 'px) ' : '';
    t += 'translate3d(' + (p.x || 0).toFixed(2) + 'px,' + (p.y || 0).toFixed(2) + 'px,' + (p.z || 0).toFixed(2) + 'px)';
    if (p.rx) t += ' rotateX(' + p.rx.toFixed(2) + 'deg)';
    if (p.ry) t += ' rotateY(' + p.ry.toFixed(2) + 'deg)';
    if (p.rz) t += ' rotateZ(' + p.rz.toFixed(2) + 'deg)';
    if (p.s != null && p.s !== 1) t += ' scale(' + p.s.toFixed(4) + ')';
    return t;
  }

  function frames(pose, dur) {
    var n = Math.max(4, Math.round(dur / 1000 * 60));
    var out = [];
    for (var i = 0; i <= n; i++) {
      var u = i / n, p = pose(u), f = { offset: u, transform: toTransform(p), easing: 'linear' };
      if (p.o != null) f.opacity = p.o;
      if (p.filter) f.filter = p.filter;
      out.push(f);
    }
    return out;
  }

  /* play(el, pose, dur, {delay, fill}) → Animation; при reduced-motion сразу в конец */
  function play(el, pose, dur, opts) {
    opts = opts || {};
    if (reduce) { dur = 1; }
    var a = el.animate(frames(pose, dur), { duration: dur, delay: opts.delay || 0, fill: opts.fill || 'both', easing: 'linear' });
    return a;
  }
  /* зафиксировать конечную позу обычными стилями (после этого анимацию можно снять) */
  function commit(el, p) {
    el.style.transform = toTransform(p);
    if (p.o != null) el.style.opacity = p.o;
    if (p.filter) el.style.filter = p.filter;
  }

  /* то же, но возвращает Promise; по окончании поза фиксируется стилями, анимация снимается
     (opts.hold — оставить анимацию висеть на последнем кадре) */
  function run(el, pose, dur, opts) {
    opts = opts || {};
    var a = play(el, pose, dur, opts);
    var end = pose(1);
    return a.finished.then(function () {
      if (!opts.hold) { commit(el, end); a.cancel(); }
      return a;
    }, function () { return a; });
  }

  /* «метки» по времени анимации: cues = [{t: секунды, fn}], срабатывают, когда анимация доходит до t
     (синхронно с замедлением в отладке, в отличие от setTimeout) */
  function cues(anim, list) {
    var i = 0, sorted = list.slice().sort(function (a, b) { return a.t - b.t; });
    if (reduce) sorted = sorted.slice(-1);       // без анимации звучит только итоговая метка (иначе все звуки разом)
    function tick() {
      var t = (anim.currentTime || 0) / 1000;
      while (i < sorted.length && sorted[i].t <= t) { try { sorted[i].fn(); } catch (e) {} i++; }
      if (i < sorted.length && anim.playState !== 'finished' && anim.playState !== 'idle') requestAnimationFrame(tick);
      else while (i < sorted.length) { try { sorted[i].fn(); } catch (e) {} i++; }
    }
    requestAnimationFrame(tick);
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); }); }

  return { E: E, mix: mix, clamp: clamp, seg: seg, bez: bez, frames: frames, play: play, run: run, cues: cues, commit: commit, wait: wait, reduce: reduce, toTransform: toTransform };
})();
