import express from 'express';
import { config } from './config.js';
import { HttpError, rateLimited } from './lib/errors.js';
import { createGeniusClient } from './lib/genius.js';
import { artistsRouter } from './routes/artists.js';
import { songsRouter } from './routes/songs.js';
import { annotationsRouter } from './routes/annotations.js';
import { searchRouter } from './routes/search.js';

/* Origin allowlist. The token never leaves this process, so CORS is about
   keeping our own quota from being spent by other people's pages. */
function cors(origins) {
  const allowAll = origins.includes('*');
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowAll || origins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

/* Protects this service; the cache is what protects the Genius quota. */
function rateLimit({ windowMs, max }) {
  const buckets = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.reset <= now) buckets.delete(key);
  }, windowMs).unref?.();

  return (req, res, next) => {
    const key = req.ip || 'anonymous';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) return next(rateLimited(Math.ceil((bucket.reset - now) / 1000)));
    next();
  };
}

export function createApp({ cache, fetchImpl, baseUrl } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(cors(config.cors.origins));
  app.use(express.json({ limit: '256kb' }));
  app.use(rateLimit(config.rateLimit));

  const genius = createGeniusClient({ cache, fetchImpl, baseUrl });

  app.get('/health', (req, res) => res.json({
    ok: true,
    env: config.env,
    tokenConfigured: Boolean(config.genius.accessToken),
    cache: cache?.stats?.() ?? null,
    uptimeSeconds: Math.round(process.uptime())
  }));

  app.use('/api/search', searchRouter({ genius }));
  app.use('/api/artists', artistsRouter({ genius }));
  app.use('/api/songs', annotationsRouter({ genius }));   /* /:id/annotations */
  app.use('/api/songs', songsRouter({ genius }));         /* /:id, /:id/stats, ... */

  app.use((req, res) => res.status(404).json({ error: { code: 'no_route', message: `No route for ${req.method} ${req.path}` } }));

  app.use((error, req, res, next) => {                    // eslint-disable-line no-unused-vars
    const isHttp = error instanceof HttpError;
    const status = isHttp ? error.status : 500;
    if (!isHttp || status >= 500) {
      console.error(`[error] ${req.method} ${req.originalUrl}`, error.message);
    }
    if (error.details?.retryAfterSeconds) res.setHeader('Retry-After', String(error.details.retryAfterSeconds));
    res.status(status).json({
      error: {
        code: isHttp ? error.code : 'internal_error',
        message: isHttp ? error.message : 'Something went wrong handling that request.',
        ...(isHttp && error.details ? { details: error.details } : {})
      }
    });
  });

  return app;
}
