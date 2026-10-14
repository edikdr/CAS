# TZ 02 - Content, styles and polish (for Claude Sonnet 5.5, run in Claude Code)

Stage 1 (Opus) built the foundation and left `HANDOFF.md`. You fill the room with content and style. You **add** things; you do **not** rewrite architecture.

Read in this order: `README.md`, `docs/CONTRACT.md`, **`HANDOFF.md`**, `docs/DATA_SCHEMA.md`, `docs/ASSET_REGISTER.md`, then this file. Reference only (patterns, not content): `reference/arctic-monkeys-archive/` (`receipt.js`, `quiz.js`, `quizzes.js`, `trackmodal.js`, `collage.js` -> `ransom()`, `tools/crumple/`). Talk to the human in Russian, short and direct; code and docs in English.

## 0. Rules of engagement
- Do **not** edit `core/` or `vendor/`. If you need a core change, append it to `REQUESTS_FOR_CORE.md` (what, why, the smallest change) and work around it meanwhile.
- All CONTRACT budgets and accessibility rules apply to everything you add. Run `validate` and `check:budgets` after each task. Report measured numbers, not impressions.
- Stay inside the rights gate. Anything gated goes through `RightsGate.allows()`.
- No lyric text from the internet, ever. No Arctic Monkeys names/data/quiz text in the output.
- No new dependencies unless a tiny devDependency is needed for an asset script; say so first.
- Work in order S1 -> S8. After each, give a 5-line summary and wait for "next" unless the human said "go through".

## S1 - Baseline
Run the project, `validate`, `check:budgets`. Open the HANDOFF extension points. Note any mismatch between HANDOFF and reality in `REQUESTS_FOR_CORE.md` instead of fixing core.

## S2 - Themes and switcher
Three themes using Opus's tokens (`styles/tokens.css`), each a CSS file with only token values + small overrides:
1. **Prologue** - soft pink, dreamy; headings in **Luxurious Script** (already in the kit, OFL). Colours drawn from the album cover feel: pale pink, grey-blue, silver star accents. Default lyric mode: font wipe.
2. **Link3** - cold teal/blue film look (reference: her 2025 tour poster in `assets/reference/sunniva/`). Headings in **cut-out magazine letters**; body in a tight condensed sans. Default lyric mode: magazine letters.
3. **Plain** - calm, readable, one condensed sans (Oswald or Barlow Condensed, OFL). Default lyric mode: font wipe in the plain font.
- A switcher (3 buttons) and a lyric-mode override (font / magazine). Persist with the storage wrapper. Apply theme before first paint (tiny inline script) to avoid a flash.
- Fonts: download only OFL fonts you need (e.g. Anton or Bebas Neue for poster text, Permanent Marker, Caveat, Ballet, Oswald), subset to Latin, woff2, `font-display: swap`, ship each `OFL.txt`. Load only the fonts of the active theme.
- Acceptance: switching themes costs no layout shift; each theme passes contrast checks; only the active theme's fonts are fetched.

## S3 - The room: collage, lights, film texture
- **Wall collage** from `assets/reference/room/vibe-board.jpg`: build a small cut-out pipeline script (e.g. rembg/Photopea instructions + a script that crops, trims, writes WebP with alpha). Rebuild the **text papers as live text** with OFL fonts (poster-style stacked caps, a script "2026" paper, hand-written notes), keep only the drawn/photo papers (wings, eyes, cat, meditating figure, "idgaf" photo) as images **if** the register allows; otherwise redraw as simple SVG. Each paper: slight rotation, paper texture, soft shadow, pinned with tape/pin. Keep <= 18 papers, images <= 30 KB each, wall total <= 250 KB. Some papers are **hotspots** that open modals (About, Quiz, Merch).
- **Light integration:** papers and dust brighten near the string lights using Opus's `LightRig` mask API; they sink into darkness elsewhere. No more than 2-3 blend-mode layers.
- **Procedural film texture** (3 variants, from the reference images in `assets/reference/film-texture/` - do not ship those images): (a) `scratches` (vertical scratches + dust + hairs), (b) `soft-dust` (faint fibres, vignette, smudges), (c) `frames` (light-leak rectangles + thin frame lines). Generate **once** into a single canvas with a seeded RNG (crisp at any DPR, size capped), grain via a tiny noise tile, drawn with `screen`/alpha, `pointer-events:none`, redraw only on resize (debounced). No animated filters. Intensity slider in dev only; theme picks the variant: Prologue = soft-dust, Link3 = scratches, Plain = very faint. Reduced motion: static.
- Acceptance: scene idle CPU ~0, LCP unchanged within budget, texture invisible to screen readers.

## S4 - MagazineRenderer (cut-out letters)
Implement `LyricRenderer` as `MagazineRenderer`, same appear/disappear feel as the font renderer, using the letter scans from `reference/arctic-monkeys-archive/arctic-monkeys/assets/letters/{cut,mono,news,press,warm}/a-z.webp` (and the logic idea of `ransom()` in `collage.js`):
- Copy the scans into `assets/letters/` (register entry!), pack them into **one sprite atlas** (one request) + a JSON map. Prefer the cold alphabets (`mono`, `news`) for the Link3 theme.
- **Only a-z exist.** Digits and punctuation need fallback glyphs: render them as small paper strips with a typewriter OFL font (e.g. Special Elite) so a title like "20" or "It's Obvious" works. Handle upper/lower case, apostrophes, `?`, `!`, `,`, `.`, `-`, `(`, `)`, `&`.
- Per line: at most ~40 letter nodes, **reuse nodes** between lines, two lines on screen at most. Appear: letters "stick" one by one with a small random rotation/offset (deterministic per word); disappear: they peel/fade away. Only `transform`/`opacity`. Timing follows `setLine({startSec,endSec})`.
- Accessibility: letters `aria-hidden`, real text in a visually hidden element with `aria-label`; reduced motion = simple fade of the whole line.
- Same renderer is used for **headings** (`ransom(el, text)` style helper) in the Link3 theme.
- Acceptance: a fixture line is fully legible at 360 px width; no more than 1 network request for all letters; 60 fps while animating on the test phone (report).

