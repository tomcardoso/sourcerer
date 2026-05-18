import fs from 'node:fs';
import { app } from 'electron';
import Database from 'better-sqlite3-multiple-ciphers';
import { SHARED_SCHEMA_SQL } from './shared-schema';

// Returns true if version string `a` is >= `b` (simple semver comparison).
// Strips leading `v` and any pre-release/build suffix before parsing so that
// strings like `v0.2.0` or `0.2.0-beta.1` don't produce NaN in Number().
function semverGte(a: string, b: string): boolean {
  const clean = (v: string) => v.replace(/^v/, '').replace(/[-+].*$/, '');
  const pa = clean(a).split('.').map(Number);
  const pb = clean(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return true;
}

// Bump this whenever you add a new migration block in runSharedMigrations,
// and update SHARED_SCHEMA_SQL to include the change for new files.
const SHARED_DB_VERSION = 1;

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

  // Version check runs AFTER migrations by design: an old client skips migration
  // blocks it doesn't know about (user_version is already high enough), so no
  // harm is done before we get here. The new client that ran the migration is
  // the one responsible for setting min_app_version inside that block.
  // Check that this client is new enough to open the shared DB.
  const metaRow = db.prepare(
    `SELECT value FROM shared_meta WHERE key = 'min_app_version'`
  ).get() as { value: string } | undefined;
  if (metaRow) {
    const current = app.getVersion();
    if (!semverGte(current, metaRow.value)) {
      db.close();
      throw new Error(
        `This shared project requires Sourcerer v${metaRow.value} or later. Please update the app.`
      );
    }
  }

  return db;
}

/**
 * Applies any pending schema migrations to an existing shared DB.
 * Uses user_version as the migration counter, mirroring the local DB pattern.
 *
 * POLICY: all future shared schema migrations MUST be backwards-compatible.
 * Only add nullable columns or columns with defaults — never NOT NULL without
 * a default. This ensures older clients can still open the DB; they will
 * silently ignore columns they don't know about rather than hard-failing.
 * When a migration requires a minimum app version, upsert `min_app_version`
 * into shared_meta inside that migration block so older clients get a clear
 * error on open rather than silent data corruption.
 *
 * To add a migration:
 *   1. Increment the version check and add the block below.
 *   2. Update shared-schema.ts so brand-new shared DBs already include the change.
 *   3. If the migration requires a newer client, upsert min_app_version.
 */
function runSharedMigrations(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 1) {
    db.pragma('user_version = 1');
  }
  // Future migration blocks go here. Example:
  // if (version < 2) {
  //   db.prepare('ALTER TABLE contacts ADD COLUMN foo TEXT').run();
  //   db.prepare(
  //     `INSERT OR REPLACE INTO shared_meta (key, value) VALUES ('min_app_version', '0.2.0')`
  //   ).run();
  //   // Note: always use INSERT OR REPLACE here, not ON CONFLICT ... WHERE value > ...,
  //   // because SQLite compares TEXT lexicographically and '0.9.0' > '0.10.0' is true.
  //   db.pragma('user_version = 2');
  // }
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
  db.pragma(`user_version = ${SHARED_DB_VERSION}`);
  // Record the creating client's version so older clients get a clear error
  // if a future migration ever requires a minimum app version.
  db.prepare(
    `INSERT OR REPLACE INTO shared_meta (key, value) VALUES ('created_by_version', ?)`
  ).run(app.getVersion());
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

export function rekeySharedDb(projectId: string, filePath: string, oldKeyHex: string, newKeyHex: string): void {
  let db = connections.get(projectId);
  if (!db) {
    db = openRaw(filePath, oldKeyHex);
  }
  try {
    db.pragma(`rekey="x'${newKeyHex}'"`);
  } finally {
    try { db.close(); } catch { /* ignore */ }
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
