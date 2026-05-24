import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createTestDb, insertContact, insertProject } from './vitest.setup';

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
import type { ScratchpadDraft } from '../shared/types';

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
// scratchpad:list (#219)
// ---------------------------------------------------------------------------

describe('scratchpad:list', () => {
  it('returns an empty array when no drafts exist', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const projId = insertProject(testDb, 'Project Alpha');

    const result = await handlers.get('scratchpad:list')!({}, { contactId, projectId: projId }) as ScratchpadDraft[];
    expect(result).toHaveLength(0);
  });

  it('returns drafts for the correct contact+project combination', async () => {
    const c1 = insertContact(testDb, 'Alice Smith');
    const c2 = insertContact(testDb, 'Bob Jones');
    const p1 = insertProject(testDb, 'Project Alpha');
    const p2 = insertProject(testDb, 'Project Beta');

    // Create a draft for c1+p1
    await handlers.get('scratchpad:save')!({}, { contactId: c1, projectId: p1, label: 'Draft A', body: 'Body A' });
    // Create a draft for c2+p2 — should not appear in c1+p1 list
    await handlers.get('scratchpad:save')!({}, { contactId: c2, projectId: p2, label: 'Draft B', body: 'Body B' });

    const result = await handlers.get('scratchpad:list')!({}, { contactId: c1, projectId: p1 }) as ScratchpadDraft[];
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Draft A');
  });
});

// ---------------------------------------------------------------------------
// scratchpad:save (#219)
// ---------------------------------------------------------------------------

describe('scratchpad:save', () => {
  it('creates a new draft when no id is provided', async () => {
    const contactId = insertContact(testDb, 'Carol Davis');
    const projId = insertProject(testDb, 'Project Gamma');

    const result = await handlers.get('scratchpad:save')!({}, {
      contactId,
      projectId: projId,
      label: 'Interview template',
      body: 'Hello {name}, ...',
    }) as ScratchpadDraft;

    expect(result.id).toBeTruthy();
    expect(result.contact_id).toBe(contactId);
    expect(result.project_id).toBe(projId);
    expect(result.label).toBe('Interview template');
    expect(result.body).toBe('Hello {name}, ...');
    expect(result.created_at).toBeGreaterThan(0);
    expect(result.updated_at).toBeGreaterThan(0);
  });

  it('updates an existing draft when id is provided', async () => {
    const contactId = insertContact(testDb, 'Dave Evans');
    const projId = insertProject(testDb, 'Project Delta');

    const created = await handlers.get('scratchpad:save')!({}, {
      contactId,
      projectId: projId,
      label: 'Original label',
      body: 'Original body',
    }) as ScratchpadDraft;

    const updated = await handlers.get('scratchpad:save')!({}, {
      id: created.id,
      contactId,
      projectId: projId,
      label: 'Updated label',
      body: 'Updated body',
    }) as ScratchpadDraft;

    expect(updated.id).toBe(created.id);
    expect(updated.label).toBe('Updated label');
    expect(updated.body).toBe('Updated body');
  });
});

// ---------------------------------------------------------------------------
// scratchpad:delete (#219)
// ---------------------------------------------------------------------------

describe('scratchpad:delete', () => {
  it('deletes a draft', async () => {
    const contactId = insertContact(testDb, 'Eve Frank');
    const projId = insertProject(testDb, 'Project Epsilon');

    const created = await handlers.get('scratchpad:save')!({}, {
      contactId,
      projectId: projId,
      label: 'Delete me',
      body: 'To be deleted',
    }) as ScratchpadDraft;

    await handlers.get('scratchpad:delete')!({}, created.id);

    const row = testDb.prepare('SELECT id FROM message_scratchpad_drafts WHERE id = ?').get(created.id);
    expect(row).toBeUndefined();
  });
});
