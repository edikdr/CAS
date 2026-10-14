/*
 * core/guitar/strings.js - six strings for the DOM guitar: drawn with volume, ringing with the
 * music, and soft under a finger.
 *
 * Public API: createStrings(container, manifest, { toLocal, active }) -> {
 *   pluck(strength, direction)   music onsets: 'down' strums low E -> high e, 'up' the other way
 *   grab: { down(e) -> boolean, move(e), up(e) }   pointer hooks for ./tilt.js: press near a string
 *                                and drag - it gives a little, resists, and swings back on release;
 *                                dragging across the strings plucks them one after another
 *   destroy()
 * }
 *   manifest: canvas {w, h} + strings [{nut, saddle}] (assets/guitar/dom/manifest.json)
 *   toLocal(clientX, clientY) -> {x, y} in container px (the guitar's own upright frame)
 *   active() -> false while the back is shown (strings cannot be touched)
 *
 * Drawing: one small canvas over the strings' band on the guitar front (DPR <= 2), redrawn only while a string moves
 * (the shared Loop sleeps otherwise). Each string: soft shadow on the top, dark edge, body,
 * highlight (dashed on the wound strings, like the winding) and a faint blur while it swings fast.
 * This is canvas paint, not a CSS animation: a bend at the finger cannot be expressed with
 * transforms. Physics: ./string-physics.js. Reduced motion: strings stay still.
 */

import { Loop } from '../loop.js';
import { Motion } from '../motion.js';
import { createStringPhysics, shape } from './string-physics.js';

const WIDTH = [4.2, 3.7, 3.2, 2.6, 2.1, 1.8];   // manifest px (the photo's scale), low E first
const WOUND = 4;
const PALETTE = {
  wound: { edge: '#5e4527', body: '#c9a571', light: '#fff0cf' },
  plain: { edge: '#64646e', body: '#d9d9e2', light: '#ffffff' },
};
const MAX_PULL = 16;   // manifest px at the finger before the string resists hard
const MIN_PULL = 6;    // screen px: small (phone) guitars still show the swing
const SLIP = 2;        // pulled further than this x the max pull, the string slips off and rings
const REACH = 9;       // screen px: how close a press must be to catch a string
const SEGMENTS = 28;

