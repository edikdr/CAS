/* ---------------------------------------------------------------------------
   PARTICLES — the drifting field behind the whole archive.

   One fixed canvas carries three kinds of mote: fine dust, soft glow, and the
   star cut out of the overlay clip. The field knows whether a dark or a paper
   section is currently behind it and re-tones itself, so the same particles
   read as light on black and as ink on paper.
--------------------------------------------------------------------------- */

const Particles = (() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let motes = [];
  let sprite = null;
  let spriteReady = false;
  let glowLight = null;   /* pre-rendered glow, white */
  let glowDark = null;    /* pre-rendered glow, ink */

  const GLOW_R = 48;
  function bakeGlow(shade) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = GLOW_R * 2;
    const g = canvas.getContext('2d');
    const grad = g.createRadialGradient(GLOW_R, GLOW_R, 0, GLOW_R, GLOW_R, GLOW_R);
    grad.addColorStop(0, `rgba(${shade},${shade},${shade},.9)`);
    grad.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, GLOW_R * 2, GLOW_R * 2);
    return canvas;
  }
  let raf = 0;
  let last = 0;
  let scroll = 0;

  /* 0 = a dark section is behind the field, 1 = a paper one */
  let tone = 0;
  let toneTarget = 0;

  const rand = (min, max) => min + Math.random() * (max - min);

  function makeMote(kind) {
    const depth = rand(.25, 1);
    const streak = kind === 'dust' && Math.random() < .09;
    return {
      kind,
      streak,
      x: Math.random(),
      y: Math.random(),
      depth,
      size: kind === 'star' ? rand(11, 34) * depth : kind === 'glow' ? rand(3, 9) : rand(.5, 1.9),
      /* rise, with the occasional mote that actually travels */
      drift: (streak ? rand(-3.4, -1.6) : rand(-1.15, -.22)) * depth,
      side: rand(-.5, .5) * depth,
      sway: rand(.35, 1.25) * depth,
      swayReach: rand(18, 62) * depth,
      swayPhase: rand(0, Math.PI * 2),
      /* a slow orbit on top of the sway, so paths never look like sine waves */
      orbit: rand(.18, .62),
      orbitR: rand(4, 19) * depth,
      orbitPhase: rand(0, Math.PI * 2),
      spin: rand(-.5, .5),
      angle: rand(0, Math.PI * 2),
      twinkle: rand(.9, 3.1),
      twinklePhase: rand(0, Math.PI * 2),
      alpha: kind === 'star' ? rand(.22, .58) : kind === 'glow' ? rand(.06, .16) : rand(.2, .58)
    };
  }

  function populate() {
    const area = width * height;
    const dust = Math.round(Math.min(210, area / 8600));
    const glow = Math.round(Math.min(34, area / 52000));
    const stars = Math.round(Math.min(20, area / 92000));
    motes = [
      ...Array.from({ length: dust }, () => makeMote('dust')),
      ...Array.from({ length: glow }, () => makeMote('glow')),
      ...Array.from({ length: stars }, () => makeMote('star'))
    ];
  }

  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!motes.length) populate();
  }

  /* which tone is behind the middle of the viewport */
  function watchTone() {
    const sections = [...document.querySelectorAll('[data-tone]')];
    if (!sections.length) return;
    const pick = () => {
      const mid = window.innerHeight / 2;
      let best = null;
      let bestGap = Infinity;
      sections.forEach(section => {
        const box = section.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) return;
        const gap = Math.abs((box.top + box.bottom) / 2 - mid);
        if (gap < bestGap) { bestGap = gap; best = section; }
      });
      if (best) toneTarget = best.dataset.tone === 'paper' ? 1 : 0;
    };
    pick();
    window.addEventListener('scroll', () => { scroll = window.scrollY; pick(); }, { passive: true });
    window.addEventListener('resize', pick);
  }

  function paintMote(mote, time) {
    const parallax = (scroll * .07 * mote.depth) % (height + 220);
    const x = mote.x * width
      + Math.sin(time * mote.sway + mote.swayPhase) * mote.swayReach
      + Math.cos(time * mote.orbit + mote.orbitPhase) * mote.orbitR;
    let y = mote.y * height - parallax
      + Math.sin(time * mote.orbit * 1.3 + mote.orbitPhase) * mote.orbitR * .6;
    y = ((y % (height + 220)) + height + 220) % (height + 220) - 110;

    if (x < -60 || x > width + 60) return;

    const pulse = .5 + .5 * Math.sin(time * mote.twinkle + mote.twinklePhase);
    /* particles fade out across the tone change so the blend swap never pops */
    const contrast = Math.abs(tone - .5) * 2;
    const alpha = mote.alpha * pulse * (.3 + .7 * contrast);
    if (alpha <= .004) return;

    const shade = tone < .5 ? 255 : 18;
    ctx.globalAlpha = alpha;

    if (mote.kind === 'star' && spriteReady) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(mote.angle);
      const size = mote.size * (.94 + .12 * pulse);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size * (sprite.height / sprite.width));
      ctx.restore();
      return;
    }

    if (mote.kind === 'glow') {
      const glow = shade > 128 ? glowLight : glowDark;
      if (!glow) return;
      const r = mote.size * 3.4;
      ctx.drawImage(glow, x - r, y - r, r * 2, r * 2);
      return;
    }

    if (mote.streak) {
      const tail = Math.min(34, Math.abs(mote.drift) * 13);
      const trail = ctx.createLinearGradient(x, y, x, y + tail);
      trail.addColorStop(0, `rgba(${shade},${shade},${shade},.85)`);
      trail.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      ctx.strokeStyle = trail;
      ctx.lineWidth = mote.size * 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + tail);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.arc(x, y, mote.size, 0, Math.PI * 2);
    ctx.fill();
  }

  let skip = false;
  let lastCost = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const time = now / 1000;
    const step = Math.min(.05, (now - last) / 1000 || .016);
    const delta = now - last;
    last = now;

    /* Under load the field drops to every other frame. Motes drift slowly
       enough that this is invisible, and it halves the fill cost exactly when
       the page can least afford it. */
    if (delta > 26 && !skip) { skip = true; return; }
    skip = false;

    /* nothing to draw behind an open modal */
    if (document.body.classList.contains('modal-open')) {
      if (!lastCost) { ctx.clearRect(0, 0, width, height); lastCost = 1; }
      return;
    }
    lastCost = 0;

    tone += (toneTarget - tone) * Math.min(1, step * 3.2);
    const mode = tone < .5 ? 'screen' : 'multiply';
    if (canvas.dataset.mode !== mode) {
      canvas.dataset.mode = mode;
      canvas.style.mixBlendMode = mode;
    }

    ctx.clearRect(0, 0, width, height);
    motes.forEach(mote => {
      mote.y += mote.drift * step * .055;
      mote.x += mote.side * step * .012;
      if (mote.y < -.14) { mote.y = 1.12; mote.x = Math.random(); }
      if (mote.x < -.06) mote.x = 1.04;
      else if (mote.x > 1.06) mote.x = -.04;
      mote.angle += mote.spin * step;
      paintMote(mote, time);
    });
    ctx.globalAlpha = 1;
  }

  function paintOnce() {
    ctx.clearRect(0, 0, width, height);
    canvas.style.mixBlendMode = 'screen';
    motes.forEach(mote => paintMote(mote, 0));
    ctx.globalAlpha = 1;
  }

  function start() { if (!raf && !reduced.matches) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function build() {
    canvas = document.getElementById('particleField');
    if (!canvas || !canvas.getContext) return;
    ctx = canvas.getContext('2d');
    glowLight = bakeGlow(255);
    glowDark = bakeGlow(18);
    resize();
    watchTone();
    scroll = window.scrollY;

    const source = canvas.dataset.star;
    if (source) {
      sprite = new Image();
      sprite.decoding = 'async';
      sprite.addEventListener('load', () => { spriteReady = true; });
      sprite.src = source;
    }

    window.addEventListener('resize', () => { resize(); if (reduced.matches) paintOnce(); });
    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });

    if (reduced.matches) paintOnce();
    else start();
  }

  return { build, start, stop };
})();
