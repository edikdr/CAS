# HANDOFF

Status: **Stage 1, M5 done** (scaffold, data layer, safety rails, scene + light rig, DOM guitar + strings + BeatClock, player + modals + lyrics, WebGL guitar), plus the owner's requests after M5 (horizontal guitar, touchable strings, wall switch with 25 % lights, switch sounds, regenerated 3D model). M6 (hardening + final HANDOFF) pending. This file grows every milestone; at M6 it is the full guide for Stage 2. Rules: `docs/CONTRACT.md`. Plan: `docs/TZ_01_OPUS_foundation.md`.

## Run
```
npm run dev              # http://127.0.0.1:8000, source tree, production headers (CSP, noindex), Range support
npm run dev -- --dir dist --host 0.0.0.0   # serve a build, reachable from a phone on the LAN
npm run validate         # JSON schemas + cross-checks (docs/DATA_SCHEMA.md)
npm run check:budgets    # builds into .tmp/budgets and checks CONTRACT section 4
npm run build            # private preview -> dist/
npm run build:public     # PUBLIC_BUILD -> dist/ (also: PUBLIC_BUILD=1 npm run build)
npm test                 # node:test, no dependencies
node tools/browser-check.mjs [--only load,lights,modal,lyrics,gl]   # real-browser checks; needs playwright + ffmpeg
sh tools/subset_fonts.sh # OFL TTF -> subset woff2 (pip install fonttools brotli)
node tools/lyrics-from-words.mjs words.json <trackId>   # ElevenLabs word timings -> data/lyrics/<id>.json
node tools/make-lyric-fixture.mjs <trackId>             # "la la la" test lyrics on the beat grid
```
Node >= 22. npm devDependencies (tooling only, exact pins): `three` (source for `vendor/three`), `@gltf-transform/*`, `meshoptimizer`, `sharp` (GLB pipeline). The site itself has no runtime dependency.
```
node tools/vendor-three.mjs                 # node_modules/three -> vendor/three (never edit the copies)
node tools/optimize_glb.mjs [raw.glb]       # Meshy export -> assets/models/guitar.glb (+ budget check)
node tools/glb.mjs <file.glb>               # triangles, materials, texture sizes
```

## Architecture (so far)
```
index.html          shell: one stylesheet, one module script (core/app.js)
core/boot.js        classic sync script in <head>: saved theme / motion / lights -> <html data-*> before first paint
core/app.js         composition root: mounts the scene, then RightsGate.load() + DataStore.load(); <html data-state>
core/loop.js        the single rAF loop (Loop.add(task) -> remove)
core/motion.js      Motion.reduced (OS setting OR visitor's "motion off"), mirrored on <html data-motion="off">
core/light-rig.js   LightRig: garlands (below the guitar) + bloom, lit stars, room shade (above it)
core/sfx.js         Sfx: interface sounds through Web Audio (the wall switch clicks)
core/film-slot.js   FilmSlot: canvas overlay; Stage 2 registers the drawing
core/emitter.js     createEmitter() used by core services
core/preview-player.js  PreviewPlayer: the single <audio>
core/beat-clock.js  createBeatClock (pure, unit-tested); core/clock.js = the site's BeatClock instance
core/capability.js  preferredGuitarMode() (3D on capable desktops, always; no toggle), orientation checks
core/guitar/        guitar-stage.js (GuitarStage), dom-guitar.js (layers, flip), strings.js (canvas strings),
                    string-physics.js (damped springs, shared, unit-tested), tilt.js (shared
                    drag/tap/orientation input), gl-guitar.js (WebGL, dynamic import only)
core/modal-manager.js  ModalManager on native <dialog>
core/track-modal.js the 'track' modal shell (TrackModal.setContent for Stage 2)
core/lyrics/        lyric-renderer.js (contract + registry), font-wipe-renderer.js, engine-adapter.js, word-times.js
core/rights.js      RightsGate + createRightsGate (shared with tools/build.mjs)
core/data-store.js  DataStore + createDataStore
core/storage.js     storage wrapper (the only localStorage user)
core/fetch-json.js  fetchJson(url): JSON, null on 404
styles/tokens.css   design tokens + three theme slots (prologue, link3, plain) for Stage 2
styles/base.css     reset, typography, .control pill buttons, .visually-hidden
styles/scene.css    layer stack, string lights, UI corner, DOM guitar
styles/modal.css    dialogs, track window, lyric region, @font-face Luxurious Script
tools/              build, validate, check-budgets, dev-server, lib (never shipped)
test/               node:test suites
vercel.json         build command, output dir, headers (CSP, noindex, cache)
```

