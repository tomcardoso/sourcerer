import { beforeEach, describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3-multiple-ciphers';
import { createTestDb, insertContact, insertProject, TEST_REPORTER } from './vitest.setup';
import { SHARED_SCHEMA_SQL } from '../main/database/shared-schema';
import { syncProject } from '../main/sync/engine';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  net: { fetch: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') },
}));

let testDb: ReturnType<typeof createTestDb>;
vi.mock('../main/database', () => ({ getDatabase: () => testDb, isDatabaseOpen: () => true }));
vi.mock('../main/sync/outreach-checker', () => ({ checkOutreachReminders: vi.fn() }));

import { ipcMain } from 'electron';
import { registerContactHandlers } from '../main/ipc/contacts';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

beforeEach(() => {
  testDb = createTestDb();
  handlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn) => {
    handlers.set(channel, fn as (...args: unknown[]) => unknown);
    return ipcMain;
  });
  registerContactHandlers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _tagTs = Math.floor(Date.now() / 1000);
function insertTag(db: Database.Database, contactId: string, tag: string): void {
  db.prepare('INSERT INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), contactId, tag, _tagTs++);
}

function getTags(db: Database.Database, contactId: string): string[] {
  return (db.prepare('SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag').all(contactId) as { tag: string }[])
    .map((r) => r.tag);
}

// ---------------------------------------------------------------------------
// contacts:add-tag
// ---------------------------------------------------------------------------

describe('contacts:add-tag', () => {
  it('adds a tag to a contact', async () => {
    const contactId = insertContact(testDb, 'Alice');
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: 'source' });
    expect(getTags(testDb, contactId)).toEqual(['source']);
  });

  it('normalises to lowercase and trims whitespace', async () => {
    const contactId = insertContact(testDb, 'Alice');
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: '  WHISTLEBLOWER  ' });
    expect(getTags(testDb, contactId)).toEqual(['whistleblower']);
  });

  it('ignores duplicate tags (INSERT OR IGNORE)', async () => {
    const contactId = insertContact(testDb, 'Alice');
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: 'legal' });
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: 'legal' });
    expect(getTags(testDb, contactId)).toHaveLength(1);
  });

  it('ignores empty tag strings', async () => {
    const contactId = insertContact(testDb, 'Alice');
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: '   ' });
    expect(getTags(testDb, contactId)).toHaveLength(0);
  });

  it('ignores tags exceeding 50 characters', async () => {
    const contactId = insertContact(testDb, 'Alice');
    const long = 'a'.repeat(51);
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: long });
    expect(getTags(testDb, contactId)).toHaveLength(0);
  });

  it('allows a contact to have multiple distinct tags', async () => {
    const contactId = insertContact(testDb, 'Alice');
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: 'source' });
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: 'legal' });
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: 'whistleblower' });
    expect(getTags(testDb, contactId)).toEqual(['legal', 'source', 'whistleblower']);
  });
});

// ---------------------------------------------------------------------------
// contacts:remove-tag
// ---------------------------------------------------------------------------

