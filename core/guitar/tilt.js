/*
 * core/guitar/tilt.js - input shared by both guitars.
 *
 * Public API: createTilt(el, { onAngle(xDeg, yDeg), onFlip(), grab? }) -> { enableOrientation(), destroy() }
 *   - pointer drag tilts, a short tap (or Enter / Space on the focused element) flips;
 *   - grab = { down(e) -> boolean, move(e), up(e) }: when down() claims a press (it started on a
 *     string), the whole gesture goes to the strings instead of tilting or flipping;
 *   - phones follow DeviceOrientation relative to the first reading (any holding angle is
 *     "straight"); iOS needs enableOrientation() from a tap (the "Tilt" control);
 *   - angles are clamped to +-20 deg (X) / +-25 deg (Y) and eased on the shared Loop only while
 *     they change; reduced motion keeps them at 0.
 */

import { Loop } from '../loop.js';
import { Motion } from '../motion.js';
import { hasOrientation, needsOrientationPermission } from '../capability.js';

const MAX_X = 20;
const MAX_Y = 25;
const clamp = (v, m) => Math.max(-m, Math.min(m, v));

export function createTilt(el, { onAngle, onFlip, grab }) {
  let target = { x: 0, y: 0 };
  let angle = { x: 0, y: 0 };
  let stopEase = null;
  let orienting = false;
  let rest = null;
  let drag = null;
  let grabbing = false;

  const ease = () => {
    angle.x += (target.x - angle.x) * 0.18;
    angle.y += (target.y - angle.y) * 0.18;
    const settled = Math.abs(target.x - angle.x) < 0.05 && Math.abs(target.y - angle.y) < 0.05;
    if (settled) angle = { ...target };
    onAngle(angle.x, angle.y);
    if (settled) stopEase = null;
    return !settled;
  };
  const aim = (x, y) => {
    if (Motion.reduced) { x = 0; y = 0; }
    target = { x: clamp(x, MAX_X), y: clamp(y, MAX_Y) };
    if (!stopEase) stopEase = Loop.add(ease);
  };

  const onDown = (e) => {
    el.setPointerCapture(e.pointerId);
    if (grab?.down(e)) { grabbing = true; return; }
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  };
  const onMove = (e) => {
    if (grabbing) { grab.move(e); return; }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved && !orienting) aim(-dy * 0.25, dx * 0.3);
  };
  const onUp = (e) => {
    if (grabbing) { grabbing = false; grab.up(e); return; }
    if (drag && !drag.moved && performance.now() - drag.t < 400) onFlip();
    drag = null;
    if (!orienting) aim(0, 0);
  };
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip(); }
  };
  const onOrient = (e) => {
    if (e.beta == null || e.gamma == null) return;
    rest ??= { beta: e.beta, gamma: e.gamma };
    aim((e.beta - rest.beta) * 0.5, (e.gamma - rest.gamma) * 0.6);
  };
  const listen = () => {
    orienting = true;
    addEventListener('deviceorientation', onOrient);
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('keydown', onKey);
  el.tabIndex = 0;
  if (hasOrientation() && !needsOrientationPermission()) listen();

  return {
    /** Resolves true when orientation tilt is active (asks for permission on iOS). */
    async enableOrientation() {
      if (!hasOrientation()) return false;
      if (needsOrientationPermission() && (await DeviceOrientationEvent.requestPermission()) !== 'granted') return false;
      if (!orienting) listen();
      return true;
    },
    destroy() {
      removeEventListener('deviceorientation', onOrient);
      stopEase?.();
    },
  };
}
