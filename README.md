# Hollywood Undead — Unofficial Fan Archive

Six masks, six records, twenty years of lore, a preview player that lives
inside each song, and a bone frame that assembles itself out of the dark.

Unofficial and unaffiliated: not connected to Hollywood Undead, to BMG, or
to anyone who works with them. All music, lyrics and imagery remain the
property of their respective owners.

---

## Running it

The site is static. Drop the folder on any host and it works. Run it with
the included server and it works *and* the Genius credits come alive:

```bash
node server.mjs 8080                       # no token: everything but the credits
GENIUS_ACCESS_TOKEN=xxxx node server.mjs   # with the credits
```

No build step and no dependencies. Node 18+ for the server, for `fetch`.

`?debug` on the end of the URL opens a panel showing what mounted, which
route the store answered on, whether the Genius bridge is up, and anything
that threw.

```bash
node tools/check.mjs         # before deploying: broken refs, stale files, stray tokens
node tools/genius.test.mjs   # the bridge's logic, against a stubbed Genius — no token needed
```

---

## The Genius token — the whole of the setup

**One environment variable. Nothing else.**

1. Go to <https://genius.com/api-clients>, create a client, and copy the
   **Client Access Token** — not the client id, not the secret.
2. Paste it into your host's environment as `GENIUS_ACCESS_TOKEN`.
3. Redeploy.

| Host | Where the variable goes | Routes come from |
|---|---|---|
| **Vercel** | Project → Settings → Environment Variables | `api/` (automatic) |
| **Netlify** | Site configuration → Environment variables | `netlify.toml` → `netlify/functions/` |
| **Cloudflare Pages** | Project → Settings → Variables and secrets | `functions/api/` (automatic) |
| **Anything else** | `GENIUS_ACCESS_TOKEN=… node server.mjs` | `server.mjs` |

All four expose the same two paths — `/api/genius` and `/api/itunes` — so
nothing in `js/` ever knows which host it landed on. `.env.example` is the
same instructions in a file.

### What arrives once it is set

One call per opened track (`op=track`) returns the whole panel's contents
at once:

- **Lyrics**, with timings when they exist
- **Credits** — writers, producers, featured artists
- **Metadata** — album, release date, annotation count
- **The song's own description** from Genius
- **Media links** Genius knows about
- **Attribution** naming every source, which the panel prints

### What happens without it

The site does not degrade into an error. With no token — or deployed as a
plain static folder with no functions at all — the words still arrive
(LRCLIB, direct from the browser), previews still play, and the credits
fall back to the liner notes written into `js/data.js` with a link out to
Genius. Every track panel says, in its own footer, which of those actually
answered. A fan archive that quietly showed less because a variable was
missing would be worse than one that tells you.

### Two things worth knowing

**The token never reaches the browser.** `api/_genius.mjs` is the only
file that reads it. Genius sends no CORS headers and requires a bearer
token on every call, so a browser could not call it directly even if you
wanted it to.

