import Database from 'better-sqlite3-multiple-ciphers';
import { LOCAL_SCHEMA_SQL } from './schema';
import { seedDefaults } from './seeds';

let activeDb: Database.Database | null = null;

export function openDatabase(dbPath: string, keyHex: string): Database.Database {
  const db = new Database(dbPath);

  // Must set cipher before key for SQLCipher4 compatibility
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`key="x'${keyHex}'"`);

  // Verify the database opened correctly by reading the schema version
  try {
    db.pragma('user_version');
  } catch {
    db.close();
    throw new Error('Incorrect password or corrupted database.');
  }

  return db;
}

export function initDatabase(dbPath: string, keyHex: string): Database.Database {
  const db = openDatabase(dbPath, keyHex);

  db.exec(LOCAL_SCHEMA_SQL);
  seedDefaults(db);

  activeDb = db;
  return db;
}

export function getDatabase(): Database.Database {
  if (!activeDb) {
    throw new Error('Database is not open.');
  }
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
