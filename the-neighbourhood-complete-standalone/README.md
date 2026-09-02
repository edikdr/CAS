# The Neighbourhood — standalone fan site

An unofficial, monochrome fan archive. No server, no database, no build step for the
editable edition, and no API keys anywhere in the source.

## Two halves

- **The archive** — `index.html` and the single-file build. No server, no build
  step, no keys. Everything below works with nothing running.
- **`server/`** — an optional Express service that puts the Genius API behind
  our own origin: annotations, official song backgrounds, artist bios, metrics
  and cover versions. Off until `NBHD_CONFIG.geniusService` in `js/data.js`
  points at it. See `server/README.md`.

## Open it

- `the-neighbourhood-single.html` — double-click it; every asset is embedded.
- `index.html` — the editable multi-file source using `css/`, `js/` and `assets/`.
- `dist/the-neighbourhood-complete-standalone.zip` — the packaged copy of both.

## What is on the page

| Section | What it does |
| --- | --- |
| Hero / collage | A torn-paper collage layer scattered over every section (`js/collage.js`) |
| 01 Manifesto | Band summary, replaced live by the Wikimedia REST summary |
| 02 Discography | The four studio albums, plus a vault holding every single, EP, mixtape and compilation |
| Crate | Track search across the whole catalogue, and favourites kept per browser |
| Player | 30-second previews, a real audio visualiser, and a live API status row |
| 03 Origin story | Founding history, craft notes, four eras, timeline, codex, symbols and corrections |
| 04 People | Six members with portraits, facts, listening notes and profile modals |
| 05 Fan tests | Four 15-question quizzes with reshuffled answer positions |

## Motion and depth

Three independent layers move behind the content, and every one of them stops
dead under `prefers-reduced-motion`.

- **Particles** (`js/particles.js`) — one fixed canvas carrying fine dust, soft
  glow and a star sprite. Motes rise, sway, orbit and spin on independent cycles,
  and roughly one in eleven is a streak that draws a short comet tail. The canvas
  watches which section is behind it via `data-tone` and crossfades between
  `screen` on the black sections and `multiply` on the paper ones, so the same
  motes read as light on black and as ink on paper.
- **Collage drift** — every scattered paper object floats on its own cycle and
  shifts with scroll parallax.
- **Reveal** — content lifts in as it enters the viewport, then the class and
  attribute are removed again so hover transforms are never fought over.

## The star

`assets/star-glow.webp` is cut out of the supplied overlay clip. The star sits on
black in the source, so the alpha channel is derived from luminance with the low
end clipped: that removes the diagonal light streak and the watermark band while
keeping the star and its tight halo. It is composited back with `mix-blend-mode:
screen`, which makes the remaining dark halo disappear completely against the
dark sections — the reason it blends rather than sits on top. It appears twice:
once large in the hero, and again as a drifting sprite in the particle field.

## Black-to-white seams

Sections no longer butt against each other. A `.seam` block sits between each
change of tone and ramps one base colour into the next over 130-280px with an
eased, seven-stop alpha gradient plus a grain overlay, which also keeps the long
ramp from banding.

## The collage layer

`js/collage.js` draws every sticker — stars, tape, torn notes, polaroids, vinyl, bows,
ransom-note letters, the house mark, scribbles — as inline SVG. Nothing is a bitmap, so
the chaos costs almost nothing and stays themeable: pieces read light on the dark
sections and printed-ink on the paper sections. Placement is seeded, so the scatter is
random-looking but identical on every load, and each layer drifts slightly on scroll.

Density and behaviour are set per section from the markup:

```html
<section class="lore" data-debris="dark:15" data-keepout="0.56,0.52"> …
```

`dark|paper` picks the palette, the number is how many pieces to place, and `data-keepout`
is the normalised ellipse in the middle of the section that stays clear so the text
underneath keeps its contrast.

## Performance

The page stacks several full-viewport effects, so it is compositing-bound rather
than script-bound. Measured over four alternating runs of a full-page scroll at
1440x960, against the previous build:

| | first build | after pass 1 | after pass 2 |
| --- | --- | --- | --- |
| median frame | 61.9ms | 51.1ms | 28.3ms |
| 95th percentile frame | 118.9ms | 102.1ms | 65.3ms |
| total blocking time | 279ms | 209ms | 44ms |
| load / first paint | 500 / 508ms | 411 / 416ms | 310 / 268ms |

**Pass 2** removed the page-wide grain sheet. It was a fixed, viewport-sized
layer blended with `mix-blend-mode: overlay`, which forced the compositor to
re-read the backdrop on every scrolled frame, and it was the most expensive
single thing on the page. Measured against a frozen render it moved the image by
a mean of 0.95 levels out of 255, with **no pixel differing by more than 4** — so
nothing visible was traded for it. Grain that actually reads is still there: the
hero's `.noise` layer and the era cards. The topbar blur went from 15px to 10px,
and three assets that nothing referenced were deleted.