## Public interfaces (implemented)
- `RightsGate.allows(className)` -> boolean. Private preview: every class; public build: only `cleared: true`. Unknown class or before `load()`: false. `RightsGate.allowsLyrics(permission)`, `RightsGate.isPublic`.
- `DataStore` - after `await DataStore.load()`: `release(id)`, `track(id)`, `receipts()` are sync (ids may be strings). `beats(id)`, `lyrics(id)`, `facts()` return **Promises** (lazy, cached): `null` = no file / not allowed. Results are frozen.
  ```js
  const beats = await DataStore.beats(trackId);   // null -> idle sway, never invent data
  const lyr = await DataStore.lyrics(trackId);    // null -> show no text at all
  ```
- `storage.get(key, fallback)`, `storage.set(key, value)`, `storage.remove(key)`; keys: `theme, lyricMode, lights, guitarMode, motion, quizBest, volume` (anything else throws). Never throws on blocked storage.

- `LightRig.setEnabled(bool)`, `.enabled`, `.level` (1, or 0.25 when switched off: the lights keep 25 % of their light), `.pulse(strength 0..1)` (also while dimmed, at the dimmed level), `.lights` -> `[{x, y, garland, index}]` (px, viewport box), `.maskImage(radiusPx)` -> CSS `mask-image` with a soft disc per light, `.on('layout' | 'toggle', fn)`. The wall switch (`#light-switch`, two push buttons, bound in `core/app.js`) is the only control; Stage 2 papers/dust can scale their own light by `LightRig.level` or style `[data-lights="off"]`.
  ```js
  dust.style.maskImage = dust.style.webkitMaskImage = LightRig.maskImage(180);
  LightRig.on('layout', () => { dust.style.maskImage = LightRig.maskImage(180); });
  ```
- `Sfx.play('switch-on' | 'switch-off', { gain })` from a user gesture, `Sfx.preload()` (core calls it after the rights gate loads). Files in `assets/sfx/` (rights class `uiSounds`, not cleared: the public build strips them and `Sfx` stays silent). Add a sound = add the file + a literal `new URL(...)` entry in `FILES` + a register row.
- `FilmSlot.setRenderer((ctx, { width, height, dpr }) => { ... })` - draw the whole texture once; core redraws only after a resize (debounced), DPR <= 2.
- `Motion.reduced`, `Motion.setUserOff(bool)`, `Motion.on('change', fn)`. CSS tests only `[data-motion="off"]`.
- `Loop.add((now, dtMs) => keepGoing)` -> `remove()`. Prefer CSS / Web Animations for fire-and-forget motion.
- `PreviewPlayer.play(trackId)` (from a click/tap), `pause()`, `seek(sec)`, `currentTime()`, `isPlaying()`, `trackId`, `audio`, `setVolume(0..1)` / `volume` (remembered), `setMuted(bool)` / `muted`, `canSetVolume` (false on iOS, where only mute works), events `play | pause | ended | timeupdate | seeked | track | error | volume` (`error` detail `{trackId, appleUrl}` -> show an "Open in Apple Music" link). Dev only: `http://127.0.0.1:8000/?local` plays the files in `assets/previews-local/`.
- `BeatClock.on('beat', i => ...)`, `BeatClock.on('onset', ({t, s}) => ...)`, `BeatClock.latencyOffsetMs`, `BeatClock.time()`. `core/app.js` already wires onsets (s >= 0.22) to `GuitarStage.pluck` with alternating down/up strums and beats to `LightRig.pulse(0.45)`; the beats file of the playing track is loaded on the player's `track` event.
- `GuitarStage.pluck(strength, 'down' | 'up')`, `.flip()`, `.setMode('dom' | 'gl')` (not persisted), `.mode`, `.on('mode', fn)`, `.enableTilt()` (iOS permission; the "Tilt" control calls it). Nothing mounts when `RightsGate.allows('guitarPhotos')` is false. Mode: always `preferredGuitarMode()` (fine pointer, >= 900 px, hardware WebGL2, >= 4 GB, no Save-Data -> 'gl'). Owner's call: desktops always get 3D, there is no 3D/flat button (storage key `guitarMode` is no longer used). GL falls back to DOM on load errors, context loss, or when most of its first 60 animated frames exceed 50 ms. `?gl=force` accepts software WebGL (testing only).
- `ModalManager.register(kind, { render(body, payload, api) -> cleanup, className? })`, `.open(kind, payload)`, `.close()`, `.current`, `.on('open' | 'close', fn)`. Kinds for Stage 2: `about`, `quiz`, `receipt`, `merch` (core registered `track`). `api = { close(), setTitle(text), dialog }`. Esc, close button, tap on the empty area and phone Back close the top modal; focus returns to the opener; audio stops on every close; modals stack.
  ```js
  ModalManager.register('about', {
    render(body, payload, api) { api.setTitle('About'); body.append(buildAbout()); return () => {/* cleanup */}; },
  });
  paper.addEventListener('click', () => ModalManager.open('about'));
  row.addEventListener('click', () => ModalManager.open('track', { id: row.dataset.trackId }));
  ```
