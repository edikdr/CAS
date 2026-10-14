/*
 * core/guitar/string-physics.js - the six strings as damped springs (shared by the DOM and GL guitars).
 *
 * Public API: createStringPhysics(count = 6) -> {
 *   pluck(i, strength, delayMs)  an impulse (music onsets), strength 0..1, after delayMs
 *   grab(i, point, pull)         hold string i pulled sideways at `point` (0..1 from the nut);
 *                                `pull` is in units of the maximum pull (1); it is softened, so a
 *                                string gives a little and then resists
 *   release(i)                   let go: the string swings back through rest and settles
 *   step(dtMs) -> busy           advance the simulation; false once every string rests
 *   state(i) -> { offset, point, mix, speed }   offset: displacement at `point` in pull units
 * }
 * shape(u, point, mix): the string's profile along u (0 nut .. 1 saddle): a triangle peaking at the
 * pluck point that relaxes into a sine (mix 0 -> 1) as it rings. Renderers draw
 * offset * shape(u) in their own units (DOM px, GL world units).
 * Model: x'' = -w^2 x - 2 z w x' per string, a few-Hz "visual" frequency (real strings vibrate at
 * 80-330 Hz, far above the frame rate), rings ~1-1.6 s, bass strings longer; fixed 4 ms substeps.
 */

const FREQ = [6.5, 7, 7.5, 8.2, 9, 9.8];       // Hz, low E first
const RING = [1.6, 1.5, 1.4, 1.25, 1.1, 1.0];  // s until the swing is ~2 % of its start
const KICK = 24;                                // pull units per second for a full-strength pluck
const H = 4;                                    // ms substep
const REST_X = 0.002;
const REST_V = 0.02;

export function shape(u, point, mix) {
  const tri = u <= point ? u / point : (1 - u) / (1 - point);
  return tri + (Math.sin(Math.PI * u) - tri) * mix;
}

export function createStringPhysics(count = 6) {
  const s = Array.from({ length: count }, (_, i) => ({
    x: 0, v: 0, point: 0.72, mix: 1, held: false, target: 0,
    w: 2 * Math.PI * FREQ[i % FREQ.length],
    zw: 3.9 / RING[i % RING.length],
    queue: [],
  }));
  let resting = true;

  return {
    pluck(i, strength = 0.6, delayMs = 0) {
      const str = s[i];
      if (!str || str.held) return;
      str.queue.push({ in: delayMs, kick: KICK * Math.max(0, Math.min(1, strength)) * (str.v >= 0 ? 1 : -1) });
      resting = false;
    },

    grab(i, point, pull) {
      const str = s[i];
      if (!str) return;
      str.held = true;
      str.point = Math.min(0.92, Math.max(0.08, point));
      str.mix = 0;
      str.target = Math.tanh(pull);
      resting = false;
    },

    release(i) {
      if (s[i]) s[i].held = false;
    },

    step(dtMs) {
      if (resting) return false;
      let busy = false;
      for (const str of s) {
        let left = Math.min(dtMs, 100);
        while (left > 0) {
          const h = Math.min(H, left) / 1000;
          left -= H;
          for (const q of str.queue) q.in -= h * 1000;
          while (str.queue.length && str.queue[0].in <= 0) {
            const q = str.queue.shift();
            str.point = 0.68 + Math.random() * 0.1;
            str.mix = 0;
            str.v += q.kick;
          }
          if (str.held) {
            // follow the finger closely but not instantly: a little inertia
            const a = 900 * (str.target - str.x) - 60 * str.v;
            str.v += a * h;
          } else {
            const a = -str.w * str.w * str.x - 2 * str.zw * str.v;
            str.v += a * h;
          }
          str.x += str.v * h;
          str.mix = Math.min(1, str.mix + h * 3);
        }
        const still = !str.held && !str.queue.length && Math.abs(str.x) < REST_X && Math.abs(str.v) < REST_V;
        if (still) { str.x = 0; str.v = 0; } else busy = true;
      }
      resting = !busy;
      return busy;
    },

    state(i) {
      const str = s[i];
      return { offset: str.x, point: str.point, mix: str.mix, speed: Math.abs(str.v) };
    },
  };
}
