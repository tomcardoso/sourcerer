import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// gatherReport reads the vault location and app facts through Electron's `app`.
// Point it at a per-test temporary folder.
const state = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../test/__mocks__/electron.ts');
  return {
    ...actual,
    app: {
      getVersion: () => '0.2.2',
      isPackaged: true,
      getPath: (name: string) => {
        if (name === 'userData') return state.userData;
        return os.tmpdir();
      },
    },
  };
});

import {
  errorFacts,
  codeLocation,
  stackFrames,
  recordEvent,
  readTrace,
  setTraceFilePath,
  MAX_ENTRIES,
} from '../main/diagnostics/trace';
import { gatherReport, renderReport, vaultFileFacts, sizeBucket } from '../main/diagnostics/report';
import { initDatabase, closeDatabase, getDatabase, unlockDatabase, WrongKeyError, MigrationError } from '../main/database';

// A planted account name and secret that must never reach a trace or report.
const ACCOUNT = 'janedoe_PLANTED';
const SECRET = 'Deep Throat PLANTED_SECRET_7c1e';

/** The error better-sqlite3 throws when its binary was built for another Node
 *  ABI, as captured from a real run, with a planted account name in the path. */
function abiMismatchError(): Error {
  const root = `/Users/${ACCOUNT}/Projects/${SECRET}/sourcerer`;
  const err = new Error(
    `The module '${root}/node_modules/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node'\n` +
      'was compiled against a different Node.js version using\n' +
      'NODE_MODULE_VERSION 127. This version of Node.js requires\n' +
      'NODE_MODULE_VERSION 140. Please try re-compiling or re-installing\n' +
      'the module (for instance, using `npm rebuild` or `npm install`).',
  ) as Error & { code: string };
  err.code = 'ERR_DLOPEN_FAILED';
  err.stack =
    `Error: ${err.message}\n` +
    '    at Object..node (node:internal/modules/cjs/loader:1939:18)\n' +
    '    at Module.load (node:internal/modules/cjs/loader:1505:32)\n' +
    `    at bindings (${root}/node_modules/bindings/bindings.js:112:48)\n` +
    `    at new Database (${root}/node_modules/better-sqlite3-multiple-ciphers/lib/database.js:48:64)\n` +
    `    at openRaw (${root}/out/main/index.js:1201:14)\n` +
    `    at ${root}/out/main/index.js:1300:3`;
  return err;
}

function expectClean(text: string) {
  expect(text).not.toContain(ACCOUNT);
  expect(text).not.toContain('PLANTED_SECRET');
  expect(text).not.toContain('/Users/');
  expect(text).not.toContain(os.tmpdir());
}

describe('errorFacts', () => {
  it('reduces a native module ABI mismatch to its category, numbers and code locations', () => {
    const facts = errorFacts(abiMismatchError());
    expect(facts.category).toBe('native-module-version');
    expect(facts.abi).toEqual({ built: 127, required: 140 });
    expect(facts.code).toBe('ERR_DLOPEN_FAILED');
    expect(facts.type).toBe('Error');
    expect(facts.frames).toEqual([
      'Object..node (node:internal/modules/cjs/loader:1939:18)',
      'bindings (bindings/bindings.js:112:48)',
      'new Database (better-sqlite3-multiple-ciphers/lib/database.js:48:64)',
      'openRaw (main/index.js:1201:14)',
      'main/index.js:1300:3',
    ]);
    expectClean(JSON.stringify(facts));
  });

  it('reads the architectures from a macOS mismatch, keeping only known names', () => {
    const err = new Error(
      `dlopen(/Users/${ACCOUNT}/x.node, 0x0001): tried: '/Users/${ACCOUNT}/x.node' (mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64'))`,
    );
    const facts = errorFacts(err);
    expect(facts.category).toBe('native-module-architecture');
    expect(facts.arch).toEqual({ have: 'x86_64', need: 'arm64' });
    expectClean(JSON.stringify(facts));
  });

  it('never keeps the message, and drops a class name or code it does not know', () => {
    const err = new Error(`UNIQUE constraint failed for ${SECRET}`) as Error & { code: string };
    err.name = `Custom ${SECRET}`;
    err.code = `not a code ${SECRET}`;
    const facts = errorFacts(err);
    expect(facts).toMatchObject({ category: 'other', type: 'other' });
    expect(facts.code).toBeUndefined();
    expectClean(JSON.stringify(facts));
  });

  it('categorizes wrong keys, migrations and file system codes', () => {
    expect(errorFacts(new WrongKeyError()).category).toBe('wrong-key');
    const e = (code: string) => Object.assign(new Error('x'), { code });
    expect(errorFacts(e('SQLITE_CANTOPEN')).category).toBe('sqlite');
    expect(errorFacts(e('ENOENT')).category).toBe('file-missing');
    expect(errorFacts(e('EACCES')).category).toBe('file-permission');
    expect(errorFacts(e('ENOSPC')).category).toBe('disk-full');
    const m = errorFacts(new MigrationError(e('SQLITE_ERROR')));
    expect(m.category).toBe('migration');
    expect(m.original).toMatchObject({ category: 'sqlite', code: 'SQLITE_ERROR' });
  });
});

