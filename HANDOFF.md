# HANDOFF

Status: **Stage 1 done (M0-M6)**, plus the owner's requests after M5 (horizontal guitar, touchable strings, wall switch, switch sounds, regenerated 3D model). Next: Stage 2 (`docs/TZ_02_SONNET_content.md`). Rules: `docs/CONTRACT.md`. Plan: `docs/TZ_01_OPUS_foundation.md`. Branch: `sunniva-room`.

A fresh session needs only this file, `docs/CONTRACT.md` and the code. Start with:
1. `npm test && npm run validate && npm run check:budgets` (all green), then `npm run dev` and open http://127.0.0.1:8000/?debug.
2. Read "Stage 2: where your code goes" and "Public interfaces" below.
3. Never edit `core/` or `vendor/`; ask in `REQUESTS_FOR_CORE.md`.

## Run
```
npm run dev              # http://127.0.0.1:8000, source tree, production headers (CSP, noindex), Range support
npm run dev -- --dir dist --host 0.0.0.0   # serve a build, reachable from a phone on the LAN
npm run validate         # JSON schemas + cross-checks (docs/DATA_SCHEMA.md)
npm run check:budgets    # builds into .tmp/budgets and checks CONTRACT section 4
npm run build            # private preview -> dist/
npm run build:public     # PUBLIC_BUILD -> dist/ (also: PUBLIC_BUILD=1 npm run build)
npm test                 # node:test, no dependencies (52 tests)
node tools/browser-check.mjs [--only load,lights,modal,lyrics,gl,resilience]   # real-browser checks (42); needs playwright + ffmpeg
sh tools/subset_fonts.sh # OFL TTF -> subset woff2 (pip install fonttools brotli)
node tools/lyrics-from-words.mjs words.json <trackId>   # ElevenLabs word timings -> data/lyrics/<id>.json
node tools/make-lyric-fixture.mjs <trackId>             # "la la la" test lyrics on the beat grid
```
Node >= 22. npm devDependencies (tooling only, exact pins): `three` (source for `vendor/three`), `@gltf-transform/*`, `meshoptimizer`, `sharp` (GLB pipeline). The site itself has no runtime dependency and no bundler: the browser loads the ES modules as they are.
```
node tools/vendor-three.mjs                 # node_modules/three -> vendor/three (never edit the copies)
node tools/optimize_glb.mjs [raw.glb] [out.glb] [--ratio 1]   # Meshy export -> assets/models/guitar.glb (+ budget check)
node tools/glb.mjs <file.glb>               # triangles, materials, texture sizes
python3 tools/cutout_guitar.py              # guitar photos -> DOM layers + manifest (assets/guitar/dom/)
```
Debug URLs: `?debug` exposes `window.sunniva = { RightsGate, DataStore, LightRig, Motion, PreviewPlayer, BeatClock, GuitarStage, ModalManager, TrackModal, Sfx }`; `?track=<trackId>` opens a track window on load; `?local` (dev server only) plays `assets/previews-local/` instead of Apple's previews; `?gl=force` accepts software WebGL (headless testing).

