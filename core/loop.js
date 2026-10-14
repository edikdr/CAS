/*
 * core/loop.js - the single requestAnimationFrame loop (CONTRACT section 4).
 *
 * Public API:
 *   Loop.add(task) -> remove()   task(now, dtMs) is called every frame; return false to stop it
 *   Loop.running                 true while a frame is scheduled
 *
 * The loop sleeps when no task is registered and while the tab is hidden; dt is capped at
 * 100 ms so a task never sees a huge jump after a pause. Prefer CSS / Web Animations for
 * fire-and-forget motion (they run off the main thread); use the loop only for work that
 * must read state every frame (BeatClock, WebGL renders on demand).
 *
 * Must not change: one loop for the whole site - never call requestAnimationFrame elsewhere
 * (the only accepted exception is the vendored lyrics engine, see HANDOFF.md).
 */

const tasks = new Set();
let raf = 0;
let last = 0;

function frame(now) {
  raf = 0;
  const dt = last ? Math.min(now - last, 100) : 1000 / 60;
  last = now;
  for (const task of [...tasks]) {
    let keep;
    try { keep = task(now, dt); } catch (e) { keep = false; console.error(e); }
    if (keep === false) tasks.delete(task);
  }
  schedule();
}

function schedule() {
  if (!raf && tasks.size && !document.hidden) raf = requestAnimationFrame(frame);
  if (!raf) last = 0;
}

document.addEventListener('visibilitychange', schedule);

export const Loop = {
  add(task) {
    tasks.add(task);
    schedule();
    return () => tasks.delete(task);
  },
  get running() { return raf !== 0; },
};