## S5 - Four receipts
Four receipts from `data/receipts.json`: **Fantasy Prologue (17 rows)**, **Singles (7)**, **Durocher Demos (8)**, **Appearances (1)**. **Start from `extract/receipt/`** (read `README_RECEIPT.md` first): `receipt.js` is the original mechanism, `sunniva-receipts.js` already adapts the data and wording, `test/receipt-markup.test.mjs` passes. Copy what you need into `features/receipts/` (do not edit the reference copy), keep `receipt.js` logic intact unless you must, and re-run the test after changes. The frames pipeline is in `extract/receipt/tools/crumple/`.
- Receipt face: release title, date, rows `NN  TITLE ........ m:ss`, a generated barcode and total line (e.g. total running time), small print. **No cover art, no lyrics, no AM wording.** Singles that also exist on the album get a small mark ("also on the album"). Collab credits shown as in the data.
- Opening animation: unfold from a crumpled sheet. Preferred: reuse the pipeline in `tools/crumple/` (needs `three` + `playwright` at **build time only**, produces WebP frames); store frames in `assets/crumple/<id>/`, lazy-load them only when the receipt scrolls into view, <= 10 stages, shared crop box. If the pipeline is too heavy for this project, fall back to a **CSS-only unfold** (clip-path/skew, 3-4 steps) - say which you chose and why.
- Short receipts (appearances: 1 row) may use a different paper format (ticket stub / slip) with the same animation.
- Each row is a button (keyboard + touch) that opens the track modal. Receipts open from the room (hotspots or a "discography" paper) inside the receipt modal.
- Acceptance: receipt frames never load on first paint; rows are accessible; counts match data exactly (17/7/8/1).

## S6 - Track modal content
Fill the shell Opus built: title, release + date, duration, track number, collaborator credits (from data, as Apple writes them), "also on the album" note, links to Apple Music (always) and Bandcamp (only where verified), 30-second preview with the lyric region (renderer chosen by theme + override), guitar + lights reacting. If lyrics are not permitted: a friendly line "Lyrics are not shown in this preview" (no text, no leakage in the DOM). If no beats file: idle sway. Cover art only through `RightsGate` and after a user action. Previous/next track within the same receipt.
- **Bandcamp facade:** a "Listen on Bandcamp" button that loads the official embed `<iframe>` only on click. You need her numeric album/track ids: use TinyFish on the public release pages (read-only), log in `data/facts/verification.json`. If an id cannot be found, show a plain link.
- Acceptance: closing the modal stops audio and animations; Back button closes it; focus returns to the row.

## S7 - About, Quiz, merch, links
- **About** (modal): short, warm, based only on **verified** facts in `data/facts/artist.json` (verify first - see `data/facts/verification-todo.md`, use TinyFish, public pages only). No age, no follower numbers, no private details. Links: her site, Bandcamp, Apple Music, Spotify, YouTube, link3. A line making clear this is an unofficial preview made by a fan/developer for her to review.
- **Quiz** (modal): 8-10 questions from public facts (release names and order, dates, number of tracks, collaborators, what is a feature vs a single). `data/quiz.json` with `source` and `verified`. One question at a time, the right answer always shown, review mode, best score in localStorage (safe wrapper). Pattern: `quiz.js` of the reference (new content, no AM text). No lyric questions.
- **Merch / CD block:** the CD is hand-made, signed, limited, with a lyric booklet, said to be sold out with a new batch coming - **verify first**, then show a friendly block linking to her Bandcamp. Do not show prices unless verified.
- **Tours/streams:** a small "where to find her live" line linking to her Instagram/Twitch/YouTube - no copied schedules unless verified and current.
- Acceptance: every fact on screen traces to a verified entry.

## S8 - Polish and final checks
- Visual pass on 360x640, 390x844, 768x1024, 1440x900: spacing, tap targets >= 44 px, no horizontal scroll, safe-area insets, bright-screen readability.
- Run: `validate`, `check:budgets`, Lighthouse mobile, reduced motion, no-localStorage, no-WebGL (DOM fallback), `build:public` dry run - must contain **no** gated assets, no lyrics, no cover art, no photos of her.
- Update `ASSET_REGISTER.md` completely (every asset you added or generated) and add a **"Public readiness" section**: what must be replaced or permitted before `PUBLIC_BUILD=1`.
- Final report: numbers vs budgets, what is placeholder, what needs her permission, open risks.

## Definition of done for Stage 2
1. All four receipts, the track modal, About, Quiz, merch block, 3 themes + switcher, both lyric modes, wall collage, film texture - working on phone and desktop.
2. Budgets and accessibility checks pass; numbers reported.
3. Public build is clean; register complete.
4. No change to `core/` or `vendor/` (or each change is a logged request).
