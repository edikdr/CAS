// Shared e2e setup. The test Chromium has no AAC/H.264 decoders, so previews are routed to an
// Opus tone fixture (tracks.json is patched in flight) and the story uses the VP9 WebM variant.
// Lyrics come from tests/fixtures/lyrics (neutral placeholder words), never from real lyrics.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SHOTS = path.join(ROOT, 'docs/shots');
export const FIX = { lyr: ['1590535782', '6802785027'], noLyr: '6802785031' };

export async function setup(page, { lyrics = true } = {}) {
  const errors = [];
  const lrclib = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    requests.push(r.url());
    if (/lrclib/i.test(r.url())) lrclib.push(r.url());
  });
  await page.route('**/data/tracks.json', async (route) => {
    const res = await route.fetch();
    const tracks = await res.json();
    for (const t of tracks) {
      t.audio = `__fixture__/audio/${t.id}.webm`;
      t.hasLyrics = Boolean(lyrics && FIX.lyr.includes(t.id));
    }
    await route.fulfill({ response: res, json: tracks });
  });
  await page.route('**/__fixture__/audio/*', (route) => route.fulfill({ path: path.join(ROOT, 'tests/fixtures/tone.webm'), contentType: 'audio/webm' }));
  await page.route('**/data/private-lyrics/*.lrc', (route) => {
    const id = path.basename(new URL(route.request().url()).pathname, '.lrc');
    const f = path.join(ROOT, 'tests/fixtures/lyrics', `${id}.lrc`);
    return existsSync(f) ? route.fulfill({ path: f, contentType: 'text/plain; charset=utf-8' }) : route.fulfill({ status: 404, body: '' });
  });
  return { errors, lrclib, requests };
}

export async function boot(page, url = '/') {
  await page.goto(url);
  await page.evaluate(() => window.SD.ready);
}

/** Stand-in for the UI layer: minimal track rows using only the contract hooks. */
export async function injectRows(page, ids = [...FIX.lyr, FIX.noLyr]) {
  await page.evaluate((ids) => {
    const host = document.querySelector('#discography');
    host.innerHTML = ids.map((id) => {
      const t = SD.data.tracks.find((x) => x.id === id);
      return `<div data-track-row data-testid="row-${id}"><span>${t.title}</span>
        <button type="button" data-play-track="${id}">▶</button>
        <button type="button" data-lyrics-open="${id}">Lyrics</button></div>`;
    }).join('');
  }, ids);
  await page.waitForFunction((id) => document.querySelector(`[data-play-track="${id}"]`)?.hasAttribute('aria-label'), ids[0]);
}

/** Scroll to a fraction of the story and wait until the video has settled there. */
export async function scrollStory(page, f) {
  await page.evaluate((f) => scrollTo({ top: (document.querySelector('#story').offsetHeight - innerHeight) * f, behavior: 'instant' }), f);
  await page.waitForFunction((f) => Math.abs(SD.story.p - f) < 0.002, f, { timeout: 5_000 });
  await page.waitForFunction(() => {
    const v = document.querySelector('#story-video');
    const expected = SD.story.p * (SD.story.duration - 1 / 24);
    return SD.story.duration > 0 && !v.seeking && Math.abs(v.currentTime - expected) < 0.05;
  }, null, { timeout: 15_000 });
}

export function noErrors(ctx) {
  expect(ctx.errors, ctx.errors.join('\n')).toEqual([]);
  expect(ctx.lrclib, 'requests to lrclib.net').toEqual([]);
}
