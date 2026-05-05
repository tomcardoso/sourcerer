import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import { autoLock } from '../auto-lock';
import type { User, StatusOption, PriorityOption } from '@shared/types';

const PORT = 27371;

function reorder(
  table: 'status_options' | 'priority_options',
  id: string,
  direction: 'up' | 'down',
): void {
  const db = getDatabase();
  const all = db
    .prepare(`SELECT id, sort_order FROM ${table} ORDER BY sort_order ASC`)
    .all() as { id: string; sort_order: number }[];
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return;
  if (direction === 'up' && idx === 0) return;
  if (direction === 'down' && idx === all.length - 1) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  const reordered = [...all];
  [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
  const run = db.transaction(() => {
    reordered.forEach((row, i) => stmt.run(i, row.id));
  });
  run();
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(
    'users:update',
    (_, data: { firstName: string; lastName: string; email: string }): User => {
      const db = getDatabase();
      db.prepare('UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = 1').run(
        data.firstName.trim(),
        data.lastName.trim(),
        data.email.trim(),
      );
      return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
    },
  );

  ipcMain.handle('settings:get-idle-timeout', (): number => {
    const row = getDatabase()
      .prepare('SELECT idle_timeout_seconds FROM users WHERE id = 1')
      .get() as { idle_timeout_seconds: number };
    return row.idle_timeout_seconds;
  });

  ipcMain.handle('settings:set-idle-timeout', (_, seconds: number): void => {
    getDatabase()
      .prepare('UPDATE users SET idle_timeout_seconds = ? WHERE id = 1')
      .run(seconds);
    const ms = seconds === 0 ? Number.MAX_SAFE_INTEGER : seconds * 1000;
    autoLock.setIdleThreshold(ms);
  });

  // Status options
  ipcMain.handle('status-options:create', (_, label: string): StatusOption => {
    const db = getDatabase();
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM status_options')
      .get() as { m: number };
    const id = uuidv4();
    db.prepare(
      'INSERT INTO status_options (id, label, sort_order, is_default) VALUES (?, ?, ?, 0)',
    ).run(id, label.trim(), maxRow.m + 1);
    return { id, label: label.trim(), sort_order: maxRow.m + 1, is_default: 0 };
  });

  ipcMain.handle('status-options:rename', (_, { id, label }: { id: string; label: string }): void => {
    getDatabase().prepare('UPDATE status_options SET label = ? WHERE id = ?').run(label.trim(), id);
  });

  ipcMain.handle('status-options:delete', (_, id: string): void => {
    const db = getDatabase();
    const row = db.prepare('SELECT label FROM status_options WHERE id = ?').get(id) as { label: string } | undefined;
    if (row) {
      const { n } = db.prepare('SELECT COUNT(*) AS n FROM project_memberships WHERE status = ?').get(row.label) as { n: number };
      if (n > 0) throw new Error('in-use');
    }
    db.prepare('DELETE FROM status_options WHERE id = ?').run(id);
  });

  ipcMain.handle(
    'status-options:move',
    (_, { id, direction }: { id: string; direction: 'up' | 'down' }): void => {
      reorder('status_options', id, direction);
    },
  );

  // Priority options
  ipcMain.handle('priority-options:create', (_, label: string): PriorityOption => {
    const db = getDatabase();
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM priority_options')
      .get() as { m: number };
    const id = uuidv4();
    db.prepare(
      'INSERT INTO priority_options (id, label, sort_order, is_default) VALUES (?, ?, ?, 0)',
    ).run(id, label.trim(), maxRow.m + 1);
    return { id, label: label.trim(), sort_order: maxRow.m + 1, is_default: 0 };
  });

  ipcMain.handle('priority-options:rename', (_, { id, label }: { id: string; label: string }): void => {
    getDatabase().prepare('UPDATE priority_options SET label = ? WHERE id = ?').run(label.trim(), id);
  });

  ipcMain.handle('priority-options:delete', (_, id: string): void => {
    const db = getDatabase();
    const row = db.prepare('SELECT label FROM priority_options WHERE id = ?').get(id) as { label: string } | undefined;
    if (row) {
      const { n } = db.prepare('SELECT COUNT(*) AS n FROM project_memberships WHERE priority = ?').get(row.label) as { n: number };
      if (n > 0) throw new Error('in-use');
    }
    db.prepare('DELETE FROM priority_options WHERE id = ?').run(id);
  });

  ipcMain.handle(
    'priority-options:move',
    (_, { id, direction }: { id: string; direction: 'up' | 'down' }): void => {
      reorder('priority_options', id, direction);
    },
  );

  ipcMain.handle('settings:get-calendar-url', (): string => {
    const db = getDatabase();
    const { calendar_token } = db.prepare('SELECT calendar_token FROM users WHERE id = 1').get() as { calendar_token: string };
    return `http://127.0.0.1:${PORT}/calendar/reminders.ics?token=${calendar_token}`;
  });

  ipcMain.handle('settings:regenerate-calendar-token', (): User => {
    const db = getDatabase();
    const token = uuidv4();
    db.prepare('UPDATE users SET calendar_token = ? WHERE id = 1').run(token);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });
}
