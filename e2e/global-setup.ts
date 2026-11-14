// Runs once before any Playwright worker starts. Right after `npm ci`, Electron's binary may not be
// on disk yet: `require('electron')` downloads and unpacks it on first use, and parallel workers
// each doing so race on the same file and fail with `spawn ETXTBSY` or `EACCES`. Resolving it here
// once, then running the binary (as Node, so no display is needed), leaves a finished binary for
// every worker. Also checks that the app has been built.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export default function globalSetup(): void {
  const root = join(__dirname, '..');
  if (!existsSync(join(root, 'out', 'main', 'index.js'))) {
    throw new Error('The app is not built: run `npm run rebuild && npm run build` first.');
  }
  const require = createRequire(__filename);
  const binary = require('electron') as unknown as string;
  const run = spawnSync(binary, ['--version'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`Electron's binary (${binary}) did not start: ${run.error?.message ?? run.stderr}`);
}
