/*
 * core/lyrics/engine-adapter.js - drives a LyricRenderer from the owner's lyrics engine
 * (vendor/lyrics-engine, never edited) with our own data as its only source.
 *
 * Public API:
 *   await attachLyrics({ host, trackId, renderer }) -> detach() | null
 *     null = no lyrics for this track in this build (missing file, permission "none"/missing, or
 *     the rights gate refuses the class): then the engine is not even downloaded and no text exists.
 *   jsonSource(lines), lineFor(lines, detail), toLine(line)   pure helpers (unit-tested)
 *
 * Engine setup (see docs/M0 decision in HANDOFF.md): sources = [data/lyrics/<id>.json via
 * DataStore] only (LRCLIB never used), offset = -BeatClock.latencyOffsetMs (the clip IS the time
 * base, so no song offset), calibration/close button/analyser/particles off. Its own DOM lives in
 * an off-screen aria-hidden host; we use only its timing events:
 *   'line'  -> renderer.setLine({ text, startSec, endSec, words }) from our line with that index
 *   'gap' (active), state != 'ready' -> renderer.clear()
 * The engine keeps its own rAF loop while the track modal is open and audio plays (accepted
 * exception to the single-loop rule, M0).
 */

import { DataStore } from '../data-store.js';
import { PreviewPlayer } from '../preview-player.js';
import { BeatClock } from '../clock.js';

/** An engine source that serves our lines (times are already clip-relative). */
export function jsonSource(lines) {
  return async () => ({ synced: lines.map(({ t, text }) => ({ t, text })), plain: null, duration: null });
}

/** Our line for an engine 'line' event (same index when the times agree, else by start time). */
export function lineFor(lines, detail) {
  const byIndex = lines[detail.index];
  if (byIndex && Math.abs(byIndex.t - detail.t) < 0.01) return byIndex;
  return lines.find((l) => Math.abs(l.t - detail.t) < 0.01) ?? null;
}

export const toLine = (l) => ({ text: l.text, startSec: l.t, endSec: l.end, words: l.words });

export async function attachLyrics({
  host, trackId, renderer,
  store = DataStore, player = PreviewPlayer, clock = BeatClock,
  loadEngine = () => import('../../vendor/lyrics-engine/lyrics-engine.mjs'),
}) {
  const doc = await store.lyrics(trackId);
  if (!doc?.lines?.length) return null;
  const { default: LyricsEngine } = await loadEngine();
  const track = store.track(trackId);
  const lines = doc.lines;

  const engineHost = document.createElement('div');
  engineHost.className = 'lyric__engine';
  engineHost.setAttribute('aria-hidden', 'true');
  host.append(engineHost);

  renderer.mount(host, {
    time: () => (player.isPlaying() ? clock.time() : player.currentTime() - clock.latencyOffsetMs / 1000),
    onResume: (fn) => player.on('play', fn),
  });

  const engine = LyricsEngine.create({
    audio: player.audio,
    container: engineHost,
    track: { artist: track.artistCredit, title: track.title, duration: 30 },
    sources: [jsonSource(lines)],
    calibration: false,
    closeButton: false,
    analyser: false,
    theme: { extends: 'minimal', particles: 0 },
    lang: 'en',
  });
  engine.setOffset(-clock.latencyOffsetMs / 1000);
  engine.on('line', (detail) => {
    const line = lineFor(lines, detail);
    if (line) renderer.setLine(toLine(line));
  });
  engine.on('gap', (detail) => { if (detail.active) renderer.clear(); });
  engine.on('state', (state) => { if (state !== 'ready') renderer.clear(); });
  engine.open();

  return () => {
    engine.destroy();
    renderer.destroy();
    engineHost.remove();
  };
}