## Architecture map
```
index.html          shell: 4 stylesheets, core/boot.js, the import map (three), one module script (core/app.js)
core/boot.js        classic sync script in <head>: saved theme / motion / lights -> <html data-*> before first paint
core/app.js         composition root (boot order below); <html data-state="boot|ready|error">
core/loop.js        the single rAF loop (Loop.add(task) -> remove)
core/motion.js      Motion.reduced (OS setting OR visitor's "motion off"), mirrored on <html data-motion="off">
core/light-rig.js   LightRig: wall light, wires, plastic stars (below the guitar); bloom, lit stars, room shade (above it)
core/sfx.js         Sfx: interface sounds through Web Audio (the wall switch clicks)
core/film-slot.js   FilmSlot: canvas overlay; Stage 2 registers the drawing
core/emitter.js     createEmitter() used by core services
core/preview-player.js  PreviewPlayer: the single <audio>
core/beat-clock.js  createBeatClock (pure, unit-tested); core/clock.js = the site's BeatClock instance
core/capability.js  preferredGuitarMode() (3D on capable desktops), orientation checks
core/guitar/        guitar-stage.js (GuitarStage), dom-guitar.js (photo layers, flip), strings.js (canvas strings),
                    string-physics.js (damped springs, shared, unit-tested), tilt.js (shared
                    drag/tap/orientation input), gl-guitar.js (WebGL, dynamic import only)
core/modal-manager.js  ModalManager on native <dialog>
core/track-modal.js the 'track' modal shell (TrackModal.setContent for Stage 2)
core/lyrics/        lyric-renderer.js (contract + registry), font-wipe-renderer.js, engine-adapter.js, word-times.js
core/rights.js      RightsGate + createRightsGate (shared with tools/build.mjs)
core/data-store.js  DataStore + createDataStore
core/storage.js     storage wrapper (the only localStorage user)
core/fetch-json.js  fetchJson(url): JSON, null on 404, throws on network/5xx
features/main.js    Stage 2 entry (stub): core imports it once the room is ready
features/, content/ Stage 2 (see below)
styles/tokens.css   design tokens + three theme slots (prologue, link3, plain) for Stage 2
styles/base.css     reset, @font-face Luxurious Script, typography, .control pills, .icon-button, .visually-hidden
styles/scene.css    layer stack, string lights, wall switch, UI corner, DOM + GL guitar
styles/modal.css    dialogs (lavender paper), track window, player, lyric region
assets/             shipped binaries, one folder per rights class (docs/ASSET_REGISTER.md)
data/               JSON data (docs/DATA_SCHEMA.md); data/lyrics/ is gitignored
config/rights.json  rights classes: what may ship, per build
tools/              build, validate, check-budgets, dev-server, browser-check, asset pipelines (never shipped)
test/               node:test suites
vendor/             lyrics engine (owner's), Three.js 0.186.1 - never edited
extract/receipt/    reference copy of the receipt mechanism - Stage 2 copies from it, never edits it
vercel.json         build command, output dir, headers (CSP, noindex, cache)
```
Boot order (`core/app.js`): scene paints first (light rig, wall switch, film slot, controls; no data needed) -> `RightsGate.load()` and `DataStore.load()` in parallel -> the guitar mounts as soon as the rights gate is in -> `data-state="ready"` -> switch sounds preload -> `features/main.js` `start()` -> `?track=` opens its window.

## Stage 2: where your code goes
- **Entry:** `features/main.js` exports `async function start()`. Core imports it once the room is ready and awaits it before opening a `?track=` link. If it throws, core logs it and the room keeps working (`browser-check resilience`). Register everything there:
  ```js
  // features/main.js
  import { ModalManager } from '../core/modal-manager.js';
  import { TrackModal } from '../core/track-modal.js';
  import { FilmSlot } from '../core/film-slot.js';
  import { registerRenderer } from '../core/lyrics/lyric-renderer.js';
  import { createMagazineRenderer } from './lyrics/magazine-renderer.js';
  import { mountCollage } from './collage/collage.js';

  export async function start() {
    await loadCss(new URL('./features.css', import.meta.url));
    registerRenderer('magazine', createMagazineRenderer);
    FilmSlot.setRenderer(drawFilm);
    TrackModal.setContent(fillTrackWindow);
    ModalManager.register('about', aboutModal);
    ModalManager.register('quiz', quizModal);
    ModalManager.register('receipt', receiptModal);
    mountCollage(document.querySelector('#collage-slot'));
  }
  const loadCss = (href) => new Promise((done) => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
    link.onload = link.onerror = done;
    document.head.append(link);
  });
  ```
  Dynamic `import()` inside features is fine (and keeps the first load small); the entry itself is outside the initial-JS budget because core loads it with `import()`.
