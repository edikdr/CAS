# DATA SCHEMA

All files are plain JSON, UTF-8, validated by `npm run validate` (Opus writes the validator in M1, using these shapes).

## Generated from Apple (already in the kit)
`data/releases.json`
```json
{ "artist": {"name":"sunniva","appleArtistId":1790564840,"genre":"Singer/Songwriter"},
  "releases": [{
    "id": 6808001977, "title": "Fantasy Prologue", "appleTitle": "Fantasy Prologue",
    "type": "album|demos|single|appearance", "isCollab": false,
    "artistCredit": "sunniva", "releaseDate": "2026-09-25", "trackCount": 17,
    "genre": "Singer/Songwriter", "copyright": "...", "appleUrl": "https://music.apple.com/...",
    "artworkTemplate": "https://is1-ssl.mzstatic.com/.../{size}x{size}bb.jpg",
    "trackIds": [6808001979, ...] }] }
```
`data/tracks.json`
```json
{ "tracks": [{
    "id": 6808001979, "title": "The Shallow End", "artistCredit": "sunniva",
    "releaseId": 6808001977, "trackNumber": 1, "discNumber": 1, "durationMs": 159138,
    "releaseDate": "2026-09-25", "genre": "Singer/Songwriter",
    "features": [], "explicit": false,
    "previewUrl": "https://audio-ssl.itunes.apple.com/.../preview.m4a",
    "appleUrl": "https://music.apple.com/...",
    "artworkTemplate": "...{size}x{size}bb.jpg",
    "alsoOnAlbumTrackId": null }] }
```
- 33 track rows, **29 unique songs**: four singles (Surface Tension, Prom Queen, Exit, It's Obvious) also appear on the album (`alsoOnAlbumTrackId` points to the album row).
- Collabs keep the credit text as Apple writes it ("vhs ghost & sunniva", "how r u, link3 & sunniva", "Orchid Mantis & sunniva", "sunniva & link3"). `Around The Smoke (feat. sunniva)` is a **We Cults** release (type `appearance`).
- `previewUrl` is a plain URL to Apple's file. Never download or re-host in the site build. Artwork: replace `{size}` with 600 or 1200 when allowed.

`data/receipts.json`
```json
{ "receipts": [
  {"id":"album","title":"Fantasy Prologue","kind":"album","trackIds":[...17]},
  {"id":"singles","title":"Singles","kind":"singles","trackIds":[...7]},
  {"id":"demos","title":"Durocher Demos","kind":"demos","trackIds":[...8]},
  {"id":"appearances","title":"Appearances","kind":"appearances","trackIds":[...1]} ] }
```
Row = track: number, title, duration. Nothing else on the receipt face.

## Beats (offline analysis)
`data/beats/<trackId>.json` - times in seconds from the start of the **preview clip** (same clock as `<audio>.currentTime`).
```json
{ "file": "...", "durationSec": 29.98, "bpm": 99.4, "bpmCandidates": [99.4,198.8,67.1,191.4],
  "firstBeatSec": 0.383, "beats": [0.383, 0.987, ...],
  "onsets": [{"t": 0.406, "s": 0.37}, ...],
  "method": "...", "status": "auto-unverified|verified" }
```
- **All 29 previews of the album, demos and the three non-album singles + the appearance are already analysed**: `data/beats/<trackId>.json`, index in `data/beats/_index.json`, human review table in `docs/BEATS_REVIEW.md`. Extra fields: `trackId`, `title`, `octaveWarning` (string or null).
- Everything is `status: "auto-unverified"`. Tempo has an octave ambiguity (99 vs 198); 5 tracks sit at the edge of the search range and are flagged. A human confirms by ear and sets `status: "verified"` (and fixes `bpm`/`beats` if needed).
- **Missing file = no beat data**: guitar and lights do a slow idle sway, nothing is invented. The 4 single rows that duplicate album songs (Surface Tension, Prom Queen, Exit, It's Obvious) have **no** beat file: their Apple preview file differs from the album track's, so the clip may start elsewhere. Do not reuse the album row's beats for them unless the preview is re-analysed.
- To re-run: `python tools/analyze_beats.py assets/previews-local <out>` (ffmpeg, numpy, scipy), then map `NN - Title.m4a` to trackIds by title (filenames dropped `?` etc.).

## Lyrics (gated)
`data/lyrics/<trackId>.json` - **absent by default; folder is gitignored**.
```json
{ "trackId": 6808001979, "permission": "none|private-preview|granted",
  "source": "owner-supplied|elevenlabs-scribe-draft|fixture", "reviewedByHuman": false,
  "lines": [ {"t": 0.4, "end": 3.1, "text": "..."} ] }
```
- Times are relative to the preview clip. Built from the speech-to-text word timings: group words into lines by pause (>= 0.45 s) or punctuation; keep word timings too if the renderer wants word-level wipe: `"words":[{"t":..,"end":..,"text":..}]`.
- Make one from an ElevenLabs word-timing file: `node tools/lyrics-from-words.mjs words.json <trackId>` (pause >= 0.45 s or `.!?` ends a line; `permission: "private-preview"`, `source: "elevenlabs-scribe-draft"`). Test data without real lyrics: `node tools/make-lyric-fixture.mjs <trackId>` ("la la la" lines on the track's beats, `source: "fixture"`).
- Draft transcripts are unreliable (never publish unreviewed). `permission` decides visibility per build mode (see CONTRACT section 3).

## Facts and quiz
`data/facts/artist.json` (provided, mostly unverified), `data/facts/verification-todo.md` (what to check), `data/facts/verification.json` (you create: a JSON **array** of `{claim, value, source, retrieved, verified}`; `source` is an https URL, `retrieved` is `YYYY-MM-DD`). Only this file ships, filtered to `verified: true`; `artist.json` is input only and never ships (it holds the private contact address).
`data/quiz.json` (Sonnet creates): `{"questions":[{"q":"","options":["","","",""],"answer":0,"explain":"","source":"url","verified":true}]}` - 8-10 questions from public facts only (release names, order, dates, collabs, counts). No lyric questions.

## Config
`config/rights.json` - see CONTRACT section 3. Per class:
```json
"coverArt": {"cleared": false, "paths": ["assets/covers/"], "fields": ["artworkTemplate"], "hosts": ["mzstatic.com"], "note": "..."}
```
- `cleared` (required) - may a public build use it.
- `paths` - files/dirs that belong to the class. Every shipped file under `assets/` must be covered by some class, or the build fails. In a public build, files of non-cleared classes are not copied.
- `fields` - JSON keys removed from every shipped JSON file when the class is not allowed.
- `hosts` - hostnames that must not appear in any shipped text of a public build while the class is not cleared.
The shipped copy is reduced to `{buildMode, classes: {name: {cleared}}}`. `config/theme-tokens` is defined by Opus in `styles/tokens.css`.
