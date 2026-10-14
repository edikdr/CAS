# CONTRACT - read this first, every session

Shared rules for every AI session (Opus stage and Sonnet stage). If a task conflicts with this file, stop and ask.

## 1. What we are building
A **private preview website** for the singer-songwriter **sunniva** (Montreal; sings in link3). It is a pitch: she will see it first and decide whether to collaborate or buy it. It must feel like a **cozy dark room lit by string lights** (guitar in the middle, paper collage on the wall, film grain). Content: short About, fan quiz, discography as **4 receipts** (album, singles, demos, appearances), each receipt row opens a **track modal** with info, a 30-second preview, and synced lyrics via a lyrics engine (two visual modes), plus the guitar and lights reacting to the music.

Nothing goes public until she says yes. Build for a private link first, public later (see Rights gate).

## 2. Hard constraints
- **Stack:** vanilla HTML, CSS and ES modules. No framework. No runtime bundler. Static output, deployed on Vercel. Node is allowed for tooling only (validators, asset scripts, budget checks), as devDependencies.
- **Three.js:** vendored in the repo at a pinned version (no CDN), loaded with dynamic `import()` **only** on the desktop WebGL path. Mobile never downloads it.
- **No third-party requests on page load.** Fonts and libraries are self-hosted. These load **only after an explicit user action** (click/tap): Apple preview audio, Apple artwork, the Bandcamp iframe. (Reason: GDPR - the owner is in Germany - and speed.)
- **No analytics, no cookies.** `localStorage` only through one safe wrapper (try/catch, works when blocked) for: theme, lyric mode, lights on/off, motion on/off, guitar mode, preview volume, quiz bests.
- **Language:** code, comments, commit messages and docs in English. Talk to the human in **Russian**, short and direct.
- **Fonts:** only SIL OFL fonts, with `OFL.txt` next to each font file, served as subset `.woff2`.

## 3. Rights gate (do not skip)
- `config/rights.json` lists every asset class with `cleared: true|false`. A `PUBLIC_BUILD=1` build **must strip** everything not cleared (code path + files). The private build may include uncleared items, but they are marked in `docs/ASSET_REGISTER.md`.
- **Lyrics:** the repository contains **no lyric text** unless `data/lyrics/<trackId>.json` exists with a `permission` field. `permission: "none"` or missing -> the UI shows no lyrics. The engine's default LRCLIB source is **disabled** (it has no license and leaks the visitor's IP to a third party).
- **Receipts:** titles, durations and numbers only. No cover art, no lyric fragments.
- **Private link protection:** `<meta name="robots" content="noindex,nofollow">`, `X-Robots-Tag: noindex` in `vercel.json`, an unguessable preview URL. A client-side password screen is only a courtesy, never call it security.
- **Her photos and the cover art:** private preview only, max 3-5 photos. The owner will ask her permission in the pitch email.
- **Never invent facts about her.** Show only facts that `data/facts/artist.json` marks verified (or that you verified and logged in `data/facts/verification.json` with URL + date).

## 4. Performance budgets (hard, tested)
| Metric | Budget |
|---|---|
| LCP (mid-range Android, throttled 4G) | <= 2.5 s |
| INP | <= 200 ms |
| CLS | <= 0.1 |
| Critical path transfer (HTML+CSS+JS+first image), gzip | <= 350 KB |
| Initial JS, gzip | <= 90 KB |
| Mobile (DOM guitar) total scene images | <= 300 KB, <= 8 layers, each <= 60 KB WebP |
| Desktop GLB | <= 2 MB, <= 30k triangles, <= 5 materials, textures <= 2048 px (WebP/KTX2) |
| Cover images (when allowed) | <= 100 KB WebP, lazy |
| Frame rate in the scene | 30-60 fps on a mid-range Android |
- Animate **only `transform` and `opacity`**. No animated `filter`, `box-shadow`, layout properties. `will-change` on <= 6 elements.
- One global `requestAnimationFrame` loop. Pause it when the tab is hidden, the scene is off-screen, or nothing moves. Render WebGL on demand.
- `<audio>` uses `preload="none"`. Audio starts only on a user gesture. One `<audio>` element for the whole site.
- Lazy-load receipt frames and modal content when needed.

