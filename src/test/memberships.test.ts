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
vi.mock('../main/sync/outreach-checker', () => ({ checkOutreachReminders: vi.fn() }));

import { ipcMain } from 'electron';
import { registerContactHandlers } from '../main/ipc/contacts';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

function insertMembership(contactId: string, projectId: string): string {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  testDb.prepare(
    'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, contactId, projectId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);
  return id;
}

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
// memberships:add (#215)
// ---------------------------------------------------------------------------

describe('memberships:add', () => {
  it('adds a membership for a contact in a project', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const projId = insertProject(testDb, 'Project Alpha');

    await handlers.get('memberships:add')!({}, { contactId, projectId: projId });

    const row = testDb.prepare('SELECT id FROM project_memberships WHERE contact_id = ? AND project_id = ?').get(contactId, projId);
    expect(row).toBeDefined();
  });

  it('is idempotent — adding the same membership twice does not duplicate', async () => {
    const contactId = insertContact(testDb, 'Bob Jones');
    const projId = insertProject(testDb, 'Project Beta');

    await handlers.get('memberships:add')!({}, { contactId, projectId: projId });
    await handlers.get('memberships:add')!({}, { contactId, projectId: projId });

    const count = (testDb.prepare('SELECT COUNT(*) AS n FROM project_memberships WHERE contact_id = ? AND project_id = ?').get(contactId, projId) as { n: number }).n;
    expect(count).toBe(1);
  });

  it('sets default_membership_id on the contact when it was null', async () => {
    const contactId = insertContact(testDb, 'Carol Davis');
    const projId = insertProject(testDb, 'Project Gamma');

    await handlers.get('memberships:add')!({}, { contactId, projectId: projId });

    const row = testDb.prepare('SELECT default_membership_id FROM contacts WHERE id = ?').get(contactId) as { default_membership_id: string | null };
    expect(row.default_membership_id).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// memberships:remove (#215)
// ---------------------------------------------------------------------------

describe('memberships:remove', () => {
  it('removes a membership', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const projId = insertProject(testDb, 'Project Alpha');
    insertMembership(contactId, projId);

    await handlers.get('memberships:remove')!({}, { contactId, projectId: projId });

    const row = testDb.prepare('SELECT id FROM project_memberships WHERE contact_id = ? AND project_id = ?').get(contactId, projId);
    expect(row).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// memberships:update (#215, #225)
// ---------------------------------------------------------------------------

describe('memberships:update', () => {
  it('updates status and priority', async () => {
    const contactId = insertContact(testDb, 'Bob Jones');
    const projId = insertProject(testDb, 'Project Beta');
    const membershipId = insertMembership(contactId, projId);

    await handlers.get('memberships:update')!({}, {
      membershipId,
      status: 'In dialogue',
      priority: 'High',
    });

    const row = testDb.prepare('SELECT status, priority FROM project_memberships WHERE id = ?').get(membershipId) as { status: string; priority: string };
    expect(row.status).toBe('In dialogue');
    expect(row.priority).toBe('High');
  });

  it('advances updated_at after update (timestamp advancement)', async () => {
    const contactId = insertContact(testDb, 'Carol Davis');
    const projId = insertProject(testDb, 'Project Gamma');
    const membershipId = insertMembership(contactId, projId);
    const staleTs = Math.floor(Date.now() / 1000) - 100;
    testDb.prepare('UPDATE project_memberships SET updated_at = ? WHERE id = ?').run(staleTs, membershipId);

    await handlers.get('memberships:update')!({}, {
      membershipId,
      status: 'Declined',
    });

    const row = testDb.prepare('SELECT updated_at FROM project_memberships WHERE id = ?').get(membershipId) as { updated_at: number };
    expect(row.updated_at).toBeGreaterThan(staleTs);
  });
});

// ---------------------------------------------------------------------------
// memberships:bulk-update (#215)
// ---------------------------------------------------------------------------

describe('memberships:bulk-update', () => {
  it('updates status on multiple memberships at once', async () => {
    const c1 = insertContact(testDb, 'Alice Smith');
    const c2 = insertContact(testDb, 'Bob Jones');
    const projId = insertProject(testDb, 'Bulk Project');
    const mid1 = insertMembership(c1, projId);
    const mid2 = insertMembership(c2, projId);

    await handlers.get('memberships:bulk-update')!({}, {
      membershipIds: [mid1, mid2],
      status: 'Declined',
    });

    const rows = testDb.prepare('SELECT status FROM project_memberships WHERE id IN (?, ?)').all(mid1, mid2) as { status: string }[];
    expect(rows.every((r) => r.status === 'Declined')).toBe(true);
  });

  it('is a no-op when membershipIds is empty', () => {
    const projId = insertProject(testDb, 'Empty Bulk');
    const contactId = insertContact(testDb, 'Carol Davis');
    const mid = insertMembership(contactId, projId);

    // The handler returns early (undefined) when membershipIds is empty
    expect(() =>
      handlers.get('memberships:bulk-update')!({}, { membershipIds: [], status: 'Declined' }),
    ).not.toThrow();

    const row = testDb.prepare('SELECT status FROM project_memberships WHERE id = ?').get(mid) as { status: string | null };
    expect(row.status).toBeNull(); // unchanged
  });
});

// ---------------------------------------------------------------------------
// memberships:set-reporters (#215)
// ---------------------------------------------------------------------------

describe('memberships:set-reporters', () => {
  it('sets reporters on a membership', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const projId = insertProject(testDb, 'Project Alpha');
    const membershipId = insertMembership(contactId, projId);

    await handlers.get('memberships:set-reporters')!({}, {
      membershipId,
      reporters: [
        { email: 'reporter1@example.com', name: 'Reporter One' },
        { email: 'reporter2@example.com', name: 'Reporter Two' },
      ],
    });

    const rows = testDb.prepare('SELECT reporter_email FROM membership_reporters WHERE membership_id = ?').all(membershipId) as { reporter_email: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.reporter_email)).toContain('reporter1@example.com');
    expect(rows.map((r) => r.reporter_email)).toContain('reporter2@example.com');
  });

  it('replaces existing reporters when called again', async () => {
    const contactId = insertContact(testDb, 'Bob Jones');
    const projId = insertProject(testDb, 'Project Beta');
    const membershipId = insertMembership(contactId, projId);

    await handlers.get('memberships:set-reporters')!({}, {
      membershipId,
      reporters: [{ email: 'old@example.com', name: 'Old Reporter' }],
    });
    await handlers.get('memberships:set-reporters')!({}, {
      membershipId,
      reporters: [{ email: 'new@example.com', name: 'New Reporter' }],
    });

    const rows = testDb.prepare('SELECT reporter_email FROM membership_reporters WHERE membership_id = ?').all(membershipId) as { reporter_email: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].reporter_email).toBe('new@example.com');
  });

  it('skips reporters with invalid email addresses', async () => {
    const contactId = insertContact(testDb, 'Carol Davis');
    const projId = insertProject(testDb, 'Project Gamma');
    const membershipId = insertMembership(contactId, projId);

    await handlers.get('memberships:set-reporters')!({}, {
      membershipId,
      reporters: [
        { email: 'valid@example.com', name: 'Valid' },
        { email: 'not-an-email', name: 'Invalid' },
      ],
    });

    const rows = testDb.prepare('SELECT reporter_email FROM membership_reporters WHERE membership_id = ?').all(membershipId) as { reporter_email: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].reporter_email).toBe('valid@example.com');
  });
});
