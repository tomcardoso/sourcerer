import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import { pollAllRss, pollContactRss } from '../sync/rss-poller';
import { validateUrl } from '@shared/validation';
import type { ContactAlertRss, ContactAlertMention } from '@shared/types';

export function registerAlertHandlers(): void {
  ipcMain.handle('alerts:list-rss', (_, contactId: string): ContactAlertRss[] => {
    return getDatabase()
      .prepare(`SELECT * FROM contact_alert_rss WHERE contact_id = ? ORDER BY rowid`)
      .all(contactId) as ContactAlertRss[];
  });

  ipcMain.handle(
    'alerts:add-rss',
    (_, { contactId, rssUrl }: { contactId: string; rssUrl: string }): void => {
      if (!validateUrl(rssUrl)) throw new Error('Invalid RSS URL');
      const db = getDatabase();
      const existing = db.prepare(`SELECT 1 FROM contact_alert_rss WHERE contact_id = ? AND rss_url = ?`).get(contactId, rssUrl);
      if (existing) return;
      const id = uuidv4();
      db.prepare(
        `INSERT INTO contact_alert_rss (id, contact_id, rss_url) VALUES (?, ?, ?)`,
      ).run(id, contactId, rssUrl);
      pollContactRss(contactId).catch((err) => console.error('[rss] initial poll failed:', err));
    },
  );

  ipcMain.handle('alerts:remove-rss', (_, id: string): void => {
    getDatabase()
      .prepare(`DELETE FROM contact_alert_rss WHERE id = ?`)
      .run(id);
  });

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

  ipcMain.handle('alerts:dismiss-mention', (_, id: string): void => {
    getDatabase()
      .prepare(`UPDATE contact_alert_mentions SET dismissed = 1 WHERE id = ?`)
      .run(id);
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

  ipcMain.handle('alerts:poll-now', async (): Promise<void> => {
    await pollAllRss();
  });

  ipcMain.handle('alerts:feed-count', (): number => {
    const row = getDatabase()
      .prepare(`SELECT COUNT(*) AS n FROM contact_alert_rss WHERE is_invalid = 0`)
      .get() as { n: number };
    return row.n;
  });

  ipcMain.handle('alerts:last-fetched', (): number | null => {
    const row = getDatabase()
      .prepare('SELECT last_rss_fetched_at FROM users WHERE id = 1')
      .get() as { last_rss_fetched_at: number | null } | undefined;
    return row?.last_rss_fetched_at ?? null;
  });
}
