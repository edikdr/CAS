#!/usr/bin/env python3
"""
Build the single-file edition.

Takes the multi-file site (index.html + css/ + js/ + assets/) and folds it
into one self-contained .html: stylesheet inlined, scripts inlined, every
.webp rewritten as a base64 data: URI. The result opens straight from
file:// with no server and no network.

Each asset is encoded at most once per context. Several are named more than
once — collage3 backs four different rules, and a few cut-outs answer to two
keys — and a plain find-and-replace would paste the same third of a megabyte
in for every mention. Repeats become a custom property in the stylesheet and
a `var` in the script instead, which is worth ~1.7 MB on the finished file.
"""
import base64
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'cas-fansite-single.html'

CSS = ['css/style.css']

# url('../assets/…') in the stylesheet, quoted however
CSS_REF = re.compile(r"""url\((['"]?)\.\./(assets/[\w./-]+\.webp)\1\)""")
# 'assets/…' as a string literal in the scripts
JS_REF = re.compile(r"""(['"])(assets/[\w./-]+\.webp)\1""")
HTML_REF = re.compile(r"""(assets/[\w./-]+\.webp)""")


def data_uri(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


class Assets:
    """Resolves an assets/… path to its data: URI, reading each file once."""

    def __init__(self):
        self.cache = {}
        self.missing = set()

    def uri(self, rel):
        if rel in self.cache:
            return self.cache[rel]
        p = ROOT / rel
        if not p.is_file():
            self.missing.add(rel)
            return None
        self.cache[rel] = data_uri(p)
        return self.cache[rel]


def fold_css(css, assets):
    """Rewrite url(../assets/…) to var(--aN); returns (css, :root block)."""
    names, order = {}, []

    def sub(m):
        rel = m.group(2)
        if assets.uri(rel) is None:
            return m.group(0)
        if rel not in names:
            names[rel] = f'--a{len(names)}'
            order.append(rel)
        return f'var({names[rel]})'

    css = CSS_REF.sub(sub, css)
    if not order:
        return css, ''
    defs = ''.join(f'  {names[r]}: url("{assets.uri(r)}");\n' for r in order)
    return css, ':root {\n' + defs + '}\n'


def fold_js(js, assets):
    """Rewrite 'assets/…' literals to __aN; returns (js, var block)."""
    names, order = {}, []

    def sub(m):
        rel = m.group(2)
        if assets.uri(rel) is None:
            return m.group(0)
        if rel not in names:
            names[rel] = f'__a{len(names)}'
            order.append(rel)
        return names[rel]

    js = JS_REF.sub(sub, js)
    if not order:
        return js, ''
    defs = ''.join(f'var {names[r]}="{assets.uri(r)}";\n' for r in order)
    return js, defs


def main() -> int:
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    assets = Assets()

    # ---- stylesheet -------------------------------------------------------
    css = '\n'.join((ROOT / c).read_text(encoding='utf-8') for c in CSS)
    css, css_defs = fold_css(css, assets)
    style_block = '<style>\n' + css_defs + css + '\n</style>\n'
    html, n = re.subn(
        r'[ \t]*<link rel="stylesheet" href="css/style\.css" />\n',
        lambda _m: style_block, html, count=1)
    if n != 1:
        raise SystemExit('could not find the stylesheet <link> to inline')

    # ---- scripts ----------------------------------------------------------
    # Read the list off the page itself, in document order, so adding or
    # removing a script never leaves this builder pointing at a stale file.
    scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
    if not scripts:
        raise SystemExit('no <script src="js/…"> tags found in index.html')
    missing = [s for s in scripts if not (ROOT / s).exists()]
    if missing:
        raise SystemExit(f'index.html references missing script(s): {missing}')
    js = '\n'.join(
        f'/* ===== {p} ===== */\n' + (ROOT / p).read_text(encoding='utf-8')
        for p in scripts)
    js, js_defs = fold_js(js, assets)
    script_block = ('<script>\n' + js_defs
                    + js.replace('</script>', r'<\/script>') + '\n</script>\n')
    html, n = re.subn(
        r'(?:[ \t]*<script src="js/[^"]+"></script>\n)+',
        lambda _m: script_block, html, count=1)
    if n != 1:
        raise SystemExit('could not find the <script> tags to inline')

    # ---- whatever the markup itself names ---------------------------------
    html = HTML_REF.sub(lambda m: assets.uri(m.group(1)) or m.group(0), html)

    leftovers = sorted(set(re.findall(r'(?:\.\./)?assets/[\w./-]+\.webp', html)))
    if leftovers:
        print(f'  ! {len(leftovers)} asset reference(s) not inlined: '
              f'{leftovers[:5]}', file=sys.stderr)
    if assets.missing:
        print(f'  ! referenced but missing on disk: {sorted(assets.missing)[:5]}',
              file=sys.stderr)

    html = html.replace(
        '<title>Cigarettes After Sex — Fan Sanctuary</title>',
        '<title>Cigarettes After Sex — Fan Sanctuary (single file)</title>')

    OUT.write_text(html, encoding='utf-8')
    raw = sum(len(v) for v in assets.cache.values())
    print(f'built {OUT.name}: {OUT.stat().st_size/1024:.0f} KB '
          f'({len(assets.cache)} assets encoded, {raw/1024:.0f} KB of base64)')
    return 1 if (leftovers or assets.missing) else 0


if __name__ == '__main__':
    raise SystemExit(main())
