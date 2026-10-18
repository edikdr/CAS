# Report — core run (lead engineer)

Project: Sam Davies scroll-story fan concept · folder `sam-davies-site/` in `edikdr/CAS` · branch
`claude/new-session-ddyjk3`. P0, P1 and P2 are done. All automated checks pass: 5 unit tests,
`check-i18n`, `check-fonts`, and 35 Playwright e2e tests at 390×844 and 1440×900 (one is skipped on
mobile by design). The details are in `docs/decisions.md` (D-001…D-038).

## Inputs missing from the upload — read first

| Missing | Consequence | What was done |
|---|---|---|
| `lyrics-engine.zip` (engine + `AI_GUIDE.md`) | The guide could not be read, and both engine **VERIFY** items cannot be checked | `vendor/lyrics-engine/` is an empty drop-in (`MISSING.md`). There's an adapter for the API as the TZ describes it, plus a small **core fallback renderer** that draws the local LRC, so the whole lyrics flow works and is tested (D-002) |
| `refs/19970.jpg`, `refs/19972.jpg` | The artist red couldn't be eyedropped | `--c-red: #e30613` (the TZ's starting value), measured at 3.66:1 on night: large text only (D-004) |

## What works

**P0 — foundation**
- Asset pipeline (`npm run build`). It matches all 45 previews to `meta.json` by normalized title +
  collection, with no duplicates and no orphans (`docs/match-report.md`). It also builds 25 release covers
  (22 supplied, 3 albums from Apple artwork, `docs/covers-report.md`), a 17.7 KB Anton subset, and the data.
- Scrub-friendly video, keyframe every 2 frames, all within budget (decimal MB): 1080 MP4 11.67 MB,
  720 MP4 5.83 MB, plus VP9 WebM fallbacks at 11.87 / 5.98 MB (D-006/7). Poster 55.8 KB (LCP asset),
  end frame 102 KB, 4 stills for reduced motion.
- Data from `meta.json` only:
  - 45 tracks, 25 releases grouped by `collectionName`.
  - A 15-entry timeline with exact dates; owner facts are `verified:false`.
  - 14 quiz questions in EN/ES/CA. Each is re-checked to have exactly one correct option.
- `index.html` matches contract A.2 exactly. `docs/contracts.md` = the §10 block verbatim, plus core
  notes for the UI layer.
- Scroll engine:
  - Source is picked by device and codec; the video is lazy-attached after the poster.
  - A critically damped follower runs in one rAF loop that sleeps when idle.
  - No `currentTime` writes happen while a seek is pending.
  - It publishes `--p/--act/--scrim`, `html[data-act]` and `story:progress`.
  - Reduced motion shows one still per act, and the video is never requested.
- e2e: scroll to 0/50/100 % gives video time = p × duration within 0.05 s. Act boundaries, no console
  errors, and the only page global is `SD`.

**P1 — audio, lyrics, overlays, i18n**
- **Player.** One persistent `<audio>` for the whole page.
  - play / pause / toggle / stop. A preview that reaches its end goes to `idle`.
  - Labels, `aria-pressed` and `.is-playing` on the hooks.
  - `--prog` updates every frame; `player:time` fires at most 4×/s.
- **Lyrics modal.** The acceptance flow passes at both sizes:
  - play → open lyrics → words appear on top of the page → chevron close keeps the music playing and
    the island appears top-centre → tapping the island reopens it with no doubled text → stop hides the island.
  - Esc, Back and backdrop all close it, and focus returns to the opener.
  - Scroll position and video time are identical before and after.
  - Zero requests to `lrclib.net`; the production CSP `connect-src 'self'` blocks it as well.
- **Owner feedback applied (D-033).** The lyrics modal has **no opaque panel**: the scroll-story video
  (or the end frame) stays visible behind the lyrics, and page content fades out. Asserted in e2e and
  written into the contract for the UI run.
- **Modal.** Focus trap, background inert, no history growth over repeated open/close, exact scroll lock.
  - A resize or rotation while the modal is open no longer shifts the story (bug found in review,
    regression test added, D-038).
