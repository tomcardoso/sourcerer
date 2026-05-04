import Database from 'better-sqlite3-multiple-ciphers';
import { LOCAL_SCHEMA_SQL } from './schema';
import { seedDefaults } from './seeds';

let activeDb: Database.Database | null = null;

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
  return db;
}

/** Subsequent unlocks: open existing encrypted DB + set active connection. */
export function unlockDatabase(dbPath: string, keyHex: string): Database.Database {
  const db = openRaw(dbPath, keyHex);
  activeDb = db;
  return db;
}

export function getDatabase(): Database.Database {
  if (!activeDb) throw new Error('Database is not open.');
  return activeDb;
}

export function closeDatabase(): void {
  if (activeDb) {
    activeDb.close();
    activeDb = null;
  }
}

export function isDatabaseOpen(): boolean {
  return activeDb !== null;
}
