# HANDOFF: Opus to Sonnet

Project root: `nori-dex/` (sources in `nori-dex/src/`). Build: `cd src && npm i && npm run build` writes `src/dist/`.
English only: no Russian anywhere. The build fails on any Cyrillic in `src/` or `dist/`.

## Change of plan (from the client, after the brief)

- **Three relics, not four**, styled after the reference renders (body style only: stone, brass, vines, glowing runes, a different tint per relic). Cover art is never copied from the renders.
  1. **The Sky Project**: label `assets/art/splash-with-logo-960.webp`; opens **Nori-Dex**; neutral stone, gold runes.
  2. **Celestia**: label `assets/shots/celestial-observatory-960.webp`; opens **Worlds at plane `p1`**; grey-blue stone, blue/green runes. The name is a working title, so the relic shows a **Placeholder** tag.
  3. **Abyssal Plane** (official name): no official art in the pack, so the label shows an intentional "Art pending" state. Opens **Worlds at plane `p4`**; rusty stone, red/orange runes.
- **Spirit Quiz** has no relic. It is a button inside the bestiary that opens the `spirit` screen.
- **Kickstarter, Steam, Discord and the countdown** live on the console home screen (the relic altar, `app.js`), not in a screen. There is no `join` screen any more.
- The relic title sits on a brass plaque under the label window and never covers the art.

## What Opus changed

| Step | Result |
|---|---|
| O1 | `docs/AUDIT.md` |
| O2 | Removed all Pokémon modules, data, scripts and third-party hosts. English became the source language (codemod). Studio art went in through `scripts/bake-images.py`. Added the build gates. `vercel.json` replaced `_headers`. Added stubs for your files. |
| O3 | Built the Mana Communicator device (`index.html`, `css/console3d.css`, `js/device.js`). Built the three relics (`js/carts.js`, `css/stage.css`). Re-skinned the cable as the mana conduit (`js/cable.js`). Rebuilt the shell (`js/app.js`): attunement, altar and campaign, relic tabs, screen stack. Added the phone layout. Simplified input (no sticks; the gamepad is polled only while connected). |
| O3.1 | **Interchangeable grips** (client request). The device is split into body + two grips (`.wing--l`, `.wing--r`) that slide on rails. Four sets in `config.grips` (Halo & Sky, Grove, Ember, Nightglass); pick one under the device, with `G`, or with the altar's Grips button. Swap animation: the old grips unlatch, slide off the rails and fly away, the new ones fly in, slide on and click (seam flash + sound). It works with the device off too. Grip colours are CSS variables (`--gh --gm --gl --gt`) set per wing; the wing art in `device.js` reads them. Buttons got more depth: knurled brass studs with a dome and travel, prong-set gems with facets, an engraved rune compass. |
| O4 | Re-voiced audio (`js/audio.js`): stone, brass and crystal-chime voices through a generated reverb, a mana hum while powered, a per-relic attunement chord (`config.carts[].chord`). The sound preference is stored in `localStorage['nd-audio']`. All sounds are synthesised; no audio files. |
| O5 | Performance and hosting (`docs/PERF.md`). Lighthouse mobile 68 → 86, accessibility, best practices and SEO 100; desktop 100 on all four. Fixed main-thread work at idle (hidden-view animations, a `box-shadow` loop, an unlayered hint, per-frame layout reads, the first `Intl` call). Added low-power mode (`?lite=1`, auto on Save-Data or 2 GB devices). The relic readout updates on a `change` event instead of a timer. Checked the strict CSP through a full flow with the real headers (0 violations) and a clean `npm ci` build. Added `npm run serve` (dist with production headers). |

## The i18n rule

- English is the source language. Wrap every user-visible string: `_('Seat a relic')`. The English text is the key.
- Placeholders: `_('{n} days left', { n: 5 })`. Plurals: `_n(n, 'Nori|Noris')` returns the form without the number.
- Spanish later = one file `js/i18n/es.js` containing `PL.i18n.add('es', { 'Seat a relic': '…' })`. Add it to `index.html` and to `CORE` in `scripts/build.mjs`, right after `js/i18n.js`.
- Never build strings by concatenating translated fragments. Use placeholders instead.
- Data text in `data/sky.js` (names, appearance) is not wrapped. A future Spanish build would need a translated `sky.js`.

## How you plug in (you own these files)

**`data/sky.js`** is currently a stub transcribed 1:1 from `docs/studio-pack/seed.json` in the contract shape. Rules:
- Image paths must point to the WebP files in `assets/` (for example `assets/nori/hud-zer.webp`), not the `.png` in the seed. The build fails on a missing path.
- Always write full literal asset paths. The build stamps and checks only literal `assets/...` strings.
- `verified:false`, `nameStatus:'working'` and `artStatus:'unverified'|'pending'` must render a Placeholder tag (class `.ph-tag` exists in `css/sections.css`).
- `snapshot` is a playtest HUD reading. Label it "Playtest snapshot", never "base stats".
- Keep the file under 20 KB. The build fails above that.
- Prefer the `-960` WebP variants for screen art (`assets/art/*-960.webp`, `assets/shots/*-960.webp`): half the bytes of the full-size files and sharp at screen size. `sky.js` currently points the Noreth and Celestia planes at the full-size shots.

