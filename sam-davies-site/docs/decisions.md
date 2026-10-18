# Decisions (core, one-shot run)

Every point where the TZ left a choice, an input was missing, or a **VERIFY** item was checked.
Format: decision · why · consequence. Safe option chosen whenever blocked (TZ "one shot").

## Inputs and setup

**D-001 · Project lives in `sam-davies-site/` inside the `edikdr/CAS` repo.**
The repo root already holds an unrelated, finished site (Cigarettes After Sex fan site) with its own
`tools/`, `index.html`, `README.md`. Overwriting it was not asked for, so the new project is a
self-contained subfolder matching the kickoff layout (`inputs/`, `site/`, `tools/`, `tests/`, `docs/`).
Vercel: set *Root Directory* = `sam-davies-site/site` (see README-HANDOFF.md).

**D-002 · `lyrics-engine.zip` was NOT supplied → adapter + core fallback renderer. VERIFY items could not be checked.**
The upload contained no `lyrics-engine.zip` (searched the uploads, the filesystem, the git history and
the account's repos). Safest option that keeps the site working and the rules intact:
- `site/vendor/lyrics-engine/` exists with `MISSING.md`; drop the engine there **untouched**.
- `tools/make-data.mjs` records `build.json.lyricsEngine` (file present or not), so core never
  requests a missing script (no 404 console error).
- `core/lyrics.js` → `createVendorEngine()` is the only place that calls the engine. It follows the
  TZ's description (`LyricsEngine.create({audio, container, track, calibration:false, theme, sources})`,
  `engine.open()`, `engine.destroy()`, `engine.setTrack`) and feature-detects the custom-source helper
  (`LyricsEngine.sources.lrcText(text)` → `sources.lrc(text)` → `{type:'lrc', text}`).
- Without the engine (or if it throws), a **core fallback renderer** draws the same local LRC inside
  `#lyrics-stage` with the same `.le-word` hook, so the modal works end to end and the P1 acceptance is
  testable. It is ~80 lines, not a copy of the engine.
- **VERIFY results:** custom-source API → *not verifiable (engine missing)*; behaviour inside a
  hidden/animated modal → *not verifiable*; mitigation already applied per TZ: the engine is created
  **after** the modal's open transition ends (`await SD.modal.open()` resolves on `transitionend`).
  Engine guide rules honoured by construction: one persistent `<audio>` (`#sd-audio`), core never calls
  `createMediaElementSource`, `destroy()` on every close path (chevron, Esc, Back, backdrop, swap).
- **Owner action:** add the zip contents to `site/vendor/lyrics-engine/`, run `node tools/make-data.mjs`,
  run `npx playwright test`, then check `createVendorEngine()` against `AI_GUIDE.md` (10-minute job).

