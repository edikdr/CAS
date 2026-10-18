# Contracts — core ↔ UI (frozen)

The block between the two rules below is copied **verbatim** from `TZ-opus-5.5-core.md` §10
(identical to Appendix A of the Sonnet TZ). Core implements every item. After it come
**core notes**: facts about the implementation the UI may rely on (they add detail, they do
not change the contract).

---

## 10. Frozen contract (identical copy = Appendix A of the Sonnet TZ; do not deviate)
You implement every item below. Copy this block verbatim to `docs/contracts.md` and put the final `index.html` skeleton exactly as in A.2 (Sonnet will rely on it).

### A.1 Globals and state
- `window.SD` is the only global. `await SD.ready` resolves after the JSON data is loaded and core is initialised.
- `<html>` attributes (set by core): `lang="en|es|ca"` (+ `data-lang`), `data-player="idle|playing|paused"`, `data-modal="open|closed"`, `data-act="0|1|2|3"` (3 = after the video).
- CSS custom properties on `:root` (set by core): `--p` (0–1), `--act`, `--scrim` (0–1), `--sbw` (scrollbar width, only while a modal is open).
- z-index tokens (in `tokens.css`): `--z-stage:0; --z-content:10; --z-island:60; --z-modal:80`.

### A.2 HTML skeleton (ids, `data-*` hooks and ARIA roles are FIXED; the UI may restyle everything and add inner markup)
```html
<a class="skip" href="#main" data-i18n="core.skip">Skip to content</a>
<nav id="lang-switch" class="lang" aria-label="Language" data-i18n-attr="aria-label:core.lang.label">
  <button type="button" data-lang-set="en" lang="en" aria-pressed="true">EN</button>
  <button type="button" data-lang-set="es" lang="es" aria-pressed="false">ES</button>
  <button type="button" data-lang-set="ca" lang="ca" aria-pressed="false">CA</button>
</nav>
<div id="story" data-story>
  <div class="story__stage" data-story-stage>
    <video id="story-video" muted playsinline preload="none" disablepictureinpicture aria-hidden="true"></video>
    <div class="story__scrim" data-story-scrim></div>
  </div>
</div>
<main id="main">
  <section id="intro" data-act="0"></section>
  <section id="chronology" data-act="1"></section>
  <section id="plaza" data-act="2"></section>
  <section id="discography"></section>
  <section id="links"></section>
  <section id="quiz"></section>
</main>
<footer id="footer"></footer>

<aside id="island" class="island" role="region" aria-label="Now playing" hidden>
  <button class="island__open" data-island-open type="button" aria-label="Open lyrics">
    <img class="island__cover" id="island-cover" alt="" width="32" height="32">
    <span class="island__text"><span class="island__title" id="island-title"></span><span class="island__artist" id="island-artist"></span></span>
    <span class="island__eq" aria-hidden="true"><i></i><i></i><i></i></span>
  </button>
  <button class="island__toggle" data-player-toggle type="button" aria-label="Pause"></button>
  <button class="island__stop" data-player-stop type="button" aria-label="Stop and close player"></button>
</aside>

<div id="lyrics-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="lm-title" hidden>
  <div class="modal__backdrop" data-modal-close></div>
  <div class="modal__panel" tabindex="-1">
    <header class="modal__bar">
      <button class="modal__close" data-modal-close type="button" aria-label="Close lyrics, music keeps playing"></button>
      <img class="modal__cover" id="lm-cover" alt="" width="48" height="48">
      <div class="modal__meta"><h2 id="lm-title"></h2><p id="lm-artist"></p></div>
      <button class="modal__toggle" data-player-toggle type="button" aria-label="Pause"></button>
    </header>
    <div id="lyrics-stage" class="lyrics-stage"></div>
    <div class="modal__progress" role="progressbar" aria-label="Preview progress" aria-valuemin="0" aria-valuemax="30"><span id="lm-progress"></span></div>
  </div>
</div>
```
**i18n hooks**: static text uses `data-i18n="<key>"` (replaces `textContent`), attributes use `data-i18n-attr="aria-label:<key>;title:<key>"`, parameters use `data-i18n-params='{"n":5}'`. All English text/aria-labels in the skeleton are only no-JS fallbacks; core re-applies every binding on `i18n:change`. Language buttons `[data-lang-set]` are bound by core (it sets `aria-pressed`).

Core binds by hooks only: `[data-player-toggle]`, `[data-player-stop]`, `[data-modal-close]`, `[data-island-open]`, `[data-play-track="<id>"]` (any element with this attribute plays/toggles that track on click — UI uses it for track rows), `[data-lyrics-open="<id>"]` (opens the lyrics modal for that track). Core sets `aria-label` text and `aria-pressed`/`aria-disabled` on these; icons are drawn by CSS from `html[data-player]`.
Core also sets the class `.is-playing` on the active `[data-play-track]` element (and on its nearest `[data-track-row]` ancestor if present) and keeps `--prog` (0–1) updated on `#island` and `#lyrics-modal` from the preview's current time.

