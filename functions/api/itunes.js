import { handle } from '../../api/_itunes.mjs';

export const onRequestGet = async ({ request }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { status, body, cache } = await handle(params);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? `public, max-age=${cache}` : 'no-store'
    }
  });
};
