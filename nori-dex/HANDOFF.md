# HANDOFF: Nori-Dex (Opus, then Sonnet, now the studio)

Project root: `nori-dex/` (sources in `nori-dex/src/`). Build: `cd src && npm i && npm run build` writes `src/dist/`. `npm test` runs the logic tests, `npm run serve` previews `dist/` with the production headers.
Read next to this file: `docs/HANDOVER.md` (studio guide: data, art, translations, Vercel), `docs/PERF.md` (measurements), `docs/AUDIT.md` (codebase audit from the start).
The interface language is English (source) and Spanish. No Russian anywhere: the build fails on any Cyrillic in `src/` or `dist/`.

## State of play

Three relics sit in the rack under the console. Seat one in the slot and its screen opens on the console.

| Relic | Opens | Notes |
|---|---|---|
| **The Sky Project** | **Nori-Dex**: Kael as the hero tile, the five Noris from the studio's screenshots, the Spirit Quiz tile, a card for each Nori | label: official splash art |
| **Celestia** | **Worlds** at plane 1 | a working title, so it carries a Placeholder tag |
| **Abyssal Plane** | **Worlds** at plane 4 | official name; no official art yet, so the label shows a clean "Art pending" state |

The **Join & follow hub** (Kickstarter, Steam wishlist, Steam playtest, Discord, the game's and the studio's social links, language, platforms, credits) opens from the first button of the altar's dock. The campaign panel with the countdown sits on the altar itself. The Spirit Quiz is a button inside the Nori-Dex.

## Phases

