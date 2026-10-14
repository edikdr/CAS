/*
 * core/app.js - entry module (the only module <script> in index.html) and composition root.
 *
 * Boot order: scene (lights, wall switch, film slot, controls) paints first without waiting for data;
 * rights gate + data store load in parallel; the guitar mounts as soon as the rights gate is in.
 * Music wiring: PreviewPlayer -> BeatClock -> onsets pluck the guitar (alternating down/up
 * strums, amplitude = onset strength), beats pulse the lights. Sets <html data-state>.
 * Stage 2: once ready, imports features/main.js and awaits its start() (Stage 2 registers its
 * modals, renderers and collage there), then handles ?track=.
 * Links: ?track=<trackId> opens that track's window on load (Back closes it).
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
import { ModalManager } from './modal-manager.js';
import { TrackModal } from './track-modal.js';
import { Sfx } from './sfx.js';

const ONSET_MIN = 0.22; // weaker onsets do not pluck (they are mostly noise in the analysis)
const root = document.documentElement;
const params = new URLSearchParams(location.search);
const $ = (sel) => document.querySelector(sel);

/** The wall switch: two push buttons, On and Off (off: garland dark, room at 25%). A click sounds
 *  when the state changes, at the player's volume (silent when muted). */
function bindLightSwitch(group) {
  const [on, off] = group.querySelectorAll('button');
  const paint = () => {
    on.setAttribute('aria-pressed', String(LightRig.enabled));
    off.setAttribute('aria-pressed', String(!LightRig.enabled));
  };
  const press = (want) => {
    if (LightRig.enabled === want) return;
    Sfx.play(want ? 'switch-on' : 'switch-off', { gain: PreviewPlayer.muted ? 0 : 0.8 * PreviewPlayer.volume });
    LightRig.setEnabled(want);
  };
  on.addEventListener('click', () => press(true));
  off.addEventListener('click', () => press(false));
  LightRig.on('toggle', paint);
  paint();
}

/** A pressed/unpressed pill button bound to some state. */
function bindToggle(button, read, write) {
  const paint = () => button.setAttribute('aria-pressed', String(read()));
  button.addEventListener('click', () => { write(!read()); paint(); });
  paint();
  return paint;
}

LightRig.mount({ garland: $('#garland'), glow: $('#glow') });
FilmSlot.mount($('#film-slot'));
bindLightSwitch($('#light-switch'));
const paintMotion = bindToggle($('#toggle-motion'), () => !Motion.reduced, (on) => Motion.setUserOff(!on));
Motion.on('change', paintMotion);

PreviewPlayer.mount($('#preview'));
PreviewPlayer.on('track', (id) => {
  BeatClock.setBeats(null);
  DataStore.beats(id)
    .then((b) => { if (PreviewPlayer.trackId === id) BeatClock.setBeats(b); })
    .catch(() => { /* offline or broken file: no beats, the guitar just sways */ });
});
let strumDown = true;
BeatClock.on('onset', ({ s }) => {
  if (s < ONSET_MIN) return;
  GuitarStage.pluck(s, strumDown ? 'down' : 'up');
  strumDown = !strumDown;
});
BeatClock.on('beat', () => LightRig.pulse(0.45));

if (params.has('debug')) {
  window.sunniva = { RightsGate, DataStore, LightRig, Motion, PreviewPlayer, BeatClock, GuitarStage, ModalManager, TrackModal, Sfx };
}

try {
  // the guitar only needs the rights gate: it starts loading while the catalogue data still loads
  const data = DataStore.load();
  await RightsGate.load();
  await Promise.all([GuitarStage.mount($('#guitar-slot')), data]);
  const tilt = $('#enable-tilt');
  if (needsOrientationPermission()) {
    tilt.hidden = false;
    tilt.addEventListener('click', async () => { tilt.hidden = await GuitarStage.enableTilt(); });
  }
  root.dataset.state = 'ready';
  Sfx.preload();
  try {
    await (await import('../features/main.js')).start?.();
  } catch (err) {
    console.error('features/main.js failed; the room works without Stage 2 features', err);
  }
  if (DataStore.track(params.get('track'))) ModalManager.open('track', { id: params.get('track') });
} catch (err) {
  root.dataset.state = 'error';
  console.error(err);
}
