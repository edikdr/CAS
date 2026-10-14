import test from 'node:test';
import assert from 'node:assert/strict';
import { createRightsGate, RightsGate } from '../core/rights.js';
import { realRights } from './helpers.mjs';

const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

test('private preview allows every class, public only cleared ones', async () => {
  const cfg = await realRights();
  const priv = createRightsGate({ ...cfg, buildMode: 'private-preview' });
  const pub = createRightsGate({ ...cfg, buildMode: 'public' });
  for (const name of Object.keys(cfg.classes)) {
    assert.equal(priv.allows(name), true, name);
    assert.equal(pub.allows(name), cfg.classes[name].cleared === true, name);
  }
  assert.equal(pub.allows('coverArt'), false);
  assert.equal(pub.allows('photosOfHer'), false);
  assert.equal(pub.allows('previewAudio'), true);
  assert.equal(pub.isPublic, true);
  assert.equal(priv.isPublic, false);
});

test('unknown class is refused (fail closed)', async () => {
  const gate = createRightsGate({ ...(await realRights()), buildMode: 'private-preview' });
  assert.equal(quiet(() => gate.allows('coverart')), false);
});

test('lyric permissions per build mode', () => {
  const classes = { lyrics: { cleared: false } };
  const priv = createRightsGate({ buildMode: 'private-preview', classes });
  const pub = createRightsGate({ buildMode: 'public', classes });
  const pubCleared = createRightsGate({ buildMode: 'public', classes: { lyrics: { cleared: true } } });
  assert.deepEqual(['none', 'private-preview', 'granted', undefined, 'yes'].map(priv.allowsLyrics), [false, true, true, false, false]);
  assert.deepEqual(['none', 'private-preview', 'granted'].map(pub.allowsLyrics), [false, false, false]);
  assert.deepEqual(['none', 'private-preview', 'granted'].map(pubCleared.allowsLyrics), [false, false, true]);
});

test('the singleton refuses everything before load()', () => {
  assert.equal(RightsGate.allows('fontsOFL'), false);
  assert.equal(RightsGate.allowsLyrics('granted'), false);
});
