import Parser from 'rss-parser';
import { BrowserWindow, Notification } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, isDatabaseOpen } from '../database';

const parser = new Parser();

// Hostname patterns that are blocked to prevent SSRF.  Covers loopback,
// private RFC-1918, link-local, CGNAT, and IPv6 equivalents.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,           // IPv4 link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // CGNAT (RFC 6598)
  /^::1$/,                           // IPv6 loopback
  /^fe80:/i,                         // IPv6 link-local
  /^::ffff:/i,                       // IPv4-mapped IPv6
];

function cleanHeadline(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')           // strip HTML tags
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

function resolveUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Google Alerts redirect: google.com/url?url=...
    if ((u.hostname === 'www.google.com' || u.hostname === 'google.com') && u.pathname === '/url') {
      const dest = u.searchParams.get('url');
      if (dest) return dest;
    }
    // Google News redirect: news.google.com/rss/articles/... — no readable dest, leave as-is
    return raw;
  } catch {
    return raw;
  }
}

export async function pollAllRss(): Promise<void> {
  if (!isDatabaseOpen()) return;
  const db = getDatabase();

  const userRow = db
    .prepare('SELECT alert_notifications_enabled FROM users WHERE id = 1')
    .get() as { alert_notifications_enabled: number } | undefined;
  const alertNotificationsEnabled = userRow?.alert_notifications_enabled !== 0;

  const feeds = db
    .prepare(
      `SELECT car.id, car.contact_id, car.rss_url, c.name AS contact_name
       FROM contact_alert_rss car
       JOIN contacts c ON c.id = car.contact_id
       WHERE car.is_invalid = 0`,
    )
    .all() as { id: string; contact_id: string; rss_url: string; contact_name: string }[];

  let anyNew = false;
  for (const feed of feeds) {
    const newCount = await pollOneFeed(feed.id, feed.contact_id, feed.rss_url);
    if (newCount > 0) {
      anyNew = true;
      if (alertNotificationsEnabled && Notification.isSupported()) {
        try {
          const notif = new Notification({
            title: `New mention: ${feed.contact_name}`,
            body: newCount === 1 ? '1 new hit' : `${newCount} new hits`,
          });
          notif.show();
        } catch (err) {
          console.error('[alerts] Failed to show notification:', err);
        }
      }
    }
  }

  if (anyNew) emitMentionsUpdated();

  // Stamp last fetch time
  db.prepare('UPDATE users SET last_rss_fetched_at = ? WHERE id = 1').run(Math.floor(Date.now() / 1000));
}

export async function pollContactRss(contactId: string): Promise<void> {
  if (!isDatabaseOpen()) return;
  const db = getDatabase();
  const feeds = db
    .prepare(`SELECT id, rss_url FROM contact_alert_rss WHERE contact_id = ? AND is_invalid = 0`)
    .all(contactId) as { id: string; rss_url: string }[];
  let anyNew = false;
  for (const feed of feeds) {
    const newCount = await pollOneFeed(feed.id, contactId, feed.rss_url);
    if (newCount > 0) anyNew = true;
  }
  if (anyNew) emitMentionsUpdated();
}

async function pollOneFeed(feedId: string, contactId: string, rssUrl: string): Promise<number> {
  // Reject non-HTTP(S) URLs and loopback/private addresses to prevent SSRF
  try {
    const parsed = new URL(rssUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 0;
    const host = parsed.hostname;
    if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) return 0;
  } catch {
    return 0;
  }

  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  try {
    // Fetch the feed URL manually first so we can inspect the HTTP status code
    // before handing it off to the parser.
    const response = await fetch(rssUrl);
    if (response.status >= 400 && response.status < 500) {
      // Permanent client error — the URL is genuinely broken; mark invalid.
      db.prepare(`UPDATE contact_alert_rss SET is_invalid = 1 WHERE id = ?`).run(feedId);
      return 0;
    } else if (!response.ok) {
      // Transient server-side or network error — skip this poll, do not mark invalid.
      console.warn(`[rss] Transient HTTP ${response.status} for feed ${feedId}, will retry`);
      return 0;
    }

    const text = await response.text();
    const feed = await parser.parseString(text);
    let newCount = 0;

    for (const item of feed.items ?? []) {
      const guid = item.guid ?? item.link ?? item.title ?? '';
      if (!guid) continue;

      const exists = db
        .prepare(`SELECT 1 FROM contact_alert_mentions WHERE guid = ? AND contact_id = ?`)
        .get(guid, contactId);
      if (exists) continue;

      const headline = cleanHeadline(item.title ?? 'Untitled');
      const sourceUrl = resolveUrl(item.link ?? '');
      const publishedAt = item.pubDate
        ? Math.floor(new Date(item.pubDate).getTime() / 1000)
        : null;

      db.prepare(
        `INSERT INTO contact_alert_mentions (id, contact_id, headline, source_url, published_at, fetched_at, guid, seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      ).run(uuidv4(), contactId, headline, sourceUrl, publishedAt, now, guid);

      newCount++;
    }

    db.prepare(
      `UPDATE contact_alert_rss SET last_polled_at = ?, is_invalid = 0 WHERE id = ?`,
    ).run(now, feedId);

    return newCount;
  } catch (err) {
    // Network-level exception (DNS failure, timeout, connection refused, etc.) — transient;
    // log a warning but do NOT mark the feed invalid so it will be retried next poll.
    console.warn(`[rss] Network error polling feed ${feedId}:`, err);
    return 0;
  }
}

export function emitMentionsUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mentions:updated');
  }
}
