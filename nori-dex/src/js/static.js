/* ==========================================================================
   Зелёные ТВ-помехи на canvas.
   Режимы: 'static' — полноэкранный «снег» 60 к/с,
           'tune'   — «настройка канала» (ярче, с полосами срыва),
           'grain'  — тонкое зерно поверх контента (~24 к/с),
           'off'    — остановлено.
   ========================================================================== */
window.PL = window.PL || {};

PL.static = (function () {
  var cv, cx, img, buf32;
  var W = 384, H = 216;
  var mode = 'off';
  var raf = 0;
  var lastDraw = 0;
  var lut = new Uint32Array(256);
  var seed = (Math.random() * 0xffffffff) >>> 0 || 1;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tears = []; // полосы срыва синхронизации

  function rand() {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed;
  }

  // палитра люминофора: почти чёрный → зелёный → бело-зелёный
  function buildLut() {
    for (var v = 0; v < 256; v++) {
      var x = v / 255;
      var b = Math.pow(x, 1.7);
      var r = 6 + b * 70;
      var g = 14 + b * 236;
      var bl = 8 + b * 95;
      if (x > 0.9) { // самые яркие «искры»
        var k = (x - 0.9) / 0.1;
        r += (215 - r) * k; g += (255 - g) * k; bl += (225 - bl) * k;
      }
      lut[v] = (255 << 24) | ((bl & 255) << 16) | ((g & 255) << 8) | (r & 255);
    }
  }

  function draw(ts) {
    var tuning = mode === 'tune';
    var intensity = tuning ? 1.35 : 1;
    var roll = (ts * (tuning ? 0.25 : 0.05)) % (H * 1.8) - H * 0.4;

    // случайные срывы строк
    if (Math.random() < (tuning ? 0.5 : 0.06)) {
      tears.push({ y: (Math.random() * H) | 0, h: 1 + ((Math.random() * (tuning ? 14 : 5)) | 0), life: 2 + ((Math.random() * 5) | 0), gain: 1.3 + Math.random() * 0.6 });
    }

    var i = 0;
    for (var y = 0; y < H; y++) {
      var gain = 0.8 + 0.2 * Math.sin((y + ts * 0.03) * 0.11);
      var dr = Math.abs(y - roll);
      if (dr < 22) gain *= 1.22 - dr / 100;      // светлая катящаяся полоса
      else if (dr < 60) gain *= 0.86;            // и тень вокруг неё

      for (var t = 0; t < tears.length; t++) {
        var tr = tears[t];
        if (y >= tr.y && y < tr.y + tr.h) { gain *= tr.gain; break; }
      }
      gain *= intensity;

      var gi = (gain * 256) | 0;
      for (var x = 0; x < W; x++) {
        var v = ((rand() & 255) * gi) >> 8;
        buf32[i++] = lut[v > 255 ? 255 : v];
      }
    }

    for (var k = tears.length - 1; k >= 0; k--) if (--tears[k].life <= 0) tears.splice(k, 1);
    cx.putImageData(img, 0, 0);
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    var minGap = mode === 'grain' ? 42 : (reduce ? 66 : 0);
    if (ts - lastDraw < minGap) return;
    lastDraw = ts;
    draw(ts);
  }

  function start() { if (!raf) raf = requestAnimationFrame(loop); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else if (mode !== 'off') start();
  });

  return {
    init: function (canvas) {
      cv = canvas;
      cx = cv.getContext('2d', { alpha: false });
      W = cv.width; H = cv.height;
      img = cx.createImageData(W, H);
      buf32 = new Uint32Array(img.data.buffer);
      buildLut();
      draw(0);
    },
    setMode: function (m) {
      mode = m;
      if (m === 'off') { stop(); cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); }
      else start();
    },
    mode: function () { return mode; },
  };
})();
