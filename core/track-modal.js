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
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h4v15H6zM14 4.5h4v15h-4z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.2h3.8L12 5v14l-4.7-4.2H3.5z" fill="currentColor"/><path d="M15.3 8.6a4.8 4.8 0 0 1 0 6.8M17.9 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.2h3.8L12 5v14l-4.7-4.2H3.5z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

function render(body, payload, api) {
  body.innerHTML = `
    <p class="track__kicker caps"></p>
    <div class="track__lyrics"></div>
    <p class="track__note" hidden></p>
    <div class="track__player">
      <button class="icon-button icon-button--solid track__play" type="button" aria-label="Play preview">${ICON.play}</button>
      <div class="track__bar">
        <input class="range track__seek" type="range" min="0" max="30" step="0.1" value="0" aria-label="Position in the preview">
        <div class="track__times" aria-hidden="true"><span class="track__now">0:00</span><span>0:30</span></div>
      </div>
    </div>
    <div class="track__sound">
      <button class="icon-button track__mute" type="button" aria-label="Mute" aria-pressed="false">${ICON.sound}</button>
      <input class="range track__volume" type="range" min="0" max="1" step="0.05" aria-label="Volume">
    </div>
    <p class="track__error" role="status" hidden>The preview could not be played. <a target="_blank" rel="noopener noreferrer">Open in Apple Music</a></p>
    <div class="track__content"></div>`;
  const $ = (sel) => body.querySelector(sel);
  const playBtn = $('.track__play');
  const seek = $('.track__seek');
  const nowEl = $('.track__now');
  const muteBtn = $('.track__mute');
  const volume = $('.track__volume');
  const lyricsHost = $('.track__lyrics');
  const slots = { kicker: $('.track__kicker'), note: $('.track__note'), content: $('.track__content') };
  const off = [];
  let id = null;
  let detachLyrics = null;
  let detachContent = null;
  let token = 0;
  let wasPlaying = null;

  const mine = () => PreviewPlayer.trackId === id;
  const paintPlayer = () => {
    const playing = mine() && PreviewPlayer.isPlaying();
    if (playing !== wasPlaying) {
      wasPlaying = playing;
      playBtn.innerHTML = playing ? ICON.pause : ICON.play;
      playBtn.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
    }
    const t = mine() ? PreviewPlayer.currentTime() : 0;
    seek.value = String(t);
    seek.style.setProperty('--p', `${(t / 30) * 100}%`);
    nowEl.textContent = fmt(t);
  };
  const paintSound = () => {
    const muted = PreviewPlayer.muted;
    muteBtn.innerHTML = muted ? ICON.muted : ICON.sound;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    const v = muted ? 0 : PreviewPlayer.volume;
    volume.value = String(v);
    volume.style.setProperty('--p', `${v * 100}%`);
  };

  async function showLyrics(trackId, my) {
    detachLyrics?.();
    detachLyrics = null;
    lyricsHost.replaceChildren();
    slots.note.hidden = true;
    const noLyrics = () => {
      if (my !== token) return;
      slots.note.textContent = NO_LYRICS;
      slots.note.hidden = false;
      lyricsHost.hidden = true;
    };
    try {
      if (!(await DataStore.lyrics(trackId))) { noLyrics(); return; }
      const [{ attachLyrics }, { createRenderer }] = await Promise.all([import('./lyrics/engine-adapter.js'), import('./lyrics/lyric-renderer.js')]);
      if (my !== token) return;
      lyricsHost.hidden = false;
      const detach = await attachLyrics({ host: lyricsHost, trackId, renderer: createRenderer() });
      if (my !== token) detach?.();
      else detachLyrics = detach;
    } catch {
      noLyrics(); // offline or a broken file: same as no lyrics, never half a text
    }
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
  muteBtn.addEventListener('click', () => PreviewPlayer.setMuted(!PreviewPlayer.muted));
  volume.addEventListener('input', () => PreviewPlayer.setVolume(Number(volume.value)));
  volume.hidden = !PreviewPlayer.canSetVolume; // iOS: hardware buttons set the level, mute still works
  off.push(PreviewPlayer.on('volume', paintSound));
  paintSound();
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