- `TrackModal.setContent((slots, track, api) => cleanup)` - Stage 2 fills `slots.kicker` (default: release + year), `slots.content` (credits, links, prev/next, cover art behind `RightsGate.allows('coverArt')` and a user action) and may restyle `slots.note` ("Lyrics are not shown in this preview."). `api.setTrack(id)` switches track in the same window (prev/next), `api.play()`, `api.close()`. The shell owns title, player (play/pause, seek, time, "Open in Apple Music" on error) and the lyric region.
- Lyrics: `LyricRenderer` = `{ mount(el, { time, onResume }), setLine({ text, startSec, endSec, words? }), clear(), destroy() }` (`core/lyrics/lyric-renderer.js`). Register the magazine renderer once: `registerRenderer('magazine', createMagazineRenderer)`; it is then picked for `data-theme="link3"` or `storage.set('lyricMode', 'magazine')`. Use `wordTimes(line)` for per-word timing and drive animation from `time()` (pause/seek then just work); wake on `onResume`. Lines arrive from the engine adapter; you never touch the engine.
- `?track=<trackId>` opens a track window on load (also handy for testing on a phone); `?debug` exposes `window.sunniva = { RightsGate, DataStore, LightRig, Motion, PreviewPlayer, BeatClock, GuitarStage, ModalManager, TrackModal }`.

## Look (owner request, after M4)
Base tokens follow the Fantasy Prologue artwork and CD booklet: plum-black room (`--c-wall`, `--c-room`), the cover's pink script (`--c-accent`, outline `--c-accent-deep`), lavender booklet paper for every modal (`--c-paper`, `--c-paper-ink`, `--c-paper-dim`), silver star stickers and a rhinestone row (CSS only, `styles/modal.css`), Luxurious Script for titles and lyrics (`--font-display`, `--font-lyric`), bold caps labels (`.caps`, `--font-caps`). String lights are warm rose (`--c-light`): a static, blurred wash on the wall (SVG filter, drawn once) + a soft near-Gaussian bloom per bulb that breathes. The three theme slots still override these values.