describe('codeLocation / stackFrames', () => {
  it('keeps only the code part of a path', () => {
    expect(codeLocation('/Applications/Sourcerer.app/Contents/Resources/app.asar/out/main/index.js:10:2')).toBe('main/index.js:10:2');
    expect(codeLocation(`C:\\Users\\${ACCOUNT}\\AppData\\Local\\Programs\\sourcerer\\resources\\app.asar\\out\\main\\index.js:5:1`)).toBe('main/index.js:5:1');
    expect(codeLocation(`file:///Users/${ACCOUNT}/out/stuff/src/main/ipc/unlock.ts:3:4`)).toBe('main/ipc/unlock.ts:3:4');
    expect(codeLocation(`/Users/${ACCOUNT}/node_modules/foo/src/x.js:1:1`)).toBe('foo/src/x.js:1:1');
    expect(codeLocation(`/Users/${ACCOUNT}/Documents/notes.js:1:1`)).toBe('notes.js:1:1');
    expect(codeLocation('node:internal/vm:209:10')).toBe('node:internal/vm:209:10');
    expect(codeLocation(`/Users/${ACCOUNT}/My Files/odd name.js:1:1`)).toBe('<file>:1:1');
  });

  it('replaces a function name that is not a plain identifier', () => {
    expect(stackFrames(`Error\n    at ${SECRET} thing (/a/out/main/index.js:1:1)`)).toEqual(['<function> (main/index.js:1:1)']);
    expect(stackFrames('Error\n    at process.func [as dlopen] (node:electron/js2c/node_init:2:2617)')).toEqual([
      'process.func [as dlopen] (node:electron/js2c/node_init:2:2617)',
    ]);
  });

  it('keeps only the first internal frame', () => {
    const stack = [
      'Error: x',
      '    at a (node:internal/one:1:1)',
      '    at b (node:internal/two:2:2)',
      '    at node:internal/three:3:3',
      '    at c (/app/out/main/index.js:4:4)',
    ].join('\n');
    expect(stackFrames(stack)).toEqual(['a (node:internal/one:1:1)', 'c (main/index.js:4:4)']);
  });
});

describe('trace storage', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sourcerer-trace-'));
    file = path.join(dir, 'diagnostics-trace.json');
    setTraceFilePath(file);
  });

  afterEach(async () => {
    setTraceFilePath(null);
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('records events to the minute, with error facts but no message', () => {
    recordEvent('app-started', { version: '0.2.2', build: 'development' }, new Date('2026-11-13T14:05:42.123Z'));
    recordEvent('unlock-failed', { stage: 'open-database', error: abiMismatchError() }, new Date('2026-11-13T14:06:00Z'));
    const trace = readTrace();
    expect(trace).toHaveLength(2);
    expect(trace[0]).toEqual({ at: '2026-11-13T14:05Z', event: 'app-started', version: '0.2.2', build: 'development' });
    expect(trace[1]).toMatchObject({ event: 'unlock-failed', stage: 'open-database', error: { category: 'native-module-version' } });
    expectClean(fs.readFileSync(file, 'utf8'));
    expect(fs.readFileSync(file, 'utf8')).not.toContain('compiled against');
  });

  it('keeps only the most recent entries', () => {
    for (let i = 0; i < MAX_ENTRIES + 15; i++) recordEvent('unlock-wrong-password');
    expect(readTrace()).toHaveLength(MAX_ENTRIES);
  });

  it('turns an unknown detail into "other"', () => {
    recordEvent('renderer-gone', { detail: SECRET });
    expect(readTrace()[0].detail).toBe('other');
  });

  it('re-validates a hand-edited file before anything reads it', () => {
    fs.writeFileSync(
      file,
      JSON.stringify([
        { at: '2026-11-13T14:05Z', event: 'unlock-failed', stage: SECRET, detail: SECRET, version: SECRET, note: SECRET,
          error: { category: SECRET, type: SECRET, code: 'ENOENT', frames: [`at ${SECRET} "quoted"`, 'ok (main/index.js:1:1)'], message: SECRET } },
        { at: SECRET, event: 'app-started' },
        { at: '2026-11-13T14:05Z', event: SECRET },
        SECRET,
      ]),
    );
    const trace = readTrace();
    expect(trace).toEqual([
      { at: '2026-11-13T14:05Z', event: 'unlock-failed', detail: 'other',
        error: { category: 'other', type: 'other', code: 'ENOENT', frames: ['ok (main/index.js:1:1)'] } },
    ]);
  });

  it('survives a corrupt file', () => {
    fs.writeFileSync(file, '{not json');
    expect(readTrace()).toEqual([]);
    recordEvent('unlock-succeeded');
    expect(readTrace()).toHaveLength(1);
  });
});

