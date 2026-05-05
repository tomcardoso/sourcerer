import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { getPaths, deriveKey } from '../utils';
import { unlockDatabase, maybeRunDevSeeds } from '../database';
import { autoLock } from '../auto-lock';
import { startPoller } from '../sync/poller';
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
      const salt = await fs.readFile(saltPath);
      const keyHex = await deriveKey(password, salt);
      const db = unlockDatabase(dbPath, keyHex);

      maybeRunDevSeeds(db);

      const savedUser = db
        .prepare('SELECT idle_timeout_seconds FROM users WHERE id = 1')
        .get() as { idle_timeout_seconds: number } | undefined;
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
      return { success: true };
    } catch {
      return { success: false, error: 'Incorrect password.' };
    }
  });
}
