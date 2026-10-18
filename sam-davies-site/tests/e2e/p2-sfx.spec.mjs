// P2: optional scroll sound. Hidden without the loop file; with it: toggle, speed-driven gain that
// decays when scrolling stops, ducking while a preview plays. The fixture loop is pink noise.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup, boot, injectRows, noErrors, FIX } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('hidden when features.sfx is off or the loop file is missing', async ({ page }) => {
  const ctx = await setup(page);
  await boot(page);
  expect(await page.locator('#sfx-toggle').count()).toBe(0);
  expect(await page.evaluate(() => SD.sfx.available)).toBe(false);
  noErrors(ctx);
});

test('toggle, gain follows scroll speed, decays, ducks under a preview', async ({ page }) => {
  const ctx = await setup(page);
  await page.route('**/site.config.json', async (r) => { const res = await r.fetch(); const c = await res.json(); c.features.sfx = true; await r.fulfill({ response: res, json: c }); });
  await page.route('**/data/build.json', async (r) => { const res = await r.fetch(); const b = await res.json(); b.sfx = true; await r.fulfill({ response: res, json: b }); });
  await page.route('**/media/sfx/ride-loop.mp3', (r) => r.fulfill({ path: path.join(ROOT, 'tests/fixtures/ride-loop.webm'), contentType: 'audio/webm' }));
  await boot(page);
  const btn = page.locator('#sfx-toggle');
  await expect(btn).toHaveText('Sound off');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(btn).toHaveText('Sound on');
  await page.click('[data-lang-set="ca"]');
  await expect(btn).toHaveText('So activat');

  const scrollFor = (ms) => page.evaluate((ms) => new Promise((done) => {
    const t0 = performance.now(); let peak = 0;
    const step = (t) => { peak = Math.max(peak, SD.sfx.level); if (t - t0 > ms) return done(peak); scrollBy(0, 40); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), ms);
  const peak = await scrollFor(800);
  expect(peak).toBeGreaterThan(0.05);
  // TZ: decays to 0 within ~250 ms of stopping → sample 300 ms after the last scroll step
  const after = await page.evaluate(() => new Promise((r) => setTimeout(() => r(SD.sfx.level), 300)));
  expect(after).toBeLessThan(0.03); // ≤ ~5 % of the 0.55 ceiling

  await injectRows(page);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.evaluate((id) => SD.player.play(id), FIX.lyr[0]);
  await expect.poll(() => page.evaluate(() => SD.player.state)).toBe('playing');
  const ducked = await scrollFor(600);
  expect(ducked).toBeLessThan(0.02);
  // the preview element was never touched by the sfx graph
  expect(await page.evaluate(() => document.querySelector('#sd-audio').paused)).toBe(false);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  noErrors(ctx);
});
