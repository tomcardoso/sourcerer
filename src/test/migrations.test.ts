import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3-multiple-ciphers';
import { LOCAL_SCHEMA_SQL } from '../main/database/schema';
import { seedDefaults } from '../main/database/seeds';
import { runMigrations } from '../main/database';

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
    expect(version).toBe(1);
    db.close();
  });

  it('is idempotent — running twice leaves version unchanged', () => {
    const db = createBaseDb();
    db.pragma('user_version = 0');
    runMigrations(db);
    runMigrations(db);
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(1);
    db.close();
  });

  it('skips migrations when the database is already at DB_VERSION', () => {
    const db = createBaseDb();
    db.pragma('user_version = 1');
    runMigrations(db);
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(1);
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
});
