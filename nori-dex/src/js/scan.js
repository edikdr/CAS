/* ==========================================================================
   Сканер карточек: камера телефона или фото из устройства → карточка в альбом.

   Как это работает (всё в браузере, фото никуда не отправляется):
   1. Снимок: живая камера (рамка-подсказка, карточка ищется на лету и снимается сама, когда её
      держат ровно) или файлы из галереи / проводника (можно сразу несколько, можно перетащить на сайт).
   2. Карточка ищется на снимке, перспектива выравнивается, получается стандартный кадр 63×88 мм
      (630×880) со скруглёнными углами и подтянутой яркостью (js/scan-img.js). Углы можно поправить
      вручную или ткнуть в нужную карточку, если на фото их несколько.
   3. Название, номер и HP читает Tesseract.js (OCR) по шагам: адаптивная бинаризация шапки (тёмный и светлый
      текст), номер и HP снизу/справа, при неудаче — другие предобработки и поворот на 180°. Библиотека и модель
      (~3 МБ) один раз скачиваются с jsDelivr и дальше живут в кэше браузера. Прочитанное сверяется с локальной
      базой (js/scan-match.js) и показывается списком совпадений с превью: тап по миниатюре — превью карточки,
      ↗ — та же карточка в основном альбоме. Нет сети или не узнал — ищи вручную по базе.
   4. Выбранная карточка сохраняется в «Мою коллекцию» (IndexedDB, js/mine.js) и появляется в альбоме.

   API: PL.scan.open({files?, camera?}) · close() · press(name) · hints() · active() · accent() · status()
        PL.scan.addFiles(FileList) · PL.scan.on('exit' | 'added' | 'album' | 'hints', fn)
   ========================================================================== */
window.PL = window.PL || {};

