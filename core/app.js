/*
 * core/app.js - entry module (the only module <script> in index.html) and composition root.
 *
 * Boot order: scene (lights, film slot, controls) paints first without waiting for data;
 * then rights gate + data store load in parallel. Sets <html data-state="ready|error"> so
 * tests and later modules can wait for boot.
 *
 * Must not change: it is the single entry point; keep its static import graph small
 * (check:budgets counts it against the 90 KB initial-JS budget).
 */

import { RightsGate } from './rights.js';
import { DataStore } from './data-store.js';
import { LightRig } from './light-rig.js';
import { FilmSlot } from './film-slot.js';
import { Motion } from './motion.js';

const root = document.documentElement;
const $ = (sel) => document.querySelector(sel);

/** A pressed/unpressed pill button bound to some state. */
function bindToggle(button, read, write) {
  const paint = () => button.setAttribute('aria-pressed', String(read()));
  button.addEventListener('click', () => { write(!read()); paint(); });
  paint();
  return paint;
}

LightRig.mount({ garland: $('#garland'), glow: $('#glow') });
FilmSlot.mount($('#film-slot'));
bindToggle($('#toggle-lights'), () => LightRig.enabled, (on) => LightRig.setEnabled(on));
const motionButton = $('#toggle-motion');
const paintMotion = bindToggle(motionButton, () => !Motion.reduced, (on) => Motion.setUserOff(!on));
Motion.on('change', paintMotion);

try {
  await Promise.all([RightsGate.load(), DataStore.load()]);
  root.dataset.state = 'ready';
} catch (err) {
  root.dataset.state = 'error';
  console.error(err);
}
