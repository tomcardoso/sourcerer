import Database from 'better-sqlite3-multiple-ciphers';
import { v4 as uuidv4 } from 'uuid';
import { LOCAL_SCHEMA_SQL } from '../main/database/schema';
import { seedDefaults } from '../main/database/seeds';

export const TEST_REPORTER = { email: 'r@r.com', name: 'Reporter' };

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(LOCAL_SCHEMA_SQL);
  seedDefaults(db);

  // Stamp user_version so runMigrations() recognises the DB as already current (#228).
  // Must match DB_VERSION in src/main/database/index.ts (currently 1).
  db.pragma('user_version = 1');

  // Insert the required users row (id=1) that many IPC handlers query (#309).
  // seedDefaults() only inserts status/priority options, not the user row.
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT OR IGNORE INTO users
       (id, first_name, last_name, email, created_at, calendar_token, phone_country)
     VALUES (1, 'Test', 'Reporter', 'r@r.com', ?, 'test-token', 'US')`,
  ).run(now);

  return db;
}

export function insertProject(db: Database.Database, name: string): string {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO projects (id, name, description, is_shared, created_at) VALUES (?, ?, NULL, 0, ?)',
  ).run(id, name, Math.floor(Date.now() / 1000));
  return id;
}

export function insertContact(
  db: Database.Database,
  name: string,
  opts: { emails?: string[]; phones?: string[]; org?: string; notes?: string; title?: string; dob?: string; handles?: { type: string; handle: string }[] } = {},
): string {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, name, opts.org ?? null, opts.title ?? null, opts.dob ?? null, opts.notes ?? null, now, now);
  (opts.emails ?? []).forEach((email, i) =>
    db
      .prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), id, email, i),
  );
  (opts.phones ?? []).forEach((phone, i) =>
    db
      .prepare('INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), id, phone, i),
  );
  (opts.handles ?? []).forEach((h, i) =>
    db
      .prepare('INSERT INTO contact_handles (id, contact_id, type, handle, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(uuidv4(), id, h.type, h.handle, i),
  );
  return id;
}
