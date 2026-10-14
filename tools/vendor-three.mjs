/*
 * tools/vendor-three.mjs - copies the pinned three.js files the WebGL guitar needs into vendor/three/.
 *
 *   npm install && node tools/vendor-three.mjs
 *
 * Version = devDependencies.three in package.json (exact pin). Files are copied byte for byte,
 * keeping three's own folder layout so their relative imports work; GLTFLoader's bare `three`
 * import is resolved by the import map in index.html. Never edit the copies: re-run this script.
 */

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib.mjs';

const FILES = [
  'LICENSE',
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js',
];

const pkg = JSON.parse(await readFile(path.join(ROOT, 'node_modules/three/package.json'), 'utf8'));
const pinned = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).devDependencies.three;
if (pkg.version !== pinned) throw new Error(`node_modules has three ${pkg.version}, package.json pins ${pinned}: run npm install`);

const out = path.join(ROOT, 'vendor/three');
await rm(out, { recursive: true, force: true });
for (const f of FILES) {
  await mkdir(path.dirname(path.join(out, f)), { recursive: true });
  await copyFile(path.join(ROOT, 'node_modules/three', f), path.join(out, f));
}
await writeFile(path.join(out, 'VERSION'), `three ${pkg.version} (npm), copied by tools/vendor-three.mjs - do not edit\n`);
console.log(`vendor/three: three ${pkg.version}, ${FILES.length} files`);
