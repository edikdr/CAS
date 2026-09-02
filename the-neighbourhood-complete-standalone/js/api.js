/* ---------------------------------------------------------------------------
   API — every live source the archive talks to, in one place.

   iTunes Search   : catalogue metadata, artwork and 30-second audio previews
   LRCLIB          : lyrics (plain + time-synced), no key, no account
   Wikimedia REST  : band summary

   None of these require an API key, so nothing secret is shipped in the page.
--------------------------------------------------------------------------- */

const Api = (() => {
  'use strict';

  const TIMEOUT = 9000;
  const listeners = new Set();

  const status = {
    itunes: { label: 'ITUNES CATALOGUE', state: 'idle', detail: 'not contacted', reached: false },
    lyrics: { label: 'LRCLIB LYRICS', state: 'idle', detail: 'not contacted', reached: false },
    wiki: { label: 'WIKIMEDIA', state: 'idle', detail: 'not contacted', reached: false }
  };

  const notify = () => listeners.forEach(fn => fn(status));

  const setStatus = (key, state, detail) => {
    if (!status[key]) return;
    status[key].state = state;
    status[key].detail = detail;
    if (state === 'live') status[key].reached = true;
    notify();
  };

  /* A source that answered is reachable. One album with no confident match, or a
     track with no lyrics on file, is a miss — not an outage — so it must not drag
     the whole source back to "offline". Only a transport failure does that. */
  const noteFailure = (key, error) => {
    if (!status[key]) return;
    const message = String(error?.message || error);
    if (error?.kind !== 'transport' && status[key].reached) {
      status[key].state = 'live';
      status[key].detail = message;
    } else {
      status[key].state = 'offline';
      status[key].reached = false;
      status[key].detail = message;
    }
    notify();
  };

  const onStatus = (fn) => { listeners.add(fn); fn(status); };

  const apiError = (message, kind) => Object.assign(new Error(message), { kind });

  async function getJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    let response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    } catch (error) {
      throw apiError(error?.name === 'AbortError' ? 'timed out' : 'unreachable', 'transport');
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw apiError(`HTTP ${response.status}`, 'http');
    return response.json();
  }

  /* ---- name matching --------------------------------------------------- */

  const norm = (value) => String(value ?? '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const score = (a, b) => {
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.startsWith(y) || y.startsWith(x)) return .85;
    if (x.includes(y) || y.includes(x)) return .7;
    const xa = new Set(x.split(' '));
    const ya = y.split(' ');
    const hits = ya.filter(word => xa.has(word)).length;
    return hits / Math.max(xa.size, ya.length);
  };

  const isTheBand = (name) => /neighbo(u)?rhood/i.test(name || '');

  /* ---- iTunes ---------------------------------------------------------- */

  const albumCache = new Map();
  const trackCache = new Map();
  let resolvedReleases = 0;

  const bigArt = (url) => String(url || '').replace(/\/\d+x\d+bb\./, '/600x600bb.');

  async function itunesAlbum(album) {
    if (albumCache.has(album.id)) return albumCache.get(album.id);
    const request = (async () => {
      setStatus('itunes', 'checking', `resolving ${album.title}`);
      const term = `${NBHD_CONFIG.artist} ${album.title}`;
      const found = await getJSON(`${NBHD_CONFIG.itunesSearch}?term=${encodeURIComponent(term)}&entity=album&limit=25`);
      const candidates = (found.results || []).filter(row => isTheBand(row.artistName));
      if (!candidates.length) throw new Error('album not found');
      candidates.sort((a, b) => {
        const diff = score(b.collectionName, album.title) - score(a.collectionName, album.title);
        if (Math.abs(diff) > .01) return diff;
        const ya = Math.abs(Number(String(a.releaseDate).slice(0, 4)) - album.year);
        const yb = Math.abs(Number(String(b.releaseDate).slice(0, 4)) - album.year);
        return ya - yb;
      });
      const best = candidates[0];
      if (score(best.collectionName, album.title) < .45) throw new Error('no confident album match');

      const detail = await getJSON(`${NBHD_CONFIG.itunesLookup}?id=${best.collectionId}&entity=song&limit=200`);
      const songs = (detail.results || [])
        .filter(row => row.wrapperType === 'track' && row.kind === 'song')
        .sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber))
        .map(row => ({
          name: row.trackName,
          number: row.trackNumber,
          seconds: Math.round((row.trackTimeMillis || 0) / 1000),
          preview: row.previewUrl || null,
          artwork: bigArt(row.artworkUrl100),
          storeUrl: row.trackViewUrl || null
        }));
      if (!songs.length) throw new Error('empty tracklist');

      const result = {
        collectionId: best.collectionId,
        title: best.collectionName,
        year: Number(String(best.releaseDate).slice(0, 4)) || album.year,
        artwork: bigArt(best.artworkUrl100),
        storeUrl: best.collectionViewUrl || null,
        copyright: best.copyright || '',
        tracks: songs
      };
      songs.forEach(song => trackCache.set(`${norm(song.name)}|${norm(best.collectionName)}`, song));
      resolvedReleases += 1;
      setStatus('itunes', 'live', `${resolvedReleases} release${resolvedReleases === 1 ? '' : 's'} resolved`);
      return result;
    })().catch(error => {
      noteFailure('itunes', error);
      albumCache.delete(album.id);
      throw error;
    });
    albumCache.set(album.id, request);
    return request;
  }

  /* Single-track resolution — used for previews when the album lookup
     did not cover the exact title (alternate spellings, singles, EPs). */
  async function itunesTrack(trackName, albumTitle) {
    const key = `${norm(trackName)}|${norm(albumTitle)}`;
    if (trackCache.has(key)) return trackCache.get(key);
    try {
      const term = `${NBHD_CONFIG.artist} ${trackName}`;
      const found = await getJSON(`${NBHD_CONFIG.itunesSearch}?term=${encodeURIComponent(term)}&entity=song&limit=25`);
      const rows = (found.results || []).filter(row => isTheBand(row.artistName));
      if (!rows.length) throw new Error('no track');
      rows.sort((a, b) => {
        const byName = score(b.trackName, trackName) - score(a.trackName, trackName);
        if (Math.abs(byName) > .01) return byName;
        const byAlbum = score(b.collectionName, albumTitle) - score(a.collectionName, albumTitle);
        if (Math.abs(byAlbum) > .01) return byAlbum;
        return (b.previewUrl ? 1 : 0) - (a.previewUrl ? 1 : 0);
      });
      const withPreview = rows.find(row => row.previewUrl && score(row.trackName, trackName) >= .6) || rows[0];
      const hit = {
        name: withPreview.trackName,
        number: withPreview.trackNumber,
        seconds: Math.round((withPreview.trackTimeMillis || 0) / 1000),
        preview: withPreview.previewUrl || null,
        artwork: bigArt(withPreview.artworkUrl100),
        storeUrl: withPreview.trackViewUrl || null
      };
      trackCache.set(key, hit);
      if (hit.preview) setStatus('itunes', 'live', 'preview stream resolved');
      return hit;
    } catch (error) {
      trackCache.set(key, null);
      noteFailure('itunes', error);
      return null;
    }
  }

  /* ---- LRCLIB ---------------------------------------------------------- */

  const lyricCache = new Map();

  const parseSynced = (raw) => String(raw || '')
    .split('\n')
    .map(line => {
      const match = line.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
      if (!match) return null;
      const text = match[4].trim();
      return { t: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`), text };
    })
    .filter(line => line && line.text);

  const parsePlain = (raw) => String(raw || '')
    .split('\n')
    .map(line => line.trim())
    .filter((line, index, all) => line || (all[index - 1] || '').length > 0);

  async function lyrics(track, album) {
    const key = `${norm(track.name)}|${norm(album.title)}`;
    if (lyricCache.has(key)) return lyricCache.get(key);

    const request = (async () => {
      setStatus('lyrics', 'checking', `looking up ${track.name}`);
      const attempts = [];
      if (track.seconds) {
        attempts.push(`${NBHD_CONFIG.lyricsGet}?artist_name=${encodeURIComponent(NBHD_CONFIG.artist)}&track_name=${encodeURIComponent(track.name)}&album_name=${encodeURIComponent(album.title)}&duration=${track.seconds}`);
      }
      attempts.push(`${NBHD_CONFIG.lyricsGet}?artist_name=${encodeURIComponent(NBHD_CONFIG.artist)}&track_name=${encodeURIComponent(track.name)}`);

      for (const url of attempts) {
        try {
          const row = await getJSON(url);
          if (row && (row.plainLyrics || row.syncedLyrics || row.instrumental)) {
            setStatus('lyrics', 'live', 'exact match');
            return shape(row);
          }
        } catch (_) { /* fall through to search */ }
      }

      const rows = await getJSON(`${NBHD_CONFIG.lyricsSearch}?q=${encodeURIComponent(`${track.name} ${NBHD_CONFIG.artist}`)}`);
      const list = (rows || []).filter(row => isTheBand(row.artistName));
      if (!list.length) throw new Error('no lyrics found');
      list.sort((a, b) => {
        const byName = score(b.trackName, track.name) - score(a.trackName, track.name);
        if (Math.abs(byName) > .01) return byName;
        return (b.syncedLyrics ? 1 : 0) - (a.syncedLyrics ? 1 : 0);
      });
      const best = list[0];
      if (score(best.trackName, track.name) < .55) throw new Error('no confident lyric match');
      setStatus('lyrics', 'live', 'matched by search');
      return shape(best);
    })().catch(error => {
      noteFailure('lyrics', error);
      const local = LOCAL_LYRIC_EXCERPTS[norm(track.name).replace(/\s+/g, ' ')] || LOCAL_LYRIC_EXCERPTS[track.name.toLowerCase()] || null;
      return local
        ? { source: 'archive', instrumental: false, synced: local, plain: local.map(line => line.text), partial: true }
        : null;
    });

    lyricCache.set(key, request);
    return request;
  }

  function shape(row) {
    const synced = parseSynced(row.syncedLyrics);
    const plain = parsePlain(row.plainLyrics);
    return {
      source: 'lrclib',
      instrumental: Boolean(row.instrumental),
      synced,
      plain: plain.length ? plain : synced.map(line => line.text),
      duration: row.duration || 0,
      partial: false
    };
  }

  /* ---- Wikimedia ------------------------------------------------------- */

  async function wiki() {
    setStatus('wiki', 'checking', 'requesting summary');
    try {
      const data = await getJSON(NBHD_CONFIG.wikiSummary);
      setStatus('wiki', 'live', 'summary received');
      return data.extract || '';
    } catch (error) {
      noteFailure('wiki', error);
      return '';
    }
  }

  return { status, onStatus, setStatus, noteFailure, itunesAlbum, itunesTrack, lyrics, wiki, norm, score };
})();
