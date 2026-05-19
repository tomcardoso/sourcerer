import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3-multiple-ciphers';
import { v4 as uuidv4 } from 'uuid';
import { SHARED_SCHEMA_SQL } from '../main/database/shared-schema';
import { syncProject } from '../main/sync/engine';
import { createTestDb, insertProject, insertContact } from './vitest.setup';

const NOW = Math.floor(Date.now() / 1000);

function createSharedDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SHARED_SCHEMA_SQL);
  return db;
}

function sharedInsertContact(
  db: Database.Database,
  id: string,
  name: string,
  opts: { emails?: string[]; phones?: string[]; updatedAt?: number } = {},
): void {
  const ts = opts.updatedAt ?? NOW;
  db.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, ts, ts);
  (opts.emails ?? []).forEach((email, i) =>
    db.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), id, email, i, ts),
  );
  (opts.phones ?? []).forEach((phone, i) =>
    db.prepare('INSERT INTO contact_phones (id, contact_id, phone, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), id, phone, i, ts),
  );
}

function sharedInsertMembership(
  db: Database.Database,
  id: string,
  contactId: string,
  opts: { reporterEmail?: string; reporterName?: string; updatedAt?: number } = {},
): void {
  const ts = opts.updatedAt ?? NOW;
  db.prepare(
    'INSERT INTO project_memberships (id, contact_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, contactId, opts.reporterEmail ?? 'r@r.com', opts.reporterName ?? 'Reporter', ts, ts);
}

function localInsertMembership(
  db: Database.Database,
  contactId: string,
  projectId: string,
  opts: { id?: string; updatedAt?: number } = {},
): string {
  const id = opts.id ?? uuidv4();
  const ts = opts.updatedAt ?? NOW - 10;
  db.prepare(
    'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, contactId, projectId, 'r@r.com', 'Reporter', ts, ts);
  return id;
}

// ---------------------------------------------------------------------------

describe('syncProject — contact identity matching', () => {
  it('adopts shared UUID when local contact matches by email, no duplicate', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test Project');

    const localContactId = insertContact(localDb, 'Alice', { emails: ['alice@example.com'] });
    localInsertMembership(localDb, localContactId, projectId);

    const sharedContactId = uuidv4();
    sharedInsertContact(sharedDb, sharedContactId, 'Alice', { emails: ['alice@example.com'], updatedAt: NOW });
    sharedInsertMembership(sharedDb, uuidv4(), sharedContactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const contacts = localDb.prepare('SELECT id FROM contacts WHERE name = ?').all('Alice') as { id: string }[];
    expect(contacts).toHaveLength(1);
    expect(contacts[0].id).toBe(sharedContactId);
  });

  it('adopts shared UUID when local contact matches by phone, no duplicate', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test Project');

    const localContactId = insertContact(localDb, 'Bob', { phones: ['+15551234567'] });
    localInsertMembership(localDb, localContactId, projectId);

    const sharedContactId = uuidv4();
    sharedInsertContact(sharedDb, sharedContactId, 'Bob', { phones: ['+15551234567'], updatedAt: NOW });
    sharedInsertMembership(sharedDb, uuidv4(), sharedContactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const contacts = localDb.prepare('SELECT id FROM contacts WHERE name = ?').all('Bob') as { id: string }[];
    expect(contacts).toHaveLength(1);
    expect(contacts[0].id).toBe(sharedContactId);
  });

  it('adopts correct UUIDs when two shared contacts each match a different local contact', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test Project');

    const localId1 = insertContact(localDb, 'Alice', { emails: ['alice@example.com'] });
    const localId2 = insertContact(localDb, 'Bob', { emails: ['bob@example.com'] });
    localInsertMembership(localDb, localId1, projectId);
    localInsertMembership(localDb, localId2, projectId);

    const sharedId1 = uuidv4();
    const sharedId2 = uuidv4();
    sharedInsertContact(sharedDb, sharedId1, 'Alice', { emails: ['alice@example.com'], updatedAt: NOW });
    sharedInsertContact(sharedDb, sharedId2, 'Bob', { emails: ['bob@example.com'], updatedAt: NOW });
    sharedInsertMembership(sharedDb, uuidv4(), sharedId1);
    sharedInsertMembership(sharedDb, uuidv4(), sharedId2);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const ids = (localDb.prepare('SELECT id FROM contacts ORDER BY name').all() as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(sharedId1);
    expect(ids).toContain(sharedId2);
    expect(ids).not.toContain(localId1);
    expect(ids).not.toContain(localId2);
  });

  it('inserts shared contact as new when identity signals are ambiguous (multi-match)', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test Project');

    // Two separate local contacts each owning one of the shared contact's emails
    const localId1 = insertContact(localDb, 'Alice1', { emails: ['a1@example.com'] });
    const localId2 = insertContact(localDb, 'Alice2', { emails: ['a2@example.com'] });
    localInsertMembership(localDb, localId1, projectId);
    localInsertMembership(localDb, localId2, projectId);

    // Shared contact has both emails — candidateIds.size === 2, so no adoption
    const sharedId = uuidv4();
    sharedInsertContact(sharedDb, sharedId, 'Alice', { emails: ['a1@example.com', 'a2@example.com'], updatedAt: NOW });
    sharedInsertMembership(sharedDb, uuidv4(), sharedId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const all = localDb.prepare('SELECT id FROM contacts').all() as { id: string }[];
    // Alice1, Alice2, and the genuinely new Alice from shared
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.id)).toContain(sharedId);
  });

  it('does not double-adopt when two shared contacts match the same local contact', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test Project');

    const localContactId = insertContact(localDb, 'Alice', { emails: ['alice@example.com'] });
    localInsertMembership(localDb, localContactId, projectId);

    // Two shared contacts both carrying the same email as the local contact
    const sharedId1 = uuidv4();
    const sharedId2 = uuidv4();
    sharedInsertContact(sharedDb, sharedId1, 'Alice A', { emails: ['alice@example.com'], updatedAt: NOW });
    sharedInsertContact(sharedDb, sharedId2, 'Alice B', { emails: ['alice@example.com'], updatedAt: NOW });
    sharedInsertMembership(sharedDb, uuidv4(), sharedId1);
    sharedInsertMembership(sharedDb, uuidv4(), sharedId2);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const all = localDb.prepare('SELECT id FROM contacts').all() as { id: string }[];
    // One local adopted by first shared contact + second shared contact inserted as new
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.id)).not.toContain(localContactId);
  });
});

