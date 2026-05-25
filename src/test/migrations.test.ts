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
});
