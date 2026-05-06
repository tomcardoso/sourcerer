import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import { pollAllRss, pollContactRss } from '../sync/rss-poller';
import type { ContactAlertRss, ContactAlertMention } from '@shared/types';

export function registerAlertHandlers(): void {
  ipcMain.handle('alerts:get-rss', (_, contactId: string): ContactAlertRss | null => {
    return (
      (getDatabase()
        .prepare(`SELECT * FROM contact_alert_rss WHERE contact_id = ?`)
        .get(contactId) as ContactAlertRss | undefined) ?? null
    );
  });

  ipcMain.handle(
    'alerts:set-rss',
    (_, { contactId, rssUrl }: { contactId: string; rssUrl: string }): void => {
      const db = getDatabase();
      const existing = db
        .prepare(`SELECT id FROM contact_alert_rss WHERE contact_id = ?`)
        .get(contactId);
      if (existing) {
        db.prepare(
          `UPDATE contact_alert_rss SET rss_url = ?, is_invalid = 0, last_polled_at = NULL WHERE contact_id = ?`,
        ).run(rssUrl, contactId);
      } else {
        db.prepare(
          `INSERT INTO contact_alert_rss (id, contact_id, rss_url) VALUES (?, ?, ?)`,
        ).run(uuidv4(), contactId, rssUrl);
      }
      pollContactRss(contactId).catch(() => {});
    },
  );

  ipcMain.handle('alerts:clear-rss', (_, contactId: string): void => {
    getDatabase()
      .prepare(`DELETE FROM contact_alert_rss WHERE contact_id = ?`)
      .run(contactId);
  });

  ipcMain.handle('alerts:list-mentions', (): ContactAlertMention[] => {
    return getDatabase()
      .prepare(
        `SELECT m.id, m.contact_id, c.name AS contact_name,
                m.headline, m.source_url, m.published_at, m.fetched_at, m.guid, m.seen
         FROM contact_alert_mentions m
         JOIN contacts c ON c.id = m.contact_id
         WHERE m.dismissed = 0
         ORDER BY COALESCE(m.published_at, m.fetched_at) DESC`,
      )
      .all() as ContactAlertMention[];
  });

  ipcMain.handle('alerts:mark-seen', (_, id: string): void => {
    getDatabase()
      .prepare(`UPDATE contact_alert_mentions SET seen = 1 WHERE id = ? AND dismissed = 0`)
      .run(id);
  });

  ipcMain.handle('alerts:mark-all-seen', (): void => {
    getDatabase()
      .prepare(`UPDATE contact_alert_mentions SET seen = 1 WHERE dismissed = 0`)
      .run();
  });

  ipcMain.handle('alerts:clear-all-mentions', (): void => {
    getDatabase()
      .prepare(`UPDATE contact_alert_mentions SET dismissed = 1`)
      .run();
  });

  ipcMain.handle('alerts:unseen-count', (): number => {
    const row = getDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM contact_alert_mentions WHERE seen = 0 AND dismissed = 0`)
      .get() as { n: number };
    return row.n;
  });

  ipcMain.handle('alerts:poll-now', (): void => {
    pollAllRss().catch(() => {});
  });
}
