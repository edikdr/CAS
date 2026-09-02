/* ---------------------------------------------------------------------------
   GENIUS — optional enrichment from our own backend (see server/).

   Off unless NBHD_CONFIG.geniusService points at a running instance, and even
   then nothing is requested until a track window is opened. The archive works
   exactly as before with no server at all.
--------------------------------------------------------------------------- */

const Genius = (() => {
  'use strict';

  const base = String(NBHD_CONFIG.geniusService || '').replace(/\/+$/, '');
  const enabled = Boolean(base);
  const memo = new Map();

  async function get(path, options) {
    const key = (options?.method || 'GET') + path + (options?.body || '');
    if (memo.has(key)) return memo.get(key);

    const request = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const response = await fetch(base + path, { ...options, signal: controller.signal });
        if (!response.ok) return null;
        return await response.json();
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })();

    memo.set(key, request);
    return request;
  }

  /* Our catalogue stores titles; Genius works in ids. */
  async function songId(track, album) {
    const found = await get(`/api/search?q=${encodeURIComponent(`${track.name} ${NBHD_CONFIG.artist}`)}&artist=neighbourhood`);
    if (!found?.results?.length) return null;
    const wanted = String(track.name).toLowerCase();
    const exact = found.results.find(row => String(row.title).toLowerCase() === wanted);
    return (exact || found.results[0]).id;
  }

  /* Everything the track window can show, in one round trip plus annotations. */
  async function track(trackRecord, album, lines) {
    if (!enabled) return null;
    const id = await songId(trackRecord, album);
    if (!id) return null;

    const [song, matched] = await Promise.all([
      get(`/api/songs/${id}`),
      Array.isArray(lines) && lines.length
        ? get(`/api/songs/${id}/annotations/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lines })
          })
        : Promise.resolve(null)
    ]);
    if (!song) return null;
    return { id, ...song, annotations: matched };
  }

  const artist = (id, slug) => enabled
    ? get(`/api/artists/${encodeURIComponent(id || 'local')}/hybrid${slug ? `?slug=${encodeURIComponent(slug)}` : ''}`)
    : Promise.resolve(null);

  return { enabled, base, track, artist, songId };
})();
