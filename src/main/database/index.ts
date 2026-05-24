import Database from 'better-sqlite3-multiple-ciphers';
import { is } from '@electron-toolkit/utils';
import { LOCAL_SCHEMA_SQL } from './schema';
import { seedDefaults } from './seeds';
import { seedDevData } from './dev-seeds';

let activeDb: Database.Database | null = null;
let activeKeyHex: string | null = null;
let activePassword: string | null = null;

function openRaw(dbPath: string, keyHex: string): Database.Database {
  const db = new Database(dbPath);

  // All cipher settings must be set before key pragma; these pin SQLCipher 4 parameters
  // explicitly so behaviour doesn't change if library defaults are ever revised.
  db.pragma(`cipher='sqlcipher'`);
  db.pragma('cipher_page_size=4096');
  db.pragma('kdf_iter=256000');
  db.pragma('cipher_hmac_algorithm=HMAC_SHA512');
  db.pragma('cipher_kdf_algorithm=PBKDF2_HMAC_SHA512');
  db.pragma(`key="x'${keyHex}'"`);

  // Verify the key is correct — wrong key throws "file is not a database"
  try {
    db.pragma('user_version');
  } catch {
    db.close();
    throw new Error('Incorrect password or corrupted database.');
  }

  // Must be set per-connection — not persisted in the file
  db.pragma('foreign_keys = ON');

  return db;
}

/** First-launch only: open + run schema + seed defaults + set active connection. */
export function initDatabase(dbPath: string, keyHex: string): Database.Database {
  const db = openRaw(dbPath, keyHex);
  // Wrap schema creation, seeding, and version stamp in a single transaction so
  // that a seed failure rolls back the entire schema, leaving a clean slate for
  // the next unlock attempt (fixes #201).
  db.transaction(() => {
    db.exec(LOCAL_SCHEMA_SQL);
    seedDefaults(db);
    db.pragma(`user_version = ${DB_VERSION}`);
  })();
  activeDb = db;
  activeKeyHex = keyHex;
  return db;
}

/** Called once per unlock after the user row is guaranteed to exist. */
export function maybeRunDevSeeds(db: Database.Database): void {
  if (!is.dev) return;
  const u = db.prepare('SELECT first_name, last_name, email, dev_seeded FROM users WHERE id = 1').get() as
    | { first_name: string; last_name: string; email: string; dev_seeded: number }
    | undefined;
  if (!u || u.dev_seeded) return;
  seedDevData(db, u.email, `${u.first_name} ${u.last_name}`.trim());
}

/** Subsequent unlocks: open existing encrypted DB + set active connection. */
export function unlockDatabase(dbPath: string, keyHex: string): Database.Database {
  const db = openRaw(dbPath, keyHex);
  runMigrations(db);
  activeDb = db;
  activeKeyHex = keyHex;
  return db;
}

export function getDatabase(): Database.Database {
  if (!activeDb) throw new Error('Database is not open.');
  return activeDb;
}

export function getKeyHex(): string {
  if (!activeKeyHex) throw new Error('Database is not open.');
  return activeKeyHex;
}

export function updateActiveKeyHex(newKeyHex: string): void {
  activeKeyHex = newKeyHex;
}

export function getPassword(): string {
  if (!activePassword) throw new Error('Database is not open.');
  return activePassword;
}

export function setActivePassword(password: string): void {
  activePassword = password;
}

export function closeDatabase(): void {
  if (activeDb) {
    activeDb.close();
    activeDb = null;
    activeKeyHex = null;
    activePassword = null;
  }
}

export function isDatabaseOpen(): boolean {
  return activeDb !== null;
}

// Increment when adding a new migration block below.
const DB_VERSION = 1;

/**
 * Runs schema migrations against an existing database using user_version as
 * the migration counter. Each numbered block is applied exactly once.
 * New databases skip all migrations because initDatabase stamps user_version
 * to DB_VERSION immediately after running the full schema SQL.
 *
 * To add a migration:
 *   1. Increment DB_VERSION.
 *   2. Add an `if (version < N) { ... db.pragma('user_version = N'); }` block below.
 *   3. Update schema.ts so brand-new databases already include the change.
 */
/** Exported for test instrumentation only; callers should use unlockDatabase. */
export function runMigrations(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version >= DB_VERSION) return;

  // No migration blocks yet — all schema changes so far are baked into the
  // initial schema SQL, so existing pre-production databases can be recreated.
  // Wrap in a transaction to establish the correct pattern: when real migration
  // DDL blocks are added, each block must stamp user_version atomically with its
  // DDL so a mid-migration crash cannot leave the DB partially migrated (fixes #207).
  db.transaction(() => {
    db.pragma(`user_version = ${DB_VERSION}`);
  })();
}

