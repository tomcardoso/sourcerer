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

const AUTH_WIDTH = 560;
const AUTH_HEIGHT = 720;

// v3 inner payload: concatenated length-prefixed entries.
// Each entry: [4-byte LE name length][name bytes][4-byte LE data length][data bytes]

function packFiles(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const header = Buffer.allocUnsafe(8);
    header.writeUInt32LE(nameBuf.length, 0);
    header.writeUInt32LE(data.length, 4);
    parts.push(header, nameBuf, data);
  }
  return Buffer.concat(parts);
}

function unpackFiles(buf: Buffer): Array<{ name: string; data: Buffer }> {
  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;
  while (offset < buf.length) {
    const nameLen = buf.readUInt32LE(offset); offset += 4;
    const dataLen = buf.readUInt32LE(offset); offset += 4;
    const name = buf.subarray(offset, offset + nameLen).toString('utf8'); offset += nameLen;
    const data = buf.subarray(offset, offset + dataLen); offset += dataLen;
    entries.push({ name, data });
  }
  return entries;
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
        const entries: Array<{ name: string; data: Buffer }> = [
          { name: 'db.sqlite', data: await fs.readFile(dbPath) },
          { name: 'salt', data: dbSalt },
        ];
        try {
          for (const file of await fs.readdir(screenshotsPath)) {
            entries.push({ name: `screenshots/${file}`, data: await fs.readFile(path.join(screenshotsPath, file)) });
          }
        } catch { /* screenshots dir may not exist */ }

        const payload = packFiles(entries);

        const backupSalt = crypto.randomBytes(32);
        const backupKeyHex = await deriveKey(password, backupSalt);
        const backupKey = Buffer.from(backupKeyHex, 'hex');

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
        const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
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

        if (bundle.version !== 3) {
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

        const entries = unpackFiles(decrypted);
        const dbEntry = entries.find(e => e.name === 'db.sqlite');
        const saltEntry = entries.find(e => e.name === 'salt');
        if (!dbEntry || !saltEntry) return { success: false, error: 'Corrupted backup file.' };
        const dbBuf = dbEntry.data;
        const dbSalt = saltEntry.data;

        await fs.mkdir(screenshotsPath, { recursive: true });
        for (const { name, data } of entries) {
          if (name.startsWith('screenshots/')) {
            await fs.writeFile(path.join(screenshotsPath, path.basename(name)), data, { mode: 0o600 });
          }
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
