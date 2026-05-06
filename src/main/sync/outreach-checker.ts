import { Notification } from 'electron';
import { getDatabase, isDatabaseOpen } from '../database';

// Tracks which membership IDs have already triggered a notification this session.
// Cleared on unlock so every session gets a fresh check.
const notifiedThisSession = new Set<string>();

interface OverdueRow {
  membership_id: string;
  contact_name: string;
  project_name: string;
  interval_days: number;
  last_contacted: number | null;
}

export function checkOutreachReminders(): void {
  if (!isDatabaseOpen()) return;
  const db = getDatabase();

  const user = db
    .prepare('SELECT outreach_reminders_enabled FROM users WHERE id = 1')
    .get() as { outreach_reminders_enabled: number } | undefined;
  if (!user?.outreach_reminders_enabled) return;

  const now = Math.floor(Date.now() / 1000);

  const rows = db
    .prepare(
      `SELECT
         pm.id                                                              AS membership_id,
         c.name                                                             AS contact_name,
         p.name                                                             AS project_name,
         COALESCE(pm.outreach_interval_days, po.outreach_interval_days)    AS interval_days,
         MAX(ile.created_at)                                                AS last_contacted
       FROM project_memberships pm
       JOIN contacts c  ON c.id = pm.contact_id
       JOIN projects p  ON p.id = pm.project_id
       LEFT JOIN priority_options po ON po.label = pm.priority
       LEFT JOIN interaction_log_entries ile ON ile.membership_id = pm.id
       WHERE pm.outreach_reminders_disabled = 0
         AND COALESCE(pm.outreach_interval_days, po.outreach_interval_days) IS NOT NULL
       GROUP BY pm.id`,
    )
    .all() as OverdueRow[];

  for (const row of rows) {
    if (notifiedThisSession.has(row.membership_id)) continue;

    const thresholdSecs = now - row.interval_days * 86400;
    const lastContacted = row.last_contacted ?? 0;

    if (lastContacted >= thresholdSecs) continue;

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
