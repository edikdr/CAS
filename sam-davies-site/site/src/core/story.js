// SD.story — scroll position → p (0–1), act, scrim, grade. Publishes ONLY state (TZ §5):
// :root --p --act --scrim (--grade), html[data-act], and `story:progress` {p, act}.
// One requestAnimationFrame loop for the page; it sleeps when nothing moves and while a modal is open.
import { root, $, clamp, curve, emit, prefersReducedMotion, prefersReducedData } from './util.js';
import { createScrollVideo, pickSource, isConstrained } from './scroll-video.js';
import { perf } from './perf.js';

export function createStory() {
  const api = { p: 0, act: 0, velocity: 0, mode: 'video' };
  let cfg, wrapper, video, sv = null;
  let top = 0, dist = 1;
  let raf = 0, last = 0, lastY = -1, frozen = false, published = -1;
  const listeners = new Set();

  function measure() {
    const r = wrapper.getBoundingClientRect();
    top = r.top + scrollY;
    dist = Math.max(1, wrapper.offsetHeight - innerHeight);
  }

  function actFor(p) {
    const b = cfg.acts; // [0, .25, .62, 1] → act 0..2, then 3 after the video
    if (p >= b[b.length - 1]) return b.length - 1;
    for (let i = b.length - 2; i >= 0; i--) if (p >= b[i]) return i;
    return 0;
  }

  function publish(p) {
    const act = actFor(p);
    api.p = p;
    if (Math.abs(p - published) < 1e-5 && act === api.act && published >= 0) return;
    published = p;
    const scrim = clamp(curve(cfg.scrim, p));
    const grade = cfg.warmGrade ? cfg.warmGrade.opacity * clamp(1 - p / cfg.warmGrade.to) : 0;
    root.style.setProperty('--p', p.toFixed(4));
    root.style.setProperty('--scrim', scrim.toFixed(3));
    root.style.setProperty('--grade', grade.toFixed(3));
    if (act !== api.act || root.dataset.act !== String(act)) {
      api.act = act;
      root.style.setProperty('--act', act);
      root.dataset.act = String(act);
    }
    emit('story:progress', { p, act });
  }

  function tick(t) {
    raf = 0;
    if (frozen) return;
    const dt = last ? (t - last) / 1000 : 1 / 60;
    last = t;
    perf.frame();
    const y = scrollY;
    const moved = y !== lastY;
    if (moved) {
      api.velocity = lastY < 0 ? 0 : (y - lastY) / Math.max(dt, 1 / 240);
      lastY = y;
    } else api.velocity *= 0.5;
    const p = clamp((y - top) / dist);
    publish(p);
    let busy = moved || Math.abs(api.velocity) > 1;
    if (sv) { sv.setProgress(p); busy = sv.step(dt) || busy; }
    for (const fn of listeners) fn(api);
    if (busy) raf = requestAnimationFrame(tick);
    else { last = 0; api.velocity = 0; perf.sleep(); }
  }

  const wake = () => { if (!raf && !frozen) raf = requestAnimationFrame(tick); };

  function addLayer(cls, html = '') {
    const el = document.createElement('div');
    el.className = cls;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = html;
    return el;
  }

  api.init = (config) => {
    cfg = { scrollLengthVh: 600, acts: [0, 0.25, 0.62, 1], scrim: [[0, 0.5], [1, 0.4]], ...config };
    wrapper = $('[data-story]');
    video = $('#story-video');
    const stage = $('[data-story-stage]');
    root.style.setProperty('--story-length', `${cfg.scrollLengthVh}vh`);
    cfg.acts.slice(1).forEach((b, i) => root.style.setProperty(`--act-span-${i}`, (b - cfg.acts[i]).toFixed(4)));

    // Decorative layers, in paint order: video · grade · end frame · stills · scrim.
    const grade = addLayer('story__grade');
    const end = addLayer('story__end');
    const v = cfg.video || {};
    const stills = addLayer('story__stills', (v.stills || []).map((_, i) => `<img data-still="${i}" alt="" decoding="async">`).join(''));
    const scrim = $('[data-story-scrim]', stage);
    stage.insertBefore(grade, scrim);
    stage.insertBefore(end, scrim);
    stage.insertBefore(stills, scrim);

    const variant = isConstrained(v.smallMaxWidth) ? v.small : v.large;
    const source = pickSource(video, variant || []);
    const reduced = prefersReducedMotion() || prefersReducedData() || !source;
    api.mode = reduced ? 'stills' : 'video';
    api.source = source?.src || null;

    const loadStills = () => $$img(stills).forEach((img, i) => { if (!img.src) img.src = v.stills[i]; });
    if (reduced) {
      root.dataset.motion = 'reduced';
      // Poster first (LCP), stills right after load.
      if (document.readyState === 'complete') loadStills(); else addEventListener('load', loadStills, { once: true });
    } else {
      sv = createScrollVideo(video, {
        ...(cfg.follower || {}),
        onError: () => { root.dataset.motion = 'reduced'; api.mode = 'stills'; sv = null; loadStills(); },
      });
      sv.onWake = wake;
      // Lazy: attach the video only after the poster has painted and the page is idle,
      // or immediately on first scroll intent.
      const attach = () => sv?.attach(source);
      const idle = () => (window.requestIdleCallback ? requestIdleCallback(attach, { timeout: 1500 }) : setTimeout(attach, 300));
      if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
      addEventListener('scroll', attach, { once: true, passive: true });
    }

    measure();
    addEventListener('scroll', wake, { passive: true });
    addEventListener('resize', () => { measure(); wake(); }, { passive: true });
    new ResizeObserver(() => { measure(); wake(); }).observe(document.body);
    // A modal freezes the story (body is position:fixed, scrollY reads 0); it resumes with the
    // same p because modal.js restores the exact scroll position before `modal:close`.
    document.addEventListener('modal:open', () => { frozen = true; if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; perf.sleep(); });
    document.addEventListener('modal:close', () => { frozen = false; lastY = scrollY; wake(); });
    publish(clamp((scrollY - top) / dist));
    wake();
    return api;
  };

  /** Core-internal: per-frame subscribers (sfx). */
  api.onFrame = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  Object.defineProperty(api, 'videoTime', { get: () => (sv ? video.currentTime : null) });
  Object.defineProperty(api, 'duration', { get: () => sv?.duration || 0 });
  return api;
}

const $$img = (el) => [...el.querySelectorAll('img')];
