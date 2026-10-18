// Small shared helpers for core modules.

export const root = document.documentElement;
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Dispatch a contract event on `document`. */
export function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Minimal local emitter for `SD.player.on(evt, cb)`; returns an unsubscribe function. */
export function emitter() {
  const map = new Map();
  return {
    on(evt, cb) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(cb);
      return () => map.get(evt)?.delete(cb);
    },
    fire(evt, detail) {
      for (const cb of map.get(evt) || []) {
        try { cb(detail); } catch (e) { console.error(e); }
      }
    },
  };
}

/** Piecewise-linear curve through [[x, y], …] (x ascending). */
export function curve(points, x) {
  if (!points?.length) return 0;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return points.at(-1)[1];
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const prefersReducedData = () => matchMedia('(prefers-reduced-data: reduce)').matches;

/** Resolve after the element's CSS transition ends (or right away when it has none). */
export function afterTransition(el, timeout = 600) {
  return new Promise((resolve) => {
    const cs = getComputedStyle(el);
    const ms = (s = '0s') => (s.trim().endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000) || 0;
    const delays = cs.transitionDelay.split(',');
    const total = Math.max(0, ...cs.transitionDuration.split(',').map((d, i) => ms(d) + ms(delays[i])));
    if (!total) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; el.removeEventListener('transitionend', onEnd); resolve(); } };
    const onEnd = (e) => { if (e.target === el) finish(); };
    el.addEventListener('transitionend', onEnd);
    setTimeout(finish, Math.min(timeout, total + 50));
  });
}

export const isDev = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || new URLSearchParams(location.search).has('dev');

export function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* private mode / blocked storage: choice just is not remembered */ }
  return null;
}
