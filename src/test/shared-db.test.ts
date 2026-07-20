import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3-multiple-ciphers';
import { SHARED_SCHEMA_SQL } from '../main/database/shared-schema';
import { createSharedDb, openSharedDb, closeSharedDb, rekeySharedDb, getSharedDb, closeAllSharedDbs } from '../main/database/shared-db';

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.0.0-test') },
}));

const tmpDirs: string[] = [];

afterEach(() => {
  closeAllSharedDbs();
  tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
  tmpDirs.length = 0;
});

function makeTempDb(keyHex: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sourcerer-rekey-'));
  tmpDirs.push(dir);
  const filePath = join(dir, 'shared.sourcerer');
  const db = new Database(filePath);
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`key="x'${keyHex}'"`);
  db.pragma('foreign_keys = ON');
  db.exec(SHARED_SCHEMA_SQL);
  db.pragma('user_version = 1');
  db.close();
  return filePath;
}

function tryOpen(filePath: string, keyHex: string): void {
  const db = new Database(filePath);
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`key="x'${keyHex}'"`);
  try {
    db.pragma('user_version'); // forces actual decryption
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

// Rekeying re-encrypts every page and re-runs the PBKDF2-HMAC-SHA512 KDF, which
// is genuinely slow — ~3s for this file on Windows CI runners even before other
// suites compete for the same cores. The 5s default is not enough headroom there.
describe('rekeySharedDb', { timeout: 30_000 }, () => {
  it('re-encrypts the file so the new key opens it and the old key does not', () => {
    const oldKeyHex = randomBytes(32).toString('hex');
    const newKeyHex = randomBytes(32).toString('hex');
    const filePath = makeTempDb(oldKeyHex);

    rekeySharedDb('proj-1', filePath, oldKeyHex, newKeyHex);

    expect(() => tryOpen(filePath, oldKeyHex)).toThrow();
    expect(() => tryOpen(filePath, newKeyHex)).not.toThrow();
  });

  it('evicts the connection from the cache after rekeying', () => {
    const oldKeyHex = randomBytes(32).toString('hex');
    const newKeyHex = randomBytes(32).toString('hex');
    const filePath = makeTempDb(oldKeyHex);

    rekeySharedDb('proj-2', filePath, oldKeyHex, newKeyHex);

    expect(getSharedDb('proj-2')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createSharedDb / openSharedDb round-trip with pinned SQLCipher pragmas
// ---------------------------------------------------------------------------

describe('createSharedDb / openSharedDb', () => {
  function makeTempPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'sourcerer-shared-'));
    tmpDirs.push(dir);
    return join(dir, 'shared.sourcerer');
  }

  it('file created by createSharedDb can be re-opened by openSharedDb', () => {
    const keyHex = randomBytes(32).toString('hex');
    const filePath = makeTempPath();

    createSharedDb(filePath, keyHex, 'rt-1');
    closeSharedDb('rt-1');

    const db = openSharedDb(filePath, keyHex, 'rt-1');
    expect(() => db.pragma('user_version')).not.toThrow();
  });

  it('openSharedDb rejects a wrong key on a pinned-pragma DB', () => {
    const keyHex = randomBytes(32).toString('hex');
    const wrongKeyHex = randomBytes(32).toString('hex');
    const filePath = makeTempPath();

    createSharedDb(filePath, keyHex, 'rt-2');
    closeSharedDb('rt-2');

    expect(() => openSharedDb(filePath, wrongKeyHex, 'rt-3')).toThrow();
  });
});
