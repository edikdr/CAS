/* ============================================================
   Genius proxy, as a serverless function.

   Netlify (and anything else that runs standard handlers) sets
   GENIUS_ACCESS_TOKEN in the platform's own environment — no .env file
   is deployed, and the token never reaches the browser. Genius refuses
   cross-origin browser requests anyway, so a proxy is the only way the
   page can read it at all.

   netlify.toml maps /api/genius/* here, which is the same path server.js
   serves locally. The site does not know or care which one answered.
   ============================================================ */

// only these, so the route cannot be used as an open relay
const ALLOWED = [/^search$/, /^songs\/\d+$/, /^artists\/\d+$/, /^referents$/];

export default async (request, context) => {
  const url = new URL(request.url);
  const endpoint = url.pathname.replace(/^\/api\/genius\/?/, '');

  const json = (code, body, cache) =>
    new Response(JSON.stringify(body), {
      status: code,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cache || 'no-store'
      }
    });

  if (endpoint === 'health') {
    return json(200, { ok: true, token: Boolean(process.env.GENIUS_ACCESS_TOKEN) });
  }

  const token = (process.env.GENIUS_ACCESS_TOKEN || '').trim();
  if (!token) {
    return json(503, {
      error: 'no token',
      hint: 'set GENIUS_ACCESS_TOKEN in the site environment variables — '
          + 'the page falls back to its baked data without it'
    });
  }

  if (!ALLOWED.some(rx => rx.test(endpoint))) {
    return json(400, { error: 'endpoint not allowed', endpoint });
  }

  try {
    const upstream = await fetch(
      `https://api.genius.com/${endpoint}${url.search}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const body = await upstream.json();
    return upstream.ok
      ? json(200, body, 'public, max-age=21600')
      : json(502, body);
  } catch (e) {
    return json(502, { error: String(e && e.message) });
  }
};

export const config = { path: '/api/genius/*' };
