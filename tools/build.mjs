/*
 * tools/build.mjs - static build into dist/ (CONTRACT sections 2-3).
 *
 *   node tools/build.mjs [--public] [--out <dir>]      (PUBLIC_BUILD=1 in the env = --public)
 *   export build({ root, out, isPublic }) -> { files, stripped, bytes }
 *
 * What it does:
 *  1. Ships only whitelisted files (RULES). Unknown file types inside core/ features/ styles/
 *     content/ are an error: binary assets belong in assets/.
 *  2. Rights gate (core/rights.js, same logic as the browser): every shipped file under assets/
 *     must belong to a class in config/rights.json (`paths`), files of classes this build may
 *     not use are stripped, JSON `fields` of such classes are removed, lyric files ship only if
 *     their `permission` allows it in this build mode, facts ship only when verified.
 *  3. Content-hashes files under assets/ (name.<hash>.ext, licences keep their name) and rewrites
 *     every literal reference in shipped HTML/CSS/JS/JSON. Asset paths must therefore be literal
 *     strings or come from a JSON manifest; building them with `${}` or `+` is an error (except the
 *     dev-only assets/previews-local/, which never ships).
 *  4. Every inline <script> in index.html (the import map) must have its sha256 in the CSP of
 *     vercel.json, or the browser would refuse it.
 *  5. Public build only: fails if HTML/CSS/JS still reference a stripped file (static import, url())
 *     or if any shipped text contains a host of a class that is not cleared (e.g. mzstatic.com).
 *
 * Must not change: the rights logic lives in core/rights.js, not here.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRightsGate } from '../core/rights.js';
import { ROOT, walk, fail } from './lib.mjs';

const RULES = [
  [/^index\.html$/, 'text'],
  [/^core\/.+\.js$/, 'text'],
  [/^features\/.+\.(js|css)$/, 'text'],
  [/^features\/.+\.json$/, 'json'],
  [/^styles\/.+\.css$/, 'text'],
  [/^content\/.+\.json$/, 'json'],
  [/^data\/(releases|tracks|receipts|quiz)\.json$/, 'json'],
  [/^data\/beats\/\d+\.json$/, 'json'],
  [/^data\/lyrics\/\d+\.json$/, 'lyrics'],
  [/^data\/facts\/verification\.json$/, 'facts'],
  [/^config\/rights\.json$/, 'rights'],
  [/^vendor\/lyrics-engine\/lyrics-engine\.m?js$/, 'text'],
  [/^vendor\/three\/(build|examples)\/.+\.js$/, 'text'],
  [/^vendor\/three\/LICENSE$/, 'text'],
  [/^assets\/(?!reference\/|previews-local\/).+$/, 'asset'],
];
const STRICT = /^(core|features|styles|content)\//;
const NOT_SHIPPED = /\.(md|ttf|otf)$/; // docs and font sources (fonts ship as woff2)
const TEXT = /\.(html|css|js|mjs|json|svg)$/;
const KEEP_NAME = /\.txt$|(^|\/)LICENSE[^/]*$/; // licences stay next to their files, unhashed

function kindOf(rel) {
  if (NOT_SHIPPED.test(rel)) return null;
  return RULES.find(([re]) => re.test(rel))?.[1] ?? null;
}

function stripFields(value, fields) {
  if (Array.isArray(value)) value.forEach((v) => stripFields(v, fields));
  else if (value && typeof value === 'object') {
    for (const f of fields) delete value[f];
    Object.values(value).forEach((v) => stripFields(v, fields));
  }
  return value;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function build({ root = ROOT, out = path.join(root, 'dist'), isPublic = false } = {}) {
  const config = JSON.parse(await readFile(path.join(root, 'config/rights.json'), 'utf8'));
  const buildMode = isPublic ? 'public' : 'private-preview';
  const gate = createRightsGate({ ...config, buildMode });
  const classes = Object.entries(config.classes);
  const classOf = (rel) => classes.find(([, c]) => (c.paths || []).some((p) => rel.startsWith(p)))?.[0];
  const deniedFields = classes.filter(([n]) => !gate.allows(n)).flatMap(([, c]) => c.fields || []);
  const deniedHosts = classes.filter(([n]) => !gate.allows(n)).flatMap(([n, c]) => (c.hosts || []).map((h) => [h, n]));

  const errors = [];
  const stripped = [];
  const files = new Map(); // rel -> string | Buffer

  for (const rel of await walk(root)) {
    const kind = kindOf(rel);
    if (!kind) {
      if (STRICT.test(rel) && !rel.endsWith('.md')) errors.push(`${rel}: file type not shipped from here (binary assets go in assets/)`);
      continue;
    }
    const cls = classOf(rel);
    if (kind === 'asset' && !cls) {
      errors.push(`${rel}: not covered by any class in config/rights.json (add a register row + class path)`);
      continue;
    }
    if (cls && !gate.allows(cls)) { stripped.push(rel); continue; }

    const raw = await readFile(path.join(root, rel));
    if (kind === 'asset') { files.set(rel, raw); continue; }
    if (kind === 'text') { files.set(rel, raw.toString('utf8')); continue; }

    const doc = JSON.parse(raw.toString('utf8'));
    if (kind === 'lyrics' && !gate.allowsLyrics(doc.permission)) { stripped.push(rel); continue; }
    if (kind === 'rights') {
      const reduced = Object.fromEntries(classes.map(([n, c]) => [n, { cleared: c.cleared === true }]));
      files.set(rel, JSON.stringify({ buildMode, classes: reduced }));
      continue;
    }
    const data = kind === 'facts' ? (Array.isArray(doc) ? doc.filter((f) => f.verified === true) : []) : doc;
    files.set(rel, JSON.stringify(stripFields(data, deniedFields)));
  }

  // 3. hash assets and rewrite literal references
  const renames = new Map();
  for (const [rel, buf] of files) {
    if (!rel.startsWith('assets/') || KEEP_NAME.test(rel)) continue;
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 10);
    const ext = path.posix.extname(rel);
    renames.set(rel, `${rel.slice(0, -ext.length)}.${hash}${ext}`);
  }
  const refRe = renames.size
    ? new RegExp(`(?<![\\w.-])(${[...renames.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![\\w.-])`, 'g')
    : null;
  const output = new Map();
  for (const [rel, body] of files) {
    let data = body;
    if (typeof body === 'string') {
      if (/\.m?js$/.test(rel) && (/`[^`]*assets\/(?!previews-local\/)[^`]*\$\{/.test(body) || /['"`][^'"`\n]*assets\/(?!previews-local\/)[^'"`\n]*['"`]\s*\+/.test(body))) {
        errors.push(`${rel}: builds an assets/ path dynamically; use a literal path or a JSON manifest (hashing would break it)`);
      }
      if (refRe) data = body.replace(refRe, (m) => renames.get(m));
    }
    output.set(renames.get(rel) ?? rel, data);
  }

  // 4. inline scripts must be allowed by the CSP hash list
  const html = output.get('index.html');
  if (typeof html === 'string') {
    const csp = JSON.stringify(JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8').catch(() => '{}')));
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const hash = `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`;
      if (!csp.includes(hash)) errors.push(`index.html: inline script needs ${hash} in the vercel.json CSP script-src`);
    }
  }

  // 5. public-build guarantees
  if (isPublic) {
    const textFiles = [...output].filter(([rel, d]) => typeof d === 'string' && TEXT.test(rel));
    for (const s of stripped) {
      const ref = new RegExp(`(url\\(\\s*['"]?|\\b(?:import|from)\\s*['"]|(?:src|href)\\s*=\\s*['"])[^'"()]*${escapeRe(s)}`);
      for (const [rel, d] of textFiles) {
        if (/\.(html|css|m?js)$/.test(rel) && ref.test(d)) errors.push(`${rel}: loads stripped file ${s} (public build)`);
      }
    }
    for (const [host, cls] of deniedHosts) {
      for (const [rel, d] of textFiles) {
        if (d.includes(host)) errors.push(`${rel}: contains ${host} but class "${cls}" is not cleared (public build)`);
      }
    }
  }

  if (errors.length) {
    const err = new Error(`build failed:\n  - ${errors.join('\n  - ')}`);
    err.errors = errors;
    throw err;
  }

  await rm(out, { recursive: true, force: true });
  let bytes = 0;
  for (const [rel, data] of output) {
    const file = path.join(out, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    bytes += Buffer.byteLength(data);
  }
  return { buildMode, files: [...output.keys()].sort(), stripped, bytes, out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const outArg = args.indexOf('--out');
  try {
    const r = await build({
      isPublic: args.includes('--public') || process.env.PUBLIC_BUILD === '1',
      out: outArg >= 0 ? path.resolve(args[outArg + 1]) : undefined,
    });
    console.log(`build (${r.buildMode}): ${r.files.length} files, ${(r.bytes / 1024).toFixed(1)} KB -> ${path.relative(ROOT, r.out) || '.'}`);
    if (r.stripped.length) console.log(`stripped by the rights gate: ${r.stripped.length}\n  ${r.stripped.join('\n  ')}`);
  } catch (e) {
    fail('build', e.errors || [e.stack]);
  }
}
