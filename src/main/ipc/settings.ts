import { ipcMain, app, dialog, BrowserWindow, shell } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3-multiple-ciphers';
import { getDatabase, closeDatabase, updateActiveKeyHex, setActivePassword } from '../database';
import { getPaths, deriveKey, getVaultBundlePath, writeVaultConfig, clearVaultConfig, detectSyncProvider } from '../utils';
import { autoLock } from '../auto-lock';
import { setRssPollIntervalHours } from '../sync/poller';
import { validateEmail } from '@shared/validation';
import type { User } from '@shared/types';

export function registerSettingsHandlers(): void {
  ipcMain.handle(
    'users:update',
    (_, data: { firstName: string; lastName: string; email: string }): User => {
      const db = getDatabase();
      const newEmail = data.email.trim();
      if (!validateEmail(newEmail)) throw new Error('Invalid email address');
      const newName = `${data.firstName.trim()} ${data.lastName.trim()}`;
      const current = db
        .prepare('SELECT email, first_name, last_name FROM users WHERE id = 1')
        .get() as { email: string; first_name: string; last_name: string };
      const oldEmail = current.email;
      const oldName = `${current.first_name} ${current.last_name}`;

      db.transaction(() => {
        db.prepare('UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = 1').run(
          data.firstName.trim(),
          data.lastName.trim(),
          newEmail,
        );

        const now = Math.floor(Date.now() / 1000);

        if (newEmail !== oldEmail) {
          db.prepare('UPDATE project_reporters    SET email          = ?        WHERE email          = ?').run(newEmail, oldEmail);
          db.prepare('UPDATE project_memberships  SET reporter_email = ?, updated_at = ? WHERE reporter_email = ?').run(newEmail, now, oldEmail);
          db.prepare('UPDATE membership_reporters SET reporter_email = ?        WHERE reporter_email = ?').run(newEmail, oldEmail);
          // interaction_log_entries intentionally not updated — historical records
        }

        if (newName !== oldName) {
          db.prepare('UPDATE project_reporters   SET name          = ?                    WHERE name          = ? AND is_self = 1').run(newName, oldName);
          db.prepare('UPDATE project_memberships SET reporter_name = ?, updated_at = ?   WHERE reporter_name = ? AND reporter_email = ?').run(newName, now, oldName, newEmail);
        }
      })();

      return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
    },
  );

  ipcMain.handle('settings:get-idle-timeout', (): number => {
    const row = getDatabase()
      .prepare('SELECT idle_timeout_seconds FROM users WHERE id = 1')
      .get() as { idle_timeout_seconds: number };
    return row.idle_timeout_seconds;
  });

  ipcMain.handle('settings:set-idle-timeout', (_, seconds: number): void => {
    getDatabase()
      .prepare('UPDATE users SET idle_timeout_seconds = ? WHERE id = 1')
      .run(seconds);
    const ms = seconds === 0 ? Number.MAX_SAFE_INTEGER : seconds * 1000;
    autoLock.setIdleThreshold(ms);
  });

  ipcMain.handle('settings:set-staleness-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET staleness_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-staleness-threshold', (_, days: number): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET staleness_threshold_days = ? WHERE id = 1').run(Math.max(1, days));
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-outreach-reminders-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET outreach_reminders_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-outreach-require-interaction', (_, required: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET outreach_require_interaction = ? WHERE id = 1').run(required ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-rss-poll-interval', (_, hours: number): User => {
    const db = getDatabase();
    const clamped = Math.max(1, Math.floor(hours));
    db.prepare('UPDATE users SET rss_poll_interval_hours = ? WHERE id = 1').run(clamped);
    setRssPollIntervalHours(clamped);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle(
    'priority-options:set-interval',
    (_, { id, days }: { id: string; days: number | null }): void => {
      getDatabase()
        .prepare('UPDATE priority_options SET outreach_interval_days = ? WHERE id = ?')
        .run(days ?? null, id);
    },
  );

  ipcMain.handle('settings:set-alert-notifications-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET alert_notifications_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-reminder-notifications-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET reminder_notifications_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-phone-country', (_, country: string): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET phone_country = ? WHERE id = 1').run(country);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-wayback-enabled', (_, enabled: boolean): User => {
    const db = getDatabase();
    db.prepare('UPDATE users SET wayback_enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle('settings:set-archive-keys', (_, { accessKey, secretKey }: { accessKey: string; secretKey: string }): User => {
    if (typeof accessKey !== 'string' || typeof secretKey !== 'string') {
      throw new Error('Invalid archive key payload');
    }
    const db = getDatabase();
    db.prepare('UPDATE users SET archive_access_key = ?, archive_secret_key = ? WHERE id = 1')
      .run(accessKey.trim() || null, secretKey.trim() || null);
    return db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
  });

  ipcMain.handle(
    'settings:change-password',
    async (_, { currentPassword, newPassword }: { currentPassword: string; newPassword: string }): Promise<{ success: boolean; error?: string }> => {
      const { dbPath, saltPath } = getPaths();
      try {
        // Verify the current password against the existing salt
        const salt = await fs.readFile(saltPath);
        const currentKeyHex = await deriveKey(currentPassword, salt);

        const testDb = new Database(dbPath);
        testDb.pragma(`cipher='sqlcipher'`);
        testDb.pragma('cipher_page_size=4096');
        testDb.pragma('kdf_iter=256000');
        testDb.pragma('cipher_hmac_algorithm=HMAC_SHA512');
        testDb.pragma('cipher_kdf_algorithm=PBKDF2_HMAC_SHA512');
        testDb.pragma(`key="x'${currentKeyHex}'"`);
        try {
          // pragma('user_version') doesn't force a page decrypt; an actual
          // table read is required to reliably detect a wrong key.
          testDb.prepare('SELECT id FROM users WHERE id = 1').get();
        } catch {
          testDb.close();
          return { success: false, error: 'Current password is incorrect.' };
        }
        testDb.close();

        // Derive new key with a fresh salt
        const newSalt = crypto.randomBytes(32);
        const newKeyHex = await deriveKey(newPassword, newSalt);

        // Write the new salt to a temp path first so that if the process crashes
        // between rekey and rename, unlock.ts can detect and recover the pending salt.
        const saltTmpPath = saltPath + '.tmp';
        await fs.writeFile(saltTmpPath, newSalt, { mode: 0o600 });

        // Rekey the active database connection in-place.
        const db = getDatabase();
        db.pragma(`rekey="x'${newKeyHex}'"`);


        // Update the in-memory key and password so screenshot encryption and auto-backups keep working
        updateActiveKeyHex(newKeyHex);
        setActivePassword(newPassword);

        // Atomic rename completes the operation; if this fails the .tmp file
        // serves as a recovery signal on the next unlock attempt.
        await fs.rename(saltTmpPath, saltPath);

        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'An unexpected error occurred.' };
      }
    },
  );

  ipcMain.handle('settings:get-calendar-url', (): string => {
    const db = getDatabase();
    const { calendar_token } = db.prepare('SELECT calendar_token FROM users WHERE id = 1').get() as { calendar_token: string };
    return `webcal://localhost:27371/calendar/reminders.ics?token=${calendar_token}`;
  });

  ipcMain.handle('settings:regenerate-calendar-token', (): User => {
    const db = getDatabase();
    const token = uuidv4();
    db.prepare('UPDATE users SET calendar_token = ? WHERE id = 1').run(token);
    return db
      .prepare(
        `SELECT id, first_name, last_name, email, created_at, idle_timeout_seconds,
                phone_country, outreach_reminders_enabled, outreach_require_interaction,
                staleness_enabled, staleness_threshold_days, alert_notifications_enabled,
                reminder_notifications_enabled, rss_poll_interval_hours, wayback_enabled,
                archive_access_key, archive_secret_key
         FROM users WHERE id = 1`,
      )
      .get() as User;
  });

  ipcMain.handle('settings:get-vault-path', (): string => {
    return getVaultBundlePath() ?? app.getPath('userData');
  });

  ipcMain.handle('settings:reveal-vault', (): void => {
    const bundlePath = getVaultBundlePath();
    if (bundlePath) {
      shell.showItemInFolder(bundlePath);
    } else {
      shell.openPath(app.getPath('userData'));
    }
  });

  ipcMain.handle('settings:move-vault', async (event): Promise<{ success: boolean; error?: string; newPath?: string }> => {
    const result = await dialog.showSaveDialog({
      title: 'Move vault',
      message: 'Choose where to move your Sourcerer vault',
      defaultPath: path.join(app.getPath('documents'), 'Vault'),
      buttonLabel: 'Move vault here',
      filters: [{ name: 'Sourcerer Vault', extensions: ['sourcerer'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };
    const newBundlePath = result.filePath.toLowerCase().endsWith('.sourcerer')
      ? result.filePath
      : result.filePath + '.sourcerer';

    const provider = detectSyncProvider(newBundlePath);
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
      if (response === 1) return { success: false };
    }

    const oldBundlePath = getVaultBundlePath();
    const { dbPath, saltPath, screenshotsPath } = getPaths();

    const newNorm = newBundlePath.replace(/\\/g, '/');
    const oldNorm = (oldBundlePath ?? '').replace(/\\/g, '/');
    if (oldNorm && newNorm === oldNorm) return { success: false };

    const destHasVault = await fs
      .access(path.join(newBundlePath, 'db.sqlite'))
      .then(() => true)
      .catch(() => false);
    if (destHasVault) {
      return { success: false, error: 'That location already contains a vault.' };
    }

    try {
      await fs.mkdir(newBundlePath, { recursive: true });

      // Use SQLite's online backup API to copy the live database consistently
      // without closing the connection first.
      await getDatabase().backup(path.join(newBundlePath, 'db.sqlite'));
      await fs.cp(saltPath, path.join(newBundlePath, 'salt'), { force: true });

      // Copy screenshots directory if it exists
      const screenshotsDest = path.join(newBundlePath, 'screenshots');
      await fs.cp(screenshotsPath, screenshotsDest, { recursive: true, force: true }).catch(() => {});

      writeVaultConfig(newBundlePath);

      // Lock only after everything succeeded so the user isn't locked out on failure
      autoLock.lock();
      closeDatabase();

      // Clean up old vault location — non-fatal if this fails
      try {
        if (oldBundlePath) {
          if (!newNorm.startsWith(oldNorm + '/')) {
            await fs.rm(oldBundlePath, { recursive: true, force: true });
          }
        } else {
          await fs.unlink(dbPath).catch(() => {});
          await fs.unlink(saltPath).catch(() => {});
          await fs.rm(screenshotsPath, { recursive: true, force: true }).catch(() => {});
        }
      } catch { /* move succeeded; cleanup failure is non-fatal */ }

      return { success: true, newPath: newBundlePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Move failed.' };
    }
  });

  ipcMain.handle('settings:panic-wipe', async (): Promise<void> => {
    const { dbPath, saltPath, screenshotsPath } = getPaths();

    closeDatabase();

    // Overwrite sensitive files before unlinking so the data is not trivially
    // recoverable from unallocated sectors.
    async function secureDelete(filePath: string): Promise<void> {
      try {
        const stat = await fs.stat(filePath);
        const fh = await fs.open(filePath, 'r+');
        try {
          await fh.write(crypto.randomBytes(stat.size), 0, stat.size, 0);
          await fh.datasync();
        } finally {
          await fh.close();
        }
      } catch { /* file may not exist */ }
      await fs.unlink(filePath).catch(() => {});
    }

    await secureDelete(dbPath);
    await secureDelete(saltPath);

    // Remove encrypted screenshots
    await fs.rm(screenshotsPath, { recursive: true, force: true }).catch(() => {});

    // Remove the vault bundle directory itself if one was configured
    const bundlePath = getVaultBundlePath();
    if (bundlePath) await fs.rm(bundlePath, { recursive: true, force: true }).catch(() => {});

    clearVaultConfig();
    app.quit();
  });

  ipcMain.handle('settings:get-auto-backup', (): { enabled: boolean; destPath: string | null; maxCount: number } => {
    const row = getDatabase()
      .prepare('SELECT auto_backup_enabled, auto_backup_dest_path, auto_backup_max_count FROM users WHERE id = 1')
      .get() as { auto_backup_enabled: number; auto_backup_dest_path: string | null; auto_backup_max_count: number } | undefined;
    return {
      enabled: (row?.auto_backup_enabled ?? 0) !== 0,
      destPath: row?.auto_backup_dest_path ?? null,
      maxCount: row?.auto_backup_max_count ?? 10,
    };
  });

  ipcMain.handle(
    'settings:set-auto-backup',
    (_, data: { enabled?: boolean; destPath?: string | null; maxCount?: number }): void => {
      const db = getDatabase();
      if (data.enabled !== undefined) {
        db.prepare('UPDATE users SET auto_backup_enabled = ? WHERE id = 1').run(data.enabled ? 1 : 0);
      }
      if (data.destPath !== undefined) {
        db.prepare('UPDATE users SET auto_backup_dest_path = ? WHERE id = 1').run(data.destPath ?? null);
      }
      if (data.maxCount !== undefined) {
        db.prepare('UPDATE users SET auto_backup_max_count = ? WHERE id = 1').run(Math.max(1, data.maxCount));
      }
    },
  );

  ipcMain.handle('settings:choose-backup-folder', async (): Promise<string | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose backup folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });
}
