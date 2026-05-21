import { ipcMain, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import ExcelJS from 'exceljs';
import { getDatabase } from '../database';
import { filenameDateStamp } from '../utils';

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


export function registerExportHandlers(): void {
  ipcMain.handle(
    'export:project',
    async (
      event,
      { projectId, mode, contactIds: filterIds }: { projectId: string; mode: ExportMode; contactIds?: string[] },
    ): Promise<{ success: boolean; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const db = getDatabase();

      const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as
        | { name: string }
        | undefined;
      if (!project) return { success: false, error: 'Project not found.' };

      const saveResult = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        title: 'Export project contacts',
        defaultPath: `${project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-contacts-${filenameDateStamp()}`,
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: 'Excel', extensions: ['xlsx'] },
        ],
      });
      if (saveResult.canceled || !saveResult.filePath) return { success: false };

      const filePath = saveResult.filePath;
      const isXlsx = filePath.endsWith('.xlsx');

      const selectionClause = filterIds?.length
        ? `AND c.id IN (${filterIds.map(() => '?').join(',')})`
        : '';
      const memberships = db
        .prepare(
          `SELECT pm.id AS membership_id, pm.reporter_name, pm.theme, pm.priority, pm.status,
                  (SELECT MIN(ile.created_at) FROM interaction_log_entries ile
                   JOIN interaction_projects ip ON ip.interaction_id = ile.id
                   WHERE ip.membership_id = pm.id) AS first_log_at,
                  c.id AS contact_id, c.name, c.organization, c.title, c.dob, c.notes
           FROM project_memberships pm
           JOIN contacts c ON c.id = pm.contact_id
           WHERE pm.project_id = ? ${selectionClause}
           ORDER BY c.name COLLATE NOCASE ASC`,
        )
        .all(projectId, ...(filterIds ?? [])) as {
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

      const contactIds = memberships.map((m) => m.contact_id);
      const membershipIds = memberships.map((m) => m.membership_id);
      const ph = (arr: unknown[]) => arr.map(() => '?').join(',');

      const bulkEmails = contactIds.length
        ? (db.prepare(`SELECT contact_id, email FROM contact_emails WHERE contact_id IN (${ph(contactIds)}) ORDER BY sort_order`).all(...contactIds) as { contact_id: string; email: string }[])
        : [];
      const emailsByContact = new Map<string, string[]>();
      for (const r of bulkEmails) { const a = emailsByContact.get(r.contact_id) ?? []; a.push(r.email); emailsByContact.set(r.contact_id, a); }

      const bulkPhones = contactIds.length
        ? (db.prepare(`SELECT contact_id, phone FROM contact_phones WHERE contact_id IN (${ph(contactIds)}) ORDER BY sort_order`).all(...contactIds) as { contact_id: string; phone: string }[])
        : [];
      const phonesByContact = new Map<string, string[]>();
      for (const r of bulkPhones) { const a = phonesByContact.get(r.contact_id) ?? []; a.push(r.phone); phonesByContact.set(r.contact_id, a); }

      const bulkLinks = contactIds.length
        ? (db.prepare(`SELECT contact_id, type, url FROM contact_links WHERE contact_id IN (${ph(contactIds)}) ORDER BY sort_order`).all(...contactIds) as { contact_id: string; type: string; url: string }[])
        : [];
      const linksByContact = new Map<string, { type: string; url: string }[]>();
      for (const r of bulkLinks) { const a = linksByContact.get(r.contact_id) ?? []; a.push({ type: r.type, url: r.url }); linksByContact.set(r.contact_id, a); }

      const bulkHandles = contactIds.length
        ? (db.prepare(`SELECT contact_id, type, handle FROM contact_handles WHERE contact_id IN (${ph(contactIds)}) ORDER BY sort_order`).all(...contactIds) as { contact_id: string; type: string; handle: string }[])
        : [];
      const handlesByContact = new Map<string, { type: string; handle: string }[]>();
      for (const r of bulkHandles) { const a = handlesByContact.get(r.contact_id) ?? []; a.push({ type: r.type, handle: r.handle }); handlesByContact.set(r.contact_id, a); }

      const bulkLogs: { id: string; membership_id: string; reporter_name: string; body: string; created_at: number }[] =
        mode === 'full' && membershipIds.length
          ? (db.prepare(`SELECT ile.id, ip.membership_id, ile.reporter_name, ile.body, ile.created_at FROM interaction_log_entries ile JOIN interaction_projects ip ON ip.interaction_id = ile.id WHERE ip.membership_id IN (${ph(membershipIds)}) ORDER BY ile.created_at ASC`).all(...membershipIds) as { id: string; membership_id: string; reporter_name: string; body: string; created_at: number }[])
          : [];
      const projectsByInteraction = fetchProjectsByInteraction(db, bulkLogs.map((e) => e.id));
      const logsByMembership = new Map<string, { id: string; reporter_name: string; body: string; created_at: number }[]>();
      for (const r of bulkLogs) { const a = logsByMembership.get(r.membership_id) ?? []; a.push(r); logsByMembership.set(r.membership_id, a); }

      const rows: ExportRow[] = [];

      for (const m of memberships) {
        const emails = (emailsByContact.get(m.contact_id) ?? []).join('; ');
        const phones = (phonesByContact.get(m.contact_id) ?? []).join('; ');
        const handles = (handlesByContact.get(m.contact_id) ?? []).map((h) => `${h.type}: ${h.handle}`).join('; ');
        const links = linksByContact.get(m.contact_id) ?? [];
        const byType = (type: string) => links.filter((l) => l.type === type).map((l) => l.url).join('; ');
        const interactionLog = mode === 'full'
          ? (logsByMembership.get(m.membership_id) ?? [])
              .map((e) => formatLogEntry(e, projectsByInteraction))
              .join('\n')
          : '';

        rows.push({
          Name: m.name,
          Organization: m.organization ?? '',
          Title: m.title ?? '',
          DOB: m.dob ?? '',
          Emails: emails,
          Phones: phones,
          Handles: handles,
          LinkedIn: byType('linkedin'),
          Facebook: byType('facebook'),
          Instagram: byType('instagram'),
          X: byType('x'),
          Website: byType('website'),
          'Other links': byType('other'),
          Notes: mode === 'full' ? (m.notes ?? '') : '',
          Reporter: m.reporter_name,
          Theme: m.theme ?? '',
          Priority: m.priority ?? '',
          Status: m.status ?? '',
          'First outreach': m.first_log_at
            ? new Date(m.first_log_at * 1000).toLocaleDateString()
            : '',
          'Interaction log': interactionLog,
        });
      }

      try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Contacts');
        if (rows.length > 0) {
          ws.columns = (Object.keys(rows[0]) as (keyof ExportRow)[]).map((k) => ({ header: k, key: k }));
        }
        ws.addRows(rows);
        if (isXlsx) {
          await wb.xlsx.writeFile(filePath);
        } else {
          await wb.csv.writeFile(filePath);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'export:all-contacts',
    async (event, { contactIds: filterIds }: { contactIds?: string[] } = {}): Promise<{ success: boolean; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const db = getDatabase();

      const saveResult = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        title: 'Export contacts',
        defaultPath: filterIds?.length ? `selected-contacts-${filenameDateStamp()}` : `all-contacts-${filenameDateStamp()}`,
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: 'Excel', extensions: ['xlsx'] },
        ],
      });
      if (saveResult.canceled || !saveResult.filePath) return { success: false };

      const filePath = saveResult.filePath;
      const isXlsx = filePath.endsWith('.xlsx');

      const selectionClause2 = filterIds?.length
        ? `WHERE id IN (${filterIds.map(() => '?').join(',')})`
        : '';
      const contacts = db
        .prepare(`SELECT id, name, organization, title, dob, notes FROM contacts ${selectionClause2} ORDER BY name COLLATE NOCASE`)
        .all(...(filterIds ?? [])) as { id: string; name: string; organization: string | null; title: string | null; dob: string | null; notes: string | null }[];

      const allContactIds = contacts.map((c) => c.id);
      const ph2 = (arr: unknown[]) => arr.map(() => '?').join(',');

      const allEmails2 = allContactIds.length
        ? (db.prepare(`SELECT contact_id, email FROM contact_emails WHERE contact_id IN (${ph2(allContactIds)}) ORDER BY sort_order`).all(...allContactIds) as { contact_id: string; email: string }[])
        : [];
      const emailsById = new Map<string, string[]>();
      for (const r of allEmails2) { const a = emailsById.get(r.contact_id) ?? []; a.push(r.email); emailsById.set(r.contact_id, a); }

      const allPhones2 = allContactIds.length
        ? (db.prepare(`SELECT contact_id, phone FROM contact_phones WHERE contact_id IN (${ph2(allContactIds)}) ORDER BY sort_order`).all(...allContactIds) as { contact_id: string; phone: string }[])
        : [];
      const phonesById = new Map<string, string[]>();
      for (const r of allPhones2) { const a = phonesById.get(r.contact_id) ?? []; a.push(r.phone); phonesById.set(r.contact_id, a); }

      const allLinks2 = allContactIds.length
        ? (db.prepare(`SELECT contact_id, type, url FROM contact_links WHERE contact_id IN (${ph2(allContactIds)}) ORDER BY sort_order`).all(...allContactIds) as { contact_id: string; type: string; url: string }[])
        : [];
      const linksById = new Map<string, { type: string; url: string }[]>();
      for (const r of allLinks2) { const a = linksById.get(r.contact_id) ?? []; a.push({ type: r.type, url: r.url }); linksById.set(r.contact_id, a); }

      const allHandles2 = allContactIds.length
        ? (db.prepare(`SELECT contact_id, type, handle FROM contact_handles WHERE contact_id IN (${ph2(allContactIds)}) ORDER BY sort_order`).all(...allContactIds) as { contact_id: string; type: string; handle: string }[])
        : [];
      const handlesById = new Map<string, { type: string; handle: string }[]>();
      for (const r of allHandles2) { const a = handlesById.get(r.contact_id) ?? []; a.push({ type: r.type, handle: r.handle }); handlesById.set(r.contact_id, a); }

      const allLogs = allContactIds.length
        ? (db.prepare(`SELECT id, contact_id, reporter_name, body, created_at FROM interaction_log_entries WHERE contact_id IN (${ph2(allContactIds)}) ORDER BY created_at ASC`).all(...allContactIds) as { id: string; contact_id: string; reporter_name: string; body: string; created_at: number }[])
        : [];
      const logsByContactId = new Map<string, { id: string; reporter_name: string; body: string; created_at: number }[]>();
      for (const r of allLogs) { const a = logsByContactId.get(r.contact_id) ?? []; a.push(r); logsByContactId.set(r.contact_id, a); }
      const allLogProjects = fetchProjectsByInteraction(db, allLogs.map((e) => e.id));

      const rows: AllContactsRow[] = contacts.map((c) => {
        const links = linksById.get(c.id) ?? [];
        const byType2 = (type: string) => links.filter((l) => l.type === type).map((l) => l.url).join('; ');
        return {
          Name: c.name,
          Organization: c.organization ?? '',
          Title: c.title ?? '',
          DOB: c.dob ?? '',
          Emails: (emailsById.get(c.id) ?? []).join('; '),
          Phones: (phonesById.get(c.id) ?? []).join('; '),
          Handles: (handlesById.get(c.id) ?? []).map((h) => `${h.type}: ${h.handle}`).join('; '),
          LinkedIn: byType2('linkedin'),
          Facebook: byType2('facebook'),
          Instagram: byType2('instagram'),
          X: byType2('x'),
          Website: byType2('website'),
          'Other links': byType2('other'),
          Notes: c.notes ?? '',
          'Interaction log': (logsByContactId.get(c.id) ?? [])
            .map((e) => formatLogEntry(e, allLogProjects))
            .join('\n'),
        };
      });

      try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Contacts');
        if (rows.length > 0) {
          ws.columns = (Object.keys(rows[0]) as (keyof AllContactsRow)[]).map((k) => ({ header: k, key: k }));
        }
        ws.addRows(rows);
        if (isXlsx) {
          await wb.xlsx.writeFile(filePath);
        } else {
          await wb.csv.writeFile(filePath);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
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
    const selectionClause = filterIds?.length
      ? `WHERE id IN (${filterIds.map(() => '?').join(',')})`
      : '';
    const contactIds = (
      db.prepare(`SELECT id FROM contacts ${selectionClause} ORDER BY name COLLATE NOCASE`).all(...(filterIds ?? [])) as { id: string }[]
    ).map((r) => r.id);

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
    const typeParam = e.label ? `;TYPE=${e.label.toUpperCase()}` : ';TYPE=INTERNET';
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

  return lines.join('\r\n');
}
