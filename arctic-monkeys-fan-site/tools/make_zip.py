#!/usr/bin/env python3
"""
Package the site. Two archives, for two different ways of deploying.

    python3 tools/make_zip.py

**dist/am-site.zip** — the site, and only the site, with index.html at the
top of the archive rather than inside a folder. This is the one to drop
onto Netlify, Cloudflare Pages, Surge or anything else that takes a zip
and serves what is in it. Drop it as it is; there is nothing to unpack and
nothing to configure.

A dropped archive is served, not built, so no serverless function can come
with it — on any host, by any of them, ever. That is not a limitation of
this archive: manual deploys have no build step to bundle one in. Which is
why it is worth running the two fetchers first, with a Genius token in the
environment:

    python3 tools/fetch_am_data.py --genius   # credits, artwork, annotations
    python3 tools/fetch_lyrics.py             # the words for all 80 tracks

Both write into arctic-monkeys/js/, and the page reads them before it
reaches for anything else. Do that and a dropped archive has the whole
site in it — annotations included — with no token on the server, no
environment variable and no function.

**dist/arctic-monkeys-fan-site.zip** — the whole project: the site, both
serverless shapes, the platform config, the Node server, the fetchers and
the README. This is the one for a host that builds: connect it to Netlify
or Vercel, set GENIUS_ACCESS_TOKEN, and Genius is answered live instead.

What is deliberately left out of both: .env and anything that could hold a
credential, the crumple renderer's vendored copy of three.js, caches, and
this repository's git metadata.
"""

import pathlib
import re
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
SITE = ROOT / 'arctic-monkeys'

OUT = DIST / 'arctic-monkeys-fan-site.zip'
TOP = 'arctic-monkeys-fan-site'

# the drop-in: no wrapper folder, because what a host serves is whatever
# sits at the top of the archive
DROP = DIST / 'am-site.zip'

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


def site_files():
    return [p for p in sorted(SITE.rglob('*'))
            if p.is_file()
            and p.name not in SKIP_NAMES and p.suffix not in SKIP_SUFFIX
            and not (SKIP_PARTS & set(p.parts))]


def write(out, files, root, top=''):
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            rel = p.relative_to(root).as_posix()
            z.write(p, f'{top}/{rel}' if top else rel)
    return out.stat().st_size / (1024 * 1024)


def main():
    DIST.mkdir(exist_ok=True)

    full = collect()
    size = write(OUT, full, ROOT, TOP)
    print(f'{OUT.relative_to(ROOT)} — {len(full)} files, {size:.1f} MB   (for a host that builds)')

    site = site_files()
    size = write(DROP, site, SITE)
    print(f'{DROP.relative_to(ROOT)} — {len(site)} files, {size:.1f} MB   (drop this one straight in)')

    # the word appears in the placeholder's own prose, so look for the key
    api = SITE / 'js' / 'am-api-data.js'
    if not re.search(r'["\']notes["\']\s*:', api.read_text(encoding='utf-8')):
        print('\nNote: no Genius data is baked in, so a dropped copy will have no\n'
              '      annotations, statistics or live credits. To bake them:\n'
              '        GENIUS_ACCESS_TOKEN=… python3 tools/fetch_am_data.py --genius\n'
              '        python3 tools/fetch_lyrics.py\n'
              '      then run this again.')


if __name__ == '__main__':
    main()
