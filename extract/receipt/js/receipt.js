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

/* Ten poses, played as steps.

   One stage at a time with a short cross-fade between neighbours: the
   fade is quick enough that each pose is what you actually see, rather
   than a permanent blend of two. Sixty frames dissolved into each other
   read as a flat smear; ten stepped read as paper being opened out. */
const STEP_MS = 115;       // one stage to the next
const FADE_MS = 150;       // the cross-fade between them
const GROW_MS = 230;       // the column opening to full height (css .22s) before unfolding

/* The two paper sounds are 480 KB between them and are only heard once a
   receipt is pressed. They load when the page has gone quiet after loading,
   or the moment a PLAY button is first hovered or focused — whichever comes
   first — instead of competing with the page for its first second. */
const SFX = { fold: null, unfold: null };
function warmSfx() {
  if (SFX.fold) return;
  SFX.fold = new Audio('assets/sfx/fold.wav');
  SFX.unfold = new Audio('assets/sfx/unfold.wav');
  SFX.fold.preload = SFX.unfold.preload = 'auto';
}
window.addEventListener('load', () => {
  (window.requestIdleCallback || (fn => setTimeout(fn, 1500)))(warmSfx, { timeout: 4000 });
}, { once: true });
function playSfx(kind) {
  warmSfx();
  const a = SFX[kind];
  if (!a) return;
  try { a.currentTime = 0; a.volume = 0.7; a.play().catch(() => {}); } catch (_) {}
}

/**
 * Lay the frame images over the live receipt.
 *
 * The renderer records where an undeformed sheet lands inside the frame
 * (`flat`), so scaling by liveWidth / flat.width and shifting by -flat.x
 * puts the printed sheet in the frames exactly on top of the real one —
 * which is what makes the last step of the unfold invisible.
 */
/** The live sheet's box — read in one pass for every receipt, before any writes. */
function readGeometry(card) {
  const live = card.querySelector('.rc-paper');
  if (!live || !live.offsetWidth) return null;
  return { rw: live.offsetWidth, left: live.offsetLeft, liveH: live.offsetHeight };
}

function fitFrames(card, geo) {
  const data = card.__frames;
  if (!data) return;
  const live = card.querySelector('.rc-paper');
  const stack = card.querySelector('.rc-frames');
  if (!live || !stack) return;

  const g = geo || readGeometry(card);
  if (!g) return;
  const rw = g.rw;
  // nothing moved since the last fit: nothing to write, no layout to redo
  const last = card.__fit;
  if (last && last.rw === rw && last.left === g.left && last.liveH === g.liveH) return;
  card.__fit = g;
  const [fw, fh] = data.frame;
  const [fx, , flw] = data.flat;
  const k = rw / flw;

  card.__k = k;
  stack.style.width = (fw * k).toFixed(1) + 'px';
  stack.style.height = (fh * k).toFixed(1) + 'px';
  stack.style.left = (g.left - fx * k).toFixed(1) + 'px';

  card.__liveH = g.liveH;
  /* Each frame carries its own lift, so its drawn paper starts at the top
     of the stage whichever frame is showing. Lifting the whole stack
     instead made the frame fading out jump with the one fading in, and
     for a moment it rode up over the album's notes. */
  card.querySelectorAll('.rc-frame').forEach(img => {
    const box = stageBox(card, +img.dataset.pct);
    img.style.transform = box ? `translateY(${(-box.y).toFixed(1)}px)` : '';
  });
  applyStage(card, card.__pct, true);
}

/** The drawn area of one stage, in css px, or null if not recorded. */
function stageBox(card, pct) {
  const data = card.__frames;
  const box = data && data.boxes && data.boxes[pct];
  if (!box || !card.__k) return null;
  const k = card.__k;
  return { y: box[1] * k, h: box[3] * k };
}

/** Show one stage. `hard` skips the cross-fade. */
function applyStage(card, pct, hard) {
  card.__pct = pct;
  card.dataset.pct = pct;

  const flat = pct <= 0;
  card.classList.toggle('flat', flat);
  if (!card.__frames) return;

  card.querySelectorAll('.rc-frame').forEach(img => {
    img.style.transitionDuration = hard ? '0ms' : FADE_MS + 'ms';
    img.style.opacity = (!flat && +img.dataset.pct === pct) ? '1' : '0';
  });

  const live = card.querySelector('.rc-paper');
  if (live) live.style.opacity = flat ? '1' : '0';

  const stage = card.querySelector('.rc-stage');
  const stack = card.querySelector('.rc-frames');
  if (stage) {
    const box = stageBox(card, pct);
    const want = flat ? (card.__liveH || 0) : (box ? box.h : card.__liveH || 0);
    // while unfolding the column is held at its full height (see playTo)
    const h = Math.max(want, card.__hold || 0);
    if (h) stage.style.height = h.toFixed(0) + 'px';
    if (stack) stack.style.top = '0px';
  }
}