**Pass 1** changes, none of which altered the design:

- Every `<img>` carries its intrinsic `width` and `height`, so nothing reflows
  as images arrive.
- The debris float animation ran on the `<svg>` while the drop shadow sat on its
  parent, which re-rendered 93 filtered elements every frame. Moving the filter
  onto the animated element lets each one rasterise once and then only move.
- 111 waveform bars carried `will-change: transform` and were each promoted to
  their own compositor layer for no benefit.
- The particle field built a radial gradient per glow mote per frame; the sprite
  is now baked once and blitted, the canvas is capped at 1.5x, and under load the
  field drops to every other frame — invisible on motes that drift this slowly.
- The lore aurora ran a 14px blur over an animated element every frame, on
  gradients already soft enough that the blur did no visible work.
- Sections far from the viewport are skipped with `content-visibility: auto`,
  with per-breakpoint `contain-intrinsic-size` so the scroll height stays honest.
- The collage now builds each section's pieces as it approaches rather than all
  93 up front, which was the single longest task on the page.

## Search and favourites

The crate above the record grid searches every track in the catalogue by title or
release, and any row can be starred. Favourites live in `localStorage` under
`nbhd:favourites`, so they are per browser and never leave the machine. Private
windows and `file://` origins can refuse storage outright, so every read and write
is guarded and falls back to memory for the session.

## The visualiser

The bar row is a **timeline, not a spectrum**. As the clip plays, the bar under
the playhead samples the audio and is then left alone, so everything behind the
head is a frozen recording of what was actually heard — the way a voice note looks
once it has been played. Bars ahead of the head idle low until they are reached,
and a veil darkens the older history behind a moving playhead line.

Bar height comes from loudness (time-domain RMS) shaped by timbre (spectral
centroid), with a slow auto-gain so quiet tracks still fill the row. Against a
test signal, a loud broadband passage draws roughly twelve times taller than a
quiet low one, with a mid-level tone landing between them.

`js/visualizer.js` feeds that pipeline from whichever of two sources is
available:

1. **Analyser** — a Web Audio `AnalyserNode` reading the playing preview. The audio
   element requests the stream with `crossOrigin="anonymous"` so the graph can see it.
2. **Tempo sync** — when the stream is opaque, blocked, or missing entirely, a small
   kick/snare/hat synthesiser drives the bars from the track's tempo instead, so the row
   still moves in time rather than freezing.

The page switches automatically: if a preview host refuses the CORS request, playback is
reloaded without it (audio keeps working) and the bars fall back to tempo sync. The mode
in use is printed in the player's top-right corner. Bars behind the playhead are tinted,
so the row doubles as a progress bar. Under `prefers-reduced-motion` it renders a static
waveform and never animates.

## Live data

Every request is keyless and made straight from the browser. The **SIGNAL CHECK** row in
the player reports the live state of each one.

| Source | Used for |
| --- | --- |
| iTunes Search + Lookup | Album lookup, authoritative tracklists, artwork, 30-second previews |
| LRCLIB | Full lyrics, plain and time-synced |
| Wikimedia REST | The band summary in section 01 |

How the catalogue is assembled:

- The grid carries only the four studio albums. Everything else — both 2012 EPs, the
  mixtape, the 2018 compilation and the Sweater Weather single — lives in the vault,
  which also lists every single and EP iTunes knows about when the page is online.
- Releases marked `partial` in `js/data.js` (the two 2012 EPs, the mixtape and the 2018
  compilation) ship only a small verified seed. For those the iTunes catalogue is treated
  as authoritative and replaces the bundle when the page is online.
- The four studio albums and the single ship complete offline tracklists; the API then
  attaches preview URLs, exact durations, store links and artwork, and appends anything
  extra it finds as `CATALOGUE` rows.
- Each album modal states which of the two it is showing, so an offline copy is never
  passed off as the full release.
- Lyrics are never stored in this archive. They are requested from LRCLIB when a track is
  opened; without a connection only the short bundled excerpts appear, and the panel says so.

Public API calls need internet access. If a browser blocks requests from a local `file://`
page, serve the multi-file edition from any static host. There is still no backend.

## Rebuild the single-file edition

```bash
node tools/build-single.mjs
```

It inlines the stylesheet, all five scripts, and every asset — including the ones
referenced from CSS `url()` and from JavaScript string literals — as data URIs.

The archive contains no secrets. Putting a private API key into browser JavaScript would
expose it to every visitor, and none of the APIs used here requires one.
