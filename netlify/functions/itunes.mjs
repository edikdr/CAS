import { handle } from '../../api/_itunes.mjs';

export const handler = async (event) => {
  const { status, body, cache } = await handle(event.queryStringParameters || {});
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? `public, max-age=${cache}` : 'no-store'
    },
    body: JSON.stringify(body)
  };
};
