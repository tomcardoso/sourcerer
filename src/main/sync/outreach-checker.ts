import { Notification } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, isDatabaseOpen } from '../database';
import { broadcastRemindersChanged } from '../ipc/reminders';

// Tracks which membership IDs have already triggered a notification this session.
// Cleared on unlock so every session gets a fresh check.
const notifiedThisSession = new Set<string>();

interface OutreachRow {
  membership_id: string;
  contact_id: string;
  project_id: string;
  contact_name: string;
  project_name: string;
  interval_days: number;
  last_contacted: number | null;
}

export function nextWeekday(unixSeconds: number): number {
  const d = new Date(unixSeconds * 1000);
  const day = d.getUTCDay();
  if (day === 6) return unixSeconds + 2 * 86400; // Saturday → Monday
  if (day === 0) return unixSeconds + 86400;      // Sunday → Monday
  return unixSeconds;
}

export function checkOutreachReminders(): void {
  if (!isDatabaseOpen()) return;
  const db = getDatabase();

  const user = db
    .prepare('SELECT outreach_reminders_enabled, outreach_require_interaction FROM users WHERE id = 1')
    .get() as { outreach_reminders_enabled: number; outreach_require_interaction: number } | undefined;
  if (!user?.outreach_reminders_enabled) return;

  const now = Math.floor(Date.now() / 1000);

  const rows = db
    .prepare(
      `SELECT
         pm.id                                                              AS membership_id,
         pm.contact_id                                                      AS contact_id,
         pm.project_id                                                      AS project_id,
         c.name                                                             AS contact_name,
         p.name                                                             AS project_name,
         COALESCE(pm.outreach_interval_days, po.outreach_interval_days)    AS interval_days,
         MAX(ile.created_at)                                                AS last_contacted
       FROM project_memberships pm
       JOIN contacts c  ON c.id = pm.contact_id
       JOIN projects p  ON p.id = pm.project_id
       LEFT JOIN priority_options po ON po.label = pm.priority
       LEFT JOIN interaction_projects ip ON ip.membership_id = pm.id
       LEFT JOIN interaction_log_entries ile ON ile.id = ip.interaction_id
       WHERE pm.outreach_reminders_enabled = 1
         AND COALESCE(pm.outreach_interval_days, po.outreach_interval_days) IS NOT NULL
         AND pm.reporter_email = (SELECT email FROM users WHERE id = 1)
         AND p.is_archived = 0
       GROUP BY pm.id`,
    )
    .all() as OutreachRow[];

  for (const row of rows) {
    if (user.outreach_require_interaction && row.last_contacted === null) continue;

    const lastContacted = row.last_contacted ?? 0;
    const rawDueDate = lastContacted + row.interval_days * 86400;
    const dueDate = nextWeekday(rawDueDate);
    const isOverdue = dueDate < now;

    // Upsert the auto-outreach reminder with the correct due_date.
    // A single reminder per membership tracks the next outreach deadline,
    // appearing in Upcoming before it's due and Overdue after.
    const existing = db
      .prepare('SELECT id, due_date FROM reminders WHERE membership_id = ? AND is_auto_outreach = 1')
      .get(row.membership_id) as { id: string; due_date: number } | undefined;

    if (!existing) {
      db.prepare(
        `INSERT INTO reminders
           (id, contact_id, project_id, membership_id, due_date, note, is_auto_outreach, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 1, ?)`,
      ).run(uuidv4(), row.contact_id, row.project_id, row.membership_id, dueDate, now);
      broadcastRemindersChanged();
    } else if (existing.due_date !== dueDate) {
      db.prepare('UPDATE reminders SET due_date = ? WHERE id = ?').run(dueDate, existing.id);
      broadcastRemindersChanged();
    }

    // OS notification: only when overdue, once per session.
    if (!isOverdue || notifiedThisSession.has(row.membership_id)) continue;
    notifiedThisSession.add(row.membership_id);

    const daysSince =
      row.last_contacted !== null
        ? Math.floor((now - row.last_contacted) / 86400)
        : null;

    const body =
      daysSince !== null
        ? `Last contacted ${daysSince} day${daysSince === 1 ? '' : 's'} ago — ${row.project_name}`
        : `Never contacted — ${row.project_name}`;

    const notif = new Notification({ title: `Reach out to ${row.contact_name}`, body });
    notif.show();
  }
}

export function clearOutreachNotificationCache(): void {
  notifiedThisSession.clear();
}
