import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';
import { getPaths } from '../utils';

const gzip = promisify(zlib.gzip);

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
}
