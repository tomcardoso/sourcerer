import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3-multiple-ciphers';
import { LOCAL_SCHEMA_SQL } from '../main/database/schema';
import { seedDefaults } from '../main/database/seeds';
import { runMigrations } from '../main/database';

// DB_VERSION is not currently exported from '../main/database', so we derive
// the expected value by migrating a fresh v0 DB. This means the assertions
// automatically track DB_VERSION without hard-coding the literal 1. (#235, #158)
function resolvedDbVersion(): number {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(LOCAL_SCHEMA_SQL);
  db.pragma('user_version = 0');
  runMigrations(db);
  const v = db.pragma('user_version', { simple: true }) as number;
  db.close();
  return v;
}

const DB_VERSION = resolvedDbVersion();

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

  // Skeleton for individual migration-step tests.
  // When DB_VERSION is incremented and the first real migration block is added to
  // src/main/database/index.ts, add a describe block here that:
  //   1. Creates a DB at version N-1 (with the pre-migration schema state).
  //   2. Calls runMigrations(db).
  //   3. Asserts that the new column / table / index exists.
  // For now (DB_VERSION === 1) there are no migration blocks, so this is a no-op
  // placeholder that documents the expected pattern.
  it('no individual migration steps yet — placeholder confirming DB_VERSION is 1', () => {
    expect(DB_VERSION).toBe(1);
  });
});
