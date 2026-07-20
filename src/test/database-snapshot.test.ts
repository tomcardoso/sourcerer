import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import Database from 'better-sqlite3-multiple-ciphers';
import { initDatabase, closeDatabase, snapshotDatabase, applyCipherPragmas, getDatabase, DB_VERSION } from '../main/database';

// Guards against a future change silently producing an unencrypted backup.
const SECRET = 'SNAPSHOT_TEST_SECRET_MARKER_9f3a';

describe('snapshotDatabase', () => {
  let tmpDir: string;
  let keyHex: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sourcerer-snaptest-'));
    keyHex = crypto.randomBytes(32).toString('hex');
    initDatabase(path.join(tmpDir, 'db.sqlite'), keyHex);
    getDatabase()
      .prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('test-contact-1', SECRET, 0, 0);
  });

  afterEach(async () => {
    closeDatabase();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('is readable with the correct key and contains the source rows', () => {
    const destPath = path.join(tmpDir, 'snapshot.db');
    snapshotDatabase(destPath);

    const snapDb = new Database(destPath);
    applyCipherPragmas(snapDb, keyHex);
    const row = snapDb.prepare('SELECT name FROM contacts WHERE id = ?').get('test-contact-1') as { name: string };
    snapDb.close();

    expect(row.name).toBe(SECRET);
  });

  it('preserves user_version', () => {
    const destPath = path.join(tmpDir, 'snapshot-version.db');
    snapshotDatabase(destPath);

    const snapDb = new Database(destPath);
    applyCipherPragmas(snapDb, keyHex);
    const version = snapDb.pragma('user_version', { simple: true }) as number;
    snapDb.close();

    expect(version).toBe(DB_VERSION);
  });

  it('is not a plaintext SQLite file', async () => {
    const destPath = path.join(tmpDir, 'snapshot-secure.db');
    snapshotDatabase(destPath);

    const raw = await fs.readFile(destPath);
    expect(raw.subarray(0, 15).toString('utf8')).not.toBe('SQLite format 3');
    expect(raw.includes(Buffer.from(SECRET, 'utf8'))).toBe(false);
  });

  it('works when the destination path contains an apostrophe', () => {
    const destPath = path.join(tmpDir, "Tom's Backups snap'shot.db");
    snapshotDatabase(destPath);

    const snapDb = new Database(destPath);
    applyCipherPragmas(snapDb, keyHex);
    const row = snapDb.prepare('SELECT name FROM contacts WHERE id = ?').get('test-contact-1') as { name: string };
    snapDb.close();

    expect(row.name).toBe(SECRET);
  });
});
