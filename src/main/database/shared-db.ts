import fs from 'node:fs';
import Database from 'better-sqlite3-multiple-ciphers';
import { SHARED_SCHEMA_SQL } from './shared-schema';

const connections = new Map<string, Database.Database>();

function openRaw(filePath: string, keyHex: string): Database.Database {
  const db = new Database(filePath);
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`key="x'${keyHex}'"`);
  try {
    db.pragma('user_version');
  } catch {
    db.close();
    throw new Error('Cannot open shared project file — wrong key or corrupted file.');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = DELETE');
  db.pragma('busy_timeout = 5000');
  runSharedMigrations(db);
  return db;
}

/**
 * Applies any pending schema migrations to an existing shared DB.
 * Uses user_version as the migration counter, mirroring the local DB pattern.
 *
 * To add a migration:
 *   1. Add an `if (version < N) { ... db.pragma('user_version = N'); }` block below.
 *   2. Update shared-schema.ts so brand-new shared DBs already include the change.
 */
function runSharedMigrations(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  // No migration blocks yet — schema changes during pre-production are handled
  // by recreating shared DBs with the updated SHARED_SCHEMA_SQL.
  if (version < 1) {
    db.pragma('user_version = 1');
  }
}

export function createSharedDb(
  filePath: string,
  keyHex: string,
  projectId: string,
): Database.Database {
  // Remove any pre-existing file so we always start with a fresh database.
  // (openRaw's user_version validation is for opening existing files; a new
  // random key will never match whatever encryption an existing file has.)
  try { fs.unlinkSync(filePath); } catch { /* file doesn't exist — fine */ }
  const db = new Database(filePath);
  db.pragma(`cipher='sqlcipher'`);
  db.pragma(`key="x'${keyHex}'"`);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SHARED_SCHEMA_SQL);
  connections.set(projectId, db);
  return db;
}

export function openSharedDb(
  filePath: string,
  keyHex: string,
  projectId: string,
): Database.Database {
  const existing = connections.get(projectId);
  if (existing) return existing;
  const db = openRaw(filePath, keyHex);
  connections.set(projectId, db);
  return db;
}

export function getSharedDb(projectId: string): Database.Database | undefined {
  return connections.get(projectId);
}

export function closeSharedDb(projectId: string): void {
  const db = connections.get(projectId);
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    connections.delete(projectId);
  }
}

export function closeAllSharedDbs(): void {
  for (const [projectId, db] of connections) {
    try {
      db.close();
    } catch {
      // ignore
    }
    connections.delete(projectId);
  }
}