- **Island.** Never takes focus. On narrow screens the language switch steps below it; before that fix
  the island's Stop button was covered at 390 px (found by e2e).
- **i18n.**
  - EN→ES→CA→EN switches live with the preview playing and the lyrics open: labels, `<html lang>` and
    title change; no reload, no audio gap, same scroll position and video time.
  - `?lang=ca` loads Catalan and is not saved; a manual switch is saved.
  - `navigator.languages` detection works. Dates and plurals use Intl only.
  - `check-i18n` (verified to catch missing keys, placeholder, plural-shape and namespace errors) and
    `check-fonts` (verified to catch a missing glyph) run before every e2e run.
- **Scribe tooling.**
  - `tools/transcribe-scribe.mjs`: estimate, resumable, 3-way concurrency, retries with backoff,
    `--only`, `--rebuild-lrc`. LRC lines are 1–3 words; spacing and audio-event tokens are dropped.
  - Unit-tested on placeholder words. Run in `--estimate` mode only (45 previews, 22.5 audio-minutes).
  - `docs/lyrics-review.md` gets per-track stats once transcripts exist; it never contains lyric text.
- **Hosting.** `site/vercel.json` sets the CSP, noindex, a year of immutable media caching, Range
  support and no-store for private lyrics. The dev server applies the same headers, so e2e runs
  under the production CSP. `tools/apply-config.mjs` flips `features.indexable`.

**P2**
- Scroll sound (`features.sfx` + `media/sfx/ride-loop.mp3`; hidden without the file):
  - The toggle has i18n labels; gain follows scroll speed.
  - It is under 5 % of max 300 ms after a stop (the first version was too slow, now fixed: D-034).
  - It ducks to 0 under a preview and never touches `#sd-audio`.
- Reduced data uses the same stills path as reduced motion. `saveData` selects the 720 variant (tested).
- 9:16 variant: not supplied, so not built.

## NOT tested (state of the evidence)

- **No real device was used.** Real iOS Safari, real Android and Firefox/WebKit were all untested
  (only Chromium is installed here; WebKit could not be installed under the environment rules).
  That leaves these unverified:
  - the iOS decode unlock (play→pause on first touch)
  - the iOS scroll lock
  - the iOS silent switch and the scroll sound
  - mobile toolbar collapse during scrubbing
- **H.264 MP4 and AAC `.m4a` playback.** The test Chromium has neither codec, so e2e exercises the VP9
  WebM variant and an Opus tone fixture instead of the real previews (D-032). The MP4 files were checked
  with ffprobe/ffmpeg only.
- **Perf numbers are headless.** They come from software decoding in a 4-core container with no GPU.
  The "feels like 60 fps on desktop" criterion was *not measured on real hardware*.
  - 720 path: 60 fps loop, 0 long frames, 28–31 seeks/s, 24–28 ms per seek.
  - 1080 VP9 path: 62–74 ms per seek, 13–33 long frames per 5 s, which is decode-bound (D-010).
  - Mid-range Android / iOS "no visible freezes during 5 s": **not measured**.
- `prefers-reduced-data` cannot be emulated in Chromium (D-036).
- The vendor lyrics engine itself: absent (see above).
- No real lyrics exist yet (no paid call was made). The lyrics UI was tested with fixture LRC files
  of neutral placeholder words.
- Apple preview terms were not reviewed (README-HANDOFF §5).
- ES/CA strings have had no native review: 51 core entries in `docs/i18n-review.md`, all `reviewed: false`.

## VERIFY results

