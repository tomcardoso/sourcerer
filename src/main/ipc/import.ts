import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import { normalizeEmail, normalizePhone } from '../sanitize';
import type { User, ImportResult } from '@shared/types';

const SAMPLE_HEADERS =
  'Name,Organization,Notes,Email,Email 2,Phone,Phone 2,LinkedIn,X,Website,Theme,Status,Priority\n';

function parseCsv(text: string): string[][] {
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
      if (rows.length < 2) return { imported: 0, skipped: [], cancelled: false };

      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const col = (name: string) => headers.indexOf(name);
      const db = getDatabase();

      const { phone_country } = db
        .prepare('SELECT phone_country FROM users WHERE id = 1')
        .get() as { phone_country: string };
      const user = db
        .prepare('SELECT first_name, last_name, email FROM users WHERE id = 1')
        .get() as User;

      // Collision sets — loaded once, updated as we import to catch intra-file dupes
      const existingNames = new Set(
        (db.prepare('SELECT LOWER(name) AS n FROM contacts').all() as { n: string }[]).map(
          (r) => r.n,
        ),
      );
      const existingEmails = new Set(
        (
          db.prepare('SELECT LOWER(email) AS e FROM contact_emails').all() as { e: string }[]
        ).map((r) => r.e),
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

      const skipped: ImportResult['skipped'] = [];
      let imported = 0;

      const run = db.transaction(() => {
        for (const row of rows.slice(1)) {
          const get = (name: string) =>
            col(name) >= 0 ? (row[col(name)] ?? '').trim() : '';

          const name = get('name');
          if (!name) continue;

          const rawEmail1 = get('email');
          const rawEmail2 = get('email 2');
          const rawPhone1 = get('phone');
          const rawPhone2 = get('phone 2');

          const emails = [rawEmail1, rawEmail2]
            .filter(Boolean)
            .map(normalizeEmail)
            .filter(Boolean);

          const phones = [rawPhone1, rawPhone2]
            .filter(Boolean)
            .map((p) => normalizePhone(p, phone_country))
            .filter(Boolean);

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

          db.prepare(
            'INSERT INTO contacts (id, name, organization, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(id, name, get('organization') || null, get('notes') || null, now, now);

          emails.forEach((email, i) => {
            db.prepare(
              'INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)',
            ).run(uuidv4(), id, email, i);
            existingEmails.add(email.toLowerCase());
          });

          phones.forEach((phone, i) => {
            db.prepare(
              'INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)',
            ).run(uuidv4(), id, phone, i);
          });

          const links: { type: string; url: string }[] = [];
          const linkedin = get('linkedin');
          const x = get('x');
          const website = get('website');
          if (linkedin) links.push({ type: 'linkedin', url: linkedin });
          if (x) links.push({ type: 'x', url: x });
          if (website) links.push({ type: 'website', url: website });
          links.forEach((link, i) => {
            db.prepare(
              'INSERT INTO contact_links (id, contact_id, type, label, url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
            ).run(uuidv4(), id, link.type, null, link.url, i);
          });

          if (projectId) {
            const rawStatus = get('status');
            const rawPriority = get('priority');
            db.prepare(
              `INSERT INTO project_memberships
               (id, contact_id, project_id, reporter_email, reporter_name, theme, status, priority, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
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
