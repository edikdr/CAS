// SD.lyrics — lyrics live ONLY in the lyrics modal, on top of the page (TZ §6).
// Text + timing come only from local Scribe-derived LRC files (data/private-lyrics/<id>.lrc).
// LRCLIB is never used: the engine receives just the local source, and the production CSP
// (connect-src 'self') blocks any other lyrics host. Opening/closing never touches the audio.
import { $, emit } from './util.js';

/** "[mm:ss.xx]text" lines → [{t, text}] (several stamps per line allowed; metadata tags skipped). */
export function parseLrc(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!words) continue;
    for (const m of stamps) out.push({ t: +m[1] * 60 + +m[2] + (m[3] ? +`0.${m[3]}` : 0), text: words });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Core fallback renderer, used when the vendor engine is absent (or fails to start).
 *  Same container, same `.le-word` hook, one line at a time; words light up across the line. */
function createMiniEngine({ audio, container, lrc }) {
  const lines = parseLrc(lrc);
  const list = document.createElement('ol');
  list.className = 'sd-lyr';
  list.setAttribute('aria-hidden', 'true'); // rapid visual text; the modal title names the song
  const nodes = lines.map((line, i) => {
    const li = document.createElement('li');
    li.className = 'sd-lyr__line';
    const end = lines[i + 1]?.t ?? line.t + 3;
    const words = line.text.split(/\s+/);
    li._words = words.map((w, j) => {
      const span = document.createElement('span');
      span.className = 'le-word';
      span.textContent = w;
      li.append(span, ' ');
      return { span, t: line.t + ((end - line.t) * j) / words.length };
    });
    list.append(li);
    return li;
  });
  container.append(list);
  let raf = 0, cur = -1;
  function render() {
    const now = audio.currentTime;
    let idx = -1;
    for (let i = 0; i < lines.length && lines[i].t <= now + 0.05; i++) idx = i;
    if (idx !== cur) {
      nodes[cur]?.classList.remove('is-current');
      nodes[idx]?.classList.add('is-current');
      cur = idx;
    }
    for (const w of nodes[idx]?._words || []) w.span.classList.toggle('is-sung', w.t <= now + 0.05);
  }
  const loop = () => { render(); raf = audio.paused ? 0 : requestAnimationFrame(loop); };
  const wake = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const events = ['play', 'playing', 'seeked', 'timeupdate'];
  events.forEach((e) => audio.addEventListener(e, wake));
  render();
  wake();
  return {
    kind: 'core',
    open() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      events.forEach((e) => audio.removeEventListener(e, wake));
      list.remove();
    },
  };
}

