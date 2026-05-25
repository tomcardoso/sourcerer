import { beforeEach, describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb, insertContact, insertProject, TEST_REPORTER } from './vitest.setup';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  dialog: { showSaveDialog: vi.fn() },
}));

let testDb: ReturnType<typeof createTestDb>;
vi.mock('../main/database', () => ({ getDatabase: () => testDb }));
vi.mock('../main/database/shared-db', () => ({
  createSharedDb: vi.fn(),
  openSharedDb: vi.fn(),
  closeSharedDb: vi.fn(),
  rekeySharedDb: vi.fn(),
}));
vi.mock('../main/sync/engine', () => ({ syncProject: vi.fn(() => ({ success: true })) }));
vi.mock('../main/sync/payload', () => ({
  encodePayload: vi.fn(() => 'encoded-payload'),
  decodePayload: vi.fn(),
}));
vi.mock('../main/ipc/reminders', () => ({ broadcastRemindersChanged: vi.fn() }));

import { ipcMain } from 'electron';
import { registerProjectHandlers } from '../main/ipc/projects';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

beforeEach(() => {
  testDb = createTestDb();
  handlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn) => {
    handlers.set(channel, fn as (...args: unknown[]) => unknown);
    return ipcMain;
  });
  registerProjectHandlers();
});

// ---------------------------------------------------------------------------
// projects:create (#204)
// ---------------------------------------------------------------------------

describe('projects:create', () => {
  it('creates a project and returns it with correct fields', async () => {
    const result = await handlers.get('projects:create')!({}, { name: '  My Project  ', description: 'A desc' }) as { id: string; name: string; description: string; created_at: number };

    expect(result.name).toBe('My Project');
    expect(result.description).toBe('A desc');
    expect(result.created_at).toBeGreaterThan(0);

    const row = testDb.prepare('SELECT id FROM projects WHERE id = ?').get(result.id);
    expect(row).toBeDefined();
  });

  it('stores null description when description is empty', async () => {
    const result = await handlers.get('projects:create')!({}, { name: 'No Desc', description: '' }) as { description: string | null };
    expect(result.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// projects:rename (#204)
// ---------------------------------------------------------------------------

describe('projects:rename', () => {
  it('renames a project', async () => {
    const id = insertProject(testDb, 'Old Name');

    await handlers.get('projects:rename')!({}, { id, name: 'New Name' });

    const row = testDb.prepare('SELECT name FROM projects WHERE id = ?').get(id) as { name: string };
    expect(row.name).toBe('New Name');
  });
});

// ---------------------------------------------------------------------------
// projects:update (#204)
// ---------------------------------------------------------------------------

describe('projects:update', () => {
  it('updates name and description, returns updated project', async () => {
    const id = insertProject(testDb, 'Old Project');

    const result = await handlers.get('projects:update')!({}, { id, name: 'Updated Project', description: 'new desc' }) as { id: string; name: string; description: string };

    expect(result.name).toBe('Updated Project');
    expect(result.description).toBe('new desc');
  });
});

// ---------------------------------------------------------------------------
// projects:archive (#204)
// ---------------------------------------------------------------------------

describe('projects:archive', () => {
  it('marks a project as archived', async () => {
    const id = insertProject(testDb, 'Archive Me');

    await handlers.get('projects:archive')!({}, id);

    const row = testDb.prepare('SELECT is_archived FROM projects WHERE id = ?').get(id) as { is_archived: number };
    expect(row.is_archived).toBe(1);
  });

  it('unarchive restores is_archived to 0', async () => {
    const id = insertProject(testDb, 'Unarchive Me');
    testDb.prepare('UPDATE projects SET is_archived = 1 WHERE id = ?').run(id);

    await handlers.get('projects:unarchive')!({}, id);

    const row = testDb.prepare('SELECT is_archived FROM projects WHERE id = ?').get(id) as { is_archived: number };
    expect(row.is_archived).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// projects:delete (#204)
// ---------------------------------------------------------------------------

describe('projects:delete', () => {
  it('deletes the project', async () => {
    const id = insertProject(testDb, 'Delete Me');

    await handlers.get('projects:delete')!({}, id);

    const row = testDb.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('cascades to memberships when project is deleted', async () => {
    const projId = insertProject(testDb, 'Project With Members');
    const contactId = insertContact(testDb, 'Member');
    const now = Math.floor(Date.now() / 1000);
    testDb.prepare(
      'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(uuidv4(), contactId, projId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);

    await handlers.get('projects:delete')!({}, projId);

    const memberships = testDb.prepare('SELECT id FROM project_memberships WHERE project_id = ?').all(projId);
    expect(memberships).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// projects:list-timeline (#204)
// ---------------------------------------------------------------------------

describe('projects:list-timeline', () => {
  it('returns timeline entries for a project', async () => {
    const projId = insertProject(testDb, 'Timeline Project');
    const contactId = insertContact(testDb, 'Alice Smith');
    const now = Math.floor(Date.now() / 1000);
    const membershipId = uuidv4();
    testDb.prepare(
      'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(membershipId, contactId, projId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);

    const logId = uuidv4();
    testDb.prepare(
      'INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(logId, contactId, TEST_REPORTER.email, TEST_REPORTER.name, 'Timeline entry body', now);
    testDb.prepare('INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(logId, membershipId);

    const results = await handlers.get('projects:list-timeline')!({}, projId) as { id: string; body: string }[];

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(logId);
    expect(results[0].body).toBe('Timeline entry body');
  });

  it('returns an empty array when the project has no log entries', async () => {
    const projId = insertProject(testDb, 'Empty Project');

    const results = await handlers.get('projects:list-timeline')!({}, projId) as unknown[];
    expect(results).toHaveLength(0);
  });

  it('returns at most 200 entries when more exist', async () => {
    const projId = insertProject(testDb, 'Big Project');
    const contactId = insertContact(testDb, 'Alice Smith');
    const now = Math.floor(Date.now() / 1000);
    const membershipId = uuidv4();
    testDb.prepare(
      'INSERT INTO project_memberships (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(membershipId, contactId, projId, TEST_REPORTER.email, TEST_REPORTER.name, now, now);

    for (let i = 0; i < 201; i++) {
      const logId = uuidv4();
      testDb.prepare(
        'INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(logId, contactId, TEST_REPORTER.email, TEST_REPORTER.name, `Entry ${i}`, now - i);
      testDb.prepare('INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(logId, membershipId);
    }

    const results = await handlers.get('projects:list-timeline')!({}, projId) as unknown[];
    expect(results.length).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// contacts:list-timeline
// ---------------------------------------------------------------------------

describe('contacts:list-timeline', () => {
  it('returns at most 200 entries when more exist', async () => {
    const contactId = insertContact(testDb, 'Bob Jones');
    const now = Math.floor(Date.now() / 1000);

    for (let i = 0; i < 201; i++) {
      testDb.prepare(
        'INSERT INTO interaction_log_entries (id, contact_id, reporter_email, reporter_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(uuidv4(), contactId, TEST_REPORTER.email, TEST_REPORTER.name, `Entry ${i}`, now - i);
    }

    const results = await handlers.get('contacts:list-timeline')!({}) as unknown[];
    expect(results.length).toBeLessThanOrEqual(200);
  });
});
