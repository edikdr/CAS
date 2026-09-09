#!/usr/bin/env node
/* ============================================================
   The pre-deploy check.

     node tools/check.mjs

   Not a test suite — there is no framework here and nothing to install.
   It is the list of things that have actually gone wrong with this
   folder: a script referenced in the markup that is not on disk, a
   collage manifest pointing at an image that was renamed, a stray asset
   nothing loads, a syntax error in a file the browser would only
   complain about at runtime.

   Exits non-zero if any of it fails, so it can go in front of a deploy.
   ============================================================ */

import { readFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const problems = [];
const notes = [];
const ok = [];

const exists = async p => !!(await stat(join(ROOT, p)).catch(() => null));

const html = await readFile(join(ROOT, 'index.html'), 'utf8');

/* ---- every script and stylesheet the page names is on disk --------- */
const refs = [...html.matchAll(/(?:src|href)="((?!https?:|data:|#)[^"]+)"/g)].map(m => m[1]);
for (const r of refs) {
  if (await exists(r)) ok.push(r);
  else problems.push(`index.html references ${r}, which is not there`);
}

/* ---- the JavaScript parses ---------------------------------------- */
for (const dir of ['js', 'api']) {
  for (const f of await readdir(join(ROOT, dir))) {
    if (!/\.m?js$/.test(f)) continue;
    try {
      execFileSync(process.execPath, ['--check', join(ROOT, dir, f)], { stdio: 'pipe' });
      ok.push(`${dir}/${f}`);
    } catch (e) {
      problems.push(`${dir}/${f} does not parse: ${String(e.stderr || e).split('\n')[1] || ''}`);
    }
  }
}

/* ---- the collage manifest and the folder agree -------------------- */
const manifest = JSON.parse(await readFile(join(ROOT, 'assets/cut/manifest.json'), 'utf8'));
const onDisk = new Set((await readdir(join(ROOT, 'assets/cut')))
  .filter(f => f.endsWith('.webp')).map(f => `assets/cut/${f}`));

for (const row of manifest) {
  if (!onDisk.has(row.src)) problems.push(`manifest lists ${row.src}, which is not there`);
  if (!row.kind || !row.w || !row.h) problems.push(`manifest row ${row.src} is missing fields`);
  onDisk.delete(row.src);
}
if (onDisk.size) notes.push(`${onDisk.size} cut asset(s) not in the manifest: ${[...onDisk].join(', ')}`);
ok.push(`manifest: ${manifest.length} pieces`);

/* ---- the things the CSS and the modules load ---------------------- */
const css = await readFile(join(ROOT, 'css/style.css'), 'utf8');
for (const m of css.matchAll(/url\(['"]?\.\.\/([^'")]+)['"]?\)/g)) {
  if (await exists(m[1])) ok.push(m[1]);
  else problems.push(`css/style.css loads ${m[1]}, which is not there`);
}
for (const f of ['assets/boneframe.webp', 'assets/modal-bg.webp', 'vendor/three.min.js', 'vendor/gsap.min.js']) {
  if (await exists(f)) ok.push(f);
  else problems.push(`${f} is missing`);
}

/* ---- nothing left over from an earlier build ---------------------- */
for (const stale of ['js/lyrics.js', '__test-preview.wav']) {
  if (await exists(stale)) problems.push(`${stale} should have been removed`);
}

/* ---- no token has been committed by accident ----------------------

   Deliberately narrow. The first version of this flagged any long run of
   base64-ish characters, which matched the silent-WAV data URI in
   js/player.js and a handful of long identifier chains, and a check that
   cries wolf on every run is a check nobody reads. What it looks for now
   is the two shapes an actual leak takes: the variable assigned a value
   somewhere it should not be, and a bare 50-plus character credential
   sitting in a string literal.
   -------------------------------------------------------------------- */
const scan = [];
for (const dir of ['js', 'api', 'netlify/functions', 'functions/api', '.']) {
  const entries = await readdir(join(ROOT, dir)).catch(() => []);
  for (const f of entries) {
    if (!/\.(m?js|html|json)$/.test(f)) continue;
    scan.push([`${dir === '.' ? '' : dir + '/'}${f}`, await readFile(join(ROOT, dir, f), 'utf8')]);
  }
}
for (const [name, body] of scan) {
  /* Both halves have to look wrong before this fires. The name must be a
     credential's name — GENIUS on its own also matches
     `const GENIUS = 'https://api.genius.com'`, the endpoint — and the
     value must look like a secret rather than a label: long, and not a
     word or a URL. `KEY: 'hu-quiz-best'`, a localStorage key, is exactly
     the sort of thing that must not trip it. */
  for (const m of body.matchAll(/\b[A-Z_]*(?:TOKEN|KEY|SECRET|PASSWORD)\b\s*[=:]\s*['"`]([^'"`\s]{16,})/g)) {
    const v = m[1];
    if (/^https?:/.test(v) || /^[a-z-]+$/.test(v)) continue;
    problems.push(`${name} appears to have a credential written into it: ${m[0].slice(0, 44)}…`);
  }
  // a quoted credential: mixed case and digits, long, and not a URL or a data URI
  for (const m of body.matchAll(/['"`]([A-Za-z0-9_-]{50,})['"`]/g)) {
    const v = m[1];
    if (/^[A-Za-z]+$/.test(v)) continue;                    // just a long word
    if (body.slice(Math.max(0, m.index - 60), m.index).includes('base64')) continue;
    if (!(/[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v))) continue;
    notes.push(`${name} holds a long mixed-case literal — confirm it is not a credential`);
    break;
  }
}
ok.push(`scanned ${scan.length} files for credentials`);

console.log(`\n  ${ok.length} checks passed`);
notes.forEach(n => console.log(`  note     ${n}`));
problems.forEach(p => console.log(`  PROBLEM  ${p}`));
console.log(problems.length ? `\n  ${problems.length} problem(s)\n` : '\n  nothing wrong\n');
process.exit(problems.length ? 1 : 0);
