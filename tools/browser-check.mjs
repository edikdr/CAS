/*
 * tools/browser-check.mjs - end-to-end checks in a real browser (Chromium via Playwright).
 *
 *   node tools/browser-check.mjs [--only load,lights,modal,lyrics,gl,resilience]
 *
 * Needs `playwright` (not a project dependency: `npm i -D playwright` or link a global install
 * into node_modules/) and ffmpeg. Playwright's Chromium has no AAC decoder, so local previews are
 * served as an Opus transcode of the same clip (.tmp/opus/, made on first use).
 * Starts its own dev servers (source tree and a fresh private build). Never prints lyric text.
 *
 * Sections:
 *  load   mobile: no third-party request, no failed request, no lyrics engine / Three.js / GLB on
 *         load, idle CPU, DOM guitar mode and all its layer images, transfer size
 *  lights wall switch: Off turns the garland dark and leaves the room 25% of its light, state is
 *         announced (aria-pressed) and survives a reload (set before first paint); idle CPU dimmed;
 *         the click sounds load after ready and decode
 *  modal  dialog semantics: focus inside, Tab stays inside, Esc closes and restores focus, Back
 *         closes the top modal only, stacked modals, audio stops on close, no layout shift
 *  lyrics permission none / missing -> no text and no engine; fixture line timing vs audio;
 *         dissolve; word-by-word wipe; reduced motion = no transforms
 *  gl     desktop: WebGL guitar loads the GLB, no 3D toggle; mobile never requests Three.js or the GLB
 *  resilience  a throwing Stage 2 entry, reduced motion (no breathing/sway/flicker), blocked localStorage, no WebGL on a
 *         desktop, network lost after load (switch works, preview fails gracefully), slow 3G first
 *         load (scene paints before data; numbers printed)
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { build } from './build.mjs';
import { ROOT } from './lib.mjs';

let pw;
try { pw = await import('playwright'); } catch {
  console.error('browser-check needs playwright (npm i -D playwright, or link a global install into node_modules/)');
  process.exit(2);
}
const { chromium, devices } = pw;
const only = (process.argv[process.argv.indexOf('--only') + 1] || '').split(',').filter(Boolean);
const want = (s) => process.argv.includes('--only') ? only.includes(s) : true;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function serve(dir, port) {
  const child = spawn(process.execPath, ['tools/dev-server.mjs', '--dir', dir, '--port', String(port)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return child; } catch { await sleep(100); }
  }
  throw new Error(`dev server on ${port} did not start`);
}

function opus(rel) {
  const out = path.join(ROOT, '.tmp/opus', rel.replace(/[^\w.-]+/g, '_') + '.ogg');
  if (!existsSync(out)) {
    mkdirSync(path.dirname(out), { recursive: true });
    const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(ROOT, 'assets/previews-local', rel), '-c:a', 'libopus', '-b:a', '96k', out]);
    if (r.status !== 0) throw new Error(`ffmpeg failed for ${rel}`);
  }
  return out;
}

/** Local previews (and any Apple preview) are answered with an Opus copy of the clip. */
async function routeAudio(page, fallback = 'Fantasy Prologue/01 - The Shallow End.m4a') {
  await page.route(/\.m4a(\?|$)/, (route) => {
    const url = new URL(route.request().url());
    const local = decodeURIComponent(url.pathname).split('/assets/previews-local/')[1];
    route.fulfill({ path: opus(local || fallback), contentType: 'audio/ogg' });
  });
}

const ready = (page) => page.waitForFunction(() => ['ready', 'error'].includes(document.documentElement.dataset.state));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
const distDir = path.join(ROOT, '.tmp/check-dist');
await build({ out: distDir });
const dist = await serve(distDir, 8301);
const src = await serve(ROOT, 8302);
const DIST = 'http://127.0.0.1:8301/';
const SRC = 'http://127.0.0.1:8302/';

