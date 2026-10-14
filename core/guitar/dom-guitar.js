/*
 * core/guitar/dom-guitar.js - the layered-DOM guitar (phones, and the fallback everywhere).
 *
 * Public API: await createDomGuitar(slot) -> { pluck(strength, direction), flip(), enableTilt(), destroy() }
 *
 * The guitar lies horizontally, headstock to the right and the low E string on top, as a player
 * holds it. Layers come from assets/guitar/dom/manifest.json (tools/cutout_guitar.py) in the
 * photo's upright frame; .guitar__lay turns that frame 90 deg clockwise. Each WebP sits at its own
 * translateZ inside a preserve-3d stack, so tilting gives parallax. A tap flips the guitar over its
 * long axis (rotateY in the upright frame, CSS transition). Input: ./tilt.js (tilt, flip, and
 * pressing the strings, handled by ./strings.js). Sizes come from CSS (--guitar-len, --ratio).
 * Reduced motion: no tilt, flip becomes a cross-fade, strings stay still.
 */

import { fetchJson } from '../fetch-json.js';
import { createStrings } from './strings.js';
import { createTilt } from './tilt.js';

const SITE = new URL('../../', import.meta.url);
const MANIFEST = new URL('../../assets/guitar/dom/manifest.json', import.meta.url);

export async function createDomGuitar(slot) {
  const m = await fetchJson(MANIFEST);
  if (!m) throw new Error('DomGuitar: manifest missing');

  const root = document.createElement('div');
  root.className = 'guitar';
  root.style.setProperty('--ratio', String(m.canvas.w / m.canvas.h));
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'An acoustic guitar. Touch the strings, or tap the guitar to turn it over.');
  root.innerHTML = '<div class="guitar__shadow"></div><div class="guitar__sway"><div class="guitar__tilt"><div class="guitar__lay"><div class="guitar__flip"><div class="guitar__front"></div></div></div></div></div>';
  const tilt = root.querySelector('.guitar__tilt');
  const lay = root.querySelector('.guitar__lay');
  const flipper = root.querySelector('.guitar__flip');
  const front = root.querySelector('.guitar__front');

  // the front layers load first (the body is the page's largest paint); the back waits for an
  // idle moment or the first flip
  let loadBack = () => {};
  for (const l of m.layers) {
    const img = new Image(l.w, l.h);
    const src = new URL(l.src, SITE).href;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.className = `guitar__layer guitar__layer--${l.name}`;
    img.style.cssText = `left:${(l.x / m.canvas.w) * 100}%;top:${(l.y / m.canvas.h) * 100}%;width:${(l.w / m.canvas.w) * 100}%;--z:${l.z}`;
    if (l.name === 'back') {
      loadBack = () => { if (!img.src) img.src = src; };
      flipper.append(img);
    } else {
      if (l.name === 'body') img.fetchPriority = 'high';
      img.src = src;
      front.append(img);
    }
  }
  if ('requestIdleCallback' in window) requestIdleCallback(() => loadBack(), { timeout: 3000 });
  else setTimeout(() => loadBack(), 2000);

  let flipped = false;
  /** Screen point -> the upright frame of .guitar__lay (inverse of its 90 deg turn; tilt ignored). */
  const toLocal = (clientX, clientY) => {
    const r = root.getBoundingClientRect();
    const k = r.width / root.offsetWidth || 1;
    const dx = (clientX - (r.left + r.width / 2)) / k;
    const dy = (clientY - (r.top + r.height / 2)) / k;
    return { x: lay.offsetWidth / 2 + dy, y: lay.offsetHeight / 2 - dx };
  };
  const strings = createStrings(front, m, { toLocal, active: () => !flipped });
  slot.append(root);

  const flip = () => {
    loadBack();
    flipped = !flipped;
    root.classList.toggle('is-flipped', flipped);
  };
  const tiltControl = createTilt(root, {
    onAngle: (x, y) => { tilt.style.transform = `rotateX(${x.toFixed(2)}deg) rotateY(${y.toFixed(2)}deg)`; },
    onFlip: flip,
    grab: strings.grab,
  });

  return {
    pluck: (strength, direction) => strings.pluck(strength, direction),
    flip,
    enableTilt: () => tiltControl.enableOrientation(),
    destroy() {
      tiltControl.destroy();
      strings.destroy();
      root.remove();
    },
  };
}
