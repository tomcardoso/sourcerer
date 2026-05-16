import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { app, BrowserWindow } from 'electron';
import { isDatabaseOpen, getDatabase } from './database';
import { normalizeEmail, normalizePhone } from './sanitize';

const MAX_SCREENSHOT_BYTES = 50 * 1024 * 1024;
const MAX_PENDING_SCREENSHOTS = 20;
const pendingScreenshots = new Map<string, { buf: Buffer; tabUrl: string | null }>();

export function consumePendingScreenshot(tempId: string): { buf: Buffer; tabUrl: string | null } | null {
  const entry = pendingScreenshots.get(tempId) ?? null;
  pendingScreenshots.delete(tempId);
  return entry;
}

const PORT = 27371;
const HOST = '127.0.0.1';

type AccessState = 'idle' | 'pending' | 'approved' | 'denied';

let accessState: AccessState = 'idle';
let sessionToken: string | null = null;

export function approveExtensionAccess(): void {
  sessionToken = randomBytes(32).toString('base64');
  accessState = 'approved';
}

export function denyExtensionAccess(): void {
  accessState = 'idle';
  sessionToken = null;
}

export function clearExtensionSession(): void {
  sessionToken = null;
  accessState = 'idle';
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function isExtensionOrigin(origin: string | undefined, referer: string | undefined): boolean {
  const check = (s: string | undefined) =>
    !!s && (s.startsWith('chrome-extension://') || s.startsWith('moz-extension://'));
  return check(origin) || check(referer);
}

function setCorsForExtension(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  if (isExtensionOrigin(origin, referer)) {
    const allowOrigin = origin ?? referer!.split('/').slice(0, 3).join('/');
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Headers', 'X-Sourcerer-Token, Content-Type, X-Tab-Url');
    res.setHeader('Vary', 'Origin');
  }
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${HOST}`);

  if (req.method === 'OPTIONS') {
    // Only answer preflight for extension origins
    if (isExtensionOrigin(req.headers['origin'], req.headers['referer'])) {
      setCorsForExtension(req, res);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    json(res, 200, { running: true, locked: !isDatabaseOpen(), version: '1.0.0' });
    return;
  }

  // /focus is intentionally unauthenticated — it only raises the app window
  // and does not expose or mutate any user data.
  if (req.method === 'POST' && url.pathname === '/focus') {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { win.show(); win.focus(); }
    app.focus({ steal: true });
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/request-access') {
    setCorsForExtension(req, res);
    if (accessState !== 'pending') {
      accessState = 'pending';
      sessionToken = null;
      const win = BrowserWindow.getAllWindows()[0];
      if (win) win.webContents.send('extension:access-request');
    }
    res.writeHead(202);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/access-status') {
    setCorsForExtension(req, res);
    if (accessState === 'approved' && sessionToken) {
      json(res, 200, { status: 'approved', token: sessionToken });
    } else if (accessState === 'denied') {
      json(res, 200, { status: 'denied' });
    } else {
      json(res, 200, { status: 'pending' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/calendar/reminders.ics') {
    const tokenParam = url.searchParams.get('token');
    if (!tokenParam) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }
    if (!isDatabaseOpen()) {
      res.writeHead(403);
      res.end('Locked');
      return;
    }
    const db = getDatabase();
    const user = db
      .prepare('SELECT calendar_token FROM users WHERE id = 1')
      .get() as { calendar_token: string } | undefined;
    const tokenBuf = Buffer.from(tokenParam);
    const storedBuf = Buffer.from(user?.calendar_token ?? '');
    if (!user || tokenBuf.length !== storedBuf.length || !timingSafeEqual(tokenBuf, storedBuf)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' });
    res.end(generateIcal(db));
    return;
  }

  // All remaining routes require session token + unlocked state
  setCorsForExtension(req, res);
  const incomingToken = req.headers['x-sourcerer-token'];
  if (!sessionToken || incomingToken !== sessionToken) {
    json(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!isDatabaseOpen()) {
    json(res, 403, { error: 'locked' });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/screenshot-status/')) {
    const tempId = url.pathname.slice('/screenshot-status/'.length);
    json(res, 200, { status: pendingScreenshots.has(tempId) ? 'pending' : 'assigned' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/screenshot') {
    const tabUrl = req.headers['x-tab-url'] as string | undefined ?? null;
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_SCREENSHOT_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_SCREENSHOT_BYTES) {
        json(res, 413, { error: 'too_large' });
        return;
      }
      if (pendingScreenshots.size >= MAX_PENDING_SCREENSHOTS) {
        json(res, 429, { error: 'too_many_pending' });
        return;
      }
      const buf = Buffer.concat(chunks);
      const tempId = randomBytes(16).toString('hex');
      pendingScreenshots.set(tempId, { buf, tabUrl });
      setTimeout(() => pendingScreenshots.delete(tempId), 300_000);
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.show();
        win.focus();
        win.webContents.send('extension:screenshot-received', tempId);
      }
      json(res, 200, { tempId });
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/contacts') {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT c.id, c.name, c.organization, pm.project_id, p.name AS project_name
         FROM contacts c
         LEFT JOIN project_memberships pm ON pm.contact_id = c.id
         LEFT JOIN projects p ON p.id = pm.project_id
         ORDER BY c.name COLLATE NOCASE ASC`,
      )
      .all() as Array<{
      id: string;
      name: string;
      organization: string | null;
      project_id: string | null;
      project_name: string | null;
    }>;

    const map = new Map<
      string,
      { id: string; name: string; organization: string | null; projects: Array<{ id: string; name: string }> }
    >();
    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, { id: row.id, name: row.name, organization: row.organization, projects: [] });
      }
      if (row.project_id) {
        map.get(row.id)!.projects.push({ id: row.project_id, name: row.project_name! });
      }
    }

    json(res, 200, { contacts: [...map.values()] });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/contacts') {
    let raw = '';
    req.on('data', (chunk: Buffer) => { raw += chunk.toString('utf-8'); });
    req.on('end', () => {
      try {
        const { name, organization, email, phone } = JSON.parse(raw);
        if (!name || typeof name !== 'string' || !name.trim()) {
          json(res, 400, { error: 'name_required' });
          return;
        }
        const db = getDatabase();
        const { phone_country: phoneCountry = 'US' } = db
          .prepare('SELECT phone_country FROM users WHERE id = 1')
          .get() as { phone_country: string };
        const contactId = randomUUID();
        const now = Math.floor(Date.now() / 1000);
        db.prepare(
          'INSERT INTO contacts (id, name, organization, notes, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)'
        ).run(contactId, name.trim(), (organization as string | undefined)?.trim() || null, now, now);
        if ((email as string | undefined)?.trim()) {
          db.prepare(
            'INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, 0, ?)'
          ).run(randomUUID(), contactId, normalizeEmail((email as string).trim()), now);
        }
        if ((phone as string | undefined)?.trim()) {
          const rawPhone = (phone as string).trim();
          db.prepare(
            'INSERT INTO contact_phones (id, contact_id, phone, sort_order, created_at) VALUES (?, ?, ?, 0, ?)'
          ).run(randomUUID(), contactId, normalizePhone(rawPhone, phoneCountry) ?? rawPhone, now);
        }
        json(res, 200, { id: contactId, name: name.trim() });
      } catch (err) {
        json(res, 400, { error: String(err) });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/contact-field') {
    let raw = '';
    req.on('data', (chunk: Buffer) => { raw += chunk.toString('utf-8'); });
    req.on('end', () => {
      try {
        const { contactId, fieldType, value } = JSON.parse(raw) as { contactId: string; fieldType: string; value: string };
        if (!contactId || !fieldType || !value?.trim()) {
          json(res, 400, { error: 'missing_fields' });
          return;
        }
        const db = getDatabase();
        const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(contactId) as { id: string } | undefined;
        if (!contact) { json(res, 404, { error: 'contact_not_found' }); return; }
        const { phone_country: phoneCountry = 'US' } = db
          .prepare('SELECT phone_country FROM users WHERE id = 1')
          .get() as { phone_country: string };
        const now = Math.floor(Date.now() / 1000);
        if (fieldType === 'email') {
          const row = db.prepare('SELECT MAX(sort_order) AS m FROM contact_emails WHERE contact_id = ?').get(contactId) as { m: number | null };
          db.prepare('INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), contactId, normalizeEmail(value.trim()), (row.m ?? -1) + 1, now);
        } else if (fieldType === 'phone') {
          const rawPhone = value.trim();
          const row = db.prepare('SELECT MAX(sort_order) AS m FROM contact_phones WHERE contact_id = ?').get(contactId) as { m: number | null };
          db.prepare('INSERT INTO contact_phones (id, contact_id, phone, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), contactId, normalizePhone(rawPhone, phoneCountry) ?? rawPhone, (row.m ?? -1) + 1, now);
        } else if (fieldType === 'note') {
          const existing = (db.prepare('SELECT notes FROM contacts WHERE id = ?').get(contactId) as { notes: string | null }).notes;
          const updated = existing ? `${existing}\n\n${value.trim()}` : value.trim();
          db.prepare('UPDATE contacts SET notes = ?, updated_at = ? WHERE id = ?').run(updated, now, contactId);
        } else {
          json(res, 400, { error: 'invalid_field_type' }); return;
        }
        db.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(now, contactId);
        json(res, 200, { success: true });
      } catch (err) {
        json(res, 400, { error: String(err) });
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
}

function generateIcal(db: ReturnType<typeof getDatabase>): string {
  const reminders = db
    .prepare(
      `SELECT r.id, r.due_date, r.note, r.is_auto_outreach,
              c.name AS contact_name, p.name AS project_name
       FROM reminders r
       JOIN contacts c ON c.id = r.contact_id
       JOIN projects p ON p.id = r.project_id
       WHERE p.is_archived = 0
       ORDER BY r.due_date ASC`,
    )
    .all() as Array<{ id: string; due_date: number; note: string | null; is_auto_outreach: number; contact_name: string; project_name: string }>;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sourcerer//Sourcerer//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Sourcerer Reminders',
  ];

  for (const r of reminders) {
    const dateStr = toIcalDate(r.due_date);
    const summary = r.is_auto_outreach
      ? `Outreach overdue: ${r.contact_name} — ${r.project_name}`
      : `Follow up: ${r.contact_name} — ${r.project_name}`;
    const event = [
      'BEGIN:VEVENT',
      `UID:${r.id}@sourcerer`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${dateStr}`,
      `SUMMARY:${icalEscape(summary)}`,
    ];
    if (r.note) event.push(`DESCRIPTION:${icalEscape(r.note)}`);
    event.push('END:VEVENT');
    lines.push(...event);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function toIcalDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function icalEscape(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function startHttpServer(): void {
  const server = createServer(handleRequest);
  server.listen(PORT, HOST);
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EADDRINUSE') console.error('HTTP server error:', err);
  });
}
