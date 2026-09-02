# The Neighbourhood — standalone fan site

An unofficial, monochrome fan archive. No server, no database, no build step for the
editable edition, and no API keys anywhere in the source.

## Open it

- `the-neighbourhood-single.html` — double-click it; every asset is embedded.
- `index.html` — the editable multi-file source using `css/`, `js/` and `assets/`.

## What is on the page

| Section | What it does |
| --- | --- |
| Hero / collage | A torn-paper collage layer scattered over every section (`js/collage.js`) |
| 01 Manifesto | Band summary, replaced live by the Wikimedia REST summary |
| 02 Discography | Nine releases; each opens a modal with the full tracklist |
| Player | 30-second previews, a real audio visualiser, and a live API status row |
| 03 Origin story | Founding history, four eras, timeline, codex, symbols and corrections |
| 04 Contact sheet | Two archive portrait plates in the house monochrome treatment |
| 05 People | Six members, current and former, with detailed profile modals |
| 06 Fan tests | Four 15-question quizzes with reshuffled answer positions |

## Motion and depth

Three independent layers move behind the content, and every one of them stops
dead under `prefers-reduced-motion`.

- **Particles** (`js/particles.js`) — one fixed canvas carrying fine dust, soft
  glow and a star sprite. It watches which section is behind it via `data-tone`
  and crossfades between `screen` on the black sections and `multiply` on the
  paper ones, so the same motes read as light on black and as ink on paper.
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

## The visualiser

`js/visualizer.js` runs the bar row under the player on whichever of two paths is
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
