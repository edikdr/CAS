/*
 * core/lyrics/font-wipe-renderer.js - FontWipeRenderer (a LyricRenderer, see ./lyric-renderer.js).
 *
 * Luxurious Script; each word is revealed left to right with a soft edge at its own time, then the
 * whole line dissolves when the next one starts or a pause begins.
 * Mechanics: a word is a clip (overflow hidden, feathered right edge) that slides from -100% to 0
 * while the ink inside slides from +100% to 0, so the text stays put and the window opens over it:
 * two transforms per word, written from time() on the shared Loop while a line is revealing (the
 * loop sleeps when the line is complete or the audio is paused; play wakes it). Widths are read
 * once per line. The dissolve is one Web Animation (opacity + small drift).
 * Accessibility: each line holds its full text in a visually hidden span inside a polite live
 * region; the animated words are aria-hidden. Reduced motion: the line fades in and out whole.
 *
 * Public API: createFontWipeRenderer() -> LyricRenderer
 *   mount(el, { time, onResume })   onResume(fn) -> unsubscribe: called when playback resumes
 */

import { Loop } from '../loop.js';
import { Motion } from '../motion.js';
import { wordTimes } from './word-times.js';

const DISSOLVE_MS = 700;
const FADE_MS = 300;
const MIN_WORD = 0.18; // s: shortest reveal, so quick words still read as a wipe

export function createFontWipeRenderer() {
  let box = null;
  let time = () => 0;
  let offResume = null;
  let current = null; // { el, words: [{ clip, ink, w, t, dur, p }] }
  let stop = null;

  function paint() {
    if (!current || Motion.reduced) { stop = null; return false; }
    const t = time();
    let pending = false;
    for (const w of current.words) {
      const p = Math.min(1, Math.max(0, (t - w.t) / w.dur));
      if (p !== w.p) {
        w.p = p;
        w.clip.style.transform = `translateX(${((p - 1) * w.w).toFixed(1)}px)`;
        w.ink.style.transform = `translateX(${((1 - p) * w.w).toFixed(1)}px)`;
      }
      if (p < 1) pending = true;
    }
    if (!pending) stop = null;
    return pending;
  }

  function wake() {
    if (!stop && current) stop = Loop.add(paint);
  }

  function dissolve(el) {
    const anim = el.animate(
      Motion.reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-0.25em)' }],
      { duration: Motion.reduced ? FADE_MS : DISSOLVE_MS, easing: 'ease-out', fill: 'forwards' },
    );
    anim.finished.then(() => el.remove(), () => el.remove());
  }

  return {
    mount(el, opts = {}) {
      box = document.createElement('div');
      box.className = 'lyric';
      box.setAttribute('aria-live', 'polite');
      el.append(box);
      if (typeof opts.time === 'function') time = opts.time;
      offResume = opts.onResume?.(wake) ?? null;
      document.fonts?.load('1em "Luxurious Script"').catch(() => {});
    },

    setLine(line) {
      if (!box) return;
      if (current && current.text === line.text && current.start === line.startSec) return;
      this.clear();
      const el = document.createElement('p');
      el.className = 'lyric__line';
      const spoken = Object.assign(document.createElement('span'), { className: 'visually-hidden', textContent: line.text });
      const shown = document.createElement('span');
      shown.className = 'lyric__words';
      shown.setAttribute('aria-hidden', 'true');
      const words = wordTimes(line).map((wt) => {
        const word = document.createElement('span');
        word.className = 'lyric__word';
        const clip = document.createElement('span');
        clip.className = 'lyric__clip';
        const ink = Object.assign(document.createElement('span'), { className: 'lyric__ink', textContent: wt.text });
        clip.append(ink);
        word.append(clip);
        shown.append(word);
        return { clip, ink, t: wt.t, dur: Math.max(MIN_WORD, wt.end - wt.t), p: -1, w: 0 };
      });
      el.append(spoken, shown);
      box.append(el);
      current = { el, words, text: line.text, start: line.startSec };
      if (Motion.reduced) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
        return;
      }
      for (const w of words) w.w = w.clip.offsetWidth;
      paint();
      wake();
    },

    clear() {
      if (!current) return;
      dissolve(current.el);
      current = null;
    },

    destroy() {
      stop?.();
      offResume?.();
      current = null;
      box?.remove();
      box = null;
    },
  };
}
