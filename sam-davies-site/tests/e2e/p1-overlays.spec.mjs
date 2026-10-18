// P1 acceptance: player → lyrics modal → island loop, close paths, focus, scroll, history, i18n.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { setup, boot, injectRows, scrollStory, noErrors, FIX, SHOTS } from './helpers.mjs';

const [A, B] = FIX.lyr;
const state = (page) => page.evaluate(() => ({
  player: SD.player.state, current: SD.player.current?.id ?? null, modal: document.documentElement.dataset.modal,
  lyrics: SD.lyrics.isOpen, islandHidden: document.querySelector('#island').hidden,
  islandVisible: document.querySelector('#island').classList.contains('is-visible'),
  paused: document.querySelector('#sd-audio').paused, y: scrollY,
  lists: document.querySelectorAll('#lyrics-stage .sd-lyr, #lyrics-stage [class^="le-"]:not(.le-word)').length,
}));
const audioTime = (page) => page.evaluate(() => document.querySelector('#sd-audio').currentTime);

test('play → lyrics modal → close keeps music → island → reopen → stop', async ({ page }, info) => {
  const ctx = await setup(page);
  await boot(page);
  await injectRows(page);
  await scrollStory(page, 0.4);
  const y0 = await page.evaluate(() => scrollY);
  const v0 = await page.evaluate(() => document.querySelector('#story-video').currentTime);

  // play
  await page.locator(`#discography [data-play-track="${A}"]`).scrollIntoViewIfNeeded().catch(() => {});
  await page.evaluate(() => scrollTo({ top: document.querySelector('#discography').offsetTop, behavior: 'instant' }));
  const y1 = await page.evaluate(() => scrollY);
  await page.click(`[data-play-track="${A}"]`);
  await expect.poll(() => state(page)).toMatchObject({ player: 'playing', current: A, islandHidden: false, islandVisible: true });
  await expect(page.locator(`[data-play-track="${A}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`[data-testid="row-${A}"]`)).toHaveClass(/is-playing/);

  // open lyrics → words on top of the page, island hidden while the modal is open
  await page.click(`[data-lyrics-open="${A}"]`);
  await expect.poll(() => state(page)).toMatchObject({ modal: 'open', lyrics: true, islandHidden: true });
  await expect(page.locator('#lyrics-stage .le-word', { hasText: 'alpha' })).toHaveCount(1);
  await expect(page.locator('#lyrics-stage .sd-lyr__line.is-current')).toHaveCount(1, { timeout: 5000 });
  const top = await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#lyrics-modal') !== null);
  expect(top, 'modal is the topmost layer').toBe(true);
  await expect(page.locator('#lm-title')).toHaveText(await page.evaluate((id) => SD.data.tracks.find((t) => t.id === id).title, A));
  // owner requirement: no opaque panel — the scroll-story stage stays visible behind the lyrics
  await page.waitForTimeout(350); // fade of the page content
  const see = await page.evaluate(() => ({
    panelBg: getComputedStyle(document.querySelector('.modal__panel')).backgroundColor,
    main: getComputedStyle(document.querySelector('#main')).visibility,
    stage: getComputedStyle(document.querySelector('[data-story-stage]')).visibility,
    backdropAlphaMax: Math.max(...(getComputedStyle(document.querySelector('.modal__backdrop')).backgroundImage.match(/0?\.\d+(?=\))/g) || ['1']).map(Number)),
  }));
  expect(see).toMatchObject({ panelBg: 'rgba(0, 0, 0, 0)', main: 'hidden', stage: 'visible' });
  expect(see.backdropAlphaMax).toBeLessThan(0.8);
  await page.screenshot({ path: path.join(SHOTS, `core-${info.project.name}-lyrics-modal.png`) });
  for (const sel of ['#story', '#main', '#footer', '#island']) expect(await page.evaluate((s) => document.querySelector(s).inert, sel)).toBe(true);

  // chevron close → audio keeps playing, island appears at the top, scroll identical, focus back
  const tBefore = await audioTime(page);
  await page.click('.modal__close');
  await expect.poll(() => state(page)).toMatchObject({ modal: 'closed', lyrics: false, player: 'playing', paused: false, islandVisible: true, y: y1 });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#main')).visibility)).toBe('visible');
  await expect.poll(() => audioTime(page)).toBeGreaterThan(tBefore + 0.2);
  const box = await page.locator('#island').boundingBox();
  expect(box.y).toBeLessThan(30);
  expect(Math.abs(box.x + box.width / 2 - (info.project.use.viewport.width / 2))).toBeLessThan(2);
  await expect(page.locator(`[data-lyrics-open="${A}"]`)).toBeFocused();
  await page.screenshot({ path: path.join(SHOTS, `core-${info.project.name}-island.png`) });

  // tap the island → modal reopens without doubled text
  await page.click('[data-island-open]');
  await expect.poll(() => state(page)).toMatchObject({ modal: 'open', lyrics: true, lists: 1 });
  await expect(page.locator('#lyrics-stage .le-word', { hasText: 'alpha' })).toHaveCount(1);
  expect((await state(page)).paused).toBe(false);

  // Esc closes, focus returns to the island
  await page.keyboard.press('Escape');
  await expect.poll(() => state(page)).toMatchObject({ modal: 'closed', player: 'playing', y: y1 });
  await expect(page.locator('[data-island-open]')).toBeFocused();

  // Back button closes
  await page.click('[data-island-open]');
  await expect.poll(() => state(page)).toMatchObject({ modal: 'open' });
  await page.goBack();
  await expect.poll(() => state(page)).toMatchObject({ modal: 'closed', player: 'playing', y: y1 });

  // backdrop closes (at 390 px the panel covers the viewport, so the click is dispatched on it)
  await page.click('[data-island-open]');
  await expect.poll(() => state(page)).toMatchObject({ modal: 'open' });
  if (info.project.name.startsWith('desktop')) await page.mouse.click(8, 8);
  else await page.locator('.modal__backdrop').dispatchEvent('click');
  await expect.poll(() => state(page)).toMatchObject({ modal: 'closed', player: 'playing' });

  // stop → island hides
  await page.click('[data-player-stop]');
  await expect.poll(() => state(page)).toMatchObject({ player: 'idle', current: null, islandHidden: true, paused: true });
  await expect(page.locator(`[data-play-track="${A}"]`)).toHaveAttribute('aria-pressed', 'false');

  // the scroll story kept its position and video time throughout
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y0);
  await scrollStory(page, 0.4);
  expect(Math.abs((await page.evaluate(() => document.querySelector('#story-video').currentTime)) - v0)).toBeLessThan(0.1);
  noErrors(ctx);
});

test('focus trap, history hygiene, lyrics for another track while open', async ({ page }) => {
  const ctx = await setup(page);
  await boot(page);
  await injectRows(page);
  const len0 = await page.evaluate(() => history.length);
  for (let i = 0; i < 3; i++) {
    await page.click(`[data-lyrics-open="${A}"]`);
    await expect.poll(() => state(page)).toMatchObject({ modal: 'open' });
    await page.click('.modal__close');
    await expect.poll(() => state(page)).toMatchObject({ modal: 'closed' });
  }
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(len0 + 1);
  expect(await page.evaluate(() => history.state?.sdModal)).toBeFalsy();

  await page.click(`[data-lyrics-open="${A}"]`);
  await expect.poll(() => state(page)).toMatchObject({ modal: 'open' });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
    expect(await page.evaluate(() => document.querySelector('#lyrics-modal').contains(document.activeElement))).toBe(true);
  }
  // open(id) for another track while open: switches track, no second modal, no doubled text
  await page.evaluate((id) => SD.lyrics.open(id), B);
  await expect.poll(() => state(page)).toMatchObject({ current: B, modal: 'open', lists: 1 });
  await expect(page.locator('#lyrics-stage .le-word', { hasText: 'zulu' })).toHaveCount(1);
  await expect(page.locator('#lyrics-stage .le-word', { hasText: 'alpha' })).toHaveCount(0);
  await page.evaluate(() => SD.lyrics.close());
  await expect.poll(() => state(page)).toMatchObject({ modal: 'closed', player: 'playing' });
  noErrors(ctx);
});

test('track without lyrics: entry points disabled, engine never started', async ({ page }) => {
  const ctx = await setup(page);
  await boot(page);
  await injectRows(page);
  await expect(page.locator(`[data-lyrics-open="${FIX.noLyr}"]`)).toHaveAttribute('aria-disabled', 'true');
  expect(await page.evaluate((id) => SD.lyrics.hasLyrics(id), FIX.noLyr)).toBe(false);
  await page.click(`[data-play-track="${FIX.noLyr}"]`);
  await expect.poll(() => state(page)).toMatchObject({ player: 'playing', islandVisible: true });
  await expect(page.locator('[data-island-open]')).toHaveAttribute('aria-disabled', 'true');
  // aria-disabled elements stay clickable for users; Playwright needs force to click them
  await page.click('[data-island-open]', { force: true });
  await page.click(`[data-lyrics-open="${FIX.noLyr}"]`, { force: true });
  await page.waitForTimeout(400);
  expect((await state(page)).modal).toBe('closed');
  expect(ctx.requests.some((u) => u.includes(`${FIX.noLyr}.lrc`))).toBe(false);
  await expect(page.locator('#sd-live')).toHaveText(/No lyrics for this preview/);
  noErrors(ctx);
});

test('a preview that reaches its end → idle, island hides', async ({ page }) => {
  const ctx = await setup(page);
  await boot(page);
  await injectRows(page);
  await page.click(`[data-play-track="${A}"]`);
  await expect.poll(() => state(page)).toMatchObject({ player: 'playing' });
  await page.waitForFunction(() => document.querySelector('#sd-audio').readyState >= 1);
  await page.evaluate(() => { document.querySelector('#sd-audio').currentTime = 29.6; });
  await expect.poll(() => state(page), { timeout: 8000 }).toMatchObject({ player: 'idle', current: null, islandHidden: true });
  expect(await page.evaluate(() => document.querySelector('#island').style.getPropertyValue('--prog'))).toBe('1.0000');
  noErrors(ctx);
});

test('keyboard-only pass', async ({ page }) => {
  const ctx = await setup(page);
  await boot(page);
  await injectRows(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  expect(await page.locator('.skip').evaluate((el) => el.getBoundingClientRect().top >= 0)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-lang-set="en"]')).toBeFocused();
  // reach the play button of the first row with Tab only
  for (let i = 0; i < 10 && !(await page.evaluate((id) => document.activeElement?.getAttribute('data-play-track') === id, A)); i++) await page.keyboard.press('Tab');
  await expect(page.locator(`[data-play-track="${A}"]`)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page)).toMatchObject({ player: 'playing' });
  expect(await page.evaluate(() => document.activeElement.closest('#island'))).toBeNull(); // island did not steal focus
  await page.keyboard.press('Tab');
  await expect(page.locator(`[data-lyrics-open="${A}"]`)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page)).toMatchObject({ modal: 'open' });
  expect(await page.evaluate(() => document.activeElement.classList.contains('modal__panel'))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('.modal__close')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page)).toMatchObject({ modal: 'closed', player: 'playing' });
  await expect(page.locator(`[data-lyrics-open="${A}"]`)).toBeFocused();
  // visible focus ring
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
  noErrors(ctx);
});

test('island never overlaps the language switch or other fixed controls', async ({ page }) => {
  const ctx = await setup(page);
  await boot(page);
  await injectRows(page);
  await page.click(`[data-play-track="${A}"]`);
  await expect.poll(() => state(page)).toMatchObject({ islandVisible: true });
  await page.waitForTimeout(400); // transitions
  const boxes = await page.evaluate(() => ['#island', '#lang-switch'].map((s) => document.querySelector(s).getBoundingClientRect().toJSON()));
  const [i, l] = boxes;
  const overlap = !(i.right <= l.left || l.right <= i.left || i.bottom <= l.top || l.bottom <= i.top);
  expect(overlap, JSON.stringify(boxes)).toBe(false);
  for (const sel of ['[data-island-open]', '#island [data-player-toggle]', '#island [data-player-stop]']) {
    const hit = await page.locator(sel).evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
    expect(hit, sel).toBe(true);
  }
  noErrors(ctx);
});
