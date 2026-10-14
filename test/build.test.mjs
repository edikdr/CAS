import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../tools/build.mjs';
import { ROOT } from '../tools/lib.mjs';
import { allText, fixture, realRights } from './helpers.mjs';

const out = () => mkdtemp(path.join(tmpdir(), 'sunniva-out-'));
const lyric = (trackId, permission, text) => ({ trackId, permission, source: 'owner-supplied', reviewedByHuman: true, lines: [{ t: 0.4, end: 3, text }] });

async function project(extra = {}) {
  return fixture({
    'index.html': '<!doctype html><link rel="stylesheet" href="styles/base.css"><script type="module" src="core/app.js"></script>',
    'styles/base.css': '@font-face { font-family: X; src: url(../assets/fonts/x/a.woff2) format("woff2"); }',
    'core/app.js': "import './b.js';\nexport const layer = new URL('../assets/guitar/dom/body.webp', import.meta.url);\n",
    'core/b.js': 'export const b = 1;\n',
    'features/README.md': 'owned by stage 2',
    'assets/fonts/x/a.woff2': Buffer.from('woff2-bytes'),
    'assets/fonts/x/OFL.txt': 'SIL OFL 1.1',
    'assets/fonts/x/source.ttf': Buffer.from('ttf-source'),
    'assets/photos/her.webp': Buffer.from('SENTINEL_PHOTO'),
    'assets/guitar/dom/body.webp': Buffer.from('SENTINEL_GUITAR'),
    'assets/covers/c.webp': Buffer.from('SENTINEL_COVER'),
    'assets/reference/guitar/front.jpg': Buffer.from('SENTINEL_REFERENCE'),
    'assets/previews-local/a/01 - x.m4a': Buffer.from('SENTINEL_AUDIO'),
    'data/tracks.json': { tracks: [{ id: 1, artworkTemplate: 'https://is1-ssl.mzstatic.com/a/{size}x{size}bb.jpg', previewUrl: 'https://audio-ssl.itunes.apple.com/p.m4a' }] },
    'data/releases.json': { releases: [{ id: 9, artworkTemplate: 'https://is4-ssl.mzstatic.com/b/{size}x{size}bb.jpg' }] },
    'data/receipts.json': { receipts: [] },
    'data/beats/1.json': { trackId: 1, bpm: 99 },
    'data/beats/_index.json': { count: 1 },
    'data/lyrics/1.json': lyric(1, 'private-preview', 'SENTINEL_PRIVATE'),
    'data/lyrics/2.json': lyric(2, 'none', 'SENTINEL_NONE'),
    'data/lyrics/3.json': lyric(3, 'granted', 'SENTINEL_GRANTED'),
    'data/facts/artist.json': { contact: { email: 'SENTINEL_EMAIL' } },
    'data/facts/verification.json': [{ claim: 'ok', verified: true }, { claim: 'SENTINEL_UNVERIFIED', verified: false }],
    'data/itunes-raw/1.json': { results: ['SENTINEL_RAW'] },
    'config/rights.json': await realRights(),
    'docs/a.md': 'SENTINEL_DOCS',
    'tools/x.mjs': 'SENTINEL_TOOLS',
    'extract/receipt/js/receipt.js': 'SENTINEL_EXTRACT',
    ...extra,
  });
}

test('private build: whitelisted files, gated items included, hashing + reference rewrite', async () => {
  const dir = await out();
  const r = await build({ root: await project(), out: dir });
  const { files, text } = await allText(dir);

  for (const s of ['SENTINEL_PRIVATE', 'SENTINEL_GRANTED', 'SENTINEL_PHOTO', 'SENTINEL_GUITAR', 'mzstatic.com']) assert.ok(text.includes(s), s);
  for (const s of ['SENTINEL_NONE', 'SENTINEL_EMAIL', 'SENTINEL_UNVERIFIED', 'SENTINEL_RAW', 'SENTINEL_DOCS', 'SENTINEL_TOOLS', 'SENTINEL_EXTRACT', 'SENTINEL_REFERENCE', 'SENTINEL_AUDIO']) {
    assert.ok(!text.includes(s), `${s} must not ship`);
  }
  assert.deepEqual(r.stripped, ['data/lyrics/2.json']);
  assert.ok(!files.some((f) => f.endsWith('.ttf') || f.endsWith('.md') || f.includes('_index')));

  const font = files.find((f) => /^assets\/fonts\/x\/a\.[0-9a-f]{10}\.woff2$/.test(f));
  assert.ok(font, 'font is content-hashed');
  assert.ok(files.includes('assets/fonts/x/OFL.txt'), 'licence keeps its name');
  assert.ok((await readFile(path.join(dir, 'styles/base.css'), 'utf8')).includes(font));
  const app = await readFile(path.join(dir, 'core/app.js'), 'utf8');
  assert.match(app, /assets\/guitar\/dom\/body\.[0-9a-f]{10}\.webp/);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'config/rights.json'), 'utf8')).buildMode, 'private-preview');
});

