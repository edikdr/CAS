import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, readJson } from '../tools/lib.mjs';
import { validateRoot, checkTracks, checkReceipts, checkBeats, checkLyrics, checkRights, checkFacts } from '../tools/validate.mjs';

const load = (rel) => readJson(path.join(ROOT, rel));
const copy = (v) => structuredClone(v);

test('the kit data is valid', async () => {
  assert.deepEqual(await validateRoot(ROOT), []);
});

test('tracks: counts and cross-references are enforced', async () => {
  const releases = await load('data/releases.json');
  const tracks = await load('data/tracks.json');
  const fewer = copy(tracks);
  fewer.tracks.pop();
  assert.ok(checkTracks(fewer, releases).some((e) => /32 rows, expected 33/.test(e)));
  const badRef = copy(tracks);
  badRef.tracks.find((t) => t.alsoOnAlbumTrackId).alsoOnAlbumTrackId = 1;
  assert.ok(checkTracks(badRef, releases).some((e) => /alsoOnAlbumTrackId/.test(e)));
  const badPreview = copy(tracks);
  badPreview.tracks[0].previewUrl = 'http://example.com/p.m4a';
  assert.ok(checkTracks(badPreview, releases).some((e) => /previewUrl/.test(e)));
});

test('receipts: 17/7/8/1 and release types', async () => {
  const [releases, tracks, receipts] = await Promise.all(['releases', 'tracks', 'receipts'].map((n) => load(`data/${n}.json`)));
  const moved = copy(receipts);
  moved.receipts[1].trackIds.push(moved.receipts[0].trackIds.pop());
  const e = checkReceipts(moved, tracks, releases);
  assert.ok(e.some((x) => /album: 16 rows, expected 17/.test(x)));
  assert.ok(e.some((x) => /singles: track \d+ is from a album release/.test(x)));
});

test('beats: must match a track, numeric bpm, sorted data inside the clip', async () => {
  const tracks = await load('data/tracks.json');
  const good = await load('data/beats/6808001979.json');
  assert.deepEqual(checkBeats(good, 6808001979, tracks), []);
  assert.ok(checkBeats({ ...good, bpm: '99' }, 6808001979, tracks).some((e) => /bpm/.test(e)));
  assert.ok(checkBeats({ ...good, trackId: 1 }, 1, tracks).some((e) => /no track with id 1/.test(e)));
  assert.ok(checkBeats({ ...good, beats: [2, 1] }, 6808001979, tracks).some((e) => /beats must be sorted/.test(e)));
  assert.ok(checkBeats({ ...good, onsets: [{ t: 1, s: 2 }] }, 6808001979, tracks).some((e) => /onsets/.test(e)));
});

test('lyrics, facts and rights shapes', async () => {
  const tracks = await load('data/tracks.json');
  const doc = { trackId: 6808001979, permission: 'private-preview', source: 'elevenlabs-scribe-draft', reviewedByHuman: false, lines: [{ t: 0.4, end: 3, text: 'la la', words: [{ t: 0.4, end: 1, text: 'la' }] }] };
  assert.deepEqual(checkLyrics(doc, 6808001979, tracks), []);
  assert.ok(checkLyrics({ ...doc, permission: 'yes' }, 6808001979, tracks).some((e) => /permission/.test(e)));
  assert.ok(checkLyrics({ ...doc, lines: [{ t: 3, end: 2, text: 'x' }] }, 6808001979, tracks).some((e) => /lines/.test(e)));
  assert.ok(checkRights({ buildMode: 'private-preview', classes: { a: { cleared: 'no' } } }).length > 0);
  assert.deepEqual(checkRights(await load('config/rights.json')), []);
  assert.ok(checkFacts([{ claim: 'x', value: 1, source: 'http://a', retrieved: '2026-10-14', verified: true }]).length > 0);
});