PL.scan = (function () {
  var ACCENT = '#19e3ff';
  var W = 768, H = 432, RS = 2;
  var crt = document.getElementById('crt');
  var S = PL.scanImg;
  var listeners = {};
  var view, E = {}, st = null, seq = 0, ov, og;

  var TESS = [
    { script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
      core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0', lang: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int' },
    { script: 'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js', worker: 'https://unpkg.com/tesseract.js@5.1.1/dist/worker.min.js',
      core: 'https://unpkg.com/tesseract.js-core@5.1.0', lang: 'https://unpkg.com/@tesseract.js-data/eng@1.0.0/4.0.0_best_int' },
  ];

  /* ---------- мелочи ---------- */
  function emit(evt, d) { (listeners[evt] || []).forEach(function (f) { f(d); }); }
  function snd(n) { if (PL.audio) PL.audio.play(n); }
  function toast(m) { if (PL.app && PL.app.toast) PL.app.toast(m); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tick(fn, ms) { var tk = st && st.token; return setTimeout(function () { if (st && st.token === tk) fn(); }, ms || 0); }
  function hasCam() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  /* ==========================================================================
     OCR: Tesseract.js с CDN
     ========================================================================== */
  var tess = { promise: null, worker: null, cfg: 0, progress: null };
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (window.Tesseract) return res();
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { window.Tesseract ? res() : rej(new Error('no Tesseract')); };
      s.onerror = function () { s.remove(); rej(new Error('load failed ' + src)); };
      document.head.appendChild(s);
    });
  }
  function getWorker() {
    if (tess.promise) return tess.promise;
    var i = 0;
    tess.promise = new Promise(function (res, rej) {
      (function next() {
        if (i >= TESS.length) return rej(new Error('OCR unavailable'));
        var c = TESS[i++];
        loadScript(c.script).then(function () {
          return Tesseract.createWorker('eng', 1, {
            workerPath: c.worker, corePath: c.core, langPath: c.lang,
            logger: function (m) { if (tess.progress) tess.progress(m); },
          });
        }).then(function (w) { tess.worker = w; res(w); }, function () { delete window.Tesseract; next(); });
      })();
    });
    tess.promise.catch(function () { tess.promise = null; });
    return tess.promise;
  }

  var NAME_WL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzéÉ'’-:.&♀♂ 0123456789";
  var NUM_WL = '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ- ';
  var HP_WL = 'HP0123456789 ';
  function rot180(c) {
    var o = S.mk(c.width, c.height), g = o.getContext('2d');
    g.translate(c.width, c.height); g.rotate(Math.PI); g.drawImage(c, 0, 0);
    return o;
  }
  function recog(w, canvas, params) {
    return w.setParameters(params).then(function () { return w.recognize(canvas); }).then(function (r) {
      var d = r.data || {}, lines = [];
      (d.lines || []).forEach(function (l) { var t = String(l.text || '').replace(/\s+/g, ' ').trim(); if (t) lines.push({ text: t, conf: l.confidence || 0 }); });
      return { text: String(d.text || '').replace(/\s+/g, ' ').trim(), conf: d.confidence || 0, lines: lines };
    });
  }
  var M = PL.scanMatch;
  function matchNow(out) { out.m = M.match({ reads: out.reads, nums: out.nums, hps: out.hps }); out.verdict = M.verdict(out.m); return out.m; }

  /* Чтение карточки по шагам, от дешёвого к дорогому, после каждого шага сверка с базой:
       1) название в шапке: адаптивная бинаризация (тёмный текст, затем светлый);
       2) номер внизу (слева, справа, вся полоса) и HP справа сверху — они выбирают нужную «печать» среди одноимённых;
       3) если название так и не прочиталось: другие предобработки шапки (серый, по минимальному каналу, «разреженный» режим).
     Останавливается, как только совпадение уверенное. progress(текст) — что сейчас делаем. */
  function readCard(w, card, progress) {
    var out = { reads: [], nums: [], hps: [], texts: [], m: null, verdict: 'none' };
    var P6 = { tessedit_pageseg_mode: '6', tessedit_char_whitelist: NAME_WL, preserve_interword_spaces: '1' };
    var P7 = { tessedit_pageseg_mode: '7', tessedit_char_whitelist: NAME_WL, preserve_interword_spaces: '1' };
    var P11 = { tessedit_pageseg_mode: '11', tessedit_char_whitelist: NAME_WL, preserve_interword_spaces: '1' };
    var PN = { tessedit_pageseg_mode: '7', tessedit_char_whitelist: NUM_WL };
    var PN11 = { tessedit_pageseg_mode: '11', tessedit_char_whitelist: NUM_WL };
    var PH = { tessedit_pageseg_mode: '11', tessedit_char_whitelist: HP_WL };
    var chain = Promise.resolve();
    function step(fn) { chain = chain.then(function () { return out.stop ? null : fn(); }); }
    function say(t) { if (progress) progress(t); }
    function name(msg, mode, box, scale, params) {
      step(function () {
        say(msg);
        return recog(w, S.prep(card, box[0], box[1], box[2], box[3], scale, mode), params).then(function (r) {
          out.texts.push(r);
          if (r.text) out.reads.push(r.text);
          r.lines.forEach(function (l) { if (l.text.length >= 3 && l.conf >= 20 && l.text !== r.text) out.reads.push(l.text); });
          matchNow(out);
        });
      });
    }
    function strong() { var l = out.m && out.m.list; return !!(l && l[0] && l[0].score >= 0.88); }
    var HEAD = [0.03, 0.012, 0.74, 0.13];

    name(_('Reading name'), 'bin', HEAD, 2.4, P6);
    name(_('Reading name'), 'binInv', HEAD, 2.4, P6);

    /* номер и HP (если уже уверены в карточке — пропускаем номер, но HP читаем: он отделяет печати) */
    var numBoxes = [[0.03, 0.932, 0.47, 0.985], [0.53, 0.932, 0.97, 0.985]];
    numBoxes.forEach(function (b, k) {
      step(function () {
        if (M.parseNumber(out.nums) || strong()) return null;
        say(_('Reading number'));
        return recog(w, S.prep(card, b[0], b[1], b[2], b[3], 2.6, 'bin'), PN).then(function (r) { out.nums.push(r.text); });
      });
    });
    step(function () {
      if (M.parseNumber(out.nums) || strong()) return null;
      say(_('Reading number'));
      return recog(w, S.prep(card, 0.02, 0.915, 0.98, 0.99, 2.2, 'gray'), PN11).then(function (r) { out.nums.push(r.text); });
    });
    step(function () {
      if (M.parseNumber(out.nums) || strong()) return null;
      return recog(w, S.prep(card, 0.02, 0.915, 0.98, 0.99, 2.2, 'bin'), PN11).then(function (r) { out.nums.push(r.text); });
    });
    ['bin', 'binInv'].forEach(function (mode) {
      step(function () {
        if (M.parseHP(out.hps).length) return null;
        say(_('Reading HP'));
        return recog(w, S.prep(card, 0.56, 0.0, 0.99, 0.13, 2.4, mode), PH).then(function (r) { out.hps.push(r.text); });
      });
    });
    step(function () { matchNow(out); });

    /* название не нашлось — пробуем другие предобработки */
    function weak() { return !out.m || !out.m.list.length || out.m.list[0].score < 0.55; }
    [['gray', [0.04, 0.018, 0.72, 0.108], 2.6, P7], ['inv', [0.04, 0.018, 0.72, 0.108], 2.6, P7], ['binMin', [0.0, 0.0, 0.8, 0.16], 2.2, P11], ['bin', [0.0, 0.0, 1.0, 0.2], 1.8, P11]].forEach(function (t) {
      step(function () {
        if (!weak()) return null;
        say(_('Trying another way'));
        return recog(w, S.prep(card, t[1][0], t[1][1], t[1][2], t[1][3], t[2], t[0]), t[3]).then(function (r) {
          out.texts.push(r);
          if (r.text) out.reads.push(r.text);
          r.lines.forEach(function (l) { if (l.text.length >= 3 && l.conf >= 20 && l.text !== r.text) out.reads.push(l.text); });
          matchNow(out);
        });
      });
    });
    return chain.then(function () {
      var best = null;
      out.texts.forEach(function (t) { if (!best || t.conf > best.conf) best = t; });
      out.name = best ? best.text : '';
      out.nameConf = best ? best.conf : 0;
      return out;
    });
  }

  /* ==========================================================================
     СВЕРКА С БАЗОЙ: см. js/scan-match.js
     ========================================================================== */
  function asCard(c) { return PL.data.light(c.i); }

  /* ==========================================================================
     СБОРКА ЭКРАНА
     ========================================================================== */
  function build() {
    view = document.createElement('section');
    view.className = 'view view-scan';
    view.dataset.view = 'scan';
    view.dataset.ph = 'menu';
    view.innerHTML =
      '<div class="sc-stage">' +
        '<video class="sc-vid" playsinline muted autoplay></video>' +
        '<canvas class="sc-ov" width="' + (W * RS) + '" height="' + (H * RS) + '"></canvas>' +
        '<header class="sc-top"><span class="sc-ico">' + PL.icon('scan') + '</span><b>' + esc(_('CARD SCANNER')) + '</b><em class="sc-sub"></em><span class="sc-count"></span></header>' +
        '<div class="sc-menu"></div>' +
        '<div class="sc-cam"><button class="sc-sh sc-btn" data-act="gallery" aria-label="' + esc(_('Photo from device')) + '">' + PL.icon('upload') + '<span>' + esc(_('Photo')) + '</span></button>' +
          '<button class="sc-shutter" data-act="shoot" aria-label="' + esc(_('Capture')) + '"><i></i></button>' +
          '<button class="sc-sh sc-btn sc-auto is-on" data-act="auto" aria-label="' + esc(_('Auto capture')) + '"><span>' + esc(_('Auto')) + '</span></button></div>' +
        '<div class="sc-hint"></div>' +
        '<div class="sc-busy"><i class="sc-spin"></i><ul></ul></div>' +
        '<div class="sc-review"></div>' +
        '<div class="sc-cropbar"><button class="sc-btn" data-act="crop-ok"><span>' + esc(_('Done')) + '</span></button><button class="sc-btn" data-act="crop-auto"><span>' + esc(_('Auto')) + '</span></button><button class="sc-btn" data-act="crop-cancel"><span>' + esc(_('Cancel')) + '</span></button></div>' +
        '<input class="sc-file" type="file" accept="image/*" multiple hidden>' +
        '<input class="sc-file sc-native" type="file" accept="image/*" capture="environment" hidden>' +
      '</div>';
    crt.insertBefore(view, crt.querySelector('.connect-osd') || crt.querySelector('.hints'));
    var q = function (s) { return view.querySelector(s); };
    ov = q('.sc-ov'); og = ov.getContext('2d');
    E = { vid: q('.sc-vid'), top: q('.sc-top'), sub: q('.sc-sub'), count: q('.sc-count'), menu: q('.sc-menu'), cam: q('.sc-cam'), hint: q('.sc-hint'), busy: q('.sc-busy'), steps: q('.sc-busy ul'),
          review: q('.sc-review'), cropbar: q('.sc-cropbar'), file: q('.sc-file'), native: q('.sc-native'), auto: q('.sc-auto') };

    E.file.addEventListener('change', function () { var f = E.file.files; if (f && f.length) addFiles(f); E.file.value = ''; });
    E.native.addEventListener('change', function () { var f = E.native.files; if (f && f.length) addFiles(f); E.native.value = ''; });
    view.addEventListener('click', onClick);
    ov.addEventListener('pointerdown', onCropDown);
    ov.addEventListener('pointermove', onCropMove);
    ov.addEventListener('pointerup', onCropUp);
    ov.addEventListener('pointercancel', onCropUp);

    /* перетащить картинки на сайт — открыть сканер */
    document.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function (t) { return t === 'Files'; })) e.preventDefault();
    });
    document.addEventListener('drop', function (e) {
      var fs = e.dataTransfer && e.dataTransfer.files;
      if (!fs || !fs.length) return;
      var imgs = Array.prototype.filter.call(fs, function (f) { return /^image\//.test(f.type); });
      if (!imgs.length) return;
      e.preventDefault();
      emit('drop', { files: imgs });
    });
    /* вставка из буфера обмена */
    document.addEventListener('paste', function (e) {
      if (!st) return;
      var items = e.clipboardData && e.clipboardData.files;
      if (items && items.length) { addFiles(items); e.preventDefault(); }
    });
  }

  function setPhase(ph) {
    st.phase = ph;
    view.dataset.ph = ph;
    drawOverlay();
    emit('hints');
  }
  function counter() {
    var n = PL.mine ? PL.mine.count() : 0;
    E.count.textContent = n ? _('In collection: {n}', { n: n }) : '';
    var left = st && st.queue ? st.queue.length : 0;
    E.sub.textContent = st && st.job && st.total > 1 ? _('Photo {a} of {b}', { a: st.done, b: st.total }) : '';
    if (E.sub) E.sub.dataset.crop = _('Drag the corners · tap the card to find it');
  }

  /* ==========================================================================
     ВХОД / ВЫХОД
     ========================================================================== */
  function open(opts) {
    opts = opts || {};
    if (!view) build();
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    if (st) close();
    st = { token: ++seq, phase: 'menu', sel: 0, queue: [], job: null, total: 0, done: 0, added: 0, cam: { stream: null, timer: 0, quad: null, stable: 0, auto: true, busy: false, count: 0 }, crop: null, search: null, cancel: false };
    E.auto.classList.add('is-on');
    E.review.innerHTML = '';
    counter();
    renderMenu();
    setPhase('menu');
    if (opts.files && opts.files.length) addFiles(opts.files);
    else if (opts.camera) startCamera();
    return true;
  }
  function close() {
    if (!st) return;
    stopCamera();
    st.token = ++seq;
    st = null;
  }
  function leave() { snd('back'); emit('exit', { added: st ? st.added : 0 }); }

  /* ---------- меню ---------- */
  var TILES = [
    { id: 'camera', icon: 'camera', ru: _('Camera'), sub: _('Point at a card: it is found and added automatically'), color: '#19e3ff' },
    { id: 'file', icon: 'upload', ru: _('Photo from device'), sub: _('Pick photos from your gallery, several at once'), color: '#ffd25a' },
    { id: 'mine', icon: 'album', ru: _('My collection'), sub: '', color: '#7dffaa' },
  ];
  function renderMenu() {
    var n = PL.mine ? PL.mine.count() : 0;
    E.menu.innerHTML = TILES.map(function (t, i) {
      var sub = t.id === 'mine' ? (n ? _('{n} {w} in album', { n: n, w: _n(n, 'card|cards') }) : _('Empty for now: scan your first one')) : t.sub;
      if (t.id === 'camera' && !hasCam()) sub = _('No live camera here (https required): your phone camera will open');
      return '<button class="sc-tile' + (i === st.sel ? ' is-sel' : '') + '" data-tile="' + i + '" style="--tc:' + t.color + '"><i>' + PL.icon(t.icon) + '</i><b>' + t.ru + '</b><span>' + esc(sub) + '</span></button>';
    }).join('') + '<p class="sc-priv">' + esc(_('Photos are processed right in your browser and never sent anywhere. A recognition model (about 3 MB) is downloaded once to read the text.')) + '</p>';
  }
  function pickTile(i) {
    var t = TILES[i];
    snd('select');
    if (t.id === 'camera') { if (hasCam()) startCamera(); else E.native.click(); }
    else if (t.id === 'file') E.file.click();
    else emit('album', {});
  }

  /* ==========================================================================
     КАМЕРА
     ========================================================================== */
  function startCamera() {
    if (!hasCam()) { E.native.click(); return; }
    setPhase('camwait');
    E.hint.textContent = _('Requesting camera…');
    var tk = st.token;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(function (s) {
      if (!st || st.token !== tk) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      st.cam.stream = s; E.vid.srcObject = s;
      var p = E.vid.play(); if (p && p.catch) p.catch(function () {});
      st.cam.stable = 0; st.cam.quad = null; st.cam.count = 0;
      setPhase('cam');
      E.hint.textContent = _('Place the card in the frame');
      view.classList.add('is-live');
      st.cam.timer = setInterval(liveTick, 240);
      snd('open');
    }, function (err) {
      if (!st || st.token !== tk) return;
      var denied = err && /NotAllowed|Permission|Security/i.test(err.name || '');
      toast(denied ? _('Camera not allowed. Allow access in your browser or upload a photo') : _('Camera unavailable. Upload a photo from your device'));
      setPhase('menu'); renderMenu(); snd('error');
    });
  }
  function stopCamera() {
    if (!st) return;
    clearInterval(st.cam.timer); st.cam.timer = 0;
    if (st.cam.stream) st.cam.stream.getTracks().forEach(function (t) { t.stop(); });
    st.cam.stream = null;
    if (E.vid) { E.vid.srcObject = null; }
    if (view) view.classList.remove('is-live');
  }
  /* соответствие видео → экран: object-fit: cover (для вертикального кадра — contain) */
  function vmap() {
    var vw = E.vid.videoWidth, vh = E.vid.videoHeight;
    if (!vw || !vh) return null;
    var k = vw < vh ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
    E.vid.style.objectFit = vw < vh ? 'contain' : 'cover';
    return { k: k, ox: (W - vw * k) / 2, oy: (H - vh * k) / 2, vw: vw, vh: vh };
  }
  var lc = null;
  function liveTick() {
    if (!st || st.phase !== 'cam' || st.cam.busy) return;
    var v = E.vid; if (!v.videoWidth || v.readyState < 2) return;
    var k = 280 / Math.max(v.videoWidth, v.videoHeight), w = Math.max(8, Math.round(v.videoWidth * k)), h = Math.max(8, Math.round(v.videoHeight * k));
    if (!lc || lc.width !== w || lc.height !== h) { lc = S.mk(w, h); }
    var g = lc.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0, w, h);
    var r = null;
    try { r = S.detect(g.getImageData(0, 0, w, h)); } catch (e) {}
    var c = st.cam;
    if (r) {
      var q = r.pts.map(function (p) { return { x: p.x / k, y: p.y / k }; });
      var moved = c.quad ? Math.max.apply(null, q.map(function (p, i) { return Math.hypot(p.x - c.quad[i].x, p.y - c.quad[i].y); })) : 1e9;
      var tol = 0.03 * Math.max(v.videoWidth, v.videoHeight);
      c.stable = moved < tol ? c.stable + 1 : 0;
      c.quad = c.quad && moved < tol * 4 ? q.map(function (p, i) { return { x: c.quad[i].x * 0.5 + p.x * 0.5, y: c.quad[i].y * 0.5 + p.y * 0.5 }; }) : q;
      c.score = r.score;
      E.hint.textContent = c.stable >= 2 ? (c.auto ? _('Hold steady…') : _('Card found: press Capture')) : _('Card found');
      if (c.auto && c.stable >= 5) { shoot(); return; }
    } else {
      c.stable = 0; c.quad = null;
      E.hint.textContent = _('Place the card in the frame');
    }
    drawOverlay();
  }
  function shoot() {
    if (!st || st.phase !== 'cam') return;
    var v = E.vid; if (!v.videoWidth) { toast(_('Camera is not ready yet')); return; }
    st.cam.busy = true;
    var src = S.fromVideo(v), quad = null, found = false;
    if (st.cam.quad && st.cam.stable >= 1) {
      var k = src.width / v.videoWidth; quad = S.refine(src, st.cam.quad.map(function (p) { return { x: p.x * k, y: p.y * k }; })); found = true;
    }
    snd('shutter');
    var f = document.createElement('i'); f.className = 'sc-flash'; view.querySelector('.sc-stage').appendChild(f); setTimeout(function () { f.remove(); }, 400);
    stopCamera();
    st.queue = [{ src: src, quad: quad, found: found, origin: 'camera' }];
    st.total = 1; st.done = 0;
    nextJob();
  }

  /* ==========================================================================
     ФАЙЛЫ
     ========================================================================== */
  function addFiles(files) {
    if (!st) return;
    var list = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|bmp)$/i.test(f.name || ''); });
    if (!list.length) { toast(_('These are not images')); snd('error'); return; }
    stopCamera();
    var tk = st.token;
    setPhase('busy'); busySteps([_('Opening photo')], 0);
    Promise.all(list.map(function (f) { return S.fromFile(f).then(function (c) { return { src: c, quad: null, found: false, origin: 'file', name: f.name }; }, function () { return null; }); })).then(function (jobs) {
      if (!st || st.token !== tk) return;
      jobs = jobs.filter(Boolean);
      if (!jobs.length) { toast(_('Could not open the photo')); snd('error'); setPhase('menu'); renderMenu(); return; }
      st.queue = st.queue.concat(jobs); st.total += jobs.length;
      if (!st.job) nextJob();
    });
  }

  /* ==========================================================================
     ОБРАБОТКА СНИМКА: поиск → выравнивание → OCR → сверка
     ========================================================================== */
  var STEPS = [_('Finding the card in the photo'), _('Straightening and sizing to 63×88'), _('Reading name and number'), _('Matching with the database')];
  function busySteps(list, cur) {
    E.steps.innerHTML = list.map(function (s, i) { return '<li class="' + (i < cur ? 'ok' : i === cur ? 'on' : '') + '">' + esc(s) + '</li>'; }).join('');
  }
  function nextJob() {
    if (!st) return;
    var job = st.queue.shift();
    if (!job) { st.job = null; counter(); setPhase('menu'); renderMenu(); if (st.added) toast(_('Cards added: {n}', { n: st.added })); return; }
    st.job = job; st.done++;
    counter();
    process(job);
  }
  function process(job) {
    var tk = st.token;
    setPhase('busy'); busySteps(STEPS, 0);
    tick(function () {
      if (!job.quad) {
        var r = S.findCard(job.src);
        job.found = !!r;
        job.quad = r ? r.pts : S.guideQuad(job.src.width, job.src.height);
        job.score = r ? r.score : 0;
      }
      busySteps(STEPS, 1);
      tick(function () {
        buildCard(job);
        showReview(job);
        runOCR(job);
      }, 30);
    }, 30);
  }
  function buildCard(job) {
    var w = S.warp(job.src, S.inset(job.quad, 0.004));
    S.enhance(w);
    job.card = w;
    /* для OCR — тот же кадр в большем разрешении, если снимок позволяет (до ×1.5): мелкий номер внизу читается заметно лучше */
    var k = Math.max(1, Math.min(1.5, S.longSide(job.quad) / S.CH));
    if (k >= 1.12) { job.ocrCard = S.warp(job.src, S.inset(job.quad, 0.004), Math.round(S.CW * k), Math.round(S.CH * k)); S.enhance(job.ocrCard); } else job.ocrCard = w;
    job.rounded = S.rounded(w);
    job.url = job.rounded.toDataURL('image/png');
  }

  function topScore(o) { return o && o.m && o.m.list[0] ? o.m.list[0].score : 0; }
  function runOCR(job) {
    var tk = st.token;
    job.ocr = { state: 'work', msg: _('Downloading recognition model…') };
    job.cands = []; job.sel = 0; job.verdict = 'none';
    renderReview();
    function say(t) {
      if (!st || st.token !== tk || st.job !== job || job.ocr.state !== 'work') return;
      job.ocr.msg = t + '…';
      var el = E.review.querySelector('.sc-ocr'); if (el) el.textContent = job.ocr.msg;
    }
    tess.progress = function (m) {
      if (!st || st.token !== tk || st.job !== job || job.ocr.state !== 'work') return;
      if (m.status && /loading|initializ/i.test(m.status) && typeof m.progress === 'number') {
        var pct = Math.round(m.progress * 100);
        job.ocr.msg = (/language/i.test(m.status) ? _('Downloading model') : _('Starting recognition')) + (pct ? ' ' + pct + '%' : '…');
        var el = E.review.querySelector('.sc-ocr'); if (el) el.textContent = job.ocr.msg;
      }
    };
    getWorker().then(function (w) {
      if (!st || st.token !== tk || st.job !== job) return null;
      say(_('Reading card'));
      return readCard(w, job.ocrCard || job.card, say).then(function (o1) {
        if (o1.verdict !== 'none' && topScore(o1) >= 0.6) return o1;
        say(_('Checking if it is upside down'));
        return readCard(w, rot180(job.ocrCard || job.card), say).then(function (o2) {      // вдруг карточка вверх ногами
          if (topScore(o2) > topScore(o1) + 0.1) { job.card = rot180(job.card); job.ocrCard = null; job.rounded = S.rounded(job.card); job.url = job.rounded.toDataURL('image/png'); return o2; }
          return o1;
        });
      });
    }).then(function (o) {
      if (!o || !st || st.token !== tk || st.job !== job) return;
      job.ocr = { state: 'done', text: o.name, conf: o.nameConf, reads: o.reads, nums: o.nums, hps: o.hps, num: o.m.num, hp: o.m.hp };
      job.cands = o.m.list.slice(0, 8);
      job.verdict = o.verdict;
      job.sel = 0; job.top = 0;
      snd(job.cands.length ? 'sparkle' : 'error');
      if (!job.cands.length) { openSearch(true); return; }                  // не узнал: сразу даём искать по названию
      renderReview();
    }, function (err) {
      if (!st || st.token !== tk || st.job !== job) return;
      job.ocr = { state: 'fail', msg: _('Recognition unavailable (internet required). Find the card manually.') };
      openSearch(true);
    });
  }

  /* ---------- проверка результата ---------- */
  function showReview(job) {
    setPhase('review');
    snd('card');
    renderReview();
  }
  var VIS = 3;                                           // сколько строк-совпадений видно сразу
  function thumb(k) {
    return '<span class="sc-th" data-pv="1"><img class="sc-thi" ' + PL.img.scanAttrs(k, false) + ' alt="" decoding="async"></span>';
  }
  function candRow(c, i, sel, showPct) {
    var k = asCard(c), pct = Math.round(Math.min(1, c.score) * 100);
    var meta = [k.set + ' · ' + k.localId + (k.total ? '/' + k.total : '')];
    var chips = [];
    if (k.hp) chips.push('HP ' + k.hp);
    if (k.rarityName) chips.push(k.rarityName);
    var ev = [];
    if (c.num && c.tot) ev.push(_('number matched')); else if (c.num) ev.push(_('number'));
    if (c.hp === true) ev.push('HP');
    return '<li class="sc-cand' + (i === sel ? ' is-sel' : '') + '" data-c="' + i + '">' + thumb(k) +
      '<div class="sc-ct"><b>' + esc(k.name) + '</b><span>' + esc(meta[0]) + '</span><span class="sc-chips">' + esc(chips.join(' · ')) + (ev.length ? ' <u>' + esc(ev.join(' · ')) + '</u>' : '') + '</span></div>' +
      (showPct ? '<em>' + pct + '%</em>' : '<em></em>') +
      '<button class="sc-lnk" data-open="' + i + '" title="' + esc(_('Open in album')) + '" aria-label="' + esc(_('Open in album')) + '">' + PL.icon('link') + '</button></li>';
  }
  function windowOf(list, sel, top) {
    if (sel < top) top = sel;
    if (sel >= top + VIS) top = sel - VIS + 1;
    return Math.max(0, Math.min(top, Math.max(0, list.length - VIS)));
  }
  function candList(list, sel, job, showPct) {
    job.top = windowOf(list, sel, job.top || 0);
    var rows = list.slice(job.top, job.top + VIS).map(function (c, j) { return candRow(c, job.top + j, sel, showPct); }).join('');
    var more = list.length > VIS ? '<div class="sc-pg">' + _('{a}–{b} of {n}', { a: job.top + 1, b: Math.min(list.length, job.top + VIS), n: list.length }) + ' · <kbd>↑</kbd><kbd>↓</kbd></div>' : '';
    return '<ul class="sc-cands">' + rows + '</ul>' + more;
  }
  function readLine(o) {
    var bits = [];
    if (o.text) bits.push('«' + o.text + '»');
    if (o.hp && o.hp.length) bits.push('HP ' + o.hp[0]);
    if (o.num) bits.push('№ ' + o.num.n + (o.num.total ? '/' + o.num.total : ''));
    return bits.length ? _('Read: {x}', { x: bits.join(' · ') }) : '';
  }
  function renderReview() {
    if (!st || !st.job) return;
    var job = st.job, o = job.ocr || {}, html;
    var cands = job.cands || [];
    var head, body;
    if (o.state === 'work') {
      head = _('Reading card');
      body = '<div class="sc-ocr">' + esc(o.msg || '') + '</div><i class="sc-spin sc-spin--s"></i>';
    } else if (job.custom) {
      head = _('Will add as “{n}”', { n: job.custom });
      body = '<div class="sc-ocr">' + esc(_('This card is not in the database, so it goes to “My collection” with your name and photo.')) + '</div>';
    } else if (cands.length) {
      head = job.verdict === 'sure' ? _('Looks like this one') : _('Pick the right one');
      var rl = readLine(o);
      body = (rl ? '<div class="sc-ocr sc-read">' + esc(rl) + '</div>' : '') + candList(cands, job.sel, job, true);
    } else {
      head = _('Card not recognized');
      body = '<div class="sc-ocr">' + esc(_('No confident match. Find the card manually (X) or add it without a name.')) + '</div>';
    }
    var found = job.found ? '' : '<div class="sc-warn">' + esc(_('Card not found in the photo: center of the frame used. Adjust the corners (Y).')) + '</div>';
    var preview = '<div class="sc-prev"><div class="sc-card"><img src="' + job.url + '" alt="' + esc(_('Scanned card')) + '"><i class="sc-sheen"></i></div>' +
        '<span class="sc-dim">630 × 880 · 63 × 88 ' + esc(_('mm')) + '</span></div>';
    if (st.search && st.phase === 'search') {
      var rd = readLine(o);
      html = preview + '<div class="sc-info"><h4>' + esc(o.state === 'fail' ? _('Choose the card manually') : cands.length || !o.state ? _('Find the card in the database') : _('Card not recognized: find it in the database')) + '</h4>' + (rd ? '<div class="sc-ocr sc-read">' + esc(rd) + '</div>' : (o.state === 'fail' ? '<div class="sc-ocr bad">' + esc(o.msg) + '</div>' : '')) + searchHTML() +
        '<div class="sc-acts sc-acts--2"><button class="sc-btn sc-go" data-act="pick"><kbd>A</kbd><span>' + esc(_('Select')) + '</span></button><button class="sc-btn" data-act="unsearch"><kbd>B</kbd><span>' + esc(_('Back')) + '</span></button></div></div>';
    } else {
      html = preview +
      '<div class="sc-info"><h4>' + esc(head) + '</h4>' + body + found +
        '<div class="sc-acts">' +
          '<button class="sc-btn sc-go" data-act="add"' + (cands.length || job.custom || o.state !== 'work' ? '' : ' disabled') + '><kbd>A</kbd><span>' + esc(cands.length ? _('Add to album') : _('Add as is')) + '</span></button>' +
          '<button class="sc-btn" data-act="search"><kbd>X</kbd><span>' + esc(_('Find manually')) + '</span></button>' +
          '<button class="sc-btn" data-act="crop"><kbd>Y</kbd><span>' + esc(_('Adjust corners')) + '</span></button>' +
          '<button class="sc-btn" data-act="redo"><kbd>B</kbd><span>' + esc(_('Cancel')) + '</span></button>' +
        '</div></div>';
    }
    E.review.innerHTML = html;
    if (st.search && st.phase === 'search') { var inp = E.review.querySelector('.sc-q'); if (inp) { inp.value = st.search.q; bindSearch(inp); } }
  }
  function searchHTML() {
    var s = st.search, job = st.job;
    return '<div class="sc-search"><label>' + PL.icon('search') + '<input class="sc-q" type="search" placeholder="' + esc(_('Name: Pikachu, Charizard…')) + '" autocomplete="off" enterkeyhint="search"></label>' +
      (s.rows.length ? candList(s.rows, s.sel, s, false) : '<p class="sc-tip">' + esc(s.q.trim().length >= 2 ? _('Nothing found. Not in the database: A adds it with your name.') : _('Type the card name. Not in the database: A adds it with your name.')) + '</p>') + '</div>';
  }

  /* ---------- ручной поиск по базе ---------- */
  function bindSearch(inp) {
    inp.addEventListener('input', function () { doSearch(inp.value); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
  }
  function openSearch(quiet) {
    if (!st || !st.job) return;
    st.search = { q: '', rows: [], sel: 0, top: 0 };
    setPhase('search');
    renderReview();
    var inp = E.review.querySelector('.sc-q');
    if (inp && !quiet) inp.focus();                      // после авто-поиска клавиатуру не выдвигаем: сначала пусть посмотрит
  }
  function doSearch(q) {
    st.search.q = q;
    var rows = q.trim().length >= 2 ? PL.data.search(q.trim(), {}) : [];
    st.search.rows = rows.slice(0, 40).map(function (i) { return { i: i, score: 1, sim: 1 }; });
    st.search.sel = 0; st.search.top = 0;
    var box = E.review.querySelector('.sc-search');
    if (box) {
      var old = box.querySelector('.sc-cands, .sc-tip'), pg = box.querySelector('.sc-pg');
      if (pg) pg.remove();
      var tmp = document.createElement('div');
      tmp.innerHTML = st.search.rows.length ? candList(st.search.rows, 0, st.search, false) : '<p class="sc-tip">' + esc(q.trim().length >= 2 ? _('Nothing found. Not in the database: A adds it with your name.') : _('Type the card name. Not in the database: A adds it with your name.')) + '</p>';
      if (old) old.remove();
      while (tmp.firstChild) box.appendChild(tmp.firstChild);
    }
  }
  function closeSearch(pick) {
    var s = st.search;
    if (pick && s && !s.rows[s.sel] && s.q.trim().length >= 2) {        // в базе нет: добавим под своим названием
      st.job.custom = s.q.trim().slice(0, 40);
      st.job.cands = []; st.job.sel = 0;
      if (st.job.ocr && st.job.ocr.state !== 'done') st.job.ocr = { state: 'done', text: '' };
    } else if (pick && s && s.rows[s.sel]) {
      var c = s.rows[s.sel];
      st.job.custom = '';
      st.job.cands = [c].concat((st.job.cands || []).filter(function (x) { return x.i !== c.i; }));
      st.job.sel = 0; st.job.top = 0; st.job.verdict = 'sure';
      if (st.job.ocr && st.job.ocr.state !== 'done') st.job.ocr = { state: 'done', text: '' };
    }
    st.search = null;
    setPhase('review');
    renderReview();
  }

  /* ---------- превью и ссылка в основной альбом ---------- */
  function curList() { return st.search && st.phase === 'search' ? st.search : st.job; }
  function listOf() { var cur = curList(); return st.search && st.phase === 'search' ? cur.rows : (cur.cands || []); }
  function previewAt(i) {
    var l = listOf(); if (!l[i]) return;
    snd('tick');
    emit('preview', { list: l.map(function (c) { return c.i; }), at: i });
  }
  function openInAlbum(i) {
    var l = listOf(), c = l[i]; if (!c) return;
    var now = Date.now();
    if (st.job && !st.job.saved && !(st.armed && st.armed.i === c.i && now - st.armed.t < 4500)) {     // скан ещё не сохранён: просим подтвердить
      st.armed = { i: c.i, t: now };
      snd('error');
      toast(_('Scan not saved yet. Press again to go to the album, or add the card first (A)'));
      return;
    }
    emit('open-album', { row: c.i });
  }

  /* ---------- добавление в коллекцию ---------- */
  function addCurrent() {
    var job = st.job; if (!job || st.saving) return;
    var c = job.cands && job.cands[job.sel], card = c ? asCard(c) : null;
    st.saving = true;
    S.toBlob(job.rounded, 'image/webp', 0.9).then(function (blob) {
      if (!blob) throw new Error('no blob');
      return PL.mine.add({ cardId: card ? card.id : null, name: card ? card.en : (job.custom || _('My card')), localId: card ? card.localId : '', blob: blob, w: job.rounded.width, h: job.rounded.height, src: job.origin, conf: c ? +c.score.toFixed(2) : 0 });
    }).then(function () {
      st.saving = false; st.added++; job.saved = true;
      snd('select');
      var img = E.review.querySelector('.sc-card'); if (img) img.classList.add('is-fly');
      toast(_('“{n}” added to “My collection”', { n: card ? card.name : (job.custom || _('My card')) }));
      emit('added', { id: card && card.id });
      var tk = st && st.token;
      setTimeout(function () { if (st && st.token === tk) nextJob(); }, 520);
    }, function () { st.saving = false; toast(_('Could not save the card')); snd('error'); });
  }
  function discard() {
    if (!st) return;
    snd('back');
    st.search = null;
    if (st.job && st.job.origin === 'camera' && hasCam() && !st.queue.length) { st.job = null; startCamera(); return; }
    nextJob();
  }

  /* ==========================================================================
     ПРАВКА УГЛОВ
     ========================================================================== */
  function openCrop() {
    var job = st.job; if (!job) return;
    var sw = job.src.width, sh = job.src.height, box = { x: 20, y: 46, w: 480, h: 350 };
    var k = Math.min(box.w / sw, box.h / sh), dw = sw * k, dh = sh * k;
    st.crop = { k: k, ox: box.x + (box.w - dw) / 2, oy: box.y + (box.h - dh) / 2, dw: dw, dh: dh, quad: job.quad.map(function (p) { return { x: p.x, y: p.y }; }), sel: 0, drag: -1 };
    setPhase('crop');
    drawOverlay();
  }
  function cropPt(e) {
    var r = ov.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  function onCropDown(e) {
    if (!st || st.phase !== 'crop') return;
    e.preventDefault();
    var c = st.crop, p = cropPt(e), best = -1, bd = 26;
    c.quad.forEach(function (q, i) { var d = Math.hypot(c.ox + q.x * c.k - p.x, c.oy + q.y * c.k - p.y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { c.drag = best; c.sel = best; try { ov.setPointerCapture(e.pointerId); } catch (er) {} drawOverlay(); return; }
    /* ткнули в карточку: найти четырёхугольник вокруг этой точки */
    var sx = (p.x - c.ox) / c.k, sy = (p.y - c.oy) / c.k;
    if (sx >= 0 && sy >= 0 && sx <= st.job.src.width && sy <= st.job.src.height) {
      var r = S.findCard(st.job.src, 360, { x: sx, y: sy });
      if (r) { c.quad = r.pts; snd('tick'); } else { snd('error'); toast(_('No card found here: drag the corners')); }
      drawOverlay();
    }
  }
  function onCropMove(e) {
    if (!st || st.phase !== 'crop' || st.crop.drag < 0) return;
    var c = st.crop, p = cropPt(e);
    c.quad[c.drag] = { x: clamp((p.x - c.ox) / c.k, 0, st.job.src.width), y: clamp((p.y - c.oy) / c.k, 0, st.job.src.height) };
    drawOverlay();
  }
  function onCropUp() { if (st && st.crop) st.crop.drag = -1; }
  function cropApply() {
    var job = st.job, c = st.crop;
    job.quad = S.orderQuad(c.quad); job.found = true;
    st.crop = null;
    setPhase('busy'); busySteps(STEPS, 1);
    tick(function () { buildCard(job); showReview(job); runOCR(job); }, 30);
  }
  function cropAuto() {
    var r = S.findCard(st.job.src);
    if (r) { st.crop.quad = r.pts; snd('sparkle'); } else { st.crop.quad = S.guideQuad(st.job.src.width, st.job.src.height); toast(_('Card not found: frame placed in the center')); snd('error'); }
    drawOverlay();
  }

  /* ==========================================================================
     ОТРИСОВКА ПОВЕРХ ВИДЕО / ФОТО
     ========================================================================== */
  function poly(g, pts, close) { g.beginPath(); pts.forEach(function (p, i) { i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }); if (close) g.closePath(); }
  function drawOverlay() {
    if (!og) return;
    og.setTransform(RS, 0, 0, RS, 0, 0);
    og.clearRect(0, 0, W, H);
    if (!st) return;
    if (st.phase === 'cam') {
      var m = vmap();
      // затемнение вокруг рамки-подсказки
      var gh = H * 0.84, gw = gh * S.ASPECT, gx = (W - gw) / 2, gy = (H - gh) / 2;
      og.fillStyle = 'rgba(2,8,16,.42)'; og.beginPath(); og.rect(0, 0, W, H); og.rect(gx, gy, gw, gh); og.fill('evenodd');
      og.strokeStyle = 'rgba(255,255,255,.85)'; og.lineWidth = 3; og.lineCap = 'round';
      var L = 22;
      [[gx, gy, 1, 1], [gx + gw, gy, -1, 1], [gx + gw, gy + gh, -1, -1], [gx, gy + gh, 1, -1]].forEach(function (c) {
        og.beginPath(); og.moveTo(c[0], c[1] + c[3] * L); og.lineTo(c[0], c[1]); og.lineTo(c[0] + c[2] * L, c[1]); og.stroke();
      });
      if (m && st.cam.quad) {
        var pts = st.cam.quad.map(function (p) { return { x: m.ox + p.x * m.k, y: m.oy + p.y * m.k }; });
        var good = st.cam.stable >= 2;
        og.fillStyle = good ? 'rgba(125,255,170,.18)' : 'rgba(25,227,255,.12)'; poly(og, pts, true); og.fill();
        og.strokeStyle = good ? '#7dffaa' : '#19e3ff'; og.lineWidth = 3; poly(og, pts, true); og.stroke();
        pts.forEach(function (p) { og.fillStyle = '#fff'; og.beginPath(); og.arc(p.x, p.y, 4, 0, 6.3); og.fill(); });
        if (st.cam.auto && st.cam.stable >= 1) {      // кольцо автоснимка
          var cx = W / 2, cy = H - 56, p = Math.min(1, st.cam.stable / 5);
          og.strokeStyle = 'rgba(255,255,255,.25)'; og.lineWidth = 5; og.beginPath(); og.arc(cx, cy, 36, 0, 6.3); og.stroke();
          og.strokeStyle = '#7dffaa'; og.beginPath(); og.arc(cx, cy, 36, -Math.PI / 2, -Math.PI / 2 + p * 6.283); og.stroke();
        }
      }
    } else if (st.phase === 'crop' && st.crop) {
      var c = st.crop;
      og.fillStyle = '#05080f'; og.fillRect(0, 0, W, H);
      og.imageSmoothingQuality = 'high';
      og.drawImage(st.job.src, c.ox, c.oy, c.dw, c.dh);
      var q = c.quad.map(function (p) { return { x: c.ox + p.x * c.k, y: c.oy + p.y * c.k }; });
      og.fillStyle = 'rgba(25,227,255,.14)'; poly(og, q, true); og.fill();
      og.strokeStyle = '#19e3ff'; og.lineWidth = 2.5; poly(og, q, true); og.stroke();
      q.forEach(function (p, i) {
        og.fillStyle = i === c.sel ? '#ffd25a' : '#fff'; og.strokeStyle = '#05080f'; og.lineWidth = 3;
        og.beginPath(); og.arc(p.x, p.y, 9, 0, 6.3); og.stroke(); og.fill();
      });
    }
  }

  /* ==========================================================================
     КЛИКИ И КНОПКИ КОНСОЛИ
     ========================================================================== */
  function onClick(e) {
    if (!st) return;
    var t = e.target.closest('[data-tile]');
    if (t && st.phase === 'menu') { st.sel = +t.dataset.tile; renderMenu(); pickTile(st.sel); return; }
    var lk = e.target.closest('[data-open]');
    if (lk && (st.phase === 'review' || st.phase === 'search')) { e.stopPropagation(); return openInAlbum(+lk.dataset.open); }
    var pv = e.target.closest('[data-pv]');
    if (pv && (st.phase === 'review' || st.phase === 'search')) { var pc = pv.closest('.sc-cand'); if (pc) return previewAt(+pc.dataset.c); }
    var cd = e.target.closest('.sc-cand');
    if (cd && (st.phase === 'review' || st.phase === 'search')) {
      var i = +cd.dataset.c;
      if (st.phase === 'search') { st.search.sel = i; closeSearch(true); }
      else { st.job.sel = i; renderReview(); snd('tick'); }
      return;
    }
    var b = e.target.closest('[data-act]');
    if (!b) return;
    act(b.dataset.act);
  }
  function act(a) {
    switch (a) {
      case 'shoot': shoot(); break;
      case 'gallery': E.file.click(); break;
      case 'auto': st.cam.auto = !st.cam.auto; E.auto.classList.toggle('is-on', st.cam.auto); snd('select'); break;
      case 'add': addCurrent(); break;
      case 'search': openSearch(); break;
      case 'crop': openCrop(); break;
      case 'redo': discard(); break;
      case 'crop-ok': cropApply(); break;
      case 'crop-auto': cropAuto(); break;
      case 'pick': if (st.search && (st.search.rows.length || st.search.q.trim().length >= 2)) closeSearch(true); break;
      case 'unsearch': snd('back'); closeSearch(false); break;
      case 'crop-cancel': st.crop = null; setPhase('review'); renderReview(); snd('back'); break;
    }
  }

  function press(name) {
    if (!st || !view.classList.contains('is-active')) return false;
    switch (st.phase) {
      case 'menu': {
        var n = TILES.length;
        if (name === 'left' || name === 'up') { st.sel = (st.sel + n - 1) % n; renderMenu(); snd('tick'); }
        else if (name === 'right' || name === 'down') { st.sel = (st.sel + 1) % n; renderMenu(); snd('tick'); }
        else if (name === 'a') pickTile(st.sel);
        else if (name === 'x') E.file.click();
        else if (name === 'b' || name === 'home') leave();
        return true;
      }
      case 'camwait': if (name === 'b' || name === 'home') { stopCamera(); setPhase('menu'); renderMenu(); snd('back'); } return true;
      case 'cam':
        if (name === 'a') shoot();
        else if (name === 'x') E.file.click();
        else if (name === 'y') act('auto');
        else if (name === 'b' || name === 'home') { stopCamera(); setPhase('menu'); renderMenu(); snd('back'); }
        return true;
      case 'busy': if (name === 'b') { st.queue = []; st.job = null; setPhase('menu'); renderMenu(); snd('back'); } return true;
      case 'review': {
        var job = st.job, n2 = (job.cands || []).length;
        if (name === 'up' && n2) { job.sel = (job.sel + n2 - 1) % n2; renderReview(); snd('tick'); }
        else if (name === 'down' && n2) { job.sel = (job.sel + 1) % n2; renderReview(); snd('tick'); }
        else if (name === 'r' && n2) previewAt(job.sel);
        else if (name === 'l' && n2) openInAlbum(job.sel);
        else if (name === 'a') addCurrent();
        else if (name === 'x') openSearch();
        else if (name === 'y') openCrop();
        else if (name === 'b' || name === 'home') discard();
        return true;
      }
      case 'search': {
        var s = st.search, rows = s.rows;
        if (name === 'up' && rows.length) { s.sel = (s.sel + rows.length - 1) % rows.length; renderReview(); snd('tick'); }
        else if (name === 'down' && rows.length) { s.sel = (s.sel + 1) % rows.length; renderReview(); snd('tick'); }
        else if (name === 'r' && rows.length) previewAt(s.sel);
        else if (name === 'l' && rows.length) openInAlbum(s.sel);
        else if (name === 'a') { if (rows.length || s.q.trim().length >= 2) closeSearch(true); else { var inp = E.review.querySelector('.sc-q'); if (inp) inp.focus(); } }
        else if (name === 'x') { var i2 = E.review.querySelector('.sc-q'); if (i2) { i2.focus(); i2.select(); } }
        else if (name === 'b' || name === 'home') { snd('back'); closeSearch(false); }
        return true;
      }
      case 'crop': {
        var c = st.crop, step = 4 / c.k;
        if (name === 'l') { c.sel = (c.sel + 3) % 4; }
        else if (name === 'r') { c.sel = (c.sel + 1) % 4; }
        else if (name === 'left') c.quad[c.sel].x = clamp(c.quad[c.sel].x - step, 0, st.job.src.width);
        else if (name === 'right') c.quad[c.sel].x = clamp(c.quad[c.sel].x + step, 0, st.job.src.width);
        else if (name === 'up') c.quad[c.sel].y = clamp(c.quad[c.sel].y - step, 0, st.job.src.height);
        else if (name === 'down') c.quad[c.sel].y = clamp(c.quad[c.sel].y + step, 0, st.job.src.height);
        else if (name === 'a') return cropApply(), true;
        else if (name === 'y') return cropAuto(), true;
        else if (name === 'b' || name === 'home') { act('crop-cancel'); return true; }
        drawOverlay();
        return true;
      }
    }
    return true;
  }

  function hints() {
    if (!st) return [];
    switch (st.phase) {
      case 'menu': return [[['up', 'down'], _('Choose')], [['a'], _('Open')], [['x'], _('Photo')], [['b'], _('Back')]];
      case 'cam': return [[['a'], _('Capture')], [['x'], _('Photo')], [['y'], _('Auto')], [['b'], _('Back')]];
      case 'review': return [[['up', 'down'], _('Choose')], [['r'], _('Preview')], [['a'], _('Add')], [['x'], _('Search')], [['y'], _('Corners')], [['b'], _('Cancel')]];
      case 'search': return [[['up', 'down'], _('Choose')], [['r'], _('Preview')], [['a'], _('Select')], [['b'], _('Back')]];
      case 'crop': return [[['l', 'r'], _('Corner')], [['up', 'down'], _('Move')], [['a'], _('Done')], [['y'], _('Auto')], [['b'], _('Cancel')]];
      default: return [[['b'], _('Back')]];
    }
  }

  build_guard();
  function build_guard() { if (!view && crt) build(); }

  return {
    open: open, close: close, press: press, hints: hints, addFiles: addFiles,
    active: function () { return !!st; },
    accent: function () { return ACCENT; },
    status: function () { return { title: _('Card scanner'), line: st ? (st.phase === 'review' ? _('review') : st.phase === 'cam' ? _('camera') : _('menu')) : '' }; },
    on: function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    refresh: function () { if (st && st.phase === 'menu') renderMenu(); counter(); },
    /* для автотестов */
    _state: function () { return st; }, _match: M.match, _norm: M.norm, _parse: M.parseNumber, _ocrWorker: getWorker, _read: readCard,
  };
})();
