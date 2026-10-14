/*
 * tools/lib.mjs - small helpers shared by the Node tools (never shipped).
 *   ROOT                 absolute path of the repo
 *   walk(dir)            -> sorted POSIX paths of all files under dir, relative to dir
 *                           (skips dot-entries, node_modules, dist)
 *   readJson(file)       -> parsed JSON
 *   fail(title, errors)  -> prints errors and exits 1 when there are any
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SKIP = new Set(['node_modules', 'dist']);

export async function walk(dir, prefix = '') {
  const out = [];
  for (const e of await readdir(path.join(dir, prefix), { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walk(dir, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export function fail(title, errors) {
  if (!errors.length) return;
  console.error(`${title}: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
