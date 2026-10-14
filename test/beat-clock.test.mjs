import test from 'node:test';
import assert from 'node:assert/strict';
import { createBeatClock } from '../core/beat-clock.js';
import { createEmitter } from '../core/emitter.js';

function setup(data = { beats: [0.5, 1.0, 1.5, 2.0], onsets: [{ t: 0.52, s: 0.4 }, { t: 1.26, s: 0.9 }] }) {
  const player = Object.assign(createEmitter(), { t: 0, playing: false });
  player.currentTime = () => player.t;
  player.isPlaying = () => player.playing;
  const loop = { task: null, add(fn) { this.task = fn; return () => { this.task = null; }; } };
  const clock = createBeatClock({ player, loop });
  clock.setBeats(data);
  const got = [];
  clock.on('beat', (i) => got.push(`b${i}`));
  clock.on('onset', (o) => got.push(`o${o.t}`));
  let now = 0;
  // advance: set the audio time and run one frame 16 ms later
  const at = (t) => { player.t = t; now += 16; return clock.tick(now); };
  const play = (t) => { player.t = t; player.playing = true; player.emit('play'); };
  return { player, loop, clock, got, at, play, frame: () => { now += 16; return clock.tick(now); } };
}

test('fires beats and onsets in order while playing', () => {
  const { got, at, play, loop } = setup();
  play(0);
  assert.ok(loop.task, 'subscribed to the loop on play');
  for (const t of [0, 0.3, 0.55, 0.9, 1.1, 1.3, 1.6, 1.9, 2.1]) at(t); // frames < 0.35 s apart
  assert.deepEqual(got, ['b0', 'o0.52', 'b1', 'o1.26', 'b2', 'b3']);
});

test('seek forward and backward re-sync without a burst', () => {
  const { got, at, play } = setup();
  play(0);
  at(0); at(0.3); at(0.6);           // b0, o0.52
  at(1.7);                           // jump forward: b1, b2, o1.26 are skipped silently
  at(1.9);
  assert.deepEqual(got, ['b0', 'o0.52']);
  at(2.05);                          // b3 plays normally after the jump
  assert.deepEqual(got.slice(2), ['b3']);
  at(0.2);                           // seek back: re-sync, nothing fires
  at(0.4);
  at(0.6);                           // b0 and the first onset fire again after the seek
  assert.deepEqual(got.slice(3), ['b0', 'o0.52']);
});

test('loop restart (time wraps to 0) and a long hidden tab re-sync', () => {
  const { got, at, play } = setup({ beats: [0.2, 29.5], onsets: [] });
  play(29.3);
  at(29.3); at(29.6);                // b1
  at(0.05);                          // the clip restarted
  at(0.25);                          // b0 of the new pass
  assert.deepEqual(got, ['b1', 'b0']);
  at(12);                            // tab was hidden for seconds: no burst for what was missed
  assert.deepEqual(got, ['b1', 'b0']);
});

test('pause stops the loop task; play resumes from the new position', () => {
  const { got, at, play, player, loop } = setup();
  play(0);
  at(0); at(0.3); at(0.6);
  player.playing = false;
  assert.equal(at(0.6), false, 'task asks to stop when paused');
  loop.task = null;
  play(1.45);                        // resumed after a seek while paused
  at(1.45); at(1.6);
  assert.deepEqual(got, ['b0', 'o0.52', 'b2']);
});

test('latencyOffsetMs delays events', () => {
  const { got, at, play, clock } = setup();
  clock.latencyOffsetMs = 200;
  play(0);
  at(0); at(0.6);
  assert.deepEqual(got, [], '0.6 - 0.2 = 0.4 < 0.5');
  at(0.75);
  assert.deepEqual(got, ['b0', 'o0.52']);
  assert.ok(Math.abs(clock.time() - 0.55) < 1e-9);
});

test('coarse currentTime is extrapolated between updates, small jitter never double-fires', () => {
  const { got, at, play, frame } = setup({ beats: [0.43], onsets: [] });
  play(0.4);
  at(0.4);                           // re-sync at 0.40
  frame();                           // still 0.40 -> extrapolated 0.416
  frame();                           // 0.432 -> fires
  assert.deepEqual(got, ['b0']);
  at(0.425);                         // the real reading lands slightly behind the extrapolation
  at(0.44);
  assert.deepEqual(got, ['b0'], 'no second fire');
});

test('no beat data: no events', () => {
  const { got, at, play, clock } = setup();
  clock.setBeats(null);
  play(0);
  for (const t of [0, 0.5, 1, 1.5, 2]) at(t);
  assert.deepEqual(got, []);
});
