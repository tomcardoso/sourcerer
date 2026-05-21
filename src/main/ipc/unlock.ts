import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { getPaths, deriveKey } from '../utils';
import { unlockDatabase, maybeRunDevSeeds, setActivePassword } from '../database';
import { autoLock } from '../auto-lock';
import { startPoller } from '../sync/poller';
import { startAutoBackupTimer } from '../index';
import { checkOutreachReminders, clearOutreachNotificationCache } from '../sync/outreach-checker';
import { checkReminders, clearReminderNotificationCache } from '../sync/reminder-checker';
import { runDedupScan } from './contacts';
import type { UnlockResult } from '@shared/types';

async function checkVaultFiles(dbPath: string, saltPath: string): Promise<string | null> {
  const [dbStat, saltStat] = await Promise.all([
    fs.stat(dbPath).catch(() => null),
    fs.stat(saltPath).catch(() => null),
  ]);
  if (!dbStat) return 'Database file not found. Your vault may have been moved or deleted.';
  if (!saltStat) return 'Vault key file not found. Your vault may have been moved or deleted.';
  // Cloud sync placeholder files are typically 0 bytes; a valid cipher database is at least one page (4096 bytes)
  if (dbStat.size < 4096) return 'The database appears to be a cloud sync placeholder. Make sure your sync client has finished downloading the vault before unlocking.';
  // The salt is always exactly 32 bytes
  if (saltStat.size !== 32) return 'The vault key file appears to be a cloud sync placeholder. Make sure your sync client has finished downloading the vault before unlocking.';
  return null;
}

const APP_WIDTH = 1100;
const APP_HEIGHT = 720;

export function registerUnlockHandlers(): void {
  ipcMain.handle('unlock:attempt', async (event, password: string): Promise<UnlockResult> => {
    const { dbPath, saltPath } = getPaths();

    const vaultError = await checkVaultFiles(dbPath, saltPath);
    if (vaultError) return { success: false, error: vaultError };

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

      setActivePassword(password);
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
      startAutoBackupTimer();
      clearOutreachNotificationCache();
      clearReminderNotificationCache();
      checkOutreachReminders();
      checkReminders();
      runDedupScan();
      return { success: true };
    } catch {
      return { success: false, error: 'Incorrect password.' };
    }
  });
}