## Lights and the wall switch (owner request, after M5)
- Stars are larger (`--star-size: clamp(29px, 7.2vmin, 34px)`, bloom `--glow-size` scaled with them) and look like the frosted stars in `string-lights.jpg`: below the guitar the unlit plastic star (always drawn), above it the lit star (radial gradient from the LED out to rose tips + a hot LED point) and a two-scale bloom (tight core in a wide halo). On the wall: a wide blurred spill along the wires, a pool under every star and a bright patch right behind it.
- Off = 25 % of the light, not dark. Opacity blends in sRGB, so 25 % of the light is 0.25^(1/2.2) = 0.53 on screen (`--light-dim`): a solid-colour room shade (`.layer--glow::before`) dims everything the lights fall on (wall, wires, guitar in both modes) to 0.53, the bloom goes to 0.53, the lit stars to 0.62 (`--light-dim-star`, a dimmed LED still looks bright up close). Switching changes three opacities on composited layers: nothing is repainted, no JS per frame. On: 140 ms with a short flicker (one Web Animation, skipped with reduced motion); off: 320 ms.
- The switch: an old push-button plate on the wall (bottom right, above the controls), On (|) and Off (O), the pressed one sits in and shows the accent; the plate darkens with the room, its symbols glow faintly. Buttons are 44 px, `aria-pressed`, keyboard operable. A click sound plays when the state changes (`Sfx`, at the player's volume, silent when muted).

## Guitar and strings (owner request, after M5)
- The guitar lies horizontally, headstock right, low E on top (DOM: `.guitar__lay` turns the upright photo frame 90 deg; GL: the model group is rotated). Size: `--guitar-len` in `styles/tokens.css` (length on screen); the guitar sets `--ratio` inline. A tap turns it over its long axis.
- Strings ring with the music (BeatClock onsets -> `GuitarStage.pluck`) and can be touched: press near a string and drag - it follows a little, resists (soft limit), and swings back through rest when released; pull it past twice the limit and it slips off and rings; dragging across the strings plucks them in turn. Both guitars share `core/guitar/string-physics.js` (damped springs at a few Hz, rings 1-1.6 s; profile = triangle at the finger relaxing into a sine). Reduced motion: still.
- DOM strings are drawn on a small canvas over the strings band (shadow, dark edge, body, highlight, dashed winding on the 4 bass strings, blur while fast), redrawn only while something moves. This is canvas paint, not a CSS transform/opacity animation: a bend at the finger cannot be expressed with transforms (CONTRACT section 4 note). GL strings are round-shaded ribbons with a soft shadow on the top, bent in the vertex shader.
- `tilt.js` takes `grab = { down(e) -> bool, move, up }`: a press that starts on a string goes to the strings, anywhere else tilts (drag) or flips (tap).

## Scene layers and extension points
Order (z, `styles/tokens.css`): wall -> `#collage-slot` (Stage 2 papers + hotspots) -> `#garland` (wall light, wires, plastic stars) -> `#guitar-slot` -> `#glow` (room shade, bloom, lit stars) -> `#film-slot` (canvas) -> `#ui` (title, wall switch, controls). The room shade covers the collage too, so Stage 2 papers dim with the lights for free. `#garland`, `#glow`, `#film-slot` ignore pointer events.
- Themes: fill the three `:root[data-theme=...]` blocks in `styles/tokens.css` with token values; `core/boot.js` applies the saved theme (storage key `theme`) before first paint; a switcher only has to set `document.documentElement.dataset.theme` and `storage.set('theme', name)`.
- Lights down (25 %): `<html data-lights="off">`; style anything light-dependent with that selector (layers above `#glow`, e.g. the film, are not covered by the room shade).

## Build and rights rails (what the tools enforce)
- Only whitelisted files ship (`RULES` in `tools/build.mjs`): `index.html`, `core/**.js`, `features/**.{js,css,json}`, `styles/**.css`, `content/**.json`, runtime data, `vendor/lyrics-engine/lyrics-engine.{js,mjs}`, `assets/**` except `reference/`, `previews-local/`, `.ttf/.otf/.md`. A binary file inside `core/ features/ styles/ content/` fails the build.
- Every shipped file under `assets/` must belong to a class in `config/rights.json` (`paths`). Folder per class: see `docs/ASSET_REGISTER.md`.
- Files under `assets/` are content-hashed (`name.<hash>.ext`, cached `immutable`); literal references in HTML/CSS/JS/JSON are rewritten. **Reference assets by a literal path or from a JSON manifest**; building an `assets/` path with `${}` or `+` fails the build.
- Lyric files ship only if their `permission` allows it in that build; `data/facts/verification.json` ships filtered to `verified: true`; `artist.json`, `itunes-raw/`, beats `_index.json` never ship.
- Public build also fails if HTML/CSS/static imports still load a stripped file, or if a host of a non-cleared class (e.g. `mzstatic.com`) appears in any shipped text.
- `check:budgets`: critical path <= 350 KB gzip, initial JS <= 90 KB gzip, no `http(s)://` in the initial HTML/CSS/JS graph or any shipped CSS (except `<a href>`), Three.js / lyrics engine / `.glb` never in the initial graph, DOM guitar layers (`assets/guitar/dom/`) <= 8 WebP, <= 60 KB each, <= 300 KB total, GLB <= 2 MB, covers WebP <= 100 KB, fonts woff2 with `OFL.txt`.
- `index.html` has one inline script, the import map that resolves `three` for the vendored GLTFLoader; its sha256 is in the CSP and the build fails if the two drift apart (edit the map -> update the hash).
- CSP (in `vercel.json`, also served by the dev server) allows third parties only for: Apple artwork (`img-src *.mzstatic.com`), Apple previews (`media-src audio-ssl.itunes.apple.com`), Bandcamp (`frame-src`). A new third-party host needs a core change (`REQUESTS_FOR_CORE.md`). `connect-src 'self'` also blocks LRCLIB at the browser level.

## Measured (M1)
- Shell, headless Chromium (Playwright 1.56), Pixel 7 emulation, served from `dist/` by the dev server: 10 requests, 43.8 KB uncompressed, 0 third-party, 0 console errors, LCP 164 ms (local, no throttling). Desktop 1440x900: same requests, LCP 88 ms.
- `check:budgets`: critical path 4.0 KB gzip, initial JS 3.0 KB gzip.

## Measured (M2)
- Idle scene, 5 s after boot, CDP `Performance.getMetrics` (headless Chromium): TaskDuration 6.1 ms on Pixel 7 emulation, 5.2 ms at 1440x900 = 0.1 % of the main thread; Script, Layout, Style 0.0 ms. Breathing is a compositor-only opacity animation.
- Lights toggle sets `data-lights="off"` and `sunniva:lights=false`; reduced motion (at load, switched live, or the Motion button) removes the breathing animation.
- `check:budgets`: critical path 12.9 KB gzip (14 files), initial JS 9.2 KB gzip.

## Measured (M3)
- DOM guitar: 5 WebP layers, 93.3 KB total (back 44, body 31, neck 12, hole 4, bridge 3).
- The Shallow End (6808001979), local preview, headless Chromium, 8 s of playback. Playwright's Chromium has no AAC decoder, so the test serves an Opus transcode of the same clip (`page.route`); real Chrome/Safari play the m4a directly.
  - Onset -> event delay (audio time at emit minus onset time): median 9-11 ms, p90 15 ms, max 16 ms (<= 1 frame). Seek to 20 s: no burst (4 onsets in the next 1.4 s, the normal rate).
  - Pixel 7 emulation: 60 fps (rAF count), also with CPU throttled 4x (worst frame 16.8-33 ms).
  - 1440x900 DOM fallback: 37-47 fps in headless Chromium, which composites in software (no GPU): sway + breathing together cost the frames, each alone stays at 58-60 fps. Not measured on a real GPU; desktop normally gets the WebGL guitar (M5).
  - Not measured on a real phone (no device here) - owner check.
- Unit tests: `test/beat-clock.test.mjs` (order, seek both ways, loop restart, hidden tab, pause/resume, latency, coarse currentTime, no data).

## Measured (M4)
`node tools/browser-check.mjs` (headless Chromium 1.56, Opus copies of the clips): 18/18 passed.
- Load (Pixel 7, private build): 35 requests, 122.7 KB uncompressed, 0 third-party, no lyrics engine / Three.js / GLB, idle main thread 0.12 %. `check:budgets`: critical path 28.2 KB gzip, initial JS 22.2 KB gzip.
- Modals: focus inside on open, Tab never reaches the page, Esc closes and restores focus to the opener, Back closes and stays on the page, stacked modals close top-first, audio stops on close, CLS 0.0004 over open/close.
- Lyrics: permission "none" and missing file -> note shown, no lyric text in the DOM, engine never downloaded. Fixture lines (track 20) appear within 22 ms of their start time (17 ms with reduced motion), words wipe in one by one, each line dissolves when the next starts; reduced motion uses fades only (no transforms).
- The Shallow End: a private-preview draft transcript (ElevenLabs Scribe, 33 words, 10 lines) was made with `tools/lyrics-from-words.mjs` into the gitignored `data/lyrics/6808001979.json`; it shows word-timed in the track window. It is unreviewed and is not in git or in any archive.
- Luxurious Script subset woff2: 27 KB (all features: 82 KB).

## Measured (M5)
- Meshy: multi-image-to-3D from front.jpg + back.jpg, meshy-7.1, 2K texture, remesh to 30k: 30 credits (balance was 2000), 84 s. Raw 4.53 MB / 27,858 triangles / 1 material / 2048 JPEG.
- `tools/optimize_glb.mjs`: 1.25 MB, 22,285 triangles, 1 material, 2048 px WebP texture (504 KB), quantized; no Meshopt/Draco (not needed under 2 MB, so no WASM decoder and no CSP change). A 1024 px texture would give 0.96 MB but a visibly softer top.
- Desktop extra download when the GL path runs: Three.js 457 KB gzip (core 288 + module 131 + loaders/utils 38) + gl-guitar.js 4 KB + GLB 1.25 MB (barely compressible). Phones never request any of it (`browser-check gl`).
- Browser checks: 27/27 (`node tools/browser-check.mjs`), incl. GL idle main thread 0.11-0.18 % (render on demand) and the 3D/flat toggle.
- Frame rate: headless Chromium only has software WebGL (SwiftShader): GL guitar ready ~1.2 s on a local server, 11 fps while plucking every 330 ms at 1440x900. That is CPU rasterization, not a GPU number; real desktop GPUs were not measured (owner check). The watchdog above protects slow real GPUs.

## Measured (horizontal guitar + interactive strings)
- `test/string-physics.test.mjs`: 5 tests (shape, swing and settle, strength, strum order, grab/resist/release with overshoot). All unit tests: 51/51. Browser checks: 27/27.
- Pixel 7 emulation with The Shallow End playing (strings redrawn while they ring): 60 fps, also at CPU 4x (worst frame 17-33 ms). Onset -> event p90 15 ms.
- 1440x900 DOM fallback in headless (software compositing): 31 fps; desktop normally uses the GL guitar. No real-device numbers yet.

## Measured (lights, switch sounds, regenerated 3D model)
- Browser checks 33/33 (new `lights` section: on/off levels 1 -> shade 0.47, bloom 0.53, stars 0.62; state survives a reload; keyboard; idle main thread with the lights down 0.14 %; click files load only after ready and decode).
- Idle main thread on load 0.13 % (Pixel 7 emulation); GL idle 0.09 %.
- Switch sounds: ElevenLabs Sound Effects, 1 run x 4 takes, 200 credits; 2 takes kept, 3 KB each.
- Meshy re-generation: same photos with the strings painted out (`cutout_guitar.paint_out_strings`), white background, upscaled 2x; `geometry_resolution: 2k`, `texture_resolution: 4k`, remesh to 30k, 35 credits (balance 1910 before), 88 s. Shipped after `tools/optimize_glb.mjs --ratio 1`: 1.46 MB, 29,589 triangles, 2048 px WebP (552 KB). Smooth outline, no baked strings, no lumps on the top (the M5 model had all three). The raw export and the pre-remesh mesh (319k triangles, untextured) stay in `.tmp/meshy2/`.

## Known issues and notes for later milestones
- `extract/receipt/js/receipt.js` creates two extra `new Audio()` for paper sounds (CONTRACT: one `<audio>`), loads them from `assets/sfx/` (files sit in `extract/receipt/sfx/`, 480 KB WAV, provenance unknown). Stage 2: play them through `Sfx` (Web Audio buffers) or drop them. `assets/sfx/` is rights class `uiSounds` (the switch clicks): give the paper sounds a register row first, and their own class if their provenance differs.
- `data/lyrics/` is gitignored, so a Vercel deploy built from git has no lyrics. To show lyrics privately, build locally and deploy `dist/` (decided in M6).
- Lyrics engine keeps its own rAF loop while a track modal with lyrics is open and playing: accepted exception to "one rAF loop" (owner, M0). Its scene is rendered off-screen and hidden; only its line/gap events are used. LRCLIB is never used (only our source is passed, and CSP `connect-src 'self'` blocks it anyway).
- `data/lyrics/` stays out of git, so private deploys with lyrics must be built and deployed from a machine that has the files (M6 note).
- Headless Chromium lacks AAC: real-browser checks transcode the previews; Safari/Chrome play the m4a.
- If a future GLB uses Meshopt/Draco (WASM), CSP `script-src` needs `'wasm-unsafe-eval'`.
- 3D model (regenerated): the dark binding line along the top's edge is painted by Meshy and wavers by a pixel or two at full size; the soundhole is a painted surface, not a real hole. A side photo of the guitar would improve the sides further; for the public build re-generate from own photos.
- Three.js 0.186 ships no minified build; vendored files are unminified (457 KB gzip). A minifying vendor step would roughly halve it - only if desktop load time matters.
- Beat data is unverified (`docs/BEATS_REVIEW.md`); 5 tracks may be at half/double tempo. Strings pluck on onsets (tempo-independent), lights pulse on beats: a half/double-tempo track only changes the light rhythm.
- `tools/cutout_guitar.py` holds nut/saddle/soundhole landmarks measured on `front.jpg`; new photos need new measurements.

## Stage 1 milestones left
M2 scene shell + LightRig + tokens/theme slots - M3 DomGuitar, strings, BeatClock - M4 PreviewPlayer, ModalManager, track modal shell, lyric adapter + FontWipeRenderer - M5 GlGuitar (Meshy) - M6 hardening, full HANDOFF.
