// SD.player — ONE persistent <audio> element for the whole page (lyrics-engine recipe A).
// Never removed, never re-created; the lyrics engine receives this element. Core never calls
// createMediaElementSource on it (engine rule).
import { root, $, $$, emit, emitter } from './util.js';

export function createPlayer({ i18n, announce }) {
  const bus = emitter();
  const audio = document.createElement('audio');
  audio.id = 'sd-audio';
  audio.preload = 'none';
  audio.setAttribute('aria-hidden', 'true');

  let tracks = new Map();
  let order = []; // track ids in data order
  let cfg = { autoAdvance: false };
  let current = null; // track | null (null while idle)
  let last = null; // last track played, so toggle() after the end replays it
  let state = 'idle';
  let raf = 0;
  let lastTimeEmit = 0;

  const api = {
    get current() { return current; },
    get state() { return state; },
    get currentTime() { return current ? audio.currentTime : 0; },
    get duration() { return current ? (Number.isFinite(audio.duration) ? audio.duration : current.previewSeconds || 30) : 0; },
    get element() { return audio; },
    play, pause, toggle, stop,
    on: (evt, cb) => bus.on(String(evt).replace(/^player:/, ''), cb),
  };

  function setState(next, track = current, extra = {}) {
    const changed = next !== state || track !== current;
    state = next;
    current = next === 'idle' ? null : track;
    if (track) last = track;
    root.dataset.player = state;
    sync();
    if (changed || extra.error) {
      const detail = { track: current, state, ...extra };
      bus.fire('change', detail);
      emit('player:change', detail);
    }
  }

  async function play(id) {
    const track = id != null ? tracks.get(String(id)) : current || last;
    if (!track) return;
    if (!audio.canPlayType('audio/mp4; codecs="mp4a.40.2"') && /\.m4a(\?|$)/i.test(track.audio)) {
      announce(i18n.t('core.player.error'));
      setState('idle', track, { error: true });
      return;
    }
    if (current?.id !== track.id || state === 'idle') {
      audio.src = track.audio;
      audio.currentTime = 0;
      announce(i18n.t('core.player.nowPlaying', { title: track.title, artist: track.artistLine }));
    }
    setState('playing', track);
    loop();
    try {
      await audio.play();
    } catch (e) {
      if (e?.name === 'AbortError') return; // superseded by another play()/pause()
      // Autoplay policy (no gesture) or a decode failure: leave it paused, the UI can retry.
      if (current?.id === track.id) setState('paused', track);
    }
  }

  function pause() {
    if (state !== 'playing') return;
    audio.pause();
    setState('paused');
    announce(i18n.t('core.player.paused'));
  }

  function toggle(id) {
    const target = id != null ? String(id) : (current || last)?.id;
    if (!target) return;
    if (current?.id === target && state === 'playing') pause();
    else play(target);
  }

  function stop() {
    if (state === 'idle') return;
    audio.pause();
    try { audio.currentTime = 0; } catch { /* not seekable yet */ }
    setState('idle');
    setProgress(0);
    announce(i18n.t('core.player.stopped'));
  }

  audio.addEventListener('ended', () => {
    const ended = current;
    setProgress(1);
    if (cfg.autoAdvance && ended) {
      const rel = order.filter((id) => tracks.get(id).releaseId === ended.releaseId);
      const next = rel[rel.indexOf(ended.id) + 1];
      if (next) { play(next); return; }
    }
    setState('idle', ended);
    announce(i18n.t('core.player.ended'));
  });
  audio.addEventListener('error', () => {
    if (state === 'idle' || !audio.getAttribute('src')) return;
    announce(i18n.t('core.player.error'));
    setState('idle', current, { error: true });
  });
  audio.addEventListener('waiting', () => root.setAttribute('data-player-buffering', ''));
  audio.addEventListener('playing', () => root.removeAttribute('data-player-buffering'));
  audio.addEventListener('pause', () => {
    // Paused from outside core (OS media keys, another tab policy) → reflect it.
    if (state === 'playing' && !audio.ended && audio.currentTime > 0) setState('paused');
  });
  audio.addEventListener('play', () => { if (state !== 'playing' && current) setState('playing'); });

  // --prog is updated every frame while playing (smooth bars); events are throttled to ≤ 4/s.
  const progTargets = () => [$('#island'), $('#lyrics-modal')].filter(Boolean);
  function setProgress(f) {
    const v = Math.min(1, Math.max(0, f)).toFixed(4);
    for (const el of progTargets()) el.style.setProperty('--prog', v);
  }
  function loop() {
    if (raf) return;
    const frame = (t) => {
      raf = 0;
      if (!current) return;
      const d = api.duration || 30;
      setProgress(audio.currentTime / d);
      if (t - lastTimeEmit >= 250) {
        lastTimeEmit = t;
        const detail = { t: audio.currentTime, d };
        bus.fire('time', detail);
        emit('player:time', detail);
      }
      if (state === 'playing') raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  audio.addEventListener('playing', loop);
  audio.addEventListener('seeked', loop);

  /** Labels, aria-pressed and .is-playing on every hook currently in the DOM. */
  function sync() {
    const playing = state === 'playing';
    for (const el of $$('[data-play-track]')) {
      const id = el.getAttribute('data-play-track');
      const t = tracks.get(id);
      const active = current?.id === id;
      const on = active && playing;
      if (t) el.setAttribute('aria-label', i18n.t('core.player.track', { title: t.title }));
      if (el.matches('button,[role="button"]')) el.setAttribute('aria-pressed', String(on));
      el.classList.toggle('is-playing', on);
      el.closest('[data-track-row]')?.classList.toggle('is-playing', on);
      if (!t) el.setAttribute('aria-disabled', 'true');
    }
    for (const el of $$('[data-player-toggle]')) {
      el.setAttribute('aria-label', i18n.t(playing ? 'core.player.pause' : 'core.player.play'));
      if (!current && !last) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
    }
    for (const el of $$('[data-player-stop]')) el.setAttribute('aria-label', i18n.t('core.player.stop'));
  }

  api.init = ({ data, config }) => {
    cfg = { ...cfg, ...(config || {}) };
    tracks = new Map(data.tracks.map((t) => [t.id, t]));
    order = data.tracks.map((t) => t.id);
    document.body.append(audio);
    document.addEventListener('click', (e) => {
      const el = e.target.closest?.('[data-play-track],[data-player-toggle],[data-player-stop]');
      if (!el || el.getAttribute('aria-disabled') === 'true' && !el.matches('[data-player-toggle]')) return;
      if (el.matches('[data-play-track]')) { e.preventDefault(); toggle(el.getAttribute('data-play-track')); }
      else if (el.matches('[data-player-toggle]')) { e.preventDefault(); toggle(); }
      else if (el.matches('[data-player-stop]')) { e.preventDefault(); stop(); }
    });
    // UI renders hooks after SD.ready: label new ones as they appear (batched per frame).
    // Only the page regions are watched — not the lyrics stage, which mutates every frame.
    let pending = false;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; sync(); });
    });
    for (const el of [$('#main'), $('#footer'), $('#island'), $('.modal__bar')]) if (el) mo.observe(el, { childList: true, subtree: true });
    document.addEventListener('i18n:change', sync);
    sync();
    return api;
  };

  return api;
}
