import Database from 'better-sqlite3-multiple-ciphers';
import { is } from '@electron-toolkit/utils';
import { LOCAL_SCHEMA_SQL } from './schema';
import { seedDefaults } from './seeds';
import { seedDevData } from './dev-seeds';

let activeDb: Database.Database | null = null;
let activeKeyHex: string | null = null;

function openRaw(dbPath: string, keyHex: string): Database.Database {
  const db = new Database(dbPath);

  // cipher must be set before key for SQLCipher4 compatibility
  db.pragma(`cipher='sqlcipher'`);
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
  db.exec(LOCAL_SCHEMA_SQL);
  seedDefaults(db);
  activeDb = db;
  activeKeyHex = keyHex;
  return db;
}

/** Called once per unlock after the user row is guaranteed to exist. */
export function maybeRunDevSeeds(db: Database.Database): void {
  if (!is.dev) return;
  const u = db.prepare('SELECT first_name, last_name, email FROM users WHERE id = 1').get() as
    | { first_name: string; last_name: string; email: string }
    | undefined;
  if (!u) return;
  seedDevData(db, u.email, `${u.first_name} ${u.last_name}`.trim());
}

/** Subsequent unlocks: open existing encrypted DB + set active connection. */
export function unlockDatabase(dbPath: string, keyHex: string): Database.Database {
  const db = openRaw(dbPath, keyHex);
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

export function closeDatabase(): void {
  if (activeDb) {
    activeDb.close();
    activeDb = null;
    activeKeyHex = null;
  }
}

export function isDatabaseOpen(): boolean {
  return activeDb !== null;
}
