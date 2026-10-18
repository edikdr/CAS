// Unit tests for the Scribe → LRC builder (neutral placeholder words, no lyrics).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWords, buildLines, toLrc, fmtStamp, languageHints } from '../../tools/transcribe-scribe.mjs';

const w = (text, start, end, extra = {}) => ({ text, start, end, type: 'word', logprob: -0.05, ...extra });

test('stamps are [mm:ss.xx] relative to the preview', () => {
  assert.equal(fmtStamp(0), '[00:00.00]');
  assert.equal(fmtStamp(7.456), '[00:07.46]');
  assert.equal(fmtStamp(29.999), '[00:30.00]');
  assert.equal(fmtStamp(-1), '[00:00.00]');
  assert.equal(fmtStamp(59.999), '[01:00.00]');
});

test('drops spacing/audio events and low-confidence words, merges punctuation fragments', () => {
  const words = [
    w('alpha', 0.4, 0.7), { text: ' ', start: 0.7, end: 0.75, type: 'spacing' }, w('bravo', 0.75, 1.1),
    w(',', 1.1, 1.1), { text: '(music)', start: 1.2, end: 2, type: 'audio_event' }, w('[noise]', 2, 2.1),
    w('charlie', 2.2, 2.5, { logprob: -3 }), w('delta', 2.6, 2.9), w('echo', 3, 3.2, { start: null }),
  ];
  assert.deepEqual(cleanWords(words).map((x) => x.text), ['alpha', 'bravo,', 'delta']);
});

test('1–3 words per line; breaks on punctuation and gaps', () => {
  const words = cleanWords([w('one', 0, 0.2), w('two', 0.25, 0.4), w('three', 0.45, 0.6), w('four', 0.65, 0.8),
    w('five.', 0.85, 1), w('six', 1.05, 1.2), w('seven', 2.5, 2.7)]);
  const lines = buildLines(words);
  assert.deepEqual(lines.map((l) => l.text), ['one two three', 'four five.', 'six', 'seven']);
  assert.equal(lines[3].t, 2.5);
  const lrc = toLrc(lines, { model: 'scribe_v2' });
  assert.match(lrc, /^\[re:scribe_v2\]\n\[length:00:30\]\n\[offset:0\]\n\[00:00\.00\]one two three\n/);
});

test('words past the 30 s preview are dropped; previews cut mid-phrase are tolerated', () => {
  assert.deepEqual(cleanWords([w('tail', 29.9, 30.4), w('gone', 31, 31.2)]).map((x) => x.text), ['tail']);
  assert.deepEqual(buildLines([]), []);
});

test('language hints (heuristic)', () => {
  assert.deepEqual(languageHints([{ text: 'amb' }, { text: 'the' }]), ['ca', 'en']);
  assert.deepEqual(languageHints([{ text: 'zulu' }]), []);
});
