# Cigarettes After Sex — Fan Sanctuary

A fan-made, unofficial single-page site: cut-paper collage design, full discography,
timecoded lyric lines with a karaoke playhead, a live public-API console, and four quizzes.

Everything is vanilla HTML/CSS/JS. **No frameworks, no build step, no CDN, no external
JavaScript** — the page works with the network switched off.

---

## Two editions

| Edition | File | Notes |
|---|---|---|
| Multi-file (source) | `index.html` + `css/` + `js/` + `assets/` | What you edit |
| Single file | `cas-fansite-single.html` | ~2.7 MB, every asset inlined as a `data:` URI. Double-click it — no server needed |

Both are byte-identical in behaviour; the single file is generated from the source.

### Running it

```bash
# multi-file — any static server works
python3 -m http.server 8000
# then open http://localhost:8000

# single file — just open it
xdg-open cas-fansite-single.html
```

Serving over `http://` rather than `file://` is recommended for the multi-file edition:
some browsers refuse `fetch()` from `file://`, which affects the live API console only.

### Rebuilding

```bash
python3 tools/gen_assets.py     # regenerate js/assets.js from assets/ on disk
python3 tools/build_single.py   # regenerate cas-fansite-single.html
python3 tools/make_zip.py       # regenerate dist/cas-fansite.zip
```

Run `gen_assets.py` whenever you add or rename a file under `assets/`.

---

## Design

Not a dark theme with blur — a collage.

* **Real cut letters.** Headings are not a font. `assets/letters/` holds 52 individually
  segmented paper letter scans — a warm/coloured alphabet (`warm/a…z`) and a newsprint
  alphabet (`mono/a…z`). `ransom()` in `js/collage.js` alternates the two sets letter by
  letter and applies a *deterministic* rotation and vertical offset per glyph, so a heading
  looks hand-taped but identical on every reload. Digits and punctuation fall back to a
  small paper chip.
* **Layered collage.** ~38 cut-outs (`assets/cut/`) — fingerprint heart, cigarette pack,
  CD, red embroidered stars, torn lyric labels, a marquee, a moon, "forever.",
  "GOOD NIGHT" — float in the background of each section with a slow drift animation and
  a damped scroll parallax.
* **Paper, not glass.** Every panel is `.paper`: solid dark stock, a crumpled-kraft
  texture at 7.5% luminosity, masking-tape strips at the corners, torn clip-path edges.
  There is no `backdrop-filter` anywhere in the stylesheet.
* **Album covers** are three stacked sleeves — a newsprint back, a collage middle, and a
  front carrying the artwork with the title on a cut-paper band along the bottom. The
  stack fans out on hover; the *Cry* sleeve's disc spins.
* **Tactile hover.** Cards un-rotate and lift, tape darkens, photos desaturate less,
  track rows indent, letters in a heading shuffle in opposite directions.

Reduced motion is respected: `prefers-reduced-motion` kills the animations, the ash
canvas and the parallax.

---

## Members modal

Clicking any member card opens the full profile: large photo (or monogram for members
with no photograph), role, an extended multi-paragraph story, and a metadata grid —
status, years, instruments, base, notable credits.

Closing works four ways, as asked:

* the **×** button
* a **click outside** the card
* the **Escape** key
* the modal's own Previous/Next buttons walk the line-up, and **← →** do the same

The dialog is a real dialog: `role="dialog"`, `aria-modal`, focus moves to the close
button on open and returns to the card that opened it, Tab is trapped inside, and the
page behind is scroll-locked.

---

## Lyrics & API

Three tabs.

**Synced lyrics.** Eight tracks with timecoded lines and a transport (play/pause, ±10 s,
line-by-line stepping, scrub bar). The active line highlights and auto-scrolls. Because a
static page has no audio stream, the playhead is a *virtual clock* — it advances itself
and lights the line whose timecode has passed. Export the current track as a standard
`.lrc` file, or copy it to the clipboard.

> The bundled lines are **short signature excerpts** with approximate fan timings — enough
> to follow a song's shape, not a full lyric sheet. Full lyrics are not reproduced here.
> Press **Fetch full LRC from LRCLIB** to pull real synced lyrics from the open LRCLIB
> database at runtime; the parser accepts standard `[mm:ss.xx]` LRC.

**API endpoints.** Reference cards for five keyless public APIs — LRCLIB, iTunes Search,
MusicBrainz, Cover Art Archive and Spotify embed/oEmbed — with the request paths, what
each parameter does, and a sample response shape.

**Live console.** Pick an endpoint, edit the artist/track, see the exact URL, send the
request, and read the raw JSON with status code, latency and payload size. A failed
browser request is explained (CORS / offline / `file://`) instead of printing
`TypeError`. There is also a **Download this site's dataset** button that exports the
page's own discography, line-up and LRC excerpts as JSON.

All five APIs are keyless, so requests go straight from the browser. A host that does not
send CORS headers will refuse — that is a browser rule, not a broken URL.

---

## Quizzes

Four independent decks, 63 questions, each with its own progress bar and score:

| Deck | Questions |
|---|---|
| Lore & Basics | 18 |
| Tracks & Albums | 15 |
| Releases & Covers | 15 |
| Deep Fan | 15 |

Answers lock once chosen, the correct option is always revealed, you can step back
through what you answered, and finishing gives a score with a verdict.

---

## Layout

```
index.html                  markup only
css/style.css               all styling
js/assets.js                generated key → path map for all 99 assets
js/data.js                  members, discography, singles, LRC excerpts, API catalogue
js/quizzes.js               the four question decks
js/collage.js               ransom() letters, floating cut-outs, ash canvas, reveals
js/lyrics.js                synced-lyrics player + API console
js/quiz.js                  quiz engine
js/main.js                  rendering, member modal, search
assets/letters/{warm,mono}/ 52 cut paper letters
assets/cut/                 ~38 collage cut-outs and paper textures
assets/photo/               band photographs
assets/bg/                  collage / stage backgrounds
tools/                      asset registry, single-file builder, zip packer
```

Press `/` anywhere to jump to the discography search.

### A note on fonts

The page links Google Fonts (Playfair Display, Cormorant Garamond, Special Elite,
Courier Prime). They are *not* bundled, so with no network the browser falls back to the
stacks declared in `:root` — Georgia for the serifs, Courier New for the typewriter faces.
The layout is unaffected; only the letterforms change. The cut-paper headings are images,
so they look the same either way.

---

## Credits

Fan-made and unaffiliated with the band or Partisan Records. All music rights belong to
Cigarettes After Sex / Partisan Records. Lyric lines appear as short excerpts for
identification only. The collage is assembled from fan artwork; the letters are scanned
from a ransom-note alphabet sheet.
