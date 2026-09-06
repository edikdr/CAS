/* Placeholder for tools/fetch_am_data.py output.

   Run the fetcher to fill this with 30-second previews, real artwork,
   store links and (with a token) Genius credits:

       python3 tools/fetch_am_data.py
       GENIUS_ACCESS_TOKEN=xxx python3 tools/fetch_am_data.py --genius

   Until then the site falls back to live iTunes lookups in the browser,
   and to the credits already written into js/data.js. Nothing breaks. */
const API_DATA = { generated: null, sources: [], tracks: {} };
