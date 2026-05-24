import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createTestDb, insertContact, insertProject } from './vitest.setup';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

let testDb: ReturnType<typeof createTestDb>;
vi.mock('../main/database', () => ({ getDatabase: () => testDb }));

import { ipcMain } from 'electron';
import { registerReminderHandlers } from '../main/ipc/reminders';
import type { Reminder } from '../shared/types';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

beforeEach(() => {
  testDb = createTestDb();
  handlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn) => {
    handlers.set(channel, fn as (...args: unknown[]) => unknown);
    return ipcMain;
  });
  registerReminderHandlers();
});

// ---------------------------------------------------------------------------
// reminders:create (#200)
// ---------------------------------------------------------------------------

describe('reminders:create', () => {
  it('creates a reminder and returns it with correct fields', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const projId = insertProject(testDb, 'Project Alpha');
    const dueDate = Math.floor(Date.now() / 1000) + 86400; // tomorrow

    const result = await handlers.get('reminders:create')!({}, {
      contactId,
      projectId: projId,
      dueDate,
      note: 'Follow up',
    }) as Reminder;

    expect(result.contact_id).toBe(contactId);
    expect(result.project_id).toBe(projId);
    expect(result.due_date).toBe(dueDate);
    expect(result.note).toBe('Follow up');
    expect(result.completed_at).toBeNull();
    expect(result.created_at).toBeGreaterThan(0);
  });

  it('creates a reminder without a project', async () => {
    const contactId = insertContact(testDb, 'Bob Jones');
    const dueDate = Math.floor(Date.now() / 1000) + 86400;

    const result = await handlers.get('reminders:create')!({}, {
      contactId,
      dueDate,
    }) as Reminder;

    expect(result.contact_id).toBe(contactId);
    expect(result.project_id).toBeNull();
  });

  it('throws on an invalid dueDate of 0', () => {
    const contactId = insertContact(testDb, 'Carol Davis');

    expect(() => handlers.get('reminders:create')!({}, { contactId, dueDate: 0 })).toThrow(/invalid due_date/);
  });

  it('throws on a negative dueDate', () => {
    const contactId = insertContact(testDb, 'Dave Evans');

    expect(() => handlers.get('reminders:create')!({}, { contactId, dueDate: -1 })).toThrow(/invalid due_date/);
  });
});

// ---------------------------------------------------------------------------
// reminders:update (#200, #225)
// ---------------------------------------------------------------------------

describe('reminders:update', () => {
  it('updates dueDate and note', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const dueDate = Math.floor(Date.now() / 1000) + 86400;
    const created = await handlers.get('reminders:create')!({}, { contactId, dueDate, note: 'original' }) as Reminder;
    const newDue = dueDate + 86400;

    const updated = await handlers.get('reminders:update')!({}, {
      id: created.id,
      dueDate: newDue,
      note: 'updated note',
    }) as Reminder;

    expect(updated.due_date).toBe(newDue);
    expect(updated.note).toBe('updated note');
  });

  it('throws when reminder does not exist', () => {
    const newDue = Math.floor(Date.now() / 1000) + 86400;
    expect(() =>
      handlers.get('reminders:update')!({}, { id: 'nonexistent', dueDate: newDue, note: null }),
    ).toThrow(/not found or not editable/);
  });
});

// ---------------------------------------------------------------------------
// reminders:complete / reminders:uncomplete (#200, #225)
// ---------------------------------------------------------------------------

describe('reminders:complete', () => {
  it('marks reminder complete: completed_at was null, is now set', async () => {
    const contactId = insertContact(testDb, 'Alice Smith');
    const dueDate = Math.floor(Date.now() / 1000) + 86400;
    const created = await handlers.get('reminders:create')!({}, { contactId, dueDate }) as Reminder;

    expect(created.completed_at).toBeNull();

    await handlers.get('reminders:complete')!({}, created.id);

    const row = testDb.prepare('SELECT completed_at FROM reminders WHERE id = ?').get(created.id) as { completed_at: number | null };
    expect(row.completed_at).not.toBeNull();
    expect(row.completed_at).toBeGreaterThan(0);
  });

  it('advances completed_at (timestamp advancement)', async () => {
    const contactId = insertContact(testDb, 'Bob Jones');
    const dueDate = Math.floor(Date.now() / 1000) + 86400;
    const created = await handlers.get('reminders:create')!({}, { contactId, dueDate }) as Reminder;

    // Backdate to a known stale value so we can verify the handler writes a newer one.
    const stale = Math.floor(Date.now() / 1000) - 3600;
    testDb.prepare('UPDATE reminders SET completed_at = ? WHERE id = ?').run(stale, created.id);

    await handlers.get('reminders:complete')!({}, created.id);

    const row = testDb.prepare('SELECT completed_at FROM reminders WHERE id = ?').get(created.id) as { completed_at: number };
    expect(row.completed_at).toBeGreaterThan(stale);
  });
});

describe('reminders:uncomplete', () => {
  it('marks reminder incomplete: completed_at is now null', async () => {
    const contactId = insertContact(testDb, 'Carol Davis');
    const dueDate = Math.floor(Date.now() / 1000) + 86400;
    const created = await handlers.get('reminders:create')!({}, { contactId, dueDate }) as Reminder;

    await handlers.get('reminders:complete')!({}, created.id);
    let row = testDb.prepare('SELECT completed_at FROM reminders WHERE id = ?').get(created.id) as { completed_at: number | null };
    expect(row.completed_at).not.toBeNull();

    await handlers.get('reminders:uncomplete')!({}, created.id);
    row = testDb.prepare('SELECT completed_at FROM reminders WHERE id = ?').get(created.id) as { completed_at: number | null };
    expect(row.completed_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reminders:delete (#200)
// ---------------------------------------------------------------------------

describe('reminders:delete', () => {
  it('deletes a reminder', async () => {
    const contactId = insertContact(testDb, 'Delete Me');
    const dueDate = Math.floor(Date.now() / 1000) + 86400;
    const created = await handlers.get('reminders:create')!({}, { contactId, dueDate }) as Reminder;

    await handlers.get('reminders:delete')!({}, created.id);

    const row = testDb.prepare('SELECT id FROM reminders WHERE id = ?').get(created.id);
    expect(row).toBeUndefined();
  });
});
