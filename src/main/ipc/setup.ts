import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getPaths, deriveKey } from '../utils';
import { initDatabase, closeDatabase } from '../database';
import type { SetupFormData, SetupResult, FirstLaunchResult } from '@shared/types';

export function registerSetupHandlers(): void {
  ipcMain.handle('setup:check-first-launch', async (): Promise<FirstLaunchResult> => {
    const { saltPath } = getPaths();
    const exists = await fs
      .access(saltPath)
      .then(() => true)
      .catch(() => false);
    return { isFirstLaunch: !exists };
  });

  ipcMain.handle('setup:complete', async (_, data: SetupFormData): Promise<SetupResult> => {
    const { dbPath, saltPath } = getPaths();

    let saltWritten = false;
    let dbCreated = false;

    try {
      const salt = crypto.randomBytes(32);

      await fs.writeFile(saltPath, salt, { mode: 0o600 });
      saltWritten = true;

      const keyHex = await deriveKey(data.password, salt);

      const db = initDatabase(dbPath, keyHex);
      dbCreated = true;

      // Restrict DB file permissions — better-sqlite3 creates the file itself
      await fs.chmod(dbPath, 0o600).catch(() => {});
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        'INSERT INTO users (id, first_name, last_name, email, created_at, calendar_token) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(1, data.firstName, data.lastName, data.email, now, uuidv4());

      // Close DB — the unlock flow re-opens it, keeping auth state consistent.
      closeDatabase();

      return { success: true };
    } catch (err) {
      closeDatabase();
      if (saltWritten) await fs.unlink(saltPath).catch(() => {});
      if (dbCreated) await fs.unlink(dbPath).catch(() => {});
      return {
        success: false,
        error: err instanceof Error ? err.message : 'An unexpected error occurred.',
      };
    }
  });
}
