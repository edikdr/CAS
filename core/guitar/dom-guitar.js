/*
 * core/guitar/dom-guitar.js - the layered-DOM guitar (phones, and the fallback everywhere).
 *
 * Public API: await createDomGuitar(slot) -> { pluck(strength, direction), flip(), destroy() }
 *
 * Layers come from assets/guitar/dom/manifest.json (built by tools/cutout_guitar.py): each WebP
 * sits at its own translateZ inside a preserve-3d stack, so tilting gives parallax. Tap flips
 * front/back (rotateY, CSS transition). Tilt follows DeviceOrientation on phones (iOS asks for
 * permission through the "Tilt" control) or a pointer drag elsewhere; angles are clamped to
 * +-20 deg (X) / +-25 deg (Y) and eased on the shared Loop only while they change.
 * Reduced motion: no tilt, flip becomes a cross-fade, strings stay still.
 */

import { Loop } from '../loop.js';
import { Motion } from '../motion.js';
import { fetchJson } from '../fetch-json.js';
import { hasOrientation, needsOrientationPermission } from '../capability.js';
import { createStrings } from './strings.js';

const MAX_X = 20;
const MAX_Y = 25;
const SITE = new URL('../../', import.meta.url);
const MANIFEST = new URL('../../assets/guitar/dom/manifest.json', import.meta.url);
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

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

  // ---- tilt -----------------------------------------------------------------------------
  let target = { x: 0, y: 0 };
  let angle = { x: 0, y: 0 };
  let stopEase = null;
  const ease = () => {
    angle.x += (target.x - angle.x) * 0.18;
    angle.y += (target.y - angle.y) * 0.18;
    const settled = Math.abs(target.x - angle.x) < 0.05 && Math.abs(target.y - angle.y) < 0.05;
    if (settled) angle = { ...target };
    tilt.style.transform = `rotateX(${angle.x.toFixed(2)}deg) rotateY(${angle.y.toFixed(2)}deg)`;
    if (settled) stopEase = null;
    return !settled;
  };
  const aim = (x, y) => {
    if (Motion.reduced) { x = 0; y = 0; }
    target = { x: clamp(x, MAX_X), y: clamp(y, MAX_Y) };
    if (!stopEase) stopEase = Loop.add(ease);
  };

  let flipped = false;
  const flip = () => {
    flipped = !flipped;
    root.classList.toggle('is-flipped', flipped);
  };

  // pointer: drag tilts, a short tap flips
  let drag = null;
  const onDown = (e) => {
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    root.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved && !orienting) aim(-dy * 0.25, dx * 0.3);
  };
  const onUp = () => {
    if (drag && !drag.moved && performance.now() - drag.t < 400) flip();
    drag = null;
    if (!orienting) aim(0, 0);
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  root.tabIndex = 0;

  // device orientation: relative to the first reading, so any holding angle is "straight"
  let orienting = false;
  let rest = null;
  const onOrient = (e) => {
    if (e.beta == null || e.gamma == null) return;
    rest ??= { beta: e.beta, gamma: e.gamma };
    aim((e.beta - rest.beta) * 0.5, (e.gamma - rest.gamma) * 0.6);
  };
  const listenOrientation = () => {
    orienting = true;
    addEventListener('deviceorientation', onOrient);
  };
  if (hasOrientation() && !needsOrientationPermission()) listenOrientation();

  return {
    pluck: (strength, direction) => strings.pluck(strength, direction),
    flip,
    /** iOS: call from a tap on the "Tilt" control. Resolves true when tilt is active. */
    async enableTilt() {
      if (!hasOrientation()) return false;
      if (needsOrientationPermission() && (await DeviceOrientationEvent.requestPermission()) !== 'granted') return false;
      if (!orienting) listenOrientation();
      return true;
    },
    destroy() {
      removeEventListener('deviceorientation', onOrient);
      stopEase?.();
      strings.destroy();
      root.remove();
    },
  };
}
