import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getPaths, writeVaultConfig, deriveKey, detectSyncProvider } from '../utils';
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

  ipcMain.handle('setup:use-default-vault', async (): Promise<{ error: string } | null> => {
    const bundlePath = path.join(app.getPath('userData'), 'Vault.sourcerer');
    try {
      await fs.mkdir(bundlePath, { recursive: true });
      writeVaultConfig(bundlePath);
      return null;
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not create default vault folder.' };
    }
  });

  ipcMain.handle('setup:pick-vault-location', async (event): Promise<{ path: string } | { error: string } | null> => {
    const result = await dialog.showSaveDialog({
      title: 'Create vault',
      message: 'Choose where to save your Sourcerer vault',
      defaultPath: path.join(app.getPath('documents'), 'Vault'),
      buttonLabel: 'Create vault',
      filters: [{ name: 'Sourcerer Vault', extensions: ['sourcerer'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const bundlePath = result.filePath.toLowerCase().endsWith('.sourcerer')
      ? result.filePath
      : result.filePath + '.sourcerer';

    const alreadyHasVault = await fs
      .access(path.join(bundlePath, 'db.sqlite'))
      .then(() => true)
      .catch(() => false);
    if (alreadyHasVault) {
      return { error: 'That location already contains a vault. Use "Open existing vault…" to open it.' };
    }

    const provider = detectSyncProvider(bundlePath);
    if (provider) {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Cloud sync detected',
        message: `This location is inside ${provider}.`,
        detail: 'Sourcerer can store your vault here, but opening it on more than one device at the same time may corrupt your data.',
        buttons: ['Continue', 'Choose different location'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 1) return null;
    }

    try {
      await fs.mkdir(bundlePath, { recursive: true });
      writeVaultConfig(bundlePath);
      return { path: bundlePath };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not create vault folder.' };
    }
  });

  ipcMain.handle('setup:open-existing-vault', async (event): Promise<{ success: boolean; error?: string } | null> => {
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
      return { success: false, error: 'The selected folder does not contain a valid Sourcerer vault (db.sqlite and/or salt are missing).' };
    }

    const provider = detectSyncProvider(bundlePath);
    if (provider) {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Cloud sync detected',
        message: `This vault is inside ${provider}.`,
        detail: 'Sourcerer can use this vault, but opening it on more than one device at the same time may corrupt your data.',
        buttons: ['Continue', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 1) return null;
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
