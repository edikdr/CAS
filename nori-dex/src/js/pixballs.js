/* ==========================================================================
   Пиксельные покеболы 13×13: общий рисунок для этикетки картриджа «Master Catcher» (SVG)
   и для игры «Ловец» (canvas / data-URL). Рисуются кодом, сети не нужно.
   API: PL.pixballs.svg(kind) → <g> 26×26, canvas(kind) → 13×13 canvas, url(kind, k) → data-URL, KINDS
   ========================================================================== */
window.PL = window.PL || {};

PL.pixballs = (function () {
  var OUT = '#15151c';
  /* верх, блик, «метки» (список клеток), необязательный глиф */
  var BALLS = {
    poke:    { top: '#e8382c', hi: '#ff7a6a', set: null },
    great:   { top: '#2f7fe0', hi: '#6db0ff', set: { c: '#e23b3b', px: [[2, 3], [3, 2], [3, 3], [10, 3], [9, 2], [9, 3]] } },
    ultra:   { top: '#2c2c35', hi: '#585866', set: { c: '#f3c231', px: [[3, 2], [3, 3], [3, 4], [4, 4], [9, 2], [9, 3], [9, 4], [8, 4]] } },
    master:  { top: '#8b3fd2', hi: '#b878f2', set: { c: '#ff7ad9', px: [[2, 4], [10, 4]] }, glyph: { c: '#efdcff', px: [[4, 2], [8, 2], [4, 3], [5, 3], [7, 3], [8, 3], [4, 4], [6, 4], [8, 4]] } },
    net:     { top: '#37a98a', hi: '#7be0c0', set: { c: OUT, px: [[3, 2], [5, 2], [7, 2], [9, 2], [4, 3], [6, 3], [8, 3], [3, 4], [5, 4], [7, 4], [9, 4]] } },
    dusk:    { top: '#2d3a2d', hi: '#58765a', set: { c: '#7be062', px: [[4, 2], [5, 2], [7, 2], [8, 2], [4, 3], [8, 3]] } },
    fast:    { top: '#f2c230', hi: '#ffe685', set: { c: OUT, px: [[3, 2], [4, 3], [5, 4], [9, 2], [8, 3], [7, 4]] } },
    heavy:   { top: '#454b5a', hi: '#7b8497', set: { c: '#c9d2e6', px: [[3, 3], [4, 3], [5, 3], [7, 3], [8, 3], [9, 3]] } },
    premier: { top: '#eee2c2', hi: '#fffaf0', set: { c: '#d9524a', px: [[4, 3], [5, 3], [7, 3], [8, 3]] } },
  };
  var KINDS = ['master', 'dusk', 'net', 'heavy', 'fast', 'ultra', 'great', 'poke'];

  var grids = {}, canv = {}, urls = {};
  function grid(kind) {
    if (grids[kind]) return grids[kind];
    var B = BALLS[kind] || BALLS.poke, key = {}, x, y, dx, dy, dd;
    function put(px, py, col) { key[px + ',' + py] = col; }
    for (y = 0; y < 13; y++) for (x = 0; x < 13; x++) {
      dx = x - 6; dy = y - 6; dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > 6.5) continue;
      if (dd > 5.25) { put(x, y, OUT); continue; }
      if (dd <= 2.4) { put(x, y, dd <= 1.45 ? '#f4f5f8' : OUT); continue; }            // кнопка с ободком
      if (y >= 5 && y <= 7) { put(x, y, OUT); continue; }                                  // чёрный пояс
      if (y < 5) put(x, y, (x + y <= 7 && dd > 3.6) ? B.hi : B.top);                       // верх + блик
      else put(x, y, ((dx >= 3 && dy >= 2) || (x + y >= 16)) ? '#c3cad6' : '#f7f8fb');    // низ + тень
    }
    if (B.set) B.set.px.forEach(function (q) { put(q[0], q[1], B.set.c); });
    if (B.glyph) B.glyph.px.forEach(function (q) { put(q[0], q[1], B.glyph.c); });
    var out = [];
    Object.keys(key).forEach(function (k) { var q = k.split(','); out.push({ x: +q[0], y: +q[1], c: key[k] }); });
    return (grids[kind] = out);
  }

  function svg(kind) {
    var out = '';
    grid(kind).forEach(function (p) { out += '<rect x="' + (p.x * 2) + '" y="' + (p.y * 2) + '" width="2.04" height="2.04" fill="' + p.c + '"/>'; });
    return '<g shape-rendering="crispEdges">' + out + '</g>';
  }
  function canvas(kind) {
    if (canv[kind]) return canv[kind];
    var cv = document.createElement('canvas'); cv.width = 13; cv.height = 13;
    var cx = cv.getContext('2d');
    grid(kind).forEach(function (p) { cx.fillStyle = p.c; cx.fillRect(p.x, p.y, 1, 1); });
    return (canv[kind] = cv);
  }
  /* картинка в data-URL: каждый пиксель k×k (для DOM и стилей) */
  function url(kind, k) {
    k = k || 3;
    var key = kind + k;
    if (urls[key]) return urls[key];
    var cv = document.createElement('canvas'); cv.width = 13 * k; cv.height = 13 * k;
    var cx = cv.getContext('2d');
    grid(kind).forEach(function (p) { cx.fillStyle = p.c; cx.fillRect(p.x * k, p.y * k, k, k); });
    return (urls[key] = cv.toDataURL('image/png'));
  }

  return { KINDS: KINDS, svg: svg, canvas: canvas, url: url, grid: grid, has: function (k) { return !!BALLS[k]; } };
})();
