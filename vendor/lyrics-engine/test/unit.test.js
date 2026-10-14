// Node unit tests (no DOM): `node --test lyrics-engine/test/`
// All lyric text here is invented filler, not taken from any song.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LE = require('../lyrics-engine.js');
const I = LE._internals;

/* ---------- LRC ---------- */

test('parseLRC: tags, several stamps, 2/3-digit fractions, pauses', () => {
  const lrc = [
    '[ar:Somebody]',
    '[ti:Something]',
    '[offset:+120]',
    '[00:12.34]alpha bravo',
    '[00:15.5][01:02.345]charlie  delta',
    '[00:20.00]',
    '[00:21.00]♪',
    '[00:22]<00:22.10>echo <00:22.60>foxtrot',
    'no stamp here'
  ].join('\n');
  const l = LE.parseLRC(lrc);
  assert.deepEqual(l.map(x => x.t), [12.34, 15.5, 20, 21, 22, 62.345]);
  assert.equal(l[0].text, 'alpha bravo');
  assert.equal(l[1].text, 'charlie delta');
  assert.equal(l[5].text, 'charlie delta');
  assert.equal(l[2].text, '');
  assert.equal(l[4].text, 'echo foxtrot');
  assert.ok(I.isBreak(l[2].text) && I.isBreak(l[3].text) && !I.isBreak(l[0].text));
});

test('parseLRC: CRLF, BOM, stable order on equal times', () => {
  const l = LE.parseLRC('﻿[00:01.00]one\r\n[00:01.00]two\r\n');
  assert.deepEqual(l.map(x => x.text), ['one', 'two']);
});

/* ---------- matching ---------- */

test('cleanTitle strips versions, feat, brackets and apostrophe variants', () => {
  assert.equal(I.cleanTitle('Don’t Stop (Remastered 2011)'), 'dont stop');
  assert.equal(I.cleanTitle("Don't Stop - 2011 Remaster"), 'dont stop');
  assert.equal(I.cleanTitle('Song Name (feat. Other Person)'), 'song name');
  assert.equal(I.cleanTitle('Song Name feat. Other Person'), 'song name');
  assert.equal(I.cleanTitle('Song Name [Live at Somewhere]'), 'song name');
  assert.equal(I.cleanTitle('Hyphen - Title'), 'hyphen title'); // a dash without version words stays
  assert.ok(I.similarity(I.cleanTitle('Café Nights'), I.cleanTitle('Cafe Nights')) > 0.95);
});

test('artist similarity tolerates credits and "the"', () => {
  assert.ok(I.artistSimilarity('The Band', 'Band') > 0.9);
  assert.ok(I.artistSimilarity('Main Act', 'Main Act, Guest & Other') > 0.9);
  assert.ok(I.artistSimilarity('Main Act', 'Totally Different') < 0.5);
});

/* ---------- sync maths ---------- */

const LINES = [
  { t: 10, text: 'one two three' },
  { t: 12, text: 'four five' },
  { t: 20, text: 'six seven eight nine' },   // 8 s to next → words over 4 s, then pause
  { t: 28, text: '' },                        // explicit pause
  { t: 31, text: 'ten' }
];

test('findLine is a binary search over start times', () => {
  assert.equal(I.findLine(LINES, 9.99), -1);
  assert.equal(I.findLine(LINES, 10), 0);
  assert.equal(I.findLine(LINES, 19.9), 1);
  assert.equal(I.findLine(LINES, 100), 4);
});

test('wordTimes: proportional to characters, capped span', () => {
  const words = ['a', 'bbb', 'cc'];          // weights 2,4,3 = 9
  const t = I.wordTimes(10, words, 4.5);
  assert.deepEqual(t.map(x => +x.toFixed(3)), [10, 11, 13]);
  assert.equal(I.lineSpan(LINES, 0), 2);
  assert.equal(I.lineSpan(LINES, 2), 4);     // capped at MAX_LINE
  assert.equal(I.lineSpan(LINES, 4), 4);     // last line
});

test('classify: out / line / pause gap / break gap / tail / after end', () => {
  const c = s => I.classify(LINES, s, { firstFull: 0, duration: 40 });
  assert.equal(c(5).phase, 'out');
  assert.deepEqual([c(10.5).phase, c(10.5).idx], ['line', 0]);
  assert.equal(c(13).phase, 'line');            // 12..20, span 4 → line till 16
  assert.equal(c(16.5).phase, 'gap');           // 16..20 is 4 s > 2.5 → wave
  assert.equal(c(16.5).why, 'pause');
  assert.equal(c(19.9).phase, 'gap');           // stays a gap until the next line
  assert.equal(c(20).phase, 'line');
  assert.equal(c(24.1).phase, 'gap');           // 24..28 = 4 s
  assert.equal(c(29).why, 'break');
  assert.equal(c(33).phase, 'line');
  assert.equal(c(36).why, 'tail');
  assert.equal(c(41).phase, 'out');
});