- **Folders:** `features/**` (`.js`, `.css`, `.json`) and `content/**.json` are yours. Binaries go in `assets/<class folder>/` with a register row (`docs/ASSET_REGISTER.md`) and a class in `config/rights.json`; the build fails on an asset no class covers.
- **May touch:** `features/`, `content/`, the three theme blocks in `styles/tokens.css` (token VALUES only), new files in `styles/` for themes, `data/` through the validator, `docs/ASSET_REGISTER.md`, `REQUESTS_FOR_CORE.md`, `HANDOFF.md` (append your own section).
- **May not touch:** `core/`, `vendor/`, `extract/` (copy instead), `tools/build.mjs` rails, `config/rights.json` flags (only after written permission, CONTRACT), token NAMES, `index.html` (ask in `REQUESTS_FOR_CORE.md`; your CSS loads from `start()`).
- **Receipts:** copy what you need from `extract/receipt/` into `features/receipts/`; open them with `ModalManager.register('receipt', ...)` / `open('receipt', { id })`; data: `DataStore.receipts()`. Its two `new Audio()` paper sounds break "one `<audio>`": play them through Web Audio like `core/sfx.js` (or drop them), after a register row (provenance unknown).
- **Quiz:** questions as JSON in `content/` (`fetchJson(new URL('../content/quiz.json', import.meta.url))`), best score in `storage` key `quizBest`.
- **Themes / style switcher:** fill `:root[data-theme="prologue" | "link3" | "plain"]` in `styles/tokens.css`; switching = `document.documentElement.dataset.theme = name; storage.set('theme', name)` (`core/boot.js` re-applies it before first paint next time). `link3` makes `magazine` the default lyric renderer.

## Public interfaces
- `RightsGate.allows(className)` -> boolean. Private preview: every class; public build: only `cleared: true`. Unknown class or before `load()`: false. `RightsGate.allowsLyrics(permission)`, `RightsGate.isPublic`. Check it before using any gated asset (`coverArt`, `photosOfHer`, `collageCutouts`, `magazineLetters`, `uiSounds`, ...).
- `DataStore` - after `await DataStore.load()`: `release(id)`, `track(id)`, `receipts()` are sync (ids may be strings). `beats(id)`, `lyrics(id)`, `facts()` return **Promises** (lazy, cached): `null` = no file / not allowed; a network failure rejects (and is not cached) - catch it. Results are frozen.
  ```js
  const beats = await DataStore.beats(trackId).catch(() => null);   // null -> idle sway, never invent data
  const lyr = await DataStore.lyrics(trackId).catch(() => null);     // null -> show no text at all
  ```
- `storage.get(key, fallback)`, `storage.set(key, value)`, `storage.remove(key)`; keys: `theme, lyricMode, lights, guitarMode, motion, quizBest, volume` (anything else throws; `guitarMode` is no longer used). Never throws on blocked storage (`browser-check resilience`).
- `LightRig.setEnabled(bool)`, `.enabled`, `.level` (light in the room: 1 on, 0.25 off), `.pulse(strength 0..1)` (no-op when off or reduced motion), `.lights` -> `[{x, y, garland, index}]` (px, viewport box), `.maskImage(radiusPx)` -> CSS `mask-image` with a soft disc per light, `.on('layout' | 'toggle', fn)`. Off = the garland is dark (no star, bloom or wall light glows) and the room keeps 25 % of its light. The wall switch (`#light-switch`, bound in `core/app.js`) is the visible control.
  ```js
  dust.style.maskImage = dust.style.webkitMaskImage = LightRig.maskImage(180);   // dust only near the lights
  LightRig.on('layout', () => { dust.style.maskImage = LightRig.maskImage(180); });
  LightRig.on('toggle', (on) => dust.classList.toggle('is-dark', !on));            // or CSS [data-lights="off"]
  ```
