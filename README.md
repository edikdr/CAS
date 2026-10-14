# sunniva "cozy room" - project kit

Everything needed to start building a **private preview website** for the singer-songwriter **sunniva** (Apple Music artist id 1790564840), prepared from the planning chat.

**Idea:** a dark room lit by string lights; a guitar in the middle that plays along with a 30-second preview (strings vibrate on the beat; 3D guitar on desktop, layered-DOM guitar on phones); paper collage on the wall; film grain; About, fan quiz, discography as 4 receipts, track modal with 30s preview + synced lyrics (font mode or cut-out magazine letters). Nothing is public until she agrees.

## Packaged in two zips (upload limit ~30 MB)
`sunniva-kit-part1-core.zip` = everything + previews of Durocher Demos and Singles (21 MB). `sunniva-kit-part2-previews.zip` = previews + cover of Fantasy Prologue (21 MB). Unzip **both into the same parent folder**: both contain the top folder `sunniva-room-kit/`, so the previews merge into `assets/previews-local/`. Part 1 alone is enough to start (M0 does not need audio).

## Start here
1. `docs/CONTRACT.md` - rules for every session. Receipt mechanism: `extract/receipt/README_RECEIPT.md`.
2. `docs/SEND_PLAN.md` - how to run the two stages; `docs/PROMPT_01.md` - first prompt.
3. `docs/TZ_01_OPUS_foundation.md` (Opus 5.5), `docs/TZ_02_SONNET_content.md` (Sonnet 5.5).
4. `docs/DATA_SCHEMA.md`, `docs/ASSET_REGISTER.md`.
5. `HANDOFF.md` - current state of the code: how to run it, interfaces, build/rights rails, measured numbers.

## What is inside
```
docs/                CONTRACT, TZ_01, TZ_02, DATA_SCHEMA, ASSET_REGISTER, SEND_PLAN, PROMPT_01
data/
  releases.json      10 releases (album, demos, 7 singles, 1 appearance)
  tracks.json        33 track rows = 29 unique songs (4 singles are also on the album)
  receipts.json      4 receipts: 17 / 7 / 8 / 1 rows
  beats/             29 files <trackId>.json: auto tempo/onsets for every album, demo and single preview (UNVERIFIED), _index.json
  facts/             artist.json (UNVERIFIED), verification-todo.md
  itunes-raw/        the 13 original iTunes responses (1.json-13.json; 8-10 and 12-13 are duplicates)
config/rights.json   what may ship (all gated classes are NOT cleared yet)
assets/
  fonts/luxurious-script/   TTF + OFL.txt (convert to subset woff2: pip install fonttools brotli)
  reference/guitar/         front.jpg, back.jpg (for Meshy / DOM layers)
  reference/room/           vibe-board.jpg, string-lights.jpg
  reference/film-texture/   3 texture examples (reference only)
  reference/sunniva/        CD + lyric booklet photo, Instagram tour post screenshot
  previews-local/           YOUR sunniva-all: 29 previews (.m4a) + 10 covers (.jpg). Local only, gitignored, never deploy
vendor/lyrics-engine/       the owner's lyrics engine (never edit)
extract/receipt/            THE RECEIPT cut out of the Arctic Monkeys archive: receipt.js, CSS, fonts, crumple pipeline + sample frames, sfx, a sunniva data adapter + wording override, a passing test, a draft demo (read README_RECEIPT.md)
reference/arctic-monkeys-archive/   selected files from the owner's Arctic Monkeys site: receipt, quiz, trackmodal, collage (ransom), player, 130 letter scans (a-z), crumple tool. Patterns only.
tools/
  analyze_beats.py          offline BPM/onsets for previews (ffmpeg + numpy + scipy)
  termux_download_previews.py, termux_download_covers.py   the owner's phone scripts (reference)
```

## Not in the kit (on purpose)
- Any lyric text. Lyrics are not in the repo; they need her permission. (The audio previews ARE included, in `assets/previews-local/`, local only.)
- Arctic Monkeys data/lyrics/quizzes/photos, API keys, the Genius proxy.
- The ElevenLabs transcript of "The Shallow End" (it was shown only in a chat widget; download `words.json` again from the ElevenLabs flow if needed).
- The Meshy model (to be generated in Stage 1, M5) and woff2 conversion of the font (no `brotli` in the packaging environment).

## Corrections made during planning (trust these over older chat messages)
- Singles = **7** (not 8): It's Obvious, Exit, Prom Queen, Surface Tension, closest i could get, Like a kid, Im coming down. `Around The Smoke (feat. sunniva)` is a **We Cults** release -> "appearances".
- Unique songs = **29** (17 album + 8 demos + 3 singles not on the album + 1 appearance). 
- `sunniva.bandcamp.com` is another artist; hers is `sunnivvva.bandcamp.com`.
- Fantasy Prologue date: Apple 2026-09-25 vs Bandcamp 2026-09-28 - verify.
- `https://.meshy.ai` in the connector list looks malformed - check the real Meshy MCP address.

## Facts worth remembering
- Beats: all 29 previews were analysed (`data/beats/`, table in `docs/BEATS_REVIEW.md`). "The Shallow End" ~99 BPM (first beat 0.38 s). 5 tracks are flagged as probably half/double tempo - confirm by ear. The 4 single rows that duplicate album songs have no beat file (their previews are different files).
- Her lyrics exist in the CD's printed booklet -> ask her for them instead of transcribing.
- Public contact address is on her website (verify): use it for the one pitch email only.
