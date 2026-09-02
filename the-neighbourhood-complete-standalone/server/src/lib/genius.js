import { config } from '../config.js';
import { notFound, upstream, timeout } from './errors.js';

/* The only place the access token is ever read. Nothing here is returned to a
   client verbatim; every route shapes its own response. */

let concurrent = 0;
const queue = [];
const MAX_CONCURRENT = 4;

function slot() {
  if (concurrent < MAX_CONCURRENT) {
    concurrent += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => queue.push(resolve));
}

function release() {
  const next = queue.shift();
  if (next) next();
  else concurrent -= 1;
}

export function createGeniusClient({ cache, fetchImpl = fetch, baseUrl = config.genius.baseUrl } = {}) {
  async function call(path, { searchParams = {}, ttl } = {}) {
    const url = new URL(baseUrl + path);
    url.searchParams.set('text_format', searchParams.text_format || 'html');
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && key !== 'text_format') {
        url.searchParams.set(key, String(value));
      }
    }

    const key = url.pathname + '?' + url.searchParams.toString();
    const run = async () => {
      await slot();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.genius.timeoutMs);
      try {
        const response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${config.genius.accessToken}`,
            Accept: 'application/json',
            'User-Agent': 'nbhd-fan-archive/1.0 (+https://github.com/edikdr/CAS)'
          },
          signal: controller.signal
        });

        if (response.status === 404) throw notFound('Resource', key);
        if (response.status === 401 || response.status === 403) {
          throw upstream('Genius rejected the access token.', { status: response.status });
        }
        if (response.status === 429) {
          throw upstream('Genius rate limit reached.', { status: 429 });
        }
        if (!response.ok) {
          throw upstream(`Genius responded ${response.status}.`, { status: response.status });
        }

        const body = await response.json();
        if (!body || body.meta?.status >= 400) {
          throw upstream('Genius returned an error envelope.', { meta: body?.meta });
        }
        return body.response;
      } catch (error) {
        if (error?.name === 'AbortError') throw timeout(`Genius did not answer within ${config.genius.timeoutMs}ms.`);
        throw error;
      } finally {
        clearTimeout(timer);
        release();
      }
    };

    return cache ? cache.wrap(key, ttl, run) : run();
  }

  return {
    /* /artists/:id */
    artist: (id) => call(`/artists/${encodeURIComponent(id)}`),
    /* /songs/:id */
    song: (id) => call(`/songs/${encodeURIComponent(id)}`),
    /* /referents?song_id=:id&text_format=html */
    referents: (songId, { perPage = 50, page = 1 } = {}) =>
      call('/referents', { searchParams: { song_id: songId, per_page: perPage, page } }),
    /* /artists/:id/songs */
    artistSongs: (id, { perPage = 20, page = 1, sort = 'popularity' } = {}) =>
      call(`/artists/${encodeURIComponent(id)}/songs`, { searchParams: { per_page: perPage, page, sort } }),
    /* /search?q= */
    search: (q) => call('/search', { searchParams: { q } }),
    raw: call
  };
}
