import { ipcMain, dialog, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { rename, unlink } from 'fs/promises';
import ExcelJS from 'exceljs';
import path from 'path';
import { getDatabase } from '../database';
import { filenameDateStamp, foldLine } from '../utils';

// rename() on Windows throws EEXIST when the destination already exists.
// This helper handles that by unlinking the destination and retrying once.
async function atomicRename(tmpPath: string, destPath: string): Promise<void> {
  try {
    await rename(tmpPath, destPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      await unlink(destPath);
      await rename(tmpPath, destPath);
    } else {
      throw err;
    }
  }
}

interface ExportRow {
  Name: string;
  Organization: string;
  Title: string;
  DOB: string;
  Emails: string;
  Phones: string;
  Handles: string;
  LinkedIn: string;
  Facebook: string;
  Instagram: string;
  X: string;
  Website: string;
  'Other links': string;
  Notes: string;
  Reporter: string;
  Theme: string;
  Priority: string;
  Status: string;
  'First outreach': string;
  'Interaction log': string;
}

interface AllContactsRow {
  Name: string;
  Organization: string;
  Title: string;
  DOB: string;
  Emails: string;
  Phones: string;
  Handles: string;
  LinkedIn: string;
  Facebook: string;
  Instagram: string;
  X: string;
  Website: string;
  'Other links': string;
  Notes: string;
  'Interaction log': string;
}

type ExportFormat = 'sourcerer' | 'gmail' | 'outlook';

// Fields common to every contact row, independent of export format. Link
// columns keep raw per-type URL arrays (rather than a pre-joined string) so
// the gmail/outlook builders can slot them into per-format URL columns.
interface NormalizedContactCore {
  name: string;
  organization: string;
  title: string;
  dob: string;
  notes: string;
  emails: string[];
  phones: string[];
  handles: string;
  linkedin: string[];
  facebook: string[];
  instagram: string[];
  x: string[];
  website: string[];
  other: string[];
}

// Gmail/Outlook only have one free-text "name" field split into given/family
// (or first/last) parts, unlike Sourcerer's single display name — split on
// the first space as a best effort.
function splitName(name: string): { first: string; last: string } {
  const spaceIdx = name.indexOf(' ');
  if (spaceIdx < 0) return { first: name, last: '' };
  return { first: name.slice(0, spaceIdx), last: name.slice(spaceIdx + 1) };
}

// Sourcerer's LinkedIn/Facebook/Instagram/X/Website/Other link types have no
// equivalent in Gmail/Outlook's schemas, which each expose only generic URL
// slots. Flatten every link into that slot list, prioritizing LinkedIn and X
// since those are the profiles reporters look up most.
function combinedWebsites(c: NormalizedContactCore): string[] {
  return [...c.linkedin, ...c.x, ...c.website, ...c.facebook, ...c.instagram, ...c.other];
}

// Google's contacts CSV supports an arbitrary number of "E-mail N - Value" /
// "Phone N - Value" / "Website N - Value" columns, so widen to however many
// slots the widest contact in this export actually needs, rather than a
// fixed cap that would silently drop data.
function buildGmailCsvRows(contacts: NormalizedContactCore[]): Record<string, string>[] {
  const emailCount = Math.max(1, ...contacts.map((c) => c.emails.length));
  const phoneCount = Math.max(1, ...contacts.map((c) => c.phones.length));
  const websiteCount = Math.max(1, ...contacts.map((c) => combinedWebsites(c).length));

  return contacts.map((c) => {
    const { first, last } = splitName(c.name);
    const websites = combinedWebsites(c);
    const row: Record<string, string> = { Name: c.name, 'Given Name': first, 'Family Name': last };
    for (let i = 0; i < emailCount; i++) row[`E-mail ${i + 1} - Value`] = c.emails[i] ?? '';
    for (let i = 0; i < phoneCount; i++) row[`Phone ${i + 1} - Value`] = c.phones[i] ?? '';
    row['Organization Name'] = c.organization;
    row['Organization Title'] = c.title;
    for (let i = 0; i < websiteCount; i++) row[`Website ${i + 1} - Value`] = websites[i] ?? '';
    row['Birthday'] = c.dob;
    row['Notes'] = c.notes;
    return row;
  });
}

// Unlike Gmail, Outlook's contact schema is a fixed set of named fields, not
// a numbered/expandable one — it has no way to represent a 4th email or a
// 7th phone number, so those columns are simply all the slots it has.
const OUTLOOK_PHONE_HEADERS = ['Business Phone', 'Business Phone 2', 'Home Phone', 'Home Phone 2', 'Mobile Phone', 'Other Phone'];
const OUTLOOK_EMAIL_HEADERS = ['E-mail Address', 'E-mail 2 Address', 'E-mail 3 Address'];
const OUTLOOK_WEB_HEADERS = ['Web Page', 'Personal Web Page'];

function buildOutlookCsvRows(contacts: NormalizedContactCore[]): Record<string, string>[] {
  return contacts.map((c) => {
    const { first, last } = splitName(c.name);
    const websites = combinedWebsites(c);
    const row: Record<string, string> = { 'First Name': first, 'Last Name': last };
    OUTLOOK_EMAIL_HEADERS.forEach((header, i) => { row[header] = c.emails[i] ?? ''; });
    OUTLOOK_PHONE_HEADERS.forEach((header, i) => { row[header] = c.phones[i] ?? ''; });
    row['Company'] = c.organization;
    row['Job Title'] = c.title;
    OUTLOOK_WEB_HEADERS.forEach((header, i) => { row[header] = websites[i] ?? ''; });
    row['Birthday'] = c.dob;
    row['Notes'] = c.notes;
    return row;
  });
}

// SQLite's SQLITE_LIMIT_VARIABLE_NUMBER defaults to 999. Chunk IN-clause lookups
// to stay safely below that limit; concatenates results across chunks.
const SQLITE_IN_CHUNK_SIZE = 500;

function chunkedIn<T>(ids: string[], runQuery: (chunk: string[]) => T[]): T[] {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += SQLITE_IN_CHUNK_SIZE) {
    results.push(...runQuery(ids.slice(i, i + SQLITE_IN_CHUNK_SIZE)));
  }
  return results;
}

