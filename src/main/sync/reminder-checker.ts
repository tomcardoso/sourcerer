import { Notification } from 'electron';
import { getDatabase, isDatabaseOpen } from '../database';

// Tracks which reminder IDs have already triggered a notification this session.
// Cleared on unlock so every session gets a fresh check.
const notifiedThisSession = new Set<string>();

interface DueReminder {
  id: string;
  contact_name: string;
  project_name: string | null;
  note: string | null;
}

export function checkReminders(): void {
  if (!isDatabaseOpen()) return;
  const db = getDatabase();

  const userRow = db
    .prepare('SELECT reminder_notifications_enabled FROM users WHERE id = 1')
    .get() as { reminder_notifications_enabled: number } | undefined;
  const notificationsEnabled = userRow?.reminder_notifications_enabled !== 0;

  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 86400;

  const rows = db
    .prepare(
      `SELECT r.id, c.name AS contact_name, p.name AS project_name, r.note
       FROM reminders r
       JOIN contacts c ON c.id = r.contact_id
       LEFT JOIN projects p ON p.id = r.project_id
       WHERE r.due_date <= ? AND r.is_auto_outreach = 0 AND r.completed_at IS NULL
         AND (r.project_id IS NULL OR p.is_archived = 0)
         AND (r.last_notified_at IS NULL OR r.last_notified_at < ?)`,
    )
    .all(now, oneDayAgo) as DueReminder[];

  const stamp = db.prepare('UPDATE reminders SET last_notified_at = ? WHERE id = ?');

  for (const row of rows) {
    if (notifiedThisSession.has(row.id)) continue;
    notifiedThisSession.add(row.id);

    if (!notificationsEnabled) continue;

    stamp.run(now, row.id);

    const body = row.note
      ? (row.project_name ? `${row.project_name} · ${row.note}` : row.note)
      : (row.project_name ?? 'Reminder');

    const notif = new Notification({
      title: `Reminder: ${row.contact_name}`,
      body,
    });
    notif.show();
  }
}

export function clearReminderNotificationCache(): void {
  notifiedThisSession.clear();
}
