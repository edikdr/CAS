// Converts the PNG frames produced by encode-video.sh into budgeted WebP files.
import sharp from 'sharp';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const out = process.argv[2] || 'site/media';

// Lower quality until the file fits its budget.
async function fit(src, dst, budget, width) {
  for (let q = 82; q >= 30; q -= 4) {
    await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: q, effort: 6 }).toFile(dst);
    const { size } = await stat(dst);
    if (size <= budget) return console.log(`${path.basename(dst).padEnd(28)} q=${q} ${(size / 1024).toFixed(1)} KB`);
  }
  console.warn(`WARN ${dst} could not meet ${budget} B`);
}

await fit(path.join(out, '.poster.png'), path.join(out, 'poster.webp'), 60 * 1024, 1280);
await fit(path.join(out, '.end.png'), path.join(out, 'end.webp'), 140 * 1024, 1920);
for (const f of (await readdir(path.join(out, 'stills'))).filter((f) => f.endsWith('.png'))) {
  await fit(path.join(out, 'stills', f), path.join(out, 'stills', f.slice(1).replace('.png', '.webp')), 90 * 1024, 1280);
}
for (const f of ['.poster.png', '.end.png']) await rm(path.join(out, f), { force: true });
for (const f of (await readdir(path.join(out, 'stills'))).filter((f) => f.startsWith('.'))) await rm(path.join(out, 'stills', f));
