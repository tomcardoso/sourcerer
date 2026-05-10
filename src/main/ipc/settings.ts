import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3-multiple-ciphers';
import { getDatabase } from '../database';
import { getPaths, deriveKey } from '../utils';
import { autoLock } from '../auto-lock';
import { appendAuditLog } from './audit';
import { setRssPollIntervalHours } from '../sync/poller';
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
    return { id, label: label.trim(), sort_order: maxRow.m + 1, is_default: 0, outreach_interval_days: null };
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

  ipcMain.handle('settings:set-staleness-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET staleness_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-staleness-threshold', (_, days: number): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET staleness_threshold_days = ? WHERE id = 1').run(Math.max(1, days));
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-outreach-reminders-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET outreach_reminders_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-outreach-require-interaction', (_, required: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET outreach_require_interaction = ? WHERE id = 1').run(required ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-rss-poll-interval', (_, hours: number): User => {
    const db = getDatabase();
    const clamped = Math.max(1, Math.floor(hours));
    db.prepare('UPDATE users SET rss_poll_interval_hours = ? WHERE id = 1').run(clamped);
    setRssPollIntervalHours(clamped);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle(
    'priority-options:set-interval',
    (_, { id, days }: { id: string; days: number | null }): void => {
      getDatabase()
        .prepare('UPDATE priority_options SET outreach_interval_days = ? WHERE id = ?')
        .run(days ?? null, id);
    },
  );

  ipcMain.handle('settings:set-alert-notifications-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET alert_notifications_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-reminder-notifications-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET reminder_notifications_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-phone-country', (_, country: string): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET phone_country = ? WHERE id = 1').run(country);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-wayback-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET wayback_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle(
    'settings:change-password',
    async (_, { currentPassword, newPassword }: { currentPassword: string; newPassword: string }): Promise<{ success: boolean; error?: string }> => {
      const { dbPath, saltPath } = getPaths();
      try {
        // Verify the current password against the existing salt
        const salt = await fs.readFile(saltPath);
        const currentKeyHex = await deriveKey(currentPassword, salt);

        const testDb = new Database(dbPath);
        testDb.pragma(`cipher='sqlcipher'`);
        testDb.pragma(`key="x'${currentKeyHex}'"`);
        try {
          // pragma('user_version') doesn't force a page decrypt; an actual
          // table read is required to reliably detect a wrong key.
          testDb.prepare('SELECT id FROM users WHERE id = 1').get();
        } catch {
          testDb.close();
          return { success: false, error: 'Current password is incorrect.' };
        }
        testDb.close();

        // Derive new key with a fresh salt
        const newSalt = crypto.randomBytes(16);
        const newKeyHex = await deriveKey(newPassword, newSalt);

        // Rekey the active database connection in-place
        getDatabase().pragma(`rekey="x'${newKeyHex}'"`);

        // Persist the new salt so future unlocks use it
        await fs.writeFile(saltPath, newSalt);

        const actor = (getDatabase().prepare('SELECT email FROM users WHERE id = 1').get() as { email: string } | undefined)?.email ?? null;
        appendAuditLog('password_changed', actor);

        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'An unexpected error occurred.' };
      }
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