**D-003 · Reference screenshots `19970.jpg` / `19972.jpg` were NOT supplied.**
**D-004 · Artist red = `#e30613` (the TZ's starting value), not eyedropped.** Replace `--c-red` in
`tokens.css` after eyedropping the real refs. Measured contrast: `#e30613` on `--c-night` 3.66:1,
on `--c-ink` 4.02:1 → passes 3:1 for large display text only; never use it for body text
(cream on night = 14.41:1).

**D-005 · Anton supplied as `Anton.zip` (TTF + OFL).** Subset to `site/fonts/anton-sd.woff2`
(17.7 KB): Basic Latin, Latin-1, Latin Ext-A, dashes, quotes, ellipsis, guillemets, €. All required
EN/ES/CA glyphs present (`tools/check-fonts.mjs`). The only catalogue characters Anton lacks are
`☆⭑` in the single title "EsStrellao°☆⭑*" → reported as a warning (UI should render that title in the
body font or accept the fallback for those two symbols).

## Video

**D-006 · H.264 MP4 + VP9 WebM fallback, chosen by `canPlayType`.**
The test Chromium (and many open-source Chromium builds) has no H.264. A VP9 copy makes the scroll
story work there and lets e2e test real scrubbing. MP4 is listed first, so Safari/Chrome/Firefox/Edge
use H.264. Same budgets apply to both.

**D-007 · Budgets measured in decimal MB (stricter than MiB).** Final: `scroll-1080.mp4` 11.67 MB (CRF 24),
`scroll-720.mp4` 5.83 MB (CRF 26), `scroll-1080.webm` 11.87 MB (CRF 36), `scroll-720.webm` 5.98 MB (CRF 41),
`poster.webp` 55.8 KB (≤ 60 KB), `end.webp` 102 KB, stills 45–66 KB. Banding check: the blue-hour sky
(t = 4.5 s) was extracted from all three small/large encodes and compared at 640 px: no visible
banding in any of them; the 720 WebM (CRF 41) is slightly softer than the MP4s. Checked on a laptop-class
screenshot only, not on a phone screen.

**D-008 · Stage is `position: fixed`, not sticky.** The wrapper `#story` still provides the scroll length
(`scrollLengthVh`, 600 vh) and is out of flow; the act sections in `<main>` scroll over it and core gives
them `min-height` = act span × length, so `#discography` starts as p reaches 1. A fixed stage also *is*
the required "fixed dimmed background" after the video (end frame + scrim), with no handover jump.
Height is `100lvh` so mobile toolbar collapse never resizes the video mid-scrub.

**D-009 · Follower and seek policy (measured, not by taste).** Critically damped spring (stiffness 140,
damping ratio 1 → settles in ≈ 0.4 s) inside the page's single rAF loop; loop sleeps when settled.
Writes are skipped when |Δ| < 1/48 s, and **never issued while a seek is pending** — the newest target
is written on the next free frame (`seeked` wakes the loop), so the video is at most one seek behind
and seek rate adapts to decode speed (`heldBackWrites` in `docs/perf-*.json` counts the skipped writes).
The ungated alternative (write every frame) was not benchmarked; gating was chosen because it cannot
build a seek queue. The last 1/24 s is never targeted (some
decoders show a black final frame).

**D-010 · Frame-sequence fallback NOT implemented.** The flag `features.frameSequenceFallback` exists
(false). Headless measurement passed (no freezes; 720: 30 seeks/s ≈ every video frame; 1080 VP9 in a
CPU-only container: 10.7 seeks/s, avg seek 74 ms — software-decode bound, as forcing 720 at the same
viewport gives 23 seeks/s / 32 ms). That is not evidence of failure on real hardware with H.264 decode.
Real devices were **not** measured; if a real iOS/Android test shows freezes, implement it then.

**D-011 · Device variant.** 720 when `min(innerWidth, screen.width) ≤ 820`, `saveData`,
`deviceMemory < 4` or `hardwareConcurrency < 4`; else 1080.

**D-012 · Reduced motion / reduced data.** 4 stills total, **one per act** (p = .12, .45, .80, .99),
swapped by `html[data-act]` with no animation; the video is never requested (asserted in e2e). The TZ's
"4 static stills … per act" was read as four stills, one per act (acts 0–3).

**D-013 · Lazy video.** The poster is the stage background and is preloaded with `fetchpriority=high`
(LCP element). The video `src` is attached on `load` + `requestIdleCallback` (≤ 1.5 s), or at once on
the first scroll.

**D-014 · Warm grade** = one `mix-blend-mode: soft-light` ochre layer, opacity 0.22 → 0 by p = 0.38.
**Scrim** = night overlay with a top/bottom gradient, opacity curve from config
(`.62 → .5 → .36 → .18 → .22 → .45`): strong over the grey daylight, light in the plaza, darker again
behind the post-video content.

## Data

**D-015 · Releases group by `collectionName`;** EP rows in `meta.json` carry the collection name in
`folder` (not "EPs"), and album tracks sit in Features — neither is used for grouping.
**D-016 · `releases[].date` = latest track date** in the collection (Gliese 581 C tracks span
2018-09-28 → 2018-12-21; a collection is complete only once its last track is out).
**D-017 · `releases[].artistLine`** = the meta artist line when all tracks share it, else the artists
credited on every previewed track (e.g. La Epifanía → "Cutemobb, Sam Davies & iseekarlo"). No invented
"album artist".
**D-018 · Album covers** (Funprint, Atzilut, La Epifanía): Apple `artworkUrl100` upscaled to
`1000x1000bb` at build time (cached in `.cache/artwork/`); styled placeholder if the fetch fails.
**D-019 · Timeline.** Auto entries: first release of each year, every EP/album, the most recent
release — exact dates from meta, copy says "in this catalogue". Owner facts are `verified:false`:
born 2000 Barcelona (dated "2000"); SamxSen duo with LEÏTI and the CuteMobb collective are dated to the
year of their **first credit in this catalogue** (2018, 2020) — that date is data, the membership is not.
**D-020 · Quiz** = 14 auto questions, 6 template kinds, seed `sd-2026`. Rules that keep answers
unique: every candidate is re-checked to have exactly one correct option (else dropped);
"credited alongside" skips tracks credited to the collectives samxsen/Cutemobb (membership would make a
distractor arguably correct) and never uses a distractor credited on that track (feat. credits included);
"which came first/latest" uses four releases from four different years; "most-credited collaborator" is
only asked when the top count is unique.
**D-021 · `audioSource`** is applied at data-build time: `local` → `media/audio/<id>.m4a`, `apple` →
`previewUrl` written into `tracks[].audio`. Caveat for `apple`: the engine may route the element through
Web Audio; a cross-origin source without CORS would play silent there. Default stays `local`.
**D-022 · Generated media is committed** (video, poster/stills, covers, the 45 previews ≈ 44 MB) because
the Sonnet run is a separate session that needs them and the repo is private. Raw `inputs/` and
`.cache/` are gitignored. Hosting copies of Apple previews publicly is the owner's call (README).
**D-023 · `hasLyrics`** is computed when `make-data.mjs` runs (LRC present + `features.lyrics`). After a
transcription run, re-run `node tools/make-data.mjs`.

## Behaviour

**D-024 · Scroll lock** = `body{position:fixed; top:-scrollY}` (the only reliable lock on iOS Safari) +
`--sbw` padding. The story loop is frozen while a modal is open (scrollY reads 0 then) and resumes with
the identical p because modal.js restores the exact position *before* dispatching `modal:close`.
iOS Safari: **not tested** (no device in this environment).
**D-025 · History:** one `pushState` per open; UI close calls `history.back()` and swallows that
`popstate`; a new open waits for a pending `back()` to land first. Net history growth after any number of
open/close cycles: one forward entry (unavoidable with pushState), asserted in e2e.
**D-026 · `#lang-switch` stays usable above the modal** (not in the inert list, `--z-lang: 90`), so the
language can be switched with the lyrics open, as the acceptance requires. Keyboard focus remains
trapped in the modal (the switch is reachable by pointer/touch only while a modal is open).
**D-027 · `[data-play-track]` a11y pattern:** constant label "Play preview: {title}" + `aria-pressed`
(toggle-button pattern). `[data-player-toggle]` (no title context) changes its label Play/Pause instead.
**D-028 · Island focus:** never focused on appear; if focus is inside it when it hides (Stop), focus
moves to that track's `[data-play-track]` button, else it is released to the page.
**D-029 · Language:** `?lang=` wins but is **not saved**; only a manual switch is saved
(`localStorage`, try/catch). On a switch, an existing `?lang=` is updated with `replaceState`
(history state kept, no new entry) so reload keeps the chosen language.
**D-030 · No LRCLIB, enforced twice:** only the local source is passed to the engine, and the Vercel CSP
`connect-src 'self'` makes any other lyrics host unreachable in production. e2e asserts zero requests
to `lrclib.net`.
**D-031 · Unofficial notice:** core guarantees a `[data-sd-notice]` element in `#footer` (adds one if the
UI did not, re-adds it if removed).
**D-032 · Test audio.** The test Chromium has no AAC decoder, so e2e serves an Opus tone fixture in place
of the previews (tracks.json patched in the test only). Real `.m4a` playback is therefore **not covered
by e2e**; the player refuses an `.m4a` source when `canPlayType('audio/mp4')` is empty and announces
the error instead of failing silently.
