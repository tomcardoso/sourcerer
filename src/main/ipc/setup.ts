import { ipcMain, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { initDatabase } from '../database';
import type { SetupFormData, SetupResult, FirstLaunchResult } from '@shared/types';

function getPaths(): { dbPath: string; saltPath: string } {
  const userData = app.getPath('userData');
  return {
    dbPath: path.join(userData, 'sourceror.db'),
    saltPath: path.join(userData, 'sourceror.salt'),
  };
}

async function deriveKey(password: string, salt: Buffer): Promise<string> {
  const rawKey = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
    salt,
    raw: true,
  });
  return (rawKey as Buffer).toString('hex');
}

export function registerSetupHandlers(): void {
  ipcMain.handle('setup:check-first-launch', async (): Promise<FirstLaunchResult> => {
    const { saltPath } = getPaths();
    const exists = await fs
      .access(saltPath)
      .then(() => true)
      .catch(() => false);
    return { isFirstLaunch: !exists };
  });

  ipcMain.handle(
    'setup:complete',
    async (_, data: SetupFormData): Promise<SetupResult> => {
      const { dbPath, saltPath } = getPaths();

      let saltWritten = false;
      let dbCreated = false;

      try {
        const salt = crypto.randomBytes(16);

        await fs.writeFile(saltPath, salt);
        saltWritten = true;

        const keyHex = await deriveKey(data.password, salt);

        const db = initDatabase(dbPath, keyHex);
        dbCreated = true;

        const now = Math.floor(Date.now() / 1000);
        const calendarToken = uuidv4();

        db.prepare(
          'INSERT INTO users (id, first_name, last_name, email, created_at, calendar_token) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(1, data.firstName, data.lastName, data.email, now, calendarToken);

        return { success: true };
      } catch (err) {
        // Roll back on failure to avoid corrupted half-initialised state
        if (saltWritten && !dbCreated) {
          await fs.unlink(saltPath).catch(() => {});
        }
        if (dbCreated) {
          const { dbPath: dp, saltPath: sp } = getPaths();
          await fs.unlink(dp).catch(() => {});
          await fs.unlink(sp).catch(() => {});
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : 'An unexpected error occurred.',
        };
      }
    },
  );
}
