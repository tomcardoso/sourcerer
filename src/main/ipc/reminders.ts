import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import type { Reminder } from '@shared/types';

export function broadcastRemindersChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('reminders:changed');
  }
}

const SELECT_COLS = `
  r.id, r.contact_id, r.project_id, r.membership_id,
  c.name AS contact_name, p.name AS project_name,
  r.due_date, r.note, r.is_auto_outreach, r.created_at, r.completed_at`;

export function registerReminderHandlers(): void {
  ipcMain.handle(
    'reminders:list-for-contact-project',
    (_, { contactId, projectId }: { contactId: string; projectId: string }): Reminder[] => {
      return getDatabase()
        .prepare(
          `SELECT ${SELECT_COLS}
           FROM reminders r
           JOIN contacts c ON c.id = r.contact_id
           JOIN projects p ON p.id = r.project_id
           WHERE r.contact_id = ? AND r.project_id = ?
           ORDER BY r.is_auto_outreach DESC, r.due_date ASC`,
        )
        .all(contactId, projectId) as Reminder[];
    },
  );

  ipcMain.handle('reminders:list-all', (): Reminder[] => {
    return getDatabase()
      .prepare(
        `SELECT ${SELECT_COLS}
         FROM reminders r
         JOIN contacts c ON c.id = r.contact_id
         JOIN projects p ON p.id = r.project_id
         WHERE r.completed_at IS NULL
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
      if (!Number.isFinite(dueDate) || dueDate <= 0) throw new Error('invalid due_date');
      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO reminders (id, contact_id, project_id, due_date, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, contactId, projectId, dueDate, note ?? null, now);
      const reminder = db
        .prepare(
          `SELECT ${SELECT_COLS}
           FROM reminders r
           JOIN contacts c ON c.id = r.contact_id
           JOIN projects p ON p.id = r.project_id
           WHERE r.id = ?`,
        )
        .get(id) as Reminder;
      broadcastRemindersChanged();
      return reminder;
    },
  );

  ipcMain.handle('reminders:complete', (_, id: string): void => {
    const now = Math.floor(Date.now() / 1000);
    getDatabase().prepare(`UPDATE reminders SET completed_at = ? WHERE id = ?`).run(now, id);
    broadcastRemindersChanged();
  });

  ipcMain.handle('reminders:delete', (_, id: string): void => {
    getDatabase().prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
    broadcastRemindersChanged();
  });
}
