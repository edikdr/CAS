# Arctic Monkeys — Receipt Archive

An unofficial fan archive. Seven studio albums, eighty tracks, each record
printed as a till receipt that arrives screwed up into a ball and unfolds when
you press play.

Not affiliated with Arctic Monkeys, Domino Recording Company, or anyone who
works with them.

---

## Running it

It is a static site. Any web server will do:

```bash
python3 -m http.server 8000    # from the repository root
# → http://localhost:8000/arctic-monkeys/
```

Or, if you want Genius answered live as well:

```bash
cp .env.example .env           # put your token in
node server.js                 # → http://localhost:8080
```

`server.js` has no dependencies and reads `PORT` from the environment, so it
runs unchanged on anything that runs Node. Nothing in the project is tied to a
particular host.

---

## The receipt

Each album is printed from its own data — the tracklist, the totals, the
producer credits, the barcode and the waveform are all generated in the
browser from `js/data.js`. There is no image of a receipt anywhere.

The crumple is not CSS. CSS cannot give paper volume: no self-shadowing, no
folds catching light, no print bending over a crease. So the frames are
rendered from a real 3D scene ahead of time and the site plays them back.

```
tools/crumple/
  texture.html   renders one album's receipt flat, on a bare page with no
                 transforms, and it is screenshot as the paper texture
  crumple.html   maps that onto a paper mesh and deforms it in three phases:
                 creases press in, the sheet rolls up, the roll is crushed
  render.mjs     drives it and captures ten stages per album
  to_webp.py     crops, compresses, and writes js/crumple-manifest.js
```

The three phases matter. Interpolating a flat plane straight into a sphere
makes the paper pancake half way, which is not what paper does — it rolls
first. Ridged noise gives flat panels meeting at hard ridges rather than soft
lumps, and flat shading plus a key light does the rest.

Rebuilding the frames (only needed if you change the receipt design):

```bash
npm install three playwright
cp node_modules/three/build/three.{module,core}.js tools/crumple/vendor/
python3 -m http.server 8765 &
node tools/crumple/render.mjs
python3 tools/crumple/to_webp.py
```

28 MB of PNG comes out as 3 MB of webp. The site never loads a 3D library.

**The last step hands over to the DOM.** At 0% the images are hidden and the
real receipt takes their place, so the flat state is live text: the rows are
buttons, the tracklist is selectable, and screen readers get markup rather
than a picture.

### What happens when you press play

    ball at 100%  →  PLAY  →  unfolds stage by stage to 0%
                  →  choose a track  →  it screws back up, the track window opens

---

## Data

| Source | What it gives | Key |
|---|---|---|
| **iTunes Search API** | 30-second previews, artwork, store links | none |
| **Deezer API** | previews, durations, links | none |
| **MusicBrainz** | canonical tracklists, cross-checking | none |
| **Genius** | songwriter credits, artwork, **annotations** | free token |

Track listings, durations and credits are already written into `js/data.js` and
the site is complete without ever touching a network. The fetcher only enriches
it:

```bash
python3 tools/fetch_am_data.py              # iTunes + Deezer
python3 tools/fetch_am_data.py --all        # + Genius + artwork + MusicBrainz
```

It writes `js/am-api-data.js` and `assets/art/`. Both are read only if present.

### Genius

Genius does not serve lyrics through its API, and it refuses cross-origin
requests from a browser. Both facts shape the design:

- **Full lyrics are never reproduced here.** Every track window links to its
  Genius page, which is where the words belong.
- **What the API does give is annotations** — the fragments the community has
  written notes on. Those appear under *Annotations* in each track window:
  click a fragment, read what it is about, follow through to the source.
- **The token never reaches the browser.** It is read from `.env` at build
  time by the fetcher, or held by `server.js` if you run the live proxy.

Get a token at [genius.com/api-clients](https://genius.com/api-clients) —
generate a **client access token**, which is read-only. That is the only
credential the project uses. The client secret exists to log users in on your
behalf, which nothing here does; do not put it in `.env`.

```
GENIUS_ACCESS_TOKEN=your_token_here
```

`.env` is gitignored. Nothing secret is written into `am-api-data.js`.

---

## The player

The transport is the AM waveform. It is drawn to a canvas, and its amplitude
follows the music through a Web Audio `AnalyserNode`.

Whether that analysis is real depends on the file: attaching an analyser to a
cross-origin stream only works when the response carries CORS headers, and some
Apple previews do not. When the analyser comes back silent the waveform falls
back to a modelled pulse instead — it still moves with the track, it is simply
no longer measuring it. The panel says which one you are looking at.

Only the cued player animates; one shared `requestAnimationFrame` drives the
page, and it stops the moment playback stops.

---

## Design

- **Headings are real cut paper.** Five magazine alphabets, 130 individually
  segmented scans, alternated letter by letter with a deterministic angle,
  height and scale so a heading looks hand-taped but identical on every load.
  Some letters are torn, some are taped.
- **The background is a halftone star field**, fixed rather than
  `background-attachment: fixed` — that property re-rasterises on every scroll
  frame and is where the shimmer on phones comes from.
- **A photographed neon sign**, cut off its black field by luminance, lit with
  layered drop-shadows and dropped to a lower duty cycle once every 1.5s.
- **Cut-outs and lyric scraps are anchored to the viewport gutters**, never to
  the content column, so they cannot land on a heading, a button or a receipt
  at any width. They are chosen per section. Below 1240px there is no margin to
  spare and they are not drawn.
- **Four bundled fonts** (65 KB), no external font request. This also keeps the
  pre-rendered frames and the live receipt in the same typeface.

Reduced motion is respected throughout: the unfold becomes instant, the dust
stops, the neon holds steady.

---

## Performance

First paint pulls the stylesheet, the scripts, four fonts and the backdrop —
about 700 KB, and none of the 70 crumple frames. A record's frames are fetched
when it scrolls into view, and the rest are decoded on the way to the button,
so the unfold never waits on the network.

- `content-visibility` skips layout for sections far from the viewport
- the dust canvas stops entirely in a hidden tab, and thins out on phones
- artwork and frames are lazy, `decoding="async"`, and served `immutable`
  by `server.js`

Measured cold on a local server: **load event at ~225 ms**, 22 image requests,
zero frames.

---

## Layout

```
index.html                markup only
css/style.css             all styling
js/data.js                members, discography, credits, lore, lyric excerpts
js/receipt.js             the receipt, and frame playback
js/player.js              preview engine + the waveform transport
js/genius.js              baked Genius data, and the optional live proxy
js/trackmodal.js          the track window: words, annotations, credits, links
js/main.js                rendering, search, member window
js/crumple-manifest.js    generated — frame geometry
js/am-api-data.js         generated — previews, credits, artwork, annotations
assets/crumple/           generated — 70 rendered frames
assets/bg/                backdrop, modal collage, neon sign
assets/fonts/             four bundled faces
../assets/letters/        five cut alphabets, shared with the sister site
```

Press `/` anywhere to jump to the search.

---

## Credits

Band history, discography and lore compiled from public sources. Lyric excerpts
are short signature lines with approximate fan timings, for identification and
study. Annotations, songwriter credits and the full words: **Genius**. Preview
audio and artwork: **iTunes**. Release data: **MusicBrainz**.
