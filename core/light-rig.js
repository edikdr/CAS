/*
 * core/light-rig.js - the two string-light garlands (CONTRACT section 7: LightRig).
 *
 * Public API:
 *   LightRig.mount({ garland, glow })  garland: element below the guitar (wall light, wires, stars);
 *                                      glow: element above the guitar (bloom, lit stars, room shade)
 *   LightRig.setEnabled(bool), .enabled   persisted (storage "lights"), mirrored on <html data-lights>.
 *                                      Off: the garland is dark (no star, bloom or light on the wall
 *                                      glows) and the room keeps 25% of its light
 *   LightRig.level                     light in the room: 1 when on, 0.25 when switched off
 *   LightRig.pulse(strength)           short brightening, strength 0..1; no-op when off or under
 *                                      reduced motion
 *   LightRig.lights                    [{ x, y, garland, index }] - px in scene coordinates (the viewport box)
 *   LightRig.maskImage(radiusPx)       CSS mask-image with a soft disc around every light; Stage 2 uses it
 *                                      to reveal dust/texture only near the lights (re-read it on 'layout')
 *   LightRig.on('layout' | 'toggle', fn)
 *
 * Look (assets/reference/room/string-lights.jpg): frosted plastic stars, each with an LED inside.
 *   - below the guitar: light on the wall (its own <svg>: wide strokes along the wires + a pool
 *     around every star, blurred once by an SVG filter), wires, stems and the unlit plastic stars;
 *   - above the guitar: a room shade (the glow element's ::before in styles/scene.css), the bloom
 *     around every star (near-Gaussian, three breathing groups + a pulse group) and the lit stars
 *     (gradient from the LED out to the tips, a hot LED point).
 * Switching changes opacities only (styles/scene.css): off, the garland's light (wall light, bloom,
 * lit stars) fades out and the room shade takes the room to 25%, the guitar included, in either
 * guitar mode.
 *
 * Cost: everything is laid out once and again only on resize; nothing uses the rAF loop. Breathing
 * is a CSS opacity animation (compositor only); pulse() and the switch-on flicker are one-shot Web
 * Animations on opacity. The blurred wall light is a separate <svg> so its fade is composited
 * instead of re-running the blur every frame.
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
const ROOM_OFF = 0.25;     // light left in the room when the garland is off (styles/scene.css: --room-dim)
const SVG_NS = 'http://www.w3.org/2000/svg';

const html = document.documentElement;
const events = createEmitter();
let enabled = storage.get('lights', true) !== false;
let lights = [];
let garlandEl = null;
let svg = null;
let lightSvg = null;       // light falling on the wall, below the wires
let litEl = null;          // <g> with the lit stars, above the guitar
let glowEl = null;
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

/** A length token (e.g. --star-size: clamp(...)) resolved to px: custom properties compute to
 *  their source text, so measure it on a probe. */
