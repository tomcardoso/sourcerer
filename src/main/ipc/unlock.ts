import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { getPaths, deriveKey } from '../utils';
import { unlockDatabase } from '../database';
import type { UnlockResult } from '@shared/types';

export function registerUnlockHandlers(): void {
  ipcMain.handle('unlock:attempt', async (_, password: string): Promise<UnlockResult> => {
    const { dbPath, saltPath } = getPaths();

    const dbExists = await fs
      .access(dbPath)
      .then(() => true)
      .catch(() => false);
    if (!dbExists) {
      return { success: false, error: 'Database file not found. Your data may have been moved or deleted.' };
    }

    try {
      const salt = await fs.readFile(saltPath);
      const keyHex = await deriveKey(password, salt);
      unlockDatabase(dbPath, keyHex);
      return { success: true };
    } catch {
      return { success: false, error: 'Incorrect password.' };
    }
  });
}
