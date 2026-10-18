# Sam Davies — scroll-story fan concept (handoff)

An **unofficial fan concept by EdU**: a single-page scroll story through Barcelona's Gothic Quarter
(daylight alley → blue hour → night in Plaça Reial), then the discography with 30-second previews and
lyrics, links, and a quiz. Trilingual: English, Spanish, Catalan. Not affiliated with the artist; `noindex`
until the owner flips it.

- Static site in `site/` — vanilla ES modules, **no runtime dependencies, no build step**.
- Dev-only tooling in `tools/` and `tests/` (Node 22, `sharp`, `@playwright/test`, Python `fonttools`).
- Contracts between core and UI: `docs/contracts.md`. Every judgement call: `docs/decisions.md`.

## 1. Setup (once)

```bash
cd sam-davies-site
npm install                       # sharp + playwright test runner (dev only)
pip install fonttools brotli      # font subsetting + check-fonts
npx playwright install chromium   # skip if a Chromium is already installed
```

Put the raw inputs in `sam-davies-site/inputs/` (gitignored): `sam-davies-meta.zip`, `sam-davies-Singles.zip`,
`sam-davies-EPs.zip`, `sam-davies-Features.zip`, `sam-davies-Albums.zip`, `sam-davies-covers.zip`, `Anton.zip`,
`VID_*.mp4`.

## 2. The three commands you will need

**(a) Data/asset build** — extract → match previews → covers → font subset → `site/data/*.json`:

```bash
npm run build            # node tools/build-assets.mjs
npm run build:video      # same + re-encode the scroll video (slow, ~5 min)
node tools/make-data.mjs # data only (e.g. after adding lyrics)
npm test                 # unit + check-i18n + check-fonts + Playwright (390×844 and 1440×900)
npm run serve            # http://localhost:4173 (Range support + production headers)
```

**(b) Transcription (paid)** — ElevenLabs Scribe is the only source of lyric text and timing:

```bash
node tools/transcribe-scribe.mjs --estimate                      # free: count + audio minutes
ALLOW_PAID=1 ELEVENLABS_API_KEY=xxxx node tools/transcribe-scribe.mjs   # all 45 (resumable, skips done)
ALLOW_PAID=1 ELEVENLABS_API_KEY=xxxx node tools/transcribe-scribe.mjs --only 1590535782
node tools/transcribe-scribe.mjs --rebuild-lrc                   # free: re-make .lrc from saved JSON
node tools/make-data.mjs                                         # turns hasLyrics on for those tracks
```

Keep the key in your shell only. Output goes to `site/data/private-lyrics/` (gitignored). Review
`docs/lyrics-review.md` (stats only, no lyric text) and hand-fix `.lrc` files where needed. Model is
`scribe_v2` (`scribe_v1` was removed by ElevenLabs on 2026-07-09); override with `--model`. Per-track
language hints: `site.config.json → lyricLanguages: { "<trackId>": "ca" }` (default: auto-detect).

**(c) Deploy (Vercel, static)**

1. Vercel → New Project → import this repo → **Root Directory = `sam-davies-site/site`**, Framework
   = *Other*, no build command, output directory = `.` (`site/vercel.json` carries headers, CSP, caching).
2. Turn on **Deployment Protection → Password protection** (or Vercel Authentication) while it is a private
   prototype — required if lyrics are deployed (see Rights).
3. Lyrics are gitignored, so a Git deploy ships **without** them (`hasLyrics` false → lyrics UI disabled).
   To include them in a protected preview: run (b), then deploy from your machine with
   `npx vercel deploy` from `sam-davies-site/site`. The CLI applies `site/.vercelignore` (not `.gitignore`),
   so the local `.lrc` files are uploaded; the raw Scribe `*.json` are excluded there.

## 3. Common changes