/** Fetch the frames for this album; ten of them, so one wave is enough. */
function preloadFrames(card) {
  if (card.__preloaded) return card.__preloaded;
  if (!card.__frames) return (card.__preloaded = Promise.resolve());

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
  await preloadFrames(card);

  const all = [...data.stages, 0].sort((a, b) => b - a);   // 100 … 10, 0
  const from = card.__pct;
  let path = from > target
    ? all.filter(p => p < from && p >= target)
    : all.filter(p => p > from && p <= target).reverse();
  if (!path.length) path = [target];

  card.__hold = 0;
  if (REDUCED()) { applyStage(card, target, true); if (done) done(); return; }

  /* The stage's height eases in behind each frame, and frames cross-fade,
     so a frame used to reach past the column — over the button and the
     album's name under it. Now the column only moves while the paper is
     still: unfolding, it opens to full height first and the paper opens
     inside it; folding, the paper balls up inside the room it had and the
     column closes after. */
  const stageEl = card.querySelector('.rc-stage');
  const now = stageEl ? parseFloat(stageEl.style.height) || 0 : 0;
  const tallest = Math.max(...path.map(p => p <= 0
    ? (card.__liveH || 0)
    : ((stageBox(card, p) || {}).h || 0)));
  const growing = tallest > now;
  card.__hold = growing ? tallest : now;
  if (growing && stageEl) stageEl.style.height = tallest.toFixed(0) + 'px';

  const settle = () => {
    card.__timer = null;
    card.__hold = 0;
    applyStage(card, card.__pct);           // the column takes the last frame's height
    if (done) done();
  };
  let i = 0;
  const step = () => {
    applyStage(card, path[i]);
    i++;
    if (i < path.length) card.__timer = setTimeout(step, STEP_MS);
    else card.__timer = setTimeout(settle, FADE_MS + 20);   // once the last fade is over
  };
  // growing: let the column open before the paper does
  card.__timer = setTimeout(step, growing ? GROW_MS : 0);
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
             ${pct === 100
               ? `src="assets/crumple/${album.id}/${pct}.webp" loading="lazy"`
               : ''}>`).join('')
    : '';

  card.innerHTML = `
    <div class="rc-stage">
      <div class="rc-frames" aria-hidden="true">${frames}</div>
      <div class="rc-paper">${receiptMarkup(album)}</div>
    </div>

    <div class="rc-controls">
      <button class="unfold" type="button" aria-expanded="${data ? 'false' : 'true'}"
              aria-controls="album-${album.id}"
              aria-label="${data ? 'Unfold' : 'Show'} the ${esc(album.title)} receipt">
        <span class="unfold-face">
          <span class="unfold-ico" aria-hidden="true"></span>
          <span class="unfold-txt">${data ? 'PLAY' : 'TRACKS'}</span>
        </span>
      </button>
      <span class="rc-title cut cut-album" data-ransom="${esc(album.short)}"></span>
      <span class="rc-year">${album.year}</span>
    </div>
  `;

  // pct → image, so playback never touches the DOM to find a frame
  card.__img = {};
  card.querySelectorAll('.rc-frame').forEach(img => {
    card.__img[+img.dataset.pct] = img;
  });

  const title = card.querySelector('.rc-title');
  if (title && typeof ransom === 'function') ransom(title, album.short);

  const btn = card.querySelector('.unfold');
  if (data) {
    // decode the frames while the pointer is still on its way to the button
    btn.addEventListener('pointerenter', () => { warmSfx(); preloadFrames(card, album); }, { once: true });
    btn.addEventListener('focus', () => { warmSfx(); preloadFrames(card, album); }, { once: true });
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
function setOpen(card, open, done, quiet) {
  if (!card.__frames) return;
  /* One receipt at a time, unless "unfold everything" is on. */
  if (open) {
    const all = document.getElementById('unfoldAll');
    if (!all || !all.classList.contains('on')) {
      document.querySelectorAll('.album.open').forEach(other => {
        if (other !== card) setOpen(other, false, null, true);
      });
    }
  }
  const wasOpen = card.classList.contains('open');
  if (!quiet && open !== wasOpen) playSfx(open ? 'unfold' : 'fold');
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
  /* every read first, then every write: interleaving them made the browser
     lay the page out again for each receipt */
  const cards = [...document.querySelectorAll('.album')];
  const geos = cards.map(readGeometry);
  cards.forEach((card, i) => fitFrames(card, geos[i]));
}

let __measureTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(__measureTimer);
  __measureTimer = setTimeout(measureAllReceipts, 180);
});
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(measureAllReceipts);
}
