# nbhd-genius-service

A small Express service that puts the Genius API behind our own origin. The
access token stays on this side; the front end only ever sees shaped, sanitised
JSON.

The fan archive works with no server at all. This adds the Genius layer on top:
annotations, official song backgrounds, artist bios, metrics and cover versions.

## Setup

Node 18.17 or newer (the service uses the built-in `fetch`).

```bash
cd server
npm install
cp .env.example .env      # then paste your token into GENIUS_ACCESS_TOKEN
npm start                 # http://localhost:3000
```

Get a token from https://genius.com/api-clients — create a client, then generate
a **client access token**. That single value is all the service needs; the client
id and secret are read only so a deployment can be validated.

```bash
npm run dev    # restarts on change
npm test       # 14 tests, run against a stubbed Genius, no token needed
```

## Endpoints

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/health` | Liveness, cache backend, whether a token is configured |
| GET | `/api/search?q=&artist=` | Resolve a title to a Genius song id |
| GET | `/api/artists/:id` | **(1)** Profile: bio, image URLs, social links |
| GET | `/api/artists/:id/hybrid?slug=` | **(4)** Genius merged with our local record |
| GET | `/api/artists/local` | Everything in `data/artists.local.json` |
| GET | `/api/songs/:id` | Everything below in one round trip |
| GET | `/api/songs/:id/annotations` | **(2)** Referents and annotations |
| POST | `/api/songs/:id/annotations/match` | **(2)** Annotations mapped onto our lines |
| GET | `/api/songs/:id/artwork` | **(3)** Single artwork, with album-art fallback |
| GET | `/api/songs/:id/stats` | **(5)** Pageviews, hotness, annotation counts |
| GET | `/api/songs/:id/background` | **(6)** Official Genius background copy |
| GET | `/api/songs/:id/relations` | **(7)** Covers, remixes, alternative versions |

### Matching annotations to our own lyrics

`POST /api/songs/:id/annotations/match` takes the lines you already have and
returns them with annotation spans attached, so a line can be underlined and
turned into a popup:

```bash
curl -X POST http://localhost:3000/api/songs/90478/annotations/match \
  -H 'Content-Type: application/json' \
  -d '{"lines":["All I am is a man","I want the world in my hands"]}'
```

```jsonc
{
  "matched": 1,
  "unmatched": [ { "id": 13, "fragment": "…" } ],
  "lines": [
    { "index": 0, "text": "All I am is a man",
      "annotations": [ { "id": 11, "start": 0, "end": 17, "exact": true,
                         "body": "<p>The opening statement.</p>", "url": "https://genius.com/1" } ] }
  ]
}
```

Genius quotes the lyric it annotates, and that quote rarely matches our copy
byte for byte: different apostrophes, bracketed section headers, stray spaces.
The matcher normalises both sides, tries an exact hit first, then a token-overlap
pass, and reports `exact: false` when the second one was used. Fragments it
cannot place are returned in `unmatched` rather than dropped.

### Single artwork

`song_art_image_url` is often just the album cover repeated. The artwork route
detects that instead of passing it off as single art:

```jsonc
{ "url": "…", "source": "single" }                       // its own artwork
{ "url": "…", "source": "header_fallback", "isAlbumArt": true }  // header used instead
{ "url": "…", "source": "album", "isAlbumArt": true }    // nothing better exists
```

## Security

- The token is read once, in `src/config.js`, and used only in `src/lib/genius.js`.
  It is never echoed, logged, or included in any response — there is a test for that.
- CORS is an allowlist from `CORS_ORIGIN`. An unknown origin gets no grant, and
  `*` is rejected outright when `NODE_ENV=production`. A page opened straight
  from disk sends `Origin: null`, so that value is in the example file.
- All Genius HTML is reduced to a small tag allowlist before it leaves the
  service. Scripts, styles, iframes and event handlers are dropped with their
  contents; links are forced to `http(s)` and get `rel="noopener noreferrer"`.
- A per-IP rate limit protects this service. It is separate from the cache,
  which is what protects the Genius quota.

## Rate limits and caching

Every upstream call goes through a read-through cache keyed by the exact Genius
URL, with a six hour TTL by default. Two things follow from that:

- Requesting `/stats`, `/background`, `/relations` and `/artwork` for one song
  costs **one** call to Genius, not four; they all read the same cached payload.
- Concurrent requests for the same key are collapsed into a single upstream call
  rather than stampeding.

Calls to Genius are additionally capped at four in flight. Set `REDIS_URL` to
share the cache across processes; without it an in-memory LRU is used, which is
enough for a single instance.

## Errors

Every failure comes back in the same shape, with the right status:

```jsonc
{ "error": { "code": "not_found", "message": "Song 99999999 was not found on Genius." } }
```

`not_found` (404), `bad_request` (400), `rate_limited` (429), `upstream_error`
(502), `upstream_timeout` (504). A song or artist missing from Genius is a plain
404, never a 500. `/api/artists/:id/hybrid` is deliberate about this: if Genius
is unreachable but we hold a local record, it answers from local data rather
than failing.

## Attribution

Backgrounds, bios and annotations are Genius editorial content. Every response
that carries it also carries `source: "genius"` and the `sourceUrl` of the page
it came from. Keep that link visible in the UI — the Genius API terms ask for it.

## Local overrides

`data/artists.local.json` is the local half of the hybrid endpoint. Any field
present there wins; anything missing falls back to Genius. Set `geniusId` on an
entry to link it to a Genius artist page, and the field-by-field decision is
reported back under `sources.fields` so the UI can show what came from where.
