import Parser from 'rss-parser';
import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, isDatabaseOpen } from '../database';

const parser = new Parser({ timeout: 10000 });

export async function pollAllRss(): Promise<void> {
  if (!isDatabaseOpen()) return;
  const db = getDatabase();
  const feeds = db
    .prepare(`SELECT contact_id, rss_url FROM contact_alert_rss WHERE is_invalid = 0`)
    .all() as { contact_id: string; rss_url: string }[];

  let anyNew = false;
  for (const feed of feeds) {
    const hadNew = await pollOneFeed(feed.contact_id, feed.rss_url);
    if (hadNew) anyNew = true;
  }

  if (anyNew) emitMentionsUpdated();
}

export async function pollContactRss(contactId: string): Promise<void> {
  if (!isDatabaseOpen()) return;
  const db = getDatabase();
  const row = db
    .prepare(`SELECT rss_url FROM contact_alert_rss WHERE contact_id = ?`)
    .get(contactId) as { rss_url: string } | undefined;
  if (!row) return;
  const hadNew = await pollOneFeed(contactId, row.rss_url);
  if (hadNew) emitMentionsUpdated();
}

async function pollOneFeed(contactId: string, rssUrl: string): Promise<boolean> {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  try {
    const feed = await parser.parseURL(rssUrl);
    let anyNew = false;

    for (const item of feed.items ?? []) {
      const guid = item.guid ?? item.link ?? item.title ?? '';
      if (!guid) continue;

      const exists = db
        .prepare(`SELECT 1 FROM contact_alert_mentions WHERE guid = ? AND contact_id = ?`)
        .get(guid, contactId);
      if (exists) continue;

      const headline = item.title ?? 'Untitled';
      const sourceUrl = item.link ?? '';
      const publishedAt = item.pubDate
        ? Math.floor(new Date(item.pubDate).getTime() / 1000)
        : null;

      db.prepare(
        `INSERT INTO contact_alert_mentions (id, contact_id, headline, source_url, published_at, fetched_at, guid, seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      ).run(uuidv4(), contactId, headline, sourceUrl, publishedAt, now, guid);

      anyNew = true;
    }

    db.prepare(
      `UPDATE contact_alert_rss SET last_polled_at = ?, is_invalid = 0 WHERE contact_id = ?`,
    ).run(now, contactId);

    return anyNew;
  } catch {
    db.prepare(`UPDATE contact_alert_rss SET is_invalid = 1 WHERE contact_id = ?`).run(contactId);
    return false;
  }
}

export function emitMentionsUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mentions:updated');
  }
}
