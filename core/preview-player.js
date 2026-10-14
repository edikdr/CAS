/*
 * core/preview-player.js - the site's single <audio> element (CONTRACT sections 2 and 7).
 *
 * Public API:
 *   PreviewPlayer.mount(audioEl)     the <audio preload="none"> in index.html
 *   play(trackId) -> Promise         call from a click/tap handler; same id resumes, another id switches
 *   pause(), seek(sec), currentTime(), isPlaying(), trackId, audio
 *   setVolume(0..1), volume, setMuted(bool), muted, canSetVolume
 *     volume is remembered (storage "volume"); iOS ignores <audio>.volume, so canSetVolume is
 *     false there and only mute works (the hardware buttons set the level)
 *   on('play'|'pause'|'ended'|'timeupdate'|'seeked'|'track'|'error'|'volume', fn)
 *     'volume' detail: { volume, muted }
 *     'track' detail: trackId (fired when the source changes)
 *     'error' detail: { trackId, appleUrl } -> offer "Open in Apple Music"
 *
 * Source: the track's Apple previewUrl, streamed (never re-hosted), only after a user gesture.
 * Development only: on localhost with ?local in the page URL, the matching file from
 * assets/previews-local/ (gitignored, never deployed) is played instead.
 *
 * Must not change: one <audio> for the whole site; nothing else may create audio elements.
 */

import { createEmitter } from './emitter.js';
import { DataStore } from './data-store.js';
import { storage } from './storage.js';

const events = createEmitter();
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('local');
let audio = null;
let current = null;
let canSetVolume = false;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const PreviewPlayer = {
  mount(el) {
    audio = el;
    audio.preload = 'none';
    for (const type of ['play', 'pause', 'ended', 'timeupdate', 'seeked']) {
      audio.addEventListener(type, () => events.emit(type, current));
    }
    audio.volume = 0.5;
    canSetVolume = audio.volume === 0.5;
    const saved = storage.get('volume');
    audio.volume = canSetVolume && typeof saved === 'number' ? clamp01(saved) : 1;
    audio.addEventListener('volumechange', () => events.emit('volume', { volume: audio.volume, muted: audio.muted }));
    audio.addEventListener('error', () => {
      if (current == null || !audio.getAttribute('src')) return;
      events.emit('error', { trackId: current, appleUrl: DataStore.track(current)?.appleUrl ?? null });
    });
    return this;
  },

  play(trackId) {
    const id = Number(trackId);
    if (id !== current) {
      const track = DataStore.track(id);
      if (!track) return Promise.reject(new Error(`PreviewPlayer: unknown track ${trackId}`));
      current = id;
      events.emit('track', id);
      if (LOCAL) {
        return DataStore.beats(id).then((b) => {
          audio.src = b?.file ? new URL('../assets/previews-local/' + b.file, import.meta.url).href : track.previewUrl;
          return audio.play();
        });
      }
      audio.src = track.previewUrl;
    }
    return audio.play();
  },

  pause() { audio?.pause(); },
  setVolume(v) {
    if (!audio || !canSetVolume) return;
    audio.volume = clamp01(v);
    audio.muted = audio.volume === 0;
    storage.set('volume', audio.volume);
  },
  get volume() { return audio?.volume ?? 1; },
  setMuted(on) { if (audio) audio.muted = !!on; },
  get muted() { return !!audio?.muted; },
  get canSetVolume() { return canSetVolume; },
  seek(sec) { if (audio) audio.currentTime = Math.max(0, Number(sec) || 0); },
  currentTime: () => audio?.currentTime ?? 0,
  isPlaying: () => !!audio && !audio.paused && !audio.ended,
  get trackId() { return current; },
  get audio() { return audio; },
  on: events.on,
};
