/*
 * core/guitar/guitar-stage.js - GuitarStage (CONTRACT section 7): one guitar, two renderers.
 *
 * Public API:
 *   await GuitarStage.mount(el)        picks the mode from the device: 3D on desktops that can run it
 *                                      (capability.js), the photo guitar on phones and as fallback
 *   GuitarStage.pluck(strength, direction)   strength 0..1, direction 'down' | 'up'
 *   await GuitarStage.setMode('dom' | 'gl')  switch renderer (tests, fallback); not persisted - there is
 *                                      no visible toggle, desktops always get 3D (owner's call)
 *   GuitarStage.flip(), GuitarStage.destroy(), GuitarStage.mode, GuitarStage.enableTilt()
 *   GuitarStage.on('mode', fn)
 *
 * The guitar is built from the catalogue photos (rights class "guitarPhotos"): when the rights
 * gate refuses it (public build before own photos exist) nothing is mounted.
 * Must not change: method names; the GL path must keep falling back to DOM on any failure.
 */

import { createEmitter } from '../emitter.js';
import { RightsGate } from '../rights.js';
import { preferredGuitarMode } from '../capability.js';
import { createDomGuitar } from './dom-guitar.js';

const events = createEmitter();
let slot = null;
let impl = null;
let mode = null;
let pending = Promise.resolve();

async function build(want) {
  impl?.destroy();
  impl = null;
  if (!slot || !RightsGate.allows('guitarPhotos')) return null;
  if (want === 'gl') {
    try {
      const { createGlGuitar } = await import('./gl-guitar.js');
      impl = await createGlGuitar(slot, { onFail: () => GuitarStage.setMode('dom', false) });
      return 'gl';
    } catch (err) {
      console.warn('GuitarStage: WebGL guitar unavailable, using the flat guitar', err);
    }
  }
  impl = await createDomGuitar(slot);
  return 'dom';
}

export const GuitarStage = {
  mount(el) {
    slot = el;
    return this.setMode(preferredGuitarMode());
  },

  setMode(want) {
    pending = pending.then(async () => {
      mode = await build(want);
      events.emit('mode', mode);
      return mode;
    });
    return pending;
  },

  pluck(strength, direction) { impl?.pluck(strength, direction); },
  flip() { impl?.flip(); },
  enableTilt() { return impl?.enableTilt ? impl.enableTilt() : Promise.resolve(false); },
  destroy() { impl?.destroy(); impl = null; mode = null; },
  get mode() { return mode; },
  on: events.on,
};
