/*
 * core/track-modal.js - the track window shell (ModalManager kind 'track'; Stage 2 fills content).
 *
 * Open: ModalManager.open('track', { id }). The shell owns: title, a kicker line (release + year),
 * the preview player (play/pause, seek, time, "Open in Apple Music" on error), and the lyric region
 * (a LyricRenderer through the engine adapter, or a short note when this build may show no lyrics).
 * While open, <html class="track-open"> moves the guitar out from under the panel; the guitar and
 * lights already follow the music through BeatClock (core/app.js).
 *
 * Public API:
 *   TrackModal.setContent((slots, track, api) => cleanup?)   Stage 2: credits, links, prev/next...
 *     slots: { kicker, note, content } elements; track: DataStore row
 *     api: { setTrack(id), play(), close() } - setTrack switches the track inside the same window
 *
 * Must not change: kind name 'track', payload { id }, the slots above.
 */

import { ModalManager } from './modal-manager.js';
import { DataStore } from './data-store.js';
import { PreviewPlayer } from './preview-player.js';

const NO_LYRICS = 'Lyrics are not shown in this preview.';
let contentRenderer = null;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function render(body, payload, api) {
  body.innerHTML = `
    <p class="track__kicker"></p>
    <div class="track__lyrics"></div>
    <p class="track__note" hidden></p>
    <div class="track__player">
      <button class="control track__play" type="button">Play preview</button>
      <input class="track__seek" type="range" min="0" max="30" step="0.1" value="0" aria-label="Position in the preview">
      <span class="track__time" aria-hidden="true">0:00 / 0:30</span>
    </div>
    <p class="track__error" role="status" hidden>The preview could not be played. <a target="_blank" rel="noopener noreferrer">Open in Apple Music</a></p>
    <div class="track__content"></div>`;
  const $ = (sel) => body.querySelector(sel);
  const playBtn = $('.track__play');
  const seek = $('.track__seek');
  const timeEl = $('.track__time');
  const lyricsHost = $('.track__lyrics');
  const slots = { kicker: $('.track__kicker'), note: $('.track__note'), content: $('.track__content') };
  const off = [];
  let id = null;
  let detachLyrics = null;
  let detachContent = null;
  let token = 0;

  const mine = () => PreviewPlayer.trackId === id;
  const paintPlayer = () => {
    const playing = mine() && PreviewPlayer.isPlaying();
    playBtn.textContent = playing ? 'Pause preview' : 'Play preview';
    const t = mine() ? PreviewPlayer.currentTime() : 0;
    seek.value = String(t);
    timeEl.textContent = `${fmt(t)} / 0:30`;
  };

  async function showLyrics(trackId, my) {
    detachLyrics?.();
    detachLyrics = null;
    lyricsHost.replaceChildren();
    slots.note.hidden = true;
    if (!(await DataStore.lyrics(trackId))) {
      if (my !== token) return;
      slots.note.textContent = NO_LYRICS;
      slots.note.hidden = false;
      lyricsHost.hidden = true;
      return;
    }
    const [{ attachLyrics }, { createRenderer }] = await Promise.all([import('./lyrics/engine-adapter.js'), import('./lyrics/lyric-renderer.js')]);
    if (my !== token) return;
    lyricsHost.hidden = false;
    const detach = await attachLyrics({ host: lyricsHost, trackId, renderer: createRenderer() });
    if (my !== token) detach?.();
    else detachLyrics = detach;
  }

  function setTrack(trackId) {
    const track = DataStore.track(trackId);
    if (!track) return;
    if (id !== null && PreviewPlayer.trackId === id) PreviewPlayer.pause();
    id = track.id;
    const my = ++token;
    const release = DataStore.release(track.releaseId);
    api.setTitle(track.title);
    slots.kicker.textContent = [release?.title, track.releaseDate?.slice(0, 4)].filter(Boolean).join(' · ');
    $('.track__error').hidden = true;
    $('.track__error a').href = track.appleUrl;
    paintPlayer();
    showLyrics(id, my);
    detachContent?.();
    detachContent = contentRenderer?.(slots, track, { setTrack, play, close: api.close }) || null;
  }

  function play() {
    if (mine() && PreviewPlayer.isPlaying()) return PreviewPlayer.pause();
    return PreviewPlayer.play(id).catch(() => {});
  }

  playBtn.addEventListener('click', play);
  seek.addEventListener('input', () => { if (mine()) PreviewPlayer.seek(Number(seek.value)); });
  for (const type of ['play', 'pause', 'ended', 'timeupdate', 'seeked', 'track']) off.push(PreviewPlayer.on(type, paintPlayer));
  off.push(PreviewPlayer.on('error', (e) => { if (e.trackId === id) $('.track__error').hidden = false; }));

  document.documentElement.classList.add('track-open');
  setTrack(payload.id);

  return () => {
    token++;
    off.forEach((f) => f());
    detachLyrics?.();
    detachContent?.();
    document.documentElement.classList.remove('track-open');
  };
}

ModalManager.register('track', { render });

export const TrackModal = {
  setContent(fn) { contentRenderer = typeof fn === 'function' ? fn : null; },
};
