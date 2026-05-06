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
  Lawsuits: string;
  'Other links': string;
  Notes: string;
  Reporter: string;
  Theme: string;
  Priority: string;
  Status: string;
  'First outreach': string;
  'Interview dates': string;
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
                  pm.first_outreach_at,
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
        first_outreach_at: number | null;
        contact_id: string;
        name: string;
        organization: string | null;
        notes: string | null;
      }[];

      const rows: ExportRow[] = [];

      for (const m of memberships) {
        const emails = (
          db
            .prepare(
              'SELECT email FROM contact_emails WHERE contact_id = ? ORDER BY sort_order',
            )
            .all(m.contact_id) as { email: string }[]
        )
          .map((r) => r.email)
          .join('; ');

        const phones = (
          db
            .prepare(
              'SELECT phone FROM contact_phones WHERE contact_id = ? ORDER BY sort_order',
            )
            .all(m.contact_id) as { phone: string }[]
        )
          .map((r) => r.phone)
          .join('; ');

        const links = db
          .prepare('SELECT type, url FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
          .all(m.contact_id) as { type: string; url: string }[];

        const byType = (type: string) =>
          links
            .filter((l) => l.type === type)
            .map((l) => l.url)
            .join('; ');

        const interviewDates =
          (
            db
              .prepare(
                `SELECT id.interviewed_at FROM interview_dates id
                 JOIN project_memberships pm ON pm.id = id.membership_id
                 WHERE pm.id = ?
                 ORDER BY id.interviewed_at ASC`,
              )
              .all(m.membership_id) as { interviewed_at: number }[]
          )
            .map((r) => new Date(r.interviewed_at * 1000).toLocaleDateString())
            .join('; ') || '';

        let interactionLog = '';
        if (mode === 'full') {
          interactionLog = (
            db
              .prepare(
                `SELECT reporter_name, body, created_at FROM interaction_log_entries
                 WHERE membership_id = ? ORDER BY created_at ASC`,
              )
              .all(m.membership_id) as {
              reporter_name: string;
              body: string;
              created_at: number;
            }[]
          )
            .map(
              (e) =>
                `[${new Date(e.created_at * 1000).toLocaleDateString()} — ${e.reporter_name}] ${e.body}`,
            )
            .join('\n');
        }

        rows.push({
          Name: m.name,
          Organization: m.organization ?? '',
          Emails: emails,
          Phones: phones,
          LinkedIn: byType('linkedin'),
          Facebook: byType('facebook'),
          Instagram: byType('instagram'),
          X: byType('x'),
          Lawsuits: byType('lawsuit'),
          'Other links': byType('other'),
          Notes: mode === 'full' ? (m.notes ?? '') : '',
          Reporter: m.reporter_name,
          Theme: m.theme ?? '',
          Priority: m.priority ?? '',
          Status: m.status ?? '',
          'First outreach': m.first_outreach_at
            ? new Date(m.first_outreach_at * 1000).toLocaleDateString()
            : '',
          'Interview dates': interviewDates,
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
    .prepare('SELECT name, organization FROM contacts WHERE id = ?')
    .get(contactId) as { name: string; organization: string | null } | undefined;
  if (!contact) return null;

  const emails = (
    db.prepare('SELECT email FROM contact_emails WHERE contact_id = ? ORDER BY sort_order').all(contactId) as { email: string }[]
  ).map((r) => r.email);

  const phones = (
    db.prepare('SELECT phone FROM contact_phones WHERE contact_id = ? ORDER BY sort_order').all(contactId) as { phone: string }[]
  ).map((r) => r.phone);

  const links = (
    db.prepare('SELECT type, url FROM contact_links WHERE contact_id = ? ORDER BY sort_order').all(contactId) as { type: string; url: string }[]
  );

  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`FN:${escapeVCard(contact.name)}`);
  lines.push(`N:${escapeVCard(contact.name)};;;;`);
  if (contact.organization) lines.push(`ORG:${escapeVCard(contact.organization)}`);
  emails.forEach((e) => lines.push(`EMAIL;TYPE=INTERNET:${e}`));
  phones.forEach((p) => lines.push(`TEL:${p}`));
  links.forEach((l) => {
    const typeLabel = l.type.charAt(0).toUpperCase() + l.type.slice(1);
    lines.push(`URL;TYPE=${typeLabel}:${l.url}`);
  });
  lines.push('END:VCARD');

  return lines.join('\r\n');
}
