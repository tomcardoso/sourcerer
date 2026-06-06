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

// ---------------------------------------------------------------------------
// pullAppendOnly — skip rows whose contact_id no longer exists locally (#217)
// ---------------------------------------------------------------------------

describe('pullAppendOnly — orphan contact_id filter (#217)', () => {
  it('skips alert mentions for a contact_id that does not exist locally', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Orphan Filter Test');

    const existingId = uuidv4();
    const orphanId = uuidv4();
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(existingId, 'Alice', NOW, NOW);
    localInsertMembership(localDb, existingId, projectId);
    sharedInsertContact(sharedDb, existingId, 'Alice');
    sharedInsertContact(sharedDb, orphanId, 'Orphan');

    const keptId = uuidv4();
    const droppedId = uuidv4();
    sharedDb.prepare('INSERT INTO contact_alert_mentions (id, contact_id, headline, source_url, fetched_at, guid, seen) VALUES (?, ?, ?, ?, ?, ?, 0)').run(keptId, existingId, 'H1', 'http://a.com', NOW, 'g1');
    sharedDb.prepare('INSERT INTO contact_alert_mentions (id, contact_id, headline, source_url, fetched_at, guid, seen) VALUES (?, ?, ?, ?, ?, ?, 0)').run(droppedId, orphanId, 'H2', 'http://b.com', NOW, 'g2');

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);
    expect(localDb.prepare('SELECT id FROM contact_alert_mentions WHERE id = ?').get(keptId)).toBeDefined();
    expect(localDb.prepare('SELECT id FROM contact_alert_mentions WHERE id = ?').get(droppedId)).toBeUndefined();
  });

  it('skips interaction log entries for a contact_id that does not exist locally', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Orphan Filter Test 2');

    const existingId = uuidv4();
    const orphanId = uuidv4();
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(existingId, 'Bob', NOW, NOW);
    localInsertMembership(localDb, existingId, projectId);
    sharedInsertContact(sharedDb, existingId, 'Bob');
    sharedInsertContact(sharedDb, orphanId, 'Orphan');

    const keptId = uuidv4();
    const droppedId = uuidv4();
    sharedDb.prepare('INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(keptId, existingId, 'r@r.com', 'Reporter', 'Kept', NOW);
    sharedDb.prepare('INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(droppedId, orphanId, 'r@r.com', 'Reporter', 'Dropped', NOW);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);
    expect(localDb.prepare('SELECT id FROM interaction_log_entries WHERE id = ?').get(keptId)).toBeDefined();
    expect(localDb.prepare('SELECT id FROM interaction_log_entries WHERE id = ?').get(droppedId)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Push path: synced_at only stamped after sharedDb transaction commits (#288)
// ---------------------------------------------------------------------------

describe('syncProject — deferred synced_at stamp (#288)', () => {
  it('does not stamp synced_at when the shared push transaction fails', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Deferred Stamp Test');

    const contactId = insertContact(localDb, 'Stamp Alice', { emails: ['stamp@example.com'] });
    localInsertMembership(localDb, contactId, projectId);

    // Block the shared contacts INSERT so the push transaction rolls back
    sharedDb.prepare(
      'CREATE TRIGGER block_contacts_insert BEFORE INSERT ON contacts BEGIN SELECT RAISE(ABORT, \'blocked for test\'); END',
    ).run();

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(false);

    // synced_at must remain null — the push transaction rolled back before phase 4
    const row = localDb.prepare('SELECT synced_at FROM contacts WHERE id = ?').get(contactId) as { synced_at: number | null };
    expect(row.synced_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sub-table merge: local-only items preserved when shared contact is newer
// ---------------------------------------------------------------------------

describe('mergeSubTablesFromShared — three-way merge', () => {
  it('preserves a local-only email when the shared contact is newer', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Merge Test');

    const contactId = uuidv4();
    // Local has one email added before the shared contact's updated_at
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Alice', NOW - 100, NOW - 100);
    localDb.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, 0, ?)').run(uuidv4(), contactId, 'local@example.com', NOW - 100);
    localInsertMembership(localDb, contactId, projectId);

    // Shared is newer and has a different email
    sharedInsertContact(sharedDb, contactId, 'Alice', { emails: ['shared@example.com'], updatedAt: NOW });
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const emails = (localDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ? ORDER BY sort_order').all(contactId) as { email: string }[]).map((r) => r.email);
    // Both emails should survive: shared email first (from shared), then local-only email
    expect(emails).toContain('shared@example.com');
    expect(emails).toContain('local@example.com');
  });

  it('preserves wayback_url for a link that exists in both local and shared', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Wayback Test');

    const contactId = uuidv4();
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Alice', NOW - 100, NOW - 100);
    // Local has the link with a wayback_url
    localDb.prepare('INSERT INTO contact_links (id, contact_id, type, url, wayback_url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)').run(uuidv4(), contactId, 'website', 'https://alice.com', 'https://web.archive.org/web/alice', NOW - 100);
    localInsertMembership(localDb, contactId, projectId);

    // Shared is newer, has the same link but no wayback_url
    sharedInsertContact(sharedDb, contactId, 'Alice Updated', { updatedAt: NOW });
    sharedDb.prepare('INSERT INTO contact_links (id, contact_id, type, url, sort_order, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(uuidv4(), contactId, 'website', 'https://alice.com', NOW - 100);
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const link = localDb.prepare('SELECT wayback_url FROM contact_links WHERE contact_id = ?').get(contactId) as { wayback_url: string | null } | undefined;
    expect(link?.wayback_url).toBe('https://web.archive.org/web/alice');
  });
});

// ---------------------------------------------------------------------------
// Pull path: new contact in shared gets created locally
// ---------------------------------------------------------------------------

describe('pullContacts — new shared contact pulled to local', () => {
  it('inserts a shared contact (with sub-tables) into the local DB when not present', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Pull New Contact');

    const sharedContactId = uuidv4();
    sharedInsertContact(sharedDb, sharedContactId, 'Brand New', { emails: ['new@example.com'], phones: ['+15550001111'] });
    sharedInsertMembership(sharedDb, uuidv4(), sharedContactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const contact = localDb.prepare('SELECT name FROM contacts WHERE id = ?').get(sharedContactId) as { name: string } | undefined;
    expect(contact?.name).toBe('Brand New');

    const emails = (localDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(sharedContactId) as { email: string }[]).map((r) => r.email);
    expect(emails).toContain('new@example.com');

    const phones = (localDb.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(sharedContactId) as { phone: string }[]).map((r) => r.phone);
    expect(phones).toContain('+15550001111');
  });
});

// ---------------------------------------------------------------------------
// Push path: sub-tables, memberships, log entries
// ---------------------------------------------------------------------------

describe('syncProject — push path: sub-tables, memberships, log entries', () => {
  it('pushes contact sub-tables to shared, and removes deleted sub-table rows on re-push', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Sub-table Push Test');

    const contactId = insertContact(localDb, 'Sub-table Alice', { emails: ['a@example.com', 'b@example.com'] });
    localInsertMembership(localDb, contactId, projectId);

    syncProject(localDb, sharedDb, projectId);

    const sharedEmails = (sharedDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as { email: string }[]).map((r) => r.email);
    expect(sharedEmails).toContain('a@example.com');
    expect(sharedEmails).toContain('b@example.com');

    // Remove one email locally and bump updated_at to trigger a re-push
    localDb.prepare('DELETE FROM contact_emails WHERE contact_id = ? AND email = ?').run(contactId, 'b@example.com');
    localDb.prepare('UPDATE contacts SET updated_at = ?, synced_at = NULL WHERE id = ?').run(NOW + 10, contactId);

    syncProject(localDb, sharedDb, projectId);

    const sharedEmailsAfter = (sharedDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as { email: string }[]).map((r) => r.email);
    expect(sharedEmailsAfter).toContain('a@example.com');
    expect(sharedEmailsAfter).not.toContain('b@example.com');
  });

  it('pushes a membership to shared', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Membership Push Test');

    const contactId = insertContact(localDb, 'Membership Alice');
    const membershipId = localInsertMembership(localDb, contactId, projectId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const sharedMembership = sharedDb.prepare('SELECT id FROM project_memberships WHERE id = ?').get(membershipId);
    expect(sharedMembership).toBeDefined();
  });

  it('pushes an interaction log entry to shared and does not re-push it on the next sync', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Log Push Test');

    const contactId = insertContact(localDb, 'Log Alice');
    const membershipId = localInsertMembership(localDb, contactId, projectId);

    const logId = uuidv4();
    localDb.prepare('INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(logId, contactId, 'r@r.com', 'Reporter', 'First contact', NOW);
    localDb.prepare('INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(logId, membershipId);

    syncProject(localDb, sharedDb, projectId);

    expect(sharedDb.prepare('SELECT id FROM interaction_log_entries WHERE id = ?').get(logId)).toBeDefined();

    // Verify synced_at was stamped
    const stamped = localDb.prepare('SELECT synced_at FROM interaction_log_entries WHERE id = ?').get(logId) as { synced_at: number | null };
    expect(stamped.synced_at).not.toBeNull();

    // Delete from shared to detect a re-push
    sharedDb.prepare('DELETE FROM interaction_log_entries WHERE id = ?').run(logId);

    syncProject(localDb, sharedDb, projectId);

    // Should NOT be re-pushed (synced_at is set, so it won't be pushed again)
    expect(sharedDb.prepare('SELECT id FROM interaction_log_entries WHERE id = ?').get(logId)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Re-push after local edit
// ---------------------------------------------------------------------------

describe('syncProject — re-push after contact update', () => {
  it('re-pushes a contact when updated_at advances past synced_at', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Re-push Test');

    const contactId = insertContact(localDb, 'Re-push Alice');
    localInsertMembership(localDb, contactId, projectId);

    // First sync: push Alice
    syncProject(localDb, sharedDb, projectId);

    // Locally update Alice's name
    localDb.prepare('UPDATE contacts SET name = ?, updated_at = ?, synced_at = NULL WHERE id = ?').run('Re-push Alice Updated', NOW + 10, contactId);

    // Second sync: should push the updated name
    syncProject(localDb, sharedDb, projectId);

    const sharedRow = sharedDb.prepare('SELECT name FROM contacts WHERE id = ?').get(contactId) as { name: string };
    expect(sharedRow.name).toBe('Re-push Alice Updated');
  });
});

// ---------------------------------------------------------------------------
// Two-way sync: both clients converge on the same shared DB
// ---------------------------------------------------------------------------

describe('syncProject — two-way round-trip', () => {
  it('both clients see each other\'s contacts after syncing through the shared DB', () => {
    const sharedDb = createSharedDb();
    const projectId = uuidv4();

    // Client A
    const localA = createTestDb();
    localA.prepare('INSERT INTO projects (id, name, is_shared, created_at) VALUES (?, ?, 1, ?)').run(projectId, 'Shared Project', NOW);
    const contactA = insertContact(localA, 'Alice', { emails: ['alice@example.com'] });
    localInsertMembership(localA, contactA, projectId);

    // Client B
    const localB = createTestDb();
    localB.prepare('INSERT INTO projects (id, name, is_shared, created_at) VALUES (?, ?, 1, ?)').run(projectId, 'Shared Project', NOW);
    const contactB = insertContact(localB, 'Bob', { emails: ['bob@example.com'] });
    localInsertMembership(localB, contactB, projectId);

    // A syncs first: pushes Alice to shared
    expect(syncProject(localA, sharedDb, projectId).success).toBe(true);

    // B syncs: pulls Alice, pushes Bob
    expect(syncProject(localB, sharedDb, projectId).success).toBe(true);

    // A syncs again: pulls Bob
    expect(syncProject(localA, sharedDb, projectId).success).toBe(true);

    // Both clients should now have both contacts
    const namesA = (localA.prepare('SELECT name FROM contacts ORDER BY name').all() as { name: string }[]).map((r) => r.name);
    expect(namesA).toContain('Alice');
    expect(namesA).toContain('Bob');

    const namesB = (localB.prepare('SELECT name FROM contacts ORDER BY name').all() as { name: string }[]).map((r) => r.name);
    expect(namesB).toContain('Alice');
    expect(namesB).toContain('Bob');
  });
});

// ---------------------------------------------------------------------------
// Idempotency: consecutive syncs are safe
// ---------------------------------------------------------------------------

describe('syncProject — idempotency', () => {
  it('produces the same result when called twice in a row', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Idempotency Test');

    const contactId = insertContact(localDb, 'Idempotent Alice', { emails: ['idem@example.com'] });
    localInsertMembership(localDb, contactId, projectId);

    syncProject(localDb, sharedDb, projectId);

    // Snapshot state after first sync
    const contactAfterFirst = localDb.prepare('SELECT name, synced_at FROM contacts WHERE id = ?').get(contactId) as { name: string; synced_at: number | null };
    const sharedEmailsAfterFirst = (sharedDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as { email: string }[]).map((r) => r.email);

    syncProject(localDb, sharedDb, projectId);

    // State should be identical after second sync
    const contactAfterSecond = localDb.prepare('SELECT name, synced_at FROM contacts WHERE id = ?').get(contactId) as { name: string; synced_at: number | null };
    const sharedEmailsAfterSecond = (sharedDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as { email: string }[]).map((r) => r.email);

    expect(contactAfterSecond.name).toBe(contactAfterFirst.name);
    expect(contactAfterSecond.synced_at).toBe(contactAfterFirst.synced_at);
    expect(sharedEmailsAfterSecond).toEqual(sharedEmailsAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// Sub-table deletion self-healing
//
// When client B pushes an unrelated edit (e.g. a phone) AFTER client A has
// added an email that B has not yet seen, B's push wipes A's email from shared
// (pushSubTablesToShared is a full replace). This is a temporary inconsistency:
// on A's next sync, A pulls (shared is now newer), the merge preserves A's
// email as "local-only", and A re-pushes it back to shared. No data is
// permanently lost; the inconsistency window is one sync cycle (~2 minutes).
// ---------------------------------------------------------------------------

describe('sub-table deletion self-healing', () => {
  it('restores an email wiped from shared by a concurrent phone push after one extra sync cycle', () => {
    const T1 = NOW - 20; // A adds email
    const T2 = NOW - 10; // B adds phone (newer)

    const localA = createTestDb();
    const localB = createTestDb();
    const sharedDb = createSharedDb();

    const projectId_A = insertProject(localA, 'Project');
    const projectId_B = insertProject(localB, 'Project');

    const contactId = uuidv4();

    // Both clients start with the same base contact (no sub-tables), synced_at set
    // so the push guard fires only for their own edits.
    for (const db of [localA, localB]) {
      db.prepare('INSERT INTO contacts (id, name, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?)').run(contactId, 'Alice', T1 - 10, T1 - 10, T1 - 10);
    }
    localInsertMembership(localA, contactId, projectId_A);
    localInsertMembership(localB, contactId, projectId_B);

    sharedInsertContact(sharedDb, contactId, 'Alice', { updatedAt: T1 - 10 });
    sharedInsertMembership(sharedDb, uuidv4(), contactId, { updatedAt: T1 - 10 });

    // A adds an email at T1
    localA.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(T1, contactId);
    localA.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, 0, ?)').run(uuidv4(), contactId, 'alice@wapo.com', T1);

    // A syncs — pushes email to shared
    syncProject(localA, sharedDb, projectId_A);
    expect((sharedDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as { email: string }[]).map((r) => r.email)).toContain('alice@wapo.com');

    // B adds a phone at T2 (hasn't seen A's email yet)
    localB.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(T2, contactId);
    localB.prepare('INSERT INTO contact_phones (id, contact_id, phone, sort_order, created_at) VALUES (?, ?, ?, 0, ?)').run(uuidv4(), contactId, '+15551234567', T2);

    // B syncs — B is newer, so B pushes and wipes A's email from shared
    syncProject(localB, sharedDb, projectId_B);
    const sharedEmailsAfterBPush = (sharedDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as { email: string }[]).map((r) => r.email);
    expect(sharedEmailsAfterBPush).not.toContain('alice@wapo.com'); // temporarily gone

    // A syncs again — shared is now newer (T2 > T1); merge preserves A's local email
    // and A re-pushes it back to shared
    syncProject(localA, sharedDb, projectId_A);
    const sharedEmailsAfterHeal = (sharedDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as { email: string }[]).map((r) => r.email);
    expect(sharedEmailsAfterHeal).toContain('alice@wapo.com'); // restored ✓
    expect((sharedDb.prepare('SELECT phone FROM contact_phones WHERE contact_id = ?').all(contactId) as { phone: string }[]).map((r) => r.phone)).toContain('+15551234567'); // B's phone also present ✓
  });
});

// ---------------------------------------------------------------------------
// RSS sub-table additive merge (#411)
// ---------------------------------------------------------------------------

describe('mergeSubTablesFromShared — RSS additive merge (#411)', () => {
  it('preserves a local-only RSS feed when the shared contact is newer', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'RSS Merge Test');

    const contactId = uuidv4();
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Alice', NOW - 100, NOW - 100);
    // Local has an RSS feed not yet pushed to shared
    localDb.prepare('INSERT INTO contact_alert_rss (id, contact_id, rss_url, is_invalid) VALUES (?, ?, ?, 0)').run(uuidv4(), contactId, 'https://alice.com/feed.rss');
    localInsertMembership(localDb, contactId, projectId);

    // Shared is newer and has a different RSS feed
    sharedInsertContact(sharedDb, contactId, 'Alice Updated', { updatedAt: NOW });
    sharedDb.prepare('INSERT INTO contact_alert_rss (id, contact_id, rss_url, is_invalid) VALUES (?, ?, ?, 0)').run(uuidv4(), contactId, 'https://alice.com/news.rss');
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const feeds = (localDb.prepare('SELECT rss_url FROM contact_alert_rss WHERE contact_id = ?').all(contactId) as { rss_url: string }[]).map((r) => r.rss_url);
    expect(feeds).toHaveLength(2);
    expect(feeds).toContain('https://alice.com/feed.rss');   // local-only preserved
    expect(feeds).toContain('https://alice.com/news.rss');   // from shared
  });
});

// ---------------------------------------------------------------------------
// pushAppendOnly — cross-project membership guard (#410)
// ---------------------------------------------------------------------------

describe('pushAppendOnly — cross-project membership guard (#410)', () => {
  it('does not push interaction_projects rows for memberships outside the current project', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Project A');
    const otherProjectId = insertProject(localDb, 'Project B');

    const contactId = insertContact(localDb, 'Alice');
    const membershipA = localInsertMembership(localDb, contactId, projectId);
    const membershipB = localInsertMembership(localDb, contactId, otherProjectId);

    // One log entry linked to BOTH memberships
    const logId = uuidv4();
    localDb.prepare('INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(logId, contactId, 'r@r.com', 'Reporter', 'Log entry', NOW);
    localDb.prepare('INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(logId, membershipA);
    localDb.prepare('INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(logId, membershipB);

    // Syncing Project A's shared DB — membershipB doesn't exist there, so pushing it would be an FK violation
    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    // The log entry should be in shared, but only linked to membershipA
    expect(sharedDb.prepare('SELECT id FROM interaction_log_entries WHERE id = ?').get(logId)).toBeDefined();
    const ipRows = sharedDb.prepare('SELECT membership_id FROM interaction_projects WHERE interaction_id = ?').all(logId) as { membership_id: string }[];
    const pushedMembershipIds = ipRows.map((r) => r.membership_id);
    expect(pushedMembershipIds).toContain(membershipA);
    expect(pushedMembershipIds).not.toContain(membershipB);
  });
});

// ---------------------------------------------------------------------------
// Tombstone sync (#422)
// ---------------------------------------------------------------------------

describe('sync_tombstones — propagation and resurrection prevention', () => {
  it('pushes local tombstones to shared on sync', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Tombstone Push');

    const contactId = insertContact(localDb, 'Alice');
    localInsertMembership(localDb, contactId, projectId);
    sharedInsertContact(sharedDb, contactId, 'Alice');
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    const rowId = uuidv4();
    localDb.prepare('INSERT INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)').run('contact_tags', rowId, NOW);

    syncProject(localDb, sharedDb, projectId);

    expect(sharedDb.prepare('SELECT row_id FROM sync_tombstones WHERE row_id = ?').get(rowId)).toBeDefined();
  });

  it('pulls tombstones from shared into local on sync', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Tombstone Pull');

    const contactId = insertContact(localDb, 'Alice');
    localInsertMembership(localDb, contactId, projectId);
    sharedInsertContact(sharedDb, contactId, 'Alice');
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    const rowId = uuidv4();
    sharedDb.prepare('INSERT INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)').run('contact_tags', rowId, NOW);

    syncProject(localDb, sharedDb, projectId);

    expect(localDb.prepare('SELECT row_id FROM sync_tombstones WHERE row_id = ?').get(rowId)).toBeDefined();
  });

  it('deleted tag on client A is not resurrected on client B after sync', () => {
    const sharedDb = createSharedDb();
    const projectId = uuidv4();
    const contactId = uuidv4();
    const tagId = uuidv4();
    const T0 = NOW - 200;

    // Both clients start with the same contact + tag, already synced
    const localA = createTestDb();
    const localB = createTestDb();
    for (const db of [localA, localB]) {
      db.prepare('INSERT INTO projects (id, name, is_shared, created_at) VALUES (?, ?, 1, ?)').run(projectId, 'Shared', T0);
      db.prepare('INSERT INTO contacts (id, name, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?)').run(contactId, 'Alice', T0, T0, T0);
      db.prepare('INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), contactId, projectId, 'r@r.com', 'Reporter', T0, T0, T0);
      db.prepare('INSERT INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)').run(tagId, contactId, 'source', T0);
    }
    sharedDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Alice', T0, T0);
    sharedInsertMembership(sharedDb, uuidv4(), contactId);
    sharedDb.prepare('INSERT INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)').run(tagId, contactId, 'source', T0);

    // A removes the tag and writes a tombstone (simulates what contacts:remove-tag does)
    localA.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag = ?').run(contactId, 'source');
    localA.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(NOW, contactId);
    localA.prepare('INSERT INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)').run('contact_tags', tagId, NOW);

    // A syncs: pushes tombstone + updated contact to shared
    expect(syncProject(localA, sharedDb, projectId).success).toBe(true);
    expect((sharedDb.prepare('SELECT tag FROM contact_tags WHERE contact_id = ?').all(contactId) as { tag: string }[]).map((r) => r.tag)).not.toContain('source');

    // B syncs: pulls A's changes including tombstone; tag must not be resurrected
    expect(syncProject(localB, sharedDb, projectId).success).toBe(true);
    expect((localB.prepare('SELECT tag FROM contact_tags WHERE contact_id = ?').all(contactId) as { tag: string }[]).map((r) => r.tag)).not.toContain('source');
  });

  it('tombstoned row does not block a fresh re-add of the same email address', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Re-add Test');

    const contactId = uuidv4();
    const emailId = uuidv4();
    const T0 = NOW - 100;

    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?)').run(contactId, 'Alice', T0, T0, T0);
    localInsertMembership(localDb, contactId, projectId);
    // Old row with known ID, then tombstoned
    localDb.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, 0, ?)').run(emailId, contactId, 'alice@example.com', T0);
    localDb.prepare('INSERT INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)').run('contact_emails', emailId, NOW - 10);
    // Re-added with a new UUID
    const newEmailId = uuidv4();
    localDb.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(contactId);
    localDb.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, 0, ?)').run(newEmailId, contactId, 'alice@example.com', NOW - 5);

    sharedInsertContact(sharedDb, contactId, 'Alice', { updatedAt: T0 });
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    expect(syncProject(localDb, sharedDb, projectId).success).toBe(true);

    // The re-added email (new UUID, not tombstoned) should survive
    const emails = (localDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(contactId) as { email: string }[]).map((r) => r.email);
    expect(emails).toContain('alice@example.com');
  });
});