- `Sfx.play('switch-on' | 'switch-off', { gain })` from a user gesture; `Sfx.preload()` (core calls it after ready). Files in `assets/sfx/` (class `uiSounds`, not cleared: the public build strips them and `Sfx` stays silent). A new sound = the file + a literal `new URL(...)` entry in `FILES` (core change) + a register row.
- `FilmSlot.setRenderer((ctx, { width, height, dpr }) => { ... })` - draw the whole texture once; core redraws only after a resize (debounced), DPR <= 2; `#film-slot` sits above the glow and ignores pointer events.
  ```js
  FilmSlot.setRenderer((ctx, { width, height }) => { ctx.fillStyle = 'rgb(255 255 255 / 0.03)'; /* grain, scratches */ });
  ```
- `Motion.reduced`, `Motion.setUserOff(bool)`, `Motion.on('change', fn)`. CSS tests only `[data-motion="off"]` (set for the OS setting too).
- `Loop.add((now, dtMs) => keepGoing)` -> `remove()`. The only rAF loop; return false to sleep. Prefer CSS / Web Animations for fire-and-forget motion.
- `PreviewPlayer.play(trackId)` (from a click/tap), `pause()`, `seek(sec)`, `currentTime()`, `isPlaying()`, `trackId`, `audio`, `setVolume(0..1)` / `volume` (remembered), `setMuted(bool)` / `muted`, `canSetVolume` (false on iOS, where only mute works), events `play | pause | ended | timeupdate | seeked | track | error | volume` (`error` detail `{trackId, appleUrl}` -> show an "Open in Apple Music" link).
- `BeatClock.on('beat', i => ...)`, `BeatClock.on('onset', ({t, s}) => ...)`, `BeatClock.latencyOffsetMs`, `BeatClock.time()`. `core/app.js` already wires onsets (s >= 0.22) to `GuitarStage.pluck` (alternating down/up strums) and beats to `LightRig.pulse(0.45)`.
- `GuitarStage.pluck(strength, 'down' | 'up')`, `.flip()`, `.setMode('dom' | 'gl')` (tests/fallback, not persisted), `.mode`, `.on('mode', fn)`, `.enableTilt()` (iOS permission; the "Tilt" control calls it). Nothing mounts when `RightsGate.allows('guitarPhotos')` is false. Mode = `preferredGuitarMode()`: 'gl' on a fine pointer, >= 900 px, hardware WebGL2, >= 4 GB, no Save-Data; else 'dom'. No 3D/flat button (owner). GL falls back to DOM on load errors, context loss, or when most of its first 60 animated frames exceed 50 ms.
- `ModalManager.register(kind, { render(body, payload, api) -> cleanup, className? })`, `.open(kind, payload)`, `.close()`, `.current`, `.on('open' | 'close', fn)`. Kinds for Stage 2: `about`, `quiz`, `receipt`, `merch` (core registered `track`). `api = { close(), setTitle(text), dialog }`. Esc, the close button, a tap on the empty area and phone Back close the top modal; focus returns to the opener; audio stops on every close; modals stack.
  ```js
  ModalManager.register('about', {
    render(body, payload, api) { api.setTitle('About'); body.append(buildAbout()); return () => {/* cleanup */}; },
  });
  paper.addEventListener('click', () => ModalManager.open('about'));
  row.addEventListener('click', () => ModalManager.open('track', { id: row.dataset.trackId }));
  ```
- `TrackModal.setContent((slots, track, api) => cleanup)` - fill `slots.kicker` (default: release + year), `slots.content` (credits, links, prev/next, cover art behind `RightsGate.allows('coverArt')` and a user action) and restyle `slots.note` ("Lyrics are not shown in this preview."). `api.setTrack(id)` switches track in the same window, `api.play()`, `api.close()`. The shell owns title, player (play/pause, seek, time, mute + volume, "Open in Apple Music" on error) and the lyric region.
  ```js
  TrackModal.setContent((slots, track, api) => {
    slots.content.append(credits(track), links(track), prevNext(track, api.setTrack));
    return () => {};
  });
  ```
