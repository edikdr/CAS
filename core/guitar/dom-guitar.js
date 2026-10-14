/*
 * core/guitar/dom-guitar.js - the layered-DOM guitar (phones, and the fallback everywhere).
 *
 * Public API: await createDomGuitar(slot) -> { pluck(strength, direction), flip(), enableTilt(), destroy() }
 *
 * Layers come from assets/guitar/dom/manifest.json (built by tools/cutout_guitar.py): each WebP
 * sits at its own translateZ inside a preserve-3d stack, so tilting gives parallax. Tap flips
 * front/back (rotateY, CSS transition). Tilt and tap input: ./tilt.js (shared with the GL guitar).
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
  root.style.aspectRatio = `${m.canvas.w} / ${m.canvas.h}`;
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'An acoustic guitar. Tap to turn it around.');
  root.innerHTML = '<div class="guitar__shadow"></div><div class="guitar__sway"><div class="guitar__tilt"><div class="guitar__flip"><div class="guitar__front"></div></div></div></div>';
  const tilt = root.querySelector('.guitar__tilt');
  const flipper = root.querySelector('.guitar__flip');
  const front = root.querySelector('.guitar__front');

  for (const l of m.layers) {
    const img = new Image(l.w, l.h);
    img.src = new URL(l.src, SITE).href;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.className = `guitar__layer guitar__layer--${l.name}`;
    img.style.cssText = `left:${(l.x / m.canvas.w) * 100}%;top:${(l.y / m.canvas.h) * 100}%;width:${(l.w / m.canvas.w) * 100}%;--z:${l.z}`;
    (l.name === 'back' ? flipper : front).append(img);
  }
  const strings = createStrings(front, m);
  slot.append(root);

  let flipped = false;
  const flip = () => {
    flipped = !flipped;
    root.classList.toggle('is-flipped', flipped);
  };
  const tiltControl = createTilt(root, {
    onAngle: (x, y) => { tilt.style.transform = `rotateX(${x.toFixed(2)}deg) rotateY(${y.toFixed(2)}deg)`; },
    onFlip: flip,
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
