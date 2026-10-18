// Budgets: LCP < 2.5 s and poster painted < 2.5 s on throttled 4G, no CLS, nothing heavy before the video,
// and the device-variant rule (saveData → 720). Results also go to docs/budgets-<project>.json.
import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { setup, boot, noErrors, SHOTS } from './helpers.mjs';

test('throttled 4G: LCP < 2.5 s, poster painted < 2.5 s, CLS = 0, initial transfer ≤ 400 KB + poster', async ({ page }, info) => {
  const ctx = await setup(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  // Lighthouse "Slow 4G": 150 ms RTT, 1.6 Mbps down, 750 kbps up; 4× CPU slowdown on mobile.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  if (info.project.name.startsWith('mobile')) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const bytes = new Map();
  cdp.on('Network.loadingFinished', (e) => bytes.set(e.requestId, e.encodedDataLength));
  const urls = new Map();
  cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url));
  await page.addInitScript(() => {
    window.__lcp = [];
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push({ t: e.startTime, url: e.url, el: e.element?.className || e.element?.tagName }); }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await boot(page);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  // Chromium excludes full-viewport images from LCP (treated as background), so the poster can
  // never be the reported LCP element; its arrival is measured with resource timing instead.
  const r = await page.evaluate(() => ({ lcp: __lcp.at(-1), cls: __cls,
    poster: performance.getEntriesByType('resource').find((e) => e.name.endsWith('poster.webp'))?.responseEnd }));
  // everything transferred before the scroll video request
  let before = 0, poster = 0;
  const list = [];
  for (const [id, len] of bytes) {
    const u = urls.get(id) || '';
    if (/scroll-\d+\.(mp4|webm)/.test(u) || /__fixture__/.test(u)) continue;
    if (u.endsWith('poster.webp')) poster += len; else before += len;
    list.push([u.replace(/^https?:\/\/[^/]+\//, ''), len]);
  }
  const out = { project: info.project.name, network: 'Slow 4G (150 ms, 1.6 Mbps)' + (info.project.name.startsWith('mobile') ? ', 4× CPU' : ''), lcpMs: Math.round(r.lcp?.t ?? -1), lcpElement: r.lcp?.url || r.lcp?.el, posterLoadedMs: Math.round(r.poster ?? -1), cls: +r.cls.toFixed(4), initialKB: +(before / 1024).toFixed(1), posterKB: +(poster / 1024).toFixed(1), files: list.sort((a, b) => b[1] - a[1]) };
  writeFileSync(path.join(path.dirname(SHOTS), `budgets-${info.project.name}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ ...out, files: undefined }));
  expect(r.lcp.t).toBeLessThan(2500);
  expect(r.poster).toBeLessThan(2500);
  expect(r.cls).toBe(0);
  expect(before).toBeLessThanOrEqual(400 * 1024);
  noErrors(ctx);
});

test('saveData → 720 variant even on a wide screen', async ({ page }, info) => {
  test.skip(info.project.name.startsWith('mobile'), 'mobile already uses 720');
  await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' }, configurable: true }));
  const ctx = await setup(page);
  await boot(page);
  expect(await page.evaluate(() => SD.story.source)).toBe('media/scroll-720.webm');
  noErrors(ctx);
});
