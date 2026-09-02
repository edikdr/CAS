import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GENIUS_ACCESS_TOKEN = 'test-token';
process.env.CORS_ORIGIN = 'http://localhost:8099,null';
process.env.RATE_LIMIT_MAX = '1000';

const { createApp } = await import('../src/app.js');
const { createCache } = await import('../src/lib/cache.js');
const { makeFetchStub } = await import('./fixtures.js');
const { sanitizeHtml } = await import('../src/lib/html.js');
const { matchAnnotations } = await import('../src/lib/match.js');

async function serve(options = {}) {
  const cache = await createCache({ redisUrl: '', ttlSeconds: 60, maxEntries: 50 });
  const fetchStub = makeFetchStub(options);
  const app = createApp({ cache, fetchImpl: fetchStub, baseUrl: 'https://api.genius.test' });
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, fetchStub, cache,
    get: (path) => fetch(base + path).then(async r => ({ status: r.status, body: await r.json() })),
    post: (path, payload) => fetch(base + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(async r => ({ status: r.status, body: await r.json() })),
    close: () => new Promise(resolve => server.close(resolve))
  };
}

test('1. artist profile exposes bio, images and social links', async () => {
  const s = await serve();
  const { status, body } = await s.get('/api/artists/22436');
  assert.equal(status, 200);
  assert.equal(body.name, 'The Neighbourhood');
  assert.match(body.bio.html, /Newbury Park/);
  assert.equal(body.images.profile, 'https://images.genius.com/artist-1000.jpg');
  assert.deepEqual(body.socials.instagram, 'https://instagram.com/thenbhd');
  assert.equal(body.socialLinks.length, 3);
  await s.close();
});

test('2. annotations are returned and matched onto local lines with offsets', async () => {
  const s = await serve();
  const list = await s.get('/api/songs/90478/annotations');
  assert.equal(list.status, 200);
  assert.equal(list.body.count, 3);
  assert.match(list.body.annotations[0].body, /^<p>/);

  const matched = await s.post('/api/songs/90478/annotations/match', {
    lines: ['All I am is a man', 'I want the world in my hands', '', "'Cause it's too cold for you here"]
  });
  assert.equal(matched.status, 200);
  assert.equal(matched.body.matched, 2);
  assert.equal(matched.body.unmatched.length, 1);
  const first = matched.body.lines[0].annotations[0];
  assert.equal(first.start, 0);
  assert.equal(first.end, 17);
  const hook = matched.body.lines[3].annotations[0];
  assert.equal(matched.body.lines[3].text.slice(hook.start, hook.end), 'too cold for you here');
  await s.close();
});

test('3. single artwork prefers song art and flags album art with a fallback', async () => {
  const s = await serve();
  const single = await s.get('/api/songs/90478/artwork');
  assert.equal(single.body.source, 'single');
  assert.equal(single.body.isAlbumArt, false);
  assert.equal(single.body.url, 'https://images.genius.com/song-art-1000.jpg');

  const albumy = await s.get('/api/songs/90479/artwork');
  assert.equal(albumy.body.isAlbumArt, true);
  assert.equal(albumy.body.source, 'album');
  assert.ok(albumy.body.url, 'still returns something usable');
  await s.close();
});

test('4. hybrid gives local fields priority and falls back to Genius', async () => {
  const s = await serve();
  const { status, body } = await s.get('/api/artists/22436/hybrid?slug=the-neighbourhood');
  assert.equal(status, 200);
  assert.equal(body.sources.merged, true);
  assert.equal(body.bio.source, 'local', 'local bio wins');
  assert.match(body.bio.text, /black-and-white rule/);
  assert.equal(body.sources.fields['images.profile'], 'genius', 'no local image, so Genius fills it');
  assert.equal(body.images.profile, 'https://images.genius.com/artist-1000.jpg');
  assert.equal(body.socials.instagram, 'https://instagram.com/thenbhd');
  await s.close();
});

test('4b. hybrid still answers for a member with no Genius page', async () => {
  const s = await serve();
  const { status, body } = await s.get('/api/artists/local/hybrid?slug=mikey-margott');
  assert.equal(status, 200);
  assert.equal(body.name, 'Mikey Margott');
  assert.equal(body.bio.source, 'local');
  assert.equal(body.sources.genius, false);
  await s.close();
});

