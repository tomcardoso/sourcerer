import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3-multiple-ciphers';
import { LOCAL_SCHEMA_SQL } from '../main/database/schema';
import { seedDefaults } from '../main/database/seeds';
import { runMigrations, DB_VERSION } from '../main/database';
import { createDbAtVersion } from './vitest.setup';

function createBaseDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(LOCAL_SCHEMA_SQL);
  seedDefaults(db);
  return db;
}

describe('runMigrations', () => {
  it('stamps user_version to DB_VERSION on a v0 database', () => {
    const db = createBaseDb();
    db.pragma('user_version = 0');
    runMigrations(db);
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(DB_VERSION);
    db.close();
  });

  it('is idempotent — running twice leaves version unchanged', () => {
    const db = createBaseDb();
    db.pragma('user_version = 0');
    runMigrations(db);
    runMigrations(db);
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(DB_VERSION);
    db.close();
  });

  it('skips migrations when the database is already at DB_VERSION', () => {
    const db = createBaseDb();
    db.pragma(`user_version = ${DB_VERSION}`);
    runMigrations(db);
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(DB_VERSION);
    db.close();
  });

  it('skips migrations when the database is ahead of DB_VERSION (forward compatibility)', () => {
    const db = createBaseDb();
    db.pragma('user_version = 99');
    runMigrations(db);
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(99);
    db.close();
  });

  // Per-migration-step tests go here. For each new migration block in index.ts:
  //   1. Call createDbAtVersion(N - 1) to get a DB stamped at the previous version.
  //   2. Manually DROP or ALTER the table to reproduce the pre-migration schema.
  //   3. Call runMigrations(db) and assert the new column / table / index now exists.
  //   4. Assert user_version === N.
  // Example:
  //   it('migration 2: adds foo column to contacts', () => {
  //     const db = createDbAtVersion(1);
  //     db.prepare('ALTER TABLE contacts DROP COLUMN foo').run();
  //     runMigrations(db);
  //     const cols = db.pragma('table_info(contacts)') as { name: string }[];
  //     expect(cols.some((c) => c.name === 'foo')).toBe(true);
  //     expect(db.pragma('user_version', { simple: true })).toBe(2);
  //   });

  describe('migration 2: self-heals schema drift + adds interaction_log_entries.updated_at', () => {
    it('recreates a table that was missing because it was added to schema.ts after this DB was created', () => {
      // Simulates a real DB created before sync_tombstones/sync_pushed existed:
      // old code only ever stamped user_version, never re-ran the DDL, so those
      // tables were silently absent forever — breaking any write that touched
      // them (e.g. interaction-log:delete, which throws "no such table:
      // sync_tombstones" and rolls back the whole delete).
      const db = createDbAtVersion(1);
      db.exec('DROP TABLE sync_tombstones');
      db.exec('DROP TABLE sync_pushed');

      runMigrations(db);

      expect(() => db.prepare('SELECT * FROM sync_tombstones').all()).not.toThrow();
      expect(() => db.prepare('SELECT * FROM sync_pushed').all()).not.toThrow();
      expect(db.pragma('user_version', { simple: true })).toBe(DB_VERSION);
    });

    it('adds updated_at to interaction_log_entries and backfills it from created_at', () => {
      const db = createDbAtVersion(1);
      db.exec('ALTER TABLE interaction_log_entries DROP COLUMN updated_at');
      db.prepare(
        'INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ).run('c1', 'Alice', 1000, 1000);
      db.prepare(
        'INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('e1', 'c1', 'r@r.com', 'Reporter', 'Old entry', 1234);

      runMigrations(db);

      const cols = db.pragma('table_info(interaction_log_entries)') as { name: string }[];
      expect(cols.some((c) => c.name === 'updated_at')).toBe(true);
      const row = db.prepare('SELECT updated_at FROM interaction_log_entries WHERE id = ?').get('e1') as { updated_at: number };
      expect(row.updated_at).toBe(1234);
      expect(db.pragma('user_version', { simple: true })).toBe(DB_VERSION);
    });

    it('is safe to run when the table already has updated_at (fresh DB)', () => {
      const db = createDbAtVersion(1);
      runMigrations(db);
      const cols = db.pragma('table_info(interaction_log_entries)') as { name: string }[];
      expect(cols.filter((c) => c.name === 'updated_at')).toHaveLength(1);
    });
  });
});
