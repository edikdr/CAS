/* ============================================================
   The receipt

   Every album is a till receipt printed from its own data — the
   waveform, the barcode and every line come from js/data.js, not
   from an image.

   The crumple is not CSS. A build step renders the real receipt onto
   a paper mesh in 3D and saves one frame per stage
   (tools/crumple/), and this file plays those frames back:

     100%  a crumpled ball          — the resting state
      70%  rolled up
      40%  a creased sheet
       0%  the live receipt, whose rows can be clicked

   The last step hands over from the image to the real DOM, so the
   flat state is text rather than a picture. If the frames have not
   been rendered, the receipt simply sits flat and still works.
   ============================================================ */

/* deterministic pseudo-random, so a receipt looks identical every load */
function seed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------
   Pieces of paper furniture
   ------------------------------------------------------------ */

/** The AM waveform, drawn rather than shipped as an image. */
function waveformSvg(id) {
  const rnd = seed(id);
  const pts = [];
  const N = 260;
  for (let i = 0; i <= N; i++) {
    const x = i / N;                       // 0..1 across the paper
    const d = (x - 0.5) * 2;               // -1..1 from the centre
    const env = Math.exp(-(d * d) * 3.1);  // amplitude envelope
    const y = Math.sin(x * Math.PI * 46) * env * (0.86 + rnd() * 0.28);
    pts.push(`${(x * 300).toFixed(1)},${(26 - y * 24).toFixed(1)}`);
  }
  return `<svg class="rc-wave" viewBox="0 0 300 52" preserveAspectRatio="none"
      role="img" aria-label="Arctic Monkeys waveform">
      <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor"
        stroke-width="1.15" stroke-linejoin="round"/></svg>`;
}

