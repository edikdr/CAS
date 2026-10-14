# Receipt extract (from the Arctic Monkeys archive)

The receipt = a till-receipt tracklist that **unfolds from a crumpled sheet**. Text is real DOM (clickable rows); the crumple is **pre-rendered WebP frames** (3D paper mesh, build step) played back as steps; with no frames it simply stays flat. This folder is the whole mechanism, cut out of the archive and adapted to sunniva's data.

## Files
| Path | Role | Origin |
|---|---|---|
| `js/receipt.js` | markup builders (waveform, barcode, rows), `buildAlbumCard(album)`, frame playback (`playTo`, `setOpen`, `applyStage`), sfx, resize measuring | AM archive, unchanged |
| `js/receipt-deps.js` | the 3 globals it needs: `esc`, `secsOf`, `albumRuntime` | verbatim from AM `main.js` / `data.js` |
| `js/sunniva-receipts.js` | **new**: `buildSunnivaReceipts()` (tracks/releases/receipts JSON -> album objects) + `receiptMarkup()` override without AM wording | new |
| `js/crumple-manifest.AM-sample.js` | what `tools/crumple/to_webp.py` generates: frame size, flat sheet box, stages, per-stage boxes. Needs a `sunniva` equivalent (generated, never hand-written) | AM sample |
| `crumple-sample/*.webp` | ten stages (100..10) for one AM receipt, to see the format and size (~45 KB each) | AM sample, **not for reuse** |
| `css/receipt.css` | 50 rules (`.rc-*`, `.album*`, `.unfold*`) cut from AM `style.css` | AM |
| `css/receipt-root-vars.css` | the original `:root` variables (receipt uses `--paper --chalk --chalk-dim --line --fat --cloth`) | AM |
| `css/receipt-fonts.css`, `fonts/*.woff2` | Archivo Black, Courier Prime 400/700, Caveat (OFL) | AM, confirm + add OFL.txt |
| `sfx/fold.wav`, `unfold.wav` | the two paper sounds (480 KB, loaded only on first hover/press) | AM, **provenance unknown** -> register + replace if unsure |
| `tools/crumple/` | build pipeline: `render.mjs` (Playwright screenshots the flat receipt from the live page, maps it onto a paper mesh in `crumple.html`, captures a frame per stage), `to_webp.py` (shared crop + WebP), `texture.html` | AM |
| `demo/receipt-demo.html` | draft page showing the 4 sunniva receipts flat | new, **not rendered by the author** |
| `test/receipt-markup.test.mjs` | Node test: 17/7/8/1 rows, no AM wording, 4 "also on the album" marks | new, **passes** (run from kit root) |

## Data shape `receipt.js` expects (`album`)
`{ id, title, short, year, released, type, tracks:[{ name, duration:"m:ss" }] }` (+ our extras `id`, `alsoOnAlbum`, `credit` per row). `short` feeds the optional magazine-letter title (`ransom()` in `collage.js`, used only `if typeof ransom === 'function'`). AM also used `label`, `producers`, `studio`, `note`, `cover` - **sunniva has none verified**, so the override drops them.

## DOM contract
`#albumList` > `.album` card > `.rc-stage` (`.rc-frames` images + `.rc-paper` live receipt) + `.rc-controls` (`button.unfold`, `.rc-title`, `.rc-year`). Rows: `li.rc-row[data-track][data-album]` (we add `data-track-id`). `#unfoldAll` is optional. In AM, `main.js` (`renderAlbums`) wires row clicks to `TrackModal.open` and inserts the sleeve above the stage - in the new project the **receipt modal** (Stage 2, S5) does this and **no sleeve/cover is placed on receipts**.

## What to change for sunniva (done / to do)
- Done in `sunniva-receipts.js`: wording, no credits, "*" for singles that are also on the album, first-release date line, data adapter.
- To do (Stage 2, S5): 
  1. **Frames pipeline.** `render.mjs` needs `three` + `playwright` (build only) and a page that renders `.album` cards at `http://localhost:8765`; it writes `assets/crumple/<id>/<pct>.png`, then `to_webp.py` -> WebP + manifest. Four receipts x 10 stages ~ 1.8 MB: **do not ship that much**. Use 5-6 stages, quality ~70, shared crop box, lazy-load per receipt when it scrolls near. The 1-row `appearances` receipt can use a different paper (ticket stub) or the CSS-only fallback.
  2. If the frames pipeline is too heavy: CSS-only unfold (clip-path/skew, 3-4 steps). Say which you chose.
  3. Decide the lyric-free row action: row click -> `ModalManager.open('track', {id})`.
  4. Replace sfx if provenance is unclear; register fonts + OFL.
  5. Reduced motion: `receipt.js` already jumps to the end state (`REDUCED()`).
- Budget reminder: receipt frames never load on first paint.

## Facts about the numbers (from the test)
Album 17 rows / 40:19, Singles 7 / 14:39 (first release 2025-10-03), Demos 8 / 15:01, Appearances 1 / 2:26. Four singles carry a "*" because the same song is on the album.
