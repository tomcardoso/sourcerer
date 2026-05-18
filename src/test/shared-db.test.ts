import { describe, it, expect, afterEach } from 'vitest';
import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3-multiple-ciphers';
import { SHARED_SCHEMA_SQL } from '../main/database/shared-schema';
import { rekeySharedDb, getSharedDb } from '../main/database/shared-db';

const tmpDirs: string[] = [];

afterEach(() => {
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

describe('rekeySharedDb', () => {
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
