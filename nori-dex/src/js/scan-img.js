/* ==========================================================================
   Обработка фото карточки в браузере, без библиотек и без сети:
     findCard(canvas)       — ищет на снимке прямоугольник карточки (контуры → линии Хафа → четырёхугольник
                              с пропорцией 63×88 мм), возвращает 4 угла [верх-лев, верх-прав, низ-прав, низ-лев]
     warp(canvas, quad)     — выравнивает перспективу и приводит к формату карточки 630×880
     enhance(canvas)        — подтягивает яркость и контраст (авто-уровни)
     rounded(canvas)        — скругляет углы как у настоящей карточки
   Любой шаг можно заменить ручной правкой: углы можно перетащить на экране сканера.
   ========================================================================== */
window.PL = window.PL || {};

PL.scanImg = (function () {
  var CW = 630, CH = 880, CR = 30, ASPECT = 63 / 88;
  var MAXSIDE = 2000;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  /* ---------- загрузка снимка: файл / видео → canvas не больше MAXSIDE ---------- */
  function fit(w, h) { var k = Math.min(1, MAXSIDE / Math.max(w, h)); return { w: Math.round(w * k), h: Math.round(h * k) }; }
  function fromSource(src, w, h) {
    var s = fit(w, h), c = mk(s.w, s.h), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, s.w, s.h);
    return c;
  }
  function fromFile(file) {
    function viaImage() {
      return new Promise(function (res, rej) {
        var u = URL.createObjectURL(file), im = new Image();
        im.onload = function () { var c = fromSource(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(u); res(c); };
        im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('not an image')); };
        im.src = u;
      });
    }
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bm) { var c = fromSource(bm, bm.width, bm.height); if (bm.close) bm.close(); return c; }, viaImage);
    }
    return viaImage();
  }
  function fromVideo(v) { return fromSource(v, v.videoWidth, v.videoHeight); }

  /* ---------- поиск четырёхугольника ---------- */
  function analyze(id) {
    var w = id.width, h = id.height, d = id.data, n = w * h, g = new Float32Array(n), t = new Float32Array(n), i, x, y, j, s;
    for (i = 0; i < n; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    var K = [1, 4, 6, 4, 1];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (j = -2; j <= 2; j++) s += g[y * w + clamp(x + j, 0, w - 1)] * K[j + 2];
      t[y * w + x] = s / 16;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (j = -2; j <= 2; j++) s += t[clamp(y + j, 0, h - 1) * w + x] * K[j + 2];
      g[y * w + x] = s / 16;
    }
    var mag = new Float32Array(n), ang = new Uint8Array(n), hist = new Uint32Array(256);
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      var gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - 1] + g[i + w - 1]);
      var gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1]);
      var m = Math.sqrt(gx * gx + gy * gy) / 4;
      mag[i] = m; hist[Math.min(255, m | 0)]++;
      var th = Math.atan2(gy, gx); if (th < 0) th += Math.PI; if (th >= Math.PI) th -= Math.PI;
      ang[i] = Math.round(th * 180 / Math.PI) % 180;
    }
    var want = n * 0.13, acc = 0, thr = 255;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= want) { thr = i; break; } }
    thr = Math.max(thr, 11);
    var mask = new Uint8Array(n), dil = new Uint8Array(n);
    for (i = 0; i < n; i++) if (mag[i] >= thr) mask[i] = 1;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      if (mask[i - w - 1] | mask[i - w] | mask[i - w + 1] | mask[i - 1] | mask[i] | mask[i + 1] | mask[i + w - 1] | mask[i + w] | mask[i + w + 1]) dil[i] = 1;
    }
    return { w: w, h: h, mask: mask, dil: dil, ang: ang };
  }

  var COS = [], SIN = [];
  (function () { for (var t = 0; t < 180; t++) { COS[t] = Math.cos(t * Math.PI / 180); SIN[t] = Math.sin(t * Math.PI / 180); } })();

  function houghLines(A) {
    var w = A.w, h = A.h, Rmax = Math.ceil(Math.hypot(w, h)), RN = 2 * Rmax + 1;
    var acc = new Uint16Array(180 * RN), x, y, i, dt, t, r, v;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      if (!A.mask[i]) continue;
      var t0 = A.ang[i];
      for (dt = -4; dt <= 4; dt++) {
        t = (t0 + dt + 180) % 180;
        r = Math.round(x * COS[t] + y * SIN[t]) + Rmax;
        acc[t * RN + r]++;
      }
    }
    var minV = Math.max(14, 0.16 * Math.min(w, h)), peaks = [];
    for (t = 0; t < 180; t++) for (r = 3; r < RN - 3; r++) {
      v = acc[t * RN + r];
      if (v < minV) continue;
      var best = true;
      for (dt = -3; dt <= 3 && best; dt++) {
        var tt = t + dt; if (tt < 0 || tt >= 180) continue;
        for (var dr = -3; dr <= 3; dr++) {
          var o = acc[tt * RN + r + dr];
          if (o > v || (o === v && (dt < 0 || (dt === 0 && dr < 0)))) { best = false; break; }
        }
      }
      if (best) peaks.push({ t: t, r: r - Rmax, v: v });
    }
    peaks.sort(function (a, b) { return b.v - a.v; });
    var lines = [];
    function dist(a, b) { var dth = Math.abs(a.t - b.t), rb = b.r; if (dth > 90) { dth = 180 - dth; rb = -rb; } return { dth: dth, dr: Math.abs(a.r - rb) }; }
    for (i = 0; i < peaks.length && lines.length < 18; i++) {
      var p = peaks[i], dup = false;
      for (var k = 0; k < lines.length; k++) { var q = dist(p, lines[k]); if (q.dth <= 8 && q.dr <= 10) { dup = true; break; } }
      if (!dup) { p.c = COS[p.t]; p.s = SIN[p.t]; lines.push(p); }
    }
    return lines;
  }

  function inter(a, b) {
    var det = a.c * b.s - a.s * b.c;
    if (Math.abs(det) < 0.2) return null;
    return { x: (a.r * b.s - a.s * b.r) / det, y: (a.c * b.r - a.r * b.c) / det };
  }
  function dth(a, b) { var d = Math.abs(a.t - b.t); return Math.min(d, 180 - d); }
  function len(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
  function area(P) { var s = 0; for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; s += P[i].x * P[j].y - P[j].x * P[i].y; } return s / 2; }
  function convex(P) {
    var sg = 0;
    for (var i = 0; i < 4; i++) {
      var a = P[i], b = P[(i + 1) % 4], c = P[(i + 2) % 4], cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cr) < 1e-6) return false;
      if (sg === 0) sg = cr > 0 ? 1 : -1; else if ((cr > 0 ? 1 : -1) !== sg) return false;
    }
    return true;
  }
  function support(A, P) {
    var hits = 0, tot = 0, inside = 0, full = 0;
    for (var i = 0; i < 4; i++) {
      var a = P[i], b = P[(i + 1) % 4], L = len(a, b), n = Math.max(2, Math.ceil(L / 2));
      for (var k = 0; k <= n; k++) {
        var x = Math.round(a.x + (b.x - a.x) * k / n), y = Math.round(a.y + (b.y - a.y) * k / n);
        full++;
        if (x < 1 || y < 1 || x >= A.w - 1 || y >= A.h - 1) continue;
        inside++; tot++;
        if (A.dil[y * A.w + x]) hits++;
      }
    }
    return { s: tot ? hits / tot : 0, inside: inside / Math.max(1, full) };
  }

  /* порядок углов: по часовой, «верх» — короткая сторона, карточка стоит вертикально и не вверх ногами (по возможности) */
  function orderQuad(P) {
    var Q = P.slice();
    if (area(Q) < 0) Q.reverse();
    var best = -1, bestY = 1e9;
    for (var k = 0; k < 4; k++) {
      var a = Q[k], b = Q[(k + 1) % 4], c = Q[(k + 2) % 4], d = Q[(k + 3) % 4];
      if (len(a, b) < len(b, c)) {
        var topY = (a.y + b.y) / 2, botY = (c.y + d.y) / 2, score = topY - botY;
        if (score < bestY) { bestY = score; best = k; }
      }
    }
    if (best < 0) best = 0;
    return [Q[best], Q[(best + 1) % 4], Q[(best + 2) % 4], Q[(best + 3) % 4]];
  }

  /* ImageData уменьшенного снимка → {pts, score} | null */
  function inQuad(P, pt) {
    var sg = 0;
    for (var i = 0; i < 4; i++) {
      var a = P[i], b = P[(i + 1) % 4], cr = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
      if (cr === 0) continue;
      if (sg === 0) sg = cr > 0 ? 1 : -1; else if ((cr > 0 ? 1 : -1) !== sg) return false;
    }
    return true;
  }
  /* opt.point — пользователь ткнул в нужную карточку: берём четырёхугольник, внутри которого эта точка */
  function detect(id, opt) {
    opt = opt || {};
    var A = analyze(id), lines = houghLines(A), w = A.w, h = A.h, i, j, k, l;
    var par = [];
    for (i = 0; i < lines.length; i++) for (j = i + 1; j < lines.length; j++) {
      if (dth(lines[i], lines[j]) > 14) continue;
      var a = lines[i], b = lines[j];
      var sg = Math.cos((a.t - b.t) * Math.PI / 180) >= 0 ? 1 : -1;
      var cx = w / 2, cy = h / 2, sa = cx * a.c + cy * a.s - a.r, sb = cx * b.c + cy * b.s - b.r;
      if (Math.abs(sa - sg * sb) < 0.2 * Math.min(w, h)) continue;
      par.push([i, j]);
    }
    var best = null;
    for (i = 0; i < par.length; i++) for (j = i + 1; j < par.length; j++) {
      var P = par[i], Q = par[j];
      if (P[0] === Q[0] || P[0] === Q[1] || P[1] === Q[0] || P[1] === Q[1]) continue;
      var a1 = lines[P[0]], b1 = lines[P[1]], c1 = lines[Q[0]], d1 = lines[Q[1]];
      if (Math.abs(Math.cos((a1.t - c1.t) * Math.PI / 180)) > 0.47) continue;
      var p1 = inter(a1, c1), p2 = inter(a1, d1), p3 = inter(b1, d1), p4 = inter(b1, c1);
      if (!p1 || !p2 || !p3 || !p4) continue;
      var pts = [p1, p2, p3, p4], bad = false;
      for (k = 0; k < 4; k++) if (pts[k].x < -0.15 * w || pts[k].x > 1.15 * w || pts[k].y < -0.15 * h || pts[k].y > 1.15 * h) { bad = true; break; }
      if (bad || !convex(pts)) continue;
      if (opt.point && !inQuad(pts, opt.point)) continue;
      var ar = Math.abs(area(pts)) / (w * h);
      if (ar < (opt.point ? 0.02 : 0.08) || ar > 1.1) continue;
      var L1 = (len(p1, p2) + len(p3, p4)) / 2, L2 = (len(p2, p3) + len(p4, p1)) / 2, ratio = Math.min(L1, L2) / Math.max(L1, L2);
      if (ratio < 0.56 || ratio > 0.88) continue;
      var aspect = clamp(1 - Math.abs(ratio - ASPECT) / 0.14, 0, 1);
      var sup = support(A, pts);
      if (sup.inside < 0.5 || sup.s < 0.42) continue;
      var score = opt.point ? 0.4 * sup.s + 0.4 * aspect + 0.2 * Math.min(ar / 0.07, 1) : 0.35 * sup.s + 0.45 * Math.min(ar / 0.6, 1) + 0.2 * aspect;
      if (!best || score > best.score) best = { pts: pts, score: score, support: sup.s, aspect: aspect, area: ar };
    }
    if (!best || best.score < 0.5) return null;
    best.pts = orderQuad(best.pts);
    return best;
  }


  /* ---------- уточнение сторон: самый внешний сильный край рядом с найденной линией ----------
     Грубый поиск (320 px) может сесть на внутреннюю рамку карточки или ошибиться на пару процентов.
     По каждой стороне усредняем «силу края» вдоль нормали (прямые края складываются, шум нет), берём
     самый внешний заметный пик, затем по точкам вдоль стороны подгоняем прямую (с отбраковкой выбросов)
     и заново считаем углы как пересечения прямых. */
  function refine(canvas, quad) {
    var K = Math.min(1, 1000 / Math.max(canvas.width, canvas.height)), w = Math.max(8, Math.round(canvas.width * K)), h = Math.max(8, Math.round(canvas.height * K));
    var wc = mk(w, h), g = wc.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0, w, h);
    var id = g.getImageData(0, 0, w, h).data, G = new Float32Array(w * h), i, x, y;
    for (i = 0; i < w * h; i++) G[i] = id[i * 4] * 0.299 + id[i * 4 + 1] * 0.587 + id[i * 4 + 2] * 0.114;
    var B = new Float32Array(w * h);
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) { i = y * w + x; B[i] = (G[i - w - 1] + G[i - w] + G[i - w + 1] + G[i - 1] + G[i] + G[i + 1] + G[i + w - 1] + G[i + w] + G[i + w + 1]) / 9; }
    function at(px, py) {
      if (px < 1 || py < 1 || px >= w - 2 || py >= h - 2) return null;
      var x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0, j = y0 * w + x0;
      return B[j] * (1 - fx) * (1 - fy) + B[j + 1] * fx * (1 - fy) + B[j + w] * (1 - fx) * fy + B[j + w + 1] * fx * fy;
    }
    var Q = quad.map(function (p) { return { x: p.x * K, y: p.y * K }; }), cx = 0, cy = 0;
    Q.forEach(function (p) { cx += p.x / 4; cy += p.y / 4; });
    var lines = [], side;
    for (side = 0; side < 4; side++) {
      var a = Q[side], b = Q[(side + 1) % 4], L = len(a, b), dx = (b.x - a.x) / L, dy = (b.y - a.y) / L, nx = dy, ny = -dx;
      if ((a.x + b.x) / 2 * nx + (a.y + b.y) / 2 * ny < cx * nx + cy * ny) { nx = -nx; ny = -ny; }       // нормаль — наружу
      var M = Math.max(20, Math.min(80, L / 5 | 0)), D0 = -8, D1 = Math.round(Math.max(40, 0.075 * Math.min(w, h) * 1.15)), prof = [], d, m, tt;
      for (d = D0; d <= D1; d++) {
        var sum = 0, cnt = 0;
        for (m = 0; m < M; m++) {
          tt = 0.1 + 0.8 * m / (M - 1);
          var px = a.x + (b.x - a.x) * tt + nx * d, py = a.y + (b.y - a.y) * tt + ny * d, v1 = at(px + nx * 1.5, py + ny * 1.5), v0 = at(px - nx * 1.5, py - ny * 1.5);
          if (v1 == null || v0 == null) continue;
          sum += Math.abs(v1 - v0); cnt++;
        }
        prof.push(cnt >= M * 0.5 ? sum / cnt : 0);
      }
      var pm = 0; prof.forEach(function (v) { if (v > pm) pm = v; });
      if (pm < 3) { lines.push(null); continue; }
      var best = -1;
      for (i = prof.length - 2; i >= 1; i--) if (prof[i] >= 0.55 * pm && prof[i] >= prof[i - 1] && prof[i] >= prof[i + 1]) { best = i; break; }        // самый внешний пик
      if (best < 0) { best = 0; prof.forEach(function (v, j) { if (v > prof[best]) best = j; }); }
      var dstar = D0 + best, pts = [];
      for (m = 0; m < M; m++) {
        tt = 0.08 + 0.84 * m / (M - 1);
        var bd = -99, bs = 0;
        for (var e = -4; e <= 4; e++) {
          var qx = a.x + (b.x - a.x) * tt + nx * (dstar + e), qy = a.y + (b.y - a.y) * tt + ny * (dstar + e), u1 = at(qx + nx * 1.5, qy + ny * 1.5), u0 = at(qx - nx * 1.5, qy - ny * 1.5);
          if (u1 == null || u0 == null) continue;
          var gs = Math.abs(u1 - u0);
          if (gs > bs) { bs = gs; bd = e; }
        }
        if (bd > -99 && bs >= 0.35 * pm) pts.push({ x: a.x + (b.x - a.x) * tt + nx * (dstar + bd), y: a.y + (b.y - a.y) * tt + ny * (dstar + bd) });
      }
      if (pts.length < 8) { lines.push(null); continue; }
      var ln = null, it;
      for (it = 0; it < 3; it++) {                         // прямая по МНК, затем выбрасываем выбросы
        var mx = 0, my = 0; pts.forEach(function (p) { mx += p.x / pts.length; my += p.y / pts.length; });
        var sxx = 0, sxy = 0, syy = 0; pts.forEach(function (p) { sxx += (p.x - mx) * (p.x - mx); sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) * (p.y - my); });
        var th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
        ln = { x: mx, y: my, ux: ux, uy: uy };
        var res = pts.map(function (p) { return Math.abs((p.x - mx) * -uy + (p.y - my) * ux); }), srt = res.slice().sort(function (p, q) { return p - q; }), med = srt[srt.length >> 1] || 0;
        var lim = Math.max(1.2, 2.5 * med), keep = pts.filter(function (p, j) { return res[j] <= lim; });
        if (keep.length < 8 || keep.length === pts.length) break;
        pts = keep;
      }
      lines.push(ln);
    }
    if (lines.some(function (l) { return !l; })) return quad;
    var out = [];
    for (i = 0; i < 4; i++) {                                // угол i = пересечение сторон i-1 и i
      var l1 = lines[(i + 3) % 4], l2 = lines[i], det = l1.ux * l2.uy - l1.uy * l2.ux;
      if (Math.abs(det) < 0.25) return quad;
      var t = ((l2.x - l1.x) * l2.uy - (l2.y - l1.y) * l2.ux) / det;
      out.push({ x: l1.x + l1.ux * t, y: l1.y + l1.uy * t });
    }
    var maxShift = 0.07 * Math.max(w, h);
    for (i = 0; i < 4; i++) if (Math.hypot(out[i].x - Q[i].x, out[i].y - Q[i].y) > maxShift) return quad;
    if (!convex(out)) return quad;
    return out.map(function (p) { return { x: p.x / K, y: p.y / K }; });
  }

  /* quad по целому снимку (canvas): уменьшаем, ищем, возвращаем углы в пикселях снимка */
  function findCard(canvas, maxSide, point) {
    maxSide = maxSide || 320;
    var k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height)), w = Math.max(8, Math.round(canvas.width * k)), h = Math.max(8, Math.round(canvas.height * k));
    var c = mk(w, h), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0, w, h);
    var r = detect(g.getImageData(0, 0, w, h), point ? { point: { x: point.x * w / canvas.width, y: point.y * h / canvas.height } } : null);
    if (!r) return null;
    var sx = canvas.width / w, sy = canvas.height / h;
    r.pts = refine(canvas, r.pts.map(function (p) { return { x: p.x * sx, y: p.y * sy }; }));
    return r;
  }
  /* запасной вариант: карточка по центру кадра (как рамка-подсказка в камере) */
  function guideQuad(w, h) {
    var qh = h * 0.88, qw = qh * ASPECT;
    if (qw > w * 0.94) { qw = w * 0.94; qh = qw / ASPECT; }
    var x0 = (w - qw) / 2, y0 = (h - qh) / 2;
    return [{ x: x0, y: y0 }, { x: x0 + qw, y: y0 }, { x: x0 + qw, y: y0 + qh }, { x: x0, y: y0 + qh }];
  }
  /* немного внутрь, чтобы по краю не осталось кусочков фона */
  function inset(P, f) {
    var cx = 0, cy = 0; P.forEach(function (p) { cx += p.x / 4; cy += p.y / 4; });
    return P.map(function (p) { return { x: p.x + (cx - p.x) * f, y: p.y + (cy - p.y) * f }; });
  }

  /* ---------- перспектива → прямоугольник 630×880 ---------- */
  function solve(A, b) {
    var n = b.length, i, j, k;
    for (i = 0; i < n; i++) {
      var mx = i;
      for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[mx][i])) mx = j;
      var tmp = A[i]; A[i] = A[mx]; A[mx] = tmp; var tb = b[i]; b[i] = b[mx]; b[mx] = tb;
      for (j = i + 1; j < n; j++) {
        var f = A[j][i] / A[i][i];
        for (k = i; k < n; k++) A[j][k] -= f * A[i][k];
        b[j] -= f * b[i];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }
  /* гомография: прямоугольник 0..W × 0..H → quad (tl, tr, br, bl) */
  function homography(Q, W, H) {
    var D = [[0, 0], [W, 0], [W, H], [0, H]], A = [], b = [], i;
    for (i = 0; i < 4; i++) {
      var u = D[i][0], v = D[i][1], x = Q[i].x, y = Q[i].y;
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    return solve(A, b);
  }
  function warp(canvas, quad, outW, outH) {
    outW = outW || CW; outH = outH || CH;
    var sw = canvas.width, sh = canvas.height;
    var src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh), sd = src.data;
    var H = homography(quad, outW, outH);
    var out = mk(outW, outH), og = out.getContext('2d'), od = og.createImageData(outW, outH), dd = od.data;
    var h11 = H[0], h12 = H[1], h13 = H[2], h21 = H[3], h22 = H[4], h23 = H[5], h31 = H[6], h32 = H[7];
    for (var v = 0; v < outH; v++) {
      for (var u = 0; u < outW; u++) {
        var wq = h31 * u + h32 * v + 1, sx = (h11 * u + h12 * v + h13) / wq, sy = (h21 * u + h22 * v + h23) / wq;
        sx = clamp(sx, 0, sw - 1.001); sy = clamp(sy, 0, sh - 1.001);
        var x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i0 = (y0 * sw + x0) * 4, i1 = i0 + 4, i2 = i0 + sw * 4, i3 = i2 + 4;
        var w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy, o = (v * outW + u) * 4;
        dd[o] = sd[i0] * w0 + sd[i1] * w1 + sd[i2] * w2 + sd[i3] * w3;
        dd[o + 1] = sd[i0 + 1] * w0 + sd[i1 + 1] * w1 + sd[i2 + 1] * w2 + sd[i3 + 1] * w3;
        dd[o + 2] = sd[i0 + 2] * w0 + sd[i1 + 2] * w1 + sd[i2 + 2] * w2 + sd[i3 + 2] * w3;
        dd[o + 3] = 255;
      }
    }
    og.putImageData(od, 0, 0);
    return out;
  }

  /* ---------- яркость и контраст: авто-уровни по перцентилям ---------- */
  function enhance(canvas) {
    var g = canvas.getContext('2d', { willReadFrequently: true }), id = g.getImageData(0, 0, canvas.width, canvas.height), d = id.data, n = d.length / 4, hist = new Uint32Array(256), i;
    for (i = 0; i < n; i++) hist[(d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0]++;
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.012) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.012) { hi = i; break; } }
    if (hi - lo < 50) return canvas;
    var lo2 = Math.min(lo, 45), gain = clamp(255 / (hi - lo2), 1, 1.45);
    for (i = 0; i < n; i++) {
      d[i * 4] = clamp((d[i * 4] - lo2) * gain, 0, 255);
      d[i * 4 + 1] = clamp((d[i * 4 + 1] - lo2) * gain, 0, 255);
      d[i * 4 + 2] = clamp((d[i * 4 + 2] - lo2) * gain, 0, 255);
    }
    g.putImageData(id, 0, 0);
    return canvas;
  }

  /* ---------- скругление углов как у настоящей карточки ---------- */
  function rounded(canvas, r) {
    r = r || CR;
    var w = canvas.width, h = canvas.height, out = mk(w, h), g = out.getContext('2d');
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r); g.lineTo(w, h - r); g.quadraticCurveTo(w, h, w - r, h);
    g.lineTo(r, h); g.quadraticCurveTo(0, h, 0, h - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.closePath();
    g.clip();
    g.drawImage(canvas, 0, 0);
    return out;
  }

  function toBlob(canvas, type, q) {
    return new Promise(function (res) {
      if (canvas.toBlob) canvas.toBlob(function (b) { res(b); }, type || 'image/webp', q == null ? 0.9 : q);
      else res(null);
    }).then(function (b) {
      if (b && (!type || b.type === type)) return b;
      return new Promise(function (res) { canvas.toBlob(function (x) { res(x); }, 'image/png'); });
    });
  }
  /* вырезка полосы карточки (в долях) для OCR: увеличение, серый, растяжение контраста; invert — для светлого текста */
  function strip(canvas, fx0, fy0, fx1, fy1, scale, invert) {
    var w = canvas.width, h = canvas.height, x0 = Math.round(fx0 * w), y0 = Math.round(fy0 * h), sw = Math.round((fx1 - fx0) * w), sh = Math.round((fy1 - fy0) * h);
    var pad = 14, out = mk(sw * scale + pad * 2, sh * scale + pad * 2), g = out.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, x0, y0, sw, sh, pad, pad, sw * scale, sh * scale);
    var id = g.getImageData(0, 0, out.width, out.height), d = id.data, n = d.length / 4, i, mn = 255, mx = 0, L = new Uint8Array(n);
    for (i = 0; i < n; i++) { var l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; L[i] = l; if (l < mn) mn = l; if (l > mx) mx = l; }
    var span = Math.max(40, mx - mn);
    for (i = 0; i < n; i++) {
      var v = clamp((L[i] - mn) * 255 / span, 0, 255); if (invert) v = 255 - v;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return out;
  }

  /* вырезка полосы + предобработка для OCR.
     mode: 'gray'   — серый, растяжение контраста по перцентилям
           'inv'    — то же, но светлый текст → тёмный
           'bin'    — адаптивная бинаризация (Саувола): тёмный текст на белом, переживает блики и градиенты
           'binInv' — то же для светлого текста на тёмном
           'binMin' — по минимальному каналу (белое остаётся белым, цветной фон темнеет) + светлый текст → тёмный */
  function prep(canvas, fx0, fy0, fx1, fy1, scale, mode) {
    var w = canvas.width, h = canvas.height, x0 = Math.round(fx0 * w), y0 = Math.round(fy0 * h), sw = Math.round((fx1 - fx0) * w), sh = Math.round((fy1 - fy0) * h);
    scale *= CW / w;                                    // scale задан для кадра 630 px шириной; кадр в большем разрешении даёт те же размеры, но резче
    var pad = 14, W = Math.round(sw * scale + pad * 2), H = Math.round(sh * scale + pad * 2), out = mk(W, H), g = out.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, x0, y0, sw, sh, pad, pad, sw * scale, sh * scale);
    var id = g.getImageData(0, 0, W, H), d = id.data, n = W * H, i, x, y, L = new Float32Array(n), hist = new Uint32Array(256), cn = 0;
    var cx0 = pad, cy0 = pad, cx1 = W - pad, cy1 = H - pad;           // рабочая область без белых полей
    var useMin = mode === 'binMin';
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      var r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      var l = useMin ? Math.min(r, gg, b) : (r * 0.299 + gg * 0.587 + b * 0.114);
      L[i] = l;
      if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) { hist[l | 0]++; cn++; }
    }
    /* перцентили 2% / 98% по рабочей области — не ломаются от одного блика */
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cn * 0.02) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= cn * 0.02) { hi = i; break; } }
    var span = Math.max(40, hi - lo), flip = mode === 'inv' || mode === 'binInv' || mode === 'binMin';
    for (i = 0; i < n; i++) { var v = clamp((L[i] - lo) * 255 / span, 0, 255); L[i] = flip ? 255 - v : v; }
    if (mode === 'bin' || mode === 'binInv' || mode === 'binMin') {
      /* Саувола: порог = m·(1 + k·(s/128 − 1)) в окне вокруг пикселя (окно не выходит за рабочую область), интегральные изображения */
      var win = clamp(Math.round(H * 0.5) | 1, 15, 71), half = win >> 1, K = 0.34;
      var S1 = new Float64Array((W + 1) * (H + 1)), S2 = new Float64Array((W + 1) * (H + 1));
      for (y = 0; y < H; y++) {
        var rs = 0, rq = 0;
        for (x = 0; x < W; x++) {
          var q = L[y * W + x]; rs += q; rq += q * q;
          S1[(y + 1) * (W + 1) + x + 1] = S1[y * (W + 1) + x + 1] + rs;
          S2[(y + 1) * (W + 1) + x + 1] = S2[y * (W + 1) + x + 1] + rq;
        }
      }
      for (y = 0; y < H; y++) {
        var ya = Math.max(cy0, y - half), yb = Math.min(cy1, y + half + 1);
        for (x = 0; x < W; x++) {
          var o = (y * W + x) * 4, val = 255;
          if (x >= cx0 && x < cx1 && y >= cy0 && y < cy1) {
            var xa = Math.max(cx0, x - half), xb = Math.min(cx1, x + half + 1), cnt = (xb - xa) * (yb - ya);
            var sum = S1[yb * (W + 1) + xb] - S1[ya * (W + 1) + xb] - S1[yb * (W + 1) + xa] + S1[ya * (W + 1) + xa];
            var sq = S2[yb * (W + 1) + xb] - S2[ya * (W + 1) + xb] - S2[yb * (W + 1) + xa] + S2[ya * (W + 1) + xa];
            var mean = sum / cnt, sd = Math.sqrt(Math.max(0, sq / cnt - mean * mean));
            var T = mean * (1 + K * (sd / 128 - 1));
            val = sd < 11 ? 255 : (L[y * W + x] < T - 4 ? 0 : 255);      // ровный фон без контраста — белый (иначе шум = крапинки)
          }
          d[o] = d[o + 1] = d[o + 2] = val; d[o + 3] = 255;
        }
      }
      /* тёмные полосы у края (срез карточки, рамка, тень) и крапинки рядом с ними: срезаем всё за полосой */
      var rowBlack = function (yy) { var c2 = 0, k2; for (k2 = cx0; k2 < cx1; k2++) if (d[(yy * W + k2) * 4] === 0) c2++; return c2 / (cx1 - cx0); };
      var colBlack = function (xx) { var c2 = 0, k2; for (k2 = cy0; k2 < cy1; k2++) if (d[(k2 * W + xx) * 4] === 0) c2++; return c2 / (cy1 - cy0); };
      var fill = function (xa2, ya2, xb2, yb2) { for (var fy = ya2; fy < yb2; fy++) for (var fx = xa2; fx < xb2; fx++) { var oo = (fy * W + fx) * 4; d[oo] = d[oo + 1] = d[oo + 2] = 255; } };
      var lim = Math.round((cy1 - cy0) * 0.2), limx = Math.round((cx1 - cx0) * 0.1);
      for (y = cy1 - 1; y > cy1 - lim; y--) if (rowBlack(y) > 0.3) { fill(0, y - 8, W, H); break; }
      for (y = cy0; y < cy0 + lim; y++) if (rowBlack(y) > 0.3) { fill(0, 0, W, y + 9); break; }
      for (x = cx0; x < cx0 + limx; x++) if (colBlack(x) > 0.45) { fill(0, 0, x + 9, H); break; }
      for (x = cx1 - 1; x > cx1 - limx; x--) if (colBlack(x) > 0.45) { fill(x - 8, 0, W, H); break; }
    } else {
      for (i = 0; i < n; i++) { var vv = L[i]; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = vv; d[i * 4 + 3] = 255; }
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (x < cx0 || x >= cx1 || y < cy0 || y >= cy1) { var o2 = (y * W + x) * 4; d[o2] = d[o2 + 1] = d[o2 + 2] = 255; }
    }
    g.putImageData(id, 0, 0);
    return out;
  }

  return {
    CW: CW, CH: CH, ASPECT: ASPECT, _hom: homography,
    fromFile: fromFile, fromVideo: fromVideo, findCard: findCard, detect: detect, guideQuad: guideQuad, inset: inset,
    warp: warp, refine: refine, enhance: enhance, rounded: rounded, toBlob: toBlob, strip: strip, prep: prep, longSide: function (Q) { return Math.max(len(Q[0], Q[1]), len(Q[1], Q[2]), len(Q[2], Q[3]), len(Q[3], Q[0])); }, orderQuad: orderQuad, mk: mk,
  };
})();
