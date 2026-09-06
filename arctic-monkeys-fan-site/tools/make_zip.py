#!/usr/bin/env python3
"""
Package the site into dist/arctic-monkeys-fan-site.zip, ready to deploy.

The archive holds one folder with everything a host needs and nothing it
does not: the site itself, the two serverless shapes, the platform config,
the standalone Node server, the fetchers and the README.

    python3 tools/make_zip.py

Unzip it and:

  * drop `arctic-monkeys/` on any static host — previews, sleeves,
    portraits, the full words and the quizzes all work with no key
  * or point Netlify or Vercel at the unpacked folder, add
    GENIUS_ACCESS_TOKEN, redeploy, and the annotations and the Genius
    credits come with it
  * or `node server.js`, which serves the site and both routes

What is deliberately left out: .env and anything that could hold a
credential, the crumple renderer's vendored copy of three.js, caches, and
this repository's git metadata.
"""

import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = DIST / 'arctic-monkeys-fan-site.zip'
TOP = 'arctic-monkeys-fan-site'

INCLUDE_FILES = ['README.md', 'netlify.toml', 'vercel.json', 'server.js', '.env.example']
INCLUDE_DIRS = ['arctic-monkeys', 'netlify', 'api', 'tools']

# .env is the one that matters; the rest is noise nobody needs to unzip
SKIP_NAMES = {'.DS_Store', '.env', '.env.local'}
SKIP_SUFFIX = {'.pyc'}
SKIP_PARTS = {'__pycache__', 'node_modules', 'vendor', '.git'}


def collect():
    picked = []
    for name in INCLUDE_FILES:
        p = ROOT / name
        if not p.exists():
            raise SystemExit(f'missing {name}')
        picked.append(p)
    for d in INCLUDE_DIRS:
        for p in sorted((ROOT / d).rglob('*')):
            if not p.is_file():
                continue
            if p.name in SKIP_NAMES or p.suffix in SKIP_SUFFIX:
                continue
            if SKIP_PARTS & set(p.parts):
                continue
            picked.append(p)
    return picked


def main():
    DIST.mkdir(exist_ok=True)
    files = collect()
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            z.write(p, f'{TOP}/{p.relative_to(ROOT).as_posix()}')
    size = OUT.stat().st_size / (1024 * 1024)
    print(f'{OUT.relative_to(ROOT)} — {len(files)} files, {size:.1f} MB')


if __name__ == '__main__':
    main()
