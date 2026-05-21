import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getPaths, deriveKey } from '../utils';
import { getDatabase, isDatabaseOpen, getPassword } from '../database';

const BACKUP_PREFIX = 'sourcerer-auto-backup-';
const BACKUP_EXT = '.sourcerer-backup';

function timestampedName(): string {
  return `${BACKUP_PREFIX}${new Date().toISOString().replace(/:/g, '-')}${BACKUP_EXT}`;
}

export async function runAutoBackup(): Promise<{ success: boolean; error?: string }> {
  if (!isDatabaseOpen()) return { success: false, error: 'Database not open.' };

  const db = getDatabase();
  const user = db
    .prepare('SELECT auto_backup_enabled, auto_backup_dest_path, auto_backup_max_count FROM users WHERE id = 1')
    .get() as { auto_backup_enabled: number; auto_backup_dest_path: string | null; auto_backup_max_count: number } | undefined;

  if (!user?.auto_backup_enabled || !user.auto_backup_dest_path) {
    return { success: false };
  }

  const destPath = user.auto_backup_dest_path;
  const maxCount = user.auto_backup_max_count ?? 10;

  try {
    // Ensure the destination folder exists (user may have moved it)
    await fs.mkdir(destPath, { recursive: true });

    const { dbPath, saltPath, screenshotsPath } = getPaths();
    const password = getPassword();

    const entries: Array<{ name: string; data: Buffer }> = [
      { name: 'db.sqlite', data: await fs.readFile(dbPath) },
      { name: 'salt', data: await fs.readFile(saltPath) },
    ];
    try {
      for (const file of await fs.readdir(screenshotsPath)) {
        entries.push({ name: `screenshots/${file}`, data: await fs.readFile(path.join(screenshotsPath, file)) });
      }
    } catch { /* screenshots dir may not exist */ }

    const parts: Buffer[] = [];
    for (const { name, data } of entries) {
      const nameBuf = Buffer.from(name, 'utf8');
      const header = Buffer.allocUnsafe(8);
      header.writeUInt32LE(nameBuf.length, 0);
      header.writeUInt32LE(data.length, 4);
      parts.push(header, nameBuf, data);
    }
    const payload = Buffer.concat(parts);

    const backupSalt = crypto.randomBytes(32);
    const backupKeyHex = await deriveKey(password, backupSalt);
    const backupKey = Buffer.from(backupKeyHex, 'hex');

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const bundle = JSON.stringify({
      version: 1,
      backup_salt: backupSalt.toString('base64'),
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    });

    const outPath = path.join(destPath, timestampedName());
    await fs.writeFile(outPath, Buffer.from(bundle, 'utf-8'), { mode: 0o600 });

    // Prune old backups beyond maxCount
    const allFiles = await fs.readdir(destPath);
    const backupFiles = allFiles
      .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT))
      .sort()
      .reverse();
    for (const old of backupFiles.slice(maxCount)) {
      await fs.unlink(path.join(destPath, old)).catch(() => {});
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getLastAutoBackupTime(destPath: string): Promise<number | null> {
  try {
    const files = await fs.readdir(destPath);
    const backups = files
      .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT))
      .sort()
      .reverse();
    if (backups.length === 0) return null;
    const stat = await fs.stat(path.join(destPath, backups[0]));
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

export function registerAutoBackupHandlers(): void {
  ipcMain.handle('backup:run-auto', async (): Promise<{ success: boolean; error?: string }> => {
    return runAutoBackup();
  });
}
