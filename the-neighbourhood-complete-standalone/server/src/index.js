import { config, assertConfig } from './config.js';
import { createCache } from './lib/cache.js';
import { createApp } from './app.js';

const problems = assertConfig();
if (problems.length) {
  console.error('Configuration problems:');
  problems.forEach(problem => console.error('  - ' + problem));
  process.exit(1);
}

const cache = await createCache(config.cache);
const app = createApp({ cache });

const server = app.listen(config.port, () => {
  console.log(`nbhd-genius-service listening on http://localhost:${config.port} (${config.env}, cache: ${cache.backend})`);
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received, closing.`);
  server.close(async () => { await cache.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
