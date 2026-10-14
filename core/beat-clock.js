/*
 * core/beat-clock.js - turns preview playback time into beat and onset events (CONTRACT section 7).
 *
 * Public API (createBeatClock({ player, loop }) for tests; BeatClock = bound to PreviewPlayer + Loop):
 *   setBeats(data | null)   data/beats/<id>.json of the playing track; null = no events at all
 *                           (the guitar keeps its idle sway - beats are never invented)
 *   on('beat', fn(index)), on('onset', fn({ t, s }))   s = onset strength 0..1
 *   latencyOffsetMs         delays events by this much (Bluetooth output is often 150-250 ms late)
 *   time()                  the clock's current clip time in seconds (latency applied)
 *   tick(nowMs)             one step; the loop calls it while the player plays, tests call it directly
 *
 * Time base: player.currentTime() = seconds from the start of the 30 s clip, the same clock as
 * the beat files. <audio>.currentTime updates coarsely, so between updates the time is
 * extrapolated with the frame clock (at most 100 ms). A jump forward > 0.35 s (seek, long
 * hidden tab) or backward > 0.15 s (seek, loop restart) re-syncs silently: no burst of events.
 * Smaller backward steps are jitter and are ignored, so no event fires twice.
 *
 * Must not change: event names and payloads, time base.
 */

import { createEmitter } from './emitter.js';

const JUMP_FORWARD = 0.35;
const JUMP_BACK = 0.15;
const MAX_EXTRAPOLATE = 0.1;

/** Index of the first value strictly greater than t. */
function firstAfter(values, t) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function createBeatClock({ player, loop }) {
  const events = createEmitter();
  let beats = [];
  let onsets = [];
  let onsetTimes = [];
  let beatIdx = 0;
  let onsetIdx = 0;
  let last = null;   // clip time of the previous tick; null = re-sync on the next tick
  let raw = null;    // last distinct currentTime reading ...
  let rawAt = 0;     // ... and the frame time it was first seen
  let latencyMs = 0;
  let stop = null;
  let current = 0;

  function read(nowMs) {
    const ct = player.currentTime();
    if (ct !== raw) { raw = ct; rawAt = nowMs; return ct; }
    return ct + Math.min(MAX_EXTRAPOLATE, Math.max(0, (nowMs - rawAt) / 1000));
  }

  function resync(t) {
    beatIdx = firstAfter(beats, t);
    onsetIdx = firstAfter(onsetTimes, t);
    last = t;
  }

  function tick(nowMs) {
    if (!player.isPlaying()) { stop = null; last = null; raw = null; return false; }
    const t = read(nowMs) - latencyMs / 1000;
    current = t;
    if (last === null || t < last - JUMP_BACK || t - last > JUMP_FORWARD) { resync(t); return true; }
    if (t <= last) return true;
    while (beatIdx < beats.length && beats[beatIdx] <= t) events.emit('beat', beatIdx++);
    while (onsetIdx < onsets.length && onsetTimes[onsetIdx] <= t) events.emit('onset', onsets[onsetIdx++]);
    last = t;
    return true;
  }

  function start() {
    last = null;
    raw = null;
    if (!stop) stop = loop.add(tick);
  }

  player.on('play', start);
  player.on('seeked', () => { last = null; });

  return {
    setBeats(data) {
      beats = Array.isArray(data?.beats) ? data.beats : [];
      onsets = Array.isArray(data?.onsets) ? data.onsets : [];
      onsetTimes = onsets.map((o) => o.t);
      last = null;
    },
    get latencyOffsetMs() { return latencyMs; },
    set latencyOffsetMs(ms) { latencyMs = Number(ms) || 0; last = null; },
    time: () => current,
    tick,
    on: events.on,
  };
}
