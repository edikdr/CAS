/*
 * tools/optimize_glb.mjs - Meshy GLB -> the shipped desktop model (CONTRACT section 4 budgets).
 *
 *   node tools/optimize_glb.mjs [in.glb] [out.glb] [--texture 2048] [--ratio 0.8]
 *   defaults: .tmp/meshy/raw.glb -> assets/models/guitar.glb
 *
 * Pipeline (@gltf-transform): dedup, weld, simplify (meshoptimizer, keeps <= 30k triangles),
 * prune, textures -> WebP (EXT_texture_webp) at most --texture px, vertex quantization
 * (KHR_mesh_quantization). No Meshopt/Draco compression: the result is already far below 2 MB and
 * plain GLTFLoader reads it, so no WASM decoder and no CSP change. Prints the budget check.
 * The raw Meshy file stays in .tmp/ (gitignored).
 */

import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { ROOT } from './lib.mjs';
import { inspectGlb } from './glb.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : dflt; };
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const input = path.resolve(positional[0] || path.join(ROOT, '.tmp/meshy/raw.glb'));
const output = path.resolve(positional[1] || path.join(ROOT, 'assets/models/guitar.glb'));
const size = opt('texture', 2048);
const ratio = opt('ratio', 0.8);

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0008 }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
  quantize(),
);
await mkdir(path.dirname(output), { recursive: true });
await io.write(output, doc);

const before = inspectGlb(await readFile(input));
const after = inspectGlb(await readFile(output));
const tex = after.textures.map((t) => `${t.width}x${t.height} ${t.mimeType} ${(t.bytes / 1024).toFixed(0)} KB`).join(', ');
console.log(`${path.relative(ROOT, input)}: ${(before.bytes / 1048576).toFixed(2)} MB, ${before.triangles} triangles`);
console.log(`${path.relative(ROOT, output)}: ${(after.bytes / 1048576).toFixed(2)} MB, ${after.triangles} triangles, ${after.materials} material(s), textures: ${tex}`);
const ok = after.bytes <= 2 * 1048576 && after.triangles <= 30000 && after.materials <= 5 && after.textures.every((t) => t.width <= 2048 && t.height <= 2048);
console.log(ok ? 'budget: ok (<= 2 MB, <= 30k triangles, <= 5 materials, textures <= 2048)' : 'budget: OVER');
process.exit(ok ? 0 : 1);