describe('syncProject — membership conflict guard', () => {
  it('preserves interaction log entries when conflicting membership is replaced', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test Project');

    const localContactId = insertContact(localDb, 'Carol', { emails: ['carol@example.com'] });
    const localMembershipId = localInsertMembership(localDb, localContactId, projectId, { updatedAt: NOW - 100 });

    // Local interaction log entry under the local membership
    const logEntryId = uuidv4();
    localDb.prepare(
      'INSERT INTO interaction_log_entries (id, membership_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(logEntryId, localMembershipId, 'r@r.com', 'Reporter', 'Called on Monday', NOW - 50);

    // Shared DB: same contact (matched by email) under a different membership UUID
    const sharedContactId = uuidv4();
    const sharedMembershipId = uuidv4();
    sharedInsertContact(sharedDb, sharedContactId, 'Carol', { emails: ['carol@example.com'], updatedAt: NOW });
    sharedInsertMembership(sharedDb, sharedMembershipId, sharedContactId, { updatedAt: NOW });

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    // Contact adopted shared UUID
    const contact = localDb.prepare('SELECT id FROM contacts WHERE name = ?').get('Carol') as { id: string } | undefined;
    expect(contact?.id).toBe(sharedContactId);

    // Old local membership gone, shared membership present
    expect(localDb.prepare('SELECT id FROM project_memberships WHERE id = ?').get(localMembershipId)).toBeUndefined();
    expect(localDb.prepare('SELECT id FROM project_memberships WHERE id = ?').get(sharedMembershipId)).toBeDefined();

    // Interaction log entry re-attached to shared membership
    const entry = localDb.prepare('SELECT membership_id FROM interaction_log_entries WHERE id = ?').get(logEntryId) as { membership_id: string } | undefined;
    expect(entry?.membership_id).toBe(sharedMembershipId);
  });
});
