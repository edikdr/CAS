# Nori-Dex · Audit of the PokeLore frame (O1)

Scope: `src/` of pokelore-frame-7 (25 JS modules, 10 CSS files, 1.2 MB of generated data).
Baseline build checked: `npm i && npm run build` passes. First load ≈ **523 KB gzip** (JS data 329 + code 156 + CSS 33 + HTML 5) against a 250 KB budget.

## 1. Module map

| Layer | Files | Verdict |
|---|---|---|
| Boot / i18n | `js/i18n.js` (RU source, `_()`, `PL.L` document.write loader), `js/en/*` (24 dictionaries + 3 EN data overlays) | **Rewrite**: EN source, keep `_()`, drop loader and RU |
| Device | `index.html` console markup, `css/style.css`, `css/console3d.css` (Joy-Con shells, ABXY, sticks, shoulders) | **Rewrite** as Mana Communicator |
| Physicals | `js/cable.js` (Verlet rope, port magnet), `js/carts.js` (CSS-3D slices, drag/insert/eject), `js/motion.js`, `css/stage.css` | **Keep**, re-skin |
| Input / FX | `js/input.js` (keys, pointer, sticks, gamepad), `js/static.js` (canvas noise), `js/audio.js` (WebAudio, no files), `js/icons.js` | **Keep**, trim |
| App shell | `js/app.js` (1,853 lines: power, Joy-Con attach, skins, home, album, card modal, picker, scan, help) | **Keep ~30%**, rebuild state machine |
| Screens | `js/sections.js` + `css/sections.css` (8 Pokémon tabs on a reusable `Section` controller) | **Sonnet**: keep controller, replace builders |
| Quiz | `js/quiz.js` (typewriter, ▶ menu, hearts), `js/quiz-data.js`, `css/quiz.css` | Keep engine look; strip sprites and CDN |
| Photo | `js/shot.js` + lazy `js/shot-fonts.js` (182 KB) | Optional; keep as photo mode only if budget allows |

## 2. What to delete (verified)

Data: `data/meta.js`, `dex.js`, `types.js`, `world.js`, `data/tcg/*` (1.2 MB). Code: `js/tcg.js`, `cards.js`, `img.js`, `data.js` (also hosts `PL.fav`), `news.js`, `catcher.js`, `pixballs.js`, `mine.js`, `scan-img.js`, `scan-match.js`, `scan.js`, `lore-ru.js`, `lore-more.js`, all of `js/en/`. CSS: `cards.css`, `catcher.css`, `scan.css`. Scripts: `build-data.mjs`, `fetch-card-images.mjs`, `i18n-check.mjs` (replaced). Assets: `assets/cart/*.png`, `assets/cards/`, `assets/bg.jpg` + `assets/src/bg-original.jpg` (re-baked from studio art). Fonts: Cyrillic subsets, Press Start 2P. `_headers` → `vercel.json`. RU README.

Third-party hosts found: jsDelivr + raw.githubusercontent (quiz sprites, card data, Tesseract), images.pokemontcg.io, images.scrydex.com, api.tcgdex.net, GDELT, unpkg, plus `preconnect` tags injected by the build. All go.

## 3. Coupling points

**js/app.js** (case-insensitive hits): album 95, card 104, fav 46, scan 42, mine 28, tcg 18, quiz 18, catcher 8, news 7, `D.` (PL.data) 60.
- One state object `S` mixes device state (power, busy, view) with album state (spread, card, modal, picker). `setView()` and `updateAmbient()` call `PL.quiz/catcher/scan` unconditionally, so deleting a module crashes the shell.
- The `press` handler is a 100-line switch whose branches assume album/modal/picker exist.
- Hard-coded geometry: home tile scroll assumes a 768 px screen; `fit()` assumes 1200×818.
- Joy-Con choreography (`connectJoycons`, `swapSkin`, ghosts, seams) gates PLAY: `startPlay()` returns into `connectJoycons()` first.
- `PL.sections.setContext()` passes 9 callbacks, 5 of them album/scan/capture.
- Startup reads `D.totalCards`, `PL.mine`, `PL.shot` counts.

**js/sections.js**: dex 120, card 69, fav 32, shot 32, tcg 22, mine 17, news 10. Builders reach straight into `PL.data`, `PL.world`, `PL.regionsRu`, `PL.gameTypes`. The reusable part is clean: `Section` (grid nav by geometry, sheet, hints, `press()`), `navMove`, `ensureVisible`, and the `mount(id, root)` registry. That registry is the seam Sonnet plugs into.

**Elsewhere**: `carts.js` facts and labels read Pokémon data, and its keydown guards call `PL.catcher`. `quiz.js` fetches sprites from two CDNs. `input.js` and `carts.js` hard-code the Joy-Con button vocabulary (`data-btn="x|y|l|r|ls|rs"`).

