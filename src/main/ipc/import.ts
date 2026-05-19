import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3-multiple-ciphers';
import { getDatabase } from '../database';
import { normalizeEmail, normalizePhone, validateEmail, validateUrl } from '../sanitize';
import type { User, ImportResult } from '@shared/types';

const SAMPLE_HEADERS =
  'Name,Organization,Title,DOB,Notes,Email,Phone,LinkedIn,X,Website,Theme,Status,Priority\n';

export function parseCsv(text: string): string[][] {
  const result: string[][] = [];
  let i = 0;
  const n = text.length;

  function parseField(): string {
    if (text[i] === '"') {
      i++;
      let s = '';
      while (i < n) {
        if (text[i] === '"' && text[i + 1] === '"') {
          s += '"';
          i += 2;
        } else if (text[i] === '"') {
          i++;
          break;
        } else {
          s += text[i++];
        }
      }
      return s;
    }
    let s = '';
    while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') {
      s += text[i++];
    }
    return s;
  }

  while (i < n) {
    const row: string[] = [];
    while (true) {
      row.push(parseField());
      if (i < n && text[i] === ',') {
        i++;
      } else {
        break;
      }
    }
    // skip \r\n or \n
    if (i < n && text[i] === '\r') i++;
    if (i < n && text[i] === '\n') i++;
    // Skip blank lines
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) {
      result.push(row);
    }
  }

  return result;
}

export interface VcfContact {
  name: string;
  organization: string | null;
  title: string | null;
  dob: string | null;
  notes: string | null;
  emails: string[];
  phones: string[];
  urls: string[];
  handles: Array<{ type: string; handle: string }>;
}