function groupByContactId<Row extends { contact_id: string }, V>(rows: Row[], pick: (r: Row) => V): Map<string, V[]> {
  const map = new Map<string, V[]>();
  for (const r of rows) {
    const arr = map.get(r.contact_id) ?? [];
    arr.push(pick(r));
    map.set(r.contact_id, arr);
  }
  return map;
}

interface ContactSubTables {
  emails: Map<string, string[]>;
  phones: Map<string, string[]>;
  links: Map<string, { type: string; url: string }[]>;
  handles: Map<string, { type: string; handle: string }[]>;
}

function fetchContactSubTables(db: import('better-sqlite3-multiple-ciphers').Database, contactIds: string[]): ContactSubTables {
  const ph = (chunk: string[]) => chunk.map(() => '?').join(',');

  const emailRows = chunkedIn(contactIds, (chunk) =>
    db.prepare(`SELECT contact_id, email FROM contact_emails WHERE contact_id IN (${ph(chunk)}) ORDER BY sort_order`).all(...chunk) as { contact_id: string; email: string }[],
  );
  const phoneRows = chunkedIn(contactIds, (chunk) =>
    db.prepare(`SELECT contact_id, phone FROM contact_phones WHERE contact_id IN (${ph(chunk)}) ORDER BY sort_order`).all(...chunk) as { contact_id: string; phone: string }[],
  );
  const linkRows = chunkedIn(contactIds, (chunk) =>
    db.prepare(`SELECT contact_id, type, url FROM contact_links WHERE contact_id IN (${ph(chunk)}) ORDER BY sort_order`).all(...chunk) as { contact_id: string; type: string; url: string }[],
  );
  const handleRows = chunkedIn(contactIds, (chunk) =>
    db.prepare(`SELECT contact_id, type, handle FROM contact_handles WHERE contact_id IN (${ph(chunk)}) ORDER BY sort_order`).all(...chunk) as { contact_id: string; type: string; handle: string }[],
  );

  return {
    emails: groupByContactId(emailRows, (r) => r.email),
    phones: groupByContactId(phoneRows, (r) => r.phone),
    links: groupByContactId(linkRows, (r) => ({ type: r.type, url: r.url })),
    handles: groupByContactId(handleRows, (r) => ({ type: r.type, handle: r.handle })),
  };
}

