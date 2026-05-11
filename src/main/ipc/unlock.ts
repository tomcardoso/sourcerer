import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { getPaths, deriveKey } from '../utils';
import { unlockDatabase, maybeRunDevSeeds } from '../database';
import { autoLock } from '../auto-lock';
import { startPoller } from '../sync/poller';
import { checkOutreachReminders, clearOutreachNotificationCache } from '../sync/outreach-checker';
import { checkReminders, clearReminderNotificationCache } from '../sync/reminder-checker';
import type { UnlockResult } from '@shared/types';

const APP_WIDTH = 1100;
const APP_HEIGHT = 720;

export function registerUnlockHandlers(): void {
  ipcMain.handle('unlock:attempt', async (event, password: string): Promise<UnlockResult> => {
    const { dbPath, saltPath } = getPaths();

    const dbExists = await fs
      .access(dbPath)
      .then(() => true)
      .catch(() => false);
    if (!dbExists) {
      return {
        success: false,
        error: 'Database file not found. Your data may have been moved or deleted.',
      };
    }

    try {
      let salt = await fs.readFile(saltPath);
      let keyHex = await deriveKey(password, salt);

      // Recovery path: if a previous password change was interrupted after PRAGMA rekey
      // but before the atomic rename, a .tmp salt file remains.  Try it as a fallback
      // and, if it works, complete the rename so the state is fully consistent.
      let db;
      try {
        db = unlockDatabase(dbPath, keyHex);
      } catch {
        const saltTmpPath = saltPath + '.tmp';
        const tmpExists = await fs.access(saltTmpPath).then(() => true).catch(() => false);
        if (!tmpExists) throw new Error('Incorrect password.');
        salt = await fs.readFile(saltTmpPath);
        keyHex = await deriveKey(password, salt);
        db = unlockDatabase(dbPath, keyHex);
        await fs.rename(saltTmpPath, saltPath);
      }

      maybeRunDevSeeds(db);

      const savedUser = db
        .prepare('SELECT idle_timeout_seconds, email FROM users WHERE id = 1')
        .get() as { idle_timeout_seconds: number; email: string } | undefined;

      const timeoutMs =
        (savedUser?.idle_timeout_seconds ?? 0) === 0
          ? Number.MAX_SAFE_INTEGER
          : (savedUser?.idle_timeout_seconds ?? 900) * 1000;
      autoLock.setIdleThreshold(timeoutMs);
      autoLock.resetInteraction();

      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setResizable(true);
        win.setMinimumSize(800, 600);
        win.setSize(APP_WIDTH, APP_HEIGHT, true);
        win.center();
      }

      startPoller();
      clearOutreachNotificationCache();
      clearReminderNotificationCache();
      checkOutreachReminders();
      checkReminders();
      return { success: true };
    } catch {
      return { success: false, error: 'Incorrect password.' };
    }
  });
}
