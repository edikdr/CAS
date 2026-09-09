/* Cloudflare Pages: the folder structure is the route, so this file is
   /api/genius. The environment arrives on `context.env` rather than on
   process.env — Workers has no process — which is why the core takes the
   environment as an argument instead of reading a global. */
import { handle } from '../../api/_genius.mjs';

export const onRequestGet = async ({ request, env }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { status, body, cache } = await handle(params, env || {});
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? `public, max-age=${cache}` : 'no-store'
    }
  });
};
