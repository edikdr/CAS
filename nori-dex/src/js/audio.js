/* ==========================================================================
   Sounds, synthesized on the fly with WebAudio; there are no audio files.

   Character of the Mana Communicator:
   • stone   : dull thuds and scrapes (relics, the slot, the tray);
   • brass   : short inharmonic pings (buttons, studs, the conduit's collar);
   • crystal : chimes with a soft hall (selection, the attunement, the dialog);
   • mana hum: a low, slowly breathing drone while the device is on.
   Browsers allow sound only after a user gesture: input.js calls unlock() on the
   first pointer or key press, which creates (or resumes) the AudioContext. The
   context is suspended while the tab is hidden (pause()).
   API: unlock(), play(name, arg), hum(on), pause(hidden), isMuted(), toggleMute(),
        getVolume(), setVolume(v)
   ========================================================================== */
window.PL = window.PL || {};

PL.audio = (function () {
  var ctx = null, master = null, verb = null, verbIn = null, noiseBuf = null;
  var humNodes = null, humWanted = false;
  var muted = false, unlocked = false, hidden = false;
  var volume = 6; // 0..10

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem('nd-audio') || 'null');
      if (saved) { muted = !!saved.muted; volume = Math.max(0, Math.min(10, saved.volume | 0)); }
    } catch (e) { /* private mode: nothing is saved */ }
  }
  function save() {
    try { localStorage.setItem('nd-audio', JSON.stringify({ muted: muted, volume: volume })); } catch (e) {}
  }
  load();

  function masterLevel() { return muted ? 0 : Math.pow(volume / 10, 1.6) * 0.9; }

  /* a small stone hall: generated impulse response (decaying stereo noise) */
  function makeVerb() {
    var len = Math.floor(ctx.sampleRate * (PL.motion && PL.motion.low ? 0.7 : 1.6)), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb = ctx.createConvolver();
    verb.buffer = ir;
    verbIn = ctx.createGain();
    verbIn.gain.value = 0.32;
    verbIn.connect(verb).connect(master);
  }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = masterLevel();
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3;
      master.connect(comp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      makeVerb();
    }
    if (ctx.state === 'suspended' && !hidden) ctx.resume();
    return ctx;
  }

  /* ---------- voices ---------- */
  function env(g, t0, peak, dur, attack) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function tone(o) {
    var t0 = ctx.currentTime + (o.delay || 0), dur = o.t || 0.06;
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
    env(g, t0, o.g || 0.06, dur, o.a);
    osc.connect(g).connect(master);
    if (o.wet) g.connect(verbIn);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
  function noise(o) {
    var t0 = ctx.currentTime + (o.delay || 0), dur = o.t || 0.08;
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.fq || 3000, t0);
    if (o.fq2) f.frequency.exponentialRampToValueAtTime(o.fq2, t0 + dur);
    f.Q.value = o.q || 0.8;
    env(g, t0, o.g || 0.1, dur, o.a);
    src.connect(f).connect(g).connect(master);
    if (o.wet) g.connect(verbIn);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.03);
  }
  /* stone: a dull knock (filtered noise + a low body) */
  function stone(delay, g, low) {
    noise({ t: 0.06, filter: 'lowpass', fq: low ? 500 : 900, q: 0.7, g: g || 0.3, delay: delay });
    tone({ type: 'sine', f: low ? 70 : 110, f2: low ? 42 : 60, t: 0.12, g: (g || 0.3) * 0.8, delay: delay });
  }
  /* brass: a short inharmonic ping (ratio 2.76 gives the metallic colour) */
  function brass(f, delay, g, t) {
    tone({ type: 'triangle', f: f, t: t || 0.09, g: g || 0.05, delay: delay });
    tone({ type: 'sine', f: f * 2.76, t: (t || 0.09) * 0.7, g: (g || 0.05) * 0.5, delay: delay });
    noise({ t: 0.012, filter: 'highpass', fq: 3200, g: (g || 0.05) * 1.2, delay: delay });
  }
  /* crystal: a chime with slightly stretched partials into the hall */
  function chime(f, delay, g, t) {
    var P = [[1, 1], [2.01, 0.42], [3.02, 0.22], [4.17, 0.1]];
    P.forEach(function (p) { tone({ type: 'sine', f: f * p[0], t: (t || 0.9) / (0.6 + p[0] * 0.4), g: (g || 0.04) * p[1], delay: delay, wet: true, a: 0.004 }); });
  }

  var PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

  var sounds = {
    tick: function () { brass(2200, 0, 0.022, 0.03); },
    btndown: function () { brass(900, 0, 0.035, 0.05); stone(0, 0.08); },   // stud or gem goes down: brass click + dull stop
    btnup: function () { brass(1500, 0, 0.018, 0.035); },                    // spring return
    click: function () { brass(1200, 0, 0.03, 0.05); },
    select: function () { chime(1046.5, 0, 0.035, 0.5); chime(1567.98, 0.06, 0.03, 0.6); },
    back: function () { chime(1318.5, 0, 0.03, 0.45); chime(987.77, 0.06, 0.03, 0.5); },
    open: function () { [783.99, 1046.5, 1318.5].forEach(function (f, i) { chime(f, i * 0.05, 0.03, 0.6); }); },
    error: function () { tone({ type: 'triangle', f: 147, t: 0.16, g: 0.06 }); tone({ type: 'triangle', f: 155, t: 0.16, g: 0.05 }); },
    vol: function () { chime(1318.5, 0, 0.05, 0.3); },
    card: function () { noise({ t: 0.14, fq: 1400, fq2: 3800, q: 1, g: 0.05 }); },                 // parchment slide (dialog menu)
    shutter: function () { brass(1800, 0, 0.06, 0.04); brass(1300, 0.07, 0.05, 0.05); },
    swoosh: function () { noise({ t: 0.4, fq: 400, fq2: 2600, q: 0.9, g: 0.06 }); },
    sparkle: function () { chime(2093, 0, 0.025, 0.4); chime(2637, 0.05, 0.02, 0.4); },

    /* power */
    on: function () {                       // a stone heart knocks once, mana rises
      stone(0, 0.35, true);
      noise({ t: 0.9, fq: 220, fq2: 2400, q: 1.6, g: 0.05, delay: 0.05, wet: true });
      chime(523.25, 0.45, 0.03, 1.2);
    },
    off: function () {
      noise({ t: 0.6, fq: 2200, fq2: 200, q: 1.4, g: 0.06 });
      stone(0.35, 0.2, true);
    },
    tune: function () { noise({ t: 0.5, fq: 300, fq2: 4200, q: 2.2, g: 0.08, wet: true }); },
    boot: function () {                     // dawn: a low brass swell and three crystal notes
      tone({ type: 'triangle', f: 130.81, t: 1.6, g: 0.05, a: 0.4, wet: true });
      tone({ type: 'sine', f: 196, t: 1.6, g: 0.04, a: 0.5, wet: true });
      [783.99, 1046.5, 1567.98].forEach(function (f, i) { chime(f, 0.35 + i * 0.16, 0.035, 1.3); });
    },

    /* conduit */
    plug: function () { stone(0, 0.25); brass(700, 0.01, 0.07, 0.12); chime(1567.98, 0.14, 0.04, 0.8); },
    unplug: function () { brass(600, 0, 0.06, 0.1); noise({ t: 0.08, filter: 'highpass', fq: 2000, g: 0.1 }); },

    /* relics */
    lift: function () { noise({ t: 0.12, filter: 'lowpass', fq: 700, g: 0.12 }); chime(1174.66, 0.02, 0.02, 0.35); },
    slide: function () { noise({ t: 0.42, fq: 900, fq2: 500, q: 1.8, g: 0.09 }); },          // stone along the guide
    seat: function () { stone(0, 0.45, true); brass(520, 0.06, 0.08, 0.14); brass(1040, 0.1, 0.03, 0.1); },
    eject: function () { brass(380, 0, 0.07, 0.16); tone({ type: 'triangle', f: 260, f2: 520, t: 0.12, g: 0.04 }); stone(0.04, 0.18); },
    snap: function () { stone(0, 0.3); brass(800, 0.02, 0.05, 0.08); },

    /* attunement: rumble under the veins, a rising arpeggio as the runes light, a chord at the crest */
    attune: function (cd) {
      var chord = (cd && cd.chord) || [523.25, 659.25, 783.99, 1046.5, 1318.5];
      noise({ t: 1.1, filter: 'lowpass', fq: 160, fq2: 420, q: 0.8, g: 0.12, a: 0.25 });
      tone({ type: 'sine', f: chord[0] / 8, t: 1.4, g: 0.06, a: 0.3 });
      chord.forEach(function (f, i) { chime(f, 0.35 + i * 0.12, 0.04, 1.2); });
      chord.slice(0, 3).forEach(function (f) { chime(f * 2, 0.95, 0.025, 1.8); });
    },

    /* dialog kit */
    blip: function () { tone({ type: 'sine', f: PENTA[(Math.random() * PENTA.length) | 0] * 2, t: 0.03, g: 0.012 }); },
    qcursor: function () { chime(1567.98, 0, 0.018, 0.2); },
    qpick: function () { chime(1046.5, 0, 0.03, 0.4); chime(1567.98, 0.05, 0.025, 0.5); },
  };

  /* mana hum: two low sines and a soft triangle through a lowpass, breathing slowly */
  function startHum() {
    if (humNodes || !ensure()) return;
    var t = ctx.currentTime, out = ctx.createGain(), lp = ctx.createBiquadFilter();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.035, t + 1.4);
    lp.type = 'lowpass'; lp.frequency.value = 420;
    var oscs = [[55, 'sine', 0.6], [82.41, 'sine', 0.35], [110, 'triangle', 0.08]].map(function (o) {
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o[1]; osc.frequency.value = o[0]; g.gain.value = o[2];
      osc.connect(g).connect(lp);
      osc.start(t);
      return osc;
    });
    var lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.18; depth.gain.value = 0.012;
    lfo.connect(depth).connect(out.gain);
    lfo.start(t);
    lp.connect(out).connect(master);
    humNodes = { out: out, oscs: oscs.concat([lfo]) };
  }
  function stopHum() {
    if (!humNodes) return;
    var h = humNodes, t = ctx.currentTime;
    humNodes = null;
    h.out.gain.cancelScheduledValues(t);
    h.out.gain.setValueAtTime(Math.max(0.0001, h.out.gain.value), t);
    h.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    h.oscs.forEach(function (o) { o.stop(t + 0.7); });
  }

  function applyLevel() { if (master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02); }

  return {
    unlock: function () { unlocked = true; if (ensure() && humWanted) startHum(); },
    play: function (name, arg) {
      if (!unlocked || hidden || !ensure() || !sounds[name]) return;
      try { sounds[name](arg); } catch (e) {}
    },
    hum: function (on) {
      humWanted = !!on;
      if (!unlocked || !ensure()) return;    // starts after the first user gesture
      if (on) startHum(); else stopHum();
    },
    pause: function (h) {
      hidden = !!h;
      if (!ctx) return;
      if (hidden) ctx.suspend(); else if (unlocked) ctx.resume();
    },
    isMuted: function () { return muted; },
    getVolume: function () { return volume; },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(10, v));
      if (volume > 0) muted = false;
      applyLevel();
      save();
      return volume;
    },
    toggleMute: function () {
      muted = !muted;
      applyLevel();
      save();
      return muted;
    },
  };
})();
