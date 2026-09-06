# Arctic Monkeys — Receipt Archive

An unofficial fan archive. Seven studio albums, eighty tracks, each record
printed as a till receipt that arrives screwed up into a ball and unfolds when
you press play.

Not affiliated with Arctic Monkeys, Domino Recording Company, or anyone who
works with them.

---

## Running it

The site is static and self-contained — this directory is the whole thing.

```bash
python3 -m http.server 8000    # from inside arctic-monkeys/
```

### Deploying

**Any static host.** Upload this directory. Done. Everything works except the
live Genius lookups, which fall back to the data baked into `js/am-api-data.js`.

**Netlify.** Point it at the repository; `netlify.toml` already sets the publish
directory and the function. Then add one environment variable:

```
GENIUS_ACCESS_TOKEN = your read-only client access token
```

No `.env` file is deployed and no build step runs. `netlify/functions/genius.js`
answers `/api/genius/*` with the token attached, so the credential stays on the
server — which it has to, because Genius refuses cross-origin browser requests.

**Any Node host.** `node server.js` serves the site and the same proxy, reading
`GENIUS_ACCESS_TOKEN` and `PORT` from the environment. No dependencies.

The three paths are interchangeable: the page calls `/api/genius/…` and does not
know which one answered, or whether anything did.

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
  render.mjs     drives it and captures sixty stages per album
  to_webp.py     crops, compresses, and writes js/crumple-manifest.js
```

Sixty poses, not ten. The site cross-fades continuously between whichever two
are nearest, interpolating the column height and the frame offset at the same
time, so nothing is ever switched — the paper is only ever a blend of two
neighbouring poses. Ten frames read as a slideshow; sixty read as movement.

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

With a token in the platform's environment, the page resolves everything live
on first use and remembers it for the session: songwriter credits, cover art,
artist photographs, and the annotations. Without one it uses whatever
`tools/fetch_am_data.py` baked in, and failing that the credits written by hand
in `data.js`. Nothing waits on the network — a window opens usable and fills in.


Genius does not serve lyrics through its API, and it refuses cross-origin
requests from a browser. Both facts shape the design:

- **Full lyrics are never reproduced here, and cannot be.** Genius licenses
  lyrics from publishers and does not serve them through its API at all — the
  song endpoint returns credits, statistics and description, and no words. The
  only way to get them out of Genius is to scrape the page, which breaks their
  terms and redistributes someone else's copyrighted text. If you want a full
  lyric feed it needs a licensed provider (Musixmatch, LyricFind); the free
  Musixmatch tier returns a partial lyric only.
- **What the API does give is annotations** — the fragments the community has
  written notes on, and what they wrote. Those are matched against the lines in
  the track window, so clicking a line marked with a **?** opens the annotation
  for it; anything that matched no line is listed underneath.
- **And the numbers**: views, shares, contributors, annotation count, whether
  Genius has the song flagged hot, its recording location, and what it samples,
  interpolates or is covered by.
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

## Quizzes

Four decks, fifty-two questions: **Lore & Basics**, **Albums & Tracks**,
**The Words**, **Deep Fan**.

An answer locks once chosen and the correct one is always revealed, so a wrong
guess still tells you something. You can step back through what you answered,
and the result card lists every question with its answer. Best scores are kept
per deck in `localStorage` — which throws in a private window or with site data
blocked, so every touch of it is guarded and the quiz works the same without it.

Answer with the mouse or press **1–4**; arrows move between questions.

Every answer is a matter of public record. Where something is genuinely
contested — what "505" refers to, for instance — it is not asked as though it
had one.

The window is backed by the 505 heart, cut off its black field by luminance and
given the same glow and 1.5s stutter as the neon sign in the hero.

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

First paint pulls the stylesheet, the scripts, four fonts and the backdrop, and
none of the crumple frames.

Sixty frames per album is a couple of megabytes, so they arrive in two waves: a
coarse spread of about a dozen first, which is enough to animate from, and the
rest while it plays. `neighbours()` only ever blends between frames that have
actually arrived, so on a slow connection the paper still moves — just with
fewer in-betweens. Only the album you open is ever fetched.

- the particle layers stop entirely in a hidden tab, and thin out on phones
- every cut-out declares its aspect ratio, so nothing reflows as images land
- artwork and frames are lazy, `decoding="async"`, and served `immutable`
  by `server.js`

Measured cold on a local server: **load event at ~225 ms**, and zero crumple
frames until you scroll to the records.

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
js/quizzes.js             the four decks
js/quiz.js                quiz engine and window
js/crumple-manifest.js    generated — frame geometry
js/am-api-data.js         generated — previews, credits, artwork, annotations
assets/crumple/           generated — 60 rendered frames per album
assets/bg/                backdrop, modal collage, neon sign, 505 heart
assets/fonts/             four bundled faces
assets/letters/           five cut alphabets, 130 scans
assets/cut/               35 objects cut from the fan collages
```

Press `/` anywhere to jump to the search.

---

## Credits

Band history, discography and lore compiled from public sources. Lyric excerpts
are short signature lines with approximate fan timings, for identification and
study. Annotations, songwriter credits and the full words: **Genius**. Preview
audio and artwork: **iTunes**. Release data: **MusicBrainz**.
