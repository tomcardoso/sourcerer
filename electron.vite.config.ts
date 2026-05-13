import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * In production builds, replace every dev-seed import with a no-op stub so
 * the four fixture files (~1 000 contacts) are not bundled into the release
 * binary. maybeRunDevSeeds already guards with `if (!is.dev) return`, so the
 * stub function is never called — this just keeps it out of the bundle.
 */
const devSeedsStubPlugin = {
  name: 'stub-dev-seeds',
  resolveId(id: string) {
    if (id.includes('dev-seeds')) return '\0dev-seeds-stub';
    return null;
  },
  load(id: string) {
    if (id === '\0dev-seeds-stub') return 'export function seedDevData() {}';
    return null;
  },
};

export default defineConfig(({ mode }) => {
  const isProd = mode !== 'development';
  return {
    main: {
      plugins: [externalizeDepsPlugin(), ...(isProd ? [devSeedsStubPlugin] : [])],
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
        },
      },
    },
    renderer: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
          '@renderer': resolve('src/renderer/src'),
        },
      },
      plugins: [react()],
    },
  };
});
