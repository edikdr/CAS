/* ============================================================
   The receipt
   Every album is a till receipt printed from its own data —
   no images anywhere. It starts screwed up into a ball and
   unfolds in stages (100 → 80 → 60 → 40 → 20 → 0) when the
   button underneath is pressed.

   The crumple is three things stacked:
     1. a clip-path that interpolates between a faceted ball
        and a flat rectangle
     2. an SVG facet/crease overlay that fades out
     3. an feTurbulence displacement filter, scaled by how
        crumpled the paper is (skipped on small screens and
        when reduced motion is asked for)
   ============================================================ */

const STAGES = [100, 80, 60, 40, 20, 0];

/* Ball outline and flat outline share a point count so the two
   interpolate cleanly. 18 points each, walked clockwise. */
const BALL = [
  [50, 2], [66, 5], [78, 13], [90, 22], [96, 36], [98, 50],
  [95, 63], [88, 76], [79, 87], [66, 95], [50, 98], [35, 96],
  [22, 90], [12, 80], [4, 66], [2, 50], [6, 30], [28, 9]
];
const FLAT = [
  [0, 0], [20, 0], [40, 0], [60, 0], [80, 0], [100, 0],
  [100, 20], [100, 40], [100, 60], [100, 80], [100, 100], [80, 100],
  [60, 100], [40, 100], [20, 100], [0, 100], [0, 60], [0, 25]
];

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SMALL = () => window.innerWidth < 620;

/* deterministic pseudo-random, so a receipt looks identical every load */
function seed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);

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

