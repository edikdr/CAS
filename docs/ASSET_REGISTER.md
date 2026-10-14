# ASSET REGISTER

Every asset in the project has a row. "Private OK" = may appear on the private preview link only. "Public" needs written permission (an email reply is enough) or a replacement.

| Asset | Path | Source | Rights status | Use now | Plan for public |
|---|---|---|---|---|---|
| Luxurious Script font | `assets/fonts/luxurious-script/` | Google Fonts download | SIL OFL 1.1, no Reserved Font Name in the copyright line -> may be modified; keep `OFL.txt`; do not sell the font alone | Yes | Same; convert to subset woff2 (`pip install fonttools brotli`, `pyftsubset`) |
| Lyrics engine | `vendor/lyrics-engine/` | Owner's own project | Owner's code | Yes, never edit | - |
| Arctic Monkeys archive (reference code) | `reference/arctic-monkeys-archive/` | Owner's own project | Code is the owner's. **Do not copy Arctic Monkeys-specific content** (names, data, quizzes text). Reuse patterns: receipt, crumple, quiz, track modal, magazine letters | Patterns only | - |
| Magazine letter scans (130, 5 alphabets a-z) | `reference/.../assets/letters/` | Owner's archive; provenance not documented | Unknown | Private OK | Confirm own scans or replace. **No digits or punctuation exist** -> need fallback glyphs |
| Guitar photo front | `assets/reference/guitar/front.jpg` | Catalogue-style photo from the web (origin unknown) | Not cleared | Private OK (input for Meshy / DOM layers) | Own photos of a real guitar or CC0 |
| Guitar photo back | `assets/reference/guitar/back.jpg` | same | Not cleared | Private OK | same |
| Vibe board | `assets/reference/room/vibe-board.jpg` | Image found online (origin unknown) | Not cleared | Reference + private cut-outs | Text papers rebuilt as live text with OFL fonts; images replaced |
| String lights photo | `assets/reference/room/string-lights.jpg` | Web | Not cleared | Reference for light positions | Own photo or drawn SVG |
| Film textures x3 | `assets/reference/film-texture/` | Web (Pinterest-like) | Not cleared | **Reference only** | Procedural canvas/SVG generator (Sonnet) - nothing to clear |
| Her CD + lyric booklet photo | `assets/reference/sunniva/fantasy-prologue-cd-and-lyric-booklet.jpg` | Her public social post (screenshot) | Hers | Reference (proves a lyric booklet exists) | Only with her permission |
| Her Instagram tour post screenshot | `assets/reference/sunniva/instagram-link3-tour-post-2025-07-24.jpg` | Her public post | Hers / link3 / poster designer | Reference for style (cold film, cut-out letters) | Do not use as asset |
| Apple cover art | via `artworkTemplate` URLs | Apple Search API | Hers; Apple allows it to promote content with a link to Apple Music | Private OK, after user action, never on receipts | Only with her permission or press kit |
| Apple 30s previews | via `previewUrl` | Apple Search API | Hers; Apple's promotional preview | Stream on click, never re-host | Same |
| Previews + covers (owner's `sunniva-all`) | `assets/previews-local/` | Apple 30s previews and artwork, downloaded by the owner | Hers | **Local dev and beat analysis only; gitignored; never deploy or commit** | Site streams previews from Apple on click; covers only with permission |
| Receipt extract (code) | `extract/receipt/js/receipt.js`, `css/`, `tools/crumple/` | Owner's Arctic Monkeys project | Owner's code | Yes (adapt) | - |
| Receipt fonts (Archivo Black, Courier Prime, Caveat) | `extract/receipt/fonts/` | From the AM archive; OFL families on Google Fonts | OFL (add each OFL.txt, confirm files) | Yes | Ship subset + OFL.txt |
| Receipt paper sounds | `extract/receipt/sfx/fold.wav`, `unfold.wav` | AM archive; provenance unknown | Unknown | Private OK | Replace or document origin |
| Receipt crumple sample frames (AM) | `extract/receipt/crumple-sample/` | Rendered from the AM receipt | Owner's | **Reference only - not for sunniva** | Generate sunniva frames |
| Raw iTunes JSON | `data/itunes-raw/` | Apple Search API | Facts + URLs | Yes | - |
| Beat data | `data/beats/` | Computed by us from previews | Numbers only | Yes | Yes |
| Lyrics | `data/lyrics/` (does not exist) | Her booklet / her email | Hers | **Not shipped** | Only with permission |
| Three.js | `vendor/three/` (to add) | npm | MIT (keep the notice) | Yes | Yes |
| Meshy guitar model | `assets/models/guitar.glb` (to generate) | Meshy from the guitar photos | Depends on Meshy plan terms (free plan may require attribution) + photo origin | Private OK | Re-generate from own photos on a paid plan or credit per terms |
| Extra OFL fonts (Anton / Bebas Neue / Permanent Marker / Caveat / Ballet / Oswald / Barlow Condensed...) | `assets/fonts/` (to add) | Google Fonts | OFL | Yes | Yes, keep OFL files |

## Rules
- Add a row before you add an asset. Mark "Not cleared" when unsure.
- If an asset is not cleared, `RightsGate.allows()` must be able to switch it off for `PUBLIC_BUILD=1`.
- Put each shipped asset in the folder of its class (`config/rights.json` -> `paths`): `assets/fonts/` (fontsOFL), `assets/covers/` (coverArt), `assets/photos/` (photosOfHer), `assets/guitar/` + `assets/models/` (guitarPhotos and everything derived from them), `assets/collage/` (collageCutouts), `assets/letters/` (magazineLetters). `npm run build` fails on a file under `assets/` that no class covers.
- `assets/reference/` and `assets/previews-local/` never ship (build whitelist) and stay out of git.
