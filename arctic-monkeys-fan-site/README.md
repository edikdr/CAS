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

### The short version

Which of these you are doing decides everything else:

| How you deploy | What to use | Genius annotations |
|---|---|---|
| Drag a zip / folder onto the host | `dist/am-site.zip` | **bake them in first** (below) |
| Connect a Git repository | this whole folder | live, with a token |
| `node server.js` | this whole folder | live, with a token |

**A dragged deploy has no build step, so it cannot carry a serverless
function — on any host, ever.** That is not a limitation of this project; it is
what "manual deploy" means. So on that route `/api/genius/*` will always come
back as the site's own HTML, and the answer is not to configure anything but to
put the data inside the site before you send it:

```bash
GENIUS_ACCESS_TOKEN=your_token python3 tools/fetch_am_data.py --genius
python3 tools/fetch_lyrics.py
python3 tools/make_zip.py          # rebuilds dist/am-site.zip with it all inside
```

The first writes the credits, the artwork, the statistics and the annotations
into `js/am-api-data.js`; the second writes every song's words into
`js/lyrics-data.js`; the page reads both before it reaches for anything else.
After that the dropped archive is the whole site — annotations included — with
no token on the server, no environment variable and no function. `make_zip.py`
tells you whether the data is in there.

If you would rather have Genius answered live, the deploy has to be one that
builds: connect the repository, or use the Netlify CLI, which does deploy
functions —

```bash
npx netlify-cli deploy --prod --dir=arctic-monkeys --functions=netlify/functions
```

---

**Any static host.** Upload the `arctic-monkeys/` directory, or drop
`dist/am-site.zip`. Done — and almost everything works, because most of what
the page asks for needs no key and no server:

| | needs | works on a bare static host |
|---|---|---|
| Previews | iTunes Search API | yes |
| Album sleeves | Genius, then iTunes | yes |
| Band photographs | Wikipedia, then Genius | yes |
| The full words | LRCLIB, then lyrics.ovh | yes |
| Annotations, credits, statistics | **Genius, with a token** | **no** |

Only the last row needs the function and the token. Genius refuses
cross-origin browser requests, so there is no way to ask it from a page — a
server-side route is the only shape that exists. Everything above it is asked
for directly and arrives either way.

**Netlify, from the repository.** In order, and the order matters. (None of
this applies to a dragged deploy — see the short version above.)

0. **This project is a subfolder of the repository it lives in.** Set the
   site's *base directory* to `arctic-monkeys-fan-site` under Site settings →
   Build & deploy. Netlify reads `netlify.toml` from the base directory, and
   with the base left at the repository root it never sees this one — so no
   function is built and step 1 has already gone wrong.
1. **Deploy the whole unpacked folder, not `arctic-monkeys/` on its own.**
   `netlify.toml` and `netlify/functions/` live *beside* it. Deploy the inner
   folder and there is no function, so `/api/genius/*` falls through to the
   static site and every call gets the home page's HTML back instead of JSON.
   This is the single most common way this goes wrong.
2. Add the environment variable under **Site settings → Environment variables**:

   ```
   GENIUS_ACCESS_TOKEN = your read-only client access token
   ```

3. **Redeploy.** A variable added after a build does not reach the function that
   is already running. Nothing will work until you do this.

Then check it:

```bash
curl -s https://<your-site>/api/genius/health
# {"ok":true,"token":true}
```

`{"ok":true,"token":false}` means the folder is right and the variable is not
set (or you have not redeployed since setting it). HTML back means step 1.

You can also just look. The footer of the live site prints the build and which
of the three states the proxy is in, in the words of what to do about it:

* *genius: connected* — the route is there and the token is set
* *genius: no token* — the route is there, step 2 or step 3 is not done
* *genius: no /api/genius* — step 1: the inner folder was deployed on its own

`?debug` on the end of the URL opens a panel with the rest, including where the
words on screen came from.

**Vercel.** Set the project's root directory to this folder and add
`GENIUS_ACCESS_TOKEN` under Settings → Environment Variables, then redeploy.
Nothing else: `api/lyrics.js` and `api/genius/[...path].js` are the same two
routes in the shape Vercel reads them from the filename, and `vercel.json`
points the static half at `arctic-monkeys/`.