| Task | How |
|---|---|
| **Swap the video** | `tools/encode-video.sh new.mp4 site/media` (keeps budgets: 720 ≤ 6 MB, 1080 ≤ 12 MB; also writes poster, end frame, 4 stills). Media is cached `immutable` for a year → **give new files new names** (e.g. `scroll-1080.v2.mp4`) and update `story.video` paths in `site.config.json`. Re-check act ranges `story.acts` and the scrim curve `story.scrim` against the new footage. |
| **Add a track** | Add its row to `meta.json` and its 30 s `.m4a` to the matching zip (or folder in `.cache/raw`), then `npm run build`. Matching is by normalized title + collection; the build fails loudly on unmatched/duplicate files (`docs/match-report.md`). |
| **Regenerate data** | `node tools/make-data.mjs` (quiz order is seeded: `--seed sd-2026`). Never hand-edit `site/data/*.json`. |
| **Edit links / contact** | `site.config.json → links`, `contact`. Only Spotify is verified; Instagram (`malditopapi`?) and YouTube (`@samdaviesmusic`?) stay empty until confirmed as the artist's own accounts. |
| **Remove the "concept" label** | Only with the artist's agreement: `features.conceptLabel: false` (removes the footer notice), change `core.meta.title`/`core.meta.description` in `site/i18n/core.*.json`. |
| **Allow indexing** | `features.indexable: true`, then `node tools/apply-config.mjs` (rewrites the robots meta and the `X-Robots-Tag` header; private lyrics stay `noindex`). |
| **Add the lyrics engine** | Unzip `lyrics-engine.zip` into `site/vendor/lyrics-engine/` untouched, `node tools/make-data.mjs`, `npm test`, then review `createVendorEngine()` in `src/core/lyrics.js` against `AI_GUIDE.md` (docs/decisions.md D-002). |
| **Scroll sound** | Generate a loop (ElevenLabs Sound Effects), save as `site/media/sfx/ride-loop.mp3`, set `features.sfx: true`, `node tools/make-data.mjs`. Without the file the toggle never appears. |
| **Use Apple preview URLs instead of local files** | `audioSource: "apple"`, `node tools/make-data.mjs`. Caveat in D-021. |

## 4. Languages

- Page copy: `site/i18n/ui.{en,es,ca}.json` (UI layer); core strings: `site/i18n/core.{en,es,ca}.json`.
- Links per language: `?lang=ca`, `?lang=es`, `?lang=en` (shareable; not saved — a manual switch is saved).
- **Add a language** (e.g. French): create `core.fr.json` and `ui.fr.json` with every key; add `"fr"` to
  `i18n.languages` in `site.config.json`; add `<button type="button" data-lang-set="fr" lang="fr" aria-pressed="false">FR</button>`
  to `#lang-switch` in `index.html`; add `"fr"` to `LANGS` in `tools/make-data.mjs` and the `fr` texts to
  `tools/quiz-templates.json` + `TIMELINE_TEXT`; run `node tools/make-data.mjs`, `node tools/check-i18n.mjs`,
  `node tools/check-fonts.mjs` (re-subset the font in `build-assets.mjs` if the language needs new glyphs).
- **Review before launch:** every Spanish and Catalan string is listed in `docs/i18n-review.md` with
  `reviewed: false`. They need a native-speaker / artist review before any public launch.

## 5. Rights (read before sharing the link)

**Rights**: transcripts are song lyrics. The engine guide forbids storing lyrics in site code; the owner explicitly chose local transcripts anyway. Keep them as **data files only**, gitignored, behind `features.lyrics` and a deploy gate (Vercel password protection / unlisted + `noindex`). Public launch only with the artist's written OK.

- **Apple previews**: `audioSource: "local"` serves copies of Apple's 30-second previews from this site.
  Whether that is allowed is governed by Apple's terms for preview/marketing content, which this run did
  **not** review; hosting your own copies is the owner's call and the default is meant for the private
  prototype only. For anything public, check those terms, consider `audioSource: "apple"` (streams
  `previewUrl` from Apple), and keep the "listen on Apple Music" links (`tracks[].appleUrl`).
- Covers are the supplied artwork (plus Apple artwork for the three albums). No logos or other artwork.
- The site says "unofficial fan concept" in the footer and the page title until the artist agrees otherwise.

## 6. Transfer to the artist / a team

- **Vercel project:** Project → Settings → General → *Transfer Project* to their team (domains and env move
  with it). Custom domain: add it under Settings → Domains on their side, update DNS to Vercel.
- **Repository:** transfer `sam-davies-site/` as its own repo (it is self-contained), or the whole repo.
- **What they need:** this file, `docs/contracts.md`, `docs/decisions.md`, `docs/i18n-review.md`,
  `docs/lyrics-review.md`, and the raw inputs (not in git).
- Secrets: only `ELEVENLABS_API_KEY`, never committed, only needed for (b).

## 7. Layout

```
site/                 deploy root (vercel.json inside)
  index.html          skeleton (ids/hooks frozen: docs/contracts.md)
  site.config.json    names, links, flags, story/video settings
  src/core/           core runtime (story, scroll-video, player, lyrics, modal, island, i18n, sfx, perf)
  src/css/            tokens, stage, baseline-ui (core) · sections, modal, island, lang (UI)
  src/ui/             UI layer
  i18n/               core.* (core) · ui.* (UI)
  data/               generated JSON · private-lyrics/ (gitignored)
  media/              scroll video variants, poster, end frame, stills, covers, audio previews, sfx
  fonts/              Anton subset (OFL)
  vendor/lyrics-engine/  drop-in, untouched
tools/                pipeline + checks (dev only)
tests/                unit + Playwright e2e + fixtures (placeholder words, tone audio)
docs/                 contracts, decisions, reports, reviews, screenshots
```
