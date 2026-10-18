// Boot. `window.SD` is the only global; every API method exists from the first line of this module.
// `await SD.ready` resolves once config, data and strings are loaded and core is initialised.
import { root, $, isDev } from './util.js';
import { createI18n } from './i18n.js';
import { createStory } from './story.js';
import { createModal } from './modal.js';
import { createPlayer } from './player.js';
import { createLyrics } from './lyrics.js';
import { createIsland } from './island.js';
import { createSfx } from './sfx.js';
import { perf } from './perf.js';

// Polite live region owned by core (visually hidden). Re-announces identical messages.
const live = document.createElement('div');
live.id = 'sd-live';
live.className = 'sd-visually-hidden';
live.setAttribute('role', 'status');
live.setAttribute('aria-live', 'polite');
function announce(msg) {
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = msg; });
}

const i18n = createI18n();
const story = createStory();
const modal = createModal();
const player = createPlayer({ i18n, announce });
const lyrics = createLyrics({ player, modal, i18n, announce });
const island = createIsland({ player, modal, lyrics, i18n, announce });
const sfx = createSfx({ story, player, i18n });

let resolveReady, rejectReady;
const SD = {
  ready: new Promise((res, rej) => { resolveReady = res; rejectReady = rej; }),
  config: null,
  data: {},
  player, lyrics, modal, story, i18n,
  perf,
};
Object.defineProperty(window, 'SD', { value: SD, writable: false, configurable: false });

const json = (url) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
});

/** Static skeleton labels are English fallbacks; bind them to core keys so every switch relabels. */
function bindSkeleton() {
  const bind = (sel, attrs) => { const el = $(sel); if (el && !el.hasAttribute('data-i18n-attr')) el.setAttribute('data-i18n-attr', attrs); };
  bind('#island', 'aria-label:core.island.label');
  bind('.island__stop', 'aria-label:core.player.stop');
  bind('.modal__close', 'aria-label:core.modal.close');
  bind('.modal__progress', 'aria-label:core.modal.progress');
  bind('#lyrics-stage', 'aria-label:core.lyrics.stage');
  $('#lyrics-stage')?.setAttribute('role', 'region');
  document.body.append(live);
}

/** The "unofficial fan concept" notice must always be there; UI may render its own
 *  element carrying [data-sd-notice] — core only adds one when it is missing. */
function ensureNotice() {
  const footer = $('#footer');
  if (!footer) return;
  const add = () => {
    if (footer.querySelector('[data-sd-notice]')) return;
    const p = document.createElement('p');
    p.className = 'sd-notice';
    p.setAttribute('data-sd-notice', '');
    p.setAttribute('data-i18n', 'core.notice');
    p.textContent = i18n.t('core.notice');
    footer.append(p);
  };
  add();
  new MutationObserver(add).observe(footer, { childList: true, subtree: true });
}

async function boot() {
  const config = await json('site.config.json');
  SD.config = config;
  if (new URLSearchParams(location.search).has('perf')) perf.overlay();
  // Story first: it needs only config, so the video's lazy load is not held up by data.
  story.init(config.story);
  const [tracks, releases, timeline, quiz, build] = await Promise.all([
    json('data/tracks.json'), json('data/releases.json'), json('data/timeline.json'), json('data/quiz.json'),
    json('data/build.json').catch(() => ({})),
    i18n.init(config.i18n),
  ]);
  SD.data = { tracks, releases, timeline, quiz, build };
  if (!config.features?.indexable && !$('meta[name="robots"]')) {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.append(m);
  }
  bindSkeleton();
  modal.init();
  player.init({ data: SD.data, config: config.player });
  lyrics.init({ data: SD.data, config, build });
  island.init();
  sfx.init({ config, build });
  ensureNotice();
  i18n.apply();
  root.dataset.core = 'ready';
}

boot().then(() => resolveReady(SD), (err) => {
  console.error('[SD] boot failed', err);
  root.dataset.core = 'error';
  const p = document.createElement('p');
  p.className = 'sd-notice';
  p.setAttribute('role', 'alert');
  p.textContent = i18n.t('core.error.data');
  ($('#main') || document.body).prepend(p);
  rejectReady(err);
});

if (isDev()) SD.dev = { announce };
