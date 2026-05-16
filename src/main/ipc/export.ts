import { ipcMain, dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { utils, writeFile } from 'xlsx';
import { getDatabase } from '../database';

interface ExportRow {
  Name: string;
  Organization: string;
  Emails: string;
  Phones: string;
  LinkedIn: string;
  Facebook: string;
  Instagram: string;
  X: string;
  'Other links': string;
  Notes: string;
  Reporter: string;
  Theme: string;
  Priority: string;
  Status: string;
  'First outreach': string;
  'Interaction log': string;
}

type ExportMode = 'full' | 'sanitized';

export function registerExportHandlers(): void {
  ipcMain.handle(
    'export:project',
    async (
      event,
      { projectId, mode }: { projectId: string; mode: ExportMode },
    ): Promise<{ success: boolean; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const db = getDatabase();

      const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as
        | { name: string }
        | undefined;
      if (!project) return { success: false, error: 'Project not found.' };

      const saveResult = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        title: 'Export project contacts',
        defaultPath: `${project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-contacts`,
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: 'Excel', extensions: ['xlsx'] },
        ],
      });
      if (saveResult.canceled || !saveResult.filePath) return { success: false };

      const filePath = saveResult.filePath;
      const isXlsx = filePath.endsWith('.xlsx');

      // Fetch all memberships + contacts for this project
      const memberships = db
        .prepare(
          `SELECT pm.id AS membership_id, pm.reporter_name, pm.theme, pm.priority, pm.status,
                  (SELECT MIN(ile.created_at) FROM interaction_log_entries ile
                   WHERE ile.membership_id = pm.id) AS first_log_at,
                  c.id AS contact_id, c.name, c.organization, c.notes
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

      const bulkLogs: { membership_id: string; reporter_name: string; body: string; created_at: number }[] =
        mode === 'full' && membershipIds.length
          ? (db.prepare(`SELECT membership_id, reporter_name, body, created_at FROM interaction_log_entries WHERE membership_id IN (${ph(membershipIds)}) ORDER BY created_at ASC`).all(...membershipIds) as { membership_id: string; reporter_name: string; body: string; created_at: number }[])
          : [];
      const logsByMembership = new Map<string, { reporter_name: string; body: string; created_at: number }[]>();
      for (const r of bulkLogs) { const a = logsByMembership.get(r.membership_id) ?? []; a.push(r); logsByMembership.set(r.membership_id, a); }

      const rows: ExportRow[] = [];

      for (const m of memberships) {
        const emails = (emailsByContact.get(m.contact_id) ?? []).join('; ');
        const phones = (phonesByContact.get(m.contact_id) ?? []).join('; ');
        const links = linksByContact.get(m.contact_id) ?? [];
        const byType = (type: string) => links.filter((l) => l.type === type).map((l) => l.url).join('; ');
        const interactionLog = mode === 'full'
          ? (logsByMembership.get(m.membership_id) ?? [])
              .map((e) => `[${new Date(e.created_at * 1000).toLocaleDateString()} — ${e.reporter_name}] ${e.body}`)
              .join('\n')
          : '';

        rows.push({
          Name: m.name,
          Organization: m.organization ?? '',
          Emails: emails,
          Phones: phones,
          LinkedIn: byType('linkedin'),
          Facebook: byType('facebook'),
          Instagram: byType('instagram'),
          X: byType('x'),
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
        const ws = utils.json_to_sheet(rows);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, 'Contacts');

        if (isXlsx) {
          writeFile(wb, filePath);
        } else {
          writeFile(wb, filePath, { bookType: 'csv' });
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'export:all-contacts',
    async (event): Promise<{ success: boolean; error?: string }> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const db = getDatabase();

      const saveResult = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        title: 'Export all contacts',
        defaultPath: 'all-contacts',
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: 'Excel', extensions: ['xlsx'] },
        ],
      });
      if (saveResult.canceled || !saveResult.filePath) return { success: false };

      const filePath = saveResult.filePath;
      const isXlsx = filePath.endsWith('.xlsx');

      const contacts = db
        .prepare('SELECT id, name, organization, notes FROM contacts ORDER BY name COLLATE NOCASE')
        .all() as { id: string; name: string; organization: string | null; notes: string | null }[];

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

      const rows: { Name: string; Organization: string; Emails: string; Phones: string; Notes: string }[] = contacts.map((c) => ({
        Name: c.name,
        Organization: c.organization ?? '',
        Emails: (emailsById.get(c.id) ?? []).join('; '),
        Phones: (phonesById.get(c.id) ?? []).join('; '),
        Notes: c.notes ?? '',
      }));

      try {
        const ws = utils.json_to_sheet(rows);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, 'Contacts');
        writeFile(wb, filePath, isXlsx ? undefined : { bookType: 'csv' });
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
      defaultPath: `${safeName}.vcf`,
      filters: [{ name: 'vCard', extensions: ['vcf'] }],
    });
    if (canceled || !filePath) return;
    await fs.writeFile(filePath, card, 'utf-8');
  });

  ipcMain.handle('export:vcard-project', async (event, projectId: string): Promise<void> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const db = getDatabase();
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as { name: string } | undefined;
    const contactIds = (
      db.prepare('SELECT contact_id FROM project_memberships WHERE project_id = ?').all(projectId) as { contact_id: string }[]
    ).map((r) => r.contact_id);

    const cards = contactIds.map((id) => buildVCard(db, id)).filter(Boolean).join('\r\n');
    if (!cards) return;

    const safeName = (project?.name ?? 'project').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Export project contacts as vCard',
      defaultPath: `${safeName}-contacts.vcf`,
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
    .prepare('SELECT name, organization, title FROM contacts WHERE id = ?')
    .get(contactId) as { name: string; organization: string | null; title: string | null } | undefined;
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
  emails.forEach((e) => {
    const typeParam = e.label ? `;TYPE=${e.label.toUpperCase()}` : ';TYPE=INTERNET';
    lines.push(`EMAIL${typeParam}:${e.email}`);
  });
  phones.forEach((p) => lines.push(`TEL:${p}`));
  links.forEach((l) => {
    const typeLabel = l.type.charAt(0).toUpperCase() + l.type.slice(1);
    lines.push(`URL;TYPE=${typeLabel}:${l.url}`);
  });
  handles.forEach((h) => lines.push(`IMPP:${h.type}:${escapeVCard(h.handle)}`));
  lines.push('END:VCARD');

  return lines.join('\r\n');
}
