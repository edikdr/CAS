import { handle } from './_itunes.mjs';

export default async function handler(req, res) {
  const params = Object.fromEntries(
    new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams);
  const { status, body, cache } = await handle(params);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache ? `public, max-age=${cache}` : 'no-store');
  res.status(status).send(JSON.stringify(body));
}
