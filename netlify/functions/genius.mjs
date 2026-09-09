/* Netlify: the redirect in netlify.toml maps /api/genius here, so the
   browser calls the same path it would on any other host. */
import { handle } from '../../api/_genius.mjs';

export const handler = async (event) => {
  const { status, body, cache } = await handle(
    event.queryStringParameters || {}, process.env);
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? `public, max-age=${cache}` : 'no-store'
    },
    body: JSON.stringify(body)
  };
};
