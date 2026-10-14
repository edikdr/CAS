# HANDOFF

Status: **Stage 1, M1 done** (scaffold, data layer, safety rails). M2-M6 pending. This file grows every milestone; at M6 it is the full guide for Stage 2. Rules: `docs/CONTRACT.md`. Plan: `docs/TZ_01_OPUS_foundation.md`.

## Run
```
npm run dev              # http://127.0.0.1:8000, source tree, production headers (CSP, noindex), Range support
npm run dev -- --dir dist --host 0.0.0.0   # serve a build, reachable from a phone on the LAN
npm run validate         # JSON schemas + cross-checks (docs/DATA_SCHEMA.md)
npm run check:budgets    # builds into .tmp/budgets and checks CONTRACT section 4
npm run build            # private preview -> dist/
npm run build:public     # PUBLIC_BUILD -> dist/ (also: PUBLIC_BUILD=1 npm run build)
npm test                 # node:test, no dependencies
```
Node >= 22, no npm dependencies so far.

## Architecture (so far)
```
index.html          shell: one stylesheet, one module script (core/app.js)
core/app.js         boot: RightsGate.load() + DataStore.load(); sets <html data-state="ready|error">
core/rights.js      RightsGate + createRightsGate (shared with tools/build.mjs)
core/data-store.js  DataStore + createDataStore
core/storage.js     storage wrapper (the only localStorage user)
core/fetch-json.js  fetchJson(url): JSON, null on 404
styles/base.css     reset + dark room placeholder (M2 adds tokens.css and the layer stack)
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
- `storage.get(key, fallback)`, `storage.set(key, value)`, `storage.remove(key)`; keys: `theme, lyricMode, lights, guitarMode, motion, quizBest` (anything else throws). Never throws on blocked storage.

## Build and rights rails (what the tools enforce)
- Only whitelisted files ship (`RULES` in `tools/build.mjs`): `index.html`, `core/**.js`, `features/**.{js,css,json}`, `styles/**.css`, `content/**.json`, runtime data, `vendor/lyrics-engine/lyrics-engine.{js,mjs}`, `assets/**` except `reference/`, `previews-local/`, `.ttf/.otf/.md`. A binary file inside `core/ features/ styles/ content/` fails the build.
- Every shipped file under `assets/` must belong to a class in `config/rights.json` (`paths`). Folder per class: see `docs/ASSET_REGISTER.md`.
- Files under `assets/` are content-hashed (`name.<hash>.ext`, cached `immutable`); literal references in HTML/CSS/JS/JSON are rewritten. **Reference assets by a literal path or from a JSON manifest**; building an `assets/` path with `${}` or `+` fails the build.
- Lyric files ship only if their `permission` allows it in that build; `data/facts/verification.json` ships filtered to `verified: true`; `artist.json`, `itunes-raw/`, beats `_index.json` never ship.
- Public build also fails if HTML/CSS/static imports still load a stripped file, or if a host of a non-cleared class (e.g. `mzstatic.com`) appears in any shipped text.
- `check:budgets`: critical path <= 350 KB gzip, initial JS <= 90 KB gzip, no `http(s)://` in the initial HTML/CSS/JS graph or any shipped CSS (except `<a href>`), Three.js / lyrics engine / `.glb` never in the initial graph, DOM guitar layers (`assets/guitar/dom/`) <= 8 WebP, <= 60 KB each, <= 300 KB total, GLB <= 2 MB, covers WebP <= 100 KB, fonts woff2 with `OFL.txt`.
- CSP (in `vercel.json`, also served by the dev server) allows third parties only for: Apple artwork (`img-src *.mzstatic.com`), Apple previews (`media-src audio-ssl.itunes.apple.com`), Bandcamp (`frame-src`). A new third-party host needs a core change (`REQUESTS_FOR_CORE.md`). `connect-src 'self'` also blocks LRCLIB at the browser level.

## Measured (M1)
- Shell, headless Chromium (Playwright 1.56), Pixel 7 emulation, served from `dist/` by the dev server: 10 requests, 43.8 KB uncompressed, 0 third-party, 0 console errors, LCP 164 ms (local, no throttling). Desktop 1440x900: same requests, LCP 88 ms.
- `check:budgets`: critical path 4.0 KB gzip, initial JS 3.0 KB gzip.

## Known issues and notes for later milestones
- `extract/receipt/js/receipt.js` creates two extra `new Audio()` for paper sounds (CONTRACT: one `<audio>`), loads them from `assets/sfx/` (files sit in `extract/receipt/sfx/`, 480 KB WAV, provenance unknown). Stage 2: play them through Web Audio buffers or drop them; register them first.
- `data/lyrics/` is gitignored, so a Vercel deploy built from git has no lyrics. To show lyrics privately, build locally and deploy `dist/` (decided in M6).
- Lyrics engine keeps its own rAF loop while a track modal is open and playing: accepted exception to "one rAF loop" (owner, M0). LRCLIB is never used: lyrics come from ElevenLabs word timings converted into `data/lyrics/<id>.json` (M4).
- M5: if the GLB uses Meshopt/Draco (WASM), CSP `script-src` needs `'wasm-unsafe-eval'`; GLB triangle/material checks are added to `check:budgets` then.
- Beat data is unverified (`docs/BEATS_REVIEW.md`); 5 tracks may be at half/double tempo.

## Stage 1 milestones left
M2 scene shell + LightRig + tokens/theme slots - M3 DomGuitar, strings, BeatClock - M4 PreviewPlayer, ModalManager, track modal shell, lyric adapter + FontWipeRenderer - M5 GlGuitar (Meshy) - M6 hardening, full HANDOFF.
