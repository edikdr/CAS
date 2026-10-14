import test from 'node:test';
import assert from 'node:assert/strict';
import { groupWords } from '../tools/lyrics-from-words.mjs';
import { fixtureLines } from '../tools/make-lyric-fixture.mjs';
import { checkLyrics } from '../tools/validate.mjs';
import { wordTimes } from '../core/lyrics/word-times.js';

// the adapter's imports touch browser globals at load time; give them the minimum
globalThis.location ??= { hostname: 'test', search: '' };
globalThis.document ??= {
  hidden: false,
  addEventListener() {},
  createElement: () => ({ className: '', setAttribute() {}, remove() {} }),
};
const { attachLyrics, jsonSource, lineFor, toLine } = await import('../core/lyrics/engine-adapter.js');

const w = (t, end, text) => ({ t, end, text });

test('groupWords: lines break on pauses >= 0.45 s, sentence ends and 7 words', () => {
  const lines = groupWords([
    w(1.0, 1.2, 'one'), w(1.3, 1.5, 'two'), w(2.1, 2.3, 'three.'), w(2.35, 2.5, 'four'),
    ...Array.from({ length: 8 }, (_, i) => w(2.6 + i * 0.2, 2.7 + i * 0.2, `w${i}`)),
  ]);
  assert.deepEqual(lines.map((l) => l.text), ['one two', 'three.', 'four w0 w1 w2 w3 w4 w5', 'w6 w7']);
  assert.deepEqual([lines[0].t, lines[0].end], [1, 1.5]);
  assert.equal(lines[0].words.length, 2);
});

test('fixture lines follow the beat grid and pass the lyrics schema', () => {
  const beats = Array.from({ length: 40 }, (_, i) => 0.4 + i * 0.6);
  const lines = fixtureLines(beats);
  assert.ok(lines.length >= 5);
  assert.ok(lines.every((l) => /^(la|da|na)( (la|da|na)){3}$/.test(l.text)), 'placeholder words only');
  const doc = { trackId: 6808001979, permission: 'private-preview', source: 'fixture', reviewedByHuman: false, lines };
  assert.deepEqual(checkLyrics(doc, 6808001979, { tracks: [{ id: 6808001979 }] }), []);
});

test('wordTimes uses word timings or spreads by length', () => {
  const own = [w(1, 1.4, 'a'), w(1.5, 2, 'b')];
  assert.equal(wordTimes({ text: 'a b', startSec: 1, endSec: 2, words: own }), own);
  const spread = wordTimes({ text: 'aa b', startSec: 0, endSec: 1 });
  assert.equal(spread.length, 2);
  assert.equal(spread[0].t, 0);
  assert.ok(spread[1].t > 0.5 && spread[1].end <= 0.9 + 1e-9);
});

test('engine helpers: our JSON is the only source, events map back to our lines', async () => {
  const lines = [{ t: 1, end: 2, text: 'la la', words: [w(1, 1.4, 'la'), w(1.5, 2, 'la')] }, { t: 3, end: 4, text: 'da da' }];
  assert.deepEqual(await jsonSource(lines)(), { synced: [{ t: 1, text: 'la la' }, { t: 3, text: 'da da' }], plain: null, duration: null });
  assert.equal(lineFor(lines, { index: 1, t: 3 }), lines[1]);
  assert.equal(lineFor(lines, { index: 0, t: 3 }), lines[1], 'falls back to the start time');
  assert.equal(lineFor(lines, { index: 0, t: 9 }), null);
  assert.deepEqual(toLine(lines[0]), { text: 'la la', startSec: 1, endSec: 2, words: lines[0].words });
});

function fakes(doc) {
  const calls = { engineLoaded: 0, created: null, offset: null, opened: false, destroyed: false, setLine: [], clear: 0 };
  const handlers = {};
  const engine = {
    on: (type, fn) => { handlers[type] = fn; },
    setOffset: (s) => { calls.offset = s; },
    open: () => { calls.opened = true; },
    destroy: () => { calls.destroyed = true; },
  };
  return {
    calls, handlers,
    store: { lyrics: async () => doc, track: () => ({ title: 'The Shallow End', artistCredit: 'sunniva' }) },
    player: { audio: {}, isPlaying: () => false, currentTime: () => 0, on: () => () => {} },
    clock: { latencyOffsetMs: 120, time: () => 0 },
    loadEngine: async () => { calls.engineLoaded++; return { default: { create: (opts) => { calls.created = opts; return engine; } } }; },
    renderer: { mount() {}, setLine: (l) => calls.setLine.push(l), clear: () => { calls.clear++; }, destroy() {} },
  };
}

test('no lyrics allowed: the engine is never loaded and nothing is rendered', async () => {
  const f = fakes(null);
  const detach = await attachLyrics({ host: { append() {} }, trackId: 6808001979, ...f });
  assert.equal(detach, null);
  assert.equal(f.calls.engineLoaded, 0);
  assert.deepEqual(f.calls.setLine, []);
});

test('with lyrics: engine gets only our source, offset = -latency, events drive the renderer', async () => {
  const lines = [{ t: 2, end: 3.5, text: 'la la la', words: [w(2, 2.4, 'la'), w(2.5, 2.9, 'la'), w(3, 3.5, 'la')] }];
  const f = fakes({ trackId: 6808001979, permission: 'private-preview', lines });
  const detach = await attachLyrics({ host: { append() {} }, trackId: 6808001979, ...f });
  const opts = f.calls.created;
  assert.equal(opts.sources.length, 1);
  assert.deepEqual(await opts.sources[0](), { synced: [{ t: 2, text: 'la la la' }], plain: null, duration: null });
  assert.equal(opts.calibration, false);
  assert.equal(opts.closeButton, false);
  assert.equal(opts.analyser, false);
  assert.equal(f.calls.offset, -0.12);
  assert.ok(f.calls.opened);
  f.handlers.line({ index: 0, t: 2, text: 'la la la' });
  assert.deepEqual(f.calls.setLine, [{ text: 'la la la', startSec: 2, endSec: 3.5, words: lines[0].words }]);
  f.handlers.gap({ active: true });
  f.handlers.state('error');
  assert.equal(f.calls.clear, 2);
  detach();
  assert.ok(f.calls.destroyed);
});
