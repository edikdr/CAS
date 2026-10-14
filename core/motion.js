/*
 * core/motion.js - one answer to "may things move?" (CONTRACT section 5).
 *
 * Public API:
 *   Motion.reduced          true if the OS asks for reduced motion OR the visitor chose "motion off"
 *   Motion.userOff          the visitor's own choice (persisted as storage key "motion")
 *   Motion.setUserOff(bool)
 *   Motion.on('change', fn) fn(reduced)
 * Mirrors the state on <html data-motion="off"> (set first by core/boot.js), which is the only
 * thing CSS should test. Reduced motion = no string vibration, no flicker, no letter effects,
 * plain fades only.
 */

import { createEmitter } from './emitter.js';
import { storage } from './storage.js';

const html = document.documentElement;
const mq = matchMedia('(prefers-reduced-motion: reduce)');
const events = createEmitter();
let userOff = storage.get('motion') === 'off';

function apply() {
  const reduced = mq.matches || userOff;
  if ((html.dataset.motion === 'off') !== reduced) {
    if (reduced) html.dataset.motion = 'off';
    else delete html.dataset.motion;
  }
  events.emit('change', reduced);
}

mq.addEventListener('change', apply);
apply();

export const Motion = {
  get reduced() { return mq.matches || userOff; },
  get userOff() { return userOff; },
  setUserOff(off) {
    userOff = !!off;
    storage.set('motion', userOff ? 'off' : 'on');
    apply();
  },
  on: events.on,
};
