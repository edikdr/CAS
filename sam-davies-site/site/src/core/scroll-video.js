// Scroll-scrubbed <video>: source choice, lazy attach, iOS decode unlock, and a critically damped
// follower that turns a target time into currentTime writes. It has no loop of its own: story.js
// calls step(dt) from the page's single requestAnimationFrame loop.
import { perf } from './perf.js';

const MIN_STEP = 1 / 48; // half a frame at 24 fps: smaller moves are not worth a seek

/** Small/slow device → 720 variant (TZ §5). */
export function isConstrained(smallMaxWidth = 820) {
  const c = navigator.connection;
  return (
    Math.min(innerWidth, screen.width || innerWidth) <= smallMaxWidth ||
    Boolean(c?.saveData) ||
    (navigator.deviceMemory !== undefined && navigator.deviceMemory < 4) ||
    (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency < 4)
  );
}

/** First source this browser can decode (MP4/H.264 first, VP9 WebM fallback). */
export function pickSource(video, sources) {
  return sources.find((s) => video.canPlayType(s.type) !== '') || null;
}

export function createScrollVideo(video, { stiffness = 140, dampingRatio = 1, onReady, onError } = {}) {
  const omega = Math.sqrt(stiffness);
  let x = 0; // follower position (s)
  let v = 0; // follower velocity (s/s)
  let target = 0;
  let written = -1;
  let duration = 0;
  let ready = false;
  let attached = false;
  let unlocked = false;
  let wake = () => {};

  const canWrite = () => ready && video.readyState >= 1 && !video.seeking;

  function write(t) {
    perf.seekStart(t);
    video.currentTime = t;
    written = t;
  }

  video.addEventListener('loadedmetadata', () => {
    duration = video.duration || 0;
    ready = duration > 0;
    x = target = Math.min(target, maxTime());
    if (ready) write(x);
  });
  video.addEventListener('seeked', () => {
    perf.seekEnd();
    if (!video.classList.contains('is-ready') && video.readyState >= 2) {
      video.classList.add('is-ready');
      onReady?.();
    }
    wake(); // a write may have been held back while this seek was pending
  });
  video.addEventListener('loadeddata', () => {
    if (!video.classList.contains('is-ready') && written >= 0 && !video.seeking) { video.classList.add('is-ready'); onReady?.(); }
  });
  video.addEventListener('error', () => onError?.(video.error));

  // iOS/Safari: decoding only starts after a gesture; a muted inline play→pause unlocks it.
  const unlock = () => {
    if (unlocked || !attached) return;
    unlocked = true;
    const p = video.play();
    if (p?.then) p.then(() => { video.pause(); if (ready) write(x); }).catch(() => { unlocked = false; });
    else video.pause();
  };
  addEventListener('touchstart', unlock, { passive: true });
  addEventListener('pointerdown', unlock, { passive: true });

  const maxTime = () => Math.max(0, duration - 1 / 24); // the very last frame can render black on some decoders

  return {
    get duration() { return duration; },
    get ready() { return ready; },
    get time() { return x; },
    set onWake(fn) { wake = fn; },

    attach(source) {
      if (attached || !source) return;
      attached = true;
      video.preload = 'auto';
      video.muted = true;
      video.src = source.src;
      video.load();
    },

    /** p (0–1) → target seconds. */
    setProgress(p) { target = p * maxTime(); },

    /** Advance the follower; returns true while there is still work (loop must stay awake). */
    step(dt) {
      if (!ready) return false;
      dt = Math.min(dt, 1 / 30);
      const a = omega * omega * (target - x) - 2 * dampingRatio * omega * v;
      v += a * dt;
      x += v * dt;
      const settled = Math.abs(target - x) < 1 / 240 && Math.abs(v) < 0.01;
      if (settled) { x = target; v = 0; }
      const delta = Math.abs(x - written);
      if (delta >= MIN_STEP || (settled && delta > 1e-3)) {
        if (canWrite()) write(x);
        else perf.skip(); // seek pending: keep the newest x, write it on the next free frame
      }
      return !settled || video.seeking || Math.abs(x - written) > 1e-3;
    },

    /** Jump without easing (used when resuming after reduced-motion or a resize). */
    snap() { x = target; v = 0; if (canWrite()) write(x); },
  };
}
