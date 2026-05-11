import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import crypto from 'crypto';
import { promisify } from 'util';
import Database from 'better-sqlite3-multiple-ciphers';
import { getPaths, deriveKey } from '../utils';
import { closeDatabase, getKeyHex } from '../database';
import { stopPoller } from '../sync/poller';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const AUTH_WIDTH = 560;
const AUTH_HEIGHT = 720;

export function registerBackupHandlers(): void {
  ipcMain.handle(
    'backup:export',
    async (_, { password }: { password: string }): Promise<{ success: boolean; error?: string }> => {
      const { dbPath, saltPath } = getPaths();

      // Verify the supplied password matches the active key before we encrypt the backup.
      const dbSalt = await fs.readFile(saltPath);
      const verifyKeyHex = await deriveKey(password, dbSalt);
      if (verifyKeyHex !== getKeyHex()) {
        return { success: false, error: 'Incorrect password.' };
      }

      const win = BrowserWindow.getFocusedWindow();
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        title: 'Export backup',
        defaultPath: `sourcerer-backup-${new Date().toISOString().slice(0, 10)}.sourcerer-backup`,
        filters: [{ name: 'Sourcerer Backup', extensions: ['sourcerer-backup'] }],
      });
      if (canceled || !filePath) return { success: false };

      try {
        const db = await fs.readFile(dbPath);

        // Inner bundle: DB + DB salt (needed to re-derive the DB key on restore)
        const innerJson = JSON.stringify({
          db: db.toString('base64'),
          salt: dbSalt.toString('base64'),
        });
        const compressed = await gzip(Buffer.from(innerJson, 'utf-8'));

        // Derive a separate backup key using a fresh random salt so the backup
        // can be decrypted on any machine using only the user's password.
        const backupSalt = crypto.randomBytes(32);
        const backupKeyHex = await deriveKey(password, backupSalt);
        const backupKey = Buffer.from(backupKeyHex, 'hex');

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
        const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
        const authTag = cipher.getAuthTag();

        const bundle = JSON.stringify({
          version: 2,
          backup_salt: backupSalt.toString('base64'),
          iv: iv.toString('base64'),
          auth_tag: authTag.toString('base64'),
          ciphertext: ciphertext.toString('base64'),
        });

        await fs.writeFile(filePath, Buffer.from(bundle, 'utf-8'));
        return { success: true };
      } catch (err) {
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
      const { dbPath, saltPath } = getPaths();
      const win = BrowserWindow.getFocusedWindow();

      const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        title: 'Restore from backup',
        filters: [{ name: 'Sourcerer Backup', extensions: ['sourcerer-backup'] }],
        properties: ['openFile'],
      });
      if (canceled || filePaths.length === 0) return { success: false, canceled: true };

      try {
        const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
        const stat = await fs.stat(filePaths[0]);
        if (stat.size > MAX_BACKUP_BYTES) {
          return { success: false, error: 'Backup file is too large (max 250 MB).' };
        }

        const raw = await fs.readFile(filePaths[0], 'utf-8');
        const bundle = JSON.parse(raw);

        if (bundle.version !== 2) {
          return {
            success: false,
            error: 'This backup format is not supported. Please create a new backup.',
          };
        }

        if (!bundle.backup_salt || !bundle.iv || !bundle.auth_tag || !bundle.ciphertext) {
          return { success: false, error: 'Unrecognised backup format.' };
        }

        // Derive the backup key and decrypt
        const backupSalt = Buffer.from(bundle.backup_salt, 'base64');
        const backupKeyHex = await deriveKey(password, backupSalt);
        const backupKey = Buffer.from(backupKeyHex, 'hex');

        let compressed: Buffer;
        try {
          const iv = Buffer.from(bundle.iv, 'base64');
          const authTag = Buffer.from(bundle.auth_tag, 'base64');
          const ciphertext = Buffer.from(bundle.ciphertext, 'base64');
          const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey, iv);
          decipher.setAuthTag(authTag);
          compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        } catch {
          return { success: false, error: 'Incorrect password or corrupted backup.' };
        }

        const innerRaw = await gunzip(compressed);
        const inner = JSON.parse(innerRaw.toString('utf-8'));

        if (!inner.db || !inner.salt) {
          return { success: false, error: 'Corrupted backup file.' };
        }

        const dbBuf = Buffer.from(inner.db, 'base64');
        const dbSalt = Buffer.from(inner.salt, 'base64');

        // Verify the DB can be opened with the key derived from the backup password + DB salt.
        // These must match because we verified the password against the active key at export time.
        const tmpPath = path.join(os.tmpdir(), `sourcerer-restore-${Date.now()}.db`);
        try {
          await fs.writeFile(tmpPath, dbBuf, { mode: 0o600 });
          const testDb = new Database(tmpPath);
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
          await fs.unlink(tmpPath).catch(() => {});
        }

        stopPoller();
        closeDatabase();

        await fs.writeFile(dbPath, dbBuf, { mode: 0o600 });
        await fs.writeFile(saltPath, dbSalt, { mode: 0o600 });

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
    },
  );
}
