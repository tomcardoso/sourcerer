import { beforeEach, describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb, insertContact, insertProject } from './vitest.setup';

vi.mock('electron', () => ({
  Notification: vi.fn(function (this: { show: ReturnType<typeof vi.fn> }) {
    this.show = vi.fn();
  }),
}));

let testDb: ReturnType<typeof createTestDb>;
vi.mock('../main/database', () => ({
  getDatabase: () => testDb,
  isDatabaseOpen: () => true,
}));

import { checkReminders, clearReminderNotificationCache } from '../main/sync/reminder-checker';
import { Notification } from 'electron';

const MockNotification = vi.mocked(Notification as unknown as new (...args: unknown[]) => { show: ReturnType<typeof vi.fn> });

function insertUser(overrides: { reminder_notifications_enabled?: number } = {}): void {
  const now = Math.floor(Date.now() / 1000);
  testDb.prepare(
    `INSERT OR REPLACE INTO users
       (id, first_name, last_name, email, created_at, calendar_token,
        outreach_reminders_enabled, outreach_require_interaction,
        reminder_notifications_enabled)
     VALUES (1, 'Test', 'User', 'test@example.com', ?, 'tok', 1, 0, ?)`,
  ).run(now, overrides.reminder_notifications_enabled ?? 1);
}

function insertReminder(
  contactId: string,
  projectId: string,
  overrides: {
    dueDate?: number;
    note?: string | null;
    isAutoOutreach?: number;
    completedAt?: number | null;
  } = {},
): string {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  testDb.prepare(
    `INSERT INTO reminders
       (id, contact_id, project_id, due_date, note, is_auto_outreach, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    contactId,
    projectId,
    overrides.dueDate ?? now - 1,       // overdue by default
    overrides.note ?? null,
    overrides.isAutoOutreach ?? 0,
    now,
    overrides.completedAt ?? null,
  );
  return id;
}

beforeEach(() => {
  testDb = createTestDb();
  MockNotification.mockClear();
  clearReminderNotificationCache();
});

describe('checkReminders', () => {
  it('fires a Notification for an overdue manual reminder', () => {
    insertUser();
    const cid = insertContact(testDb, 'Alice Smith');
    const pid = insertProject(testDb, 'Alpha');
    insertReminder(cid, pid);

    checkReminders();

    expect(MockNotification).toHaveBeenCalledOnce();
    const instance = MockNotification.mock.instances[0];
    expect(instance.show).toHaveBeenCalledOnce();
  });

  it('does not fire when reminder_notifications_enabled is 0', () => {
    insertUser({ reminder_notifications_enabled: 0 });
    const cid = insertContact(testDb, 'Bob Jones');
    const pid = insertProject(testDb, 'Beta');
    insertReminder(cid, pid);

    checkReminders();

    expect(MockNotification).not.toHaveBeenCalled();
  });

  it('does not fire for a completed reminder', () => {
    insertUser();
    const cid = insertContact(testDb, 'Carol White');
    const pid = insertProject(testDb, 'Gamma');
    const now = Math.floor(Date.now() / 1000);
    insertReminder(cid, pid, { completedAt: now - 3600 });

    checkReminders();

    expect(MockNotification).not.toHaveBeenCalled();
  });

  it('does not fire for a future reminder', () => {
    insertUser();
    const cid = insertContact(testDb, 'Dave Brown');
    const pid = insertProject(testDb, 'Delta');
    insertReminder(cid, pid, { dueDate: Math.floor(Date.now() / 1000) + 86400 });

    checkReminders();

    expect(MockNotification).not.toHaveBeenCalled();
  });

  it('does not fire for an auto-outreach reminder (handled by outreach-checker)', () => {
    insertUser();
    const cid = insertContact(testDb, 'Eve Green');
    const pid = insertProject(testDb, 'Epsilon');
    insertReminder(cid, pid, { isAutoOutreach: 1 });

    checkReminders();

    expect(MockNotification).not.toHaveBeenCalled();
  });

  it('does not re-fire for the same reminder on subsequent calls (session cache)', () => {
    insertUser();
    const cid = insertContact(testDb, 'Frank Black');
    const pid = insertProject(testDb, 'Zeta');
    insertReminder(cid, pid);

    checkReminders();
    checkReminders();

    expect(MockNotification).toHaveBeenCalledOnce();
  });

  it('does not re-fire within 24h even after clearReminderNotificationCache', () => {
    insertUser();
    const cid = insertContact(testDb, 'Grace Kim');
    const pid = insertProject(testDb, 'Eta');
    insertReminder(cid, pid);

    checkReminders();
    clearReminderNotificationCache();
    checkReminders();

    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it('re-fires after 24h have elapsed since last notification', () => {
    insertUser();
    const cid = insertContact(testDb, 'Grace Kim');
    const pid = insertProject(testDb, 'Eta');
    const reminderId = insertReminder(cid, pid);
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 86400;
    testDb.prepare('UPDATE reminders SET last_notified_at = ? WHERE id = ?').run(twoDaysAgo, reminderId);

    checkReminders();

    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it('includes the project name in the notification body when no note is set', () => {
    insertUser();
    const cid = insertContact(testDb, 'Henry Fox');
    const pid = insertProject(testDb, 'Project Theta');
    insertReminder(cid, pid);

    checkReminders();

    expect(MockNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('Project Theta') }),
    );
  });

  it('includes the note in the notification body when present', () => {
    insertUser();
    const cid = insertContact(testDb, 'Iris Park');
    const pid = insertProject(testDb, 'Iota');
    insertReminder(cid, pid, { note: 'Call back on Monday' });

    checkReminders();

    expect(MockNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('Call back on Monday') }),
    );
  });

  it('includes the contact name in the notification title', () => {
    insertUser();
    const cid = insertContact(testDb, 'James Clarke');
    const pid = insertProject(testDb, 'Kappa');
    insertReminder(cid, pid);

    checkReminders();

    expect(MockNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('James Clarke') }),
    );
  });

  it('skips reminders belonging to an archived project', () => {
    insertUser();
    const cid = insertContact(testDb, 'Lambda Contact');
    const pid = insertProject(testDb, 'Lambda');
    testDb.prepare('UPDATE projects SET is_archived = 1 WHERE id = ?').run(pid);
    insertReminder(cid, pid);

    checkReminders();

    expect(MockNotification).not.toHaveBeenCalled();
  });
});