## 5. Accessibility
- Modals are native `<dialog>`: Esc closes, focus is trapped and restored, the phone's Back button closes the modal (history state), audio stops on close.
- `prefers-reduced-motion`: no strings animation, no flicker, no letter-by-letter effects - plain fades only.
- Decorative letter images (magazine letters) are `aria-hidden`; the real text is available through `aria-label`/visually-hidden text.
- Text contrast >= 4.5:1 outside lit areas as well. Lyrics must be readable on a bright phone screen and in a dark room.
- Everything works with touch only. A visible "lights off/on" control and a "motion off" control.

## 6. Folder ownership
```
core/        Opus owns: data store, BeatClock, PreviewPlayer, GuitarStage (DOM + GL), ModalManager,
             LyricRenderer interface + font renderer, rights gate, storage wrapper, light rig.
             Sonnet must NOT edit core/. Need a change? write it into REQUESTS_FOR_CORE.md.
features/    Sonnet owns: receipts, track-modal content, about, quiz, merch block, style switcher.
styles/      shared; tokens come from Opus, themes from Sonnet.
content/     copy text; Sonnet owns.
data/        generated + curated JSON. Schemas in docs/DATA_SCHEMA.md. Validate with the validator.
vendor/      third-party code, NEVER edited (lyrics-engine, three).
extract/     reference copy of the receipt mechanism (adapted, tested). Stage 2 COPIES what it needs into features/receipts/; never edit in place.
tools/       scripts (Node/Python). Never shipped to the site.
```

## 7. Public interfaces (names are fixed - other code depends on them)
- `DataStore`: `await load()`, `release(id)`, `track(id)`, `receipts()`, `beats(trackId)` (null if missing), `lyrics(trackId)` (null unless permission allows in this build), `facts()`.
- `PreviewPlayer`: `play(trackId)`, `pause()`, `seek(sec)`, `currentTime()`, `isPlaying()`, events `play|pause|ended|timeupdate|error`. Single `<audio>`.
- `BeatClock`: subscribes to PreviewPlayer, emits `beat(index)` and `onset({t, s})` from `data/beats/<id>.json`; handles seek, pause, loop, tab hidden. Setting `latencyOffsetMs` (default 0).
- `GuitarStage`: `mount(el)`, `pluck(strength, direction)`, `setMode('dom'|'gl')`, `flip()`, `destroy()`. Implementations: `DomGuitar`, `GlGuitar`. Chosen by capability check (pointer coarse, width, deviceMemory, saveData, WebGL ok) + manual toggle; GL failure falls back to DOM.
- `LightRig`: `setEnabled(bool)` (off = the garland is dark and the room keeps 25% of its light, `level`), `pulse(strength)`, positions of the lights in scene coordinates.
- `LyricRenderer` (interface): `mount(el)`, `setLine({text, startSec, endSec})`, `clear()`, `destroy()`. Implementations: `FontWipeRenderer` (Opus), `MagazineRenderer` (Sonnet). Selected by theme with a manual override.
- `ModalManager`: `open(kind, payload)`, `close()`; kinds: `about`, `quiz`, `receipt`, `track`, `merch`.
- `RightsGate`: `allows(className)`; every feature calls it before using a gated asset.

## 8. MCP and paid tools
- Allowed: **TinyFish** (read-only research, public pages; log source URL and date), **ElevenLabs** (speech-to-text for lyric timing, only when told), **Meshy** (3D from the guitar photos; costs credits).
- Before any paid call (Meshy, ElevenLabs, TinyFish runs): say in one line what you will run and why, and wait for "go" if it is more than a single call. Never loop calls.
- Do not scrape Instagram or any login-walled page. Public pages only. No automated bulk collection.
- Keys live in `.env` (gitignored). Never print or commit a key.
- Every external fact that enters `data/` carries `source` and `retrieved` fields.

## 9. Definition of done (for every milestone)
1. `npm run validate` (schemas for all JSON) passes.
2. `npm run check:budgets` passes (sizes) - script is built by Opus in M1.
3. Manual test list for the milestone passes on a real phone and a desktop browser.
4. `docs/ASSET_REGISTER.md` updated for any new asset.
5. The human gets a 5-line summary: what changed, how to try it, numbers measured, risks, next step.

## 10. Forbidden
- Editing `vendor/*` or `core/*` (Sonnet), rewriting architecture (Sonnet).
- Pulling any lyric text from the web into the repo. Publishing or committing music audio (previews, songs, stems). Exception, added at the owner's request: short interface sounds made for the site (`assets/sfx/`, rights class `uiSounds`, played with Web Audio).
- Using Instagram/Pinterest images as production assets without a register entry.
- Adding dependencies without asking (a tiny devDependency for tooling is fine if you say so).
- Anything that makes a network request on page load to a third party.
