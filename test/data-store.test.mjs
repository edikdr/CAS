import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDataStore } from '../core/data-store.js';
import { createRightsGate } from '../core/rights.js';
import { ROOT } from '../tools/lib.mjs';
import { diskJson, realRights } from './helpers.mjs';

const base = pathToFileURL(path.join(ROOT, 'data') + '/');
const SHALLOW_END = 6808001979;
const SURFACE_TENSION_ALBUM = 6808001985; // its single row duplicates the song and has no beats file

async function store({ mode = 'private-preview', lyrics = {}, facts } = {}) {
  const rights = createRightsGate({ ...(await realRights()), buildMode: mode });
  const load = async (url) => {
    const m = /lyrics\/(\d+)\.json$/.exec(url.href);
    if (m) return lyrics[m[1]] ?? null;
    if (url.href.endsWith('facts/verification.json')) return facts ?? null;
    return diskJson(url);
  };
  return createDataStore({ load, rights, base }).load();
}

const lyricDoc = (trackId, permission) => ({
  trackId, permission, source: 'owner-supplied', reviewedByHuman: true,
  lines: [{ t: 1, end: 2, text: 'la la la' }],
});

test('load() exposes releases, tracks and the 17/7/8/1 receipts', async () => {
  const ds = await store();
  assert.equal(ds.track(SHALLOW_END).title, 'The Shallow End');
  assert.equal(ds.track(String(SHALLOW_END)).id, SHALLOW_END, 'string ids work');
  assert.equal(ds.release(6808001977).title, 'Fantasy Prologue');
  assert.deepEqual(ds.receipts().map((r) => [r.id, r.trackIds.length]), [['album', 17], ['singles', 7], ['demos', 8], ['appearances', 1]]);
  assert.equal(ds.track(1), null);
  assert.ok(Object.isFrozen(ds.track(SHALLOW_END)) && Object.isFrozen(ds.receipts()));
});

test('methods before load() throw', () => {
  const ds = createDataStore({ load: diskJson, base });
  assert.throws(() => ds.track(SHALLOW_END), /load\(\) first/);
});

test('beats(): data for analysed tracks, null for missing files and unknown ids', async () => {
  const ds = await store();
  const b = await ds.beats(SHALLOW_END);
  assert.equal(typeof b.bpm, 'number');
  assert.equal(b.trackId, SHALLOW_END);
  assert.equal(await ds.beats(SHALLOW_END), b, 'cached');
  const dupSingle = ds.receipts().find((r) => r.id === 'singles').trackIds
    .map((id) => ds.track(id)).find((t) => t.alsoOnAlbumTrackId === SURFACE_TENSION_ALBUM);
  assert.ok(dupSingle, 'Surface Tension single row exists');
  assert.equal(await ds.beats(dupSingle.id), null);
  assert.equal(await ds.beats(42), null);
});

test('lyrics(): only with a permission this build allows', async () => {
  const lyrics = { [SHALLOW_END]: lyricDoc(SHALLOW_END, 'private-preview') };
  const priv = await store({ lyrics });
  assert.equal((await priv.lyrics(SHALLOW_END)).lines[0].text, 'la la la');
  const pub = await store({ mode: 'public', lyrics });
  assert.equal(await pub.lyrics(SHALLOW_END), null, 'class not cleared in public build');

  const none = await store({ lyrics: { [SHALLOW_END]: lyricDoc(SHALLOW_END, 'none') } });
  assert.equal(await none.lyrics(SHALLOW_END), null);
  const missingField = await store({ lyrics: { [SHALLOW_END]: { ...lyricDoc(SHALLOW_END), permission: undefined } } });
  assert.equal(await missingField.lyrics(SHALLOW_END), null);
  const wrongTrack = await store({ lyrics: { [SHALLOW_END]: lyricDoc(1, 'granted') } });
  assert.equal(await wrongTrack.lyrics(SHALLOW_END), null);
  assert.equal(await priv.lyrics(6808001984), null, 'no file');
});

test('facts(): verified entries only, [] when the file is absent', async () => {
  assert.deepEqual(await (await store()).facts(), []);
  const ds = await store({ facts: [{ claim: 'a', verified: true }, { claim: 'b', verified: false }] });
  assert.deepEqual((await ds.facts()).map((f) => f.claim), ['a']);
});
