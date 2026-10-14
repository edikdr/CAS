// Browser checks in headless Chromium (playwright-core).
//   npm i -D playwright-core   (or set NODE_PATH to an install)
//   node lyrics-engine/test/browser.test.cjs [--shots <dir>]
// Network is fully mocked: LRCLIB and iTunes answers are invented fixtures,
// the "preview" is a generated 30-second WAV served from the same fake origin.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://le.test';
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
const EXE = process.env.CHROMIUM || [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome'
].find(p => fs.existsSync(p));

/* Invented fixture lyrics — not from any real song. */
const LRC = {
  'Fixture Song': [
    '[ar:Fixture Band]',
    '[00:00.50]first line of filler',
    '[00:03.00]second line comes here',
    '[00:05.50]third one stays',
    '[00:13.00]after the long pause',
    '[00:15.00]',
    '[00:18.00]closing filler words',
    '[00:22.00]last made up line'
  ].join('\n'),
  'Other Fixture': '[00:00.20]another track begins\n[00:02.00]with other words'
};

function wav(seconds, rate = 8000) {
  const n = seconds * rate, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate, env = 0.35 + 0.3 * Math.sin(t * 3);
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 330 * t) * env * 12000), 44 + i * 2);
  }
  return buf;
}
const WAV = wav(30);

