import { isDatabaseOpen, getDatabase } from './database';
import { runAutoBackup, getLastAutoBackupTime } from './ipc/auto-backup';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

let autoBackupInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoBackupTimer(): void {
  stopAutoBackupTimer();
  autoBackupInterval = setInterval(async () => {
    if (!isDatabaseOpen()) return;
    const db = getDatabase();
    const user = db
      .prepare('SELECT auto_backup_enabled, auto_backup_dest_path FROM users WHERE id = 1')
      .get() as { auto_backup_enabled: number; auto_backup_dest_path: string | null } | undefined;
    if (!user?.auto_backup_enabled || !user.auto_backup_dest_path) return;
    const lastMs = await getLastAutoBackupTime(user.auto_backup_dest_path);
    if (lastMs === null || Date.now() - lastMs >= ONE_DAY) {
      runAutoBackup().catch(() => {});
    }
  }, ONE_HOUR);
}

export function stopAutoBackupTimer(): void {
  if (autoBackupInterval) {
    clearInterval(autoBackupInterval);
    autoBackupInterval = null;
  }
}
