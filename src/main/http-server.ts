import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomBytes } from 'crypto';
import { BrowserWindow } from 'electron';
import { isDatabaseOpen, getDatabase } from './database';

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

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Sourcerer-Token, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${HOST}`);

  if (req.method === 'GET' && url.pathname === '/status') {
    json(res, 200, { running: true, locked: !isDatabaseOpen(), version: '1.0.0' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/request-access') {
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
    if (!user || tokenParam !== user.calendar_token) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' });
    res.end(generateIcal(db));
    return;
  }

  // All remaining routes require session token + unlocked state
  const incomingToken = req.headers['x-sourcerer-token'];
  if (!sessionToken || incomingToken !== sessionToken) {
    json(res, 401, { error: 'unauthorized' });
    return;
  }
  if (!isDatabaseOpen()) {
    json(res, 403, { error: 'locked' });
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

  res.writeHead(404);
  res.end('Not Found');
}

function generateIcal(db: ReturnType<typeof getDatabase>): string {
  const reminders = db
    .prepare(
      `SELECT r.id, r.due_date, r.note, c.name AS contact_name, p.name AS project_name
       FROM reminders r
       JOIN contacts c ON c.id = r.contact_id
       JOIN projects p ON p.id = r.project_id
       ORDER BY r.due_date ASC`,
    )
    .all() as Array<{ id: string; due_date: number; note: string | null; contact_name: string; project_name: string }>;

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
    const summary = `Follow up: ${r.contact_name} — ${r.project_name}`;
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
