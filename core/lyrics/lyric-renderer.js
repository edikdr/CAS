/*
 * core/lyrics/lyric-renderer.js - the LyricRenderer contract and registry (CONTRACT section 7).
 *
 * A renderer is created by a factory and implements:
 *   mount(el, { time })      time() -> current clip time in seconds (paused audio = frozen time),
 *                            so animations follow pause and seek without extra calls
 *   setLine({ text, startSec, endSec, words? })   words: [{ t, end, text }] when known (word timings)
 *   clear()                  dissolve whatever is shown
 *   destroy()                remove everything, stop all work
 * Accessibility: the whole line is exposed as text (aria-label on the line element, inside a
 * polite live region); decorative pieces are aria-hidden. Reduced motion: plain fades only.
 *
 * Public API:
 *   registerRenderer(name, factory)   core registers 'font' (FontWipeRenderer); Stage 2 adds 'magazine'
 *   rendererName()                    manual override (storage "lyricMode") > theme default
 *                                     (link3 -> 'magazine', else 'font') > 'font' if not registered
 *   createRenderer(name?)             a new instance
 *   wordTimes(line)                   re-exported from ./word-times.js
 *
 * Must not change: the four methods and the setLine payload.
 */

import { storage } from '../storage.js';
import { createFontWipeRenderer } from './font-wipe-renderer.js';

export { wordTimes } from './word-times.js';

const factories = new Map([['font', createFontWipeRenderer]]);
const THEME_DEFAULT = { link3: 'magazine' };

export function registerRenderer(name, factory) {
  factories.set(name, factory);
}

export function rendererName() {
  const wanted = storage.get('lyricMode') || THEME_DEFAULT[document.documentElement.dataset.theme] || 'font';
  return factories.has(wanted) ? wanted : 'font';
}

export function createRenderer(name = rendererName()) {
  return (factories.get(name) || factories.get('font'))();
}
