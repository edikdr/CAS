/*
 * core/sfx.js - short interface sounds (Web Audio): the wall switch clicks.
 *
 * Public API:
 *   Sfx.preload()               fetch the files once the page is idle (a few KB, not decoded yet)
 *   Sfx.play(name, { gain })    name: 'switch-on' | 'switch-off'; gain 0..1. Call it from a user
 *                               gesture: the first call creates the AudioContext and decodes
 *
 * Files: assets/sfx/ (rights class "uiSounds": made with ElevenLabs Sound Effects, see
 * docs/ASSET_REGISTER.md). When the rights gate refuses the class nothing is fetched. Sound is
 * decoration: no Web Audio, a blocked fetch or a bad file all mean silence, never an error.
 */

import { RightsGate } from './rights.js';

const FILES = {
  'switch-on': new URL('../assets/sfx/switch-on.mp3', import.meta.url),
  'switch-off': new URL('../assets/sfx/switch-off.mp3', import.meta.url),
};

let ctx = null;
const bytes = new Map();    // name -> Promise<ArrayBuffer | null>
const buffers = new Map();  // name -> Promise<AudioBuffer | null>

const allowed = () => RightsGate.allows('uiSounds') && 'AudioContext' in window;

function fetchBytes(name) {
  if (!bytes.has(name)) {
    bytes.set(name, fetch(FILES[name]).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  }
  return bytes.get(name);
}

function decoded(name) {
  if (!buffers.has(name)) {
    buffers.set(name, fetchBytes(name).then((b) => (b ? ctx.decodeAudioData(b.slice(0)) : null)).catch(() => null));
  }
  return buffers.get(name);
}

export const Sfx = {
  preload() {
    if (!allowed()) return;
    const go = () => Object.keys(FILES).forEach(fetchBytes);
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1500);
  },

  async play(name, { gain = 1 } = {}) {
    if (!FILES[name] || !allowed() || gain <= 0) return;
    try {
      ctx ??= new AudioContext({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') ctx.resume();
      const buffer = await decoded(name);
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const level = ctx.createGain();
      level.gain.value = Math.min(1, gain);
      source.buffer = buffer;
      source.connect(level).connect(ctx.destination);
      source.start();
    } catch {
      /* silence */
    }
  },
};