### A.3 JS API (all methods exist from day one; core is the only implementer)
```
SD.player   play(id) · pause() · toggle(id?) · stop() · current → track|null · state 'idle'|'playing'|'paused' · currentTime · duration · on(evt, cb)
SD.lyrics   open(id?) · close() · isOpen · hasLyrics(id)      // open(id) starts that track if it is not the current one
SD.modal    open(elOrId, {returnFocus}) · close() · isOpen     // generic, one at a time (see core §6A)
SD.story    p · act
SD.i18n     lang · languages · t(key, params?) · tx(value) · setLang(code) · fmtDate(iso, opts?)
            // t(): plural-aware — if the string entry is {one, other} and params.n exists it picks the form with Intl.PluralRules(lang); missing key → English → the key itself (and a console.warn in dev)
            // tx(): resolves a data value that is either a plain string or {en,es,ca} (fallback en)
Events (dispatched on `document` as CustomEvent): player:change {track,state} · player:time {t,d} (≤ 4/s) · lyrics:open · lyrics:close · modal:open · modal:close · story:progress {p,act} · i18n:change {lang}
```
Rules: `close()` of the lyrics modal NEVER stops audio. The island is visible iff `player.state !== 'idle'` and no modal is open. A preview that reaches its end → state `idle`.

### A.4 Data (generated by core; UI treats as read-only; `SD.data.*` and `/data/*.json`)
```
tracks.json   [{ id, title, artists[], artistLine, releaseId, releaseTitle, trackNumber, year, date:"YYYY-MM-DD",
                 audio, cover, cover800, appleUrl, hasLyrics:boolean, previewSeconds:30 }]
releases.json [{ id, title, type:"album"|"ep"|"single", date, year, trackIds[], cover, cover800, artistLine }]
timeline.json [{ id, date:"YYYY-MM-DD"|"YYYY", year, kind:"album"|"ep"|"single"|"fact", title, text?, releaseId?, verified:boolean }]
              // title/text: string (proper nouns, release titles) OR {en,es,ca}; resolve with SD.i18n.tx()
quiz.json     [{ id, question:{en,es,ca}, options:[4 language-neutral strings (titles, years, names)], answerIndex, explain?:{en,es,ca} }]
String files  site/i18n/core.{en,es,ca}.json (Opus) · site/i18n/ui.{en,es,ca}.json (Sonnet): flat objects  "key": "text" | {"one":"…","other":"…"}, placeholders as {n}, {title}
site.config.json  (see core TZ §9)
```
### A.5 CSS tokens (in `src/css/tokens.css`, core-owned)
`--c-night:#0a1633; --c-navy:#10285a; --c-cobalt:#17397d; --c-cream:#f2e6c9; --c-ochre:#f2a33a; --c-red:<artist red, eyedropped from inputs/refs>; --font-display:Anton, Impact, "Arial Narrow Bold", sans-serif; --font-body:system-ui, sans-serif;` plus spacing/radius/type scale and the z-index tokens above.

**Not allowed for Sonnet** (tell it in `docs/contracts.md`): touching `src/core/`, `vendor/`, `tools/`, generated `site/data/*`, `tokens.css`, `stage.css`, `baseline-ui.css`, or the engine.

---

## Core notes for the UI layer (Sonnet)

### Files you may NOT touch
`site/src/core/**`, `site/vendor/**`, `tools/**`, generated `site/data/*.json`, `site/src/css/tokens.css`,
`site/src/css/stage.css`, `site/src/css/baseline-ui.css`, `site/i18n/core.*.json`, the lyrics engine.
You own: `site/src/css/{sections,modal,island,lang}.css` (empty placeholders exist and are already linked
in `index.html`, after `baseline-ui.css`), `site/src/ui/**` (entry `src/ui/main.js` is already loaded as a
module after core), `site/i18n/ui.{en,es,ca}.json` (start as `{}`), and the inner markup of the
`<section>`s and `#footer`.

### Boot and globals
- `src/core/core.js` is a module listed before `src/ui/main.js`, so `window.SD` exists when your module
  runs. Always `await SD.ready` before reading `SD.data`.
- `SD.ready` **rejects** if config/data cannot be loaded (core then shows `core.error.data` in `#main`).
- Extra read-only members (not in the frozen contract, safe to use): `SD.config` (parsed
  `site.config.json`), `SD.data.build` (build manifest: `lyricsEngine`, `sfx`, counts), `SD.story.mode`
  (`'video'|'stills'`), `SD.story.velocity` (px/s), `SD.lyrics.engineKind` (`'vendor'|'core'|null`),
  `SD.perf.snapshot()`.
- `html[data-core="ready"|"error"]` is set when boot finishes. `html[data-motion="reduced"]` is set when
  the stage shows stills instead of scrubbing (reduced motion, reduced data, no playable video).
  `html[data-player-buffering]` is present while the preview is waiting for data.

