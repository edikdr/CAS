#!/usr/bin/env python3
"""
Build the single-file edition.

Takes the multi-file site (index.html + css/ + js/ + assets/) and folds it
into one self-contained .html: stylesheet inlined, scripts inlined, every
.webp rewritten as a base64 data: URI. The result opens straight from
file:// with no server and no network.
"""
import base64
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'cas-fansite-single.html'

CSS = ['css/style.css']
JS = ['js/assets.js', 'js/data.js', 'js/quizzes.js',
      'js/collage.js', 'js/lyrics.js', 'js/quiz.js', 'js/main.js']


def data_uri(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def main() -> int:
    html = (ROOT / 'index.html').read_text(encoding='utf-8')

    # ---- inline the stylesheet -------------------------------------------
    css = '\n'.join((ROOT / c).read_text(encoding='utf-8') for c in CSS)
    style_block = '<style>\n' + css + '\n</style>\n'
    html, n = re.subn(
        r'[ \t]*<link rel="stylesheet" href="css/style\.css" />\n',
        lambda _m: style_block, html, count=1)
    if n != 1:
        raise SystemExit('could not find the stylesheet <link> to inline')

    # ---- inline the scripts ----------------------------------------------
    js = '\n'.join(
        f'/* ===== {p} ===== */\n' + (ROOT / p).read_text(encoding='utf-8')
        for p in JS)
    script_block = '<script>\n' + js.replace('</script>', r'<\/script>') + '\n</script>\n'
    html, n = re.subn(
        r'(?:[ \t]*<script src="js/[^"]+"></script>\n)+',
        lambda _m: script_block, html, count=1)
    if n != 1:
        raise SystemExit('could not find the <script> tags to inline')

    # ---- fold every asset into a data: URI -------------------------------
    # Longest paths first so no path is a prefix of another.
    assets = sorted((ROOT / 'assets').rglob('*.webp'),
                    key=lambda p: len(p.as_posix()), reverse=True)
    replaced = 0
    for path in assets:
        rel = path.relative_to(ROOT).as_posix()          # assets/cut/eye.webp
        uri = data_uri(path)
        for needle in (f'../{rel}', rel):                # CSS uses ../assets/…
            if needle in html:
                html = html.replace(needle, uri)
                replaced += 1

    leftovers = re.findall(r'(?:\.\./)?assets/[\w./-]+\.webp', html)
    if leftovers:
        print(f'  ! {len(leftovers)} asset reference(s) not inlined: '
              f'{sorted(set(leftovers))[:5]}', file=sys.stderr)

    html = html.replace(
        '<title>Cigarettes After Sex — Fan Sanctuary</title>',
        '<title>Cigarettes After Sex — Fan Sanctuary (single file)</title>')

    OUT.write_text(html, encoding='utf-8')
    kb = OUT.stat().st_size / 1024
    print(f'built {OUT.name}: {kb:.0f} KB '
          f'({len(assets)} assets, {replaced} references inlined)')
    return 1 if leftovers else 0


if __name__ == '__main__':
    raise SystemExit(main())
