#!/usr/bin/env python3
"""
Package both editions into dist/cas-fansite.zip.

The archive contains one folder, cas-fansite/, holding the multi-file site
(index.html + css/ + js/ + assets/), the standalone single-file build, the
build tools and the README. Unzip and either open the single file or serve
the folder.
"""
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
OUT = DIST / 'cas-fansite.zip'
TOP = 'cas-fansite'

INCLUDE_FILES = ['index.html', 'cas-fansite-single.html', 'README.md']
INCLUDE_DIRS = ['css', 'js', 'assets', 'tools']
SKIP_SUFFIX = {'.pyc'}
SKIP_NAMES = {'.DS_Store'}


def collect() -> list[pathlib.Path]:
    picked: list[pathlib.Path] = []
    for name in INCLUDE_FILES:
        p = ROOT / name
        if not p.exists():
            raise SystemExit(f'missing {name} — run tools/build_single.py first')
        picked.append(p)
    for d in INCLUDE_DIRS:
        for p in sorted((ROOT / d).rglob('*')):
            if p.is_file() and p.suffix not in SKIP_SUFFIX and p.name not in SKIP_NAMES \
                    and '__pycache__' not in p.parts:
                picked.append(p)
    return picked


def main() -> None:
    DIST.mkdir(exist_ok=True)
    files = collect()
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            z.write(p, f'{TOP}/{p.relative_to(ROOT).as_posix()}')

    raw = sum(p.stat().st_size for p in files)
    print(f'built {OUT.relative_to(ROOT)}: '
          f'{OUT.stat().st_size / 1024 / 1024:.2f} MB '
          f'({len(files)} files, {raw / 1024 / 1024:.2f} MB uncompressed)')


if __name__ == '__main__':
    main()
