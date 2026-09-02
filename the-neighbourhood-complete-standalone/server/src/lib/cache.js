/* A small TTL cache with two jobs: keep us inside the Genius rate limit, and
   collapse concurrent identical requests into a single upstream call.

   Redis is used when REDIS_URL is set and ioredis is installed; otherwise an
   in-memory LRU is used, which is enough for a single-process deployment. */

class MemoryStore {
  constructor(maxEntries) {
    this.max = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    /* refresh recency */
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlSeconds) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    while (this.map.size > this.max) {
      this.map.delete(this.map.keys().next().value);
    }
  }

  async close() { this.map.clear(); }
  get size() { return this.map.size; }
}

class RedisStore {
  constructor(client, prefix = 'nbhd:genius:') {
    this.client = client;
    this.prefix = prefix;
  }

  async get(key) {
    const raw = await this.client.get(this.prefix + key);
    return raw ? JSON.parse(raw) : undefined;
  }

  async set(key, value, ttlSeconds) {
    await this.client.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async close() { await this.client.quit(); }
}

export async function createCache({ redisUrl, ttlSeconds, maxEntries }) {
  let store = new MemoryStore(maxEntries);
  let backend = 'memory';

  if (redisUrl) {
    try {
      const { default: Redis } = await import('ioredis');
      const client = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
      await client.connect();
      store = new RedisStore(client);
      backend = 'redis';
    } catch (error) {
      console.warn(`[cache] Redis unavailable (${error.message}); falling back to memory.`);
    }
  }

  const inFlight = new Map();
  let hits = 0;
  let misses = 0;

  return {
    backend,
    stats: () => ({ backend, hits, misses, entries: store.size ?? null }),

    /* Read through: one upstream call per key, however many callers arrive. */
    async wrap(key, ttl, producer) {
      const cached = await store.get(key);
      if (cached !== undefined) { hits += 1; return cached; }

      if (inFlight.has(key)) return inFlight.get(key);

      misses += 1;
      const pending = (async () => {
        const value = await producer();
        await store.set(key, value, ttl ?? ttlSeconds);
        return value;
      })().finally(() => inFlight.delete(key));

      inFlight.set(key, pending);
      return pending;
    },

    close: () => store.close()
  };
}