/** The facet/crease overlay that sells the crumple. */
function creaseSvg(id) {
  const rnd = seed('crease-' + id);
  let facets = '', lines = '';
  for (let i = 0; i < 16; i++) {
    const pts = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () =>
      `${(rnd() * 100).toFixed(1)},${(rnd() * 100).toFixed(1)}`).join(' ');
    const dark = rnd() > 0.5;
    const a = (0.05 + rnd() * 0.16).toFixed(3);
    facets += `<polygon points="${pts}" fill="${dark ? '#000' : '#fff'}" opacity="${a}"/>`;
  }
  for (let i = 0; i < 22; i++) {
    const x1 = rnd() * 100, y1 = rnd() * 100;
    const x2 = x1 + (rnd() - 0.5) * 70, y2 = y1 + (rnd() - 0.5) * 70;
    const dark = rnd() > 0.45;
    lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}"
      y2="${y2.toFixed(1)}" stroke="${dark ? '#000' : '#fff'}"
      stroke-width="${(0.2 + rnd() * 0.5).toFixed(2)}"
      opacity="${(0.1 + rnd() * 0.3).toFixed(2)}"/>`;
  }
  return `<svg class="rc-creases" viewBox="0 0 100 100" preserveAspectRatio="none"
     aria-hidden="true" focusable="false">${facets}${lines}</svg>`;
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
   The crumple itself
   ------------------------------------------------------------ */

/** Apply a crumple amount (0 flat … 1 balled) to one receipt. */
function setCrumple(card, c) {
  const ball = card.querySelector('.rc-ball');
  const paper = card.querySelector('.rc-paper');
  const creases = card.querySelector('.rc-creases');
  if (!ball || !paper) return;

  card.style.setProperty('--c', c.toFixed(4));

  // outline: ball → rectangle
  const poly = BALL.map(([bx, by], i) => {
    const [fx, fy] = FLAT[i];
    return `${lerp(fx, bx, c).toFixed(2)}% ${lerp(fy, by, c).toFixed(2)}%`;
  }).join(', ');
  ball.style.clipPath = `polygon(${poly})`;

  // The clip-path is read in percentages of the box, so the box has to
  // become square for the ball to come out round rather than leaf-shaped.
  // Collapsing the height also stops the balled paper from pushing the
  // rest of the card down the page.
  const flatH = card.__flatH || paper.offsetHeight;
  const ballH = (card.__ballW || ball.offsetWidth || 320) * 0.94;
  const boxH = lerp(flatH, ballH, c);
  ball.style.height = boxH.toFixed(0) + 'px';

  const scale = 1 - 0.46 * c;
  ball.style.transform = `scale(${scale.toFixed(4)}) rotate(${(-7 * c).toFixed(2)}deg)`;
  ball.style.borderRadius = `${(c * 46).toFixed(1)}%`;

  // the paper inside squashes and darkens in the folds
  paper.style.transform =
    `scale(${(1 + 0.20 * c).toFixed(4)}) rotate(${(4.5 * c).toFixed(2)}deg)`;
  paper.style.filter = `contrast(${(1 + 0.35 * c).toFixed(2)})`;

  if (creases) creases.style.opacity = (c * 1.05).toFixed(3);

  // the column shrinks with the ball so a balled receipt leaves no gap
  const stage = card.querySelector('.rc-stage');
  if (stage) stage.style.height = (boxH * scale).toFixed(0) + 'px';

  // real paper distortion, where the device can afford it
  const disp = card.__disp;
  if (disp) disp.setAttribute('scale', (c * 26).toFixed(2));

  card.dataset.pct = Math.round(c * 100);
  const label = card.querySelector('.rc-pct');
  if (label) label.textContent = Math.round(c * 100) + '%';
}

/** Walk from one crumple amount to another, pausing on each stage. */
function animateCrumple(card, to, done) {
  const from = parseFloat(card.style.getPropertyValue('--c') || '1');
  if (card.__anim) { cancelAnimationFrame(card.__anim); card.__anim = null; }
  if (card.__hold) { clearTimeout(card.__hold); card.__hold = null; }

  if (REDUCED()) { setCrumple(card, to); if (done) done(); return; }

  // the stages that lie between where we are and where we're going
  const path = STAGES.map(s => s / 100)
    .filter(s => (from < to ? s > from && s <= to : s < from && s >= to));
  if (from > to) path.sort((a, b) => b - a); else path.sort((a, b) => a - b);
  if (!path.length) path.push(to);

  let idx = 0, start = null, segFrom = from;
  const SEG = 380, HOLD = 130;   // ms of travel, then a beat on the stage

  function frame(ts) {
    if (start === null) start = ts;
    const segTo = path[idx];
    const t = Math.min(1, (ts - start) / SEG);
    setCrumple(card, lerp(segFrom, segTo, easeOut(t)));

    if (t < 1) { card.__anim = requestAnimationFrame(frame); return; }

    idx++;
    if (idx >= path.length) { card.__anim = null; if (done) done(); return; }
    segFrom = segTo;
    start = null;
    card.__anim = null;
    card.__hold = setTimeout(() => {   // the pause between stages
      card.__hold = null;
      card.__anim = requestAnimationFrame(frame);
    }, HOLD);
  }
  card.__anim = requestAnimationFrame(frame);
}

/** Measure the flat paper once it is in the document, then re-apply. */
function measureReceipt(card) {
  const paper = card.querySelector('.rc-paper');
  if (!paper) return;
  const prev = parseFloat(card.style.getPropertyValue('--c') || '1');
  const stage = card.querySelector('.rc-stage');
  const ball = card.querySelector('.rc-ball');
  if (stage) stage.style.height = '';
  if (ball) { ball.style.height = ''; card.__ballW = ball.offsetWidth; }
  card.__flatH = paper.offsetHeight;
  setCrumple(card, prev);
}

/** Re-measure every receipt on the page (fonts arriving, window resized). */
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

/* ------------------------------------------------------------
   Build one album card
   ------------------------------------------------------------ */
function buildAlbumCard(album) {
  const card = document.createElement('article');
  card.className = 'album reveal';
  card.id = 'album-' + album.id;
  card.dataset.album = album.id;
  card.style.setProperty('--c', '1');

  const filterId = 'crumple-' + album.id;
  const useFilter = !SMALL() && !REDUCED();

  card.innerHTML = `
    <div class="rc-stage">
      <svg class="rc-filter" aria-hidden="true" focusable="false">
        <filter id="${filterId}" x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.014 0.021"
            numOctaves="3" seed="${album.title.length * 7}" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="26"
            xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </svg>

      <div class="rc-ball">
        <div class="rc-paper"${useFilter ? ` style="filter:url(#${filterId})"` : ''}>
          ${receiptMarkup(album)}
        </div>
        ${creaseSvg(album.id)}
      </div>
    </div>

    <div class="rc-controls">
      <button class="unfold" type="button" aria-expanded="false"
              aria-controls="album-${album.id}">
        <span class="unfold-ico" aria-hidden="true"></span>
        <span class="unfold-txt">PLAY</span>
      </button>
      <div class="rc-status">
        <span class="rc-pct">100%</span>
        <span class="rc-title">${esc(album.short)} · ${album.year}</span>
      </div>
    </div>
  `;

  card.__disp = useFilter ? card.querySelector('feDisplacementMap') : null;
  setCrumple(card, 1);

  const btn = card.querySelector('.unfold');
  btn.addEventListener('click', () => {
    const open = card.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.querySelector('.unfold-txt').textContent = open ? 'FOLD BACK' : 'PLAY';
    animateCrumple(card, open ? 0 : 1);
  });

  return card;
}
