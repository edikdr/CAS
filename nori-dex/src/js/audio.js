/* ==========================================================================
   Sounds, synthesized on the fly with WebAudio; there are no audio files.
   Browsers allow sound only after the first click or key press.
   ========================================================================== */
window.PL = window.PL || {};

PL.audio = (function () {
  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var hissSrc = null;
  var hissGain = null;
  var hissLevel = 0;
  var muted = false;
  var unlocked = false;
  var volume = 6; // 0..10

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem('pl-audio') || 'null');
      if (saved) { muted = !!saved.muted; volume = Math.max(0, Math.min(10, saved.volume | 0)); }
    } catch (e) { /* private mode: nothing is saved */ }
  }
  function save() {
    try { localStorage.setItem('pl-audio', JSON.stringify({ muted: muted, volume: volume })); } catch (e) {}
  }
  load();

  function masterLevel() { return muted ? 0 : Math.pow(volume / 10, 1.6) * 0.9; }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = masterLevel();
      master.connect(ctx.destination);

      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(o) {
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.t || 0.06;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.g || 0.06, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(o) {
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.t || 0.08;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.fq || 3000, t0);
    if (o.fq2) f.frequency.exponentialRampToValueAtTime(o.fq2, t0 + dur);
    f.Q.value = o.q || 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.g || 0.1, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.02);
  }

  var sounds = {
    tick: function () { tone({ type: 'triangle', f: 1500, t: 0.03, g: 0.05 }); },
    btndown: function () { // device button down: dry click + dull stop
      noise({ t: 0.014, filter: 'highpass', fq: 2600, g: 0.07 });
      tone({ type: 'triangle', f: 250, f2: 120, t: 0.04, g: 0.06 });
    },
    btnup: function () {   // spring return
      noise({ t: 0.01, filter: 'highpass', fq: 3600, g: 0.04 });
      tone({ type: 'triangle', f: 340, f2: 210, t: 0.026, g: 0.028 });
    },
    click: function () {
      tone({ type: 'square', f: 620, f2: 480, t: 0.035, g: 0.03 });
      noise({ t: 0.02, fq: 4000, g: 0.04 });
    },
    select: function () {
      tone({ type: 'square', f: 880, t: 0.05, g: 0.04 });
      tone({ type: 'square', f: 1320, t: 0.08, g: 0.04, delay: 0.05 });
    },
    back: function () {
      tone({ type: 'square', f: 990, t: 0.05, g: 0.035 });
      tone({ type: 'square', f: 620, t: 0.08, g: 0.035, delay: 0.05 });
    },
    open: function () {
      tone({ type: 'sine', f: 380, f2: 980, t: 0.14, g: 0.08 });
      tone({ type: 'triangle', f: 1320, t: 0.08, g: 0.03, delay: 0.1 });
    },
    snap: function () { // latch click
      noise({ t: 0.03, filter: 'highpass', fq: 2200, g: 0.45 });
      tone({ type: 'triangle', f: 190, f2: 90, t: 0.06, g: 0.25 });
      noise({ t: 0.025, filter: 'highpass', fq: 3000, g: 0.3, delay: 0.075 });
    },
    boot: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone({ type: 'triangle', f: f, t: i === 3 ? 0.5 : 0.14, g: 0.07, delay: i * 0.09 });
      });
      tone({ type: 'sine', f: 261.6, t: 0.7, g: 0.05, delay: 0.27 });
    },
    tune: function () {
      noise({ t: 0.5, fq: 300, fq2: 5000, q: 2, g: 0.16 });
      tone({ type: 'sawtooth', f: 90, f2: 900, t: 0.45, g: 0.025 });
    },
    off: function () {
      tone({ type: 'sine', f: 900, f2: 40, t: 0.4, g: 0.14 });
      noise({ t: 0.12, filter: 'highpass', fq: 5000, g: 0.06 });
    },
    on: function () {
      tone({ type: 'sine', f: 55, t: 0.3, g: 0.25 });
      noise({ t: 0.45, filter: 'highpass', fq: 7000, g: 0.04, delay: 0.05 });
      tone({ type: 'sine', f: 15000, t: 0.6, g: 0.008, delay: 0.1 });
    },
    shutter: function () {
      noise({ t: 0.04, filter: 'highpass', fq: 2500, g: 0.35 });
      noise({ t: 0.07, filter: 'highpass', fq: 1800, g: 0.25, delay: 0.07 });
    },
    card: function () {
      noise({ t: 0.12, fq: 900, fq2: 4200, q: 1.2, g: 0.12 });
      tone({ type: 'triangle', f: 700, f2: 1400, t: 0.1, g: 0.04, delay: 0.03 });
    },
    error: function () { tone({ type: 'square', f: 150, t: 0.14, g: 0.05 }); },
    /* cable: plug goes in (dull clack), then a thin power-on ring */
    plug: function () {
      tone({ type: 'triangle', f: 160, f2: 62, t: 0.09, g: 0.3 });
      noise({ t: 0.03, filter: 'highpass', fq: 2600, g: 0.4 });
      noise({ t: 0.02, filter: 'highpass', fq: 3400, g: 0.22, delay: 0.06 });
      tone({ type: 'sine', f: 880, f2: 1760, t: 0.2, g: 0.05, delay: 0.1 });
    },
    unplug: function () {
      noise({ t: 0.05, filter: 'highpass', fq: 2000, g: 0.3 });
      tone({ type: 'triangle', f: 120, f2: 220, t: 0.07, g: 0.2 });
    },
    /* light whoosh (cable, relic) */
    swoosh: function () {
      noise({ t: 0.38, fq: 500, fq2: 3200, q: 0.9, g: 0.07 });
    },
    /* sliding along the guide rails */
    slide: function () {
      noise({ t: 0.42, fq: 2600, fq2: 1100, q: 1.4, g: 0.06 });
      tone({ type: 'sine', f: 95, f2: 130, t: 0.4, g: 0.035 });
    },
    lift: function () {
      tone({ type: 'sine', f: 520, f2: 760, t: 0.08, g: 0.05 });
      noise({ t: 0.04, fq: 3800, q: 1, g: 0.05 });
    },
    /* relic seated in the slot: heavy clack-click */
    seat: function () {
      noise({ t: 0.035, filter: 'highpass', fq: 1800, g: 0.5 });
      tone({ type: 'triangle', f: 150, f2: 48, t: 0.12, g: 0.38 });
      noise({ t: 0.028, filter: 'highpass', fq: 3200, g: 0.34, delay: 0.085 });
      tone({ type: 'sine', f: 1320, t: 0.18, g: 0.04, delay: 0.1 });
    },
    /* spring kick on eject */
    eject: function () {
      tone({ type: 'square', f: 360, f2: 920, t: 0.05, g: 0.05 });
      noise({ t: 0.04, filter: 'highpass', fq: 2800, g: 0.32 });
      tone({ type: 'triangle', f: 210, f2: 90, t: 0.08, g: 0.2, delay: 0.03 });
    },
    vol: function () { tone({ type: 'sine', f: 1000, t: 0.06, g: 0.12 }); },

    /* ---------- dialog kit ---------- */
    /* typewriter blip: short quiet beep with random pitch */
    blip: function () { tone({ type: 'square', f: 520 + Math.random() * 90, t: 0.022, g: 0.016 }); },
    qcursor: function () { tone({ type: 'square', f: 1040, t: 0.03, g: 0.03 }); },
    qpick: function () {
      tone({ type: 'square', f: 784, t: 0.045, g: 0.04 });
      tone({ type: 'square', f: 1175, t: 0.07, g: 0.04, delay: 0.045 });
    },
    qcorrect: function () {
      [659.25, 830.6, 987.77, 1318.5].forEach(function (f, i) {
        tone({ type: 'square', f: f, t: i === 3 ? 0.28 : 0.07, g: 0.045, delay: i * 0.07 });
      });
      tone({ type: 'triangle', f: 329.6, t: 0.36, g: 0.07, delay: 0.04 });
    },
    qwrong: function () {
      tone({ type: 'sawtooth', f: 220, f2: 110, t: 0.22, g: 0.06 });
      tone({ type: 'square', f: 147, f2: 73, t: 0.3, g: 0.05, delay: 0.1 });
      noise({ t: 0.12, fq: 900, fq2: 200, q: 0.9, g: 0.12 });
    },
    qheart: function () {
      noise({ t: 0.05, filter: 'highpass', fq: 3200, g: 0.3 });
      tone({ type: 'triangle', f: 520, f2: 120, t: 0.28, g: 0.12 });
    },
    qreveal: function () {
      noise({ t: 0.18, fq: 700, fq2: 5200, q: 1.4, g: 0.1 });
      tone({ type: 'square', f: 440, f2: 1760, t: 0.18, g: 0.03 });
    },
    qstart: function () {      // quick rising arpeggio
      [262, 330, 392, 523, 659, 784, 1047].forEach(function (f, i) {
        tone({ type: 'square', f: f, t: 0.07, g: 0.04, delay: i * 0.055 });
      });
      noise({ t: 0.35, fq: 400, fq2: 3600, q: 1.1, g: 0.07 });
    },
    qnext: function () {
      noise({ t: 0.22, fq: 1200, fq2: 4200, q: 1, g: 0.06 });
      tone({ type: 'triangle', f: 330, f2: 660, t: 0.12, g: 0.05 });
    },
    qwin: function () {
      var m = [[523.25, 0, .16], [659.25, .16, .16], [783.99, .32, .16], [1046.5, .48, .3], [783.99, .8, .14], [1046.5, .94, .14], [1318.5, 1.08, .5],
               [1174.7, 1.64, .14], [1318.5, 1.78, .14], [1568, 1.92, .7]];
      m.forEach(function (n) { tone({ type: 'square', f: n[0], t: n[2], g: 0.04, delay: n[1] }); tone({ type: 'triangle', f: n[0] / 2, t: n[2] * 1.2, g: 0.07, delay: n[1] }); });
      [261.6, 329.6, 392, 523.25].forEach(function (f, i) { tone({ type: 'sine', f: f, t: 1.0, g: 0.035, delay: 1.6 + i * 0.02 }); });
    },
    qlose: function () {
      [392, 370, 349.2, 329.6, 311.1, 293.7, 261.6].forEach(function (f, i) {
        tone({ type: 'sawtooth', f: f, t: i === 6 ? 0.9 : 0.2, g: 0.045, delay: i * 0.17 });
      });
      tone({ type: 'sine', f: 73, f2: 40, t: 1.2, g: 0.16, delay: 0.5 });
    },
    sparkle: function () {
      tone({ type: 'sine', f: 1568, f2: 2093, t: 0.1, g: 0.03 });
      tone({ type: 'sine', f: 2349, t: 0.12, g: 0.02, delay: 0.05 });
    },
    /* catch sequence */
    ballcatch: function () {
      tone({ type: 'sine', f: 300, f2: 1100, t: 0.22, g: 0.05 });
      noise({ t: 0.22, fq: 600, fq2: 2800, q: 1.2, g: 0.07 });
    },
    ballshut: function () {
      noise({ t: 0.03, filter: 'highpass', fq: 2400, g: 0.45 });
      tone({ type: 'triangle', f: 210, f2: 90, t: 0.08, g: 0.3 });
      tone({ type: 'sine', f: 1320, t: 0.16, g: 0.04, delay: 0.08 });
    },
    throw: function () {
      noise({ t: 0.16, fq: 700, fq2: 3600, q: 1.4, g: 0.1 });
      tone({ type: 'sine', f: 380, f2: 900, t: 0.14, g: 0.03 });
    },
    ballhit: function () {
      tone({ type: 'triangle', f: 220, f2: 90, t: 0.09, g: 0.16 });
      noise({ t: 0.04, filter: 'highpass', fq: 2400, g: 0.12 });
      tone({ type: 'sine', f: 1318, t: 0.18, g: 0.04, delay: 0.04 });
    },
    flee: function () {
      tone({ type: 'square', f: 520, f2: 140, t: 0.3, g: 0.04 });
      noise({ t: 0.18, fq: 1800, fq2: 500, q: 1, g: 0.06, delay: 0.05 });
    },
    timeup: function () {
      [0, 0.16, 0.32].forEach(function (d) { tone({ type: 'square', f: 440, t: 0.11, g: 0.05, delay: d }); });
      tone({ type: 'square', f: 220, t: 0.4, g: 0.05, delay: 0.5 });
    },
    tictoc: function () {
      tone({ type: 'square', f: 1100, t: 0.04, g: 0.035 });
    },
    ballping: function () { tone({ type: 'sine', f: 1568, t: 0.35, g: 0.05 }); tone({ type: 'sine', f: 2093, t: 0.35, g: 0.03, delay: 0.09 }); },
  };

  function setHissGain() {
    if (!hissGain) return;
    hissGain.gain.setTargetAtTime(hissLevel * 0.05, ctx.currentTime, 0.08);
  }

  return {
    unlock: function () { unlocked = true; ensure(); },
    play: function (name) {
      if (!unlocked || !ensure() || !sounds[name]) return;
      try { sounds[name](); } catch (e) {}
    },
    /* background noise hiss, level 0..1 */
    hiss: function (level) {
      hissLevel = level;
      if (!unlocked || !ensure()) return; // starts after the first user gesture
      if (!hissSrc && level > 0) {
        hissSrc = ctx.createBufferSource();
        hissSrc.buffer = noiseBuf;
        hissSrc.loop = true;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2600;
        bp.Q.value = 0.6;
        hissGain = ctx.createGain();
        hissGain.gain.value = 0;
        hissSrc.connect(bp).connect(hissGain).connect(master);
        hissSrc.start();
      }
      setHissGain();
    },
    hissLevel: function () { return hissLevel; },
    isMuted: function () { return muted; },
    getVolume: function () { return volume; },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(10, v));
      if (volume > 0) muted = false;
      if (master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02);
      save();
      return volume;
    },
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02);
      save();
      return muted;
    },
  };
})();
