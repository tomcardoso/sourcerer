import { beforeEach, describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb, insertContact, insertProject, TEST_REPORTER } from './vitest.setup';

// vi.mock is hoisted — these factories run before any import is resolved.
vi.mock('electron', () => ({
  // Use a regular function (not an arrow) so it can be called with `new`
  Notification: vi.fn(function (this: { show: () => void }) {
    this.show = vi.fn();
  }),
}));

vi.mock('../main/ipc/reminders', () => ({
  broadcastRemindersChanged: vi.fn(),
}));

// The module under test calls getDatabase() and isDatabaseOpen().
// We proxy to a test-local variable so each beforeEach gets a fresh DB.
let testDb: ReturnType<typeof createTestDb>;
vi.mock('../main/database', () => ({
  getDatabase: () => testDb,
  isDatabaseOpen: () => true,
}));

import { checkOutreachReminders, clearOutreachNotificationCache, nextWeekday } from '../main/sync/outreach-checker';
import { broadcastRemindersChanged } from '../main/ipc/reminders';

const broadcast = vi.mocked(broadcastRemindersChanged);

describe('nextWeekday', () => {
  // Noon local time — unambiguously the correct calendar day regardless of system timezone.
  // Jan 6 2024 = Saturday, Jan 7 = Sunday, Jan 8 = Monday, Jan 9 = Tuesday.
  const saturday = new Date(2024, 0, 6, 12, 0, 0).getTime() / 1000;
  const sunday   = new Date(2024, 0, 7, 12, 0, 0).getTime() / 1000;
  const monday   = new Date(2024, 0, 8, 12, 0, 0).getTime() / 1000;
  const tuesday  = new Date(2024, 0, 9, 12, 0, 0).getTime() / 1000;

  it('advances Saturday by 2 days to Monday', () => {
    expect(nextWeekday(saturday)).toBe(saturday + 2 * 86400);
  });

  it('advances Sunday by 1 day to Monday', () => {
    expect(nextWeekday(sunday)).toBe(sunday + 86400);
  });

  it('leaves a weekday (Tuesday) unchanged', () => {
    expect(nextWeekday(tuesday)).toBe(tuesday);
  });

  it('leaves Monday unchanged', () => {
    expect(nextWeekday(monday)).toBe(monday);
  });
});

function insertUser(
  overrides: { outreach_reminders_enabled?: number; outreach_require_interaction?: number } = {},
): void {
  const now = Math.floor(Date.now() / 1000);
  testDb.prepare(
    `INSERT OR REPLACE INTO users
       (id, first_name, last_name, email, created_at, calendar_token,
        outreach_reminders_enabled, outreach_require_interaction)
     VALUES (1, 'Test', 'User', ?, ?, 'tok', ?, ?)`,
  ).run(
    TEST_REPORTER.email,
    now,
    overrides.outreach_reminders_enabled ?? 1,
    overrides.outreach_require_interaction ?? 0,
  );
}

function insertProjectAndContact(): { projId: string; contactId: string } {
  return {
    projId: insertProject(testDb, 'Test Project'),
    contactId: insertContact(testDb, 'Test Contact'),
  };
}

