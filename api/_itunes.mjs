/* ============================================================
   The store, relayed.

   The browser calls itunes.apple.com directly and that is the fast path;
   this is the one behind it. It exists because the direct call is the
   single most common thing to fail on a deployed fan page and none of
   the reasons are the code's fault: a network that blocks Apple, a
   privacy extension that eats third-party requests, a corporate proxy
   with its own idea of CORS, or the page being opened from a file://
   URL where every cross-origin request is refused before it is made.

   Same origin as the page, so none of that applies. No key, no token,
   nothing to configure — if the folder is deployed somewhere that runs
   functions this is simply there, and js/player.js reaches for it only
   after the direct call has already failed.
   ============================================================ */

const HOST = 'https://itunes.apple.com';
const OPS = { search: '/search', lookup: '/lookup' };

/** Only these reach Apple. Anything else in the query string is dropped. */
const PASS = ['term', 'id', 'entity', 'limit', 'country', 'media', 'attribute'];

export async function handle(params = {}) {
  const path = OPS[String(params.op || 'search')];
  if (!path) return { status: 400, cache: 0, body: { ok: false, error: 'unknown op' } };

  const out = new URLSearchParams();
  PASS.forEach(k => {
    if (params[k] != null && params[k] !== '') out.set(k, String(params[k]).slice(0, 200));
  });
  if (!out.has('country')) out.set('country', 'US');
  if (!out.get('term') && !out.get('id')) {
    return { status: 400, cache: 0, body: { ok: false, error: 'term or id is required' } };
  }

  try {
    const stop = AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
    const r = await fetch(`${HOST}${path}?${out}`, {
      headers: { Accept: 'application/json' }, signal: stop
    });
    if (!r.ok) return { status: 502, cache: 0, body: { ok: false, error: `itunes ${r.status}` } };
    /* Apple answers /lookup with `text/javascript`, so the body is read
       as text and parsed here rather than trusting the content type. */
    const body = JSON.parse(await r.text());
    return { status: 200, cache: 21600, body };
  } catch (e) {
    return { status: 502, cache: 0, body: { ok: false, error: String(e.message || e) } };
  }
}
