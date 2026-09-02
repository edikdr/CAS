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
  let raf = 0;
  let last = 0;
  let scroll = 0;

  /* 0 = a dark section is behind the field, 1 = a paper one */
  let tone = 0;
  let toneTarget = 0;

  const rand = (min, max) => min + Math.random() * (max - min);

  function makeMote(kind) {
    const depth = rand(.25, 1);
    return {
      kind,
      x: Math.random(),
      y: Math.random(),
      depth,
      size: kind === 'star' ? rand(11, 34) * depth : kind === 'glow' ? rand(3, 9) : rand(.5, 1.7),
      drift: rand(-.4, -.06) * depth,          /* slow rise */
      sway: rand(.12, .5) * depth,
      swayPhase: rand(0, Math.PI * 2),
      spin: rand(-.08, .08),
      angle: rand(0, Math.PI * 2),
      twinkle: rand(.5, 1.7),
      twinklePhase: rand(0, Math.PI * 2),
      alpha: kind === 'star' ? rand(.20, .52) : kind === 'glow' ? rand(.05, .13) : rand(.18, .5)
    };
  }

  function populate() {
    const area = width * height;
    const dust = Math.round(Math.min(150, area / 12000));
    const glow = Math.round(Math.min(26, area / 68000));
    const stars = Math.round(Math.min(14, area / 130000));
    motes = [
      ...Array.from({ length: dust }, () => makeMote('dust')),
      ...Array.from({ length: glow }, () => makeMote('glow')),
      ...Array.from({ length: stars }, () => makeMote('star'))
    ];
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
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
    const parallax = (scroll * .045 * mote.depth) % (height + 220);
    const x = mote.x * width + Math.sin(time * mote.sway + mote.swayPhase) * 26 * mote.depth;
    let y = mote.y * height - parallax;
    y = ((y % (height + 220)) + height + 220) % (height + 220) - 110;

    const pulse = .62 + .38 * Math.sin(time * mote.twinkle + mote.twinklePhase);
    /* particles fade out across the tone change so the blend swap never pops */
    const contrast = Math.abs(tone - .5) * 2;
    const alpha = mote.alpha * pulse * (.3 + .7 * contrast);
    if (alpha <= .004) return;

    const shade = tone < .5 ? 255 : 18;
    ctx.globalAlpha = alpha;

    if (mote.kind === 'star' && spriteReady) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(mote.angle + time * mote.spin);
      const size = mote.size * (.94 + .12 * pulse);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size * (sprite.height / sprite.width));
      ctx.restore();
      return;
    }

    if (mote.kind === 'glow') {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, mote.size * 3.4);
      gradient.addColorStop(0, `rgba(${shade},${shade},${shade},.9)`);
      gradient.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, mote.size * 3.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.arc(x, y, mote.size, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const time = now / 1000;
    const step = Math.min(.05, (now - last) / 1000 || .016);
    last = now;

    tone += (toneTarget - tone) * Math.min(1, step * 3.2);
    const mode = tone < .5 ? 'screen' : 'multiply';
    if (canvas.dataset.mode !== mode) {
      canvas.dataset.mode = mode;
      canvas.style.mixBlendMode = mode;
    }

    ctx.clearRect(0, 0, width, height);
    motes.forEach(mote => {
      mote.y += mote.drift * step * .012;
      if (mote.y < -.12) mote.y = 1.1;
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
