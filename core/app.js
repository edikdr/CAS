/*
 * core/app.js - entry module (the only module <script> in index.html) and composition root.
 *
 * Boot order: scene (lights, film slot, controls) paints first without waiting for data;
 * then rights gate + data store load in parallel; then the guitar (it needs the rights gate).
 * Music wiring: PreviewPlayer -> BeatClock -> onsets pluck the guitar (alternating down/up
 * strums, amplitude = onset strength), beats pulse the lights. Sets <html data-state>.
 * Debugging: ?debug exposes the core services as window.sunniva.
 *
 * Must not change: it is the single entry point; keep its static import graph small
 * (check:budgets counts it against the 90 KB initial-JS budget).
 */

import { RightsGate } from './rights.js';
import { DataStore } from './data-store.js';
import { LightRig } from './light-rig.js';
import { FilmSlot } from './film-slot.js';
import { Motion } from './motion.js';
import { PreviewPlayer } from './preview-player.js';
import { BeatClock } from './clock.js';
import { GuitarStage } from './guitar/guitar-stage.js';
import { needsOrientationPermission } from './capability.js';

const ONSET_MIN = 0.22; // weaker onsets do not pluck (they are mostly noise in the analysis)
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
const paintMotion = bindToggle($('#toggle-motion'), () => !Motion.reduced, (on) => Motion.setUserOff(!on));
Motion.on('change', paintMotion);

PreviewPlayer.mount($('#preview'));
PreviewPlayer.on('track', (id) => {
  BeatClock.setBeats(null);
  DataStore.beats(id).then((b) => { if (PreviewPlayer.trackId === id) BeatClock.setBeats(b); });
});
let strumDown = true;
BeatClock.on('onset', ({ s }) => {
  if (s < ONSET_MIN) return;
  GuitarStage.pluck(s, strumDown ? 'down' : 'up');
  strumDown = !strumDown;
});
BeatClock.on('beat', () => LightRig.pulse(0.45));

if (new URLSearchParams(location.search).has('debug')) {
  window.sunniva = { RightsGate, DataStore, LightRig, Motion, PreviewPlayer, BeatClock, GuitarStage };
}

try {
  await Promise.all([RightsGate.load(), DataStore.load()]);
  await GuitarStage.mount($('#guitar-slot'));
  const tilt = $('#enable-tilt');
  if (needsOrientationPermission()) {
    tilt.hidden = false;
    tilt.addEventListener('click', async () => { tilt.hidden = await GuitarStage.enableTilt(); });
  }
  root.dataset.state = 'ready';
} catch (err) {
  root.dataset.state = 'error';
  console.error(err);
}