// Writes rows to a temp file next to the target path, then atomically renames it
// into place. Shared by every "export contacts to a spreadsheet" handler.
async function writeExportRows<T extends object>(rows: T[], filePath: string, isXlsx: boolean): Promise<{ success: boolean; error?: string }> {
  const tmpPath = path.join(path.dirname(filePath), `.tmp-export-${randomUUID()}`);
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Contacts');
    if (rows.length > 0) {
      ws.columns = (Object.keys(rows[0]) as (keyof T)[]).map((k) => ({ header: String(k), key: String(k) }));
    }
    ws.addRows(rows);
    if (isXlsx) {
      await wb.xlsx.writeFile(tmpPath);
    } else {
      await wb.csv.writeFile(tmpPath);
    }
    await atomicRename(tmpPath, filePath);
    return { success: true };
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    return { success: false, error: String(err) };
  }
}

function fetchProjectsByInteraction(
  db: import('better-sqlite3-multiple-ciphers').Database,
  interactionIds: string[],
): Map<string, string[]> {
  if (!interactionIds.length) return new Map();
  const ph = interactionIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT ip.interaction_id, p.name AS project_name
     FROM interaction_projects ip
     JOIN project_memberships pm ON pm.id = ip.membership_id
     JOIN projects p ON p.id = pm.project_id
     WHERE ip.interaction_id IN (${ph})
     ORDER BY p.name ASC`,
  ).all(...interactionIds) as { interaction_id: string; project_name: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const a = map.get(r.interaction_id) ?? [];
    a.push(r.project_name);
    map.set(r.interaction_id, a);
  }
  return map;
}

function formatLogEntry(e: { id: string; created_at: number; reporter_name: string; body: string }, projectsByInteraction: Map<string, string[]>): string {
  const date = new Date(e.created_at * 1000).toLocaleDateString();
  const projects = projectsByInteraction.get(e.id) ?? [];
  const header = projects.length
    ? `${date} — ${e.reporter_name} — ${projects.join(', ')}`
    : `${date} — ${e.reporter_name}`;
  return `[${header}] ${e.body}`;
}

type ExportMode = 'full' | 'sanitized';

const LOG_BATCH_SIZE = 500;
const EXPORT_CHUNK_SIZE = 200;

export function registerExportHandlers(): void {
  ipcMain.handle(
    'export:project',
    async (
      event,
      { projectId, mode, contactIds: filterIds, format = 'sourcerer' }: { projectId: string; mode: ExportMode; contactIds?: string[]; format?: ExportFormat },
    ): Promise<{ success: boolean; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const db = getDatabase();

      const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as
        | { name: string }
        | undefined;
      if (!project) return { success: false, error: 'Project not found.' };

      const safeProjectName = project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      // Gmail/Outlook only import from CSV, not XLSX, so skip the format choice.
      const saveResult = format === 'sourcerer'
        ? await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
            title: 'Export project contacts',
            defaultPath: `${safeProjectName}-contacts-${filenameDateStamp()}`,
            filters: [
              { name: 'CSV', extensions: ['csv'] },
              { name: 'Excel', extensions: ['xlsx'] },
            ],
          })
        : await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
            title: `Export project contacts (${format === 'gmail' ? 'Gmail' : 'Outlook'} CSV)`,
            defaultPath: `${safeProjectName}-contacts-${format}-${filenameDateStamp()}.csv`,
            filters: [{ name: 'CSV', extensions: ['csv'] }],
          });
      if (saveResult.canceled || !saveResult.filePath) return { success: false };

      const filePath = saveResult.filePath;
      const isXlsx = filePath.endsWith('.xlsx');

      // filterIds can be arbitrarily large (e.g. "export all selected" over a big
      // table), so it isn't safe to fold into a SQL IN clause — filter in JS instead.
      const filterSet = filterIds?.length ? new Set(filterIds) : null;
      let memberships = db
        .prepare(
          `SELECT pm.id AS membership_id, pm.reporter_name, pm.theme, pm.priority, pm.status,
                  (SELECT MIN(ile.created_at) FROM interaction_log_entries ile
                   JOIN interaction_projects ip ON ip.interaction_id = ile.id
                   WHERE ip.membership_id = pm.id) AS first_log_at,
                  c.id AS contact_id, c.name, c.organization, c.title, c.dob, c.notes
           FROM project_memberships pm
           JOIN contacts c ON c.id = pm.contact_id
           WHERE pm.project_id = ?
           ORDER BY c.name COLLATE NOCASE ASC`,
        )
        .all(projectId) as {
        membership_id: string;
        reporter_name: string;
        theme: string | null;
        priority: string | null;
        status: string | null;
        first_log_at: number | null;
        contact_id: string;
        name: string;
        organization: string | null;
        title: string | null;
        dob: string | null;
        notes: string | null;
      }[];
      if (filterSet) memberships = memberships.filter((m) => filterSet.has(m.contact_id));

      const contactIds = memberships.map((m) => m.contact_id);
      const ph = (arr: unknown[]) => arr.map(() => '?').join(',');
      const { emails: emailsByContact, phones: phonesByContact, links: linksByContact, handles: handlesByContact } = fetchContactSubTables(db, contactIds);

      type LogRow = { id: string; membership_id: string; reporter_name: string; body: string; created_at: number };
      const normalizedRows: (NormalizedContactCore & {
        reporter: string; theme: string; priority: string; status: string; firstOutreach: string; interactionLog: string;
      })[] = [];

      for (let ci = 0; ci < memberships.length; ci += EXPORT_CHUNK_SIZE) {
        const chunk = memberships.slice(ci, ci + EXPORT_CHUNK_SIZE);
        const chunkMembershipIds = chunk.map((m) => m.membership_id);

        // Fetch and format logs only for this chunk; map is scoped here so
        // log strings become GC-eligible as soon as the chunk's rows are built.
        const logsByMembership = new Map<string, string[]>();
        if (mode === 'full' && chunkMembershipIds.length) {
          const iter = db.prepare(
            `SELECT ile.id, ip.membership_id, ile.reporter_name, ile.body, ile.created_at
             FROM interaction_log_entries ile
             JOIN interaction_projects ip ON ip.interaction_id = ile.id
             WHERE ip.membership_id IN (${ph(chunkMembershipIds)})
             ORDER BY ile.created_at ASC`,
          ).iterate(...chunkMembershipIds) as IterableIterator<LogRow>;
          let batch: LogRow[] = [];
          const flush = () => {
            if (!batch.length) return;
            const projMap = fetchProjectsByInteraction(db, batch.map((e) => e.id));
            for (const e of batch) {
              const arr = logsByMembership.get(e.membership_id) ?? [];
              arr.push(formatLogEntry(e, projMap));
              logsByMembership.set(e.membership_id, arr);
            }
            batch = [];
          };
          for (const row of iter) { batch.push(row); if (batch.length >= LOG_BATCH_SIZE) flush(); }
          flush();
        }

        for (const m of chunk) {
          const emails = emailsByContact.get(m.contact_id) ?? [];
          const phones = phonesByContact.get(m.contact_id) ?? [];
          const handles = (handlesByContact.get(m.contact_id) ?? []).map((h) => `${h.type}: ${h.handle}`).join('; ');
          const links = linksByContact.get(m.contact_id) ?? [];
          const byType = (type: string) => links.filter((l) => l.type === type).map((l) => l.url);
          const logStrings = logsByMembership.get(m.membership_id) ?? [];
          const interactionLog = mode === 'full' ? logStrings.join('\n') : '';
          logsByMembership.delete(m.membership_id);
          normalizedRows.push({
            name: m.name,
            organization: m.organization ?? '',
            title: m.title ?? '',
            dob: m.dob ?? '',
            emails,
            phones,
            handles,
            linkedin: byType('linkedin'),
            facebook: byType('facebook'),
            instagram: byType('instagram'),
            x: byType('x'),
            website: byType('website'),
            other: byType('other'),
            notes: mode === 'full' ? (m.notes ?? '') : '',
            reporter: m.reporter_name,
            theme: m.theme ?? '',
            priority: m.priority ?? '',
            status: m.status ?? '',
            firstOutreach: m.first_log_at
              ? new Date(m.first_log_at * 1000).toLocaleDateString()
              : '',
            interactionLog,
          });
        }
      }

      if (format === 'gmail') return writeExportRows(buildGmailCsvRows(normalizedRows), filePath, false);
      if (format === 'outlook') return writeExportRows(buildOutlookCsvRows(normalizedRows), filePath, false);

      const rows: ExportRow[] = normalizedRows.map((r) => ({
        Name: r.name,
        Organization: r.organization,
        Title: r.title,
        DOB: r.dob,
        Emails: r.emails.join('; '),
        Phones: r.phones.join('; '),
        Handles: r.handles,
        LinkedIn: r.linkedin.join('; '),
        Facebook: r.facebook.join('; '),
        Instagram: r.instagram.join('; '),
        X: r.x.join('; '),
        Website: r.website.join('; '),
        'Other links': r.other.join('; '),
        Notes: r.notes,
        Reporter: r.reporter,
        Theme: r.theme,
        Priority: r.priority,
        Status: r.status,
        'First outreach': r.firstOutreach,
        'Interaction log': r.interactionLog,
      }));

      return writeExportRows(rows, filePath, isXlsx);
    },
  );

  ipcMain.handle(
    'export:all-contacts',
    async (event, { contactIds: filterIds, format = 'sourcerer' }: { contactIds?: string[]; format?: ExportFormat } = {}): Promise<{ success: boolean; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const db = getDatabase();

      const baseName = filterIds?.length ? 'selected-contacts' : 'all-contacts';
      // Gmail/Outlook only import from CSV, not XLSX, so skip the format choice.
      const saveResult = format === 'sourcerer'
        ? await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
            title: 'Export contacts',
            defaultPath: `${baseName}-${filenameDateStamp()}`,
            filters: [
              { name: 'CSV', extensions: ['csv'] },
              { name: 'Excel', extensions: ['xlsx'] },
            ],
          })
        : await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
            title: `Export contacts (${format === 'gmail' ? 'Gmail' : 'Outlook'} CSV)`,
            defaultPath: `${baseName}-${format}-${filenameDateStamp()}.csv`,
            filters: [{ name: 'CSV', extensions: ['csv'] }],
          });
      if (saveResult.canceled || !saveResult.filePath) return { success: false };

      const filePath = saveResult.filePath;
      const isXlsx = filePath.endsWith('.xlsx');

      // filterIds can be arbitrarily large (e.g. "export all selected" over a big
      // table), so it isn't safe to fold into a SQL IN clause — filter in JS instead.
      const filterSet2 = filterIds?.length ? new Set(filterIds) : null;
      let contacts = db
        .prepare('SELECT id, name, organization, title, dob, notes FROM contacts ORDER BY name COLLATE NOCASE')
        .all() as { id: string; name: string; organization: string | null; title: string | null; dob: string | null; notes: string | null }[];
      if (filterSet2) contacts = contacts.filter((c) => filterSet2.has(c.id));

      const allContactIds = contacts.map((c) => c.id);
      const ph2 = (arr: unknown[]) => arr.map(() => '?').join(',');
      const { emails: emailsById, phones: phonesById, links: linksById, handles: handlesById } = fetchContactSubTables(db, allContactIds);

      type LogRow2 = { id: string; contact_id: string; reporter_name: string; body: string; created_at: number };
      const normalizedRows: (NormalizedContactCore & { interactionLog: string })[] = [];

      for (let ci2 = 0; ci2 < contacts.length; ci2 += EXPORT_CHUNK_SIZE) {
        const chunk2 = contacts.slice(ci2, ci2 + EXPORT_CHUNK_SIZE);
        const chunkContactIds = chunk2.map((c) => c.id);

        // Scoped per-chunk so log strings become GC-eligible after each chunk's rows are built.
        const logsByContactId = new Map<string, string[]>();
        if (chunkContactIds.length) {
          const iter2 = db.prepare(
            `SELECT id, contact_id, reporter_name, body, created_at
             FROM interaction_log_entries
             WHERE contact_id IN (${ph2(chunkContactIds)})
             ORDER BY created_at ASC`,
          ).iterate(...chunkContactIds) as IterableIterator<LogRow2>;
          let batch2: LogRow2[] = [];
          const flush2 = () => {
            if (!batch2.length) return;
            const projMap2 = fetchProjectsByInteraction(db, batch2.map((e) => e.id));
            for (const e of batch2) {
              const arr = logsByContactId.get(e.contact_id) ?? [];
              arr.push(formatLogEntry(e, projMap2));
              logsByContactId.set(e.contact_id, arr);
            }
            batch2 = [];
          };
          for (const row of iter2) { batch2.push(row); if (batch2.length >= LOG_BATCH_SIZE) flush2(); }
          flush2();
        }

        for (const c of chunk2) {
          const links = linksById.get(c.id) ?? [];
          const byType2 = (type: string) => links.filter((l) => l.type === type).map((l) => l.url);
          const interactionLog = (logsByContactId.get(c.id) ?? []).join('\n');
          logsByContactId.delete(c.id);
          normalizedRows.push({
            name: c.name,
            organization: c.organization ?? '',
            title: c.title ?? '',
            dob: c.dob ?? '',
            emails: emailsById.get(c.id) ?? [],
            phones: phonesById.get(c.id) ?? [],
            handles: (handlesById.get(c.id) ?? []).map((h) => `${h.type}: ${h.handle}`).join('; '),
            linkedin: byType2('linkedin'),
            facebook: byType2('facebook'),
            instagram: byType2('instagram'),
            x: byType2('x'),
            website: byType2('website'),
            other: byType2('other'),
            notes: c.notes ?? '',
            interactionLog,
          });
        }
      }

      if (format === 'gmail') return writeExportRows(buildGmailCsvRows(normalizedRows), filePath, false);
      if (format === 'outlook') return writeExportRows(buildOutlookCsvRows(normalizedRows), filePath, false);

      const rows: AllContactsRow[] = normalizedRows.map((r) => ({
        Name: r.name,
        Organization: r.organization,
        Title: r.title,
        DOB: r.dob,
        Emails: r.emails.join('; '),
        Phones: r.phones.join('; '),
        Handles: r.handles,
        LinkedIn: r.linkedin.join('; '),
        Facebook: r.facebook.join('; '),
        Instagram: r.instagram.join('; '),
        X: r.x.join('; '),
        Website: r.website.join('; '),
        'Other links': r.other.join('; '),
        Notes: r.notes,
        'Interaction log': r.interactionLog,
      }));

      return writeExportRows(rows, filePath, isXlsx);
    },
  );

  ipcMain.handle('export:vcard-contact', async (event, contactId: string): Promise<void> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const db = getDatabase();
    const card = buildVCard(db, contactId);
    if (!card) return;

    const contact = db.prepare('SELECT name FROM contacts WHERE id = ?').get(contactId) as { name: string } | undefined;
    const safeName = (contact?.name ?? 'contact').replace(/[^a-z0-9]/gi, '-').toLowerCase();

    const { canceled, filePath } = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Export contact as vCard',
      defaultPath: `${safeName}-${filenameDateStamp()}.vcf`,
      filters: [{ name: 'vCard', extensions: ['vcf'] }],
    });
    if (canceled || !filePath) return;
    await fs.writeFile(filePath, card, 'utf-8');
  });

  ipcMain.handle('export:vcard-project', async (event, { projectId, contactIds: filterIds }: { projectId: string; contactIds?: string[] }): Promise<void> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const db = getDatabase();
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as { name: string } | undefined;
    let contactIds = (
      db.prepare('SELECT contact_id FROM project_memberships WHERE project_id = ?').all(projectId) as { contact_id: string }[]
    ).map((r) => r.contact_id);
    if (filterIds?.length) contactIds = contactIds.filter((id) => filterIds.includes(id));

    const cards = contactIds.map((id) => buildVCard(db, id)).filter(Boolean).join('\r\n');
    if (!cards) return;

    const safeName = (project?.name ?? 'project').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Export project contacts as vCard',
      defaultPath: `${safeName}-contacts-${filenameDateStamp()}.vcf`,
      filters: [{ name: 'vCard', extensions: ['vcf'] }],
    });
    if (canceled || !filePath) return;
    await fs.writeFile(filePath, cards, 'utf-8');
  });

  ipcMain.handle('export:vcard-all-contacts', async (event, { contactIds: filterIds }: { contactIds?: string[] } = {}): Promise<void> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const db = getDatabase();
    // filterIds can be arbitrarily large, so it isn't safe to fold into a SQL IN clause.
    const filterSet = filterIds?.length ? new Set(filterIds) : null;
    let contactIds = (
      db.prepare('SELECT id FROM contacts ORDER BY name COLLATE NOCASE').all() as { id: string }[]
    ).map((r) => r.id);
    if (filterSet) contactIds = contactIds.filter((id) => filterSet.has(id));

    const cards = contactIds.map((id) => buildVCard(db, id)).filter(Boolean).join('\r\n');
    if (!cards) return;

    const defaultName = filterIds?.length ? `selected-contacts-${filenameDateStamp()}.vcf` : `all-contacts-${filenameDateStamp()}.vcf`;
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Export contacts as vCard',
      defaultPath: defaultName,
      filters: [{ name: 'vCard', extensions: ['vcf'] }],
    });
    if (canceled || !filePath) return;
    await fs.writeFile(filePath, cards, 'utf-8');
  });
}

function escapeVCard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function buildVCard(db: import('better-sqlite3-multiple-ciphers').Database, contactId: string): string | null {
  const contact = db
    .prepare('SELECT name, organization, title, dob FROM contacts WHERE id = ?')
    .get(contactId) as { name: string; organization: string | null; title: string | null; dob: string | null } | undefined;
  if (!contact) return null;

  const emails = (
    db.prepare('SELECT email, label FROM contact_emails WHERE contact_id = ? ORDER BY sort_order').all(contactId) as { email: string; label: string | null }[]
  );

  const phones = (
    db.prepare('SELECT phone FROM contact_phones WHERE contact_id = ? ORDER BY sort_order').all(contactId) as { phone: string }[]
  ).map((r) => r.phone);

  const links = (
    db.prepare('SELECT type, url FROM contact_links WHERE contact_id = ? ORDER BY sort_order').all(contactId) as { type: string; url: string }[]
  );

  const handles = (
    db.prepare('SELECT type, handle FROM contact_handles WHERE contact_id = ? ORDER BY sort_order').all(contactId) as { type: string; handle: string }[]
  );

  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`FN:${escapeVCard(contact.name)}`);
  lines.push(`N:${escapeVCard(contact.name)};;;;`);
  if (contact.organization) lines.push(`ORG:${escapeVCard(contact.organization)}`);
  if (contact.title) lines.push(`TITLE:${escapeVCard(contact.title)}`);
  if (contact.dob) lines.push(`BDAY:${contact.dob}`);
  emails.forEach((e) => {
    const sanitizedLabel = e.label ? e.label.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const typeParam = sanitizedLabel ? `;TYPE=${sanitizedLabel}` : ';TYPE=INTERNET';
    lines.push(`EMAIL${typeParam}:${e.email}`);
  });
  phones.forEach((p) => lines.push(`TEL:${p}`));
  links.forEach((l) => {
    const typeLabel = l.type.charAt(0).toUpperCase() + l.type.slice(1);
    lines.push(`URL;TYPE=${typeLabel}:${l.url}`);
  });
  handles.forEach((h) => {
    const serviceType = h.type === 'whatsapp' ? 'WhatsApp'
      : h.type.charAt(0).toUpperCase() + h.type.slice(1);
    const scheme = h.type === 'other' ? 'x-other' : h.type;
    lines.push(`IMPP;X-SERVICE-TYPE=${serviceType}:${scheme}:${encodeURIComponent(h.handle)}`);
  });
  lines.push('END:VCARD');

  return lines.map(foldLine).join('\r\n');
}
