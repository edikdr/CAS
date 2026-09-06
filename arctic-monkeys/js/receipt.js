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

/* The unfold is one continuous move, not a slideshow.

   A float position runs from 100 to 0 on an eased curve. At any moment
   it sits between two rendered stages, and both are on screen: the one
   behind fading out as the one ahead fades in, with the column height
   and the frame offset interpolated between their boxes at the same
   time. Nothing snaps, because nothing is ever switched — it is only
   ever a blend of the two nearest poses. */
const UNFOLD_MS = 1350;      // 100 → 0
const FOLD_MS = 950;         // and back, a screw-up is quicker than a smoothing

/* How hard to bias the cross-fade towards whichever pose is nearer.
   A straight linear mix spends half of every gap at 50/50, and two
   half-strength poses on top of each other read as a flat smear rather
   than paper with volume. This keeps one pose dominant for most of the
   gap and does the actual swap quickly through the middle. */
function blendCurve(t) {
  const k = 2.4;
  return t < 0.5
    ? 0.5 * Math.pow(2 * t, k)
    : 1 - 0.5 * Math.pow(2 * (1 - t), k);
}

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

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
  const [fx, , flw] = data.flat;
  const k = rw / flw;

  card.__k = k;
  stack.style.width = (fw * k).toFixed(1) + 'px';
  stack.style.height = (fh * k).toFixed(1) + 'px';
  // Horizontally the frames line up with the live receipt, so the hand-off
  // to the real thing is invisible. Vertically each pose is placed by its
  // own content box in applyPos().
  stack.style.left = (live.offsetLeft - fx * k).toFixed(1) + 'px';

  card.__liveH = live.offsetHeight;
  applyPos(card, card.__pos, true);
}

/** The drawn area of one stage, in css px, or null if not recorded. */
function stageBox(card, pct) {
  const data = card.__frames;
  const box = data && data.boxes && data.boxes[pct];
  if (!box || !card.__k) return null;
  const k = card.__k;
  return { y: box[1] * k, h: box[3] * k };
}

/** The stages whose images have arrived, newest-first. */
function loadedStages(card) {
  const imgs = card.__img;
  if (!imgs) return card.__frames.stages;
  const ready = card.__frames.stages.filter(p => {
    const img = imgs[p];
    return img && img.complete && img.naturalWidth > 0;
  });
  return ready.length ? ready : card.__frames.stages.slice(0, 1);
}

/** The two loaded stages either side of a position, and the mix between. */
function neighbours(card, pos) {
  const stages = loadedStages(card);             // descending: 100 … 2
  if (pos >= stages[0]) return { hi: stages[0], lo: stages[0], t: 0 };
  for (let i = 0; i < stages.length - 1; i++) {
    const hi = stages[i], lo = stages[i + 1];
    if (pos <= hi && pos >= lo) {
      return { hi, lo, t: (hi - pos) / (hi - lo) };
    }
  }
  // below the last rendered stage the flat receipt takes over
  const last = stages[stages.length - 1];
  return { hi: last, lo: last, t: Math.min(1, (last - pos) / last) };
}

