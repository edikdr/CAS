/*
 * core/light-rig.js - the two string-light garlands (CONTRACT section 7: LightRig).
 *
 * Public API:
 *   LightRig.mount({ garland, glow })  garland: element below the guitar (wires + stars);
 *                                      glow: element above the guitar (halo sprites)
 *   LightRig.setEnabled(bool), .enabled   persisted (storage "lights"), mirrored on <html data-lights>
 *   LightRig.pulse(strength)           short brightening, strength 0..1; no-op when off or reduced motion
 *   LightRig.lights                    [{ x, y, garland, index }] - px in scene coordinates (the viewport box)
 *   LightRig.maskImage(radiusPx)       CSS mask-image with a soft disc around every light; Stage 2 uses it
 *                                      to reveal dust/texture only near the lights (re-read it on 'layout')
 *   LightRig.on('layout' | 'toggle', fn)
 *
 * Cost: wires, stars and halos are laid out once and again only on resize. "Breathing" is a CSS
 * opacity animation on three halo groups (compositor only, zero JS per frame); pulse() is one
 * Web Animation on opacity. Nothing here uses the rAF loop.
 *
 * Must not change: the API above and the element classes used by styles/scene.css.
 */

import { createEmitter } from './emitter.js';
import { Motion } from './motion.js';
import { storage } from './storage.js';

/* Star centres measured on assets/reference/room/string-lights.jpg (1200 x 896): x/1200, y/896. */
const GARLANDS = [
  { wires: 2, lights: [[0.046, 0.257], [0.208, 0.335], [0.375, 0.396], [0.521, 0.413], [0.673, 0.411], [0.838, 0.374], [0.963, 0.307]] },
  { wires: 1, lights: [[0.065, 0.552], [0.221, 0.664], [0.388, 0.731], [0.557, 0.753], [0.721, 0.709], [0.879, 0.631], [0.996, 0.502]] },
];
const PHOTO_TOP = 0.2;     // photo rows 0.2..0.8 map onto the garland band
const PHOTO_SPAN = 0.6;
const GROUPS = 3;          // breathing groups, out of phase (styles/scene.css)
const SVG_NS = 'http://www.w3.org/2000/svg';

const html = document.documentElement;
const events = createEmitter();
let enabled = storage.get('lights', true) !== false;
let lights = [];
let garlandEl = null;
let svg = null;
let pulseEl = null;
let pulseAnim = null;
let halos = [];
let observer = null;

function starPath() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(Math.cos(a) * r).toFixed(3)} ${(Math.sin(a) * r).toFixed(3)}`);
  }
  return `M${pts.join('L')}Z`;
}
const STAR = starPath();

/** Smooth curve through points (Catmull-Rom as cubic Beziers), extended past both ends. */
function curve(points) {
  const n = points.length;
  const all = [
    { x: 2 * points[0].x - points[1].x, y: 2 * points[0].y - points[1].y },
    ...points,
    { x: 2 * points[n - 1].x - points[n - 2].x, y: 2 * points[n - 1].y - points[n - 2].y },
  ];
  let d = `M${all[0].x.toFixed(1)} ${all[0].y.toFixed(1)}`;
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i - 1] || all[i];
    const b = all[i];
    const c = all[i + 1];
    const e = all[i + 2] || c;
    d += `C${(b.x + (c.x - a.x) / 6).toFixed(1)} ${(b.y + (c.y - a.y) / 6).toFixed(1)} ${(c.x - (e.x - b.x) / 6).toFixed(1)} ${(c.y - (e.y - b.y) / 6).toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
  }
  return d;
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function layout() {
  const width = garlandEl.clientWidth;
  const height = garlandEl.clientHeight;
  if (!width || !height) return;
  const band = Math.min(width * 0.55, height * 0.42);
  const star = parseFloat(getComputedStyle(garlandEl).getPropertyValue('--star-size')) || 20;
  const stem = star * 0.95;

  lights = [];
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  GARLANDS.forEach((g, gi) => {
    const attach = g.lights.map(([nx, ny], i) => {
      const x = nx * width;
      const y = ((ny - PHOTO_TOP) / PHOTO_SPAN) * band;
      lights.push({ x, y, garland: gi, index: i });
      return { x, y: y - stem };
    });
    for (let w = 0; w < g.wires; w++) {
      const shifted = attach.map((pt) => ({ x: pt.x + w * 3, y: pt.y - w * 2.5 }));
      svg.append(svgEl('path', { class: 'garland__wire', d: curve(shifted) }));
    }
  });
  lights.forEach((l, i) => {
    svg.append(svgEl('line', { class: 'garland__stem', x1: l.x, y1: l.y - stem, x2: l.x, y2: l.y - star * 0.45 }));
    const tilt = ((i * 37) % 30) - 15;
    svg.append(svgEl('path', { class: 'garland__star', d: STAR, transform: `translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${tilt}) scale(${(star / 2).toFixed(2)})` }));
  });
  halos.forEach((h, i) => {
    const l = lights[i % lights.length];
    h.style.transform = `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px)`;
  });
  events.emit('layout', LightRig.lights);
}

function apply() {
  if (enabled) delete html.dataset.lights;
  else html.dataset.lights = 'off';
}

export const LightRig = {
  mount({ garland, glow }) {
    garlandEl = garland;
    svg = svgEl('svg', { class: 'garland', 'aria-hidden': 'true' });
    garland.replaceChildren(svg);

    const count = GARLANDS.reduce((n, g) => n + g.lights.length, 0);
    const wrap = document.createElement('div');
    wrap.className = 'glow';
    const groups = Array.from({ length: GROUPS }, () => Object.assign(document.createElement('div'), { className: 'glow__group' }));
    pulseEl = Object.assign(document.createElement('div'), { className: 'glow__pulse' });
    halos = [];
    for (let i = 0; i < count; i++) {
      const h = Object.assign(document.createElement('span'), { className: 'glow__halo' });
      groups[i % GROUPS].append(h);
      halos.push(h);
    }
    for (let i = 0; i < count; i++) {
      const h = Object.assign(document.createElement('span'), { className: 'glow__halo' });
      pulseEl.append(h);
      halos.push(h);
    }
    wrap.append(...groups, pulseEl);
    glow.replaceChildren(wrap);

    apply();
    observer?.disconnect();
    observer = new ResizeObserver(layout);
    observer.observe(garland);
    layout();
    return this;
  },

  get enabled() { return enabled; },

  setEnabled(on) {
    enabled = !!on;
    storage.set('lights', enabled);
    apply();
    events.emit('toggle', enabled);
  },

  pulse(strength = 1) {
    if (!enabled || !pulseEl || Motion.reduced) return;
    const s = Math.max(0, Math.min(1, strength));
    pulseAnim?.cancel();
    pulseAnim = pulseEl.animate([{ opacity: s }, { opacity: 0 }], { duration: 420, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
  },

  get lights() { return lights.map((l) => ({ ...l })); },

  maskImage(radius = 160) {
    return lights.map((l) => `radial-gradient(circle ${radius}px at ${l.x.toFixed(0)}px ${l.y.toFixed(0)}px, #000 0%, transparent 100%)`).join(', ');
  },

  on: events.on,
};
