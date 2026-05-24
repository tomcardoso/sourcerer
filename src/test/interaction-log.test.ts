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
import type { InteractionLogEntry, ContactLogEntry } from '../shared/types';

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
// interaction-log:add (#210, #294)
// ---------------------------------------------------------------------------

describe('interaction-log:add', () => {
  it('adds a log entry and returns it', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const projId = insertProject(testDb, 'Project Alpha');
    const membershipId = insertMembership(contactId, projId);

    const result = await handlers.get('interaction-log:add')!({}, {
      membershipId,
      body: 'Spoke on the phone',
    }) as InteractionLogEntry;

    expect(result.contact_id).toBe(contactId);
    expect(result.body).toBe('Spoke on the phone');
    expect(result.created_at).toBeGreaterThan(0);
    expect(result.reporter_email).toBe(TEST_REPORTER.email);
  });

  it('trims body whitespace', async () => {
    const contactId = insertContact(testDb, 'Bob Jones');
    const projId = insertProject(testDb, 'Project Beta');
    const membershipId = insertMembership(contactId, projId);

    const result = await handlers.get('interaction-log:add')!({}, {
      membershipId,
      body: '  trimmed body  ',
    }) as InteractionLogEntry;

    expect(result.body).toBe('trimmed body');
  });

  it('throws when membership does not exist', () => {
    expect(() =>
      handlers.get('interaction-log:add')!({}, {
        membershipId: 'nonexistent-id',
        body: 'Test body',
      }),
    ).toThrow(/Membership not found/);
  });

  it('throws when createdAt is 0 (invalid timestamp)', () => {
    const contactId = insertContact(testDb, 'Carol Davis');
    const projId = insertProject(testDb, 'Project Gamma');
    const membershipId = insertMembership(contactId, projId);

    expect(() =>
      handlers.get('interaction-log:add')!({}, {
        membershipId,
        body: 'Some body',
        createdAt: 0,
      }),
    ).toThrow(/invalid created_at/);
  });
});

// ---------------------------------------------------------------------------
// interaction-log:add-global (#210)
// ---------------------------------------------------------------------------

describe('interaction-log:add-global', () => {
  it('adds a global log entry not scoped to any project', async () => {
    const contactId = insertContact(testDb, 'Dave Evans');

    const result = await handlers.get('interaction-log:add-global')!({}, {
      contactId,
      body: 'Global note about Dave',
    }) as ContactLogEntry;

    expect(result.contact_id).toBe(contactId);
    expect(result.body).toBe('Global note about Dave');
    expect(result.project_name).toBeNull();
  });

  it('throws when createdAt is invalid', () => {
    const contactId = insertContact(testDb, 'Eve Frank');

    expect(() =>
      handlers.get('interaction-log:add-global')!({}, {
        contactId,
        body: 'Some body',
        createdAt: -1,
      }),
    ).toThrow(/invalid created_at/);
  });
});

// ---------------------------------------------------------------------------
// interaction-log:list (#210)
// ---------------------------------------------------------------------------

describe('interaction-log:list', () => {
  it('returns log entries for a membership', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const projId = insertProject(testDb, 'Project Alpha');
    const membershipId = insertMembership(contactId, projId);

    await handlers.get('interaction-log:add')!({}, { membershipId, body: 'Entry one' });
    await handlers.get('interaction-log:add')!({}, { membershipId, body: 'Entry two' });

    const results = await handlers.get('interaction-log:list')!({}, membershipId) as InteractionLogEntry[];

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.body)).toContain('Entry one');
    expect(results.map((r) => r.body)).toContain('Entry two');
  });

  it('returns empty array when membership has no entries', async () => {
    const contactId = insertContact(testDb, 'Nobody');
    const projId = insertProject(testDb, 'Empty Project');
    const membershipId = insertMembership(contactId, projId);

    const results = await handlers.get('interaction-log:list')!({}, membershipId) as InteractionLogEntry[];
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// interaction-log:list-for-contact (#210)
// ---------------------------------------------------------------------------

describe('interaction-log:list-for-contact', () => {
  it('returns log entries for a contact across projects', async () => {
    const contactId = insertContact(testDb, 'Multi-project Person');
    const proj1 = insertProject(testDb, 'Project 1');
    const proj2 = insertProject(testDb, 'Project 2');
    const mid1 = insertMembership(contactId, proj1);
    const mid2 = insertMembership(contactId, proj2);

    await handlers.get('interaction-log:add')!({}, { membershipId: mid1, body: 'Note for project 1' });
    await handlers.get('interaction-log:add')!({}, { membershipId: mid2, body: 'Note for project 2' });

    const results = await handlers.get('interaction-log:list-for-contact')!({}, contactId) as ContactLogEntry[];

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.body)).toContain('Note for project 1');
    expect(results.map((r) => r.body)).toContain('Note for project 2');
  });
});

// ---------------------------------------------------------------------------
// interaction-log:delete (#210)
// ---------------------------------------------------------------------------

describe('interaction-log:delete', () => {
  it('deletes a log entry', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const projId = insertProject(testDb, 'Project Alpha');
    const membershipId = insertMembership(contactId, projId);

    const entry = await handlers.get('interaction-log:add')!({}, { membershipId, body: 'Delete me' }) as InteractionLogEntry;

    await handlers.get('interaction-log:delete')!({}, entry.id);

    const row = testDb.prepare('SELECT id FROM interaction_log_entries WHERE id = ?').get(entry.id);
    expect(row).toBeUndefined();
  });
});
