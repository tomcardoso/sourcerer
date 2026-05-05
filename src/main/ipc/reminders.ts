import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import type { Reminder } from '@shared/types';

export function registerReminderHandlers(): void {
  ipcMain.handle(
    'reminders:list-for-contact-project',
    (_, { contactId, projectId }: { contactId: string; projectId: string }): Reminder[] => {
      return getDatabase()
        .prepare(
          `SELECT r.id, r.contact_id, r.project_id,
                  c.name AS contact_name, p.name AS project_name,
                  r.due_date, r.note, r.created_at
           FROM reminders r
           JOIN contacts c ON c.id = r.contact_id
           JOIN projects p ON p.id = r.project_id
           WHERE r.contact_id = ? AND r.project_id = ?
           ORDER BY r.due_date ASC`,
        )
        .all(contactId, projectId) as Reminder[];
    },
  );

  ipcMain.handle('reminders:list-all', (): Reminder[] => {
    return getDatabase()
      .prepare(
        `SELECT r.id, r.contact_id, r.project_id,
                c.name AS contact_name, p.name AS project_name,
                r.due_date, r.note, r.created_at
         FROM reminders r
         JOIN contacts c ON c.id = r.contact_id
         JOIN projects p ON p.id = r.project_id
         ORDER BY r.due_date ASC`,
      )
      .all() as Reminder[];
  });

  ipcMain.handle(
    'reminders:create',
    (
      _,
      {
        contactId,
        projectId,
        dueDate,
        note,
      }: { contactId: string; projectId: string; dueDate: number; note?: string },
    ): Reminder => {
      const db = getDatabase();
      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO reminders (id, contact_id, project_id, due_date, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, contactId, projectId, dueDate, note ?? null, now);
      return db
        .prepare(
          `SELECT r.id, r.contact_id, r.project_id,
                  c.name AS contact_name, p.name AS project_name,
                  r.due_date, r.note, r.created_at
           FROM reminders r
           JOIN contacts c ON c.id = r.contact_id
           JOIN projects p ON p.id = r.project_id
           WHERE r.id = ?`,
        )
        .get(id) as Reminder;
    },
  );

  ipcMain.handle('reminders:delete', (_, id: string): void => {
    getDatabase().prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
  });
}