function parseBday(value: string): string | null {
  const v = value.trim().split('T')[0]; // strip time component if present
  if (v.startsWith('--')) return null;  // year-unknown (--MMDD or --MM-DD)
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

function decodeVcfValue(v: string): string {
  return v.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

export function parseVcf(text: string): VcfContact[] {
  // Unfold continuation lines (RFC 6350 §3.2)
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const contacts: VcfContact[] = [];
  let cur: VcfContact | null = null;

  for (const raw of lines) {
    const upper = raw.trimEnd().toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      cur = { name: '', organization: null, title: null, dob: null, notes: null, emails: [], phones: [], urls: [], handles: [] };
      continue;
    }
    if (upper === 'END:VCARD') {
      if (cur?.name) contacts.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = raw.indexOf(':');
    if (colon < 0) continue;
    const propPart = raw.slice(0, colon).toUpperCase();
    const value = raw.slice(colon + 1);
    if (!value.trim()) continue;

    // Strip group prefix (e.g. "item1.EMAIL" → "EMAIL"), then strip params
    const prop = propPart.split(';')[0].replace(/^[^.]*\./, '');

    switch (prop) {
      case 'FN':
        cur.name = decodeVcfValue(value);
        break;
      case 'ORG':
        cur.organization = decodeVcfValue(value.split(';')[0]) || null;
        break;
      case 'TITLE':
        cur.title = decodeVcfValue(value) || null;
        break;
      case 'NOTE':
        cur.notes = decodeVcfValue(value).replace(/\\n/gi, '\n') || null;
        break;
      case 'BDAY':
        cur.dob = parseBday(decodeVcfValue(value));
        break;
      case 'EMAIL':
        { const e = decodeVcfValue(value); if (e) cur.emails.push(e); }
        break;
      case 'TEL':
        { const t = decodeVcfValue(value); if (t) cur.phones.push(t); }
        break;
      case 'URL':
        { const u = decodeVcfValue(value); if (u) cur.urls.push(u); }
        break;
      case 'IMPP': {
        const schemeColon = value.indexOf(':');
        if (schemeColon < 0) break;
        const scheme = value.slice(0, schemeColon).toLowerCase();
        let handle = '';
        try { handle = decodeURIComponent(value.slice(schemeColon + 1)).trim(); } catch { handle = value.slice(schemeColon + 1).trim(); }
        if (!handle) break;
        const typeMap: Record<string, string> = { signal: 'signal', whatsapp: 'whatsapp', telegram: 'telegram' };
        cur.handles.push({ type: typeMap[scheme] ?? 'other', handle });
        break;
      }
    }
  }

  return contacts;
}

export function processVcfContacts(
  vcfContacts: VcfContact[],
  db: Database.Database,
  options: ProcessImportOptions,
): ImportResult {
  const { projectId, phoneCountry, reporterEmail, reporterName } = options;

  const existingNames = new Set(
    (db.prepare('SELECT LOWER(name) AS n FROM contacts').all() as { n: string }[]).map((r) => r.n),
  );
  const existingEmails = new Set(
    (db.prepare('SELECT LOWER(email) AS e FROM contact_emails').all() as { e: string }[]).map((r) => r.e),
  );

  const stmtContact = db.prepare(
    'INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const stmtEmail = db.prepare(
    'INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const stmtPhone = db.prepare(
    'INSERT INTO contact_phones (id, contact_id, phone, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const stmtLink = db.prepare(
    'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const stmtHandle = db.prepare(
    'INSERT OR IGNORE INTO contact_handles (id, contact_id, type, handle, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const stmtMembership = db.prepare(
    `INSERT INTO project_memberships
       (id, contact_id, project_id, reporter_email, reporter_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const skipped: ImportResult['skipped'] = [];
  let imported = 0;

  db.transaction(() => {
    for (const c of vcfContacts) {
      if (!c.name) continue;

      const emails = [
        ...new Set(
          c.emails.map((e) => normalizeEmail(e)).filter((e): e is string => !!e && validateEmail(e)),
        ),
      ];

      const phones = [
        ...new Set(
          c.phones.map((p) => normalizePhone(p, phoneCountry)).filter((p): p is string => p !== null),
        ),
      ];

      const urls = [...new Set(c.urls)].filter(validateUrl);

      if (existingNames.has(c.name.toLowerCase())) {
        skipped.push({ name: c.name, reason: 'name' });
        continue;
      }
      if (emails.some((e) => existingEmails.has(e.toLowerCase()))) {
        skipped.push({ name: c.name, reason: 'email' });
        continue;
      }

      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);

      stmtContact.run(id, c.name, c.organization, c.title, c.dob, c.notes, now, now);

      emails.forEach((email, i) => {
        stmtEmail.run(uuidv4(), id, email, i, now);
        existingEmails.add(email.toLowerCase());
      });

      phones.forEach((phone, i) => {
        stmtPhone.run(uuidv4(), id, phone, i, now);
      });

      urls.forEach((url, i) => {
        stmtLink.run(uuidv4(), id, 'website', null, url, i, now);
      });

      c.handles.forEach((h, i) => {
        stmtHandle.run(uuidv4(), id, h.type, h.handle, i, now);
      });

      if (projectId) {
        stmtMembership.run(uuidv4(), id, projectId, reporterEmail, reporterName, now, now);
      }

      existingNames.add(c.name.toLowerCase());
      imported++;
    }
  })();

  return { imported, skipped, cancelled: false };
}

export interface ProcessImportOptions {
  projectId?: string;
  phoneCountry: string;
  reporterEmail: string;
  reporterName: string;
}

export function processImportRows(
  rows: string[][],
  db: Database.Database,
  options: ProcessImportOptions,
): ImportResult {
  if (rows.length < 2) return { imported: 0, skipped: [], cancelled: false };

  const { projectId, phoneCountry, reporterEmail, reporterName } = options;
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => headers.indexOf(name);

  // Collision sets — loaded once, updated as we import to catch intra-file dupes
  const existingNames = new Set(
    (db.prepare('SELECT LOWER(name) AS n FROM contacts').all() as { n: string }[]).map((r) => r.n),
  );
  const existingEmails = new Set(
    (db.prepare('SELECT LOWER(email) AS e FROM contact_emails').all() as { e: string }[]).map(
      (r) => r.e,
    ),
  );

  const validStatuses = new Set(
    (db.prepare('SELECT label FROM status_options').all() as { label: string }[]).map(
      (r) => r.label,
    ),
  );
  const validPriorities = new Set(
    (db.prepare('SELECT label FROM priority_options').all() as { label: string }[]).map(
      (r) => r.label,
    ),
  );

  const skipped: ImportResult['skipped'] = [];
  let imported = 0;

  const stmtContact = db.prepare(
    'INSERT INTO contacts (id, name, organization, title, dob, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const stmtEmail = db.prepare(
    'INSERT INTO contact_emails (id, contact_id, email, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const stmtPhone = db.prepare(
    'INSERT INTO contact_phones (id, contact_id, phone, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const stmtLink = db.prepare(
    'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const stmtMembership = db.prepare(
    `INSERT INTO project_memberships
       (id, contact_id, project_id, reporter_email, reporter_name, theme, status, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction(() => {
    for (const row of rows.slice(1)) {
      const get = (name: string) => (col(name) >= 0 ? (row[col(name)] ?? '').trim() : '');

      const name = get('name');
      if (!name) continue;

      const emails = get('email')
        .split(';')
        .map((e) => normalizeEmail(e.trim()))
        .filter((e): e is string => !!e && validateEmail(e));

      const phones = get('phone')
        .split(';')
        .map((p) => normalizePhone(p.trim(), phoneCountry))
        .filter((p): p is string => p !== null);

      // Collision check: name or any email
      if (existingNames.has(name.toLowerCase())) {
        skipped.push({ name, reason: 'name' });
        continue;
      }
      if (emails.some((e) => existingEmails.has(e.toLowerCase()))) {
        skipped.push({ name, reason: 'email' });
        continue;
      }

      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);

      const dobRaw = get('dob').trim();
      const dob = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? dobRaw : null;
      stmtContact.run(id, name, get('organization') || null, get('title') || null, dob, get('notes') || null, now, now);

      emails.forEach((email, i) => {
        stmtEmail.run(uuidv4(), id, email, i, now);
        existingEmails.add(email.toLowerCase());
      });

      phones.forEach((phone, i) => {
        stmtPhone.run(uuidv4(), id, phone, i, now);
      });

      const links: { type: string; url: string }[] = [];
      const linkedin = get('linkedin');
      const x = get('x');
      if (linkedin && validateUrl(linkedin)) links.push({ type: 'linkedin', url: linkedin });
      if (x && validateUrl(x)) links.push({ type: 'x', url: x });
      get('website').split(';').map((s) => s.trim()).filter(Boolean).filter(validateUrl).forEach((url) => {
        links.push({ type: 'website', url });
      });
      links.forEach((link, i) => {
        stmtLink.run(uuidv4(), id, link.type, null, link.url, i, now);
      });

      if (projectId) {
        const rawStatus = get('status');
        const rawPriority = get('priority');
        stmtMembership.run(
          uuidv4(),
          id,
          projectId,
          reporterEmail,
          reporterName,
          get('theme') || null,
          validStatuses.has(rawStatus) ? rawStatus : null,
          validPriorities.has(rawPriority) ? rawPriority : null,
          now,
          now,
        );
      }

      existingNames.add(name.toLowerCase());
      imported++;
    }
  });

  run();
  return { imported, skipped, cancelled: false };
}

export function registerImportHandlers(): void {
  ipcMain.handle(
    'import:csv',
    async (_event, { projectId }: { projectId?: string }): Promise<ImportResult> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import contacts from CSV',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        properties: ['openFile'],
      });
      if (canceled || filePaths.length === 0) return { imported: 0, skipped: [], cancelled: true };

      const content = await fs.readFile(filePaths[0], 'utf-8');
      const rows = parseCsv(content);
      const db = getDatabase();

      const { phone_country } = db
        .prepare('SELECT phone_country FROM users WHERE id = 1')
        .get() as { phone_country: string };
      const user = db
        .prepare('SELECT first_name, last_name, email FROM users WHERE id = 1')
        .get() as User;

      let reporterEmail = user.email;
      let reporterName = `${user.first_name} ${user.last_name}`.trim();
      if (projectId) {
        const self = db
          .prepare(
            'SELECT name, email FROM project_reporters WHERE project_id = ? AND is_self = 1',
          )
          .get(projectId) as { name: string; email: string } | undefined;
        if (self) {
          reporterEmail = self.email;
          reporterName = self.name;
        }
      }

      return processImportRows(rows, db, { projectId, phoneCountry: phone_country, reporterEmail, reporterName });
    },
  );

  ipcMain.handle(
    'import:vcf',
    async (_event, { projectId }: { projectId?: string }): Promise<ImportResult> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import contacts from vCard',
        filters: [{ name: 'vCard Files', extensions: ['vcf', 'vcard'] }],
        properties: ['openFile'],
      });
      if (canceled || filePaths.length === 0) return { imported: 0, skipped: [], cancelled: true };

      const content = await fs.readFile(filePaths[0], 'utf-8');
      const vcfContacts = parseVcf(content);
      const db = getDatabase();

      const { phone_country } = db
        .prepare('SELECT phone_country FROM users WHERE id = 1')
        .get() as { phone_country: string };
      const user = db
        .prepare('SELECT first_name, last_name, email FROM users WHERE id = 1')
        .get() as User;

      let reporterEmail = user.email;
      let reporterName = `${user.first_name} ${user.last_name}`.trim();
      if (projectId) {
        const self = db
          .prepare('SELECT name, email FROM project_reporters WHERE project_id = ? AND is_self = 1')
          .get(projectId) as { name: string; email: string } | undefined;
        if (self) {
          reporterEmail = self.email;
          reporterName = self.name;
        }
      }

      return processVcfContacts(vcfContacts, db, { projectId, phoneCountry: phone_country, reporterEmail, reporterName });
    },
  );

  ipcMain.handle('import:download-sample-csv', async (): Promise<void> => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save sample CSV template',
      defaultPath: 'sourcerer-contacts-template.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return;
    await fs.writeFile(filePath, SAMPLE_HEADERS, 'utf-8');
  });
}