| Item | Result |
|---|---|
| Engine custom-source API (`sources`, `LyricsEngine.sources.lrcText`) | **Not verifiable**: engine not supplied. The adapter feature-detects `sources.lrcText` → `sources.lrc` → `{type:'lrc', text}` and falls back to the core renderer if it throws (D-002) |
| Engine inside a hidden/animated modal | **Not verifiable**. Mitigation per TZ: engine created after the open transition ends; destroyed on every close path |
| Scribe endpoint / fields | **Checked against current ElevenLabs docs.** `POST /v1/speech-to-text`, header `xi-api-key`, multipart `file` + `model_id`, `timestamps_granularity=word`, `tag_audio_events`, `language_code` (ISO-639-1/3, default auto). Response `words[]` has `text`, `start`, `end`, `type` (`word`, `spacing`, `audio_event`) and **`logprob`** (no `confidence` field; probability = e^logprob) |
| Scribe model | **TZ value is outdated**: `scribe_v1` was deprecated and removed on **2026-07-09** (ElevenLabs changelog). Default is `scribe_v2`; `--model` overrides |
| Scroll lock on iOS Safari | **Not tested** (no device). Uses `body{position:fixed; top:-y}`, the standard iOS-safe lock |
| SFX on iOS (silent switch) | **Not tested** |
| Real iOS Safari scrubbing | **Not tested** |

## Sizes vs budgets

| Budget | Limit | Measured |
|---|---|---|
| Mobile video (720) | ≤ 6 MB | MP4 5.83 MB · WebM 5.98 MB |
| Desktop video (1080) | ≤ 12 MB | MP4 11.67 MB · WebM 11.87 MB |
| Poster | ≤ 60 KB | 55.8 KB |
| Runtime JS excl. vendor (core so far) | ≤ 60 KB gz (shared with UI) | **22.3 KB gz** (57 KB raw, 11 modules) → ~37 KB left for the UI |
| Core CSS | — | 5.6 KB gz |
| Initial transfer before video (+ poster) | ≤ 400 KB + poster | **168 KB** + poster 55 KB (core only; UI adds its own) |
| LCP on Slow 4G (150 ms, 1.6 Mbps; mobile 4× CPU) | < 2.5 s | LCP 676–748 ms; poster loaded 845–985 ms (Chromium never reports a full-viewport image as the LCP element, D-035) |
| CLS | 0 | 0 |
| Display font | subset, swap | 17.7 KB woff2, `font-display: swap`, all EN/ES/CA glyphs present |
| Audio | `preload="none"` | yes. 45 previews total 45.3 MB on disk, loaded only on play |

## Open risks

1. **The engine contract is unverified.** When `lyrics-engine.zip` arrives, check `createVendorEngine()`
   in `src/core/lyrics.js` against `AI_GUIDE.md`. The core renderer remains as a fallback.
2. **Real-device scrubbing** (iOS Safari especially) is unmeasured. If it freezes, implement the
   frame-sequence fallback behind `features.frameSequenceFallback` (D-010).
3. **Rights:**
   - Lyrics are gitignored, data-only, and behind a deploy gate; public use needs the artist's written OK.
   - Local copies of Apple previews are the owner's call.
   - The generated previews and video **are committed** to this private repo so the UI run can use them (D-022).
4. **Immutable caching of un-hashed media names.** A swapped file needs a new name (README).
5. **`audioSource: "apple"`.** The engine may route the element through Web Audio, and a cross-origin
   preview without CORS would then play silent (D-021).
6. **Unverified copy.** The Spanish and Catalan strings and the timeline facts (`verified:false`) need
   review before any launch.

## Commands for the owner

```bash
cd sam-davies-site && npm install && pip install fonttools brotli

# (a) data build (raw inputs in sam-davies-site/inputs/)
npm run build            # or: npm run build:video   (also re-encodes the scroll video)
npm test                 # unit + check-i18n + check-fonts + Playwright

# (b) transcription — paid, opt-in
node tools/transcribe-scribe.mjs --estimate
ALLOW_PAID=1 ELEVENLABS_API_KEY=… node tools/transcribe-scribe.mjs
node tools/make-data.mjs  # sets hasLyrics; then review docs/lyrics-review.md

# (c) deploy — Vercel, Root Directory = sam-davies-site/site, Framework "Other", no build step,
#     Deployment Protection ON. Git deploys ship without lyrics; for a protected preview WITH lyrics:
cd site && npx vercel deploy
```

Sonnet can now start.
