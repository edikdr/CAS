import test from 'node:test';
import assert from 'node:assert/strict';
import { createStringPhysics, shape } from '../core/guitar/string-physics.js';

const run = (p, ms) => { let busy = true; for (let t = 0; t < ms && busy; t += 16) busy = p.step(16); return busy; };

test('shape: zero at both ends, peak at the pluck point, sine when relaxed', () => {
  assert.equal(shape(0, 0.7, 0), 0);
  assert.equal(shape(1, 0.7, 0), 0);
  assert.equal(shape(0.7, 0.7, 0), 1);
  assert.ok(Math.abs(shape(0.5, 0.7, 1) - 1) < 1e-12);
});

test('a pluck swings both ways and settles back to rest', () => {
  const p = createStringPhysics();
  p.pluck(0, 1);
  let min = 0;
  let max = 0;
  for (let t = 0; t < 600; t += 16) {
    p.step(16);
    const x = p.state(0).offset;
    min = Math.min(min, x);
    max = Math.max(max, x);
  }
  assert.ok(max > 0.05 && min < -0.03, `swings: ${min.toFixed(3)}..${max.toFixed(3)}`);
  assert.equal(run(p, 4000), false, 'rests within a few seconds');
  assert.equal(p.state(0).offset, 0);
});

test('stronger onsets move the string further', () => {
  const peak = (strength) => {
    const p = createStringPhysics();
    p.pluck(2, strength);
    let m = 0;
    for (let t = 0; t < 300; t += 16) { p.step(16); m = Math.max(m, Math.abs(p.state(2).offset)); }
    return m;
  };
  assert.ok(peak(1) > peak(0.3) * 2);
});

test('strum delays fire in order', () => {
  const p = createStringPhysics();
  [0, 1, 2, 3, 4, 5].forEach((i) => p.pluck(i, 1, i * 20));
  p.step(16);
  assert.ok(p.state(0).speed > 0 && p.state(5).speed === 0, 'high e not plucked yet at 16 ms');
  p.step(100);
  assert.ok(p.state(5).speed > 0);
});

test('a grabbed string gives a little, resists, and springs back when released', () => {
  const p = createStringPhysics();
  p.grab(1, 0.5, 5);           // pulled far beyond the maximum
  run(p, 400);
  const held = p.state(1).offset;
  assert.ok(held > 0.9 && held <= 1.0001, `held at ${held.toFixed(3)} (soft limit 1)`);
  assert.equal(p.state(1).point, 0.5);
  p.release(1);
  let crossed = false;
  for (let t = 0; t < 500; t += 16) { p.step(16); if (p.state(1).offset < 0) crossed = true; }
  assert.ok(crossed, 'overshoots through rest (inertia)');
  assert.equal(run(p, 5000), false);
});