export function createStrings(container, manifest, { toLocal, active = () => true }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'guitar__strings';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  const ctx = canvas.getContext('2d');
  const physics = createStringPhysics(manifest.strings.length);
  let scale = 1;
  let lines = [];
  let stop = null;
  let held = -1;
  const maxPull = () => Math.max(MIN_PULL, MAX_PULL * scale);

  let origin = { x: 0, y: 0 };
  let size = { w: 0, h: 0 };

  function layout() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    scale = h / manifest.canvas.h;
    lines = manifest.strings.map((s, i) => {
      const a = { x: s.nut[0] * scale, y: s.nut[1] * scale };
      const b = { x: s.saddle[0] * scale, y: s.saddle[1] * scale };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      return { a, b, len, dir, n: { x: dir.y, y: -dir.x }, w: Math.max(0.6, WIDTH[i] * scale), colors: i < WOUND ? PALETTE.wound : PALETTE.plain, wound: i < WOUND };
    });
    // the canvas only covers the strings and how far they can swing, not the whole guitar
    const pad = maxPull() * SLIP + 8;
    const xs = lines.flatMap((l) => [l.a.x, l.b.x]);
    const ys = lines.flatMap((l) => [l.a.y, l.b.y]);
    origin = { x: Math.max(0, Math.min(...xs) - pad), y: Math.max(0, Math.min(...ys) - pad) };
    size = { w: Math.min(w, Math.max(...xs) + pad) - origin.x, h: Math.min(h, Math.max(...ys) + pad) - origin.y };
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.style.left = `${origin.x}px`;
    canvas.style.top = `${origin.y}px`;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, -origin.x * dpr, -origin.y * dpr);
    draw();
  }

  function trace(l, st, pull, shift) {
    ctx.beginPath();
    for (let k = 0; k <= SEGMENTS; k++) {
      const u = k / SEGMENTS;
      const d = st.offset * pull * shape(u, st.point, st.mix);
      const x = l.a.x + l.dir.x * l.len * u + l.n.x * (d + shift.n) + shift.x;
      const y = l.a.y + l.dir.y * l.len * u + l.n.y * (d + shift.n) + shift.y;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
  }

  function draw() {
    ctx.clearRect(origin.x, origin.y, size.w, size.h);
    const pull = maxPull();
    ctx.lineCap = 'round';
    lines.forEach((l, i) => {
      const st = physics.state(i);
      const none = { x: 0, y: 0, n: 0 };
      // shadow on the top (light comes from the garlands: screen-up = local -x)
      trace(l, { ...st, offset: st.offset * 0.7 }, pull, { x: l.w * 0.9, y: l.w * 0.3, n: 0 });
      ctx.strokeStyle = 'rgb(30 16 10 / 0.34)';
      ctx.lineWidth = l.w * 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
      if (st.speed > 0.4) {
        trace(l, st, pull, none);
        ctx.strokeStyle = `rgb(255 240 230 / ${Math.min(0.35, st.speed * 0.02).toFixed(3)})`;
        ctx.lineWidth = l.w * 3.2;
        ctx.stroke();
      }
      trace(l, st, pull, none);
      ctx.strokeStyle = l.colors.edge;
      ctx.lineWidth = l.w;
      ctx.stroke();
      ctx.strokeStyle = l.colors.body;
      ctx.lineWidth = l.w * 0.62;
      ctx.stroke();
      trace(l, st, pull, { x: 0, y: 0, n: -l.w * 0.2 });
      ctx.strokeStyle = l.colors.light;
      ctx.lineWidth = Math.max(0.4, l.w * 0.26);
      ctx.setLineDash(l.wound ? [l.w * 0.45, l.w * 0.45] : []);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  const frame = (now, dt) => {
    const busy = physics.step(dt);
    draw();
    if (!busy) stop = null;
    return busy;
  };
  const wake = () => { if (!stop) stop = Loop.add(frame); };

  /** Nearest string to a container point: { i, u, d } (d = signed distance across, px). */
  function nearest(p) {
    let best = null;
    lines.forEach((l, i) => {
      const rx = p.x - l.a.x;
      const ry = p.y - l.a.y;
      const u = (rx * l.dir.x + ry * l.dir.y) / l.len;
      if (u < 0.03 || u > 0.97) return;
      const d = rx * l.n.x + ry * l.n.y;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { i, u, d };
    });
    return best;
  }

  function follow(e) {
    const p = toLocal(e.clientX, e.clientY);
    const pull = maxPull();
    if (held >= 0) {
      const l = lines[held];
      const rx = p.x - l.a.x;
      const ry = p.y - l.a.y;
      const u = (rx * l.dir.x + ry * l.dir.y) / l.len;
      const d = rx * l.n.x + ry * l.n.y;
      if (Math.abs(d) > SLIP * pull || u < 0.02 || u > 0.98) {
        physics.release(held);   // slips off the finger and rings
        held = -1;
      } else {
        physics.grab(held, u, d / pull);
      }
    }
    if (held < 0) {
      const hit = nearest(p);
      if (hit && Math.abs(hit.d) <= Math.max(REACH, pull * 0.6)) {
        held = hit.i;
        physics.grab(held, hit.u, hit.d / pull);
      }
    }
    wake();
  }

  const observer = new ResizeObserver(layout);
  observer.observe(container);
  layout();

  return {
    pluck(strength = 0.6, direction = 'down') {
      if (Motion.reduced) return;
      const s = Math.max(0, Math.min(1, strength));
      const gap = 16 - s * 8;
      lines.forEach((_, i) => {
        const order = direction === 'up' ? lines.length - 1 - i : i;
        physics.pluck(i, s, order * gap);
      });
      wake();
    },
    grab: {
      down(e) {
        if (Motion.reduced || !active() || !lines.length) return false;
        const hit = nearest(toLocal(e.clientX, e.clientY));
        if (!hit || Math.abs(hit.d) > Math.max(REACH, maxPull() * 0.6)) return false;
        held = -1;
        follow(e);
        return true;
      },
      move: follow,
      up() {
        if (held >= 0) physics.release(held);
        held = -1;
        wake();
      },
    },
    destroy() {
      stop?.();
      observer.disconnect();
      canvas.remove();
    },
  };
}