describe('contacts:remove-tag', () => {
  it('removes an existing tag', async () => {
    const contactId = insertContact(testDb, 'Bob');
    insertTag(testDb, contactId, 'source');
    insertTag(testDb, contactId, 'legal');
    await handlers.get('contacts:remove-tag')!({}, { contactId, tag: 'source' });
    expect(getTags(testDb, contactId)).toEqual(['legal']);
  });

  it('is a no-op for a tag that does not exist', async () => {
    const contactId = insertContact(testDb, 'Bob');
    await handlers.get('contacts:remove-tag')!({}, { contactId, tag: 'ghost' });
    expect(getTags(testDb, contactId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// contacts:list-all-tags
// ---------------------------------------------------------------------------

describe('contacts:list-all-tags', () => {
  it('returns all distinct tags across all contacts in alphabetical order', async () => {
    const a = insertContact(testDb, 'Alice');
    const b = insertContact(testDb, 'Bob');
    insertTag(testDb, a, 'source');
    insertTag(testDb, a, 'legal');
    insertTag(testDb, b, 'source');
    insertTag(testDb, b, 'whistleblower');

    const result = await handlers.get('contacts:list-all-tags')!({}) as string[];
    expect(result).toEqual(['legal', 'source', 'whistleblower']);
  });

  it('returns an empty array when no tags exist', async () => {
    insertContact(testDb, 'Alice');
    const result = await handlers.get('contacts:list-all-tags')!({}) as string[];
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// contacts:list — tags included
// ---------------------------------------------------------------------------

describe('contacts:list — tags field', () => {
  it('returns an empty tags array for a contact with no tags', async () => {
    insertContact(testDb, 'Alice');
    const rows = await handlers.get('contacts:list')!({}) as { tags: string[] }[];
    expect(rows[0].tags).toEqual([]);
  });

  it('returns tags in insertion order', async () => {
    const contactId = insertContact(testDb, 'Alice');
    insertTag(testDb, contactId, 'zebra');
    insertTag(testDb, contactId, 'alpha');
    const rows = await handlers.get('contacts:list')!({}) as { tags: string[] }[];
    expect(rows[0].tags).toEqual(['zebra', 'alpha']);
  });

  it('does not mix tags between contacts', async () => {
    const a = insertContact(testDb, 'Alice');
    const b = insertContact(testDb, 'Bob');
    insertTag(testDb, a, 'source');
    insertTag(testDb, b, 'legal');

    const rows = await handlers.get('contacts:list')!({}) as { name: string; tags: string[] }[];
    const alice = rows.find((r) => r.name === 'Alice')!;
    const bob = rows.find((r) => r.name === 'Bob')!;
    expect(alice.tags).toEqual(['source']);
    expect(bob.tags).toEqual(['legal']);
  });
});

// ---------------------------------------------------------------------------
// contacts:get — tags included
// ---------------------------------------------------------------------------

describe('contacts:get — tags field', () => {
  it('returns tags in insertion order', async () => {
    const contactId = insertContact(testDb, 'Alice');
    insertTag(testDb, contactId, 'source');
    insertTag(testDb, contactId, 'legal');
    const detail = await handlers.get('contacts:get')!({}, contactId) as { tags: string[] };
    expect(detail.tags).toEqual(['source', 'legal']);
  });

  it('returns an empty tags array when none exist', async () => {
    const contactId = insertContact(testDb, 'Alice');
    const detail = await handlers.get('contacts:get')!({}, contactId) as { tags: string[] };
    expect(detail.tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// contacts:list-for-project — tags included
// ---------------------------------------------------------------------------

describe('contacts:list-for-project — tags field', () => {
  it('returns tags for contacts in a project', async () => {
    const contactId = insertContact(testDb, 'Alice');
    const projectId = insertProject(testDb, 'Proj');
    const now = Math.floor(Date.now() / 1000);
    testDb.prepare(
      'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(uuidv4(), contactId, projectId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);
    insertTag(testDb, contactId, 'source');

    const rows = await handlers.get('contacts:list-for-project')!({}, projectId) as { tags: string[] }[];
    expect(rows[0].tags).toEqual(['source']);
  });

  it('returns an empty tags array when the contact has no tags', async () => {
    const contactId = insertContact(testDb, 'Alice');
    const projectId = insertProject(testDb, 'Proj');
    const now = Math.floor(Date.now() / 1000);
    testDb.prepare(
      'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(uuidv4(), contactId, projectId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);

    const rows = await handlers.get('contacts:list-for-project')!({}, projectId) as { tags: string[] }[];
    expect(rows[0].tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Sync engine — tags
// ---------------------------------------------------------------------------

const SYNC_NOW = Math.floor(Date.now() / 1000);

function createSharedDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SHARED_SCHEMA_SQL);
  return db;
}

function sharedInsertContact(db: Database.Database, id: string, name: string): void {
  db.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, SYNC_NOW, SYNC_NOW);
}

function sharedInsertMembership(db: Database.Database, id: string, contactId: string): void {
  db.prepare(
    'INSERT INTO project_memberships (id, contact_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, contactId, 'r@r.com', 'Reporter', SYNC_NOW, SYNC_NOW);
}

function localInsertMembership(db: Database.Database, contactId: string, projectId: string): string {
  const id = uuidv4();
  const ts = SYNC_NOW - 10;
  db.prepare(
    'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, contactId, projectId, 'r@r.com', 'Reporter', ts, ts);
  return id;
}

describe('contacts:add-tag / contacts:remove-tag — bumps updated_at', () => {
  it('add-tag bumps contact updated_at so the sync engine will push', async () => {
    const contactId = insertContact(testDb, 'Alice');
    const before = (testDb.prepare('SELECT updated_at FROM contacts WHERE id = ?').get(contactId) as { updated_at: number }).updated_at;
    await new Promise((r) => setTimeout(r, 1100));
    await handlers.get('contacts:add-tag')!({}, { contactId, tag: 'source' });
    const after = (testDb.prepare('SELECT updated_at FROM contacts WHERE id = ?').get(contactId) as { updated_at: number }).updated_at;
    expect(after).toBeGreaterThan(before);
  });

  it('remove-tag bumps contact updated_at so the sync engine will push', async () => {
    const contactId = insertContact(testDb, 'Alice');
    insertTag(testDb, contactId, 'source');
    const before = (testDb.prepare('SELECT updated_at FROM contacts WHERE id = ?').get(contactId) as { updated_at: number }).updated_at;
    await new Promise((r) => setTimeout(r, 1100));
    await handlers.get('contacts:remove-tag')!({}, { contactId, tag: 'source' });
    const after = (testDb.prepare('SELECT updated_at FROM contacts WHERE id = ?').get(contactId) as { updated_at: number }).updated_at;
    expect(after).toBeGreaterThan(before);
  });
});

describe('syncProject — tags', () => {
  it('pushes local tags to shared on sync', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test');

    // Insert contact with a fixed UUID so both sides share the same ID
    const contactId = uuidv4();
    const localTs = SYNC_NOW - 10;
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Alice', localTs, localTs);
    localInsertMembership(localDb, contactId, projectId);
    insertTag(localDb, contactId, 'source');
    insertTag(localDb, contactId, 'legal');

    sharedInsertContact(sharedDb, contactId, 'Alice');
    sharedInsertMembership(sharedDb, uuidv4(), contactId);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    const sharedTags = (sharedDb.prepare('SELECT tag FROM contact_tags WHERE contact_id = ? ORDER BY tag').all(contactId) as { tag: string }[]).map((r) => r.tag);
    expect(sharedTags).toEqual(['legal', 'source']);
  });

  it('pulls tags from shared into local on sync', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test');

    const contactId = uuidv4();
    const localTs = SYNC_NOW - 10;
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Alice', localTs, localTs);
    localInsertMembership(localDb, contactId, projectId);

    sharedInsertContact(sharedDb, contactId, 'Alice');
    sharedInsertMembership(sharedDb, uuidv4(), contactId);
    sharedDb.prepare('INSERT INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)').run(uuidv4(), contactId, 'whistleblower', SYNC_NOW);
    sharedDb.prepare('INSERT INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)').run(uuidv4(), contactId, 'source', SYNC_NOW);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    expect(getTags(localDb, contactId)).toEqual(['source', 'whistleblower']);
  });

  it('merges local-only and shared tags without duplicates', () => {
    const localDb = createTestDb();
    const sharedDb = createSharedDb();
    const projectId = insertProject(localDb, 'Test');

    const contactId = uuidv4();
    const localTs = SYNC_NOW - 10;
    localDb.prepare('INSERT INTO contacts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(contactId, 'Alice', localTs, localTs);
    localInsertMembership(localDb, contactId, projectId);
    insertTag(localDb, contactId, 'local-only');
    insertTag(localDb, contactId, 'shared-tag');

    sharedInsertContact(sharedDb, contactId, 'Alice');
    sharedInsertMembership(sharedDb, uuidv4(), contactId);
    sharedDb.prepare('INSERT INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)').run(uuidv4(), contactId, 'shared-tag', SYNC_NOW);
    sharedDb.prepare('INSERT INTO contact_tags (id, contact_id, tag, created_at) VALUES (?, ?, ?, ?)').run(uuidv4(), contactId, 'shared-only', SYNC_NOW);

    const result = syncProject(localDb, sharedDb, projectId);
    expect(result.success).toBe(true);

    expect(getTags(localDb, contactId)).toEqual(['local-only', 'shared-only', 'shared-tag']);
  });
});
