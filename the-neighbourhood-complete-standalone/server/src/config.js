import 'dotenv/config';

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value) => String(value ?? '')
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),

  genius: {
    /* Only the access token is ever used to call the API. The client id and
       secret are read so a deployment can be validated, and so an OAuth flow
       can be added later without changing the loader. */
    clientId: process.env.GENIUS_CLIENT_ID || '',
    clientSecret: process.env.GENIUS_CLIENT_SECRET || '',
    accessToken: process.env.GENIUS_ACCESS_TOKEN || '',
    baseUrl: 'https://api.genius.com',
    timeoutMs: int(process.env.GENIUS_TIMEOUT_MS, 8000)
  },

  cors: {
    origins: list(process.env.CORS_ORIGIN).length
      ? list(process.env.CORS_ORIGIN)
      : ['http://localhost:8099', 'http://127.0.0.1:8099', 'null']
  },

  cache: {
    redisUrl: process.env.REDIS_URL || '',
    ttlSeconds: int(process.env.CACHE_TTL_SECONDS, 6 * 60 * 60),
    maxEntries: int(process.env.CACHE_MAX_ENTRIES, 500)
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: int(process.env.RATE_LIMIT_MAX, 120)
  }
};

/* Fail loudly at boot rather than on the first request. */
export function assertConfig() {
  const problems = [];
  if (!config.genius.accessToken) {
    problems.push('GENIUS_ACCESS_TOKEN is missing. Copy .env.example to .env and fill it in.');
  }
  if (config.env === 'production' && config.cors.origins.includes('*')) {
    problems.push('CORS_ORIGIN must not be * in production.');
  }
  return problems;
}
