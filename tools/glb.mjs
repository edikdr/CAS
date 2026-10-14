/*
 * tools/glb.mjs - tiny read-only GLB inspector (no dependencies), used by check-budgets.
 *
 *   node tools/glb.mjs <file.glb>
 *   export inspectGlb(buffer) -> { bytes, triangles, materials, meshes, textures: [{ mimeType, width, height, bytes }],
 *                                  extensionsUsed, bbox: { min, max } }
 * Triangles count indexed and non-indexed TRIANGLES primitives (mode 4, the glTF default).
 * Image sizes are read from the PNG / JPEG / WebP headers inside the binary chunk.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function imageSize(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return { width: 0, height: 0 };
}

export function inspectGlb(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB file');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  let triangles = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes || []) {
    for (const p of mesh.primitives) {
      if ((p.mode ?? 4) !== 4) continue;
      const count = p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count;
      triangles += count / 3;
      const pos = json.accessors[p.attributes.POSITION];
      pos.min?.forEach((v, k) => { min[k] = Math.min(min[k], v); });
      pos.max?.forEach((v, k) => { max[k] = Math.max(max[k], v); });
    }
  }
  const textures = (json.images || []).map((img) => {
    const view = json.bufferViews[img.bufferView];
    const data = buf.subarray(binStart + (view.byteOffset || 0), binStart + (view.byteOffset || 0) + view.byteLength);
    return { mimeType: img.mimeType, bytes: view.byteLength, ...imageSize(data) };
  });
  return {
    bytes: buf.length,
    triangles,
    materials: (json.materials || []).length,
    meshes: (json.meshes || []).length,
    textures,
    extensionsUsed: json.extensionsUsed || [],
    bbox: { min, max },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(inspectGlb(await readFile(process.argv[2])), null, 1));
}