| Phase | Result |
|---|---|
| O1 to O6 (Opus) | Audit; Pokémon code and data removed; the Mana Communicator device (desktop and a phone model of its own); three relics; interchangeable grips; re-voiced audio; performance work and low-power mode; hosting; the studio handover guide. Details of the device are under "Notes" below. |
| Pre-checks (Sonnet) | 1. Countdown: it showed 20 days where 18 was right (25 Oct to 12 Nov 2026). It subtracted milliseconds, and 25 Oct 2026 is a 25-hour day in Europe, so the result fell on the wrong side of a rounding. It now counts calendar days with `Date.UTC` (`PL.hub.daysLeft`), shows "Last day" on 12 Nov and hides itself after. Tested in six time zones. 2. The cropped key-art letters showed through behind the info card and the rack: the backdrop is now `splash-clean` flattened on navy and dimmed (`scripts/bake-bg.py`). 3. Text on relic labels and the campaign line was too small on phones: floor of 11 real px (the phone block in `css/sections.css`, `--min-text`). 4. "ART PENDING" overlapped the runes: the empty state is now a stack (crystal, runes beside it, hairline, caption) in `carts.js`. |
| S1 | `data/sky.js` rebuilt as the data contract, with a `facts` block (every statement the screens make, with its source) and tests. |
| S2 | Nori-Dex screens: dex grid, hero tile, Nori cards with Regular / Alternate palette, a Fallen tracker (permadeath is a real game fact), a "nudge" on the portrait that makes the Nori answer with a line (one detail that makes people smile), the guardian caption on the tile of the Nori the quiz chose. |
| S3 | Worlds: the four planes as a vertical journey along a mana rail, with a "Look closer" sheet. |
| S4 | Spirit Quiz: three questions, four answers each, in a typewriter dialog; the five Noris light up as answers come in; a reveal; "Meet {name}" opens the card; the result is remembered. It matches by looks and mood and says so ("just for fun, not a game stat"). |
| S5 | Join & follow hub (review and polish of the Opus altar buttons): links, "link pending" states, countdown, platforms, credits, keyboard navigation row by row. |
| Phone console | The phone console got a symmetric deck: compass on the left grip, a matching dial of four buttons on the right, 44 px buttons with room between them. |
| Lobby | The relic altar in the studio's look: drifting sky (light shafts, clouds, gold halos), logo-style lettering, studio-style link icons. Everything animated is `transform` or `opacity`, paused for reduced motion and low-power mode. |
| Spanish | Second language, see "Languages". |
| S6, S7 | Copy pass (no unsourced claims, nothing about Kael's gender, plain words); responsive and accessibility pass (below). |

## What the Sonnet phase changed in files Opus owned

All changes are small or additive. Look at `git diff cd87ea0..HEAD -- nori-dex` for exact lines.

| File | Change |
|---|---|
| `index.html` | links `hub.css`, `lobby.css`; scripts `i18n/es.js`, `spirit.js`, `hub.js` |
| `scripts/build.mjs` | `CORE` lists the new scripts (same order as `index.html`) |
| `package.json`, `scripts/test.mjs` (new) | `npm test` |
| `scripts/bake-bg.py` | backdrop from `splash-clean` |
| `js/app.js` | delegates the hub (dock button, key swallowing while it is open, hints), campaign buttons through `PL.hub.linkHTML`, strings wrapped, credits moved from the Controls panel to the hub |
| `js/config.js` | dock starts with "Join & follow"; relic blurbs worded from the ground truth; cartridge label text wrapped for translation |
| `js/carts.js` | empty-state art, countdown through `PL.hub.daysLeft`, `change` event |
| `js/device.js` | phone console redesign (`L.tall`, `phoneArt()`, `dial()`), wing gradients get unique ids |
| `js/i18n.js` | `set()` (cleans `?lang=`), `current()`, `page()` for the static text of `index.html` |
| `css/style.css`, `css/console3d.css`, `css/stage.css` | phone console placements, text floor, hit areas |

Owned by Sonnet and now the studio's: `data/sky.js`, `js/sections.js`, `js/spirit.js`, `js/quiz-data.js`, `js/hub.js`, `css/sections.css`, `css/hub.css`, `css/lobby.css`, `js/i18n/es.js`. `js/quiz.js` (dialog kit) is Opus's and unchanged.

## Languages

- English is the source. Every user-visible string in code is wrapped: `_('Seat a relic')`. The English text is the key.
- Placeholders: `_('{n} days left', { n: 5 })`. Plurals: `_n(n, 'Nori|Noris')` returns the form without the number. Never build a sentence from translated fragments.
- Spanish is `js/i18n/es.js` (250 entries). It is listed in `index.html` and in `CORE` right after `js/i18n.js`. `PL.i18n.page()` at its end translates the static text of `index.html`.
- The language comes from `?lang=es`, then the saved choice (`localStorage['nd-lang']`), then the browser. A Spanish browser gets Spanish. The Join & follow panel has English / Español chips; choosing one saves it and reloads.
- `npm test` checks that every `_()` / `_n()` string in the code and every static string in `index.html` has a Spanish entry with the same `{placeholders}` and the same number of plural forms, that no entry is left unused, and that the quiz still fits the phone's dialog box (question ≤ 50 characters, answer ≤ 28). The tests fail loudly when someone adds an English string and forgets the Spanish one.
- Add another language: copy `es.js`, change the code, list it after `es.js` in `index.html` and `CORE`, and add the chip in `LANGS` (`js/hub.js`). The completeness test currently checks Spanish only; copy it for the new file.
- Data text in `data/sky.js` that a player reads (Kael's blurb, the Nori descriptions, the facts, the Abyssal Plane's name and blurb, type labels, credit roles) is wrapped too. Names are not.
- **The Spanish is ours, written for this project, informal "tú", Spain Spanish. The studio must review it before launch**, above all the game's own terms: "Soulbonded" (rendered "de alma enlazada"), "Celestial", "plane" (plano), "Lv / HP" (Nv. / PS), "Land of Noris" (Tierra de Noris, in the tagline only), "Nori" (invariable plural), "Fallen" (caídos), "relic" (reliquia), "grips" (mandos). Kael's role is "Protagonista" because the studio has not said anything about Kael's gender and Spanish forces a choice.

## How the screens work (contract kept stable)

```
PL.sections.mount(id, root, opts) -> controller      ids: 'dex' | 'worlds' | 'spirit'
  opts.tab   : sub-view to open at. Worlds receives 'p1' (Celestia relic) or 'p4' (Abyssal relic)
  opts.relic : id of the seated relic
controller.press(name) -> true if handled            names: up down left right a b y l r home
controller.hints()     -> [[['a'], 'Open'], ...]
controller.scrollBy({x, y}), controller.destroy()
PL.sections.setContext(ctx): ctx.audio(name), ctx.toast(msg), ctx.ambient(color|null), ctx.hints(),
                             ctx.eject(), ctx.swap(relicId), ctx.go(screenId, tab), ctx.back()
PL.sections.register(id, builder)   // spirit.js registers 'spirit'; sections.js registers 'dex' and 'worlds'
```

- A screen returns `false` for anything it does not handle; then the app handles it (`l`/`r` swap relics, `b` goes back or draws the relic out, `home` returns to the altar).
- Keys the app already uses (do not reuse them in a screen): `P` power, `G` grips, `C` photo, `Y` glass effect, `Q`/`E` neighbouring relic, `1`-`3` pick a relic, `H` home, `+` / `?` help, `-` / `M` sound, `[` / `]` volume. Inside a dialog the digits `1`-`4` pick an answer.
- Screen size: the screen is a CSS size container named `screen`. Desktop 768 × 432; phone 368 × 404. Use `@container screen (max-width: 480px)`. On a 360 px wide phone the stage scale is 0.87.
- `PL.hub` (`js/hub.js`): `daysLeft(endsOn, now)`, `fmtDate`, `fmtNum`, `linkHTML(url, opts)` (one link, or a disabled "link pending" button when the URL is `null`), `icon(name)`, `decorate(view)` (the lobby's sky), and the panel (`init`, `open`, `close`, `press`, `hints`, `isOpen`).
- Stored in `localStorage` (all optional, all wrapped in try/catch): `nd-fallen` (Noris marked as fallen), `nd-spirit` (the quiz result), `nd-lang`, `nd-audio`, `nd-glass`. Nothing leaves the browser. There is no analytics and no network call.

## Placeholders in the product (each is labelled on screen)

Nothing below is presented as fact. Each one shows a **Placeholder**, **Working title**, **Description pending**, **Art pending**, **Rare palette (demo)** or **link pending** label.

| Where | What is a placeholder | Becomes real when |
|---|---|---|
| Nori cards, "Type" | Six generic type slots (Type I to VI); no Nori has a type | the studio sends the type names and each Nori's type (`data/sky.js`: `types[].label`, `verified: true`, `noris[].type`) |
| Nori cards, "Playtest snapshot" | Level and HP are a reading from an early playtest save, labelled "Not base stats" | real stats exist, then remove `snapshot` |
| Nori cards, portrait | The HUD portrait stands in for the real sprite | the studio sends sprites (`art.regular`) |
| Nori cards, Alternate | A hue-shifted effect labelled "Rare palette (demo)", because no alternate art exists | the studio sends alternate-palette art (`art.alternate`) |
| Worlds, plane names | Celestia, Noreth, Infernia are working titles ("Working title"); only the Abyssal Plane's name is official | official names (`nameStatus: 'confirmed'`) |
| Worlds, plane art | Planes 1 and 2 use in-game screenshots ("Placeholder art"); planes 3 and 4 show "Art pending" | official art (`art`, `artStatus`) |
| Worlds, descriptions | Planes 1 to 3 have none ("Description pending"); plane 4 has the one line the ground truth supports | the studio writes them (`blurb`) |
| Celestia relic | The label is a screenshot and the relic says "Placeholder" | official Celestia art and name |
| Abyssal relic | "Art pending" window | official art, then `art`, `artSize`, `crop` in `js/config.js` |
| Join & follow | Steam wishlist, Steam playtest and Discord say "link pending" (their URL is `null`) | `links.steam`, `links.steamPlaytest`, `links.discord` |
| Crest | The logo sits on a pale plate because only a cropped raster logo exists | a transparent vector logo |

## Needed from the studio

1. **Steam store page URL** and a **Steam playtest URL** (or confirmation that the playtest uses the store page). Host `store.steampowered.com` is already allowed in `LINK_HOSTS`; a new host needs one line in `scripts/build.mjs`.
2. **Discord invite URL** (`discord.gg` is allowed).
3. **Transparent vector logo** (SVG or large PNG) to replace the plate behind the crest.
4. **Real Nori sprites** (idle poses) for the five Noris, and later all 200+.
5. **Alternate-palette art** for each Nori.
6. **Official plane names** for planes 1 to 3, a **description** for each plane, and **official art** for planes 1 to 4 (the Abyssal Plane first: its relic is waiting).
7. **The six type names**, and which type each Nori has.
8. **Review of the Spanish text** (see "Languages") and a decision on the game terms. If the studio has an official Spanish glossary, send it.
9. **Kael's gender**, only if the studio wants the copy to say "he" or "she"; until then the text avoids it.
10. **Confirmation of the Kickstarter facts at launch time**: the goal and "funded within hours" come from the ground truth; the campaign panel says "funded within hours" as a fact. If the studio prefers not to say it, delete it from `renderCampaign` in `js/app.js`.
11. A **real-device pass** on a mid-range Android phone (below).

## Acceptance checklist (brief section 10)

| Item | Result |
|---|---|
| Fresh `npm run build` succeeds; the site opens from `dist/` | Pass. `npm ci && npm run build` from a clean checkout; `npm run serve` for the production headers. |
| Zero third-party requests | Pass. 0 in every flow (desktop and phone, both languages); outbound links are plain `<a>` with `rel="noopener noreferrer"`. The build rejects any absolute URL outside `LINK_HOSTS`. |
| Brand sweep | Pass. The build gate finds no `pok[eé]|pikachu|arceus|joy-?con|tcg` in `src/` or `dist/` (one `tcg` appears by chance inside a base64 font string, which the gate skips). "Nintendo" appears only in the platform line: in `sky.js` and, because the Spanish dictionary repeats the line as key and translation, twice more in `es.js` (the build prints 6 mentions: three copies of "Nintendo Switch, Nintendo Switch 2"). |
| Every unverified item shows a Placeholder tag; nothing invented | Pass. See the table above. Every statement the screens make about the game lives in `sky.js` `facts` with its source. |
| Only official art ships | Pass. `dist/assets` holds the 20 WebP files baked from the studio pack; nothing from `reference/`. The relics' stone, brass and vines are drawn in SVG/CSS as UI chrome. |
| Usable at 360 × 800: 44 px targets, visible focus, reduced motion, keys | Pass. Every control is at least 44 CSS px (the phone's buttons are 44 px with a 58 px invisible hit disc; checked with a 44 px circle hit test); the focus ring is a 3 px gold outline everywhere; `prefers-reduced-motion` stops every loop; keys 1 to 3 and Enter work, and 1 to 4 pick quiz answers. |
| Dex list and card, Regular / Alternate, Worlds, Spirit Quiz, Join hub work | Pass, by keyboard, mouse and touch, in both languages. |
| Steam and Discord disabled while `null`; countdown hides itself after 12 Nov 2026 | Pass. Tested with a fixed "now" in six time zones. |
| New copy is English, short, warm | Pass, plus the Spanish. |
| sky.js under 20 KB; images under 250 KB; first load under 250 KB | Pass: 6.9 KB, 20 WebP files (largest under 250 KB), first load 76.7 KB gzip (html 2.8 + css 19.8 + js 54). |
| Lighthouse mobile: Performance 90+, Accessibility 95+ | **Accessibility 100, best practices 100, SEO 100: pass. Performance does not reach 90**: in this sandbox mobile is 75 to 80 (LCP 3.4 to 3.8 s, TBT 380 to 540 ms); the Opus build (`cd87ea0`) measured 75 to 80 in the same sandbox on the same day, so the Sonnet phase did not change it (Opus measured 86 in its own earlier sessions; the sandbox's speed varies). Desktop: 99 to 100. The cause is the first layout of the 3D console and the first script run; see `docs/PERF.md`. |
| Touch drag at 60 fps | Not measurable without a device. Test on a real phone. |

## How it was checked

- `npm test`: 21 checks, repeated in six time zones (Madrid, London, Los Angeles, Tokyo, Auckland, UTC): the countdown on 25 Oct 2026 and on DST days, the shape of `sky.js`, the quiz scoring for all 64 answer sets (every Nori can win; none wins more than 21 of 64), and the Spanish completeness checks.
- Headless Chromium runs, on desktop (1280 × 800) and phone (360 × 800, 390 × 844, 412 × 915, also 320 × 568, 768 × 1024, 844 × 390, 1024 × 600, 1440 × 900, 1920 × 1080): power, seating, swapping relics, dragging, grips, the dex by keyboard, cards, the quiz end to end, Worlds, the hub, the language chips. 0 console errors, 0 third-party requests, no horizontal scroll at any size. An automated scan finds no text below 11 real px in the screens, no control without an accessible name, no focusable element inside `aria-hidden`, no duplicate id, and the card dialog has a name.
- Not done: a real phone, a screen reader, Safari and Firefox. Chrome's engine only.

## Known limits

- **Landscape phones** get the desktop layout at about 0.45 scale (844 × 390). It works, but small. The phone layout targets portrait.
- **Performance on mid-range phones** is below the brief's 90 (see the checklist). Ideas, in order: a small same-origin script in `<head>` that sets `data-layout` and `--scale` before the first paint (removes the layout jump, so the console can show at once); splitting `app.js`'s start-up into chunks under 50 ms; building the three relic labels after the first paint.
- **Switching language reloads the page.** The device goes back to its off state.
- **Photo mode** (`C`) is a JPEG download of the screen, basic.
- Sprites: the five Noris use HUD portraits (they look soft when large).

## Notes and deliberate alternatives (from the Opus phase, still true)

- The reference renders are notched rectangles. Per the brief, the relics keep an **arched relic-slab silhouette** and borrow only the materials (stone, brass, vines, glowing runes, tints).
- All device ornament (filigree, runes, crystals) is procedural CSS/SVG UI chrome. No illustration or game imagery is generated; every picture of the game world is official art.
- **Grips, not Joy-Cons.** The client asked for interchangeable Joy-Cons with a Nintendo-style switching animation. The behaviour is built as asked (two halves, rail slide-off, fly-in, click), but the grips are drawn in the device's own shape and never called Joy-Cons, because the brief forbids any Nintendo or Joy-Con look and the build's brand gate rejects the name.
- **The phone is its own model**, not the desktop shrunk: a crown with the logo in an arched window, the crystal as its finial, power on the left shoulder and the socket on the right. The deck is mirrored around a brass spine: the compass on the left grip, a matching dial of four buttons on the right (Photo north, Select east, Back south, Altar west, on an engraved ring) and only Help on the spine. `device.js` `relocate()` moves Home, Help and Photo whenever the layout changes. Phone buttons have 44 px bodies with an invisible 58 px disc as the touch target (the brass ring is a `box-shadow`, so buttons look about 10 px bigger than they are); the compass petals get a larger hit area the same way. Do not cache a button's parent element. Phone body geometry lives in `L.tall` and `phoneArt()` in `device.js`; placements are in the tall block of `console3d.css`.
- The data contract's rules still hold: image paths are literal `assets/...` strings; `verified:false`, `nameStatus:'working'` and `artStatus:'unverified'|'pending'` render a Placeholder label; `snapshot` is a playtest reading, never "base stats"; keep `sky.js` under 20 KB.
- **Platforms**: the ground truth lists Steam (public playtest live), Nintendo Switch and Nintendo Switch 2. They appear once, as plain text worded as the studio words them. No logos, nothing that makes the device read as that hardware.
- **Do not**: fetch anything, add dependencies, reference `assets/src/` (originals, not shipped) or `reference/`, or state facts outside the ground-truth table.
