import net from 'net';
import Parser from 'rss-parser';
import { BrowserWindow, Notification } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, isDatabaseOpen } from '../database';

const parser = new Parser();

/**
 * Returns true when the URL's hostname resolves to a private/loopback/link-local
 * address that should be blocked to prevent SSRF.  Uses net.isIP() to classify
 * addresses rather than regular expressions, which avoids bypass variants such as
 * `127.1`, `localhost.` (trailing dot), `0.0.0.0`, and long-form IPv6 loopback.
 *
 * For hostnames (non-IP strings): only `localhost` (exact, case-insensitive,
 * after stripping any trailing dots) is blocked — DNS resolution of other names
 * is left to the OS and is outside the scope of this guard.
 */
export function isBlockedHost(urlStr: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname;
  } catch {
    // Invalid URL — block it
    return true;
  }

  // Strip surrounding brackets from IPv6 literals (e.g. "[::1]" → "::1")
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  const ipVersion = net.isIP(hostname);

  if (ipVersion === 4) {
    const parts = hostname.split('.').map(Number);
    const [a, b] = parts;
    // 127.0.0.0/8  — loopback
    if (a === 127) return true;
    // 10.0.0.0/8   — RFC-1918 private
    if (a === 10) return true;
    // 172.16.0.0/12 — RFC-1918 private
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 — RFC-1918 private
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 — link-local
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8 — "this" network
    if (a === 0) return true;
    return false;
  }

  if (ipVersion === 6) {
    const lower = hostname.toLowerCase();
    // ::1  — loopback (also catches 0:0:0:0:0:0:0:1 after normalization)
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    // fc00::/7 — ULA (first byte 0xfc or 0xfd)
    const firstGroup = parseInt(lower.split(':')[0] || '0', 16);
    if ((firstGroup & 0xfe00) === 0xfc00) return true;
    // fe80::/10 — link-local
    if ((firstGroup & 0xffc0) === 0xfe80) return true;
    return false;
  }

  // Plain hostname — block `localhost` (strip trailing dots first)
  const stripped = hostname.replace(/\.+$/, '').toLowerCase();
  return stripped === 'localhost';
}

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
    if (isBlockedHost(rssUrl)) return 0;
  } catch {
    return 0;
  }

  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  try {
    // Fetch the feed URL manually first so we can inspect the HTTP status code
    // before handing it off to the parser.  A 10-second AbortController timeout
    // prevents a slow server from stalling the entire poll loop.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(rssUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
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
