import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { promisify } from 'util';
import Database from 'better-sqlite3-multiple-ciphers';
import { getPaths } from '../utils';
import { closeDatabase } from '../database';
import { stopPoller } from '../sync/poller';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const AUTH_WIDTH = 560;
const AUTH_HEIGHT = 720;

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:export', async (): Promise<{ success: boolean; error?: string }> => {
    const { dbPath, saltPath } = getPaths();

    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Export backup',
      defaultPath: `sourcerer-backup-${new Date().toISOString().slice(0, 10)}.sourcerer-backup`,
      filters: [{ name: 'Sourcerer Backup', extensions: ['sourcerer-backup'] }],
    });
    if (canceled || !filePath) return { success: false };

    try {
      const [db, salt] = await Promise.all([
        fs.readFile(dbPath),
        fs.readFile(saltPath),
      ]);

      const bundle = JSON.stringify({
        version: 1,
        created_at: Math.floor(Date.now() / 1000),
        db: db.toString('base64'),
        salt: salt.toString('base64'),
      });

      const compressed = await gzip(Buffer.from(bundle, 'utf-8'));
      await fs.writeFile(filePath, compressed);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('backup:restore', async (): Promise<{ success: boolean; canceled?: boolean; error?: string }> => {
    const { dbPath, saltPath } = getPaths();
    const win = BrowserWindow.getFocusedWindow();

    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Restore from backup',
      filters: [{ name: 'Sourcerer Backup', extensions: ['sourcerer-backup'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { success: false, canceled: true };

    try {
      // Reject suspiciously large files before buffering them in memory
      const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
      const stat = await fs.stat(filePaths[0]);
      if (stat.size > MAX_BACKUP_BYTES) {
        return { success: false, error: 'Backup file is too large (max 250 MB).' };
      }

      const compressed = await fs.readFile(filePaths[0]);
      const raw = await gunzip(compressed);
      const bundle = JSON.parse(raw.toString('utf-8'));

      if (bundle.version !== 1 || !bundle.db || !bundle.salt) {
        return { success: false, error: 'Unrecognised backup format.' };
      }

      const db = Buffer.from(bundle.db, 'base64');
      const salt = Buffer.from(bundle.salt, 'base64');

      // Verify the restored DB can be opened with the bundled salt before
      // overwriting the live installation.  We write to a temp file because
      // better-sqlite3 requires a real path.
      const tmpPath = path.join(os.tmpdir(), `sourcerer-restore-${Date.now()}.db`);
      try {
        await fs.writeFile(tmpPath, db, { mode: 0o600 });
        const testDb = new Database(tmpPath);
        testDb.pragma(`cipher='sqlcipher'`);
        // We can't verify with the user's current password because the backup
        // may have been created with a different one; just confirm it opens as
        // a valid SQLite/SQLCipher container by reading its page count.
        try {
          testDb.pragma('page_count');
        } catch {
          testDb.close();
          return { success: false, error: 'Backup contains an invalid or corrupted database.' };
        }
        testDb.close();
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
      }

      stopPoller();
      closeDatabase();

      await fs.writeFile(dbPath, db, { mode: 0o600 });
      await fs.writeFile(saltPath, salt, { mode: 0o600 });

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
    }
  });
}
