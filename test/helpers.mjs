/* test/helpers.mjs - shared test utilities: temp fixture trees and a disk-backed JSON loader. */

import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT, walk } from '../tools/lib.mjs';

/** Writes { 'rel/path': string | Buffer | object } into a fresh temp dir; objects become JSON. */
export async function fixture(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'sunniva-'));
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    await writeFile(file, data);
  }
  return dir;
}

export const realRights = async () => JSON.parse(await readFile(path.join(ROOT, 'config/rights.json'), 'utf8'));

/** DataStore loader for Node: reads file: URLs, null when missing (like a 404). */
export async function diskJson(url) {
  try { return JSON.parse(await readFile(url, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

/** All text of a directory tree, for "does this string appear anywhere" assertions. */
export async function allText(dir) {
  const files = await walk(dir);
  const bodies = await Promise.all(files.map((f) => readFile(path.join(dir, f), 'utf8')));
  return { files, text: bodies.join('\n') };
}
