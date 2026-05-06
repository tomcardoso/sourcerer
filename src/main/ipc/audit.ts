import { ipcMain, app } from 'electron';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, closeDatabase } from '../database';
import { getPaths } from '../utils';
import type { AuditLogEntry } from '@shared/types';

export function appendAuditLog(
  eventType: 'unlock' | 'password_changed' | 'panic_wipe',
  actor: string | null,
  details?: string,
): void {
  try {
    getDatabase()
      .prepare(
        `INSERT INTO audit_log (id, event_type, actor, occurred_at, details)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(uuidv4(), eventType, actor ?? null, Math.floor(Date.now() / 1000), details ?? null);
  } catch {
    // Best-effort — never block the caller
  }
}

export function registerAuditHandlers(): void {
  ipcMain.handle('audit:list', (): AuditLogEntry[] => {
    return getDatabase()
      .prepare(
        `SELECT id, event_type, actor, occurred_at, details
         FROM audit_log
         ORDER BY occurred_at DESC
         LIMIT 200`,
      )
      .all() as AuditLogEntry[];
  });

  ipcMain.handle('settings:panic-wipe', async (): Promise<void> => {
    const { dbPath, saltPath } = getPaths();

    // Best-effort: record the event before wiping
    appendAuditLog('panic_wipe', null);

    closeDatabase();

    await fs.unlink(dbPath).catch(() => {});
    await fs.unlink(saltPath).catch(() => {});

    app.quit();
  });
}
