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

  it('inserts shared contact as new when two local contacts share the same identifier', () => {
    // Guards against the Map<string,string> index collapsing duplicate local entries:
    // if L1 and L2 both have email e@e.com, the index must retain both so candidateIds
    // has size 2 and the ambiguity guard fires correctly.
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test Project');

    // Insert directly so both local contacts share the same email (DB only enforces
    // uniqueness per contact_id, not across contacts)
    const now = Math.floor(Date.now() / 1000);
    const localId1 = uuidv4();
    const localId2 = uuidv4();
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(localId1, 'Dup1', now, now);
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(localId2, 'Dup2', now, now);
    localDb.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)').run(uuidv4(), localId1, 'dup@example.com', 0);
    localDb.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)').run(uuidv4(), localId2, 'dup@example.com', 0);
    localInsertMembership(localDb, localId1, projectId);
    localInsertMembership(localDb, localId2, projectId);

    const sharedId = uuidv4();
    sharedInsertContact(sharedDb, sharedId, 'Dup', { emails: ['dup@example.com'], updatedAt: NOW });
    sharedInsertMembership(sharedDb, uuidv4(), sharedId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const all = localDb.prepare('SELECT id FROM contacts').all() as { id: string }[];
    // Dup1 + Dup2 stay as-is; shared Dup inserted as genuinely new (no adoption)
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.id)).toContain(sharedId);
    expect(all.map((r) => r.id)).toContain(localId1);
    expect(all.map((r) => r.id)).toContain(localId2);
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

    // Local interaction log entry associated with the local membership
    const logEntryId = uuidv4();
    localDb.prepare(
      'INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(logEntryId, localContactId, 'r@r.com', 'Reporter', 'Called on Monday', NOW - 50);
    localDb.prepare(
      'INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)',
    ).run(logEntryId, localMembershipId);

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

    // Interaction log entry still exists (contact_id FK survives) and is re-linked to shared membership
    const entry = localDb.prepare('SELECT id FROM interaction_log_entries WHERE id = ?').get(logEntryId) as { id: string } | undefined;
    expect(entry?.id).toBe(logEntryId);
    const ip = localDb.prepare('SELECT membership_id FROM interaction_projects WHERE interaction_id = ?').get(logEntryId) as { membership_id: string } | undefined;
    expect(ip?.membership_id).toBe(sharedMembershipId);
  });
});

// ---------------------------------------------------------------------------
// Push path: local-only contact appears in shared DB after sync (#263)
// ---------------------------------------------------------------------------

describe('syncProject — push path', () => {
  it('pushes a local contact to the shared DB when it has never been synced', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Push Test Project');

    const localContactId = insertContact(localDb, 'Push Alice', { emails: ['push-alice@example.com'] });
    localInsertMembership(localDb, localContactId, projectId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    // Contact should now exist in the shared DB
    const sharedContact = sharedDb.prepare('SELECT id, name FROM contacts WHERE id = ?').get(localContactId) as { id: string; name: string } | undefined;
    expect(sharedContact).toBeDefined();
    expect(sharedContact!.name).toBe('Push Alice');

    // Email should also be in the shared DB
    const sharedEmail = sharedDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').get(localContactId) as { email: string } | undefined;
    expect(sharedEmail?.email).toBe('push-alice@example.com');
  });

  it('does not re-push an already-synced contact when it has not changed', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Push Test Project 2');

    const localContactId = insertContact(localDb, 'Stable Contact', { emails: ['stable@example.com'] });
    localInsertMembership(localDb, localContactId, projectId);

    // First sync: pushes the contact
    syncProject(localDb, sharedDb, projectId);

    // Overwrite the shared contact name directly to detect if a second push happens
    sharedDb.prepare('UPDATE contacts SET name = ? WHERE id = ?').run('Modified By Other', localContactId);

    // Second sync: the contact's synced_at >= updated_at so it should NOT be pushed again
    syncProject(localDb, sharedDb, projectId);

    const sharedContact = sharedDb.prepare('SELECT name FROM contacts WHERE id = ?').get(localContactId) as { name: string };
    // The shared name was changed externally and the local contact has not been updated,
    // so the push should not have overwritten the shared DB name.
    expect(sharedContact.name).toBe('Modified By Other');
  });
});

