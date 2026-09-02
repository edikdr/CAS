/* ---------------------------------------------------------------------------
   VISUALIZER — the bar row under the player.

   Primary path : a real Web Audio AnalyserNode reading the playing preview.
   Fallback path: a tempo-driven synthesiser (kick / snare / hats) used when the
                  stream is cross-origin-opaque, blocked, or missing entirely,
                  so the bars still move in time with the track.
--------------------------------------------------------------------------- */

const Visualizer = (() => {
  'use strict';

  const BAR_WIDTH = 6;
  const BAR_GAP = 3;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let host = null;
  let bars = [];
  let levels = [];
  let drift = [];
  let audio = null;
  let ctx = null;
  let analyser = null;
  let source = null;
  let gain = null;
  let data = null;
  let raf = 0;
  let silentFrames = 0;
  let blind = false;
  let tempo = 104;
  let lastPast = -1;
  let modeListeners = new Set();
  let mode = 'IDLE';

  const setMode = (next) => {
    if (next === mode) return;
    mode = next;
    modeListeners.forEach(fn => fn(mode));
  };

  /* ---- bars ------------------------------------------------------------ */

  function build() {
    if (!host) return;
    const width = host.clientWidth || 600;
    const count = Math.max(24, Math.floor(width / (BAR_WIDTH + BAR_GAP)));
    if (count === bars.length) return;
    host.innerHTML = Array.from({ length: count }, () => '<i></i>').join('');
    bars = [...host.querySelectorAll('i')];
    levels = new Array(count).fill(.08);
    drift = new Array(count).fill(0).map((_, i) => Math.sin(i * .7) * .5 + .5);
    lastPast = -1;
  }

  function paint() {
    for (let i = 0; i < bars.length; i += 1) {
      bars[i].style.transform = `scaleY(${Math.max(.03, levels[i]).toFixed(3)})`;
    }
  }

  function progress(ratio) {
    if (!bars.length) return;
    const index = Math.round(Math.min(1, Math.max(0, ratio)) * bars.length);
    if (index === lastPast) return;
    const from = Math.min(index, lastPast < 0 ? 0 : lastPast);
    const to = Math.max(index, lastPast < 0 ? bars.length : lastPast);
    for (let i = from; i < to && i < bars.length; i += 1) {
      bars[i].classList.toggle('past', i < index);
    }
    if (lastPast < 0) for (let i = 0; i < bars.length; i += 1) bars[i].classList.toggle('past', i < index);
    lastPast = index;
  }

  /* ---- web audio ------------------------------------------------------- */

  function unlock() {
    if (ctx || !audio) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { blind = true; return; }
    try {
      ctx = new Ctor();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = .74;
      gain = ctx.createGain();
      gain.gain.value = Number(audio.dataset.gain || 1);
      source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      data = new Uint8Array(analyser.frequencyBinCount);
    } catch (_) {
      blind = true;
      ctx = null;
    }
  }

  const resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); };

  function setVolume(value) {
    if (gain) gain.gain.value = value;
    if (audio) audio.dataset.gain = String(value);
  }

  /* ---- readers --------------------------------------------------------- */

  function readAnalyser(out) {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    const usable = Math.floor(data.length * .62);
    for (let i = 0; i < bars.length; i += 1) {
      const lo = Math.floor(Math.pow(i / bars.length, 1.85) * usable);
      const hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / bars.length, 1.85) * usable));
      let peak = 0;
      for (let b = lo; b < hi; b += 1) { if (data[b] > peak) peak = data[b]; sum += data[b]; }
      /* lift the top end, which is always quieter than the bass */
      const tilt = 1 + (i / bars.length) * 1.5;
      out[i] = Math.min(1, (peak / 255) * tilt);
    }
    return sum;
  }

  function readSynth(out, time, playing) {
    const beat = time * (tempo / 60);
    const phase = beat - Math.floor(beat);
    const inBar = Math.floor(beat) % 4;
    const eighth = (beat * 2) % 1;

    const kick = Math.exp(-9 * phase) * (playing ? 1 : .18);
    const snare = (inBar === 1 || inBar === 3) ? Math.exp(-13 * phase) * (playing ? .92 : .12) : 0;
    const hat = Math.exp(-17 * eighth) * (playing ? .5 : .08);
    const swell = (.5 + .5 * Math.sin(time * 1.15)) * (playing ? .42 : .16);

    for (let i = 0; i < bars.length; i += 1) {
      const p = i / bars.length;
      drift[i] += (Math.random() - .5) * .22;
      drift[i] = Math.max(0, Math.min(1, drift[i] * .88 + .06));

      let value;
      if (p < .2) value = kick * (1.05 - p) + swell * .5;
      else if (p < .55) value = snare * .95 + swell * (1 - Math.abs(p - .36) * 1.4) + kick * .28;
      else value = hat * (1.15 - (p - .55)) + swell * .34;

      value += drift[i] * (playing ? .3 : .12);
      /* a shallow standing wave so the row never looks flat */
      value *= .72 + .28 * Math.sin(p * Math.PI * 3 + time * 2.1);
      out[i] = Math.max(.04, Math.min(1, value));
    }
  }

  /* ---- loop ------------------------------------------------------------ */

  let state = { playing: false, time: 0, duration: 30, virtual: true };

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!bars.length) return;

    const target = new Array(bars.length).fill(0);
    const live = Boolean(ctx && analyser && !blind && !state.virtual);

    if (live) {
      const sum = readAnalyser(target);
      if (state.playing) {
        if (sum === 0) { silentFrames += 1; } else { silentFrames = 0; }
        if (silentFrames > 40) {
          blind = true;
          Api.setStatus('itunes', 'live', 'stream is opaque — bars run on tempo sync');
        }
      }
      setMode(state.playing ? 'ANALYSER' : 'IDLE');
    }

    if (!live || blind) {
      readSynth(target, state.time || performance.now() / 1000, state.playing);
      setMode(state.playing ? 'TEMPO SYNC' : 'IDLE');
    }

    for (let i = 0; i < bars.length; i += 1) {
      const next = target[i];
      levels[i] = next > levels[i]
        ? levels[i] + (next - levels[i]) * .58
        : levels[i] + (next - levels[i]) * .14;
    }
    paint();
    progress(state.duration ? state.time / state.duration : 0);
  }

  function start() {
    if (raf || reduced.matches) return;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---- public ---------------------------------------------------------- */

  function mount(element, audioElement) {
    host = element;
    audio = audioElement;
    build();
    if (reduced.matches) {
      levels = levels.map((_, i) => .12 + Math.abs(Math.sin(i * .55)) * .5);
      paint();
      setMode('STATIC');
    } else {
      start();
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { build(); if (reduced.matches) paint(); }).observe(host);
    } else {
      window.addEventListener('resize', build);
    }
  }

  const update = (next) => { Object.assign(state, next); };
  const setTempo = (value) => { tempo = Math.max(50, Math.min(200, Number(value) || 104)); };
  const onMode = (fn) => { modeListeners.add(fn); fn(mode); };
  const isBlind = () => blind;

  return { mount, update, setTempo, unlock, resume, setVolume, start, stop, onMode, isBlind, get mode() { return mode; } };
})();