test('public build: no cover URLs, no lyric files, no photos, no guitar/cover assets', async () => {
  const dir = await out();
  const r = await build({ root: await project(), out: dir, isPublic: true });
  const { files, text } = await allText(dir);

  assert.ok(!text.includes('mzstatic'), 'no cover URLs anywhere');
  assert.ok(!files.some((f) => f.startsWith('data/lyrics/')), 'no lyric files');
  assert.ok(!/SENTINEL_(PRIVATE|GRANTED|NONE|PHOTO|GUITAR|COVER)/.test(text));
  assert.ok(!files.some((f) => /^assets\/(photos|guitar|covers)\//.test(f)));
  assert.ok(text.includes('audio-ssl.itunes.apple.com'), 'cleared previewAudio stays');
  assert.ok(files.some((f) => f.startsWith('assets/fonts/x/a.')), 'cleared fonts stay');
  assert.ok(r.stripped.includes('assets/photos/her.webp') && r.stripped.includes('data/lyrics/3.json'));
  assert.equal(JSON.parse(await readFile(path.join(dir, 'config/rights.json'), 'utf8')).buildMode, 'public');
});

test('public build of the real repo has no cover URLs, lyrics, photos or raw facts', async () => {
  const dir = await out();
  await build({ root: ROOT, out: dir, isPublic: true });
  const { files, text } = await allText(dir);
  assert.ok(!text.includes('mzstatic'));
  assert.ok(!text.includes('artworkTemplate'));
  assert.ok(!files.some((f) => /^data\/(lyrics|itunes-raw)\/|^data\/facts\/artist|^assets\/(photos|covers|guitar|models|letters|collage)\//.test(f)));
});

test('JSON asset manifests: references to layers are rewritten and the manifest hash follows them', async () => {
  const manifest = (v) => ({
    'core/app.js': "export const m = new URL('../assets/guitar/dom/manifest.json', import.meta.url);\n",
    'assets/guitar/dom/manifest.json': { layers: [{ src: 'assets/guitar/dom/body.webp' }] },
    'assets/guitar/dom/body.webp': Buffer.from(`SENTINEL_GUITAR_${v}`),
  });
  const built = async (v) => {
    const dir = await out();
    await build({ root: await project(manifest(v)), out: dir });
    const { files } = await allText(dir);
    const name = files.find((f) => /^assets\/guitar\/dom\/manifest\.[0-9a-f]{10}\.json$/.test(f));
    const src = JSON.parse(await readFile(path.join(dir, name), 'utf8')).layers[0].src;
    return { files, name, src, app: await readFile(path.join(dir, 'core/app.js'), 'utf8') };
  };
  const a = await built(1);
  assert.match(a.src, /^assets\/guitar\/dom\/body\.[0-9a-f]{10}\.webp$/);
  assert.ok(a.files.includes(a.src), 'the manifest points at a shipped file');
  assert.ok(a.app.includes(a.name), 'the code points at the hashed manifest');
  const b = await built(2);
  assert.notEqual(a.name, b.name, 'a changed layer renames its manifest (immutable caching)');
});

const rejects = (extra, isPublic, re) => async () => {
  await assert.rejects(build({ root: await project(extra), out: await out(), isPublic }), (e) => re.test(e.message));
};

test('an asset outside every rights class fails the build', rejects({ 'assets/misc/a.png': Buffer.from('x') }, false, /not covered by any class/));
test('binary files inside core/ fail the build', rejects({ 'core/img.png': Buffer.from('x') }, false, /binary assets go in assets/));
test('dynamic asset paths fail the build', rejects({ 'core/c.js': 'export const u = (c) => `assets/letters/${c}.webp`;' }, false, /dynamically/));
test('concatenated asset paths fail the build', rejects({ 'core/c.js': "export const u = (c) => 'assets/letters/' + c;" }, false, /dynamically/));
test('public build fails when CSS still loads a stripped file', rejects(
  { 'styles/base.css': 'body { background: url(../assets/photos/her.webp); }' }, true, /loads stripped file assets\/photos\/her\.webp/));
test('public build fails when a non-cleared host is hard-coded', rejects(
  { 'core/b.js': "export const cover = 'https://is1-ssl.mzstatic.com/x.jpg';" }, true, /mzstatic\.com but class "coverArt"/));