/** A barcode whose bars are derived from the album id. */
function barcodeSvg(id) {
  const rnd = seed('bars-' + id);
  let x = 0, bars = '';
  while (x < 300) {
    const w = 0.8 + Math.floor(rnd() * 4) * 0.9;
    if (rnd() > 0.34) bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="46"/>`;
    x += w + 0.7 + rnd() * 1.5;
  }
  return `<svg class="rc-barcode" viewBox="0 0 300 46" preserveAspectRatio="none"
     aria-hidden="true" focusable="false">${bars}</svg>`;
}

/** Card/auth numbers — fake, deterministic, and obviously a prop. */
function receiptCodes(album) {
  const rnd = seed('codes-' + album.id);
  const digits = n => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
  const hex = n => Array.from({ length: n }, () =>
    '0123456789ABCDEF'[Math.floor(rnd() * 16)]).join('');
  return { card: hex(16), auth: digits(13), term: digits(6) };
}

/* ------------------------------------------------------------
   Markup
   ------------------------------------------------------------ */
function receiptMarkup(album) {
  const c = receiptCodes(album);
  const rows = album.tracks.map((t, i) => `
      <li class="rc-row" role="button" tabindex="0"
          data-track="${esc(t.name)}" data-album="${esc(album.id)}"
          aria-label="${esc(t.name)} — open track">
        <span class="rc-qty">${String(i + 1).padStart(2, '0')}</span>
        <span class="rc-item">${esc(t.name)}</span>
        <span class="rc-amt">${t.duration}</span>
      </li>`).join('');

  return `
    <div class="rc-head">
      <div class="rc-logo" aria-label="Arctic Monkeys">ARCTIC<br>MONKEYS</div>
      ${waveformSvg(album.id)}
    </div>

    <div class="rc-rule"></div>
    <div class="rc-cols"><span>QTY</span><span>ITEM</span><span>AMT</span></div>
    <div class="rc-rule dashed"></div>

    <ol class="rc-tracks">${rows}</ol>

    <div class="rc-rule dashed"></div>
    <div class="rc-totals">
      <div><span>TOTAL TRACKS</span><span>${album.tracks.length}</span></div>
      <div><span>TOTAL LENGTH</span><span>${albumRuntime(album)}</span></div>
    </div>
    <div class="rc-rule"></div>

    <div class="rc-meta">
      <div>CARD #: ${c.card}</div>
      <div>AUTH CODE: ${c.auth}</div>
      <div>LABEL: ${esc(album.label.toUpperCase())}</div>
      <div>PRODUCERS: ${esc(album.producers.toUpperCase())}</div>
      <div>STUDIO: ${esc(album.studio.toUpperCase())}</div>
      <div>DATE: ${esc(album.released.toUpperCase())}</div>
    </div>

    ${barcodeSvg(album.id)}
    <div class="rc-foot">${esc(album.title)}</div>
  `;
}

/* ------------------------------------------------------------
   Frame playback
   ------------------------------------------------------------ */

/** The rendered frames for an album, if the build step has been run. */
function crumpleFrames(album) {
  return (typeof CRUMPLE !== 'undefined' && CRUMPLE[album.id]) || null;
}

const FRAME_MS = 105;      // one stage to the next
const FADE_MS = 150;       // cross-fade between two stages

/**
 * Lay the frame images over the live receipt.
 *
 * The renderer records where an undeformed sheet lands inside the frame
 * (`flat`), so scaling by liveWidth / flat.width and shifting by -flat.x
 * puts the printed sheet in the frames exactly on top of the real one —
 * which is what makes the last step of the unfold invisible.
 */
function fitFrames(card) {
  const data = card.__frames;
  if (!data) return;
  const live = card.querySelector('.rc-paper');
  const stack = card.querySelector('.rc-frames');
  if (!live || !stack) return;

  const rw = live.offsetWidth;
  if (!rw) return;
  const [fw, fh] = data.frame;
  const [fx, fy, flw] = data.flat;
  const k = rw / flw;

  card.__k = k;
  stack.style.width = (fw * k).toFixed(1) + 'px';
  stack.style.height = (fh * k).toFixed(1) + 'px';
  // Horizontally the frames line up with the live receipt, so the last
  // step of the unfold lands exactly on the real thing. Vertically each
  // stage is placed by its own content box in applyStage(), so a balled
  // receipt sits inside its column instead of spilling onto the button.
  stack.style.left = (live.offsetLeft - fx * k).toFixed(1) + 'px';

  card.__liveH = live.offsetHeight;
  card.__liveLeft = live.offsetLeft;
  applyStage(card, card.__pct, true);
}

/** The drawn area of one stage, in css px, or null if not recorded. */
function stageBox(card, pct) {
  const data = card.__frames;
  const box = data && data.boxes && data.boxes[pct];
  if (!box || !card.__k) return null;
  const k = card.__k;
  return { x: box[0] * k, y: box[1] * k, w: box[2] * k, h: box[3] * k };
}

/** Height the column should take at a given stage. */
function stageHeight(card, pct) {
  const liveH = card.__liveH || 0;
  if (!card.__frames || pct <= 0) return liveH;
  const box = stageBox(card, pct);
  if (box) return box.h;
  // no per-stage box recorded — shrink on a curve instead
  return liveH * (0.34 + 0.66 * (1 - pct / 100));
}

/** Show one stage. `hard` skips the cross-fade. */
function applyStage(card, pct, hard) {
  card.__pct = pct;
  card.dataset.pct = pct;

  const flat = pct <= 0;
  card.classList.toggle('flat', flat);

  card.querySelectorAll('.rc-frame').forEach(img => {
    const on = !flat && +img.dataset.pct === pct;
    img.style.transitionDuration = hard ? '0ms' : FADE_MS + 'ms';
    img.style.opacity = on ? '1' : '0';
  });

  const stage = card.querySelector('.rc-stage');
  const stack = card.querySelector('.rc-frames');
  if (stage) {
    const h = stageHeight(card, pct);
    if (h) stage.style.height = h.toFixed(0) + 'px';
    // slide the stack so this stage's drawing starts at the top of the column
    const box = stageBox(card, pct);
    if (stack && box) stack.style.top = (-box.y).toFixed(1) + 'px';
  }

  const label = card.querySelector('.rc-pct');
  if (label) label.textContent = pct + '%';
}

/** Make sure every frame of this album is decoded before we animate. */
function preloadFrames(card, album) {
  if (card.__preloaded) return card.__preloaded;
  const data = card.__frames;
  if (!data) return (card.__preloaded = Promise.resolve());

  const imgs = [...card.querySelectorAll('.rc-frame')];
  imgs.forEach(img => { if (!img.getAttribute('src')) img.src = img.dataset.src; });

  const settled = imgs.map(img => img.complete
    ? Promise.resolve()
    : new Promise(r => { img.onload = img.onerror = r; }));

  // never let a slow image hold the interaction up for long
  card.__preloaded = Promise.race([
    Promise.all(settled),
    new Promise(r => setTimeout(r, 2500))
  ]);
  return card.__preloaded;
}

/** Walk the stages from where we are to `target`, one frame at a time. */
async function playTo(card, target, done) {
  const data = card.__frames;
  if (!data) { applyStage(card, target, true); if (done) done(); return; }

  if (card.__timer) { clearTimeout(card.__timer); card.__timer = null; }
  await preloadFrames(card, null);

  const all = [...data.stages, 0].sort((a, b) => b - a);   // 100 … 10, 0
  const from = card.__pct;
  let path = from > target
    ? all.filter(p => p < from && p >= target)
    : all.filter(p => p > from && p <= target).reverse();
  if (!path.length) path = [target];

  if (REDUCED()) { applyStage(card, target, true); if (done) done(); return; }

  let i = 0;
  const step = () => {
    applyStage(card, path[i]);
    i++;
    if (i < path.length) card.__timer = setTimeout(step, FRAME_MS);
    else { card.__timer = null; if (done) done(); }
  };
  step();
}

/* ------------------------------------------------------------
   Build one album card
   ------------------------------------------------------------ */
function buildAlbumCard(album) {
  const data = crumpleFrames(album);

  const card = document.createElement('article');
  card.className = 'album reveal' + (data ? '' : ' no-frames');
  card.id = 'album-' + album.id;
  card.dataset.album = album.id;
  card.__frames = data;
  card.__pct = data ? 100 : 0;

  const frames = data ? data.stages.map(pct => `
        <img class="rc-frame" data-pct="${pct}" alt="" aria-hidden="true"
             decoding="async"
             data-src="assets/crumple/${album.id}/${pct}.webp"
             ${pct === 100 ? `src="assets/crumple/${album.id}/${pct}.webp"` : ''}>`).join('')
    : '';

  card.innerHTML = `
    <div class="rc-stage">
      <div class="rc-frames" aria-hidden="true">${frames}</div>
      <div class="rc-paper">${receiptMarkup(album)}</div>
    </div>

    <div class="rc-controls">
      <button class="unfold" type="button" aria-expanded="${data ? 'false' : 'true'}"
              aria-controls="album-${album.id}">
        <span class="unfold-ico" aria-hidden="true"></span>
        <span class="unfold-txt">${data ? 'PLAY' : 'TRACKS'}</span>
      </button>
      <div class="rc-status">
        <span class="rc-pct">${data ? '100%' : ''}</span>
        <span class="rc-title">${esc(album.short)} · ${album.year}</span>
      </div>
    </div>
  `;

  const btn = card.querySelector('.unfold');
  if (data) {
    // decode the frames while the pointer is still on its way to the button
    btn.addEventListener('pointerenter', () => preloadFrames(card, album), { once: true });
    btn.addEventListener('focus', () => preloadFrames(card, album), { once: true });
    btn.addEventListener('click', () => setOpen(card, !card.classList.contains('open')));
  } else {
    card.classList.add('open');
    btn.addEventListener('click', () => {
      card.querySelector('.rc-stage').scrollIntoView({ block: 'center' });
    });
  }

  applyStage(card, card.__pct, true);
  return card;
}

/** Open (unfold to the tracklist) or close (screw it back up). */
function setOpen(card, open, done) {
  if (!card.__frames) return;
  card.classList.toggle('open', open);
  const btn = card.querySelector('.unfold');
  btn.setAttribute('aria-expanded', String(open));
  btn.querySelector('.unfold-txt').textContent = open ? 'FOLD BACK' : 'PLAY';
  playTo(card, open ? 0 : 100, done);
}

/* ------------------------------------------------------------
   Measuring
   ------------------------------------------------------------ */
function measureReceipt(card) { fitFrames(card); }

function measureAllReceipts() {
  document.querySelectorAll('.album').forEach(measureReceipt);
}

let __measureTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(__measureTimer);
  __measureTimer = setTimeout(measureAllReceipts, 180);
});
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(measureAllReceipts);
}
