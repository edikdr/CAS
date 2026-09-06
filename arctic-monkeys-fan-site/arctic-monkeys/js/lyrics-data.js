/* Placeholder for tools/fetch_lyrics.py output.

   The site fetches the words at runtime and works without this file: the
   track window asks its own /api/lyrics, and failing that LRCLIB directly
   from the browser. Run the fetcher to bake them in instead, and every
   song's words are on screen the frame a window opens, with no network
   involved at all:

       python3 tools/fetch_lyrics.py

   It writes this file. Read only if present; see js/lyrics.js.

   The words belong to their publishers. Baking them into a public deploy
   is the site owner's decision and the site owner's responsibility, which
   is why the fetcher is a step you take rather than one already taken. */
const LYRICS_DATA = { generated: null, source: null, tracks: {} };
