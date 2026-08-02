import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3-multiple-ciphers';
import { getDatabase } from '../database';
import { normalizeEmail, normalizePhone, validateEmail, validateUrl } from '../sanitize';
import type { User, ImportResult, ContactHandleType } from '@shared/types';

const SAMPLE_HEADERS =
  'Name,Organization,Title,DOB,Notes,Email,Phone,LinkedIn,X,Website,Theme,Status,Priority\n';

export function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM so Excel-exported files parse correctly
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

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
          // Consume any junk after the closing quote (non-RFC-4180 suffix like "Smith, Jr."suffix)
          while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') i++;
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

const REMAPPED_HEADERS = ['Name', 'Organization', 'Title', 'DOB', 'Notes', 'Email', 'Phone', 'LinkedIn', 'X', 'Website'];

// Google/Outlook birthdays show up as ISO dates, Google's "year unknown" form
// (--MM-DD), or Outlook's locale date (M/D/YYYY). Anything else is discarded,
// same as a malformed DOB in a native Sourcerer CSV.
function normalizeBirthday(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

// Google/Outlook exports lump social profile URLs in with generic "website"
// fields. Route LinkedIn/X URLs to their own columns so they land in the
// contact_links rows processImportRows already knows how to type correctly.
function splitSocialLinks(urls: string[]): { linkedin: string; x: string; websites: string[] } {
  let linkedin = '';
  let x = '';
  const websites: string[] = [];
  for (const url of urls) {
    const lower = url.toLowerCase();
    if (!linkedin && lower.includes('linkedin.com')) linkedin = url;
    else if (!x && (lower.includes('twitter.com') || lower.includes('x.com'))) x = url;
    else websites.push(url);
  }
  return { linkedin, x, websites };
}

function colsMatching(headerRow: string[], pattern: RegExp): number[] {
  const idxs: number[] = [];
  headerRow.forEach((h, i) => { if (pattern.test(h.trim().toLowerCase())) idxs.push(i); });
  return idxs;
}

// Returns the index of the first header name (lowercase) found among candidates.
function firstIdx(header: string[], names: string[]): number {
  for (const name of names) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

type CsvSource = 'gmail' | 'outlook' | 'generic';

function detectCsvSource(headerRow: string[]): CsvSource {
  const set = new Set(headerRow.map((h) => h.trim().toLowerCase()));
  if (set.has('e-mail 1 - value')) return 'gmail';
  if (set.has('e-mail address') && set.has('first name') && set.has('last name')) return 'outlook';
  return 'generic';
}

export interface CsvRemapResult {
  rows: string[][];
  droppedFields: string[];
}

// Source columns that carried no data anywhere in the file don't need
// flagging — only report columns Sourcerer actually had to throw away.
// "- Type"/"- Label" companion columns (e.g. "Phone 1 - Type": "Mobile") are
// excluded too: they're just a qualifier on data that *was* imported, not a
// distinct chunk of information worth calling out on its own.
function unusedColumnsWithData(headerRow: string[], dataRows: string[][], consumedIdxs: number[]): string[] {
  const consumed = new Set(consumedIdxs);
  return headerRow
    .map((h, i) => ({ h, i }))
    .filter(({ i }) => !consumed.has(i))
    .filter(({ h }) => !/ - (type|label)$/i.test(h.trim()))
    .filter(({ i }) => dataRows.some((row) => (row[i] ?? '').trim() !== ''))
    .map(({ h }) => h.trim());
}

function remapGmailRows(rows: string[][]): CsvRemapResult {
  const headerRow = rows[0];
  const header = headerRow.map((h) => h.trim().toLowerCase());
  const emailIdxs = colsMatching(headerRow, /^e-mail \d+ - value$/);
  const phoneIdxs = colsMatching(headerRow, /^phone \d+ - value$/);
  const websiteIdxs = colsMatching(headerRow, /^website \d+ - value$/);

  // Google's current contacts CSV (both its own import template and export)
  // uses "First Name"/"Last Name" and unprefixed "Organization Name"/"Title";
  // an older export variant used "Given Name"/"Family Name" and
  // "Organization 1 - Name"/"Title". Support both.
  const nameIdx = firstIdx(header, ['name']);
  const givenIdx = firstIdx(header, ['given name', 'first name']);
  const familyIdx = firstIdx(header, ['family name', 'last name']);
  const orgIdx = firstIdx(header, ['organization name', 'organization 1 - name']);
  const titleIdx = firstIdx(header, ['organization title', 'organization 1 - title']);
  const notesIdx = firstIdx(header, ['notes']);
  const bdayIdx = firstIdx(header, ['birthday']);

  const out: string[][] = [REMAPPED_HEADERS];
  for (const row of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
    const name = get(nameIdx) || [get(givenIdx), get(familyIdx)].filter(Boolean).join(' ').trim();
    const emails = emailIdxs.map(get).filter(Boolean);
    const phones = phoneIdxs.map(get).filter(Boolean);
    const { linkedin, x, websites } = splitSocialLinks(websiteIdxs.map(get).filter(Boolean));

    out.push([
      name, get(orgIdx), get(titleIdx), normalizeBirthday(get(bdayIdx)), get(notesIdx),
      emails.join(';'), phones.join(';'), linkedin, x, websites.join(';'),
    ]);
  }

  const consumedIdxs = [nameIdx, givenIdx, familyIdx, orgIdx, titleIdx, notesIdx, bdayIdx, ...emailIdxs, ...phoneIdxs, ...websiteIdxs];
  const droppedFields = unusedColumnsWithData(headerRow, rows.slice(1), consumedIdxs);
  return { rows: out, droppedFields };
}

function remapOutlookRows(rows: string[][]): CsvRemapResult {
  const headerRow = rows[0];
  const header = headerRow.map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const firstNameIdx = idx('first name');
  const lastIdx = idx('last name');
  const companyIdx = idx('company');
  const jobTitleIdx = idx('job title');
  const notesIdx = idx('notes');
  const bdayIdx = idx('birthday');
  const webIdxs = [idx('web page'), idx('personal web page')].filter((i) => i >= 0);
  const emailIdxs = ['e-mail address', 'e-mail 2 address', 'e-mail 3 address'].map(idx).filter((i) => i >= 0);
  const phoneIdxs = ['business phone', 'business phone 2', 'home phone', 'home phone 2', 'mobile phone', 'other phone']
    .map(idx)
    .filter((i) => i >= 0);

  const out: string[][] = [REMAPPED_HEADERS];
  for (const row of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
    const name = [get(firstNameIdx), get(lastIdx)].filter(Boolean).join(' ').trim();
    const emails = emailIdxs.map(get).filter(Boolean);
    const phones = phoneIdxs.map(get).filter(Boolean);
    const { linkedin, x, websites } = splitSocialLinks(webIdxs.map(get).filter(Boolean));

    out.push([
      name, get(companyIdx), get(jobTitleIdx), normalizeBirthday(get(bdayIdx)), get(notesIdx),
      emails.join(';'), phones.join(';'), linkedin, x, websites.join(';'),
    ]);
  }

  const consumedIdxs = [firstNameIdx, lastIdx, companyIdx, jobTitleIdx, notesIdx, bdayIdx, ...webIdxs, ...emailIdxs, ...phoneIdxs];
  const droppedFields = unusedColumnsWithData(headerRow, rows.slice(1), consumedIdxs);
  return { rows: out, droppedFields };
}

// Detects Gmail's and Outlook's contact-export CSV header shapes and remaps
// them onto Sourcerer's own column vocabulary so processImportRows doesn't
// need to know about either format. Anything else passes through unchanged.
// droppedFields lists source columns that carried data but have no home in
// Sourcerer's contact model (addresses, spouse, custom fields, etc.).
export function remapKnownCsvFormat(rows: string[][]): CsvRemapResult {
  if (rows.length === 0) return { rows, droppedFields: [] };
  const source = detectCsvSource(rows[0]);
  if (source === 'gmail') return remapGmailRows(rows);
  if (source === 'outlook') return remapOutlookRows(rows);
  return { rows, droppedFields: [] };
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
  handles: Array<{ type: ContactHandleType; handle: string }>;
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
      if (cur) contacts.push(cur);
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
      case 'N':
        // Synthesise display name from structured N field only if FN was absent
        if (!cur.name) {
          const [last, first, middle] = value.split(/(?<!\\);/).map(decodeVcfValue);
          const synthesised = [first, middle, last].filter(Boolean).join(' ').trim();
          if (synthesised) cur.name = synthesised;
        }
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
        let handle: string;
        try { handle = decodeURIComponent(value.slice(schemeColon + 1)).trim(); } catch { handle = value.slice(schemeColon + 1).trim(); }
        if (!handle) break;
        const typeMap: Record<string, ContactHandleType> = { signal: 'signal', whatsapp: 'whatsapp', telegram: 'telegram' };
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
      if (!c.name) { skipped.push({ name: '(unnamed contact)', reason: 'missing-name' }); continue; }

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

      const stat = await fs.stat(filePaths[0]);
      if (stat.size > 50 * 1024 * 1024) return { imported: 0, skipped: [], cancelled: false, error: 'File too large (max 50 MB).' };

      const content = await fs.readFile(filePaths[0], 'utf-8');
      const { rows, droppedFields } = remapKnownCsvFormat(parseCsv(content));
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

      const result = processImportRows(rows, db, { projectId, phoneCountry: phone_country, reporterEmail, reporterName });
      return droppedFields.length ? { ...result, droppedFields } : result;
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

      const stat = await fs.stat(filePaths[0]);
      if (stat.size > 50 * 1024 * 1024) return { imported: 0, skipped: [], cancelled: false, error: 'File too large (max 50 MB).' };

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
