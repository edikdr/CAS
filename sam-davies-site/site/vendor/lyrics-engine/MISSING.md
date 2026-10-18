# lyrics-engine — not supplied in the core run

`lyrics-engine.zip` was not among the inputs. Unzip it **here, untouched** (keep `lyrics-engine.js`,
`AI_GUIDE.md`, `README.md` as shipped; never edit the engine), then run:

    node tools/make-data.mjs     # sets data/build.json "lyricsEngine": true
    npx playwright test          # lyrics flow must still pass

Until then core uses its own fallback renderer (`src/core/lyrics.js`, see docs/decisions.md D-002).
Delete this file once the engine is in place.