describe('vaultFileFacts', () => {
  it('reports sizes as buckets and placeholders and leftovers as yes/no facts', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sourcerer-vf-'));
    const db = path.join(dir, 'db.sqlite');
    const salt = path.join(dir, 'salt');
    expect(vaultFileFacts(db, salt)).toEqual({ database: 'missing', keyFile: 'missing', leftoverKeyFile: false, journal: false });
    fs.writeFileSync(db, '');
    fs.writeFileSync(salt, Buffer.alloc(10));
    fs.writeFileSync(salt + '.tmp', Buffer.alloc(32));
    expect(vaultFileFacts(db, salt)).toEqual({
      database: sizeBucket(0),
      keyFile: 'unexpected size',
      leftoverKeyFile: true,
      journal: false,
    });
    expect(sizeBucket(0)).toContain('placeholder');
    expect(sizeBucket(5 * 1024 ** 2)).toBe('1 to 10 MB');
    await fsp.rm(dir, { recursive: true, force: true });
  });
});

describe('the report, locked and unlocked', { timeout: 30_000 }, () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), `sourcerer-report-${ACCOUNT}-`));
    state.userData = dir;
    setTraceFilePath(path.join(dir, 'diagnostics-trace.json'));
    // A real encrypted vault in the default location, holding a planted secret.
    fs.writeFileSync(path.join(dir, 'sourcerer.salt'), crypto.randomBytes(32));
    const keyHex = crypto.randomBytes(32).toString('hex');
    initDatabase(path.join(dir, 'sourcerer.db'), keyHex);
    getDatabase()
      .prepare('INSERT INTO contacts (id, name, notes, created_at, updated_at) VALUES (?, ?, ?, 0, 0)')
      .run('c1', SECRET, `${ACCOUNT}@example.com`);
    recordEvent('app-started', { version: '0.2.2', build: 'installed' });
    recordEvent('unlock-failed', { stage: 'open-database', error: abiMismatchError() });
  });

  afterEach(async () => {
    closeDatabase();
    setTraceFilePath(null);
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('is built while unlocked, with the database version and no vault content', async () => {
    const text = renderReport(await gatherReport());
    expect(text).toContain('- Vault: unlocked');
    expect(text).toMatch(/- Database version: \d+ \(this app expects \d+\)/);
    expect(text).toContain('- Database engine: works');
    expect(text).toContain('- Key derivation (Argon2): works');
    expect(text).toContain('- Location: loose files');
    expect(text).toContain('built for module version 127, this app needs 140');
    expect(text).toContain('`new Database (better-sqlite3-multiple-ciphers/lib/database.js:48:64)`');
    expectClean(text);
    expect(text).not.toContain('example.com');
  });

  it('is built while locked', async () => {
    closeDatabase();
    const text = renderReport(await gatherReport());
    expect(text).toContain('- Vault: locked');
    expect(text).toContain('not readable while locked');
    expect(text).toContain('- Key file: present, expected size');
    expect(text).toMatch(/- Database file: present, /);
    expect(text).toContain('Unlock failed · while opening the database');
    expectClean(text);
  });
});

describe('unlockDatabase errors', { timeout: 30_000 }, () => {
  let dir: string;
  let dbPath: string;
  let keyHex: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sourcerer-open-'));
    dbPath = path.join(dir, 'db.sqlite');
    keyHex = crypto.randomBytes(32).toString('hex');
    initDatabase(dbPath, keyHex);
    closeDatabase();
  });

  afterEach(async () => {
    closeDatabase();
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('throws WrongKeyError for a wrong key', () => {
    expect(() => unlockDatabase(dbPath, crypto.randomBytes(32).toString('hex'))).toThrow(WrongKeyError);
  });

  it('throws MigrationError, not a key error, when a migration fails', () => {
    const db = unlockDatabase(dbPath, keyHex);
    // Break the table the version-2 migration backfills from, then rewind.
    db.exec('DROP TABLE interaction_log_entries; CREATE TABLE interaction_log_entries (id TEXT)');
    db.pragma('user_version = 1');
    closeDatabase();
    let thrown: unknown;
    try {
      unlockDatabase(dbPath, keyHex);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(MigrationError);
    expect(errorFacts(thrown).original?.code).toMatch(/^SQLITE_/);
  });
});