## 4. build.mjs gotchas

1. It **refuses to build** unless `index.html`'s `<script src>` list plus `PL.L(...)` calls equal `DATA + CORE` exactly. Add or remove a module in both, in the same commit.
2. Bundles are named `app.<lang>.min.js?v=hash`, not hashed filenames. HTML loads them through an **inline `document.write`** loader, which breaks a strict CSP.
3. The EN bundle is built by *prepending* dictionaries and *swapping* files through `OVERLAY`; a missing `js/en/<x>.js` silently ships Russian.
4. It injects `preconnect` to jsDelivr/pokemontcg into `<head>`. These are third-party connections even when unused.
5. Only `assets/src` is excluded from the copy; anything else in `assets/` ships, and nothing checks image size, format or missing files.
6. CSS order is `<link>` order. `csso` runs with `restructure:false`, so duplicate rules survive.
7. No gate on brand terms, Cyrillic, third-party URLs or budgets; the report prints Russian units.

## 5. Proposed architecture

- **Stay vanilla + CSS 3D** (per brief). Same `PL.*` namespace and plain `<script>` order in `index.html`, so it still runs from `file://` during development.
- **One data file** `data/sky.js` (Sonnet) in the contract shape; WebP paths (`assets/nori/hud-zer.webp`). Until Sonnet lands, I ship a faithful stub from `seed.json`.
- **Cartridges are data** in `config.js`: `{ id, title, sub, opens, tab, plane, crystal, art }`. Four relics: Nori-Dex → `dex`, Worlds → `worlds`, Spirit Quiz → `spirit`, Join → `join`. Seating a relic boots its screen through `PL.sections.mount(opens, root)`. Ejecting returns to the relic altar.
- **Shell state machine** (app.js): `static → boot → altar (hub) → section`, plus `help`. Nothing else. Album, modal, scan, catcher and favorites are removed.
- **Screen contract**: a controller with `press(name) → bool`, `hints() → [[keys, label]]`, `scrollBy(d)`, `destroy()`. Context methods: `audio, toast, ambient(color), hints, eject, swap(id)`.
- **Two device layouts**: *wide* (1200×818 design px, 768×432 screen) and *tall* for phones (≈380×840, portrait screen). The screen is a CSS size container, so screens adapt with `@container`.
- **i18n rule**: a one-off codemod rewrites every kept `_('<Russian text>')` to `_('English')` from the `js/en` dictionaries. English is the source; `_()` returns `dict[key] || key`. Spanish = one `js/i18n/es.js` dictionary later. The build fails on any Cyrillic in `dist`.
- **Build**: one `js/app.<hash>.js` and one `css/app.<hash>.css`, no inline script, assets stamped `?v=<hash>`. Build gates: script list, brand regex, Cyrillic, URL allowlist (outbound links only), budgets, and that every `assets/` path referenced exists. `vercel.json` sets immutable caching and a strict CSP.
- **Perf**: every rAF loop (cable dangle, static noise, gamepad poll) stops when idle or hidden; `will-change` only while dragging; reduced-motion and Save-Data skip the intro and idle motion; the backdrop is baked by `bake-bg.py`.

## 6. Three riskiest parts

1. **Device re-skin + phone layout across three coupled systems.** CSS console geometry, `carts.js` slot/seat constants and `cable.js` port tracking all assume one 1200×818 layout and one `PL.scale`. A portrait layout means a second geometry. If it drifts, drag targets, the seat offset or the plug magnet misalign. *Mitigation*: one geometry source, rack scale factored into pointer math, and a scripted headless drag/insert/eject test in both layouts.
2. **Decoupling app.js without tests.** Removed modules are referenced from shared paths (`setView`, `updateAmbient`, `press`, startup), so a missed reference becomes a runtime crash that the build cannot see. *Mitigation*: rebuild the shell around four views, and run a headless Chromium smoke test (zero console errors, power-on → seat → screen → eject) after every step.
3. **Parallel ownership drift.** Sonnet's `sky.js`/`sections.js` arrive after my device work. Wrong ids, `.png` vs `.webp` paths, or a missing builder only show at runtime. *Mitigation*: stubs that match the contract exactly, build checks for asset paths and for `cart.opens` ⇒ builder, and HANDOFF.md as the single plug-in guide.

**Nothing found contradicts the brief.** Notes: the brief's §8 is absent (numbering jumps 7 → 9); seed art paths are `.png` while the budget requires WebP (resolved by the image pipeline + path rule); the original has no portrait layout (only a "rotate your phone" hint), so 360×800 support is new work, not a re-skin.
