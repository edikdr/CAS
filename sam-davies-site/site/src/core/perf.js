// Lightweight runtime metrics for the scroll loop (frame pacing, seek latency, held-back writes).
// Always collected (cheap counters); `?perf` shows a small overlay. Read by tests via SD.perf.
const now = () => performance.now();

function fresh() {
  return { frames: 0, longFrames: 0, worstFrame: 0, frameSum: 0, seeks: 0, seekSum: 0, seekWorst: 0, skipped: 0, started: now() };
}

let m = fresh();
let lastFrame = 0;
let seekAt = 0;
let overlay = null;

export const perf = {
  frame() {
    const t = now();
    if (lastFrame && t - lastFrame < 250) { // ignore gaps while the loop was asleep
      const d = t - lastFrame;
      m.frames++;
      m.frameSum += d;
      if (d > 1000 / 30) m.longFrames++;
      if (d > m.worstFrame) m.worstFrame = d;
    }
    lastFrame = t;
  },
  sleep() { lastFrame = 0; },
  seekStart() { seekAt = now(); m.seeks++; },
  seekEnd() {
    if (!seekAt) return;
    const d = now() - seekAt;
    m.seekSum += d;
    if (d > m.seekWorst) m.seekWorst = d;
    seekAt = 0;
  },
  skip() { m.skipped++; },
  reset() { m = fresh(); lastFrame = 0; },
  snapshot() {
    const secs = (now() - m.started) / 1000;
    return {
      frames: m.frames,
      avgFrameMs: m.frames ? +(m.frameSum / m.frames).toFixed(2) : 0,
      worstFrameMs: +m.worstFrame.toFixed(1),
      longFrames: m.longFrames,
      seeks: m.seeks,
      seeksPerSec: +(m.seeks / Math.max(secs, 0.001)).toFixed(1),
      avgSeekMs: m.seeks ? +(m.seekSum / m.seeks).toFixed(1) : 0,
      worstSeekMs: +m.seekWorst.toFixed(1),
      heldBackWrites: m.skipped,
      seconds: +secs.toFixed(2),
    };
  },
  overlay() {
    if (overlay) return;
    overlay = document.createElement('pre');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:200;margin:0;padding:6px 8px;font:11px/1.3 ui-monospace,monospace;color:#f2e6c9;background:rgb(0 0 0/.7);pointer-events:none';
    document.body.append(overlay);
    setInterval(() => { overlay.textContent = JSON.stringify(perf.snapshot(), null, 1).replace(/[{}"]/g, ''); }, 500);
  },
};