function insertMembership(
  contactId: string,
  projId: string,
  intervalDays: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const membId = uuidv4();
  testDb.prepare(
    `INSERT INTO project_memberships
       (id, contact_id, project_id, reporter_email, reporter_name,
        outreach_interval_days, outreach_reminders_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(membId, contactId, projId, TEST_REPORTER.email, TEST_REPORTER.name, intervalDays, now, now);
  return membId;
}

function insertInteractionLog(membId: string, createdAt: number): void {
  const entryId = uuidv4();
  const { contact_id } = testDb.prepare('SELECT contact_id FROM project_memberships WHERE id = ?').get(membId) as { contact_id: string };
  testDb.prepare(
    `INSERT INTO interaction_log_entries
       (id, contact_id, reporter_email, reporter_name, body, created_at)
     VALUES (?, ?, ?, ?, 'note', ?)`,
  ).run(entryId, contact_id, TEST_REPORTER.email, TEST_REPORTER.name, createdAt);
  testDb.prepare('INSERT INTO interaction_projects (interaction_id, membership_id) VALUES (?, ?)').run(entryId, membId);
}

beforeEach(() => {
  testDb = createTestDb();
  broadcast.mockClear();
  clearOutreachNotificationCache();
});

describe('checkOutreachReminders — require_interaction guard', () => {
  it('skips a membership when require_interaction=1 and no log entry exists', () => {
    insertUser({ outreach_require_interaction: 1 });
    const { projId, contactId } = insertProjectAndContact();
    insertMembership(contactId, projId, 7);

    checkOutreachReminders();

    const count = (
      testDb.prepare('SELECT COUNT(*) AS n FROM reminders').get() as { n: number }
    ).n;
    expect(count).toBe(0);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('processes a membership when require_interaction=1 and a log entry exists', () => {
    insertUser({ outreach_require_interaction: 1 });
    const { projId, contactId } = insertProjectAndContact();
    const membId = insertMembership(contactId, projId, 7);
    const now = Math.floor(Date.now() / 1000);
    insertInteractionLog(membId, now - 3 * 86400); // contacted 3 days ago

    checkOutreachReminders();

    const count = (
      testDb.prepare('SELECT COUNT(*) AS n FROM reminders').get() as { n: number }
    ).n;
    expect(count).toBe(1);
    expect(broadcast).toHaveBeenCalledOnce();
  });
});

describe('checkOutreachReminders — require_interaction=0', () => {
  it('inserts a reminder using 0 as the base timestamp when no log entry exists', () => {
    insertUser({ outreach_require_interaction: 0 });
    const { projId, contactId } = insertProjectAndContact();
    const membId = insertMembership(contactId, projId, 7);

    checkOutreachReminders();

    const reminder = testDb
      .prepare('SELECT due_date FROM reminders WHERE membership_id = ? AND is_auto_outreach = 1')
      .get(membId) as { due_date: number } | undefined;
    expect(reminder).toBeDefined();
    // due_date = nextWeekday(0 + 7 * 86400) = nextWeekday(604800)
    const rawDue = 7 * 86400;
    const expectedDue = nextWeekday(rawDue);
    expect(reminder!.due_date).toBe(expectedDue);
  });
});

describe('checkOutreachReminders — first run', () => {
  it('inserts a reminder row and calls broadcastRemindersChanged', () => {
    insertUser();
    const { projId, contactId } = insertProjectAndContact();
    const membId = insertMembership(contactId, projId, 14);
    const now = Math.floor(Date.now() / 1000);
    insertInteractionLog(membId, now - 3 * 86400); // 3 days ago

    checkOutreachReminders();

    const reminder = testDb
      .prepare('SELECT * FROM reminders WHERE membership_id = ? AND is_auto_outreach = 1')
      .get(membId);
    expect(reminder).toBeDefined();
    expect(broadcast).toHaveBeenCalledOnce();
  });

  it('calls broadcastRemindersChanged once even when multiple memberships get new reminders in one run (#438)', () => {
    insertUser();
    const { projId, contactId: contactA } = insertProjectAndContact();
    const contactB = insertContact(testDb, 'Second Contact');
    const now = Math.floor(Date.now() / 1000);
    const membA = insertMembership(contactA, projId, 14);
    const membB = insertMembership(contactB, projId, 14);
    insertInteractionLog(membA, now - 3 * 86400);
    insertInteractionLog(membB, now - 3 * 86400);

    checkOutreachReminders();

    expect(broadcast).toHaveBeenCalledOnce();
  });

  it('due_date equals last_contacted + interval_days * 86400 (adjusted for weekends)', () => {
    insertUser();
    const { projId, contactId } = insertProjectAndContact();
    const membId = insertMembership(contactId, projId, 7);

    // Use a known timestamp that lands on a weekday after adding 7 days.
    // Tuesday Jan 9 2024 (UTC) + 7 days = Tuesday Jan 16 2024 (weekday — no adjustment).
    const lastContacted = Date.UTC(2024, 0, 9) / 1000; // Tuesday
    insertInteractionLog(membId, lastContacted);

    checkOutreachReminders();

    const reminder = testDb
      .prepare('SELECT due_date FROM reminders WHERE membership_id = ?')
      .get(membId) as { due_date: number };
    const expected = nextWeekday(lastContacted + 7 * 86400);
    expect(reminder.due_date).toBe(expected);
  });
});

describe('checkOutreachReminders — second run idempotency', () => {
  it('does NOT call broadcastRemindersChanged on a second run when due_date is unchanged', () => {
    insertUser();
    const { projId, contactId } = insertProjectAndContact();
    const membId = insertMembership(contactId, projId, 14);
    const now = Math.floor(Date.now() / 1000);
    insertInteractionLog(membId, now - 5 * 86400);

    checkOutreachReminders();
    broadcast.mockClear();
    checkOutreachReminders();

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('updates due_date and calls broadcastRemindersChanged when a new interaction is logged', () => {
    insertUser({ outreach_require_interaction: 0 });
    const { projId, contactId } = insertProjectAndContact();
    const membId = insertMembership(contactId, projId, 7);

    checkOutreachReminders();
    broadcast.mockClear();

    // Now add an interaction — last_contacted advances, so due_date shifts forward
    const now = Math.floor(Date.now() / 1000);
    insertInteractionLog(membId, now);
    checkOutreachReminders();

    const reminder = testDb
      .prepare('SELECT due_date FROM reminders WHERE membership_id = ?')
      .get(membId) as { due_date: number };
    const expected = nextWeekday(now + 7 * 86400);
    expect(reminder.due_date).toBe(expected);
    expect(broadcast).toHaveBeenCalledOnce();
  });
});

describe('checkOutreachReminders — overdue vs upcoming', () => {
  it('marks a reminder as overdue when due_date is in the past', () => {
    insertUser({ outreach_require_interaction: 0 });
    const { projId, contactId } = insertProjectAndContact();
    const membId = insertMembership(contactId, projId, 7);

    // No log entry → base=0 → due_date = 7 * 86400 (Jan 1970 — way in the past)
    checkOutreachReminders();

    const now = Math.floor(Date.now() / 1000);
    const reminder = testDb
      .prepare('SELECT due_date FROM reminders WHERE membership_id = ?')
      .get(membId) as { due_date: number };
    expect(reminder.due_date).toBeLessThan(now);
  });

  it('marks a reminder as upcoming when due_date is in the future', () => {
    insertUser();
    const { projId, contactId } = insertProjectAndContact();
    const membId = insertMembership(contactId, projId, 30);
    const now = Math.floor(Date.now() / 1000);
    insertInteractionLog(membId, now - 1 * 86400); // contacted yesterday

    checkOutreachReminders();

    const reminder = testDb
      .prepare('SELECT due_date FROM reminders WHERE membership_id = ?')
      .get(membId) as { due_date: number };
    expect(reminder.due_date).toBeGreaterThan(now);
  });
});

describe('checkOutreachReminders — disabled reminders', () => {
  it('exits early when outreach_reminders_enabled = 0 for the user', () => {
    insertUser({ outreach_reminders_enabled: 0 });
    const { projId, contactId } = insertProjectAndContact();
    insertMembership(contactId, projId, 7);

    checkOutreachReminders();

    const count = (
      testDb.prepare('SELECT COUNT(*) AS n FROM reminders').get() as { n: number }
    ).n;
    expect(count).toBe(0);
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('checkOutreachReminders — archived projects', () => {
  it('skips memberships belonging to an archived project', () => {
    insertUser();
    const projId = insertProject(testDb, 'Archived Project');
    testDb.prepare('UPDATE projects SET is_archived = 1 WHERE id = ?').run(projId);
    const contactId = insertContact(testDb, 'Test Contact');
    insertMembership(contactId, projId, 7);

    checkOutreachReminders();

    const count = (
      testDb.prepare('SELECT COUNT(*) AS n FROM reminders').get() as { n: number }
    ).n;
    expect(count).toBe(0);
    expect(broadcast).not.toHaveBeenCalled();
  });
});
