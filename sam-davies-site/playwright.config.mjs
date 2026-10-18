// e2e for the core (no UI layer needed). Runs at 390×844 (mobile) and 1440×900 (desktop).
import { defineConfig } from '@playwright/test';

const PORT = 4173;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'off' },
  webServer: { command: `node tools/serve.mjs --port ${PORT}`, port: PORT, reuseExistingServer: true },
  projects: [
    { name: 'mobile-390', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: 'desktop-1440', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});