try {
  if (want('load')) {
    const ctx = await browser.newContext(devices['Pixel 7']);
    const page = await ctx.newPage();
    const reqs = [];
    page.on('request', (r) => reqs.push(r.url()));
    const failed = [];
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    let bytes = 0;
    page.on('requestfinished', async (r) => { const s = await r.sizes(); bytes += s.responseBodySize + s.responseHeadersSize; });
    await page.goto(DIST, { waitUntil: 'networkidle' });
    await ready(page);
    check('load: boot reaches ready', await page.evaluate(() => document.documentElement.dataset.state === 'ready'));
    const third = reqs.filter((u) => !u.startsWith(DIST) && !u.startsWith('data:'));
    check('load: no third-party request', third.length === 0, third.join(', '));
    check('load: no lyrics engine, Three.js or GLB requested', !reqs.some((u) => /lyrics-engine|vendor\/three|\.glb/.test(u)));
    check('load: phone gets the DOM guitar', await page.evaluate(() => !!document.querySelector('.guitar')));
    const layers = await page.evaluate(() => Promise.all([...document.querySelectorAll('.guitar__layer')].map((img) => img.decode().then(() => img.naturalWidth > 0, () => false))));
    check('load: every guitar layer image loads (built names resolve)', layers.length === 5 && layers.every(Boolean), `${layers.filter(Boolean).length}/${layers.length}`);
    check('load: no failed request (4xx/5xx)', failed.length === 0, failed.join(', '));
    check('load: the Stage 2 entry (features/main.js) is loaded', reqs.some((u) => u.endsWith('/features/main.js')));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    await sleep(800);
    const a = await m();
    await sleep(5000);
    const b = await m();
    const busy = ((b.TaskDuration - a.TaskDuration) / 5) * 100;
    check('load: idle main thread < 1 %', busy < 1, `${busy.toFixed(2)} % over 5 s`);
    console.log(`     transferred ${(bytes / 1024).toFixed(1)} KB in ${reqs.length} requests (uncompressed dev server)`);
    await ctx.close();
  }

  if (want('lights')) {
    const ctx = await browser.newContext(devices['Pixel 7']);
    await ctx.addInitScript(() => {
      new MutationObserver(() => {
        if (document.documentElement.dataset.state === 'ready') window.__readyAt ??= performance.now();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-state'] });
    });
    const page = await ctx.newPage();
    await page.goto(`${DIST}?debug`);
    await ready(page);
    await sleep(4500);
    const timing = await page.evaluate(() => ({
      readyAt: window.__readyAt,
      sfx: performance.getEntriesByType('resource').filter((e) => /\/sfx\/switch-(on|off)\.\w+\.mp3$/.test(e.name)).map((e) => ({ url: e.name, at: e.startTime })),
    }));
    const early = timing.sfx.filter((e) => e.at < timing.readyAt).length;
    check('lights: switch clicks load after the page is ready and decode', timing.sfx.length === 2 && early === 0 && await page.evaluate(async (urls) => {
      const audio = new OfflineAudioContext(1, 44100, 44100);
      for (const u of urls) {
        const b = await audio.decodeAudioData(await (await fetch(u)).arrayBuffer());
        if (b.duration < 0.2 || b.duration > 0.5) return false;
      }
      return true;
    }, timing.sfx.map((e) => e.url)), `${timing.sfx.length} files, ${early} before ready`);
    const look = () => page.evaluate(() => {
      const op = (sel, pseudo) => Number(getComputedStyle(document.querySelector(sel), pseudo).opacity);
      return {
        lights: document.documentElement.dataset.lights || 'on',
        level: window.sunniva.LightRig.level,
        pressed: [...document.querySelectorAll('#light-switch button')].map((b) => b.getAttribute('aria-pressed')).join(),
        shade: op('#glow', '::before'), bloom: op('.glow__bloom'), stars: op('.glow__stars'), wall: op('.garland__light'),
      };
    });
    const on = await look();
    check('lights: on at load, the On button is pressed, no shade', on.lights === 'on' && on.level === 1 && on.pressed === 'true,false' && on.shade === 0 && on.bloom === 1 && on.stars === 1 && on.wall === 1, JSON.stringify(on));
    await page.click('#light-switch .wall-switch__button--off');
    await sleep(700);
    const off = await look();
    check('lights: Off = garland dark, room at 25% of its light (sRGB 0.53), Off is pressed', off.lights === 'off' && off.level === 0.25 && off.pressed === 'false,true' && Math.abs(off.shade - 0.47) < 0.01 && off.bloom === 0 && off.stars === 0 && off.wall === 0, JSON.stringify(off));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'TaskDuration').value;
    const t0 = await task();
    await sleep(3000);
    const busy = ((await task()) - t0) / 3 * 100;
    check('lights: idle main thread with the lights down < 1 %', busy < 1, `${busy.toFixed(2)} % over 3 s`);
    await page.reload();
    await ready(page);
    const kept = await look();
    check('lights: Off survives a reload', kept.lights === 'off' && kept.pressed === 'false,true' && Math.abs(kept.shade - 0.47) < 0.01, JSON.stringify(kept));
    await page.keyboard.press('Tab');
    await page.focus('#light-switch .wall-switch__button--on');
    await page.keyboard.press('Enter');
    await sleep(500);
    const back = await look();
    check('lights: the On button works from the keyboard', back.lights === 'on' && back.pressed === 'true,false' && back.shade === 0, JSON.stringify(back));
    await ctx.close();
  }

  if (want('modal')) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await routeAudio(page);
    await page.goto(`${DIST}?debug`);
    await ready(page);
    let shift = 0;
    await page.exposeFunction('reportShift', (v) => { shift += v; });
    await page.evaluate(() => {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.reportShift(e.value))).observe({ type: 'layout-shift' });
      const b = Object.assign(document.createElement('button'), { id: 'opener', textContent: 'open' });
      b.addEventListener('click', () => window.sunniva.ModalManager.open('track', { id: 6808001979 }));
      document.querySelector('#scene-controls').append(b);
      window.sunniva.ModalManager.register('about', {
        render(body, _p, api) {
          api.setTitle('About');
          const t = Object.assign(document.createElement('button'), { id: 'to-track', textContent: 'track' });
          t.addEventListener('click', () => window.sunniva.ModalManager.open('track', { id: 6808001984 }));
          body.append(t);
        },
      });
    });
    const inDialog = () => page.evaluate(() => !!document.activeElement?.closest('dialog[open]'));
    // a modal dialog may hand focus to the browser UI (activeElement = body), never to the page
    const notOnPage = () => page.evaluate(() => !!document.activeElement?.closest('dialog[open]') || document.activeElement === document.body);
    const dialogs = () => page.evaluate(() => document.querySelectorAll('dialog[open]').length);
    const url0 = page.url();

    await page.click('#opener');
    check('modal: track dialog opens with focus inside', (await dialogs()) === 1 && (await inDialog()));
    let inside = true;
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); inside &&= await notOnPage(); }
    check('modal: Tab never reaches the page behind (background inert)', inside);
    await page.keyboard.press('Escape');
    await sleep(100);
    check('modal: Esc closes', (await dialogs()) === 0);
    check('modal: focus returns to the opener', await page.evaluate(() => document.activeElement?.id === 'opener'));

    await page.click('#opener');
    await page.click('.track__play');
    await page.waitForFunction(() => window.sunniva.PreviewPlayer.isPlaying(), null, { timeout: 5000 }).catch(() => {});
    const played = await page.evaluate(() => window.sunniva.PreviewPlayer.isPlaying());
    await page.goBack();
    await sleep(200);
    check('modal: phone Back closes the dialog and stays on the page', (await dialogs()) === 0 && page.url() === url0);
    check('modal: audio stops on close', played && (await page.evaluate(() => !window.sunniva.PreviewPlayer.isPlaying())), `was playing: ${played}`);

    await page.evaluate(() => window.sunniva.ModalManager.open('about'));
    await page.click('#to-track');
    const stacked = await dialogs();
    await page.goBack();
    await sleep(150);
    const afterOne = await page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map((d) => d.className));
    await page.keyboard.press('Escape');
    await sleep(150);
    check('modal: stacked modals close top-first (Back, then Esc)', stacked === 2 && afterOne.length === 1 && /modal--about/.test(afterOne[0]) && (await dialogs()) === 0);
    check('modal: no layout shift from opening/closing', shift < 0.001, `CLS ${shift.toFixed(4)}`);
    await ctx.close();
  }

  if (want('lyrics')) {
    const lyricsFile = (id) => path.join(ROOT, `data/lyrics/${id}.json`);
    const tmpNone = 6808001984;
    const created = !existsSync(lyricsFile(tmpNone));
    if (created) spawnSync(process.execPath, ['tools/make-lyric-fixture.mjs', String(tmpNone), '--permission', 'none'], { cwd: ROOT });
    const fixtureId = 6808001987;
    if (!existsSync(lyricsFile(fixtureId))) spawnSync(process.execPath, ['tools/make-lyric-fixture.mjs', String(fixtureId)], { cwd: ROOT });
    try {
      for (const [label, id] of [['permission none', tmpNone], ['no lyrics file', 6808001992]]) {
        const ctx = await browser.newContext(devices['Pixel 7']);
        const page = await ctx.newPage();
        const reqs = [];
        page.on('request', (r) => reqs.push(r.url()));
        await page.goto(`${SRC}?track=${id}`);
        await ready(page);
        await page.waitForSelector('.track__note:not([hidden])', { timeout: 5000 }).catch(() => {});
        const state = await page.evaluate(() => ({
          note: !document.querySelector('.track__note').hidden,
          lines: document.querySelectorAll('.lyric__line').length,
          la: /\b(la|da|na) (la|da|na)\b/.test(document.body.innerText + document.body.textContent),
        }));
        check(`lyrics: ${label} -> note shown, no lyric text in the DOM`, state.note && state.lines === 0 && !state.la);
        check(`lyrics: ${label} -> engine never downloaded`, !reqs.some((u) => u.includes('lyrics-engine')));
        await ctx.close();
      }

      const fixture = JSON.parse(readFileSync(lyricsFile(fixtureId), 'utf8'));
      for (const reduced of [false, true]) {
        const ctx = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: reduced ? 'reduce' : 'no-preference' });
        const page = await ctx.newPage();
        await routeAudio(page);
        await page.goto(`${SRC}?local&debug&track=${fixtureId}`);
        await ready(page);
        await page.waitForSelector('.track__lyrics .lyric', { timeout: 8000 });
        await page.evaluate(() => {
          window.__lines = [];
          const player = window.sunniva.PreviewPlayer;
          new MutationObserver((muts) => muts.forEach((mu) => {
            mu.addedNodes.forEach((n) => { if (n.classList?.contains('lyric__line')) window.__lines.push({ at: player.currentTime(), kind: 'in' }); });
            mu.removedNodes.forEach((n) => { if (n.classList?.contains('lyric__line')) window.__lines.push({ at: player.currentTime(), kind: 'out' }); });
          })).observe(document.querySelector('.track__lyrics .lyric'), { childList: true });
        });
        await page.click('.track__play');
        await page.waitForFunction(() => window.sunniva.PreviewPlayer.currentTime() > 0.2, null, { timeout: 8000 });
        // mid-line: first word revealed, last word not yet (motion) / whole line visible (reduced)
        const second = fixture.lines[1];
        await page.waitForFunction((t) => window.sunniva.PreviewPlayer.currentTime() >= t, second.words[1].t + 0.05, { timeout: 15000 });
        const wipe = await page.evaluate(() => {
          const clips = [...document.querySelectorAll('.lyric__line:last-child .lyric__clip')];
          return clips.map((c) => c.style.transform || 'none');
        });
        await page.waitForFunction(() => window.sunniva.PreviewPlayer.currentTime() > 12, null, { timeout: 20000 });
        const events = await page.evaluate(() => window.__lines);
        await ctx.close();
        const ins = events.filter((e) => e.kind === 'in').map((e) => e.at);
        const deltas = ins.map((at) => {
          const near = fixture.lines.reduce((best, l) => (Math.abs(l.t - at) < Math.abs(best - at) ? l.t : best), Infinity);
          return Math.abs(at - near) * 1000;
        });
        const tag = reduced ? 'reduced motion' : 'motion';
        check(`lyrics (${tag}): fixture lines appear on time`, ins.length >= 3 && Math.max(...deltas) < 120, `${ins.length} lines, max offset ${Math.max(...deltas).toFixed(0)} ms`);
        const outs = events.filter((e) => e.kind === 'out').length;
        check(`lyrics (${tag}): each line dissolves when the next starts`, outs >= 2 && outs >= ins.length - 2, `${outs} dissolved of ${ins.length}`);
        if (reduced) check('lyrics (reduced motion): no wipe transforms', wipe.every((t) => t === 'none'), wipe.join(' | '));
        else check('lyrics (motion): words wipe in one by one', /translateX\(0(\.0)?px\)/.test(wipe[0]) && wipe.at(-1) !== wipe[0], wipe.join(' | '));
      }
    } finally {
      if (created) rmSync(lyricsFile(tmpNone), { force: true });
    }
  }

  if (want('gl')) {
    // headless Chromium only has software WebGL, which the site refuses on purpose; ?gl=force accepts it
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desk.newPage();
    const reqs = [];
    page.on('request', (r) => reqs.push(r.url()));
    await page.goto(`${DIST}?gl=force&debug`);
    await ready(page);
    await page.waitForSelector('.guitar-gl canvas', { timeout: 20000 }).catch(() => {});
    const glb = reqs.find((u) => u.endsWith('.glb'));
    check('gl: desktop loads the WebGL guitar and its GLB', !!glb && (await page.evaluate(() => window.sunniva.GuitarStage.mode === 'gl')));
    const cdp = await desk.newCDPSession(page);
    await cdp.send('Performance.enable');
    const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    await sleep(1500);
    const a = await m();
    await sleep(4000);
    const b = await m();
    const busy = ((b.TaskDuration - a.TaskDuration) / 4) * 100;
    check('gl: renders on demand (idle main thread < 2 %)', busy < 2, `${busy.toFixed(2)} % over 4 s`);
    await page.evaluate(() => window.sunniva.GuitarStage.setMode('dom'));
    check('gl: no 3D toggle; setMode switches to the DOM guitar and back', !(await page.$('#toggle-guitar')) && await page.evaluate(async () => {
      const flat = !!document.querySelector('.guitar:not(.guitar-gl)') && !document.querySelector('.guitar-gl');
      await window.sunniva.GuitarStage.setMode('gl');
      return flat && !!document.querySelector('.guitar-gl canvas');
    }));
    await desk.close();
    const phone = await browser.newContext(devices['Pixel 7']);
    const p2 = await phone.newPage();
    const r2 = [];
    p2.on('request', (r) => r2.push(r.url()));
    await p2.goto(DIST);
    await ready(p2);
    await sleep(1500);
    check('gl: phone never requests Three.js, the GL module or the GLB', !r2.some((u) => /vendor\/three|\.glb|gl-guitar/.test(u)));
    await phone.close();
  }
  if (want('resilience')) {
    const open = async (opts, url, init) => {
      const ctx = await browser.newContext(opts);
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const reqs = [];
      page.on('request', (r) => reqs.push(r.url()));
      await page.goto(url);
      await ready(page);
      return { ctx, page, errors, reqs };
    };

    {
      const ctx = await browser.newContext(devices['Pixel 7']);
      const page = await ctx.newPage();
      await page.route(/\/features\/main\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: 'export async function start() { throw new Error("stage 2 bug"); }' }));
      await page.goto(`${DIST}?debug&track=6808001979`);
      await ready(page);
      const ok = await page.waitForSelector('dialog[open] .track__play', { timeout: 8000 }).then(() => true, () => false);
      check('resilience: a throwing Stage 2 entry -> room and ?track= still work', ok && (await page.evaluate(() => !!document.querySelector('.guitar'))));
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await open({ ...devices['Pixel 7'], reducedMotion: 'reduce' }, `${DIST}?debug`);
      const r = await page.evaluate(() => {
        const name = (sel) => getComputedStyle(document.querySelector(sel)).animationName;
        window.sunniva.LightRig.setEnabled(false);
        window.sunniva.LightRig.setEnabled(true);
        return { breathe: name('.glow__group'), sway: name('.guitar__sway'), flicker: document.querySelector('.glow').getAnimations().length };
      });
      check('resilience: reduced motion -> no breathing, sway or switch flicker', r.breathe === 'none' && r.sway === 'none' && r.flicker === 0 && !errors.length, JSON.stringify(r));
      await ctx.close();
    }
    {
      const blockStorage = () => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
      const { ctx, page, errors } = await open(devices['Pixel 7'], `${DIST}?debug`, blockStorage);
      await page.click('#light-switch .wall-switch__button--off');
      const r = await page.evaluate(() => ({ state: document.documentElement.dataset.state, lights: document.documentElement.dataset.lights, guitar: !!document.querySelector('.guitar') }));
      check('resilience: blocked localStorage -> boots, guitar and switch work', r.state === 'ready' && r.lights === 'off' && r.guitar && !errors.length, `${JSON.stringify(r)} ${errors.join(' | ')}`);
      await ctx.close();
    }
    {
      const noWebGl = () => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : get.call(this, type, ...rest); };
      };
      const { ctx, page, errors, reqs } = await open({ viewport: { width: 1440, height: 900 } }, `${DIST}?gl=force&debug`, noWebGl);
      await sleep(800);
      const mode = await page.evaluate(() => window.sunniva.GuitarStage.mode);
      check('resilience: desktop without WebGL -> photo guitar, no Three.js or GLB', mode === 'dom' && !reqs.some((u) => /vendor\/three|\.glb/.test(u)) && !errors.length, `mode ${mode}`);
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await open(devices['Pixel 7'], `${DIST}?debug`);
      await sleep(4500); // let the switch sounds preload
      await ctx.setOffline(true);
      await page.click('#light-switch .wall-switch__button--off');
      await page.evaluate(() => window.sunniva.ModalManager.open('track', { id: 6808001979 }));
      await page.click('.track__play');
      const shown = await page.waitForSelector('.track__error:not([hidden])', { timeout: 10000 }).then(() => true, () => false);
      const lights = await page.evaluate(() => document.documentElement.dataset.lights);
      check('resilience: network lost after load -> switch works, preview shows "Open in Apple Music"', shown && lights === 'off' && !errors.length, errors.join(' | '));
      await ctx.close();
    }
    {
      const ctx = await browser.newContext(devices['Pixel 7']);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = Date.now();
      await page.goto(DIST);
      await ready(page);
      const readyMs = Date.now() - t0;
      const paint = await page.evaluate(() => ({
        fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1),
        stars: document.querySelectorAll('.garland__star').length,
      }));
      check('resilience: slow 3G + 4x CPU -> room paints before the data, ready < 20 s', paint.fcp > 0 && paint.fcp < readyMs && paint.stars === 14 && readyMs < 20000, `FCP ${paint.fcp} ms, ready ${readyMs} ms`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  dist.kill();
  src.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