**Genius does not serve lyric text through its API**, and scraping the
page for it is both against their terms and one redesign away from
breaking. So the words come from [LRCLIB](https://lrclib.net) — open,
keyless, what a number of open-source players use — and Genius supplies
everything around them. Both are credited by name on every panel.

---

## What is where

```
index.html
css/style.css
js/data.js          band, roster, records, lore, liner notes
js/quizzes.js       the four decks
js/quiz.js          quiz engine — shuffling, scoring, badges
js/player.js        iTunes catalogue lookup + the in-panel transport
js/words.js         the browser half of the bridge, and the LRCLIB fallback
js/collage.js       the cut-out artwork, scattered down the margins
js/atmos.js         ash and embers, reveals, the error trap
js/boneframe.js     the Three.js fragmentation modal
js/main.js          rendering, panels, boot

api/_genius.mjs     the bridge: Genius + LRCLIB, and the only file with the token
api/_itunes.mjs     the store, relayed, for when the direct call is blocked
api/*.js            Vercel entry points
netlify/functions/  Netlify entry points
functions/api/      Cloudflare Pages entry points
server.mjs          the same two routes, plus the static folder, on one port

assets/cut/         72 pieces cut off the supplied sticker and merch sheets
assets/modal-bg.webp    the horned skull, behind both modals
assets/boneframe.webp   white bone, for the lit WebGL frame
assets/boneframe-warm.webp  the red-tinted copy, for the CSS border
tools/cut_assets.py     cuts the supplied sheets into assets/cut/
tools/tint_frame.py     makes the warm copy of the bone frame
tools/check.mjs         pre-deploy: broken refs, stale files, stray tokens
tools/genius.test.mjs   the bridge's logic, stubbed — no network, no token
vendor/             Three.js and GSAP, behind a blocked CDN
```

---

## The parts that are not obvious

### One click opens the song, and the player is in it

The transport used to be a bar pinned to the bottom of the window, and a
track click played while shift-click opened the words — which meant the
words were behind a shortcut nobody was told about. Now a track opens its
own window: the player, the lyrics and the credits in one place, prev/next
walking the real record, and closing it stops the sound.

### Why previews did not play — four separate faults

Worth writing down, because none of them looked like the others:

1. **The volume defaulted to zero.** `Number(localStorage.getItem(...))`
   returns `0` for a missing key, not `NaN`, and the guard accepted it. On
   a first visit the player ran, the scrubber moved, and nothing came out.
2. **The gesture was spent before `play()`.** Pressing a track ran an
   `await` first, so by the time playback was requested the click no
   longer counted. The audio element is now unlocked on the first gesture
   anywhere on the page.
3. **One failure was cached for the session.** A miss was stored as a
   definite "no preview exists", so a single blocked request silenced a
   record until the tab closed. Misses now expire in five minutes.
4. **There was nowhere to go when Apple was unreachable.** Blocked
   requests, privacy extensions and `file://` all dead-ended. The call is
   tried directly first and relayed through `/api/itunes` if that fails.

### The marquee showed one word out of two

It was a square photograph displayed at `cover` in a 620x96 box. `cover`
scales to fill the *width*, so a 1:1 picture became 620 wide and 620 tall
and the box showed a 96px band across the middle of it — which happened
to catch the right-hand end of the sign and nothing else. The asset is
cropped to the sign itself now, the box carries that aspect ratio, and
`contain` fits the whole board inside it at every width. Its red is baked
in through a luminance ramp rather than applied as a `hue-rotate`, which
on a white lightbox gives a pink wash rather than a red one.

### The track panel has no thumbnail

A small copy of the album sleeve used to sit in the panel's header,
beside the title. It duplicated the record card's own artwork at a size
too small to read anything in, and on a narrow phone it was what forced
the "record · year · label" line to wrap and crowd the close button. The
song's own name is the header now; the album it belongs to is already
said in words directly above it.

### A grid track that would not shrink

The real cause of "text runs past the edge of the card" on a phone:
`.tracks`, `.albums`, `.q-opts` and a couple of others are `display:
grid` used for nothing but the row `gap` — one implicit column, never
given an explicit width. An un-sized grid track defaults to `auto`, and
an `auto` track's *automatic minimum* is its content's min-content size,
not zero — so on a narrow phone, a track row's own unshrinkable pieces
won out over the column, the row rendered at whatever width it wanted,
the card around it grew to match, and the excess was silently clipped by
`overflow-x: hidden` on `<body>` rather than reflowed. Every such
container now has `grid-template-columns: minmax(0, 1fr)`, which is the
one-line, standard fix: it gives the column an explicit floor of zero.

Below about 380px the record card stops being able to hide the problem
by shrinking further — a 112px-minimum sleeve leaves under 130px for a
title whose font has its own size floor. Past that width the card
stacks: sleeve above, text below, at the card's full width instead of a
fraction of it. `.album-title` also carries `overflow-wrap: anywhere`
now, as a backstop against any single word, anywhere, that turns out to
be wider than its column.

### The bone frame had no scrim of its own

The hollow the WebGL frame leaves is proportioned to the frame's own
aspect ratio, not to the text column sitting in it — on a tall narrow
phone the ring is proportionally wider and its corner skull clusters
reach further toward the centre, so body copy was landing directly on
dense linework with nothing to separate it. `.bone-content` now carries
its own soft radial scrim behind the text, sized a little past the
column so it reads as the panel's backdrop rather than a hard-edged box.

### The header scrim was too thin where the buttons are

`.panel-bg`'s darkening gradient held at .16-.48 opacity through the
top third of the panel — exactly where the dagger in the artwork runs —
and it read as a blade cutting through the kicker line, the title and
the transport controls, competing with text and buttons for the eye on
both mobile and desktop. The first third is close to opaque now; the
artwork further down is still allowed through, because by then it sits
behind body copy, not behind anything clickable.

### The palette comes out of the artwork

`assets/modal-bg.webp` was sampled for its three real colours: the board
is not black but a dark green-black, the skull is a coral red far warmer
than the flat red the page used to run on, and the dagger is a cold grey
the design had no equivalent of. Those became `--ink`, `--blood` and
`--steel`, and the last one earns its place in the interface: **steel is
a control, blood is a state.** Every button in the player is steel until
it is doing something; the ring, the rail fill and its head are the only
blood in the deck, and they are exactly the three things that mean "this
is playing, and this is how far in".

The cut-out artwork is remapped into the same palette by
`tools/grade_assets.py` — a four-stop luminance ramp, steel for skulls
and merch, blood for wordmarks and glyphs. Silhouettes are untouched:
luminance in, luminance out, only the hue is replaced. Otherwise
seventy-odd stickers in their own colours read as clip art sitting on a
design rather than as part of one.

### The collage is measured, not guessed

`js/collage.js` reads the width of the reading column and only places
pieces in the margin beside it, so it thins out by itself and stands down
entirely below about 62px of free space — which is why a phone gets none.
Placement is seeded, not random: the same collage every load, because a
background that rearranges itself reads as the page being unsure of
itself. Ninety-odd pieces parallax in four planes, so scrolling moves four
elements, not ninety-six. The fourth plane is allowed behind the reading
column at an opacity where it reads as texture rather than as a picture
behind a paragraph — and the record cards above it are translucent, so
the artwork shows through them.

Nothing is placed on top of anything else: a candidate position that
would overlap a piece already down is rejected and another is drawn, up
to a dozen tries, after which that piece is dropped rather than stacked.

### Five measured performance fixes

Each of these was found with a profiler, not guessed at, and each is
written up where it lives.

**The collage was costing two thirds of the frame rate.** Its planes
carried `filter: blur()` for depth. A CSS blur on a layer the size of the
document is re-rasterised on every composite, and the parallax composites
on every scroll frame: 1440x900 measured **13fps with the collage up, 44
with it hidden**. The softness is now baked — `assets/cut/soft/` holds
each piece at half resolution with the blur already in it, and the
browser upsamples it back, which softens it again for free. Same depth
cue, no per-frame work, and the files are a fifth of the size. **47fps.**

**Ninety-six live drop-shadows.** Each piece had
`filter: drop-shadow(...)`, which is a gaussian blur per element per
composite. The shadow is now drawn into the asset by
`tools/grade_assets.py`.

**The marquee was the most expensive element on the page.** Fixing its
crop made it three times larger, and it carried `mix-blend-mode: screen`,
a `drop-shadow()` filter, and twelve keyframes that animated that filter
— every one of them a full re-rasterisation through a gaussian. **44fps
down to 31.** The asset now carries its own alpha, so there is nothing to
screen out, and its bloom is drawn into the file; the flicker animates
`opacity` alone, which is the one property a compositor can change
without touching a pixel. **60fps.**

**A layer-promotion own goal.** `backface-visibility: hidden` on the
collage pieces — added while trying to make them cheaper — promotes every
element to its own compositor layer. Ninety-nine layers for artwork that
only ever moves as a group: **46fps down to 33.** The layer is promoted;
its children must not be.

**Canvas shadow blur, forty times a frame.** The ash layer set
`ctx.shadowBlur` on every ember to make it glow — the most expensive call
in the 2D API, re-rasterising each shape through a gaussian. Each species
is now rasterised **once** into an offscreen sprite and every mote is a
single `drawImage`. The count went from 110 to 300 and the frame got
cheaper. The loop also measures itself and sheds motes if frames run
long, so a weak machine gets a thinner snowfall rather than a stutter.

### The bone frame is lit, bumped, extruded — and instanced

The first version drew each tile with `MeshBasicMaterial` — unlit by
definition — so a shard spinning through space never changed shade, and
the eye reads unchanging shade as flat. Three changes fixed it:

- **Instanced.** It used to be 27 cells built as 81 meshes, animated by
  ~320 concurrent tweens. It is now **one** `InstancedBufferGeometry`:
  every shard is an instance carrying its own UV window, home, start,
  tumble axis and delay, and the whole animation is a single uniform that
  GSAP tweens from 0 to 1. That bought both ends at once — the grid went
  from 7x6 to 18x16, so the frame breaks into **176 shards instead of
  27**, and it costs **4 draw calls instead of 81**.
- **Lit.** A custom shader with a four-lamp rig: warm key, blood fill
  from below, cold steel rim.
- **Bumped.** The artwork is fed back in as its own `bumpMap`. It is line
  art, so a flat plane gives every stroke on a tile the same shade; as a
  height field, each rib rounds off and takes its own highlight. This is
  the change that makes it look carved rather than printed.
- **Extruded.** Each shard is three coplanar slabs — the lit face and two
  darker copies behind it — so the frame has thickness that parallaxes as
  it turns. A real box would need side faces, and a side face on an
  alpha-keyed plane is a solid rectangle where a rib should be. Because
  the slabs are three passes over the same instance buffers, they cost
  three draw calls in total rather than three per shard.
- **Sprung, not eased.** Shards do not glide to a halt: the position ease
  is a damped oscillation, so a piece overshoots its slot and settles.
  Spin decays on a slower curve than travel, so pieces are still turning
  as they seat. Each is stretched along its own direction of travel in
  proportion to how fast it is moving — the cheap version of motion blur,
  and most of why the movement reads as weight.

The colour was tuned by measurement rather than by eye: at exposure 1 the
lit faces read about `rgb(238, 211, 212)` — red and blue equal, which is
pink, not bone. Under-exposing and warming the ambient gives a clean
red-over-green-over-blue ramp instead.

### The modal is built to the artwork, not the other way round

`assets/modal-bg.webp` is a tall portrait painting. Laid into a landscape
panel with `cover` it was cropped to a band across the top and the skull,
which is the whole picture, never appeared. The panel is now a portrait
column at the artwork's own proportion, and the image is drawn at
`100% auto`: full width, never cropped sideways, running from the top
down as far as it goes.

### The frames, and each one is built to its artwork

**The track panel** has no frame image. It used to be bordered by an
ornate skull-and-corners artwork, which forced the panel to be locked to
that picture's portrait ratio and padded in percentages to clear the
ornament's band — a frame bought at the cost of the layout everywhere
else. The frame is gone and the panel is an ordinary responsive modal:
`min(680px, 100%)` wide, as tall as its content, capped at the viewport
height, with a thin bone line around the edge. Under 720px it takes the
full width and the real visual viewport height; under 480px it goes edge
to edge.

None of the modals draw scrollbars. Every scrolling region inside one
still scrolls by wheel, drag, keyboard and trackpad — the track is just
not painted, because a pale native gutter was the one piece of default
browser chrome left on the page.

The artwork arrives inverted from what the page wants — a pale card with
the ornament cut into it in dark line. The band is found, and inside it
the luminance is flipped, so the flat paper drops away and the drawn line
becomes the lit part.

**The quiz panels** carry a reaper holding a card up, bled off the right
edge so he looks across the question rather than sitting behind it. He is
masked out towards the copy, so nothing is ever read across a rib.

**The member profile** still opens inside the WebGL bone frame.

### Two frames, on purpose

The member profile is short, so it opens inside the hollow of the real
WebGL frame. A track panel is a player plus a full lyric sheet and has to
scroll, and scrolling content inside a fixed WebGL hollow does not work —
so the same artwork frames it as a CSS `border-image`, tinted warm by
`tools/tint_frame.py`. Same bones, different mounting.

### Following the words is asked for, not guessed

LRCLIB's timings are positions in the *full* song; what plays is 30
seconds from somewhere inside it, and the store does not say where. Any
automatic highlight would be a guess presented as fact. So press the line
you can hear and everything after it follows; press another to correct it.

---

## Sources

| | Source | Needs a key |
|---|---|---|
| Listings, previews | iTunes Search API | no |
| The words | [LRCLIB](https://lrclib.net) | no |
| Credits, metadata, annotations | [Genius](https://genius.com) | **yes** — `GENIUS_ACCESS_TOKEN` |
| Three.js, GSAP | cdnjs, with a local copy behind each | no |

Album covers come from the store at 600px. They resolve two ways: a
targeted per-record search first, and — for the titles the store files
differently, which is most of them — a single request for the artist's
whole album list, cached for the session, matched by title. A cover that
never appears looks exactly like the store being down, which is why it is
worth two routes.
