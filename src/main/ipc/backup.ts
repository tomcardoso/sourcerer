import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import Database from 'better-sqlite3-multiple-ciphers';
import { getPaths, deriveKey, filenameDateStamp } from '../utils';
import { closeDatabase, getKeyHex } from '../database';
import { stopPoller } from '../sync/poller';
import { clearExtensionSession } from '../http-server';
import { writeBackupFile, readBackupFile, createBackupEntries } from './backup-format';

const AUTH_WIDTH = 560;
const AUTH_HEIGHT = 720;

export function registerBackupHandlers(): void {
  ipcMain.handle(
    'backup:export',
    async (_, { password }: { password: string }): Promise<{ success: boolean; error?: string }> => {
      const { dbPath, saltPath, screenshotsPath } = getPaths();

      const dbSalt = await fs.readFile(saltPath);
      const verifyKeyHex = await deriveKey(password, dbSalt);
      if (!crypto.timingSafeEqual(Buffer.from(verifyKeyHex, 'hex'), Buffer.from(getKeyHex(), 'hex'))) {
        return { success: false, error: 'Incorrect password.' };
      }

      const win = BrowserWindow.getFocusedWindow();
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        title: 'Export backup',
        defaultPath: `sourcerer-backup-${filenameDateStamp()}.sourcerer-backup`,
        filters: [{ name: 'Sourcerer Backup', extensions: ['sourcerer-backup'] }],
      });
      if (canceled || !filePath) return { success: false };

      try {
        await writeBackupFile(createBackupEntries(dbPath, saltPath, screenshotsPath), filePath, password);
        return { success: true };
      } catch (err) {
        await fs.unlink(filePath).catch(() => {});
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    'backup:restore',
    async (
      _,
      { password }: { password: string },
    ): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
      const { dbPath, saltPath, screenshotsPath } = getPaths();
      const win = BrowserWindow.getFocusedWindow();

      const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        title: 'Restore from backup',
        filters: [{ name: 'Sourcerer Backup', extensions: ['sourcerer-backup'] }],
        properties: ['openFile'],
      });
      if (canceled || filePaths.length === 0) return { success: false, canceled: true };

      const tmpScreensDir = path.join(os.tmpdir(), `sourcerer-restore-screens-${Date.now()}`);
      let screensWritten = false;

      try {
        const MAX_BACKUP_BYTES = 2 * 1024 * 1024 * 1024;
        const stat = await fs.stat(filePaths[0]);
        if (stat.size > MAX_BACKUP_BYTES) {
          return { success: false, error: 'Backup file is too large (max 2 GB).' };
        }

        let dbBuf: Buffer | null = null;
        let dbSalt: Buffer | null = null;

        try {
          for await (const entry of readBackupFile(filePaths[0], password)) {
            if (entry.name === 'db.sqlite') {
              dbBuf = entry.data;
            } else if (entry.name === 'salt') {
              dbSalt = entry.data;
            } else if (entry.name.startsWith('screenshots/')) {
              if (!screensWritten) {
                await fs.mkdir(tmpScreensDir, { recursive: true });
                screensWritten = true;
              }
              await fs.writeFile(
                path.join(tmpScreensDir, path.basename(entry.name)),
                entry.data,
                { mode: 0o600 },
              );
            }
          }
        } catch (err) {
          const msg = String(err);
          if (msg.includes('Incorrect password')) return { success: false, error: 'Incorrect password or corrupted backup.' };
          if (msg.includes('Unrecognised')) return { success: false, error: 'Unrecognised backup file format.' };
          if (msg.includes('not supported')) return { success: false, error: 'This backup format is not supported. Please create a new backup.' };
          return { success: false, error: 'Corrupted backup file.' };
        }

        if (!dbBuf || !dbSalt) return { success: false, error: 'Corrupted backup file.' };

        // Verify the DB before touching the live vault.
        const tmpDbPath = path.join(os.tmpdir(), `sourcerer-restore-${Date.now()}.db`);
        try {
          await fs.writeFile(tmpDbPath, dbBuf, { mode: 0o600 });
          const testDb = new Database(tmpDbPath);
          testDb.pragma(`cipher='sqlcipher'`);
          testDb.pragma('cipher_page_size=4096');
          testDb.pragma('kdf_iter=256000');
          testDb.pragma('cipher_hmac_algorithm=HMAC_SHA512');
          testDb.pragma('cipher_kdf_algorithm=PBKDF2_HMAC_SHA512');
          const dbKeyHex = await deriveKey(password, dbSalt);
          testDb.pragma(`key="x'${dbKeyHex}'"`);
          try {
            testDb.prepare('SELECT id FROM users WHERE id = 1').get();
          } catch {
            testDb.close();
            return { success: false, error: 'Backup contains an invalid or corrupted database.' };
          }
          testDb.close();
        } finally {
          await fs.unlink(tmpDbPath).catch(() => {});
        }

        stopPoller();
        clearExtensionSession();
        closeDatabase();

        await fs.writeFile(dbPath, dbBuf, { mode: 0o600 });
        await fs.writeFile(saltPath, dbSalt, { mode: 0o600 });

        // Restore screenshots only after the DB is confirmed and written.
        await fs.mkdir(screenshotsPath, { recursive: true });
        if (screensWritten) {
          for (const file of await fs.readdir(tmpScreensDir)) {
            const src = path.join(tmpScreensDir, file);
            const dst = path.join(screenshotsPath, file);
            try {
              await fs.rename(src, dst);
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
              await fs.copyFile(src, dst);
            }
          }
        }

        if (win) {
          win.setResizable(false);
          win.setMinimumSize(0, 0);
          win.setSize(AUTH_WIDTH, AUTH_HEIGHT, true);
          win.center();
        }
        win?.webContents.send('app:locked');

        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      } finally {
        if (screensWritten) await fs.rm(tmpScreensDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  );
}
