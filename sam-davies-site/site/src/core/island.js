// The "island" now-playing pill (TZ §6A). Visible iff player.state !== 'idle' and no modal is open.
// It shows/hides by removing `hidden` first and toggling `.is-visible` a frame later (so CSS can
// animate), never takes focus when it appears, and hands focus back to the page when it hides.
import { $, afterTransition } from './util.js';

export function createIsland({ player, modal, lyrics, i18n, announce }) {
  const el = $('#island');
  const openBtn = el?.querySelector('[data-island-open]');
  const cover = $('#island-cover');
  const title = $('#island-title');
  const artist = $('#island-artist');
  let shownFor = null;
  let gen = 0;

  function render() {
    const track = player.current;
    if (track && shownFor !== track.id) {
      shownFor = track.id;
      title.textContent = track.title;
      artist.textContent = track.artistLine;
      if (cover.getAttribute('src') !== track.cover) cover.src = track.cover;
    }
    el.setAttribute('aria-label', i18n.t('core.island.label'));
    if (track) {
      const ok = lyrics.hasLyrics(track.id);
      openBtn.setAttribute('aria-label', ok ? i18n.t('core.island.open', { title: track.title }) : `${track.title} — ${i18n.t('core.lyrics.none')}`);
      if (ok) openBtn.removeAttribute('aria-disabled'); else openBtn.setAttribute('aria-disabled', 'true');
    }
  }

  function update() {
    if (!el) return;
    render();
    const show = player.state !== 'idle' && !modal.isOpen;
    const my = ++gen;
    if (show) {
      if (!el.hidden && el.classList.contains('is-visible')) return;
      el.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (my === gen) el.classList.add('is-visible'); }));
    } else {
      if (el.hidden) return;
      if (el.contains(document.activeElement)) {
        // e.g. Stop was pressed: put focus on the row's play button, or let it fall to the page.
        const last = document.querySelector(`[data-play-track="${CSS.escape(shownFor || '')}"]`);
        if (last) last.focus({ preventScroll: true }); else document.activeElement.blur();
      }
      el.classList.remove('is-visible');
      afterTransition(el).then(() => { if (my === gen) el.hidden = true; });
    }
  }

  return {
    init() {
      if (!el) return;
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const t = player.current;
        if (!t) return;
        if (!lyrics.hasLyrics(t.id)) { announce(i18n.t('core.lyrics.none')); return; }
        lyrics.open(t.id, { returnFocus: openBtn });
      });
      for (const evt of ['player:change', 'modal:open', 'modal:close', 'i18n:change']) document.addEventListener(evt, update);
      update();
    },
    update,
  };
}