test('5. metrics are surfaced from stats', async () => {
  const s = await serve();
  const { body } = await s.get('/api/songs/90478/stats');
  assert.equal(body.pageviews, 8123456);
  assert.equal(body.hot, false);
  assert.equal(body.annotations.accepted, 24);
  assert.equal(body.annotations.total, 24);
  assert.equal(body.contributors, 310);
  await s.close();
});

test('6. background replaces local copy and carries attribution', async () => {
  const s = await serve();
  const { body } = await s.get('/api/songs/90478/background');
  assert.equal(body.hasContent, true);
  assert.equal(body.source, 'genius');
  assert.equal(body.sourceUrl, SONGURL);
  assert.match(body.text, /The single that broke the band/);
  assert.ok(!/script|alert/i.test(body.html), 'script content is stripped');
  assert.match(body.html, /rel="noopener noreferrer"/);
  await s.close();
});
const SONGURL = 'https://genius.com/The-neighbourhood-sweater-weather-lyrics';

test('7. relationships are grouped and cover-likes are separated', async () => {
  const s = await serve();
  const { body } = await s.get('/api/songs/90478/relations');
  assert.equal(body.total, 3, 'empty groups dropped');
  assert.equal(body.covers.length, 2, 'cover + remix, not the interpolation');
  assert.equal(body.covers[0].relationLabel, 'Covered by');
  assert.ok(body.groups.some(g => g.type === 'interpolated_by' && !g.isCoverLike));
  await s.close();
});

test('caching collapses repeat and concurrent calls into one upstream request', async () => {
  const s = await serve();
  await Promise.all([s.get('/api/songs/90478/stats'), s.get('/api/songs/90478/stats')]);
  await s.get('/api/songs/90478/background');
  await s.get('/api/songs/90478');
  const songCalls = s.fetchStub.calls.filter(c => c.startsWith('/songs/90478'));
  assert.equal(songCalls.length, 1, `expected 1 upstream call, saw ${songCalls.length}`);
  assert.equal(s.cache.stats().hits >= 3, true);
  await s.close();
});

test('a missing song answers 404 rather than leaking the upstream shape', async () => {
  const s = await serve({ fail404: true });
  const { status, body } = await s.get('/api/songs/99999999');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'not_found');
  assert.ok(!JSON.stringify(body).includes('test-token'));
  await s.close();
});

test('bad input is rejected before any upstream call', async () => {
  const s = await serve();
  const bad = await s.get('/api/songs/not-a-number/stats');
  assert.equal(bad.status, 400);
  const noLines = await s.post('/api/songs/90478/annotations/match', {});
  assert.equal(noLines.status, 400);
  assert.equal(s.fetchStub.calls.length, 0, 'nothing was sent upstream');
  await s.close();
});

test('the access token never appears in a response and CORS is restricted', async () => {
  const s = await serve();
  const raw = await fetch(s.base + '/api/songs/90478', { headers: { Origin: 'https://evil.example' } });
  assert.equal(raw.headers.get('access-control-allow-origin'), null, 'unknown origin gets no CORS grant');
  const ok = await fetch(s.base + '/api/songs/90478', { headers: { Origin: 'http://localhost:8099' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:8099');
  assert.ok(!(await ok.text()).includes('test-token'));
  const health = await s.get('/health');
  assert.equal(health.body.tokenConfigured, true);
  assert.ok(!JSON.stringify(health.body).includes('test-token'));
  await s.close();
});

test('sanitiser strips scripts, handlers and non-http links', () => {
  assert.equal(sanitizeHtml('<script>bad()</script><p>ok</p>'), '<p>ok</p>');
  assert.equal(sanitizeHtml('<p onclick="x()">hi</p>'), '<p>hi</p>');
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.match(sanitizeHtml('<a href="https://genius.com">x</a>'), /rel="noopener noreferrer"/);
});

test('matcher tolerates curly quotes and section headers', () => {
  const result = matchAnnotations(
    ['[Verse 1]', 'Cause it’s too cold for you here', 'And now, so let me hold'],
    [{ id: 1, fragment: "Cause it's too cold for you here" }]
  );
  assert.equal(result.matched, 1);
  assert.equal(result.lines[1].annotations.length, 1);
});
