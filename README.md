# Fan sites

Two unofficial, non-commercial fan sites in one repository.

| Site | Where | What |
|---|---|---|
| **Arctic Monkeys — Receipt Archive** | [`arctic-monkeys/`](arctic-monkeys/README.md) | seven albums as crumpled till receipts that unfold, with Genius annotations and a waveform player |
| **Cigarettes After Sex — Fan Sanctuary** | this directory | cut-paper collage, full discography, quizzes |

They share the cut-paper alphabets in `assets/letters/`. Everything below
describes the Cigarettes After Sex site.

---

# Cigarettes After Sex — Fan Sanctuary

A fan-made, unofficial single-page site: cut-paper collage design, full discography,
timecoded lyric lines, a designed 30-second preview player, and four quizzes.

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
some browsers block network requests from `file://`, which is what the preview lookup
needs. Everything else — the collage, the words, the windows, the quizzes — works either
way, with no network at all.

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

## Player

Each record carries its own player, designed in the same cut-paper language as the
rest of the page — a spinning sleeve, a scrub bar, prev/play/next. There is no
third-party embed anywhere on the site.

Playback is a **30-second preview** per track, resolved at runtime. One audio element
serves the whole page: whichever player face holds the cued track drives the transport,
the rest sit idle showing their own subject. Starting a track from the ▶ on a row cues it
in that record's player; opening a song's window while something else is playing does not
interrupt it.

When a preview cannot be resolved — offline, or the lookup is refused — the transport
still runs on an internal clock so the controls behave, and the face says the preview is
unavailable and points at the full-track links instead. Nothing technical surfaces in the
interface.

## Track window

Clicking any track row opens it (the ▶ button only previews — it does not open the
window):

* the **words**, as short signature lines each carrying a `[mm:ss]` timecode
* **Follow along**, which walks a marker down the lines on the song's own timeline;
  clicking any line moves the marker there
* a **preview player** for that track
* the **video on YouTube**
* **where to listen in full** — Spotify, Apple Music, YouTube Music, Bandcamp, Deezer

Tracks with no transcribed lines still open, with the links and an honest empty state.

Closing works the same four ways as the member window: **×**, a **click outside**,
**Escape**, and **← →** move through the record.

> The bundled lines are **short signature excerpts** with approximate fan timings —
> enough to follow a song's shape, not a full lyric sheet. Full lyrics are not
> reproduced here.

## Discography

Six releases, 48 tracks, including the early El Paso material that streaming does not
carry:

| Year | Release | Tracks |
|---|---|---|
| 2009 | I Can See You (EP, self-released) | 4 |
| 2011 | Romans 13:9 (demo album) | 11 |
| 2012 | I. (EP) | 4 |
| 2017 | Cigarettes After Sex | 10 |
| 2019 | Cry | 9 |
| 2024 | X's | 10 |

Plus 18 singles and covers. Durations are left as `—` where no reliable runtime exists
for the unreleased material rather than being invented.

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
js/data.js                  members, discography, singles, lyric excerpts, platform links
js/quizzes.js               the four question decks
js/collage.js               ransom() letters, floating cut-outs, ash canvas, reveals
js/player.js                preview player engine + player faces
js/trackmodal.js            the track window: words, video, platforms
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
