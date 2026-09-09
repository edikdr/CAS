#!/usr/bin/env node
/* ============================================================
   The bridge, exercised against a stubbed Genius and LRCLIB.

     node tools/genius.test.mjs

   No network and no token needed: global fetch is replaced, so this
   checks the logic that a live call would hide — that the right song is
   picked out of a hostile result list, that the bearer goes to Genius
   and nowhere else, that a 401 does not take the lyrics down with it,
   and that a deployment with no token still answers.

   Run it after changing api/_genius.mjs. Read the output; every line is
   a claim the file makes about itself.
   ============================================================ */

import { handle } from '../api/_genius.mjs';

const calls = [];
const reply = body => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), auth: opts?.headers?.Authorization || null });
  const u = new URL(url);

  if (u.hostname === 'api.genius.com' && u.pathname === '/search') {
    return reply({ response: { hits: [
      // deliberately hostile ordering: a translation and a wrong artist first
      { type: 'song', result: { id: 1, title: 'Undead (Traduction française)',
        primary_artist: { name: 'Genius Traductions' } } },
      { type: 'song', result: { id: 2, title: 'Undead',
        primary_artist: { name: 'Some Other Band' } } },
      { type: 'song', result: { id: 3, title: 'Undead', lyrics_state: 'complete',
        primary_artist: { name: 'Hollywood Undead' } } }
    ] } });
  }
  if (u.hostname === 'api.genius.com' && u.pathname.startsWith('/songs/')) {
    return reply({ response: { song: {
      id: Number(u.pathname.split('/')[2]), title: 'Undead',
      full_title: 'Undead by Hollywood Undead', url: 'https://genius.com/x',
      primary_artist: { name: 'Hollywood Undead', url: 'https://genius.com/artists/x' },
      featured_artists: [], annotation_count: 41, stats: { pageviews: 900000 },
      producer_artists: [{ name: 'Don Gilmore' }],
      writer_artists: [{ name: 'Jorel Decker' }, { name: 'Aron Erlichman' }],
      album: { name: 'Swan Songs', url: 'https://genius.com/albums/y',
               cover_art_url: 'https://images.genius.com/cover.jpg' },
      release_date_for_display: 'September 2, 2008',
      description: { plain: 'The song that names the band to itself.' },
      media: [{ provider: 'youtube', url: 'https://youtu.be/x' }, { provider: 'bad' }]
    } } });
  }
  if (u.hostname === 'lrclib.net') {
    return reply({ duration: 200,
      syncedLyrics: '[00:12.00]Undead, undead\n[00:18.50]So how you gonna cope\n[00:24.00]' });
  }
  throw new Error('unexpected host ' + u.hostname);
};

const show = (label, v) => console.log(label.padEnd(34), v);

// ---- 1. status, both ways
show('status, no token:', JSON.stringify((await handle({ op: 'status' }, {})).body));
show('status, token:', JSON.stringify(
  (await handle({ op: 'status' }, { GENIUS_ACCESS_TOKEN: 't' })).body));

// ---- 2. a full track with a token
const r = await handle({ op: 'track', title: 'Undead (Explicit)', album: 'Swan Songs' },
                       { GENIUS_ACCESS_TOKEN: 'secret-token' });
const b = r.body;
show('picked the right song id:', b.song.id + (b.song.id === 3 ? '  (skipped translation + wrong artist)' : '  WRONG'));
show('title cleaned for lookup:', JSON.stringify(calls[0].url.split('q=')[1]));
show('bearer sent to genius:', calls[0].auth);
show('bearer sent to lrclib:', String(calls.find(c => c.url.includes('lrclib')).auth));
show('writers:', b.song.writers.join(', '));
show('producers:', b.song.producers.join(', '));
show('album / released:', `${b.song.album.name} / ${b.song.releaseDate}`);
show('album cover suppressed:', String(!('cover' in b.song.album) && !JSON.stringify(b.song).includes('cover_art')));
show('description:', b.song.description);
show('media (bad row dropped):', JSON.stringify(b.song.media));
show('lyrics lines / synced:', `${b.lyrics.lines.length} / ${b.lyrics.synced}`);
show('attribution:', JSON.stringify(b.attribution));

// ---- 3. cached second time
const before = calls.length;
await handle({ op: 'track', title: 'Undead (Explicit)', album: 'Swan Songs' },
             { GENIUS_ACCESS_TOKEN: 'secret-token' });
show('second call hit the cache:', String(calls.length === before));

// ---- 4. no token: words still arrive, credits do not
const n = await handle({ op: 'track', title: 'Sell Your Soul' }, {});
show('no token -> lyrics:', String(!!n.body.lyrics) + ', song: ' + String(n.body.song));
show('no token -> configured:', String(n.body.configured));

// ---- 5. a 401 does not take the words down with it
globalThis.fetch = async url => {
  if (String(url).includes('api.genius.com')) {
    const e = { ok: false, status: 401, statusText: 'Unauthorized' }; return e;
  }
  return reply({ plainLyrics: 'a line\nanother line' });
};
const bad = await handle({ op: 'track', title: 'Another Way Out' }, { GENIUS_ACCESS_TOKEN: 'wrong' });
show('bad token -> error text:', bad.body.error);
show('bad token -> lyrics still:', String(bad.body.lyrics.lines.length) + ' lines');

// ---- 6. no title is a 400
show('missing title:', (await handle({ op: 'track' }, {})).status);
