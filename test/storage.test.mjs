import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, KEYS } from '../core/storage.js';

function mapBackend() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('round-trips JSON under a namespaced key', () => {
  const b = mapBackend();
  const s = createStorage(b);
  s.set('theme', 'prologue');
  s.set('quizBest', { a: 7 });
  assert.equal(s.get('theme'), 'prologue');
  assert.deepEqual(s.get('quizBest'), { a: 7 });
  assert.equal(b.m.get('sunniva:theme'), '"prologue"');
  s.remove('theme');
  assert.equal(s.get('theme', 'plain'), 'plain');
});

test('unknown keys are a programming error', () => {
  const s = createStorage(mapBackend());
  assert.throws(() => s.set('speed', 1), TypeError);
  assert.throws(() => s.get('speed'), TypeError);
  assert.ok(KEYS.includes('lights') && KEYS.includes('guitarMode') && KEYS.includes('lyricMode'));
});

test('no storage at all: works in memory for the session', () => {
  const s = createStorage(null);
  assert.equal(s.get('lights', true), true);
  s.set('lights', false);
  assert.equal(s.get('lights', true), false);
});

test('storage that throws (blocked, quota): never throws, keeps the value in memory', () => {
  const boom = () => { throw new Error('SecurityError'); };
  const s = createStorage({ getItem: boom, setItem: boom, removeItem: boom });
  assert.equal(s.get('motion', 'on'), 'on');
  s.set('motion', 'off');
  assert.equal(s.get('motion', 'on'), 'off');
  s.remove('motion');
  assert.equal(s.get('motion', 'on'), 'on');
});

test('corrupt stored JSON falls back', () => {
  const b = mapBackend();
  b.m.set('sunniva:theme', '{oops');
  assert.equal(createStorage(b).get('theme', 'plain'), 'plain');
});
