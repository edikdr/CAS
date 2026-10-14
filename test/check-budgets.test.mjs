import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../tools/build.mjs';
import { checkBudgets, externalUrls, staticImports } from '../tools/check-budgets.mjs';
import { ROOT } from '../tools/lib.mjs';
import { fixture } from './helpers.mjs';

test('staticImports follows static imports/exports only', () => {
  const js = `import a from './a.js';\nimport {\n  b,\n  c\n} from "../b.js";\nimport './side.js';\nexport { d } from './d.js';\nconst gl = import('./gl.js');`;
  assert.deepEqual(staticImports(js), ['./a.js', '../b.js', './side.js', './d.js']);
});

test('externalUrls ignores <a href> links and XML namespaces', () => {
  const html = '<a href="https://music.apple.com/x">Apple</a><script src="https://cdn.example/x.js"></script><svg xmlns="http://www.w3.org/2000/svg"></svg>';
  assert.deepEqual(externalUrls(html, 'html'), ['https://cdn.example/x.js']);
});

test('the real private build meets every budget', async () => {
  const { out } = await build({ root: ROOT, out: await mkdtemp(path.join(tmpdir(), 'sunniva-b-')) });
  const { errors, initial } = await checkBudgets(out);
  assert.deepEqual(errors, []);
  assert.ok(initial.includes('core/app.js'));
});

test('third-party URLs, Three.js in the initial graph and fat layers fail', async () => {
  const dir = await fixture({
    'index.html': '<link rel="stylesheet" href="s.css"><script type="module" src="core/app.js"></script>',
    's.css': 'body { background: url(https://example.com/bg.jpg); }',
    'core/app.js': "import '../vendor/three/three.module.js';\nfetch('https://lrclib.net/api/get');\n",
    'vendor/three/three.module.js': 'export {};',
    'assets/guitar/dom/body.webp': Buffer.alloc(61 * 1024),
    'assets/guitar/dom/neck.png': Buffer.alloc(10),
    'assets/fonts/a/x.woff2': Buffer.alloc(10),
  });
  const { errors } = await checkBudgets(dir);
  const has = (re) => assert.ok(errors.some((e) => re.test(e)), `${re} in ${errors.join(' | ')}`);
  has(/s\.css: third-party URL in initial load: https:\/\/example\.com/);
  has(/core\/app\.js: third-party URL in initial load: https:\/\/lrclib\.net/);
  has(/initial load contains vendor\/three\/three\.module\.js/);
  has(/body\.webp: 61\.0 KB > 60\.0 KB/);
  has(/neck\.png: DOM guitar layers must be WebP/);
  has(/x\.woff2: no OFL\.txt/);
});