test('classify: short silences keep the words on screen', () => {
  const L = [{ t: 0, text: 'a b' }, { t: 6, text: 'c' }]; // span 4, silence 2 s ≤ 2.5
  assert.equal(I.classify(L, 5, {}).phase, 'line');
});

test('auto hint: a line cut by the preview start is not shown', () => {
  // the preview starts at 11.0, inside line 0 (10..12)
  const ff = I.firstFullLine(LINES, 11);
  assert.equal(ff, 1);
  assert.equal(I.classify(LINES, 11.5, { firstFull: ff }).why, 'partial');
  assert.equal(I.classify(LINES, 12, { firstFull: ff }).phase, 'line');
  // a line starting 0.2 s before the preview still counts as full
  assert.equal(I.firstFullLine(LINES, 10.2), 0);
});

/* ---------- network helpers with a fake fetch ---------- */

function fakeFetch(routes, log) {
  return async (url) => {
    log && log.push(url);
    for (const [re, body] of routes) {
      if (re.test(url)) {
        const value = typeof body === 'function' ? body(url) : body;
        if (value instanceof Error) throw value;
        if (value && value.__status) return { ok: false, status: value.__status, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => value };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

const SYNCED = '[00:10.00]filler words here\n[00:14.00]more filler words';

test('lrclib: /api/get with synced lyrics wins', async () => {
  LE.clearCache();
  const log = [];
  LE.fetch = fakeFetch([[/\/api\/get\?/, { id: 1, trackName: 'Test Song', artistName: 'Test Artist', duration: 200, syncedLyrics: SYNCED, plainLyrics: 'x' }]], log);
  const r = await LE.sources.lrclib({ artist: 'Test Artist', title: 'Test Song', album: 'LP', duration: 200 });
  assert.equal(r.synced.length, 2);
  assert.equal(log.length, 1);
  assert.match(log[0], /album_name=LP/);
  assert.match(log[0], /duration=200/);
});

test('lrclib: falls back to search, prefers synced, closest duration', async () => {
  LE.clearCache();
  LE.fetch = fakeFetch([
    [/\/api\/get\?/, { __status: 404 }],
    [/\/api\/search\?artist_name/, [
      { id: 1, trackName: 'Test Song', artistName: 'Test Artist', duration: 260, syncedLyrics: '[00:01.00]long version' },
      { id: 2, trackName: 'Test Song', artistName: 'Test Artist', duration: 201, plainLyrics: 'plain only' },
      { id: 3, trackName: 'Test Song (Remastered)', artistName: 'Test Artist', duration: 199, syncedLyrics: '[00:01.00]right version' },
      { id: 4, trackName: 'Other Song', artistName: 'Test Artist', duration: 200, syncedLyrics: '[00:01.00]wrong song' }
    ]]
  ]);
  const r = await LE.sources.lrclib({ artist: 'Test Artist', title: 'Test Song', duration: 200 });
  assert.equal(r.synced[0].text, 'right version');
  assert.equal(r.duration, 199);
});

test('engine: plain-only lyrics → no-sync, no error event', async () => {
  LE.clearCache();
  LE.fetch = fakeFetch([[/lrclib/, (u) => /\/api\/get/.test(u)
    ? { trackName: 'Plain Song', artistName: 'Test Artist', plainLyrics: 'just words', duration: 100 }
    : []]]);
  const states = [], errors = [];
  const e = LE.create({ audio: fakeAudio(), track: { artist: 'Test Artist', title: 'Plain Song' }, onState: s => states.push(s) });
  e.on('error', x => errors.push(x));
  await settle();
  assert.equal(e.state, 'no-sync');
  assert.deepEqual(states, ['loading', 'no-sync']);
  assert.equal(errors.length, 0);
});

test('engine: network failure → error state + error event', async () => {
  LE.clearCache();
  LE.fetch = async () => { throw new TypeError('offline'); };
  const errors = [];
  const e = LE.create({ audio: fakeAudio(), track: { artist: 'Nobody', title: 'Nothing' } });
  e.on('error', x => errors.push(x));
  await settle();
  assert.equal(e.state, 'error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].fatal, true);
});

test('engine: ready, offset priority, provider, setTrack race', async () => {
  LE.clearCache();
  let slow = null;
  LE.fetch = fakeFetch([[/lrclib/, (u) => {
    if (/Slow/.test(u)) return new Promise(r => { slow = r; }).then(() => ({ trackName: 'Slow', artistName: 'A', syncedLyrics: '[00:01.00]slow' }));
    if (/\/api\/get/.test(u)) return { trackName: decodeURIComponent(u.match(/track_name=([^&]*)/)[1]), artistName: 'A', syncedLyrics: SYNCED, duration: 200 };
    return [];
  }]]);
  const changes = [];
  const e = LE.create({
    audio: fakeAudio(), track: { artist: 'A', title: 'Fast' },
    offsetProvider: async (t) => (t.title === 'Fast' ? 42.5 : null)
  });
  e.on('offsetchange', x => changes.push(x));
  await settle();
  assert.equal(e.state, 'ready');
  assert.equal(e.getOffset(), 42.5);
  assert.equal(e.offsetSource, 'provider');

  // switch to a slow track, then quickly to another: the slow answer must be ignored
  e.setTrack({ artist: 'A', title: 'Slow' });
  assert.equal(e.state, 'loading');
  e.setTrack({ artist: 'A', title: 'Third', offset: 7 });
  await settle();
  slow && slow();
  await settle();
  assert.equal(e.state, 'ready');
  assert.equal(e.track.title, 'Third');
  assert.equal(e.getOffset(), 7);
  assert.equal(e.offsetSource, 'given');

  e.setOffset(3.25);
  assert.equal(e.getOffset(), 3.25);
  assert.equal(changes[changes.length - 1].source, 'api');
  assert.throws(() => e.setOffset('abc'), TypeError);
  e.destroy();
});

test('offsetsFromJson: loose key lookup, confidence filter', async () => {
  LE.clearCache();
  LE.fetch = fakeFetch([[/offsets\.json/, {
    'Test Artist - Don’t Go': { offset: 87.4, confidence: 0.9 },
    'Test Artist - Weak': { offset: 10, confidence: 0.2 },
    'Plain Number - Song': 12
  }]]);
  const p = LE.offsetsFromJson('offsets.json', { minConfidence: 0.5 });
  assert.equal(await p({ artist: 'test artist', title: "Don't Go (Remastered)" }), 87.4);
  assert.equal(await p({ artist: 'Test Artist', title: 'Weak' }), null);
  assert.equal(await p({ artist: 'Plain Number', title: 'Song' }), 12);
  assert.equal(await p({ artist: 'X', title: 'Y' }), null);
});

test('itunesPreview: fuzzy pick, skips karaoke and wrong artist', async () => {
  LE.clearCache();
  LE.fetch = fakeFetch([[/itunes\.apple\.com/, { results: [
    { trackName: 'Night Drive (Karaoke Version)', artistName: 'Sing-Along Stars', previewUrl: 'k.m4a' },
    { trackName: 'Night Drive', artistName: 'Someone Else', previewUrl: 'w.m4a' },
    { trackName: 'Night Drive (2015 Remaster)', artistName: 'The Real Band', previewUrl: 'ok.m4a', trackId: 5,
      artworkUrl100: 'https://x/100x100bb.jpg', trackTimeMillis: 245000, collectionName: 'LP' },
    { trackName: 'Night Drive', artistName: 'The Real Band', previewUrl: 'nourl' === 1 ? '' : undefined }
  ] }]]);
  const r = await LE.itunesPreview('Real Band', 'Night Drive');
  assert.equal(r.url, 'ok.m4a');
  assert.equal(r.duration, 245);
  assert.equal(r.artwork, 'https://x/600x600bb.jpg');
  LE.clearCache();
  LE.fetch = fakeFetch([[/itunes/, { results: [] }]]);
  assert.equal(await LE.itunesPreview('Nobody', 'Nothing'), null);
});

test('create() validates audio and track', () => {
  assert.throws(() => LE.create({ track: { artist: 'a', title: 'b' } }), TypeError);
  assert.throws(() => LE.create({ audio: fakeAudio(), track: { artist: 'a' } }), TypeError);
});

/* ---------- helpers ---------- */

function fakeAudio() {
  const ev = new EventTarget();
  ev.currentTime = 0;
  ev.paused = true;
  ev.ended = false;
  ev.src = '';
  return ev;
}
function settle() { return new Promise(r => setTimeout(r, 20)); }