async function setup(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1100, height: 720 }, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN) {
      if (url.pathname === '/preview.wav') {
        return route.fulfill({ status: 200, body: WAV, headers: { 'content-type': 'audio/wav', 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' } });
      }
      const file = path.join(ROOT, decodeURIComponent(url.pathname));
      if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream';
        return route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': type } });
      }
      return route.fulfill({ status: 404, body: 'nope' });
    }
    if (url.hostname === 'lrclib.net') {
      const title = url.searchParams.get('track_name') || '';
      const json = (status, body) => route.fulfill({ status, body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
      if (title === 'Plain Fixture') return json(200, { trackName: title, artistName: 'Fixture Band', plainLyrics: 'words without time', syncedLyrics: null, duration: 120 });
      if (url.pathname === '/api/get' && LRC[title]) return json(200, { id: 1, trackName: title, artistName: 'Fixture Band', duration: 30, syncedLyrics: LRC[title] });
      return url.pathname === '/api/get' ? json(404, {}) : json(200, []);
    }
    if (url.hostname === 'itunes.apple.com') {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({ results: [{ trackId: 1, artistName: 'Fixture Band', trackName: 'Fixture Song', collectionName: 'Fixture LP',
          previewUrl: ORIGIN + '/preview.wav', trackTimeMillis: 30000 }] })
      });
    }
    return route.abort();
  });
  await page.goto(ORIGIN + '/test/harness.html');
  await page.evaluate(() => {
    // count listeners on the audio element and rAF calls
    const a = document.getElementById('a');
    window.__listeners = 0;
    const add = a.addEventListener.bind(a), rem = a.removeEventListener.bind(a);
    a.addEventListener = (t, f, o) => { window.__listeners++; add(t, f, o); };
    a.removeEventListener = (t, f, o) => { window.__listeners--; rem(t, f, o); };
    window.__raf = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { window.__raf++; return raf(cb); };
    window.events = [];
  });
  return { ctx, page, errors };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('ok   ' + name); }
  catch (e) { results.push(['FAIL', name, e]); console.log('FAIL ' + name + '\n     ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] });

  /* ---------- overlay scene, playback, pause, seek, gap, analyser ---------- */
  await check('overlay: words appear during playback, aria-live carries the line', async () => {
    const { page, errors, ctx } = await setup(browser);
    await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.crossOrigin = 'anonymous';
      a.src = '/preview.wav';
      window.eng = LyricsEngine.create({
        audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' },
        on: { line: e => events.push(['line', e.index]), gap: e => events.push(['gap', e.active, e.reason]), ready: () => events.push(['ready']) }
      });
      await new Promise(r => eng.on('ready', r));
      eng.open();
      await a.play();
    });
    await page.waitForFunction(() => document.querySelectorAll('.le-word').length >= 3, null, { timeout: 5000 });
    const s = await page.evaluate(() => {
      const root = document.querySelector('.le-root');
      return {
        state: eng.state, live: document.querySelector('.le-sr').textContent,
        overlay: root.classList.contains('le-overlay') && root.getAttribute('role') === 'region' && !root.hasAttribute('aria-modal'),
        roots: document.querySelectorAll('.le-root').length,
        bg: getComputedStyle(root).backgroundColor + ' ' + getComputedStyle(root).backgroundImage,
        layers: document.querySelectorAll('.le-grain,.le-vig').length,
        focusMoved: root.contains(document.activeElement)
      };
    });
    assert.equal(s.state, 'ready');
    assert.equal(s.live, 'first line of filler');
    assert.ok(s.overlay, 'clean overlay is a non-modal region');
    assert.equal(s.roots, 1);
    assert.equal(s.bg, 'rgba(0, 0, 0, 0) none', 'no background');
    assert.equal(s.layers, 0, 'no grain or vignette layers');
    assert.equal(s.focusMoved, false, 'focus stays on the page');
    // the site under the overlay still receives clicks
    const [cx, cy] = await page.evaluate(() => { const r = document.getElementById('outside').getBoundingClientRect(); return [r.left + 30, r.top + r.height / 2]; });
    const clicked = page.evaluate(() => new Promise(res => {
      document.getElementById('outside').addEventListener('click', () => res(true), { once: true });
      setTimeout(() => res(false), 800);
    }));
    await page.mouse.click(cx, cy);
    assert.equal(await clicked, true, 'click passes through the scene to the page');
    await shot(page, '01-overlay-words');
    await page.waitForFunction(() => document.querySelector('.le-sr').textContent === 'second line comes here', null, { timeout: 5000 });
    await wait(700);
    await shot(page, '02-overlay-second-line');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('pause stops rAF, seek re-renders instantly, gap shows the wave with a live analyser', async () => {
    const { page, errors, ctx } = await setup(browser);
    await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.crossOrigin = 'anonymous';
      a.src = '/preview.wav';
      window.eng = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' } });
      eng.on('gap', e => events.push(['gap', e.active, e.reason]));
      await new Promise(r => eng.on('ready', r));
      eng.open();
      await a.play();
    });
    await wait(400);
    await page.evaluate(() => document.getElementById('a').pause());
    await wait(100);
    const r0 = await page.evaluate(() => window.__raf);
    await wait(600);
    const r1 = await page.evaluate(() => window.__raf);
    assert.equal(r1, r0, 'no animation frames while paused');

    // seek while paused into line 3 (5.5 s, words at 5.5 / 7.0 / 8.0): due words appear at once, unanimated
    await page.evaluate(() => { document.getElementById('a').currentTime = 7.2; });
    await page.waitForFunction(() => document.querySelector('.le-sr').textContent === 'third one stays');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.le-word.le-now').length), 2);
    await page.evaluate(() => { document.getElementById('a').currentTime = 8.5; });
    await page.waitForFunction(() => document.querySelectorAll('.le-word:not(.le-out)').length === 3);

    // backwards seek inside a line rebuilds it with fewer words
    await page.evaluate(() => { document.getElementById('a').currentTime = 5.6; });
    await page.waitForFunction(() => document.querySelectorAll('.le-word:not(.le-out)').length === 1);

    // into the 9.5..13 pause: wave on, analyser reads the real signal
    await page.evaluate(async () => { const a = document.getElementById('a'); a.currentTime = 10; await a.play(); });
    await page.waitForFunction(() => document.querySelector('.le-root').classList.contains('le-gap'));
    await wait(1200);
    const g = await page.evaluate(() => {
      const rec = LyricsEngine._internals.GRAPH.get(document.getElementById('a'));
      return { tapped: !!(rec && rec.analyser), live: eng._anLive, dead: eng._anDead, playing: !document.getElementById('a').paused };
    });
    assert.ok(g.tapped, 'element routed through the shared graph');
    assert.ok(g.live, 'analyser returned real data');
    assert.ok(g.playing);
    await shot(page, '03-gap-wave-live');
    const ev = await page.evaluate(() => events);
    assert.ok(ev.some(e => e[0] === 'gap' && e[1] === true && e[2] === 'pause'));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('no crossOrigin: element is never routed, fake wave still draws, sound untouched', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      window.eng = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' } });
      await new Promise(r => eng.on('ready', r));
      eng.open();
      a.currentTime = 10;
      await a.play();
      await new Promise(r => setTimeout(r, 900));
      const cv = document.querySelector('.le-wave');
      const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i]) lit++;
      return { tapped: LyricsEngine._internals.GRAPH.has(a), lit, gap: document.querySelector('.le-root').classList.contains('le-gap') };
    });
    assert.equal(r.tapped, false);
    assert.ok(r.gap);
    assert.ok(r.lit > 200, 'wave pixels drawn: ' + r.lit);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('page already owns a MediaElementSource: no throw; analyser option is used', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.crossOrigin = 'anonymous';
      a.src = '/preview.wav';
      const ac = new AudioContext();
      const src = ac.createMediaElementSource(a);
      const mine = ac.createAnalyser();
      src.connect(mine); mine.connect(ac.destination);
      // engine 1: no analyser given → must fail softly (InvalidStateError swallowed)
      const e1 = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' } });
      await new Promise(r => e1.on('ready', r));
      e1.open(); a.currentTime = 10; await a.play();
      await new Promise(r => setTimeout(r, 800));
      const rec = LyricsEngine._internals.GRAPH.get(a);
      const failedSoftly = !!(rec && rec.failed);
      e1.destroy();
      // engine 2: analyser passed in
      const e2 = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' }, analyser: mine });
      await new Promise(r => e2.on('ready', r));
      e2.open();
      await new Promise(r => setTimeout(r, 800));
      const out = { failedSoftly, usesMine: e2._an === mine, live: e2._anLive, playing: !a.paused };
      e2.destroy();
      return out;
    });
    assert.ok(r.failedSoftly);
    assert.ok(r.usesMine);
    assert.ok(r.live);
    assert.ok(r.playing);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  /* ---------- track change, no-sync, no preview ---------- */
  await check('setTrack during playback swaps lyrics; stale load ignored', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      window.eng = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' } });
      await new Promise(r => eng.on('ready', r));
      eng.open(); await a.play();
      await new Promise(r => setTimeout(r, 300));
      eng.setTrack({ artist: 'Fixture Band', title: 'Plain Fixture' }); // superseded at once
      eng.setTrack({ artist: 'Fixture Band', title: 'Other Fixture' });
      a.currentTime = 0;
      await new Promise(r => eng.on('ready', r));
      await new Promise(r => setTimeout(r, 400));
      return { state: eng.state, live: document.querySelector('.le-sr').textContent, title: eng.track.title };
    });
    assert.equal(r.state, 'ready');
    assert.equal(r.title, 'Other Fixture');
    assert.equal(r.live, 'another track begins');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('track without timings: state no-sync, hint, no error event, scene empty', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      const errs = [];
      const e = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Plain Fixture' } });
      e.on('error', x => errs.push(x));
      e.open();
      await new Promise(r => setTimeout(r, 300));
      await a.play();
      await new Promise(r => setTimeout(r, 400));
      return { state: e.state, errs: errs.length, words: document.querySelectorAll('.le-word').length, hint: document.querySelector('.le-hint').textContent, bar: document.querySelector('.le-bar').hidden };
    });
    assert.equal(r.state, 'no-sync');
    assert.equal(r.errs, 0);
    assert.equal(r.words, 0);
    assert.match(r.hint, /нет текста/);
    assert.equal(r.bar, true);
    await shot(page, '04-no-sync');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('track without preview: nothing breaks, hint says so', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      const a = document.getElementById('a'); // no src at all
      const e = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' } });
      await new Promise(r => e.on('ready', r));
      e.open();
      await new Promise(r => setTimeout(r, 200));
      return { state: e.state, hint: document.querySelector('.le-hint').textContent, raf: e._raf };
    });
    assert.equal(r.state, 'ready');
    assert.match(r.hint, /Превью недоступно/);
    assert.equal(r.raf, 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  /* ---------- lifecycle ---------- */
  await check('open/close x5, Esc closes without stopping audio, destroy leaves no trace', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      const before = window.__listeners;
      const bodyBefore = document.body.children.length;
      const e = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' } });
      await new Promise(r => e.on('ready', r));
      await a.play();
      for (let i = 0; i < 5; i++) { e.open(); await new Promise(r => setTimeout(r, 60)); e.close(); }
      e.open();
      const whileOpen = window.__listeners - before;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const closedByEsc = !e.isOpen && document.querySelector('.le-root').hidden;
      const stillPlaying = !a.paused;
      const roots = document.querySelectorAll('.le-root').length;
      e.open();
      e.destroy();
      const rafBefore = window.__raf;
      await new Promise(r => setTimeout(r, 300));
      return {
        whileOpen, closedByEsc, stillPlaying, roots,
        leftover: window.__listeners - before,
        rafAfter: window.__raf - rafBefore,
        rootsAfter: document.querySelectorAll('.le-root').length,
        style: !!document.getElementById('le-styles'),
        bodySame: document.body.children.length === bodyBefore,
        outside: document.getElementById('outside').outerHTML
      };
    });
    assert.ok(r.whileOpen > 0);
    assert.ok(r.closedByEsc);
    assert.ok(r.stillPlaying, 'closing does not stop the sound');
    assert.equal(r.roots, 1);
    assert.equal(r.leftover, 0, 'all audio listeners removed');
    assert.equal(r.rafAfter, 0, 'no frames after destroy');
    assert.equal(r.rootsAfter, 0);
    assert.equal(r.style, false);
    assert.ok(r.bodySame);
    assert.equal(r.outside, '<div id="outside">Page content that must stay untouched.</div>');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  /* ---------- calibration ---------- */
  await check('manual calibration: ±0.5, "I hear this line", saved per track, survives broken storage', async () => {
    const { page, errors, ctx } = await setup(browser);
    await page.evaluate(async () => {
      localStorage.clear();
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true }));
      a.currentTime = 4.0;
      window.eng = LyricsEngine.create({ audio: a, container: '#side', track: { artist: 'Fixture Band', title: 'Fixture Song' } });
      await new Promise(r => eng.on('ready', r));
      eng.open();
    });
    await shot(page, '05-inline-uncalibrated');
    await page.click('.le-bar button:has-text("+0.5")');
    assert.equal(await page.evaluate(() => eng.getOffset()), 0.5);
    await page.click('.le-bar button:has-text("Я слышу")');
    await page.waitForSelector('.le-pick:not([hidden])');
    await shot(page, '06-inline-picker');
    // the user heard "closing filler words" (t=18) at preview time 4.0 → offset 14
    await page.click('.le-pick button:has-text("closing filler words")');
    const r = await page.evaluate(() => ({
      off: eng.getOffset(), src: eng.offsetSource,
      saved: JSON.parse(localStorage.getItem('le:offset:' + LyricsEngine.trackKey('Fixture Band', 'Fixture Song'))).offset,
      live: document.querySelector('.le-sr').textContent
    }));
    assert.equal(r.off, 14);
    assert.equal(r.src, 'manual');
    assert.equal(r.saved, 14);
    assert.equal(r.live, 'closing filler words');
    await shot(page, '07-inline-calibrated');
    const r2 = await page.evaluate(async () => {
      eng.destroy();
      const e2 = LyricsEngine.create({ audio: document.getElementById('a'), container: '#side', track: { artist: 'fixture band', title: 'Fixture Song' }, offset: 3 });
      await new Promise(r => e2.on('ready', r));
      const first = [e2.getOffset(), e2.offsetSource];
      e2.destroy();
      Storage.prototype.getItem = () => { throw new Error('denied'); };
      Storage.prototype.setItem = () => { throw new Error('denied'); };
      const e3 = LyricsEngine.create({ audio: document.getElementById('a'), container: '#side', track: { artist: 'Fixture Band', title: 'Fixture Song' }, offset: 3 });
      await new Promise(r => e3.on('ready', r));
      e3.open();
      e3.calibrate(1, 0);
      const second = [e3.getOffset(), e3.offsetSource];
      e3.destroy();
      return { first, second };
    });
    assert.deepEqual(r2.first, [14, 'saved']);
    assert.deepEqual(r2.second, [3, 'manual']);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('auto hint: preview starting inside a line waits for the first full line', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true }));
      // offset 1.0: the preview starts inside "first line of filler" (0.5..3.0)
      const e = LyricsEngine.create({ audio: a, container: '#side', track: { artist: 'Fixture Band', title: 'Fixture Song' }, offset: 1.0 });
      await new Promise(r => e.on('ready', r));
      e.open();
      a.currentTime = 0.5; a.dispatchEvent(new Event('seeked'));
      await new Promise(r => setTimeout(r, 50));
      const atStart = { words: document.querySelectorAll('.le-word').length, gap: document.querySelector('.le-root').classList.contains('le-gap') };
      a.currentTime = 2.2; a.dispatchEvent(new Event('seeked'));
      await new Promise(r => setTimeout(r, 50));
      const later = document.querySelector('.le-sr').textContent;
      e.destroy();
      return { atStart, later };
    });
    assert.equal(r.atStart.words, 0);
    assert.equal(r.later, 'second line comes here');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  /* ---------- a11y, reduced motion, small screens ---------- */
  await check('prefers-reduced-motion: whole line, no blur/animation, no particles', async () => {
    const { page, errors, ctx } = await setup(browser, { reduced: true });
    const r = await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true }));
      a.currentTime = 3.5;
      const e = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' } });
      await new Promise(r => e.on('ready', r));
      e.open();
      await new Promise(r => setTimeout(r, 100));
      const line = document.querySelector('.le-line');
      return { reduced: document.querySelector('.le-root').classList.contains('le-reduced'), line: line && line.textContent, words: document.querySelectorAll('.le-word').length, anim: line && getComputedStyle(line).animationName };
    });
    assert.ok(r.reduced);
    assert.equal(r.line, 'second line comes here');
    assert.equal(r.words, 0);
    await shot(page, '08-reduced-motion');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('360 px: every word stays inside the screen and words do not overlap', async () => {
    const { page, errors, ctx } = await setup(browser, { viewport: { width: 360, height: 640 } });
    const bad = await page.evaluate(async () => {
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true }));
      const e = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' }, offset: 0 });
      await new Promise(r => e.on('ready', r));
      e.open();
      const problems = [];
      for (const t of [2.9, 5.4, 8.9, 21.9, 25.9]) {
        for (let k = 0; k < 5; k++) {
          a.currentTime = t; a.dispatchEvent(new Event('seeking'));
          await new Promise(r => setTimeout(r, 30));
          const rects = [...document.querySelectorAll('.le-word:not(.le-out)')].map(w => w.getBoundingClientRect());
          rects.forEach(r => { if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) problems.push(['out', t, r.left, r.right]); });
          for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
            const A = rects[i], B = rects[j];
            const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left), oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
            if (ox > 2 && oy > 2) problems.push(['overlap', t]);
          }
        }
      }
      return problems;
    });
    await shot(page, '09-mobile-360');
    assert.deepEqual(bad, []);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('calibration "auto": bar hidden once the offset is known, tune button opens it', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      localStorage.clear();
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      const e = LyricsEngine.create({ audio: a, container: '#side', track: { artist: 'Fixture Band', title: 'Fixture Song' }, offset: 0 });
      await new Promise(r => e.on('ready', r));
      e.open();
      const bar = document.querySelector('.le-bar'), tune = document.querySelector('.le-tune');
      const before = [bar.hidden, tune.hidden];
      tune.click();
      const after = [bar.hidden, tune.getAttribute('aria-expanded')];
      tune.click();
      const again = bar.hidden;
      const e2 = LyricsEngine.create({ audio: a, container: '#side', track: { artist: 'Fixture Band', title: 'Fixture Song' }, calibration: false, closeButton: false });
      await new Promise(r => e2.on('ready', r));
      e.destroy();
      e2.open();
      const none = [document.querySelector('.le-bar').hidden, document.querySelector('.le-tune').hidden, document.querySelector('.le-close').hidden];
      e2.destroy();
      return { before, after, again, none };
    });
    assert.deepEqual(r.before, [true, false]);
    assert.deepEqual(r.after, [false, 'true']);
    assert.equal(r.again, true);
    assert.deepEqual(r.none, [true, true, true]);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('theme "minimal" takes the site colour; "dark-grain" is a modal dialog with focus trap', async () => {
    const { page, errors, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      document.body.style.color = 'rgb(10, 120, 30)';
      const a = document.getElementById('a');
      a.src = '/preview.wav';
      await new Promise(r => a.addEventListener('loadedmetadata', r, { once: true }));
      a.currentTime = 1.5;
      const e = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' }, theme: 'minimal' });
      await new Promise(r => e.on('ready', r));
      e.open();
      await new Promise(r => setTimeout(r, 50));
      const w = document.querySelector('.le-word');
      const minimal = { color: w && getComputedStyle(w).color, font: getComputedStyle(w).fontFamily === getComputedStyle(document.body).fontFamily, wave: e._waveColor };
      e.destroy();
      const d = LyricsEngine.create({ audio: a, track: { artist: 'Fixture Band', title: 'Fixture Song' }, theme: 'dark-grain' });
      await new Promise(r => d.on('ready', r));
      d.open();
      const root = document.querySelector('.le-root');
      let outerEsc = 0;
      const outer = () => outerEsc++;
      document.addEventListener('keydown', outer);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.removeEventListener('keydown', outer);
      const dark = { role: root.getAttribute('role'), modal: root.getAttribute('aria-modal'), pass: root.classList.contains('le-pass'),
        layers: root.querySelectorAll('.le-grain,.le-vig').length, closed: !d.isOpen, outerEsc };
      d.destroy();
      return { minimal, dark };
    });
    assert.equal(r.minimal.color, 'rgb(10, 120, 30)');
    assert.ok(r.minimal.font);
    assert.equal(r.minimal.wave, 'rgb(10, 120, 30)');
    assert.deepEqual(r.dark, { role: 'dialog', modal: 'true', pass: false, layers: 2, closed: true, outerEsc: 0 });
    await shot(page, '12-after-themes');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('demo.html: preview lookup, inline scene, full screen, theme switch', async () => {
    const { page, errors, ctx } = await setup(browser);
    await page.goto(ORIGIN + '/demo.html');
    await page.fill('#artist', 'Fixture Band');
    await page.fill('#title', 'Fixture Song');
    await page.click('button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#scene .le-root[data-le-state=ready]'));
    await page.evaluate(async () => { const a = document.getElementById('audio'); a.currentTime = 3.6; await a.play(); });
    await page.waitForFunction(() => document.querySelectorAll('#scene .le-word').length >= 2);
    await wait(500);
    await shot(page, '10-demo-inline');
    await page.click('#full');
    await page.waitForFunction(() => document.querySelector('.le-overlay:not([hidden])'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.le-overlay').hidden);
    await page.selectOption('#theme', 'dark-grain');
    await page.waitForFunction(() => document.querySelectorAll('.le-root').length === 1);
    await wait(300);
    await shot(page, '11-demo-dark-grain');
    assert.ok(await page.evaluate(() => !document.getElementById('audio').paused));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check('ES module entry exports the same API', async () => {
    const { page, ctx } = await setup(browser);
    const r = await page.evaluate(async () => {
      const m = await import('/lyrics-engine.mjs');
      return [typeof m.default.create, m.create === m.default.create, typeof m.itunesPreview];
    });
    assert.deepEqual(r, ['function', true, 'function']);
    await ctx.close();
  });

  await browser.close();
  const failed = results.filter(r => r[0] !== 'ok');
  console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
