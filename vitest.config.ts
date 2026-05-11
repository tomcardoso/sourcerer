import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/test/vitest.setup.ts'],
    include: ['src/test/**/*.test.ts'],
    server: {
      deps: {
        // Native addon — load as-is from node_modules without Vite bundling
        external: ['better-sqlite3-multiple-ciphers'],
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      // Stub out Electron and its ecosystem so tests that import production
      // modules (which reference electron/ipcMain/etc.) don't blow up.
      'electron': resolve(__dirname, 'src/test/__mocks__/electron.ts'),
      '@electron-toolkit/utils': resolve(__dirname, 'src/test/__mocks__/electron-toolkit-utils.ts'),
    },
  },
});
