import { useEffect, useRef, useState } from 'react';
import Button from '../shell/Button';
import Toggle from './SettingsToggle';

export default function BackupSection() {
  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [exportConfirm, setExportConfirm] = useState(false);
  const [backupSaved, setBackupSaved] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupDestPath, setAutoBackupDestPath] = useState<string | null>(null);
  const [autoBackupMaxCount, setAutoBackupMaxCount] = useState(10);
  const [autoBackupMaxCountInput, setAutoBackupMaxCountInput] = useState('10');
  const [autoBackupRunning, setAutoBackupRunning] = useState(false);
  const [autoBackupResult, setAutoBackupResult] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const backupSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackupResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.sourcerer.getAutoBackupSettings().then(({ enabled, destPath, maxCount }) => {
      setAutoBackupEnabled(enabled);
      setAutoBackupDestPath(destPath);
      setAutoBackupMaxCount(maxCount);
      setAutoBackupMaxCountInput(String(maxCount));
    });
    return () => {
      if (backupSavedTimerRef.current) clearTimeout(backupSavedTimerRef.current);
      if (autoBackupResultTimerRef.current) clearTimeout(autoBackupResultTimerRef.current);
    };
  }, []);

  async function handleExportBackup() {
    if (!exportPassword) return;
    setBackingUp(true);
    setBackupError(null);
    try {
      const result = await window.sourcerer.exportBackup(exportPassword);
      if (result.success) {
        setExportConfirm(false);
        setExportPassword('');
        setBackupSaved(true);
        if (backupSavedTimerRef.current) clearTimeout(backupSavedTimerRef.current);
        backupSavedTimerRef.current = setTimeout(() => setBackupSaved(false), 3000);
      } else if (result.error) {
        setBackupError(result.error);
      }
    } catch {
      setBackupError('Export failed. Please try again.');
    } finally {
      setBackingUp(false);
    }
  }

  async function handleRestoreBackup() {
    if (!restorePassword) return;
    setRestoringBackup(true);
    setRestoreError(null);
    try {
      const result = await window.sourcerer.restoreBackup(restorePassword);
      if (result.canceled) {
        setRestoreConfirm(false);
        setRestorePassword('');
        return;
      }
      if (!result.success) {
        setRestoreError(result.error ?? 'Restore failed.');
      }
    } catch {
      setRestoreError('Restore failed. Please try again.');
    } finally {
      setRestoringBackup(false);
    }
  }

  async function handleChooseBackupFolder() {
    const chosen = await window.sourcerer.chooseBackupFolder();
    if (!chosen) return;
    setAutoBackupDestPath(chosen);
    await window.sourcerer.setAutoBackupSettings({ destPath: chosen });
  }

  async function handleAutoBackupToggle(enabled: boolean) {
    setAutoBackupEnabled(enabled);
    await window.sourcerer.setAutoBackupSettings({ enabled });
  }

  async function handleAutoBackupMaxCountBlur() {
    const n = parseInt(autoBackupMaxCountInput, 10);
    if (!isNaN(n) && n >= 1) {
      setAutoBackupMaxCount(n);
      await window.sourcerer.setAutoBackupSettings({ maxCount: n });
    } else {
      setAutoBackupMaxCountInput(String(autoBackupMaxCount));
    }
  }

  async function handleRunAutoBackupNow() {
    setAutoBackupRunning(true);
    setAutoBackupResult(null);
    const result = await window.sourcerer.runAutoBackup();
    setAutoBackupRunning(false);
    setAutoBackupResult(result.success
      ? { kind: 'success', message: 'Backup saved.' }
      : { kind: 'error', message: result.error ?? 'Backup failed.' });
    if (autoBackupResultTimerRef.current) clearTimeout(autoBackupResultTimerRef.current);
    autoBackupResultTimerRef.current = setTimeout(() => setAutoBackupResult(null), 3000);
  }

  return (
    <>
      <div className="sv-section">
        <div className="sv-section-title">Backup</div>
        {!exportConfirm ? (
          <div className="sv-field">
            <div className="sv-backup-export-restore">
              <div className="sv-hint">
                Save your encrypted database as a <code>.sourcerer-backup</code> file. The backup is encrypted with your master password — only someone with your password can restore it.
              </div>
              <div className="sv-inline-actions">
                <Button variant="accent" size="sm" onClick={() => { setExportConfirm(true); setBackupError(null); setExportPassword(''); setBackupSaved(false); }}>
                  Export backup
                </Button>
                {backupSaved && <span className="sv-backup-saved">Backup saved.</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="sv-wipe-confirm">
            <p className="sv-wipe-warning">
              Enter your master password to encrypt the backup file.
            </p>
            <div className="sv-wipe-row">
              <input
                className="sv-input sv-backup-pw-input"
                type="password"
                placeholder="Master password"
                value={exportPassword}
                onChange={(e) => { setExportPassword(e.target.value); setBackupError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && exportPassword && !backingUp) handleExportBackup(); }}
                autoComplete="current-password"
                disabled={backingUp}
              />
              <Button
                variant="accent"
                size="sm"
                onClick={handleExportBackup}
                disabled={backingUp || !exportPassword}
              >
                {backingUp ? 'Exporting…' : 'Export backup'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setExportConfirm(false); setExportPassword(''); setBackupError(null); }}
                disabled={backingUp}
              >
                Cancel
              </Button>
            </div>
            {backupError && <div className="sv-error-inline">{backupError}</div>}
          </div>
        )}
        {!restoreConfirm ? (
          <div className="sv-field">
            <div>
              <div className="sv-hint">
                Restore a <code>.sourcerer-backup</code> file. Your current database will be permanently replaced.
              </div>
              <Button
                variant="accent"
                size="sm"
                onClick={() => { setRestoreConfirm(true); setRestoreError(null); setRestorePassword(''); }}
              >
                Restore from backup
              </Button>
              {restoreError && <div className="sv-error-inline">{restoreError}</div>}
            </div>
          </div>
        ) : (
          <div className="sv-wipe-confirm">
            <p className="sv-wipe-warning">
              Restoring a backup will permanently overwrite your current database and cannot be undone.
              Enter the master password used when the backup was created, then choose the file.
            </p>
            <div className="sv-wipe-row">
              <input
                className="sv-input"
                type="password"
                placeholder="Backup password"
                value={restorePassword}
                onChange={(e) => { setRestorePassword(e.target.value); setRestoreError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && restorePassword && !restoringBackup) handleRestoreBackup(); }}
                autoComplete="current-password"
                disabled={restoringBackup}
              />
              <Button
                variant="accent"
                size="sm"
                onClick={handleRestoreBackup}
                disabled={restoringBackup || !restorePassword}
              >
                {restoringBackup ? 'Restoring…' : 'Choose backup file…'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setRestoreConfirm(false); setRestorePassword(''); setRestoreError(null); }}
                disabled={restoringBackup}
              >
                Cancel
              </Button>
            </div>
            {restoreError && <div className="sv-error-inline">{restoreError}</div>}
          </div>
        )}
      </div>

      <div className="sv-section">
        <div className="sv-section-title">Automatic backups</div>
        <div className="sv-field">
          <div className="sv-hint">
            Choose a folder and Sourcerer will silently save an encrypted backup on every clean quit
            and once per day while the app is running. Backups use the same format as manual exports
            and can be restored using your master password.
          </div>
        </div>
        <div className="sv-field">
          <label className="sv-label">Backup folder</label>
          <div className="sv-row">
            <code className="sv-path-code">
              {autoBackupDestPath ?? 'No folder selected'}
            </code>
            <Button
              variant="accent"
              size="sm"
              onClick={handleChooseBackupFolder}
            >
              Choose folder…
            </Button>
          </div>
        </div>
        <Toggle
          checked={autoBackupEnabled}
          onChange={handleAutoBackupToggle}
          label="Enable automatic backups"
          hint={autoBackupDestPath ? undefined : 'Choose a backup folder first.'}
          disabled={!autoBackupDestPath}
        />
        <div className="sv-field sv-field--inline-row">
          <label className="sv-label">Max backups to keep</label>
          <div className="sv-inline-actions">
            <input
              className="sv-input sv-input--short"
              type="number"
              min={1}
              value={autoBackupMaxCountInput}
              onChange={(e) => setAutoBackupMaxCountInput(e.target.value)}
              onBlur={handleAutoBackupMaxCountBlur}
              disabled={!autoBackupDestPath || !autoBackupEnabled}
            />
            <Button
              variant="accent"
              size="sm"
              onClick={handleRunAutoBackupNow}
              disabled={autoBackupRunning || !autoBackupDestPath || !autoBackupEnabled}
            >
              {autoBackupRunning ? 'Backing up…' : 'Back up now'}
            </Button>
            {autoBackupResult && (
              <span className={autoBackupResult.kind === 'success' ? 'sv-backup-saved' : 'sv-error-inline'}>{autoBackupResult.message}</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
