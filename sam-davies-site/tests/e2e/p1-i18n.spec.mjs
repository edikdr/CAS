// i18n acceptance: live EN→ES→CA→EN switch while a preview plays and the lyrics modal is open.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { setup, boot, injectRows, scrollStory, noErrors, FIX, SHOTS } from './helpers.mjs';

const [A] = FIX.lyr;
const CLOSE = { en: 'Close lyrics, music keeps playing', es: 'Cerrar la letra; la música sigue sonando', ca: 'Tanca la lletra; la música continua sonant' };
const SKIP = { en: 'Skip to content', es: 'Saltar al contenido', ca: 'Salta al contingut' };

test('live switch keeps audio, modal, scroll, video time and focus', async ({ page }, info) => {
  const ctx = await setup(page);
  await boot(page);
  await injectRows(page);
  await page.evaluate(() => { window.__noReload = 1; });
  await scrollStory(page, 0.55);
  const y = await page.evaluate(() => scrollY);
  const vt = await page.evaluate(() => document.querySelector('#story-video').currentTime);
  // play + open lyrics via API (rows are below; keep the story position)
  await page.evaluate((id) => SD.lyrics.open(id), A);
  await expect.poll(() => page.evaluate(() => [SD.player.state, SD.lyrics.isOpen])).toEqual(['playing', true]);
  await page.locator('.modal__panel').focus();
  let t = await page.evaluate(() => document.querySelector('#sd-audio').currentTime);
  for (const lang of ['es', 'ca', 'en']) {
    await page.click(`[data-lang-set="${lang}"]`);
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);
    const s = await page.evaluate(() => ({
      dataLang: document.documentElement.dataset.lang,
      close: document.querySelector('.modal__close').getAttribute('aria-label'),
      skip: document.querySelector('.skip').textContent,
      pressed: [...document.querySelectorAll('[data-lang-set]')].map((b) => b.getAttribute('aria-pressed')),
      open: SD.lyrics.isOpen, paused: document.querySelector('#sd-audio').paused,
      noReload: window.__noReload, focusInModal: document.querySelector('#lyrics-modal').contains(document.activeElement) || document.activeElement.closest('#lang-switch') !== null,
      title: document.title, words: document.querySelectorAll('#lyrics-stage .sd-lyr').length,
    }));
    expect(s).toMatchObject({ dataLang: lang, close: CLOSE[lang], skip: SKIP[lang], open: true, paused: false, noReload: 1, focusInModal: true, words: 1 });
    expect(s.pressed).toEqual(['en', 'es', 'ca'].map((l) => String(l === lang)));
    const t2 = await page.evaluate(() => document.querySelector('#sd-audio').currentTime);
    expect(t2).toBeGreaterThanOrEqual(t);
    t = t2;
    if (lang === 'ca') await page.screenshot({ path: path.join(SHOTS, `core-${info.project.name}-lyrics-ca.png`) });
  }
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => [SD.lyrics.isOpen, scrollY])).toEqual([false, y]);
  await page.waitForTimeout(300);
  expect(Math.abs((await page.evaluate(() => document.querySelector('#story-video').currentTime)) - vt)).toBeLessThan(0.05);
  expect(await page.evaluate(() => localStorage.getItem('sd.lang'))).toBe('en');
  noErrors(ctx);
});

test('?lang=ca loads Catalan (shareable link), not saved', async ({ page }) => {
  const ctx = await setup(page);
  await boot(page, '/?lang=ca');
  const s = await page.evaluate(() => ({ lang: document.documentElement.lang, skip: document.querySelector('.skip').textContent, title: document.title,
    notice: document.querySelector('[data-sd-notice]').textContent, saved: localStorage.getItem('sd.lang'),
    date: SD.i18n.fmtDate('2026-08-06'), year: SD.i18n.fmtDate('2018'), plural: [SD.i18n.t('core.modal.progressValue', { n: 1, d: 30 }), SD.i18n.t('core.modal.progressValue', { n: 5, d: 30 })],
    tx: SD.i18n.tx({ en: 'x', es: 'y', ca: 'z' }), q: SD.i18n.tx(SD.data.quiz[0].question) }));
  expect(s).toMatchObject({ lang: 'ca', skip: 'Salta al contingut', title: 'Sam Davies — concepte fan no oficial', notice: 'Concepte fan no oficial d’EdU', saved: null, year: '2018', tx: 'z' });
  expect(s.date).toBe('6 d’agost del 2026');
  expect(s.plural).toEqual(['1 segon de 30', '5 segons de 30']);
  expect(s.q).toMatch(/[«»]|Quin|Qui|En quin/);
  // switching with ?lang present updates the link in place (no new history entry)
  const len = await page.evaluate(() => history.length);
  await page.click('[data-lang-set="es"]');
  await expect.poll(() => page.url()).toContain('lang=es');
  expect(await page.evaluate(() => history.length)).toBe(len);
  noErrors(ctx);
});

test('browser language is detected by primary subtag; missing key falls back to English then key', async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, locale: 'es-MX' });
  const page = await context.newPage();
  const ctx = await setup(page);
  await boot(page);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('es');
  expect(await page.evaluate(() => [SD.i18n.t('nope.missing'), SD.i18n.t('core.skip')])).toEqual(['nope.missing', 'Saltar al contenido']);
  noErrors(ctx);
  await context.close();
});
