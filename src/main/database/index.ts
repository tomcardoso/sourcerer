import Database from 'better-sqlite3-multiple-ciphers';
import { is } from '@electron-toolkit/utils';
import { LOCAL_SCHEMA_SQL } from './schema';
import { seedDefaults } from './seeds';
import { seedDevData } from './dev-seeds';

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

  // Migrate existing databases: add idle_timeout_seconds if missing
  try {
    db.exec('ALTER TABLE users ADD COLUMN idle_timeout_seconds INTEGER NOT NULL DEFAULT 900');
  } catch {
    // Column already exists or table not yet created — both are fine
  }

  // Migrate existing databases: add phone_country if missing
  try {
    db.exec("ALTER TABLE users ADD COLUMN phone_country TEXT NOT NULL DEFAULT 'US'");
  } catch {
    // Column already exists or table not yet created — both are fine
  }

  // Migrate existing databases: add outreach_reminders_enabled if missing
  try {
    db.exec('ALTER TABLE users ADD COLUMN outreach_reminders_enabled INTEGER NOT NULL DEFAULT 1');
  } catch {}

  // Migrate existing databases: add outreach_interval_days to priority_options if missing
  try {
    db.exec('ALTER TABLE priority_options ADD COLUMN outreach_interval_days INTEGER');
  } catch {}

  // Migrate existing databases: add outreach columns to project_memberships if missing
  try {
    db.exec('ALTER TABLE project_memberships ADD COLUMN outreach_interval_days INTEGER');
  } catch {}
  try {
    db.exec('ALTER TABLE project_memberships ADD COLUMN outreach_reminders_disabled INTEGER NOT NULL DEFAULT 0');
  } catch {}

  // Migrate existing databases: add staleness columns if missing
  try {
    db.exec('ALTER TABLE users ADD COLUMN staleness_enabled INTEGER NOT NULL DEFAULT 1');
  } catch {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN staleness_threshold_days INTEGER NOT NULL DEFAULT 90');
  } catch {}

  // Migrate link type 'twitter' → 'x' to match architecture spec
  try {
    db.exec("UPDATE contact_links SET type = 'x' WHERE type = 'twitter'");
  } catch {
    // Table not yet created on first launch — fine
  }

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