### Story layout
- `#story` is out of flow (`position:absolute`, height `--story-length` = `story.scrollLengthVh` vh); the
  stage inside is `position:fixed` and stays as the dimmed end-frame background after p = 1.
- `#intro`, `#chronology`, `#plaza` get `min-height: --story-length × act span` from core
  (`--act-span-0..2` from `story.acts`), so together they span the scroll story and `#discography`
  begins as p reaches 1. Put act content inside them; do not change their `min-height` or `position`.
- Text cards over the video: the scrim (`--scrim`) is already dark in the grey daylight third; place
  body text on your own dark panels (≥ 4.5:1) anyway.
- `--grade` (0–0.22) is the warm overlay opacity at the start; read-only.

### Hooks core binds (event delegation — add/remove elements freely, core relabels new ones)
| Hook | Core does |
|---|---|
| `[data-play-track="<id>"]` | click → `SD.player.toggle(id)`; sets `aria-label` = `core.player.track` ("Play preview: {title}"), `aria-pressed` (on `<button>`/`[role=button]`), `.is-playing` on it and on the nearest `[data-track-row]` |
| `[data-lyrics-open="<id>"]` | click → `SD.lyrics.open(id)`; sets `aria-label`; `aria-disabled="true"` when the track has no lyrics (click then only announces "No lyrics for this preview") |
| `[data-player-toggle]` | toggles the current/last track; `aria-label` Play/Pause; `aria-disabled` before anything was played |
| `[data-player-stop]` | `SD.player.stop()` |
| `[data-modal-close]` | closes the open modal (only inside it) |
| `[data-island-open]` | `SD.lyrics.open()`; `aria-disabled` when `!hasLyrics` |
| `[data-lang-set]` | `SD.i18n.setLang()`; sets `aria-pressed` and `aria-label` (language name in its own language) |
| `[data-sd-notice]` | the unofficial notice. If `#footer` has none, core appends `<p class="sd-notice" data-sd-notice data-i18n="core.notice">` (and re-adds it if removed). Render your own element with this attribute + `data-i18n="core.notice"` to place it yourself. |

Use real `<button type="button">` elements for these hooks. Icons are yours to draw from
`html[data-player]`; the baseline draws plain CSS icons you may override.

### Owner requirement — lyrics modal over the video (do not undo)
The lyrics modal must **not** be an opaque block. Keep `.modal__panel` transparent and the backdrop light
so the scroll-story stage (video frame / end frame) stays visible behind the lyrics on every screen size;
`html[data-modal="open"]` already hides `#main`/`#footer`. Style the words, bar and progress on top of the
video (halo/shadow for legibility), not on a coloured card. See docs/decisions.md D-033.

### Modal / island behaviour you can design against
- Open: `hidden` removed → two frames later `.is-open` is added (animate on `.modal.is-open`). Close: `.is-open`
  removed → `hidden` set after your transition ends (core waits for `transitionend`, max 600 ms).
- Island: `hidden` removed → `.is-visible` added two frames later; reverse on hide. It never takes focus.
- While a modal is open: `html.sd-scroll-lock`, body is `position:fixed` at `top:-scrollY`, `--sbw` holds the
  scrollbar width (add it as right padding to your own fixed elements if you want zero shift).
  `#story #main #footer #island` are `inert`. `#lang-switch` is NOT inert and sits above the modal
  (`--z-lang: 90`) so the language can be switched with the lyrics open (pointer); keyboard focus stays
  trapped in the modal.
- Lyrics stage: the vendor engine (when present) or the core fallback renderer draws inside `#lyrics-stage`.
  Fallback markup: `ol.sd-lyr > li.sd-lyr__line(.is-current) > span.le-word(.is-sung)`; messages use
  `p.sd-lyr__msg`. Style them in `modal.css`; never put lyric text anywhere else.
- `--prog` (0–1) on `#island` and `#lyrics-modal` updates every frame while playing.

### Data notes
- `releases[].date` = the latest track date in that collection (a collection is complete only then).
- Albums (Funprint, Atzilut, La Epifanía) are **partial**: `trackIds.length` previews only. Always say
  "tracks with previews", never imply a complete tracklist.
- `releases[].artistLine` = the artists credited on every previewed track of the release.
- `timeline[]` entries with `verified:false` are owner-told facts → hide them until verified.
- Titles, names and lyrics are never translated (`tx()` only resolves `{en,es,ca}` objects).
- Covers: `cover` = 400 px WebP, `cover800` = 800 px WebP; lazy-load them (`loading="lazy"`, width/height set).

### i18n
- Keys in `ui.*.json` must start with `ui.`; `ui.meta.title` / `ui.meta.description`, if you define them,
  replace the core title/description.
- Run `node tools/check-i18n.mjs` (fails on missing keys, placeholder or plural-shape mismatch).
- Append your ES/CA strings to `docs/i18n-review.md` with `reviewed: false`.
