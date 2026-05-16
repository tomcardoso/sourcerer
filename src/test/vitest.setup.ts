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
  opts: { emails?: string[]; phones?: string[]; org?: string; notes?: string; title?: string; handles?: { type: string; handle: string }[] } = {},
): string {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO contacts (id, name, organization, title, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, name, opts.org ?? null, opts.title ?? null, opts.notes ?? null, now, now);
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
