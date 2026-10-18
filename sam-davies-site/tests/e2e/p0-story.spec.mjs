// P0 acceptance: scroll story, state publishing, variants, reduced motion, perf numbers.
import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { setup, boot, scrollStory, noErrors, SHOTS } from './helpers.mjs';

test('boots without console errors and publishes the contract state', async ({ page }) => {
  const ctx = await setup(page);
  await boot(page);
  const s = await page.evaluate(() => {
    const h = document.documentElement;
    const css = getComputedStyle(h);
    return {
      // globals added by the page = own window props not present on a blank frame
      extra: (() => {
        const f = document.createElement('iframe');
        document.body.append(f);
        const base = new Set(Object.getOwnPropertyNames(f.contentWindow));
        f.remove();
        return Object.getOwnPropertyNames(window).filter((k) => !base.has(k) && !/^__pw|^playwright/i.test(k));
      })(),
      lang: h.lang, dataLang: h.dataset.lang, player: h.dataset.player, modal: h.dataset.modal, act: h.dataset.act,
      p: css.getPropertyValue('--p').trim(), scrim: css.getPropertyValue('--scrim').trim(),
      zModal: css.getPropertyValue('--z-modal').trim(), zIsland: css.getPropertyValue('--z-island').trim(),
      api: ['play', 'pause', 'toggle', 'stop', 'on'].every((m) => typeof SD.player[m] === 'function')
        && ['open', 'close', 'hasLyrics'].every((m) => typeof SD.lyrics[m] === 'function')
        && ['open', 'close'].every((m) => typeof SD.modal[m] === 'function')
        && ['t', 'tx', 'setLang', 'fmtDate'].every((m) => typeof SD.i18n[m] === 'function'),
      data: [SD.data.tracks.length, SD.data.releases.length, SD.data.timeline.length, SD.data.quiz.length],
      notice: document.querySelector('#footer [data-sd-notice]')?.textContent,
      robots: document.querySelector('meta[name=robots]')?.content,
    };
  });
  expect(s.extra).toEqual(['SD']);
  expect(s).toMatchObject({ lang: 'en', dataLang: 'en', player: 'idle', modal: 'closed', act: '0', p: '0.0000', zModal: '80', zIsland: '60', api: true, robots: 'noindex, nofollow' });
  expect(Number(s.scrim)).toBeGreaterThan(0.5);
  expect(s.data).toEqual([45, 25, 15, 14]);
  expect(s.notice).toBe('Unofficial fan concept by EdU');
  noErrors(ctx);
});

test('scroll 0 / 50 / 100 % → video time ≈ p × duration, acts and events', async ({ page }, info) => {
  const ctx = await setup(page);
  await boot(page);
  await page.evaluate(() => { window.__events = []; document.addEventListener('story:progress', (e) => __events.push(e.detail)); });
  const expected = info.project.name.startsWith('mobile') ? 'media/scroll-720.webm' : 'media/scroll-1080.webm';
  expect(await page.evaluate(() => SD.story.source)).toBe(expected);
  for (const [f, act] of [[0, '0'], [0.5, '1'], [1, '3']]) {
    await scrollStory(page, f);
    const r = await page.evaluate(() => ({ t: document.querySelector('#story-video').currentTime, d: SD.story.duration, p: SD.story.p, act: document.documentElement.dataset.act }));
    expect(r.p).toBeCloseTo(f, 3);
    expect(Math.abs(r.t - f * (r.d - 1 / 24))).toBeLessThan(0.05);
    expect(r.act).toBe(act);
    await page.screenshot({ path: path.join(SHOTS, `core-${info.project.name}-p${Math.round(f * 100)}.png`) });
  }
  // Act boundaries from config [0, .25, .62, 1]
  for (const [f, act] of [[0.2, '0'], [0.3, '1'], [0.7, '2']]) {
    await scrollStory(page, f);
    expect(await page.evaluate(() => document.documentElement.dataset.act)).toBe(act);
  }
  const ev = await page.evaluate(() => __events.at(-1));
  expect(ev.act).toBe(2);
  expect(ev.p).toBeCloseTo(0.7, 2);
  noErrors(ctx);
});

test('reduced motion → stills per act, video never requested', async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const ctx = await setup(page);
  await boot(page);
  await page.waitForLoadState('load');
  expect(await page.evaluate(() => [SD.story.mode, document.documentElement.dataset.motion])).toEqual(['stills', 'reduced']);
  await page.evaluate(() => scrollTo(0, (document.querySelector('#story').offsetHeight - innerHeight) * 0.45));
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.act)).toBe('1');
  await page.waitForFunction(() => document.querySelector('[data-still="1"]').complete && document.querySelector('[data-still="1"]').naturalWidth > 0);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-still="1"]')).opacity)).toBe('1');
  expect(ctx.requests.filter((u) => /scroll-\d+\.(mp4|webm)/.test(u))).toEqual([]);
  await page.screenshot({ path: path.join(SHOTS, `core-${info.project.name}-reduced-motion.png`) });
  noErrors(ctx);
  await context.close();
});

test('perf: 5 s of continuous scrubbing (numbers recorded in docs/perf-*.json)', async ({ page }, info) => {
  const ctx = await setup(page);
  await boot(page);
  await scrollStory(page, 0);
  await page.waitForFunction(() => document.querySelector('#story-video').readyState >= 3, null, { timeout: 15_000 });
  const result = await page.evaluate(async () => {
    SD.perf.reset();
    const max = document.querySelector('#story').offsetHeight - innerHeight;
    const t0 = performance.now();
    let frames = 0, worst = 0, prev = t0;
    await new Promise((done) => {
      const step = (t) => {
        frames++; worst = Math.max(worst, t - prev); prev = t;
        const k = (t - t0) / 5000; // forward 2.5 s, back 2.5 s
        if (k >= 1) return done();
        scrollTo(0, max * (k < 0.5 ? k * 2 : (1 - k) * 2));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return { pageFrames: frames, pageWorstFrameMs: +worst.toFixed(1), ...SD.perf.snapshot() };
  });
  result.project = info.project.name;
  result.source = await page.evaluate(() => SD.story.source);
  result.note = 'Headless Chromium in a CI container (software rendering, no GPU, VP9 path). Indicative only — not a real-device measurement.';
  writeFileSync(path.join(path.dirname(SHOTS), `perf-${info.project.name}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  expect(result.seeks).toBeGreaterThan(20);
  noErrors(ctx);
});
