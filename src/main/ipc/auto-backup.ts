import { ipcMain } from 'electron';
import fs from 'fs/promises';
import { rename, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';
import path from 'path';
import os from 'os';
import { getPaths } from '../utils';
import { getDatabase, isDatabaseOpen, getPassword, snapshotDatabase } from '../database';
import { writeBackupFile, createBackupEntries } from './backup-format';

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

  let tmpSnapDir: string | undefined;
  try {
    // Ensure the destination folder exists (user may have moved it)
    await fs.mkdir(destPath, { recursive: true });

    const { saltPath, screenshotsPath } = getPaths();
    tmpSnapDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sourcerer-snap-'));
    const tmpSnapPath = path.join(tmpSnapDir, 'snapshot.db');
    snapshotDatabase(tmpSnapPath);
    const outPath = path.join(destPath, timestampedName());
    const tmpPath = path.join(destPath, `.tmp-${randomBytes(8).toString('hex')}`);
    try {
      await writeBackupFile(createBackupEntries(tmpSnapPath, saltPath, screenshotsPath), tmpPath, getPassword());
      await rename(tmpPath, outPath);
    } catch (err) {
      await unlink(tmpPath).catch(() => {});
      throw err;
    }

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
  } finally {
    if (tmpSnapDir) await fs.rm(tmpSnapDir, { recursive: true, force: true }).catch(() => {});
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
