import { beforeEach, describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb, insertContact, insertProject, TEST_REPORTER } from './vitest.setup';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  net: { fetch: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') },
}));

let testDb: ReturnType<typeof createTestDb>;
vi.mock('../main/database', () => ({ getDatabase: () => testDb, isDatabaseOpen: () => true }));

// Mock outreach checker so interaction-log:delete doesn't fail
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
// contacts:list (#159 / #180)
// ---------------------------------------------------------------------------

describe('contacts:list', () => {
  it('returns one row per contact even with multiple project memberships', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const proj1 = insertProject(testDb, 'Alpha');
    const proj2 = insertProject(testDb, 'Beta');
    const now = Math.floor(Date.now() / 1000);
    for (const projId of [proj1, proj2]) {
      const membershipId = uuidv4();
      testDb.prepare(
        'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(membershipId, contactId, projId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);
    }

    const results = await handlers.get('contacts:list')!({}) as { id: string; projects: { id: string; name: string }[] }[];
    expect(results).toHaveLength(1);
    expect(results[0].projects).toHaveLength(2);
    const names = results[0].projects.map((p) => p.name);
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
  });

  it('returns an empty projects array for a contact with no memberships', async () => {
    insertContact(testDb, 'Bob Jones');
    const results = await handlers.get('contacts:list')!({}) as { projects: unknown[] }[];
    expect(results).toHaveLength(1);
    expect(results[0].projects).toEqual([]);
  });

  it('returns projects ordered by name', async () => {
    const contactId = insertContact(testDb, 'Carol White');
    const now = Math.floor(Date.now() / 1000);
    for (const name of ['Zebra', 'Alpha', 'Mango']) {
      const projId = insertProject(testDb, name);
      const membershipId = uuidv4();
      testDb.prepare(
        'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(membershipId, contactId, projId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);
    }

    const results = await handlers.get('contacts:list')!({}) as { projects: { name: string }[] }[];
    expect(results[0].projects.map((p) => p.name)).toEqual(['Alpha', 'Mango', 'Zebra']);
  });
});

// ---------------------------------------------------------------------------
// contacts:create (#192)
// ---------------------------------------------------------------------------

describe('contacts:create', () => {
  it('creates a contact and returns a ContactListItem with correct fields', async () => {
    const result = await handlers.get('contacts:create')!({}, {
      name: '  Alice Smith  ',
      organization: 'Acme',
      emails: [],
      phones: [],
    }) as { id: string; name: string; organization: string; has_email: number; has_phone: number };

    expect(result.name).toBe('Alice Smith');
    expect(result.organization).toBe('Acme');
    expect(result.has_email).toBe(0);
    expect(result.has_phone).toBe(0);

    const row = testDb.prepare('SELECT id, name FROM contacts WHERE name = ?').get('Alice Smith') as { id: string; name: string } | undefined;
    expect(row).toBeDefined();
    expect(result.id).toBe(row!.id);
  });

  it('stores associated emails and phones', async () => {
    const result = await handlers.get('contacts:create')!({}, {
      name: 'Bob Jones',
      emails: [{ email: 'bob@example.com', label: null }],
      phones: [{ phone: '+12024561111', label: null }],
    }) as { id: string; has_email: number; has_phone: number };

    expect(result.has_email).toBe(1);
    expect(result.has_phone).toBe(1);

    const emails = testDb.prepare('SELECT email FROM contact_emails WHERE contact_id = ?').all(result.id) as { email: string }[];
    expect(emails.some((e) => e.email.includes('bob@example.com'))).toBe(true);
  });

  it('stores associated handles', async () => {
    const result = await handlers.get('contacts:create')!({}, {
      name: 'Carol Davis',
      handles: [{ type: 'signal', handle: '+12024561234' }],
    }) as { id: string };

    const handles = testDb.prepare('SELECT type, handle FROM contact_handles WHERE contact_id = ?').all(result.id) as { type: string; handle: string }[];
    expect(handles).toHaveLength(1);
    expect(handles[0].type).toBe('signal');
  });

  it('sets created_at to a positive integer timestamp', async () => {
    const result = await handlers.get('contacts:create')!({}, {
      name: 'Dave Evans',
      emails: [],
    }) as { id: string; created_at: number };

    expect(result.created_at).toBeGreaterThan(0);
    expect(Number.isInteger(result.created_at)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// contacts:update (#196, #273)
// ---------------------------------------------------------------------------

describe('contacts:update', () => {
  it('updates name, org, and notes', async () => {
    const id = insertContact(testDb, 'Alice Smith', { org: 'OldCorp', notes: 'old notes' });

    await handlers.get('contacts:update')!({}, {
      id,
      name: 'Alice J. Smith',
      organization: 'NewCorp',
      notes: 'new notes',
      emails: [],
      phones: [],
      links: [],
      handles: [],
    });

    const row = testDb.prepare('SELECT name, organization, notes FROM contacts WHERE id = ?').get(id) as { name: string; organization: string; notes: string };
    expect(row.name).toBe('Alice J. Smith');
    expect(row.organization).toBe('NewCorp');
    expect(row.notes).toBe('new notes');
  });

  it('preserves email created_at across update', async () => {
    const id = insertContact(testDb, 'Alice Smith', { emails: ['alice@example.com'] });
    const originalCreatedAt = (testDb.prepare('SELECT created_at FROM contact_emails WHERE contact_id = ?').get(id) as { created_at: number }).created_at;

    await handlers.get('contacts:update')!({}, {
      id,
      name: 'Alice Smith',
      emails: [{ email: 'alice@example.com', label: null }],
      phones: [],
      links: [],
      handles: [],
    });

    const updatedCreatedAt = (testDb.prepare('SELECT created_at FROM contact_emails WHERE contact_id = ?').get(id) as { created_at: number }).created_at;
    expect(updatedCreatedAt).toBe(originalCreatedAt);
  });

  it('advances updated_at after update (timestamp advancement)', async () => {
    const id = insertContact(testDb, 'Alice Smith');
    const staleTs = Math.floor(Date.now() / 1000) - 100;
    testDb.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(staleTs, id);

    await handlers.get('contacts:update')!({}, {
      id,
      name: 'Alice Smith',
      emails: [],
      phones: [],
      links: [],
      handles: [],
    });

    const row = testDb.prepare('SELECT updated_at FROM contacts WHERE id = ?').get(id) as { updated_at: number };
    expect(row.updated_at).toBeGreaterThan(staleTs);
  });

  it('writes tombstones for deleted emails, phones, links, and handles', async () => {
    const { v4: uuidv4 } = await import('uuid');
    const now = Math.floor(Date.now() / 1000);
    const id = insertContact(testDb, 'Alice Smith');

    // Pre-insert rows with known IDs so we can verify the tombstone references them
    const emailId = uuidv4();
    const phoneId = uuidv4();
    const linkId = uuidv4();
    const handleId = uuidv4();
    testDb.prepare('DELETE FROM contact_emails WHERE contact_id = ?').run(id);
    testDb.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, 0, ?)').run(emailId, id, 'alice@example.com', now);
    testDb.prepare('INSERT INTO contact_phones (id, contact_id, phone, sort_order, created_at) VALUES (?, ?, ?, 0, ?)').run(phoneId, id, '+15550001111', now);
    testDb.prepare('INSERT INTO contact_links (id, contact_id, type, url, sort_order, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(linkId, id, 'website', 'https://alice.com', now);
    testDb.prepare('INSERT INTO contact_handles (id, contact_id, type, handle, sort_order, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(handleId, id, 'twitter', '@alice', now);

    // Update the contact, omitting all sub-table rows
    await handlers.get('contacts:update')!({}, {
      id,
      name: 'Alice Smith',
      emails: [],
      phones: [],
      links: [],
      handles: [],
    });

    const tombstoneRowIds = (testDb.prepare('SELECT row_id FROM sync_tombstones').all() as { row_id: string }[]).map((r) => r.row_id);
    expect(tombstoneRowIds).toContain(emailId);
    expect(tombstoneRowIds).toContain(phoneId);
    expect(tombstoneRowIds).toContain(linkId);
    expect(tombstoneRowIds).toContain(handleId);
  });
});

// ---------------------------------------------------------------------------
// contacts:delete (#192)
// ---------------------------------------------------------------------------

describe('contacts:delete', () => {
  it('deletes the contact', async () => {
    const id = insertContact(testDb, 'Delete Me');

    await handlers.get('contacts:delete')!({}, id);

    const row = testDb.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('cascades to emails, phones, handles, and memberships', async () => {
    const id = insertContact(testDb, 'Carol Test', {
      emails: ['carol@example.com'],
      phones: ['+12024561111'],
      handles: [{ type: 'signal', handle: '+12024561111' }],
    });
    const projId = insertProject(testDb, 'Project Alpha');
    const now = Math.floor(Date.now() / 1000);
    testDb.prepare(
      'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(uuidv4(), id, projId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);

    await handlers.get('contacts:delete')!({}, id);

    expect(testDb.prepare('SELECT id FROM contact_emails WHERE contact_id = ?').all(id)).toHaveLength(0);
    expect(testDb.prepare('SELECT id FROM contact_phones WHERE contact_id = ?').all(id)).toHaveLength(0);
    expect(testDb.prepare('SELECT id FROM contact_handles WHERE contact_id = ?').all(id)).toHaveLength(0);
    expect(testDb.prepare('SELECT id FROM project_memberships WHERE contact_id = ?').all(id)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// contacts:check-collision (#287)
// ---------------------------------------------------------------------------

describe('contacts:check-collision', () => {
  it('returns a collision when email already exists on another contact', async () => {
    insertContact(testDb, 'Existing Person', { emails: ['existing@example.com'] });

    const result = await handlers.get('contacts:check-collision')!({}, {
      emails: ['existing@example.com'],
      phones: [],
    }) as { email: Record<string, string>; phone: Record<string, string> };

    expect(result.email['existing@example.com']).toBe('Existing Person');
  });

  it('returns no collision for a brand-new email', async () => {
    const result = await handlers.get('contacts:check-collision')!({}, {
      emails: ['brand.new@example.com'],
      phones: [],
    }) as { email: Record<string, string>; phone: Record<string, string> };

    expect(Object.keys(result.email)).toHaveLength(0);
  });

  it('respects excludeId — skips collision when the matching contact is excluded', async () => {
    const id = insertContact(testDb, 'Self', { emails: ['self@example.com'] });

    const result = await handlers.get('contacts:check-collision')!({}, {
      emails: ['self@example.com'],
      phones: [],
      excludeId: id,
    }) as { email: Record<string, string>; phone: Record<string, string> };

    expect(Object.keys(result.email)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// contacts:get (#297)
// ---------------------------------------------------------------------------

describe('contacts:get', () => {
  it('returns the contact with correct fields', async () => {
    const id = insertContact(testDb, 'Get Me', { org: 'Acme', notes: 'some notes' });

    const result = await handlers.get('contacts:get')!({}, id) as { id: string; name: string; organization: string; notes: string };

    expect(result.id).toBe(id);
    expect(result.name).toBe('Get Me');
    expect(result.organization).toBe('Acme');
    expect(result.notes).toBe('some notes');
  });

  it('throws when contact ID does not exist', () => {
    expect(() => handlers.get('contacts:get')!({}, 'non-existent-id')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// contacts:merge validation (#285)
// ---------------------------------------------------------------------------

describe('contacts:merge validation', () => {
  it('throws when winnerId and loserId are the same', () => {
    const id = insertContact(testDb, 'Alice');
    expect(() => handlers.get('contacts:merge')!({}, { winnerId: id, loserId: id, strategy: 'keep' }))
      .toThrow('winnerId and loserId must be different');
  });

  it('throws on an invalid strategy', () => {
    const a = insertContact(testDb, 'Alice');
    const b = insertContact(testDb, 'Bob');
    expect(() => handlers.get('contacts:merge')!({}, { winnerId: a, loserId: b, strategy: 'bad' }))
      .toThrow('Invalid strategy');
  });

  it('throws when winner does not exist and leaves loser unchanged', () => {
    const b = insertContact(testDb, 'Bob');
    expect(() => handlers.get('contacts:merge')!({}, { winnerId: 'no-such-id', loserId: b, strategy: 'keep' }))
      .toThrow('Contact not found');
    expect(testDb.prepare('SELECT id FROM contacts WHERE id = ?').get(b)).toBeDefined();
  });

  it('throws when loser does not exist and leaves winner unchanged', () => {
    const a = insertContact(testDb, 'Alice');
    expect(() => handlers.get('contacts:merge')!({}, { winnerId: a, loserId: 'no-such-id', strategy: 'keep' }))
      .toThrow('Contact not found');
    expect(testDb.prepare('SELECT id FROM contacts WHERE id = ?').get(a)).toBeDefined();
  });
});
