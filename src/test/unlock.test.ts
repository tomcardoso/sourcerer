import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import type { UnlockResult } from '@shared/types';

// Capture the unlock handler, point the vault at a temporary folder, skip the
// (slow, irrelevant here) Argon2 step, and let each test choose what opening
// the database does.
const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  dir: '',
  open: (() => { throw new Error('not set'); }) as (dbPath: string, keyHex: string) => unknown,
}));

vi.mock('electron', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../test/__mocks__/electron.ts');
  return {
    ...actual,
    app: { getPath: () => h.dir, getVersion: () => '0.2.2', isPackaged: true },
    ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(channel, fn) },
    BrowserWindow: { fromWebContents: () => null, getAllWindows: () => [] },
  };
});

vi.mock('../main/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../main/utils')>();
  return {
    ...actual,
    getPaths: () => ({
      dbPath: path.join(h.dir, 'db.sqlite'),
      saltPath: path.join(h.dir, 'salt'),
      screenshotsPath: path.join(h.dir, 'screenshots'),
    }),
    deriveKey: async () => 'ab'.repeat(32),
  };
});

vi.mock('../main/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../main/database')>();
  return { ...actual, unlockDatabase: (dbPath: string, keyHex: string) => h.open(dbPath, keyHex) };
});

import { registerUnlockHandlers } from '../main/ipc/unlock';
import { WrongKeyError, MigrationError } from '../main/database';
import { readTrace, setTraceFilePath } from '../main/diagnostics/trace';

registerUnlockHandlers();

function attempt(): Promise<UnlockResult> {
  const fn = h.handlers.get('unlock:attempt');
  if (!fn) throw new Error('unlock handler not registered');
  return fn({ sender: {} }, 'hunter2') as Promise<UnlockResult>;
}

describe('unlock:attempt', () => {
  beforeEach(async () => {
    h.dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sourcerer-unlock-'));
    fs.writeFileSync(path.join(h.dir, 'db.sqlite'), Buffer.alloc(8192));
    fs.writeFileSync(path.join(h.dir, 'salt'), Buffer.alloc(32));
    setTraceFilePath(path.join(h.dir, 'trace.json'));
  });

  afterEach(async () => {
    setTraceFilePath(null);
    await fsp.rm(h.dir, { recursive: true, force: true });
  });

  it('reports a rejected key as a wrong password', async () => {
    h.open = () => { throw new WrongKeyError(); };
    expect(await attempt()).toEqual({ success: false, reason: 'wrong-password', error: 'Incorrect password.' });
    expect(readTrace().map((e) => e.event)).toEqual(['unlock-wrong-password']);
  });

  it('does not report a native module built for another ABI as a wrong password', async () => {
    h.open = () => {
      throw Object.assign(
        new Error("The module '/x/better_sqlite3.node'\nwas compiled against a different Node.js version using\nNODE_MODULE_VERSION 127. This version of Node.js requires\nNODE_MODULE_VERSION 140."),
        { code: 'ERR_DLOPEN_FAILED' },
      );
    };
    const result = await attempt();
    expect(result.success).toBe(false);
    expect(result.reason).toBe('failed');
    expect(result.error).toContain("couldn't load its database engine");
    expect(result.error).not.toContain('Incorrect password');
    const [entry] = readTrace();
    expect(entry).toMatchObject({
      event: 'unlock-failed',
      stage: 'open-database',
      error: { category: 'native-module-version', abi: { built: 127, required: 140 } },
    });
  });

  it('reports a failed migration as such, with the stage', async () => {
    h.open = () => { throw new MigrationError(Object.assign(new Error('no such column'), { code: 'SQLITE_ERROR' })); };
    const result = await attempt();
    expect(result).toMatchObject({ success: false, reason: 'failed' });
    expect(result.error).toContain('Your password is correct');
    expect(readTrace()[0]).toMatchObject({ stage: 'migrate', error: { category: 'migration', original: { code: 'SQLITE_ERROR' } } });
  });

  it('falls back to the leftover key file only for a rejected key', async () => {
    fs.writeFileSync(path.join(h.dir, 'salt.tmp'), Buffer.alloc(32));
    h.open = () => { throw new WrongKeyError(); };
    expect((await attempt()).reason).toBe('wrong-password');
    // The leftover file is left alone when the second try fails too.
    expect(fs.existsSync(path.join(h.dir, 'salt.tmp'))).toBe(true);
  });

  it('reports vault file problems without trying the password', async () => {
    fs.writeFileSync(path.join(h.dir, 'db.sqlite'), '');
    h.open = () => { throw new Error('should not be called'); };
    expect(await attempt()).toMatchObject({ success: false, reason: 'vault-files' });
    expect(readTrace()[0]).toMatchObject({ event: 'unlock-vault-files-problem', detail: 'database-placeholder' });
  });
});
