/* Vercel: any file under /api is a function, and the path is the file
   name — this is /api/genius. The token comes from the project's
   environment variables and is read here, never sent to the browser. */
import { handle } from './_genius.mjs';

export default async function handler(req, res) {
  const params = Object.fromEntries(
    new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams);
  const { status, body, cache } = await handle(params, process.env);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache
    ? `public, max-age=${cache}, s-maxage=${cache}, stale-while-revalidate=86400`
    : 'no-store');
  res.status(status).send(JSON.stringify(body));
}