function tokenPx(el, name, fallback) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`;
  el.append(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px || fallback;
}

function layout() {
  const width = garlandEl.clientWidth;
  const height = garlandEl.clientHeight;
  if (!width || !height) return;
  const band = Math.min(width * 0.55, height * 0.42);
  const star = tokenPx(garlandEl, '--star-size', 30);
  const stem = star * 0.62;   // the stars hang close under the wire, as in the photo

  lights = [];
  svg.replaceChildren();

  // light on the wall: wide strokes along each garland + a pool around every star, blurred once
  // by an SVG filter; switching only fades its <svg>
  const blur = svgEl('filter', { id: 'garland-soften', x: '-30%', y: '-80%', width: '160%', height: '260%' });
  blur.append(svgEl('feGaussianBlur', { stdDeviation: (band * 0.1).toFixed(1) }));
  const near = svgEl('filter', { id: 'garland-near', x: '-50%', y: '-50%', width: '200%', height: '200%' });
  near.append(svgEl('feGaussianBlur', { stdDeviation: (star * 0.55).toFixed(1) }));
  const defs = svgEl('defs', {});
  defs.append(blur, near);
  const wash = svgEl('g', { class: 'garland__wash', filter: 'url(#garland-soften)' });
  const close = svgEl('g', { class: 'garland__wash', filter: 'url(#garland-near)' });
  const wires = [];
  GARLANDS.forEach((g, gi) => {
    const attach = g.lights.map(([nx, ny], i) => {
      const x = nx * width;
      const y = ((ny - PHOTO_TOP) / PHOTO_SPAN) * band;
      lights.push({ x, y, garland: gi, index: i });
      return { x, y: y - stem };
    });
    wash.append(svgEl('path', { class: 'garland__spill', d: curve(attach.map((p) => ({ x: p.x, y: p.y + band * 0.06 }))), 'stroke-width': (band * 0.2).toFixed(1) }));
    for (let w = 0; w < g.wires; w++) {
      const shifted = attach.map((pt) => ({ x: pt.x + w * 3, y: pt.y - w * 2.5 }));
      wires.push(svgEl('path', { class: 'garland__wire', d: curve(shifted) }));
    }
  });
  for (const l of lights) {
    // wide pool, a little below the star (it hangs off the wall and shines down onto it)
    wash.append(svgEl('ellipse', { class: 'garland__pool', cx: l.x.toFixed(1), cy: (l.y + band * 0.04).toFixed(1), rx: (band * 0.12).toFixed(1), ry: (band * 0.15).toFixed(1) }));
    // and the bright patch right behind it
    close.append(svgEl('circle', { class: 'garland__hot', cx: l.x.toFixed(1), cy: (l.y + star * 0.2).toFixed(1), r: (star * 0.9).toFixed(1) }));
  }
  lightSvg.replaceChildren(defs, wash, close);
  svg.append(...wires);

  const lit = [];
  lights.forEach((l, i) => {
    svg.append(svgEl('line', { class: 'garland__stem', x1: l.x, y1: l.y - stem, x2: l.x, y2: l.y - star * 0.42 }));
    const tilt = ((i * 37) % 44) - 22;
    const place = `translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${tilt}) scale(${(star / 2).toFixed(2)})`;
    svg.append(svgEl('path', { class: 'garland__star', d: STAR, transform: place }));
    const g = svgEl('g', { transform: place });
    g.append(svgEl('path', { class: 'glow__star', d: STAR }), svgEl('circle', { class: 'glow__led', cy: '-0.08', r: '0.5' }));
    lit.push(g);
  });
  litEl.replaceChildren(...lit);
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
    lightSvg = svgEl('svg', { class: 'garland__light', 'aria-hidden': 'true' });
    svg = svgEl('svg', { class: 'garland', 'aria-hidden': 'true' });
    garland.replaceChildren(lightSvg, svg);

    const count = GARLANDS.reduce((n, g) => n + g.lights.length, 0);
    glowEl = Object.assign(document.createElement('div'), { className: 'glow' });
    const bloom = Object.assign(document.createElement('div'), { className: 'glow__bloom' });
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
    bloom.append(...groups, pulseEl);

    // lit stars: one gradient from the LED (a little above the centre) out to the tips
    const stars = svgEl('svg', { class: 'glow__stars', 'aria-hidden': 'true' });
    const body = svgEl('radialGradient', { id: 'star-lit', cx: '0.5', cy: '0.45', r: '0.62' });
    [['0', 'core'], ['0.2', 'core'], ['0.55', 'body'], ['1', 'edge']].forEach(([offset, tone]) => {
      body.append(svgEl('stop', { offset, class: `glow__stop--${tone}` }));
    });
    const led = svgEl('radialGradient', { id: 'star-led' });
    led.append(svgEl('stop', { offset: '0', class: 'glow__stop--core' }), svgEl('stop', { offset: '1', class: 'glow__stop--clear' }));
    const defs = svgEl('defs', {});
    defs.append(body, led);
    litEl = svgEl('g', {});
    stars.append(defs, litEl);
    glowEl.append(bloom, stars);
    glow.replaceChildren(glowEl);

    apply();
    observer?.disconnect();
    observer = new ResizeObserver(layout);
    observer.observe(garland);
    layout();
    return this;
  },

  get enabled() { return enabled; },

  get level() { return enabled ? 1 : ROOM_OFF; },

  setEnabled(on) {
    const was = enabled;
    enabled = !!on;
    storage.set('lights', enabled);
    apply();
    // LEDs come up at once, with a short unsteady flicker as the contact settles
    if (enabled && !was && glowEl && !Motion.reduced) {
      glowEl.animate([{ opacity: 0.45 }, { opacity: 1, offset: 0.2 }, { opacity: 0.72, offset: 0.38 }, { opacity: 1, offset: 0.6 }, { opacity: 0.9, offset: 0.78 }, { opacity: 1 }], { duration: 300, easing: 'linear' });
    }
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
