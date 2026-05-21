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

const FROM_JOINS = `
  FROM reminders r
  JOIN contacts c ON c.id = r.contact_id
  LEFT JOIN projects p ON p.id = r.project_id`;

export function registerReminderHandlers(): void {
  ipcMain.handle(
    'reminders:list-for-contact-project',
    (_, { contactId, projectId }: { contactId: string; projectId: string }): Reminder[] => {
      return getDatabase()
        .prepare(
          `SELECT ${SELECT_COLS}
           ${FROM_JOINS}
           WHERE r.contact_id = ? AND r.project_id = ?
           ORDER BY r.is_auto_outreach DESC, r.due_date ASC`,
        )
        .all(contactId, projectId) as Reminder[];
    },
  );

  ipcMain.handle(
    'reminders:list-for-contact',
    (_, contactId: string): Reminder[] => {
      return getDatabase()
        .prepare(
          `SELECT ${SELECT_COLS}
           ${FROM_JOINS}
           WHERE r.contact_id = ?
           ORDER BY r.is_auto_outreach DESC, r.due_date ASC`,
        )
        .all(contactId) as Reminder[];
    },
  );

  ipcMain.handle('reminders:list-all', (): Reminder[] => {
    return getDatabase()
      .prepare(
        `SELECT ${SELECT_COLS}
         ${FROM_JOINS}
         WHERE r.completed_at IS NULL AND (r.project_id IS NULL OR p.is_archived = 0)
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
      }: { contactId: string; projectId?: string; dueDate: number; note?: string },
    ): Reminder => {
      const db = getDatabase();
      if (!Number.isFinite(dueDate) || dueDate <= 0) throw new Error('invalid due_date');
      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO reminders (id, contact_id, project_id, due_date, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, contactId, projectId ?? null, dueDate, note ?? null, now);
      const reminder = db
        .prepare(
          `SELECT ${SELECT_COLS}
           ${FROM_JOINS}
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

  ipcMain.handle('reminders:uncomplete', (_, id: string): void => {
    getDatabase().prepare(`UPDATE reminders SET completed_at = NULL WHERE id = ?`).run(id);
    broadcastRemindersChanged();
  });

  ipcMain.handle('reminders:delete', (_, id: string): void => {
    getDatabase().prepare(`DELETE FROM reminders WHERE id = ?`).run(id);
    broadcastRemindersChanged();
  });

  ipcMain.handle(
    'reminders:update',
    (_, { id, dueDate, note }: { id: string; dueDate: number; note: string | null }): Reminder => {
      const db = getDatabase();
      if (!Number.isFinite(dueDate) || dueDate <= 0) throw new Error('invalid due_date');
      const normalizedNote = note?.trim() || null;
      const result = db
        .prepare('UPDATE reminders SET due_date = ?, note = ? WHERE id = ? AND is_auto_outreach = 0')
        .run(dueDate, normalizedNote, id);
      if (result.changes === 0) throw new Error('reminder not found or not editable');
      const reminder = db
        .prepare(
          `SELECT ${SELECT_COLS}
           ${FROM_JOINS}
           WHERE r.id = ?`,
        )
        .get(id) as Reminder;
      broadcastRemindersChanged();
      return reminder;
    },
  );
}
