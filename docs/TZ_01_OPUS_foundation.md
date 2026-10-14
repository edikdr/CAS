# TZ 01 - Foundation (for Claude Opus 5.5, run in Claude Code)

You are the architect and the one who builds everything that is hard to change later. A second session (Sonnet 5.5) will fill in content and polish on top of your work, so your job also includes **leaving clear extension points and a HANDOFF.md**.

Read in this order: `README.md`, `docs/CONTRACT.md`, `docs/DATA_SCHEMA.md`, `docs/ASSET_REGISTER.md`, `vendor/lyrics-engine/AI_GUIDE.md` + `README.md`, `reference/arctic-monkeys-archive/README.md` (patterns only), then this file. Communicate with the human in Russian, keep answers short; code and docs in English.

## 1. Goal
A fast, private-preview site: a dark cozy room lit by string lights, a guitar in the centre that "plays" along with a 30-second preview (strings vibrate on the beats), and modals for About / Quiz / Receipts / Track. Phones get a layered-DOM guitar; desktops get an optimised 3D guitar generated from photos (Meshy). The foundation must be so solid that Stage 2 only adds content, styles and one renderer.

## 2. Inputs already in the kit
- `data/` (releases, tracks, receipts - generated, correct; 33 rows / 29 unique songs), `data/beats/` (29 auto-analysed files, unverified; see `docs/BEATS_REVIEW.md`), `data/facts/`, `config/rights.json`.
- `assets/reference/guitar/front.jpg` and `back.jpg` (white background, full length, even light - good for image-to-3D and for DOM cut-outs). `assets/reference/room/string-lights.jpg` shows the light layout (two garlands of 5-point stars, ~14 lights).
- `assets/previews-local/` (29 previews + 10 covers, **local testing only, never committed or deployed**).
- `extract/receipt/` - the receipt mechanism, already adapted to sunniva data with a passing test. You do not build receipts (Stage 2), but read `README_RECEIPT.md` so your core does not fight it: it plays pre-rendered frames, needs `esc/albumRuntime` globals, and expects `ransom()` optionally.
- `vendor/lyrics-engine/` (owner's engine: shows synced lines over a 30s preview; **do not edit**). `assets/fonts/luxurious-script/` (OFL).
- `tools/analyze_beats.py`, `tools/termux_*.py` (owner's phone scripts, reference only).
- MCP: TinyFish, ElevenLabs, Meshy (see CONTRACT section 8 for rules).

## 3. Scope - build these (milestones, stop at each gate and report)

### M0 - Audit and plan (no feature code)
- Verify the kit (files present, JSON valid, counts: 17/7/8/1 rows). Fix nothing silently - report.
- Read the lyrics engine docs. Answer precisely: does it expose a custom `sources` hook, a per-line callback/event, a custom renderer or theme hook, and its time base? Decide the adapter design. If it exposes nothing you can use, **do not edit it**; propose the smallest adapter.
- Inspect `reference/arctic-monkeys-archive` for reusable patterns (trackmodal, quiz, receipt, player). Say what you reuse vs rewrite, and why.
- Output: repo layout, milestone list with acceptance tests, risks, and **at most 5 blocking questions**. Wait for "go".

### M1 - Scaffold, data layer, safety rails
- Repo scaffold following CONTRACT section 6 (`core/ features/ styles/ content/ data/ vendor/ tools/`), `index.html` shell, `vercel.json` (noindex headers, cache headers for hashed assets), `package.json` with scripts: `dev` (tiny static server), `validate`, `check:budgets`, `build`, `build:public`.
- `DataStore`, storage wrapper, `RightsGate` + `PUBLIC_BUILD` stripping (prove it with a test: a public build contains no cover URLs, no lyric files, no photos).
- JSON validators from `docs/DATA_SCHEMA.md` (include a check that every `data/beats/<id>.json` matches a track and `bpm` is numeric).
- Budget checker: fails on file-size budgets from CONTRACT section 4 and on any `http(s)://` request in the initial HTML/CSS/JS that is not same-origin.
- Gate: `validate` and `check:budgets` green; the shell page renders a dark room placeholder and loads under 350 KB.

### M2 - Scene shell and light rig
- Layer stack (z-order): wall -> collage slot -> guitar slot -> light glow -> film texture slot -> UI. Define `styles/tokens.css` (colors, spacing, type scale, motion tokens) with three theme slots (Sonnet fills them: Prologue, Link3, Plain).
- `LightRig`: ~12-14 star lights along two sagging garlands (use positions read from the lights photo), glow as radial-gradient sprites, a "breathing" intensity (4-6 s), `pulse(strength)`, an on/off control, reduced-motion = static. Provide a mask/radius API so Stage 2's dust texture can be revealed only near lights.
- Slots for the procedural film texture (Stage 2 implements it): a fixed overlay, `pointer-events:none`, one canvas, drawn once, re-drawn on resize only.
- Gate: scene idle costs ~0 CPU (verify with the Performance panel); lights toggle works; reduced motion respected.

### M3 - Guitar (DOM), strings, BeatClock
- `GuitarStage` interface + **`DomGuitar`** for phones: <= 8 WebP layers (body, neck/headstock, back face, soundhole shadow, bridge/saddle highlights, tuning pegs, strings as 6 thin elements or one SVG, contact shadow), each <= 60 KB, built with a documented cut-out script in `tools/` (rembg or similar; keep the script, do not commit huge intermediates). Use `preserve-3d` + `translateZ` per layer for parallax; flip front/back with `rotateY` on tap; tilt by `DeviceOrientation` (iOS: permission button) with pointer-drag fallback; clamp angles (about +-20 deg / +-25 deg).
- Strings: 6 strings, damped oscillation, `pluck(strength, direction)` alternating down/up strums; amplitude from onset strength; **transform/opacity only**.
- `BeatClock`: reads `PreviewPlayer.currentTime()` in the single rAF loop; fires `onset`/`beat` from `data/beats/<id>.json`; correct after seek/pause/loop/hidden tab; `latencyOffsetMs` setting; no data = idle sway only.
- Gate: using a preview from `assets/previews-local/` + its beats file (e.g. The Shallow End, 6808001979), strings visibly follow the music; 60 fps on a mid-range phone (report the number you measured, or say you could not).

### M4 - Preview player, modal system, lyrics integration
- `PreviewPlayer` (single `<audio>`, `preload=none`, starts on gesture, handles `error` -> "Open in Apple Music" link).
- `ModalManager` on native `<dialog>`: Esc, focus trap and restore, Back-button support (history state), stops audio on close, `inert` background, scroll lock without layout shift.
- Track modal **shell** (Stage 2 fills content): wired to PreviewPlayer, BeatClock, GuitarStage, LightRig and a lyric region.
- `LyricRenderer` interface + engine adapter using a **custom source** reading `data/lyrics/<id>.json` (offset 0, LRCLIB disabled) + **`FontWipeRenderer`**: Luxurious Script, reveal left-to-right per word with a soft mask edge, then a gentle dissolve; `aria-label` with the whole line; reduced-motion = fade. Subset woff2 font self-hosted.
- To test without real lyrics in the repo: build a **fake fixture generator** that makes lines of placeholder words ("la la la ...") with timings; never use real lyrics. For a private-preview check of The Shallow End, **ask the human** to supply the transcript timings (they have an ElevenLabs word-timing file) - do not transcribe the audio yourself unless told to.
- Gate: a fixture line draws and dissolves in sync with the audio; with `permission` missing no text appears.

### M5 - 3D guitar for desktop (Meshy)
- Say first what you will run and the credit cost. Generate from `front.jpg` and `back.jpg` (and a side view if the human provides one). Check the Meshy MCP address first - the connector URL in the owner's list looked incomplete.
- Optimisation pipeline script (`tools/optimize_glb.mjs` using `@gltf-transform/*`): dedupe, weld, simplify to 20-30k triangles, Meshopt/Draco, textures to WebP <= 2048 (1024 if quality allows), <= 5 materials. Strings are **not** in the mesh: render them as separate line geometry with a vertex-shader displacement driven by `pluck`.
- `GlGuitar`: dynamic `import()` of vendored Three.js; lights: <= 3 real lights + sprite glow for the garland, **no real-time shadows**, DPR <= 1.5, render on demand, dispose everything on destroy; fall back to `DomGuitar` on WebGL failure or low-end signals. Manual "3D / flat" toggle.
- Gate: desktop shows the GLB (<= 2 MB); the mobile bundle never contains Three.js or the GLB (prove it with the budget checker).

### M6 - Hardening and HANDOFF
- Lighthouse (mobile) and a throttled-CPU run on the DOM scene; fix regressions. Test: reduced motion, no localStorage, no WebGL, offline (graceful), slow 3G.
- Write **`HANDOFF.md`**: architecture map, every public interface with usage examples, extension points Stage 2 must use (slots, theme tokens, `MagazineRenderer` registration, receipt/quiz registration), what Stage 2 may and may not touch, measured numbers, known issues, `REQUESTS_FOR_CORE.md` (empty template).
- Update `ASSET_REGISTER.md` and `config/rights.json` if anything changed.

## 4. Out of scope for you (Stage 2 does it)
Receipts and their crumple frames, About copy, quiz content, collage composition, three themes and the style switcher, procedural film texture, `MagazineRenderer` (cut-out letters), merch/Bandcamp block, final copywriting.

## 5. Quality bar
- Prefer deleting code to adding it. No dead code, no TODO left without a `HANDOFF.md` entry.
- Every module has a short header comment: purpose, public API, what must not change.
- Unit tests for BeatClock (seek/pause/loop), RightsGate/public-build stripping, DataStore, the lyric adapter. Browser-only visuals are checked manually; describe how.
- Measure, don't claim: every performance statement carries a number and how it was measured.

## 6. Acceptance (all must hold)
1. `validate` and `check:budgets` green; `build:public` output contains no gated asset.
2. Using a real preview from `assets/previews-local/` and its beats file, strings and lights follow the music on phone-sized and desktop viewports. Beat data is auto-generated: if a track looks off, report it (do not tune the code to one song).
3. Lyrics: a fixture line animates in sync; missing/`none` permission -> no text anywhere in the DOM.
4. Mobile bundle has no Three.js/GLB; desktop GLB <= 2 MB, <= 30k triangles.
5. All modals meet CONTRACT section 5.
6. `HANDOFF.md` lets a fresh session work without reading this chat.
