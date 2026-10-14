/*
 * core/film-slot.js - the film-texture overlay slot (Stage 2 draws the texture, core owns the canvas).
 *
 * Public API:
 *   FilmSlot.mount(canvas)
 *   FilmSlot.setRenderer(draw)   draw(ctx, { width, height, dpr }) paints the whole texture once
 *
 * Core sizes the canvas (DPR <= 2, <= 2048 device px per side), calls draw once, and again only
 * after the viewport size changes (debounced 200 ms). Never animated, pointer-events: none,
 * aria-hidden. Without a renderer the canvas stays hidden.
 */

const MAX_DPR = 2;
const MAX_SIDE = 2048;
let canvas = null;
let draw = null;
let timer = 0;

function paint() {
  if (!canvas) return;
  canvas.hidden = !draw;
  if (!draw) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(MAX_DPR, devicePixelRatio || 1, MAX_SIDE / width, MAX_SIDE / height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(ctx, { width, height, dpr });
}

export const FilmSlot = {
  mount(el) {
    canvas = el;
    new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(paint, 200);
    }).observe(el);
    paint();
    return this;
  },
  setRenderer(fn) {
    draw = typeof fn === 'function' ? fn : null;
    paint();
  },
};
