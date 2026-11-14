import { defineConfig } from '@playwright/test';

// End-to-end tests (e2e/): launch the built app (`npm run build` first, with the native modules
// built for Electron by `npm run rebuild`) and drive it. `npm run test:e2e`; on headless Linux,
// under `xvfb-run -a`.
export default defineConfig({
  testDir: './e2e',
  // Fetches and checks Electron's binary once, before the workers launch it side by side.
  globalSetup: './e2e/global-setup.ts',
  // Argon2id runs on every vault creation and unlock, and CI runners are slow.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // Each test launches its own app against its own throwaway home, so they run side by side.
  fullyParallel: true,
  workers: 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Each test saves a trace of every launch (e2e/sourcerer.ts); only a failure's are kept.
  preserveOutput: 'failures-only',
});
