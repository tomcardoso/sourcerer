import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { is } from '@electron-toolkit/utils';
import { getPaths, deriveKey } from '../utils';
import { unlockDatabase, maybeRunDevSeeds, setActivePassword, isWrongKeyError, MigrationError } from '../database';
import { recordEvent, errorFacts, type UnlockStage } from '../diagnostics/trace';
import { autoLock } from '../auto-lock';
import { startPoller } from '../sync/poller';
import { startAutoBackupTimer } from '../auto-backup-timer';
import { checkOutreachReminders, clearOutreachNotificationCache } from '../sync/outreach-checker';
import { checkReminders, clearReminderNotificationCache } from '../sync/reminder-checker';
import { runDedupScan } from './contacts';
import type { UnlockResult } from '@shared/types';

type VaultFilesProblem = 'database-missing' | 'key-file-missing' | 'database-placeholder' | 'key-file-placeholder';

const VAULT_FILE_MESSAGES: Record<VaultFilesProblem, string> = {
  'database-missing': 'Database file not found. Your vault may have been moved or deleted.',
  'key-file-missing': 'Vault key file not found. Your vault may have been moved or deleted.',
  'database-placeholder': 'The database appears to be a cloud sync placeholder. Make sure your sync client has finished downloading the vault before unlocking.',
  'key-file-placeholder': 'The vault key file appears to be a cloud sync placeholder. Make sure your sync client has finished downloading the vault before unlocking.',
};

async function checkVaultFiles(dbPath: string, saltPath: string): Promise<VaultFilesProblem | null> {
  const [dbStat, saltStat] = await Promise.all([
    fs.stat(dbPath).catch(() => null),
    fs.stat(saltPath).catch(() => null),
  ]);
  if (!dbStat) return 'database-missing';
  if (!saltStat) return 'key-file-missing';
  // Cloud sync placeholder files are typically 0 bytes; a valid cipher database is at least one page (4096 bytes)
  if (dbStat.size < 4096) return 'database-placeholder';
  // The salt is always exactly 32 bytes
  if (saltStat.size !== 32) return 'key-file-placeholder';
  return null;
}

/** What the person is told when unlocking fails for a reason other than the
 *  password. Exported for tests. */
export function unlockFailureMessage(stage: UnlockStage, err: unknown): string {
  const { category } = errorFacts(err);
  const rebuildHint = is.dev ? ' If you are running Sourcerer from source, run npm run rebuild.' : ' Reinstalling Sourcerer may fix this.';
  if (category.startsWith('native-module')) {
    const part = stage === 'derive-key' ? 'its encryption component' : 'its database engine';
    return `Sourcerer couldn't load ${part}, so it couldn't check your password. This is a problem with the app, not your password.${rebuildHint}`;
  }
  if (stage === 'migrate') {
    return "Your password is correct, but Sourcerer couldn't update your vault for this version of the app.";
  }
  if (stage === 'start-session') {
    return 'Your password is correct, but Sourcerer ran into a problem while opening your vault.';
  }
  if (category === 'file-permission') {
    return "Sourcerer doesn't have permission to read your vault files, so it couldn't check your password.";
  }
  if (category === 'disk-full') {
    return "Your disk is full, so Sourcerer couldn't open your vault. Free up some space and try again.";
  }
  return "Sourcerer couldn't open your vault because of an unexpected error. Your password may well be correct.";
}

const APP_WIDTH = 1100;
const APP_HEIGHT = 720;

export function registerUnlockHandlers(): void {
  ipcMain.handle('unlock:attempt', async (event, password: string): Promise<UnlockResult> => {
    const { dbPath, saltPath } = getPaths();

    const problem = await checkVaultFiles(dbPath, saltPath);
    if (problem) {
      recordEvent('unlock-vault-files-problem', { detail: problem });
      return { success: false, reason: 'vault-files', error: VAULT_FILE_MESSAGES[problem] };
    }

    const wrongPassword = (): UnlockResult => {
      recordEvent('unlock-wrong-password');
      return { success: false, reason: 'wrong-password', error: 'Incorrect password.' };
    };

    // Only a key SQLCipher rejects counts as a wrong password. Anything else —
    // a native module built for another Node/Electron version, a failed
    // migration, a permissions error — is reported as what it is.
    let stage: UnlockStage = 'read-key-file';
    let db;
    try {
      let salt = await fs.readFile(saltPath);
      stage = 'derive-key';
      let keyHex = await deriveKey(password, salt);
      stage = 'open-database';

      // Recovery path: if a previous password change was interrupted after PRAGMA rekey
      // but before the atomic rename, a .tmp salt file remains.  Try it as a fallback
      // and, if it works, complete the rename so the state is fully consistent.
      try {
        db = unlockDatabase(dbPath, keyHex);
      } catch (err) {
        if (!isWrongKeyError(err)) throw err;
        const saltTmpPath = saltPath + '.tmp';
        const tmpExists = await fs.access(saltTmpPath).then(() => true).catch(() => false);
        if (!tmpExists) return wrongPassword();
        stage = 'read-key-file';
        salt = await fs.readFile(saltTmpPath);
        stage = 'derive-key';
        keyHex = await deriveKey(password, salt);
        stage = 'open-database';
        db = unlockDatabase(dbPath, keyHex);
        await fs.rename(saltTmpPath, saltPath);
      }
    } catch (err) {
      if (isWrongKeyError(err)) return wrongPassword();
      if (err instanceof MigrationError) stage = 'migrate';
      recordEvent('unlock-failed', { stage, error: err });
      return { success: false, reason: 'failed', error: unlockFailureMessage(stage, err) };
    }

    try {
      setActivePassword(password);
      maybeRunDevSeeds(db);

      const savedUser = db
        .prepare('SELECT idle_timeout_seconds, email FROM users WHERE id = 1')
        .get() as { idle_timeout_seconds: number; email: string } | undefined;

      const timeoutMs =
        (savedUser?.idle_timeout_seconds ?? 0) === 0
          ? Number.MAX_SAFE_INTEGER
          : (savedUser?.idle_timeout_seconds ?? 900) * 1000;
      autoLock.setIdleThreshold(timeoutMs);
      autoLock.resetInteraction();

      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.setResizable(true);
        win.setMinimumSize(800, 600);
        win.setSize(APP_WIDTH, APP_HEIGHT, true);
        win.center();
      }

      startPoller();
      startAutoBackupTimer();
      clearOutreachNotificationCache();
      clearReminderNotificationCache();
      checkOutreachReminders();
      checkReminders();
      runDedupScan();
    } catch (err) {
      // The database opened, so the password was right. Close everything this
      // attempt started (lock() also puts the window back to the lock-screen
      // size) rather than leaving the vault open behind the lock screen.
      recordEvent('unlock-failed', { stage: 'start-session', error: err });
      autoLock.lock();
      return { success: false, reason: 'failed', error: unlockFailureMessage('start-session', err) };
    }

    recordEvent('unlock-succeeded');
    return { success: true };
  });
}
