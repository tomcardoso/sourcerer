import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import type {
  ContactListItem,
  ContactDetail,
  CreateContactInput,
  ContactEmail,
  ContactPhone,
  ContactLink,
  ContactProject,
  ProjectContactRow,
  User,
} from '@shared/types';

export function registerContactHandlers(): void {
  ipcMain.handle('contacts:list', (): ContactListItem[] => {
    const rows = getDatabase()
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

    const map = new Map<string, ContactListItem>();
    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, { id: row.id, name: row.name, organization: row.organization, projects: [] });
      }
      if (row.project_id) {
        map.get(row.id)!.projects.push({ id: row.project_id, name: row.project_name! });
      }
    }
    return [...map.values()];
  });

  ipcMain.handle('contacts:get', (_, id: string): ContactDetail => {
    const db = getDatabase();
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as {
      id: string;
      name: string;
      organization: string | null;
      notes: string | null;
      created_at: number;
      updated_at: number;
    };
    const emails = db
      .prepare('SELECT id, email, sort_order FROM contact_emails WHERE contact_id = ? ORDER BY sort_order')
      .all(id) as ContactEmail[];
    const phones = db
      .prepare('SELECT id, phone, sort_order FROM contact_phones WHERE contact_id = ? ORDER BY sort_order')
      .all(id) as ContactPhone[];
    const links = db
      .prepare('SELECT id, type, label, url, sort_order FROM contact_links WHERE contact_id = ? ORDER BY sort_order')
      .all(id) as ContactLink[];
    const projects = db
      .prepare(
        `SELECT p.id, p.name, pm.id AS membership_id, pm.status, pm.reporter_name
         FROM project_memberships pm
         JOIN projects p ON p.id = pm.project_id
         WHERE pm.contact_id = ?
         ORDER BY p.name ASC`,
      )
      .all(id) as ContactProject[];

    return { ...contact, emails, phones, links, projects };
  });

  ipcMain.handle('contacts:create', (_, data: CreateContactInput): ContactListItem => {
    const db = getDatabase();
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    const insert = db.transaction(() => {
      db.prepare(
        'INSERT INTO contacts (id, name, organization, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, data.name.trim(), data.organization?.trim() || null, data.notes?.trim() || null, now, now);

      const emails = (data.emails ?? []).map((e) => e.trim()).filter(Boolean);
      emails.forEach((email, i) => {
        db.prepare(
          'INSERT INTO contact_emails (id, contact_id, email, sort_order) VALUES (?, ?, ?, ?)',
        ).run(uuidv4(), id, email, i);
      });

      const phones = (data.phones ?? []).map((p) => p.trim()).filter(Boolean);
      phones.forEach((phone, i) => {
        db.prepare(
          'INSERT INTO contact_phones (id, contact_id, phone, sort_order) VALUES (?, ?, ?, ?)',
        ).run(uuidv4(), id, phone, i);
      });

      const linkedinUrl = data.linkedinUrl?.trim();
      if (linkedinUrl) {
        db.prepare(
          'INSERT INTO contact_links (id, contact_id, type, url, sort_order) VALUES (?, ?, ?, ?, ?)',
        ).run(uuidv4(), id, 'linkedin', linkedinUrl, 0);
      }
    });

    insert();
    return { id, name: data.name.trim(), organization: data.organization?.trim() || null, projects: [] };
  });

  ipcMain.handle('contacts:delete', (_, id: string): void => {
    getDatabase().prepare('DELETE FROM contacts WHERE id = ?').run(id);
  });

  ipcMain.handle(
    'memberships:add',
    (_, { contactId, projectId }: { contactId: string; projectId: string }): void => {
      const db = getDatabase();
      const user = db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
      const defaultStatus = db
        .prepare('SELECT label FROM status_options ORDER BY sort_order LIMIT 1')
        .get() as { label: string } | undefined;

      db.prepare(
        `INSERT INTO project_memberships
         (id, contact_id, project_id, reporter_email, reporter_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        uuidv4(),
        contactId,
        projectId,
        user.email,
        `${user.first_name} ${user.last_name}`,
        defaultStatus?.label ?? null,
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000),
      );
    },
  );

  ipcMain.handle(
    'memberships:remove',
    (_, { contactId, projectId }: { contactId: string; projectId: string }): void => {
      getDatabase()
        .prepare('DELETE FROM project_memberships WHERE contact_id = ? AND project_id = ?')
        .run(contactId, projectId);
    },
  );

  ipcMain.handle('contacts:list-for-project', (_, projectId: string): ProjectContactRow[] => {
    return getDatabase()
      .prepare(
        `SELECT c.id, c.name, c.organization,
                pm.id AS membership_id, pm.reporter_name, pm.theme, pm.priority, pm.status
         FROM project_memberships pm
         JOIN contacts c ON c.id = pm.contact_id
         WHERE pm.project_id = ?
         ORDER BY c.name COLLATE NOCASE ASC`,
      )
      .all(projectId) as ProjectContactRow[];
  });
}