- Lyrics: `LyricRenderer` = `{ mount(el, { time, onResume }), setLine({ text, startSec, endSec, words? }), clear(), destroy() }` (`core/lyrics/lyric-renderer.js`). `registerRenderer('magazine', createMagazineRenderer)` once; it is then picked for `data-theme="link3"` or `storage.set('lyricMode', 'magazine')`. Use `wordTimes(line)` for per-word timing, drive animation from `time()` (pause/seek just work), wake on `onResume`. Lines come from the engine adapter; never touch the engine. Decorative letters `aria-hidden`, the line text in `aria-label` (CONTRACT section 5).

## Scene layers
Order (z tokens in `styles/tokens.css`): wall -> `#collage-slot` (Stage 2 papers + hotspots) -> `#garland` (wall light, wires, plastic stars) -> `#guitar-slot` -> `#glow` (room shade, bloom, lit stars) -> `#film-slot` (canvas) -> `#ui` (title, wall switch, controls). `#garland`, `#glow`, `#film-slot` ignore pointer events. The room shade (`.layer--glow::before`) covers everything below it, so papers in `#collage-slot` dim with the lights for free; anything above `#glow` (the film) styles `[data-lights="off"]` itself.

## Look and owner decisions after M4
- **Palette** (Fantasy Prologue artwork and CD booklet): plum-black room (`--c-wall`, `--c-room`), the cover's pink script (`--c-accent`, outline `--c-accent-deep`), lavender booklet paper for every modal (`--c-paper`, `--c-paper-ink`, `--c-paper-dim`), silver star stickers and a rhinestone row (CSS only), Luxurious Script for titles and lyrics (`--font-display`, `--font-lyric`), bold caps labels (`.caps`, `--font-caps`).
- **String lights:** 14 frosted stars on two garlands (positions from `string-lights.jpg`), `--star-size: clamp(29px, 7.2vmin, 34px)`. Below the guitar: the unlit plastic star (always drawn), wires, and the light on the wall (wide blurred spill along the wires, a pool under every star, a bright patch behind it; its own `<svg>` on its own layer, blurred once). Above the guitar: the lit star (gradient from the LED out to rose tips + a hot LED point) and a two-scale bloom (tight core in a wide halo, three groups breathing 4.4-5.9 s, CSS only). Beats pulse the bloom (one Web Animation).
- **Wall switch** (owner): an old push-button plate on the wall, bottom right, On (|) and Off (O); the pressed one sits in and shows the accent. Off = garland dark + room at 25 % of its light: opacity blends in sRGB, so 25 % of the light is 0.25^(1/2.2) = 0.53 on screen (`--room-dim`), applied by a solid-colour shade over everything the light falls on (wall, collage, guitar in both modes). On: 140 ms with a short flicker (skipped with reduced motion); off: 320 ms. Only opacities change (compositor), no JS per frame. A click sound plays when the state changes (`Sfx`, at the player's volume, silent when muted). 44 px buttons, `aria-pressed`, keyboard operable. It replaced the "Lights" pill (CONTRACT section 5 asks for a visible control).
- **Guitar:** lies horizontally, headstock right, low E on top (DOM: `.guitar__lay` turns the upright photo frame 90 deg; GL: the model group is rotated). Size `--guitar-len`. A tap turns it over its long axis; drag tilts; phones follow the device orientation. Desktops always get the 3D model (owner), phones the photo layers.
- **Strings** ring with the music (onsets -> `GuitarStage.pluck`) and can be touched: press near a string and drag - it follows a little, resists, swings back through rest; past twice the limit it slips off and rings; dragging across plucks them in turn. Both guitars share `core/guitar/string-physics.js` (damped springs at a few Hz, ring 1-1.6 s). DOM strings: a small canvas over the strings band, redrawn only while something moves (a bend at the finger cannot be a CSS transform; CONTRACT section 4 note). GL strings: round-shaded ribbons bent in the vertex shader. Reduced motion: still.
- **3D model:** Meshy, regenerated after the owner's review (the first one was lumpy with baked-in strings): front photo with the strings painted out + back photo, geometry 2k, texture 4k, remesh 30k.
- **Light on the 3D guitar** (owner): the string lights light it. Two point lights with real distance falloff sit where the stars are drawn: each star's screen position (`LightRig.lights`) is projected onto a plane just in front of the guitar's top, and the stars left/right of the guitar's centre are summed into one light each (+ a dim hemisphere for the room = 3 lights). The light grazes the top from above: the upper bout is brightest and it fades towards the lower edge (measured 238 -> 182 on the top, was a flat 216); tilting shows the warm upper side. It follows the wall switch (linear fade 140 / 320 ms like the CSS, the same flicker on switch-on); with the garland off the room light fills in so the guitar matches the room at 25 %. The strings' highlight goes out with the garland too. Positions are recomputed on resize and when the guitar moves for the track window; rendering stays on demand (0 frames once a switch has settled).

## Build and rights rails (what the tools enforce)
- Only whitelisted files ship (`RULES` in `tools/build.mjs`): `index.html`, `core/**.js`, `features/**.{js,css,json}`, `styles/**.css`, `content/**.json`, runtime data, `vendor/lyrics-engine/lyrics-engine.{js,mjs}`, Three.js build files, `assets/**` except `reference/`, `previews-local/`, `.ttf/.otf/.md`. A binary file inside `core/ features/ styles/ content/` fails the build.
- Every shipped file under `assets/` must belong to a class in `config/rights.json` (`paths`). Folder per class: `docs/ASSET_REGISTER.md`.
- Files under `assets/` are content-hashed (`name.<hash>.ext`, cached `immutable`); literal references in HTML/CSS/JS/JSON are rewritten, including references inside JSON/SVG assets (a layer manifest), which are hashed after the rewrite. **Reference assets by a literal path or from a JSON manifest**; building an `assets/` path with `${}` or `+` fails the build.
- Lyric files ship only if their `permission` allows it in that build; `data/facts/verification.json` ships filtered to `verified: true`; `artist.json`, `itunes-raw/`, beats `_index.json` never ship.
- Public build also fails if HTML/CSS/static imports still load a stripped file, or if a host of a non-cleared class (e.g. `mzstatic.com`) appears in any shipped text. Today the public build strips the guitar layers and model, the lyric files, the switch sounds and the Apple artwork URLs (`artworkTemplate`); the cover/photo/collage/letter classes have no files yet. Smoke-tested: it boots on phone and desktop with no failed request or console error, shows the lights and the switch, no guitar and no clicks.
- `check:budgets`: critical path <= 350 KB gzip, initial JS <= 90 KB gzip, no `http(s)://` in the initial HTML/CSS/JS graph or any shipped CSS (except `<a href>`), Three.js / lyrics engine / `.glb` never in the initial graph, DOM guitar layers <= 8 WebP, <= 60 KB each, <= 300 KB total, GLB <= 2 MB / 30k triangles / 5 materials / 2048 px textures, covers WebP <= 100 KB, fonts woff2 with `OFL.txt`.
- `index.html` has one inline script, the import map that resolves `three` for the vendored GLTFLoader; its sha256 is in the CSP and the build fails if the two drift apart.
- CSP (`vercel.json`, also served by the dev server): third parties only for Apple artwork (`img-src *.mzstatic.com`), Apple previews (`media-src audio-ssl.itunes.apple.com`), Bandcamp (`frame-src`); `connect-src 'self' blob:` (also blocks LRCLIB). A new host needs a core change (`REQUESTS_FOR_CORE.md`).
- Deploy: `data/lyrics/` is gitignored, so a Vercel build from git has no lyrics. To show lyrics privately, build locally (`npm run build`) and deploy `dist/`.

## Testing
Automated (run all before every commit):
- `npm test` - 52 unit tests: BeatClock (seek both ways, pause, loop, hidden tab, latency), string physics, RightsGate, build (whitelist, private/public stripping, hashing + rewrite, JSON manifests, failure rules), DataStore, lyrics adapter, storage, validate, check-budgets.
- `node tools/browser-check.mjs` - 42 checks in headless Chromium (Playwright; previews served as Opus because Chromium has no AAC): `load` (no third-party or failed request, no lyrics engine/Three.js/GLB, guitar layers load, Stage 2 entry, idle CPU), `lights` (levels, reload, keyboard, idle CPU, sounds), `modal` (CONTRACT section 5), `lyrics` (no text without permission, sync, wipe, reduced motion), `gl` (desktop 3D, render on demand, phones never load it), `resilience` (throwing Stage 2 entry, reduced motion, blocked storage, no WebGL, network lost, slow 3G).

Manual (real devices; headless cannot measure GPUs, AAC or touch feel) - phone (iOS Safari + Android Chrome) and a desktop browser:
1. Room loads in under ~2 s on mobile data; stars glow and breathe; no layout jump.
2. Wall switch: Off -> garland dark, room dimmer, click sound (if not muted / not in silent mode); On -> short flicker, click. Reload keeps the state.
3. Guitar: phone shows the photo guitar, desktop the 3D one. Tap flips, drag tilts (iPhone: "Tilt" button asks for motion permission), pressing a string bends it and it swings back.
4. Open a track (`?track=6808001979`), play: strings strum with the music, lights pulse on beats, seek and pause behave; lyrics (private build with `data/lyrics/`) wipe word by word; a track without lyrics shows the note and no text.
5. Modal: Esc / close button / Back close it, focus returns, audio stops.
6. OS "reduce motion" on: no breathing, sway, flicker or string motion; fades only.
7. Desktop: 3D guitar stays smooth (60 fps) while plucking; no fan spin-up when idle.

## Measured (M6, current)
- Lighthouse 13.5 mobile (simulated slow 4G + 4x CPU), private build served locally, 3 runs: Performance 92-94, Accessibility 100, Best Practices 100, SEO 63 (only because of `noindex`, on purpose). FCP 1.4 s, LCP 3.0-3.3 s (the guitar body photo, `fetchpriority=high`), TBT 0 ms, CLS 0.009, 294 KB transferred. Remaining hints: render-blocking CSS (4 files, 31 KB) and unminified CSS/JS (~19 KB): no bundler/minifier by design. A build-time `modulepreload` list was tried and made FCP worse (2.0 s) without moving LCP, so it was removed. bfcache is blocked only by the dev server's `no-store`; production HTML is `max-age=0, must-revalidate`.
- M6 found and fixed: (1) the built site's photo guitar layers were 404 - the build did not rewrite references inside `manifest.json` (fixed in `tools/build.mjs`, unit test + browser check added); (2) offline, opening a track threw unhandled "Failed to fetch" (beats/lyrics now fall back to idle sway / the no-lyrics note); (3) the hidden back photo counted as the page's LCP - it now stays `visibility: hidden` until a flip and loads on idle; (4) the guitar no longer waits for the catalogue data, only for the rights gate.
- Pixel 7 emulation, CPU throttled 4x, The Shallow End playing: idle 60 fps; music (strings + light pulses) 60 fps, p95 16.7 ms; music + switching the lights 4 times 59.6 fps, worst frame 33 ms (one dropped frame per switch; 50 ms before the wall light got its own layer).
- Slow 3G (400 ms RTT, 400 kbit/s) + 4x CPU, phone: room paints at 1.8 s, ready (guitar mounted) at 7.3 s.
- Idle main thread: 0.13 % (phone, lights on), 0.13-0.14 % (lights off), 0.09 % (desktop 3D).
- `check:budgets`: critical path 41.0 KB gzip (28 files), initial JS 30.8 KB gzip, GLB 1.46 MB / 29,589 triangles / 1 material / 2048 px. Desktop 3D extra: Three.js 457 KB gzip + GLB, loaded only on desktops.
- Not measured: real phones, real desktop GPUs, Safari (owner check, manual list above).

## Measured (history, M1-M5 and owner requests)
- M1 shell: 10 requests, 43.8 KB, LCP 164 ms local. M2 idle scene: 0.1 % main thread (breathing is compositor-only).
- M3: DOM guitar 5 WebP layers, 93.3 KB. Onset -> event delay median 9-11 ms, p90 15 ms, max 16 ms; seek: no burst.
- M4: modals meet CONTRACT section 5 (CLS 0.0004 over open/close). Lyrics fixture lines within 22 ms of their start (17 ms reduced motion). Luxurious Script subset woff2 27 KB. The Shallow End has a private-preview draft transcript (ElevenLabs Scribe, ~165 credits) in the gitignored `data/lyrics/6808001979.json`: unreviewed, never in git or archives.
- M5: first Meshy model (30 credits), replaced later. GL ready ~1.2 s locally; headless has only software WebGL (11 fps while plucking there - CPU rasterization, not a GPU number).
- Owner requests: string physics 5 unit tests; switch sounds ElevenLabs Sound Effects 200 credits (2 of 4 takes kept, 3 KB each); Meshy re-generation 35 credits (balance 1910 before).

## Known issues
- `extract/receipt/js/receipt.js` uses two extra `new Audio()` (CONTRACT: one `<audio>`) and loads them from `assets/sfx/` (files in `extract/receipt/sfx/`, 480 KB WAV, provenance unknown). Stage 2: Web Audio like `core/sfx.js` or drop them; register first (their own class if provenance differs from `uiSounds`).
- Lyrics engine keeps its own rAF loop while a track window with lyrics plays: accepted exception (owner, M0). LRCLIB is never used.
- 3D model: the dark binding line along the top's edge is painted by Meshy and wavers by a pixel or two; the soundhole is painted, not cut. A side photo would improve the sides; for the public build re-generate from own photos.
- Photo guitar on a large retina desktop (only as a fallback) is upscaled from a 1295 px source and looks slightly soft.
- Three.js 0.186 ships no minified build (457 KB gzip vendored). A minifying vendor step would roughly halve it if desktop load time matters.
- Beat data is unverified (`docs/BEATS_REVIEW.md`); 5 tracks may be at half/double tempo (only the light rhythm changes; strings follow onsets).
- `tools/cutout_guitar.py` holds landmarks measured on `front.jpg`; new photos need new measurements (and a new Meshy run).
- Rights not cleared yet (all private-preview only): guitar photos and everything derived (DOM layers, 3D model), cover art, photos of her, collage, magazine letters, lyrics, switch sounds (ElevenLabs plan terms). See `docs/ASSET_REGISTER.md`.

## Owner decisions (from the Stage 1 chat)
- Work on branch `sunniva-room`; the kit's `.gitignore` stays (exception added: `assets/sfx/*.mp3`); the owner works from zip archives of the git tree.
- Lyrics: no LRCLIB; timings come from ElevenLabs transcription of the previews (private preview only, reviewed by a human before anything public).
- Lyrics engine rAF loop: accepted exception.
- Guitar: horizontal; strings touchable and ringing with the music; desktops always 3D with no toggle.
- Lights: larger stars, realistic but cheap; a wall switch with On/Off; Off = garland fully dark, room at 25 %.
- Interface sounds made with ElevenLabs are allowed in the repo (CONTRACT section 10 amended); music audio stays forbidden.
