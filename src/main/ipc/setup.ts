import { ipcMain, dialog, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getPaths, writeVaultConfig, deriveKey } from '../utils';
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

  ipcMain.handle('setup:pick-vault-location', async (): Promise<{ path: string } | null> => {
    const result = await dialog.showSaveDialog({
      title: 'Create vault',
      message: 'Choose where to save your Sourcerer vault',
      defaultPath: path.join(app.getPath('documents'), 'Sourcerer'),
      buttonLabel: 'Create vault',
      filters: [{ name: 'Sourcerer Vault', extensions: ['sourcerer'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const bundlePath = result.filePath.toLowerCase().endsWith('.sourcerer')
      ? result.filePath
      : result.filePath + '.sourcerer';
    await fs.mkdir(bundlePath, { recursive: true });
    writeVaultConfig(bundlePath);
    return { path: bundlePath };
  });

  ipcMain.handle('setup:open-existing-vault', async (): Promise<{ success: boolean; error?: string } | null> => {
    // On macOS, .sourcerer bundles appear as files; on other platforms they're plain directories.
    const isMac = process.platform === 'darwin';
    const result = await dialog.showOpenDialog({
      title: 'Open existing vault',
      ...(isMac ? { message: 'Choose your existing Sourcerer vault' } : {}),
      properties: [isMac ? 'openFile' : 'openDirectory'],
      ...(isMac ? { filters: [{ name: 'Sourcerer Vault', extensions: ['sourcerer'] }] } : {}),
      buttonLabel: 'Open vault',
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const bundlePath = result.filePaths[0];
    const dbExists = await fs.access(path.join(bundlePath, 'db.sqlite')).then(() => true).catch(() => false);
    const saltExists = await fs.access(path.join(bundlePath, 'salt')).then(() => true).catch(() => false);
    if (!dbExists || !saltExists) {
      return { success: false, error: 'The selected folder does not contain a valid Sourcerer vault (db.sqlite and salt are missing).' };
    }
    writeVaultConfig(bundlePath);
    return { success: true };
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