// ---------------------------------------------------------------------------
// pullAppendOnly — overlap window reconciliation
// ---------------------------------------------------------------------------

describe('pullAppendOnly — overlap window', () => {
  it('pulls a late-arriving log entry whose created_at falls within the 30s overlap window', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Overlap Test');

    // Pre-seed both DBs with the same contact UUID so syncProject skips UUID adoption.
    const contactId = uuidv4();
    const membershipId = uuidv4();
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Alice', NOW, NOW);
    localDb.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)').run(uuidv4(), contactId, 'alice@example.com', 0);
    sharedInsertContact(sharedDb, contactId, 'Alice', { emails: ['alice@example.com'] });

    // Matching membership with the same ID in both DBs.
    localDb.prepare(
      'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(membershipId, contactId, projectId, 'r@r.com', 'Reporter', NOW, NOW);
    sharedInsertMembership(sharedDb, membershipId, contactId);

    // Existing local entry at NOW establishes the high-watermark.
    localDb.prepare(
      'INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(uuidv4(), contactId, 'r@r.com', 'Reporter', 'existing', NOW);

    // Shared entry at NOW - 25 is below the local max but within the 30s overlap window.
    const lateEntryId = uuidv4();
    sharedDb.prepare(
      'INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(lateEntryId, contactId, 'r@r.com', 'Reporter', 'late entry', NOW - 25);
    sharedDb.prepare('INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(lateEntryId, membershipId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    // Late entry and its project link should be pulled into local DB.
    expect(localDb.prepare('SELECT id FROM interaction_log_entries WHERE id = ?').get(lateEntryId)).toBeDefined();
    const ip = localDb.prepare('SELECT membership_id FROM interaction_projects WHERE interaction_id = ?').get(lateEntryId) as { membership_id: string } | undefined;
    expect(ip?.membership_id).toBe(membershipId);
  });
});

// ---------------------------------------------------------------------------
// LWW (last-write-wins): newer version should win (#268)
// ---------------------------------------------------------------------------

describe('syncProject — last-write-wins (LWW)', () => {
  it('shared version wins when it has a newer updated_at', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'LWW Project');

    const contactId = uuidv4();
    const localTs = NOW - 200;
    const sharedTs = NOW - 10; // shared is newer

    // Insert contact in both DBs with the same ID but different names and timestamps
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Local Name', localTs, localTs);
    localDb.prepare('UPDATE contacts SET synced_at = ? WHERE id = ?').run(localTs, contactId);
    sharedInsertContact(sharedDb, contactId, 'Shared Name', { updatedAt: sharedTs });
    localInsertMembership(localDb, contactId, projectId);
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    // The shared (newer) version should overwrite the local name
    const row = localDb.prepare('SELECT name FROM contacts WHERE id = ?').get(contactId) as { name: string };
    expect(row.name).toBe('Shared Name');
  });

  it('local version wins when it has a newer updated_at', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'LWW Project 2');

    const contactId = uuidv4();
    const localTs = NOW - 10;  // local is newer
    const sharedTs = NOW - 200;

    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Local Name', localTs, localTs);
    // synced_at is NULL so push will fire
    sharedInsertContact(sharedDb, contactId, 'Shared Name', { updatedAt: sharedTs });
    localInsertMembership(localDb, contactId, projectId);
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    // Local is newer, so shared DB should now have the local name
    const sharedRow = sharedDb.prepare('SELECT name FROM contacts WHERE id = ?').get(contactId) as { name: string };
    expect(sharedRow.name).toBe('Local Name');

    // Local DB should still have local name (shared was not newer so no overwrite)
    const localRow = localDb.prepare('SELECT name FROM contacts WHERE id = ?').get(contactId) as { name: string };
    expect(localRow.name).toBe('Local Name');
  });
});