**`js/sections.js`** (+ `css/sections.css`) uses this contract, which `app.js` relies on:

```
PL.sections.mount(id, root, opts) -> controller      ids: 'dex' | 'worlds' | 'spirit'
  opts.tab   : sub-view to open at. Worlds receives 'p1' (Celestia relic) or 'p4' (Abyssal relic)
  opts.relic : id of the seated relic
controller.press(name) -> true if handled            names: up down left right a b y l r home
controller.hints()     -> [[['a'], 'Open'], ...]     keys: a b l r up down plus y home
controller.scrollBy({x, y}), controller.destroy()
PL.sections.setContext(ctx): ctx.audio(name), ctx.toast(msg), ctx.ambient(color|null), ctx.hints(),
                             ctx.eject(), ctx.swap(relicId), ctx.go(screenId, tab), ctx.back()
```

- Return `false` from `press` for anything you do not handle. Then the app handles it: `l`/`r` swap relics, `b` goes back from a sub-screen or draws the relic out, `home` returns to the altar.
- The bestiary must keep a **Spirit Quiz** button that calls `ctx.go('spirit')`. B returns to the bestiary automatically (the app keeps the stack).
- The `Section` controller (geometric grid navigation, detail sheet, hints) is kept from the original. The three builders are deliberately plain stubs. Replace them.

**Spirit Quiz**: use the dialog kit in `js/quiz.js` (brand-free typewriter and ▶ menu):

```
var d = PL.quiz.dialog(hostEl, { accent: '#E8B93A', onHints: ctx.hints });
d.say(['Page one.', 'Page two.'], 'Speaker').then(() => d.ask(['A', 'B', 'C'])).then(i => …);
d.press(name) / d.hints() / d.destroy()
```

`js/quiz-data.js` is yours (an empty stub now). The stub `spirit` screen shows how to wire the kit.

**Screen sizes**: the screen is a CSS size container named `screen`.
- Desktop: **768 × 432**. Phone (portrait): **368 × 404**.
- Use `@container screen (max-width: 480px) { … }` for the phone.
- On the phone, `44 CSS px ≈ 50 design px`. Make touch targets at least 50 px there.
- The screen frame gives you `top: 44px` (48 on phone) to `bottom: 34px` (32 on phone) inside `#sectionScroll`.

**Do not**: fetch anything, add dependencies, reference `assets/src/` (originals, not shipped) or anything from `reference/`, or state facts outside the ground-truth table.

## Files Opus owns (ask, or make the smallest change and note it here)

`index.html`, `css/style.css`, `css/console3d.css`, `css/stage.css`, `js/app.js`, `js/device.js`, `js/carts.js`, `js/cable.js`, `js/audio.js`, `js/input.js`, `js/static.js`, `js/config.js`, `js/quiz.js` (the dialog kit: extend it, keep its API), `scripts/*`, `vercel.json`.

Keys the app already uses (do not reuse them in a screen): `P` power, `G` grips, `C` photo, `Y` glass effect, `Q`/`E` neighbouring relic, `1`-`3` pick a relic, `H` home, `+` / `?` help, `-` / `M` sound on/off, `[` / `]` volume. A screen gets `l`/`r`/`y`/`home` through `press()` first and may claim them; the rest never reach it.

## What is stubbed

- `data/sky.js`: seed values only.
- `js/sections.js` / `css/sections.css`: plain bestiary (with the Spirit Quiz button and the Kael hero tile), Worlds list (opens at the relic's plane), Spirit Quiz placeholder.
- `js/quiz-data.js`: empty.
- Photo mode (`C` key or the camera stud) works but is basic: a JPEG download of the screen.

## Placeholders and items still needed from the studio

Steam URL, Discord invite (both render "link pending"), transparent vector logo (the crest sits on a pale plate to blend the logo crop), real Nori sprites, alternate-palette art, official plane names (Celestia, Noreth and Infernia are working titles), type names (Type I to VI are generic), and official art for the Abyssal Plane.

## Notes and deliberate alternatives

- The reference renders are notched rectangles. Per the brief, the relics keep an **arched relic-slab silhouette** and borrow only the materials (stone, brass, vines, glowing runes, tints), as the client asked.
- All device ornament (filigree, runes, crystals) is procedural CSS/SVG UI chrome. No illustration or game imagery is generated; every picture of the game world is official art.
- **Grips, not Joy-Cons.** The client asked for interchangeable Joy-Cons with a Nintendo-style switching animation. The behaviour is built as asked (two halves, rail slide-off, fly-in, click), but the grips are drawn in the device's own shape and are never called Joy-Cons, because the brief forbids any Nintendo or Joy-Con look and the build's brand gate rejects the name. The client was told this and can ask for the literal look.
- Landscape phones get the desktop layout at a small scale. The phone layout targets portrait (360 × 800 passes).
- Credits (Soundtrack, Cinematics) are in the Controls help panel. The game and studio social links exist in `sky.links` but are not shown yet. Sonnet may surface them in a screen.
