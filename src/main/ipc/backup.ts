import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import crypto from 'crypto';
import { promisify } from 'util';
import JSZip from 'jszip';
import Database from 'better-sqlite3-multiple-ciphers';
import { getPaths, deriveKey, filenameDateStamp } from '../utils';
import { closeDatabase, getKeyHex } from '../database';
import { stopPoller } from '../sync/poller';
import { clearExtensionSession } from '../http-server';

const gunzip = promisify(zlib.gunzip);

const AUTH_WIDTH = 560;
const AUTH_HEIGHT = 720;

async function buildBackupZip(dbPath: string, saltPath: string, screenshotsPath: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('db.sqlite', await fs.readFile(dbPath));
  zip.file('salt', await fs.readFile(saltPath));

  try {
    const files = await fs.readdir(screenshotsPath);
    for (const file of files) {
      zip.file(`screenshots/${file}`, await fs.readFile(path.join(screenshotsPath, file)));
    }
  } catch { /* screenshots dir may not exist */ }

  // STORE (no compression) — all contents are AES-encrypted and already incompressible
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

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
        const zipBuf = await buildBackupZip(dbPath, saltPath, screenshotsPath);

        const backupSalt = crypto.randomBytes(32);
        const backupKeyHex = await deriveKey(password, backupSalt);
        const backupKey = Buffer.from(backupKeyHex, 'hex');

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
        const ciphertext = Buffer.concat([cipher.update(zipBuf), cipher.final()]);
        const authTag = cipher.getAuthTag();

        const bundle = JSON.stringify({
          version: 3,
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
      const { dbPath, saltPath, screenshotsPath } = getPaths();
      const win = BrowserWindow.getFocusedWindow();

      const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        title: 'Restore from backup',
        filters: [{ name: 'Sourcerer Backup', extensions: ['sourcerer-backup'] }],
        properties: ['openFile'],
      });
      if (canceled || filePaths.length === 0) return { success: false, canceled: true };

      try {
        const MAX_BACKUP_BYTES = 2 * 1024 * 1024 * 1024;
        const stat = await fs.stat(filePaths[0]);
        if (stat.size > MAX_BACKUP_BYTES) {
          return { success: false, error: 'Backup file is too large (max 2 GB).' };
        }

        const raw = await fs.readFile(filePaths[0], 'utf-8');
        const bundle = JSON.parse(raw);

        if (bundle.version !== 2 && bundle.version !== 3) {
          return {
            success: false,
            error: 'This backup format is not supported. Please create a new backup.',
          };
        }

        if (!bundle.backup_salt || !bundle.iv || !bundle.auth_tag || !bundle.ciphertext) {
          return { success: false, error: 'Unrecognised backup format.' };
        }

        const backupSalt = Buffer.from(bundle.backup_salt, 'base64');
        const backupKeyHex = await deriveKey(password, backupSalt);
        const backupKey = Buffer.from(backupKeyHex, 'hex');

        let decrypted: Buffer;
        try {
          const iv = Buffer.from(bundle.iv, 'base64');
          const authTag = Buffer.from(bundle.auth_tag, 'base64');
          const ciphertext = Buffer.from(bundle.ciphertext, 'base64');
          const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey, iv);
          decipher.setAuthTag(authTag);
          decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        } catch {
          return { success: false, error: 'Incorrect password or corrupted backup.' };
        }

        let dbBuf: Buffer;
        let dbSalt: Buffer;

        if (bundle.version === 3) {
          const zip = await JSZip.loadAsync(decrypted);

          const dbEntry = zip.file('db.sqlite');
          const saltEntry = zip.file('salt');
          if (!dbEntry || !saltEntry) return { success: false, error: 'Corrupted backup file.' };

          dbBuf = await dbEntry.async('nodebuffer');
          dbSalt = await saltEntry.async('nodebuffer');

          // Restore screenshots
          await fs.mkdir(screenshotsPath, { recursive: true });
          for (const [name, entry] of Object.entries(zip.files)) {
            if (name.startsWith('screenshots/') && !entry.dir) {
              const buf = await entry.async('nodebuffer');
              await fs.writeFile(path.join(screenshotsPath, path.basename(name)), buf, { mode: 0o600 });
            }
          }
        } else {
          // v2: gzipped JSON payload
          const innerRaw = await gunzip(decrypted);
          const inner = JSON.parse(innerRaw.toString('utf-8'));
          if (!inner.db || !inner.salt) return { success: false, error: 'Corrupted backup file.' };
          dbBuf = Buffer.from(inner.db, 'base64');
          dbSalt = Buffer.from(inner.salt, 'base64');
        }

        // Verify the DB can be opened with the key derived from the backup password + DB salt.
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
        clearExtensionSession();
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
