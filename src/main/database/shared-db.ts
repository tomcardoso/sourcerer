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
  db.pragma('busy_timeout = 5000');
  return db;
}

export function createSharedDb(
  filePath: string,
  keyHex: string,
  projectId: string,
): Database.Database {
  const db = openRaw(filePath, keyHex);
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