export function createLyrics({ player, modal, i18n, announce }) {
  const modalEl = $('#lyrics-modal');
  const stage = $('#lyrics-stage');
  let tracks = new Map();
  let cfg = { enabled: true, dir: 'data/private-lyrics', engine: '', vendor: false };
  let engine = null;
  let engineFor = null;
  let gen = 0;
  let vendorLoad = null;
  const lrcCache = new Map();

  const api = {
    get isOpen() { return modal.current === modalEl; },
    get engineKind() { return engine?.kind || null; },
    open, close, hasLyrics,
  };

  function hasLyrics(id) {
    const t = tracks.get(String(id));
    return Boolean(cfg.enabled && t?.hasLyrics);
  }

  function fillHeader(track) {
    $('#lm-title').textContent = track.title;
    $('#lm-artist').textContent = track.artistLine;
    const img = $('#lm-cover');
    if (img.getAttribute('src') !== track.cover) img.src = track.cover;
  }

  function message(key) {
    stage.textContent = '';
    const p = document.createElement('p');
    p.className = 'sd-lyr__msg';
    p.setAttribute('data-i18n', key);
    p.textContent = i18n.t(key);
    stage.append(p);
  }

  /** Load the vendor engine script once, lazily (only when present in the build). */
  function loadVendor() {
    if (!cfg.vendor) return Promise.resolve(null);
    if (window.LyricsEngine) return Promise.resolve(window.LyricsEngine);
    vendorLoad ||= new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = cfg.engine;
      s.onload = () => resolve(window.LyricsEngine || null);
      s.onerror = () => resolve(null);
      document.head.append(s);
    });
    return vendorLoad;
  }

  function theme() {
    const css = getComputedStyle(document.documentElement);
    const red = css.getPropertyValue('--c-red').trim() || '#e30613';
    return {
      extends: 'clean', text: red, shadow: '0 0 16px rgba(0,0,0,.45)', particle: '#ffffff', particles: 18, wave: red,
      font: 'Anton, Impact, "Arial Narrow Bold", sans-serif', weight: 400, size: 1.4,
      ui: css.getPropertyValue('--c-cream').trim() || '#f2e6c9', uiBackground: 'rgba(10,22,51,.85)',
    };
  }

  /** VERIFY (docs/decisions.md D-002): lyrics-engine.zip was not supplied, so this adapter follows
   *  the TZ's description of the API and feature-detects the custom-source helper. Keep every
   *  engine-specific call in this one function. */
  function createVendorEngine(LE, track, lrc) {
    const src = LE.sources?.lrcText ? LE.sources.lrcText(lrc)
      : LE.sources?.lrc ? LE.sources.lrc(lrc)
      : { type: 'lrc', text: lrc };
    const e = LE.create({
      audio: player.element,
      container: '#lyrics-stage',
      track: { artist: track.artistLine, title: track.title, album: track.releaseTitle, duration: 30, offset: 0 },
      sources: [src], // local only — no LRCLIB
      lrclib: false,
      calibration: false,
      theme: theme(),
    });
    e.open?.();
    return { kind: 'vendor', destroy: () => e.destroy?.(), setTrack: e.setTrack ? (t, l) => e.setTrack(t, l) : null, raw: e };
  }

  async function fetchLrc(id) {
    if (lrcCache.has(id)) return lrcCache.get(id);
    const res = await fetch(`${cfg.dir}/${encodeURIComponent(id)}.lrc`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`lrc ${res.status}`);
    const text = await res.text();
    lrcCache.set(id, text);
    return text;
  }

  function stopEngine() {
    gen++;
    if (engine) { try { engine.destroy(); } catch (e) { console.error(e); } }
    engine = null;
    engineFor = null;
    stage.textContent = ''; // open → close → open never doubles the text
    stage.removeAttribute('aria-busy');
  }

  async function startEngine(track) {
    stopEngine();
    const my = gen;
    stage.setAttribute('aria-busy', 'true');
    message('core.lyrics.loading');
    let lrc, LE;
    try {
      [lrc, LE] = await Promise.all([fetchLrc(track.id), loadVendor()]);
    } catch {
      if (my === gen) { stage.removeAttribute('aria-busy'); message('core.lyrics.error'); }
      return;
    }
    if (my !== gen || !api.isOpen) return;
    stage.textContent = '';
    stage.removeAttribute('aria-busy');
    try {
      engine = LE ? createVendorEngine(LE, track, lrc) : createMiniEngine({ audio: player.element, container: stage, lrc });
    } catch (e) {
      console.warn('[lyrics] vendor engine failed, using core renderer', e);
      stage.textContent = '';
      engine = createMiniEngine({ audio: player.element, container: stage, lrc });
    }
    engineFor = track.id;
  }

  async function open(id, { returnFocus } = {}) {
    const key = String(id ?? player.current?.id ?? '');
    const track = tracks.get(key);
    if (!track) return false;
    if (!hasLyrics(key)) { announce(i18n.t('core.lyrics.none')); return false; }
    // open(id) starts that track if it is not the current one; a paused current track stays paused.
    if (player.current?.id !== key) player.play(key);
    fillHeader(track);
    if (api.isOpen) {
      if (engineFor !== key) {
        if (engine?.setTrack) {
          const lrc = await fetchLrc(key).catch(() => null);
          if (lrc != null) { engine.setTrack({ artist: track.artistLine, title: track.title, album: track.releaseTitle, duration: 30, offset: 0 }, lrc); engineFor = key; }
        } else await startEngine(track);
      }
      return true;
    }
    // Created after the open transition so the engine measures a laid-out, visible container.
    await modal.open(modalEl, { returnFocus: returnFocus || document.activeElement });
    if (!api.isOpen) return false;
    await startEngine(track);
    emit('lyrics:open', { track });
    return true;
  }

  async function close() {
    if (!api.isOpen) return;
    stopEngine();
    await modal.close();
  }

  function progress({ t, d }) {
    const bar = modalEl?.querySelector('.modal__progress');
    if (!bar || !api.isOpen) return;
    const n = Math.floor(t);
    bar.setAttribute('aria-valuenow', String(n));
    bar.setAttribute('aria-valuemax', String(Math.round(d)));
    bar.setAttribute('aria-valuetext', i18n.t('core.modal.progressValue', { n, d: Math.round(d) }));
  }

  api.init = ({ data, config, build }) => {
    tracks = new Map(data.tracks.map((t) => [t.id, t]));
    cfg = {
      enabled: config.features?.lyrics !== false,
      dir: config.lyrics?.dir || cfg.dir,
      engine: config.lyrics?.engine || '',
      vendor: Boolean(build?.lyricsEngine && config.lyrics?.engine),
    };
    // Esc / Back / backdrop / chevron all go through modal.js; tear the engine down whichever it was.
    document.addEventListener('modal:close', (e) => {
      if (e.detail.id !== modalEl.id) return;
      stopEngine();
      emit('lyrics:close', {});
    });
    document.addEventListener('player:time', (e) => progress(e.detail));
    document.addEventListener('i18n:change', () => i18n.apply(stage));
    // [data-lyrics-open="<id>"] anywhere on the page.
    document.addEventListener('click', (e) => {
      const el = e.target.closest?.('[data-lyrics-open]');
      if (!el) return;
      e.preventDefault();
      if (el.getAttribute('aria-disabled') === 'true') { announce(i18n.t('core.lyrics.none')); return; }
      open(el.getAttribute('data-lyrics-open'), { returnFocus: el });
    });
    const sync = () => {
      for (const el of document.querySelectorAll('[data-lyrics-open]')) {
        const id = el.getAttribute('data-lyrics-open');
        const t = tracks.get(id);
        const ok = hasLyrics(id);
        el.setAttribute('aria-label', ok ? i18n.t('core.lyrics.open', { title: t?.title || '' }) : `${t?.title || ''} — ${i18n.t('core.lyrics.none')}`);
        if (ok) el.removeAttribute('aria-disabled'); else el.setAttribute('aria-disabled', 'true');
      }
    };
    let pending = false;
    const mo = new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; sync(); }); } });
    for (const el of [$('#main'), $('#footer')]) if (el) mo.observe(el, { childList: true, subtree: true });
    document.addEventListener('i18n:change', sync);
    sync();
    return api;
  };

  return api;
}
