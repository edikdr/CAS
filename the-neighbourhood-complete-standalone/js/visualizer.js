/* ---------------------------------------------------------------------------
   VISUALIZER — the bar row under the player.

   The row is a timeline, not a spectrum. As the clip plays, the bar under the
   playhead samples the audio and is then left alone: everything behind the
   head is a frozen recording of what was heard, the way a voice note looks
   once it has been played. Bars ahead of the head idle low until reached.

   Bar height comes from loudness (time-domain RMS) shaped by timbre (spectral
   centroid), so a bright, loud passage draws tall and a dull, quiet one draws
   short. When the stream is opaque to the analyser, a tempo-driven synth feeds
   the same pipeline so the trail still tracks the song.
--------------------------------------------------------------------------- */

const Visualizer = (() => {
  'use strict';

  const BAR_WIDTH = 6;
  const BAR_GAP = 3;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let host = null;
  let track = null;          /* the flex row of bars */
  let veil = null;           /* the fade over already-played history */
  let bars = [];
  let drawn = [];            /* last written scale, so frozen bars are not rewritten */
  let captured = null;       /* Float32Array: the frozen amplitude per bar */
  let hasCapture = null;     /* Uint8Array: whether that bar was ever reached */
  let idle = [];

  let audio = null;
  let ctx = null;
  let analyser = null;
  let source = null;
  let gain = null;
  let freqData = null;
  let timeData = null;

  let raf = 0;
  let silentFrames = 0;
  let blind = false;
  let tempo = 104;
  let peak = .35;
  let head = -1;
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

    if (!track) {
      host.innerHTML = '<div class="wf-bars"></div><div class="wf-veil"></div>';
      track = host.querySelector('.wf-bars');
      veil = host.querySelector('.wf-veil');
    }
    track.innerHTML = Array.from({ length: count }, () => '<i></i>').join('');
    bars = [...track.querySelectorAll('i')];
    drawn = new Array(count).fill(-1);
    captured = new Float32Array(count);
    hasCapture = new Uint8Array(count);
    idle = Array.from({ length: count }, (_, i) => Math.abs(Math.sin(i * .63)) * .5 + .5);
    head = -1;
    lastPast = -1;
  }

  function reset() {
    if (!captured) return;
    captured.fill(0);
    hasCapture.fill(0);
    drawn.fill(-1);
    head = -1;
    lastPast = -1;
    peak = .35;
    if (veil) veil.style.setProperty('--head', '0%');
  }

  const write = (index, value) => {
    const scale = Math.max(.035, Math.min(1, value));
    if (Math.abs(scale - drawn[index]) < .005) return;
    drawn[index] = scale;
    bars[index].style.transform = `scaleY(${scale.toFixed(3)})`;
  };

  function paintPlayed(index) {
    if (index === lastPast) return;
    const from = Math.min(index, lastPast < 0 ? 0 : lastPast);
    const to = Math.max(index, lastPast < 0 ? bars.length : lastPast);
    for (let i = from; i <= to && i < bars.length; i += 1) {
      bars[i].classList.toggle('past', i < index);
      bars[i].classList.toggle('head', i === index);
    }
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
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = .55;   /* looser, so transients survive */
      gain = ctx.createGain();
      gain.gain.value = Number(audio.dataset.gain || 1);
      source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      timeData = new Uint8Array(analyser.fftSize);
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

  /* ---- level: how loud, and how bright ---------------------------------- */

  function readLevel() {
    analyser.getByteTimeDomainData(timeData);
    let sum = 0;
    for (let i = 0; i < timeData.length; i += 2) {
      const v = (timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / (timeData.length / 2));

    analyser.getByteFrequencyData(freqData);
    let energy = 0;
    let weighted = 0;
    const top = Math.floor(freqData.length * .72);
    for (let i = 1; i < top; i += 1) {
      energy += freqData[i];
      weighted += freqData[i] * i;
    }
    if (energy === 0) return { value: 0, silent: true };

    /* centroid, 0 = all bass, 1 = all treble */
    const brightness = Math.min(1, (weighted / energy) / (top * .42));

    /* loudness dominates, timbre stretches it hard in both directions */
    let value = Math.pow(rms * 3.1, .72) * (.42 + 1.15 * brightness);

    peak = Math.max(value, peak * .9985);
    value /= Math.max(.22, peak);
    return { value: Math.min(1, value), silent: false };
  }

  function synthLevel(time, playing) {
    if (!playing) return 0;
    const beat = time * (tempo / 60);
    const phase = beat - Math.floor(beat);
    const inBar = Math.floor(beat) % 4;
    const kick = Math.exp(-8 * phase);
    const snare = (inBar === 1 || inBar === 3) ? Math.exp(-12 * phase) * .85 : 0;
    const hat = Math.exp(-16 * ((beat * 2) % 1)) * .3;
    const swell = .32 + .3 * Math.sin(time * 1.1) + .12 * Math.sin(time * 2.7);
    return Math.min(1, Math.max(.08, kick * .8 + snare + hat + swell * .55 + Math.random() * .12));
  }

  /* ---- loop ------------------------------------------------------------ */

  let state = { playing: false, time: 0, duration: 30, virtual: true };

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!bars.length) return;

    const time = now / 1000;
    const live = Boolean(ctx && analyser && !blind && !state.virtual);
    let level = 0;

    if (live) {
      const read = readLevel();
      if (state.playing) {
        silentFrames = read.silent ? silentFrames + 1 : 0;
        if (silentFrames > 40) {
          blind = true;
          Api.setStatus('itunes', 'live', 'stream is opaque — bars run on tempo sync');
        }
      }
      level = read.value;
      setMode(state.playing ? 'ANALYSER' : 'IDLE');
    } else {
      level = synthLevel(state.time || time, state.playing);
      setMode(state.playing ? 'TEMPO SYNC' : 'IDLE');
    }

    const ratio = state.duration ? Math.min(1, Math.max(0, state.time / state.duration)) : 0;
    const index = Math.min(bars.length - 1, Math.floor(ratio * bars.length));

    if (state.playing) {
      /* fill anything the playhead skipped over, so the trail has no gaps */
      if (head >= 0 && index > head + 1) {
        for (let i = head + 1; i < index; i += 1) {
          if (!hasCapture[i]) {
            captured[i] = Math.max(.08, level * (.72 + Math.random() * .3));
            hasCapture[i] = 1;
          }
        }
      }
      /* the live head settles into place, then is never touched again */
      captured[index] = hasCapture[index]
        ? captured[index] * .55 + level * .45
        : level;
      hasCapture[index] = 1;
      head = index;
    }

    for (let i = 0; i < bars.length; i += 1) {
      if (hasCapture[i]) {
        /* frozen: written once and skipped by `write` from then on */
        write(i, captured[i]);
      } else {
        const breath = state.playing ? .055 : .045;
        write(i, .05 + idle[i] * breath * (1 + .5 * Math.sin(time * 1.4 + i * .35)));
      }
    }

    paintPlayed(index);
    if (veil) veil.style.setProperty('--head', `${(ratio * 100).toFixed(2)}%`);
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
      bars.forEach((bar, i) => { bar.style.transform = `scaleY(${(.12 + Math.abs(Math.sin(i * .55)) * .5).toFixed(3)})`; });
      setMode('STATIC');
    } else {
      start();
    }
    if ('ResizeObserver' in window) new ResizeObserver(() => build()).observe(host);
    else window.addEventListener('resize', build);
  }

  const update = (next) => { Object.assign(state, next); };
  const setTempo = (value) => { tempo = Math.max(50, Math.min(200, Number(value) || 104)); };
  const onMode = (fn) => { modeListeners.add(fn); fn(mode); };

  return { mount, update, reset, setTempo, unlock, resume, setVolume, start, stop, onMode, get mode() { return mode; } };
})();
