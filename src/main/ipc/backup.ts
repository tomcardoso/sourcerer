import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';
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
      const compressed = await fs.readFile(filePaths[0]);
      const raw = await gunzip(compressed);
      const bundle = JSON.parse(raw.toString('utf-8'));

      if (bundle.version !== 1 || !bundle.db || !bundle.salt) {
        return { success: false, error: 'Unrecognised backup format.' };
      }

      const db = Buffer.from(bundle.db, 'base64');
      const salt = Buffer.from(bundle.salt, 'base64');

      stopPoller();
      closeDatabase();

      await fs.writeFile(dbPath, db);
      await fs.writeFile(saltPath, salt);

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