/** Show a position on the 100…0 scale. `hard` skips any easing of state. */
function applyPos(card, pos, hard) {
  card.__pos = pos;
  card.dataset.pct = Math.round(pos);

  const data = card.__frames;
  const flat = pos <= 0.01;
  card.classList.toggle('flat', flat);

  if (!data) return;

  const { hi, lo, t: raw } = neighbours(card, pos);
  const t = blendCurve(raw);
  const last = data.stages[data.stages.length - 1];

  /* Under the last rendered stage the paper is nearly flat already, so
     the frames dissolve into the live receipt rather than cutting to it. */
  const handover = pos < last ? 1 - pos / last : 0;

  card.querySelectorAll('.rc-frame').forEach(img => {
    const pct = +img.dataset.pct;
    let o = 0;
    if (pct === hi) o = (1 - t);
    if (pct === lo) o = Math.max(o, t);
    if (hi === lo && pct === hi) o = 1;
    img.style.opacity = (o * (1 - handover)).toFixed(3);
  });

  const live = card.querySelector('.rc-paper');
  if (live) live.style.opacity = flat ? '1' : handover.toFixed(3);

  // height and offset interpolate too, so the column never jumps
  const bHi = stageBox(card, hi);
  const bLo = stageBox(card, lo);
  const stage = card.querySelector('.rc-stage');
  const stack = card.querySelector('.rc-frames');
  if (stage && bHi && bLo) {
    // height and offset track the real position, not the biased blend,
    // so the column moves evenly even while the images swap quickly
    const h = lerp(bHi.h, bLo.h, raw);
    const y = lerp(bHi.y, bLo.y, raw);
    stage.style.height = lerp(h, card.__liveH || h, handover).toFixed(1) + 'px';
    if (stack) stack.style.top = (-y).toFixed(1) + 'px';
  } else if (stage && flat) {
    stage.style.height = (card.__liveH || 0).toFixed(1) + 'px';
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Fetch the frames in two waves.
 *
 * Sixty images is a couple of megabytes, and waiting for all of them
 * before the paper moves would be worse than the stepping this was meant
 * to fix. So a coarse spread arrives first — enough to animate from — and
 * the movement starts on that. The rest land while it plays and join in
 * as they do, because `neighbours()` only ever blends between frames that
 * have actually arrived. On a fast connection the difference is invisible;
 * on a slow one the paper still moves, just with fewer in-betweens.
 */
function preloadFrames(card) {
  if (card.__preloaded) return card.__preloaded;
  if (!card.__frames) return (card.__preloaded = Promise.resolve());

  const stages = card.__frames.stages;
  const imgs = card.__img || {};
  const load = pct => {
    const img = imgs[pct];
    if (!img) return Promise.resolve();
    if (!img.getAttribute('src')) img.src = img.dataset.src;
    return img.complete
      ? Promise.resolve()
      : new Promise(r => { img.onload = img.onerror = r; });
  };

  // one in five, plus both ends — about a dozen images
  const coarse = stages.filter((_, i) => i % 5 === 0);
  if (!coarse.includes(stages[stages.length - 1])) coarse.push(stages[stages.length - 1]);

  card.__preloaded = Promise.race([
    Promise.all(coarse.map(load)),
    new Promise(r => setTimeout(r, 2500))
  ]).then(() => {
    // the rest, unawaited — they slot in as they arrive
    stages.filter(p => !coarse.includes(p)).forEach(load);
  });

  return card.__preloaded;
}

/** Run the paper from where it is to `target`, as one movement. */
async function playTo(card, target, done) {
  if (!card.__frames) { applyPos(card, target, true); if (done) done(); return; }

  if (card.__raf) { cancelAnimationFrame(card.__raf); card.__raf = null; }
  await preloadFrames(card);

  const from = card.__pos;
  if (REDUCED() || Math.abs(target - from) < 0.5) {
    applyPos(card, target, true);
    if (done) done();
    return;
  }

  const opening = target < from;
  const span = Math.abs(target - from) / 100;
  const dur = (opening ? UNFOLD_MS : FOLD_MS) * Math.max(0.35, span);
  const ease = opening ? easeInOutCubic : easeOutCubic;
  const start = performance.now();

  const step = now => {
    const t = Math.min(1, (now - start) / dur);
    applyPos(card, lerp(from, target, ease(t)));
    if (t < 1) card.__raf = requestAnimationFrame(step);
    else { card.__raf = null; if (done) done(); }
  };
  card.__raf = requestAnimationFrame(step);
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
  card.__pos = data ? 100 : 0;

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
      <span class="rc-title">${esc(album.short)} · ${album.year}</span>
    </div>
  `;

  // pct → image, so playback never touches the DOM to find a frame
  card.__img = {};
  card.querySelectorAll('.rc-frame').forEach(img => {
    card.__img[+img.dataset.pct] = img;
  });

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

  applyPos(card, card.__pos, true);
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