No `.env` file is ever deployed and no build step runs. `netlify/functions/genius.mjs`
answers `/api/genius/*` with the token attached, so the credential stays on the
server — which it has to, because Genius refuses cross-origin browser requests.
The same function answers `/api/lyrics`, which needs no key at all.

**Any Node host.** `node server.js` serves the site and both routes, reading
`GENIUS_ACCESS_TOKEN` and `PORT` from the environment. No dependencies.

The four paths are interchangeable: the page calls `/api/genius/…` and
`/api/lyrics` and does not know which one answered, or whether anything did. It
also tries `/.netlify/functions/genius/…` — the same function under the classic
mapping — for the builds where the route declared in the function is not
honoured, and uses whichever of the two answers for the rest of the session.

---

## Where the words come from

Genius has no lyrics endpoint. Its API serves credits, release dates,
statistics and community annotations, and that is the whole of it — the words
are on the page, behind terms that say not to scrape them.

So the words come from **[LRCLIB](https://lrclib.net)**, which is open, needs no
key, and is what a number of open-source players use. It usually answers with a
time-stamped LRC, which is better than a plain text: every line carries its
real position in the song, so pressing one seeks the preview there, instead of
the handful of cue points written by hand against a thirty-second preview.

Four places are asked, in the order that gets the words on screen soonest, and
the first one to answer wins:

1. **`js/lyrics-data.js`**, if `tools/fetch_lyrics.py` has been run. No network
   at all, so the whole song is there on the frame the window opens.
2. **the site's own `/api/lyrics`**, which `server.js` and both serverless
   functions answer.
3. **LRCLIB, straight from the browser.**
4. **[lyrics.ovh](https://api.lyrics.ovh)**, which has no timings and no key
   either, for the B-sides and live cuts LRCLIB has not got.

(3) and (4) are why every song has its words on a plain static host with no
function behind it, which is the deploy most people actually do. (2) is still
first of the three because one entry point is one thing to cache and one thing
to debug. If all four come back with nothing, the baked cue points stay on
screen and the window is still usable.

Nothing is stored in this repository unless you run the fetcher, and nothing is
written to disk at runtime. The words are fetched when a window opens and live
in the tab until it closes.

To bake them in instead:

```bash
python3 tools/fetch_lyrics.py             # all 80 tracks → js/lyrics-data.js
python3 tools/fetch_lyrics.py --only 505  # one of them
```

Already-fetched tracks are skipped, so a second run only picks up what was
missed. The words belong to their publishers: baking them into a public deploy
is your decision and your responsibility, which is why it is a step you take
rather than one already taken for you.

The words belong to their publishers. Reproducing them on a public site is the
site owner's decision and the site owner's responsibility — worth knowing before
you deploy.

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
  render.mjs     drives it and captures the stages, ten per album
  to_webp.py     crops, compresses, and writes js/crumple-manifest.js
```

Ten poses, one every ten per cent, played in step with a short cross-fade
between them. The renderer can produce far more, and a continuous blend between
the two nearest was tried — it is smoother, and it looks wrong: paper does not
flow, it gives way in jerks. Stepping the stages is the closer read of the
thing, and it costs 3.2 MB instead of 6.3 MB.

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
artist photographs, the statistics and the annotations.

Without one, only the annotations and the statistics are actually lost. The
sleeves fall back to the iTunes Search API and the portraits to Wikipedia,
neither of which needs a key — see `js/media.js` — and the credits fall back to
what `tools/fetch_am_data.py` baked in, and failing that to the ones written by
hand in `data.js`. Nothing waits on the network: a window opens usable and
fills in behind you.

Portraits ask Wikipedia before Genius, which is the opposite way round from the
sleeves, and deliberately: Genius' artist image for a band member is usually a
photograph of the whole band, which under a card headed with one name is a
wrong caption. A search result whose title does not carry that person's surname
is thrown away for the same reason — two of the five have no article of their
own, and they keep their monogram rather than being given somebody else's face.


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

The bands are spaced logarithmically across the spectrum, with a lift for the
roughly 1/f fall-off and a floor under each one. An even split hands the
right-hand half of the panel the top two octaves, where music has almost no
energy, so that end of the wave sat flat however hard a track was playing; and
the burst envelope used to close to 5% of full height at the edges, which the
same amount of signal could not have moved visibly. The line is drawn in a
moving greyscale ramp — a ripple of brightness travelling along it, which turns
over while a track plays and holds still when it does not.

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
- **Cut-outs and lyric scraps are placed two different ways**, and the width
  decides which. Both sets are mounted; CSS draws one.

  Above 1240px there are margins outside the content column, and the full set of
  79 objects hangs in them — anchored to the *viewport* edge rather than to the
  section, so they cannot reach a heading, a button or a receipt at any width.
  `spaceOut()` then measures what actually landed, walks each gutter top to
  bottom pushing anything that crowds its neighbour further down, and gives
  whatever ran off the bottom a second look at the space still open further up.

  Below 1240px those margins are gone. Rather than drawing nothing — which is
  what used to happen, and left the phone with a bare star field — a smaller set
  of two dozen is laid into the vertical gaps the layout already leaves between
  blocks of content: above a heading, under the last card, in the pause between
  two chapters of the lore. `layoutNarrow()` finds those gaps by measuring what
  actually carries ink (a paragraph, an image, a button — never the container
  around them, whose box spans the whole section), takes the roomiest, and sizes
  each object to the gap it lands in. One object per gap, never two.

  A section that is mostly cards leaves almost no room; the lore is nothing but
  text and leaves a dozen gaps. So the gaps are pooled across the page: an
  object is offered its own section first, and whatever a crowded section cannot
  take moves to the nearest gap free elsewhere rather than being dropped. That
  is what keeps the count at 21–23 on a phone instead of the dozen the sections
  could manage on their own.

  Both passes run again on `load`, on `document.fonts.ready`, and on resize —
  every position is a percentage of a height that is still moving while the
  fonts and images settle, and a single pass measured a page that had not
  finished growing.

- **`?debug`** puts a panel in the corner: the build, which set is drawn, how
  many objects were mounted and how many landed, the star count, the state of
  the Genius proxy and where the lyrics came from, and anything that threw.
  Each mounting step runs inside its own `try/catch`, so one failure can no
  longer take the whole background down with it.
- **Four bundled fonts** (65 KB), no external font request. This also keeps the
  pre-rendered frames and the live receipt in the same typeface.

Reduced motion is respected throughout: the unfold becomes instant, the dust
stops, the neon holds steady.

---

## Performance

First paint pulls the stylesheet, the scripts, four fonts and the backdrop, and
none of the crumple frames.

Ten frames per album, played one to the next with a short cross-fade — about
3.2 MB for all seven records, and only the album you open is ever fetched.

- the particle layers stop entirely in a hidden tab, thin out on phones, and
  share **one** `requestAnimationFrame` between the page layer and any open
  window rather than running a loop each
- every cut-out declares its aspect ratio, so nothing reflows as images land
- cut-outs load through an `IntersectionObserver` at 600px, not just
  `loading="lazy"` — on a phone that is 17 pictures fetched over a full scroll
  instead of 72, since the gutter set is never drawn there and so never asked for
- `preconnect` to `images.genius.com` and `dns-prefetch` to `lrclib.net`, so the
  handshake for the two live lookups starts before a window is opened
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
js/media.js               sleeves and portraits from the keyless sources
js/lyrics.js              the words: four sources, and the LRC parser
js/trackmodal.js          the track window: words, annotations, credits, links
js/main.js                rendering, search, member window
js/quizzes.js             the four decks
js/quiz.js                quiz engine and window
js/collage.js             cut letters, background objects, stars, particles
js/crumple-manifest.js    generated — frame geometry
js/am-api-data.js         generated — previews, credits, artwork, annotations
js/lyrics-data.js         generated — the words, if you bake them in
assets/crumple/           generated — 10 rendered frames per album
assets/bg/                backdrop, modal collage, neon sign, 505 heart
assets/fonts/             four bundled faces
assets/letters/           five cut alphabets, 130 scans
assets/cut/               56 objects cut from the fan collages
```

Press `/` anywhere to jump to the search.

---

## Credits

Band history, discography and lore compiled from public sources. Lyric excerpts
are short signature lines with approximate fan timings, for identification and
study. Annotations, songwriter credits and the full words: **Genius**. Preview
audio and artwork: **iTunes**. Release data: **MusicBrainz**.
