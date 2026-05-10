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

  // Migrate existing databases: add shared_pending_writes to projects if missing
  try {
    db.exec('ALTER TABLE projects ADD COLUMN shared_pending_writes INTEGER NOT NULL DEFAULT 0');
  } catch {}

  // Migrate existing databases: add idle_timeout_seconds if missing
  try {
    db.exec('ALTER TABLE users ADD COLUMN idle_timeout_seconds INTEGER NOT NULL DEFAULT 900');
  } catch {
    // Column already exists or table not yet created — both are fine
  }

  // Migrate existing databases: add phone_country if missing
  try {
    db.exec("ALTER TABLE users ADD COLUMN phone_country TEXT NOT NULL DEFAULT 'CA'");
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

  // Migrate existing databases: add notification toggle columns if missing
  try {
    db.exec('ALTER TABLE users ADD COLUMN alert_notifications_enabled INTEGER NOT NULL DEFAULT 1');
  } catch {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN reminder_notifications_enabled INTEGER NOT NULL DEFAULT 1');
  } catch {}

  // Migrate existing databases: add dismissed column to contact_alert_mentions if missing
  try {
    db.exec('ALTER TABLE contact_alert_mentions ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0');
  } catch {}

  // Migrate existing databases: add auto-outreach columns to reminders if missing
  try {
    db.exec('ALTER TABLE reminders ADD COLUMN membership_id TEXT');
  } catch {}
  try {
    db.exec('ALTER TABLE reminders ADD COLUMN is_auto_outreach INTEGER NOT NULL DEFAULT 0');
  } catch {}

  // Migrate existing databases: add audit_log table if missing
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL,
      actor TEXT, occurred_at INTEGER NOT NULL, details TEXT
    )`);
  } catch {}

  // Enforce unique (contact_id, project_id) on existing databases
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_contact_project ON project_memberships(contact_id, project_id)');
  } catch {}

  // Set default outreach intervals for built-in priority levels where not yet configured
  try {
    const defaults: Array<[string, number]> = [
      ['Critical', 7], ['High', 14], ['Medium', 28], ['Low', 60],
    ];
    for (const [label, days] of defaults) {
      db.prepare(
        'UPDATE priority_options SET outreach_interval_days = ? WHERE label = ? AND outreach_interval_days IS NULL',
      ).run(days, label);
    }
  } catch {}

  // Migrate existing databases: add label to contact_phones if missing
  try {
    db.prepare('ALTER TABLE contact_phones ADD COLUMN label TEXT').run();
  } catch {}

  // Migrate existing databases: add outreach_require_interaction if missing
  try {
    db.exec('ALTER TABLE users ADD COLUMN outreach_require_interaction INTEGER NOT NULL DEFAULT 1');
  } catch {}

  // Migrate existing databases: update Low priority interval to 60 days (every two months)
  try {
    db.prepare(`UPDATE priority_options SET outreach_interval_days = 60 WHERE label = 'Low'`).run();
  } catch {}

  // Migrate existing databases: add contact_screenshots table if missing
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS contact_screenshots (
      id          TEXT    PRIMARY KEY,
      contact_id  TEXT    NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      tab_url     TEXT,
      file_path   TEXT    NOT NULL,
      iv          TEXT    NOT NULL,
      captured_at INTEGER NOT NULL
    )`);
  } catch {}

  // Migrate existing databases: add rss_poll_interval_hours if missing
  try {
    db.exec('ALTER TABLE users ADD COLUMN rss_poll_interval_hours INTEGER NOT NULL DEFAULT 6');
  } catch {}

  // Migrate existing databases: add reporter_assigned_at and reporter_conflict if missing
  try {
    db.exec('ALTER TABLE project_memberships ADD COLUMN reporter_assigned_at INTEGER');
  } catch {}
  try {
    db.exec('ALTER TABLE project_memberships ADD COLUMN reporter_conflict INTEGER NOT NULL DEFAULT 0');
  } catch {}

  // Migrate existing databases: add wayback_url to contact_links if missing
  try {
    db.exec('ALTER TABLE contact_links ADD COLUMN wayback_url TEXT');
  } catch {}

  try { db.exec('ALTER TABLE reminders ADD COLUMN completed_at INTEGER'); } catch {}

  try { db.exec('ALTER TABLE contact_emails ADD COLUMN label TEXT'); } catch {}

  try { db.exec('ALTER TABLE users ADD COLUMN wayback_enabled INTEGER NOT NULL DEFAULT 1'); } catch {}
  try { db.exec('ALTER TABLE projects ADD COLUMN last_synced_at INTEGER'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN last_rss_fetched_at INTEGER'); } catch {}

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS dedup_dismissed_pairs (
      contact_a_id TEXT NOT NULL,
      contact_b_id TEXT NOT NULL,
      dismissed_at INTEGER NOT NULL,
      PRIMARY KEY (contact_a_id, contact_b_id)
    )`);
  } catch {}

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS membership_reporters (
      id             TEXT PRIMARY KEY,
      membership_id  TEXT NOT NULL REFERENCES project_memberships(id) ON DELETE CASCADE,
      reporter_email TEXT NOT NULL,
      reporter_name  TEXT NOT NULL,
      UNIQUE(membership_id, reporter_email)
    )`);
    db.exec(`INSERT OR IGNORE INTO membership_reporters (id, membership_id, reporter_email, reporter_name)
      SELECT lower(hex(randomblob(16))), id, reporter_email, reporter_name
      FROM project_memberships WHERE reporter_email IS NOT NULL AND reporter_email != ''`);
  } catch {}

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
