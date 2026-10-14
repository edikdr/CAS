/*
 * core/guitar/strings.js - six vibrating strings for the DOM guitar.
 *
 * Public API: createStrings(container, { canvas, strings }) -> { pluck(strength, direction), destroy() }
 *   canvas   {w, h} of the guitar manifest; strings [{nut: [x, y], saddle: [x, y]}] low E first
 *   pluck    strength 0..1; direction 'down' (low E -> high e) or 'up'
 *
 * Each string is a static line plus a soft "blur band" that shows the vibration. A pluck plays one
 * Web Animation per string (transform + opacity keyframes of a damped oscillation), so the
 * vibration runs on the compositor with no per-frame JS. Reduced motion: pluck does nothing.
 * Geometry is in container-query units of .guitar__strings, so nothing is measured in JS.
 */

import { Motion } from '../motion.js';

const RING_MS = [1500, 1400, 1300, 1150, 1000, 900];   // low E rings longest
const WIDTH = [1.7, 1.5, 1.3, 1.1, 0.9, 0.8];          // px
const WOUND = 4;                                        // the 4 low strings are bronze-wound
const STEP_MS = 34;                                     // keyframe spacing: a ~15 Hz shimmer

function keyframes(amp, ringMs) {
  const frames = [];
  const n = Math.max(2, Math.round(ringMs / STEP_MS));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const env = Math.exp(-4 * k) * (1 - k);
    const side = i % 2 ? -1 : 1;
    frames.push({
      offset: k,
      opacity: Math.min(1, env * 1.2),
      transform: `translateX(${(side * amp * env).toFixed(2)}px) scaleX(${(0.25 + env).toFixed(3)})`,
    });
  }
  return frames;
}

export function createStrings(container, { canvas, strings }) {
  const box = document.createElement('div');
  box.className = 'guitar__strings';
  const bands = strings.map((s, i) => {
    const [x0, y0] = s.nut;
    const [x1, y1] = s.saddle;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const el = document.createElement('div');
    el.className = `string${i < WOUND ? ' string--wound' : ''}`;
    el.style.cssText = `left:${(x0 / canvas.w) * 100}%;top:${(y0 / canvas.h) * 100}%;` +
      `height:${(len / canvas.h) * 100}cqh;--w:${WIDTH[i]}px;` +
      `transform:rotate(${(-Math.asin((x1 - x0) / len) * 180) / Math.PI}deg)`;
    const band = document.createElement('span');
    band.className = 'string__band';
    el.append(Object.assign(document.createElement('span'), { className: 'string__line' }), band);
    box.append(el);
    return { band, anim: null };
  });
  container.append(box);

  return {
    pluck(strength = 0.6, direction = 'down') {
      if (Motion.reduced) return;
      const s = Math.max(0, Math.min(1, strength));
      const gap = 16 - s * 8;
      bands.forEach((b, i) => {
        const order = direction === 'up' ? bands.length - 1 - i : i;
        b.anim?.cancel();
        b.anim = b.band.animate(keyframes(1 + s * 3, RING_MS[i] * (0.6 + s * 0.4)), {
          duration: RING_MS[i] * (0.6 + s * 0.4),
          delay: order * gap,
          easing: 'linear',
        });
      });
    },
    destroy() {
      bands.forEach((b) => b.anim?.cancel());
      box.remove();
    },
  };
}
