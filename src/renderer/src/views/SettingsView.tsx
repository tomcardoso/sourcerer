import { useEffect, useMemo, useState } from 'react';
import { getCountries, getCountryCallingCode } from 'libphonenumber-js';
import type { User } from '@shared/types';
import './View.css';
import './SettingsView.css';

interface Props {
  user: User | null;
  onUserUpdated: (user: User) => void;
}


const TIMEOUT_OPTIONS = [
  { label: '1 minute', seconds: 60 },
  { label: '5 minutes', seconds: 300 },
  { label: '15 minutes', seconds: 900 },
  { label: '30 minutes', seconds: 1800 },
  { label: '1 hour', seconds: 3600 },
  { label: 'Never', seconds: 0 },
];

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className={`sv-toggle-row${hint ? ' sv-toggle-row--has-hint' : ''}`}>
      <button
        type="button"
        className={`sv-toggle${checked ? ' sv-toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span className="sv-toggle-knob" />
        <span className="sv-toggle-label">{checked ? 'ON' : 'OFF'}</span>
      </button>
      <div>
        <div className="sv-toggle-text">{label}</div>
        {hint && <div className="sv-hint sv-hint--inline">{hint}</div>}
      </div>
    </div>
  );
}

export default function SettingsView({ user, onUserUpdated }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [idleTimeout, setIdleTimeout] = useState<number>(900);
  const [phoneCountry, setPhoneCountry] = useState<string>('CA');
  const [outreachRemindersEnabled, setOutreachRemindersEnabled] = useState<boolean>(true);
  const [outreachRequireInteraction, setOutreachRequireInteraction] = useState<boolean>(true);
  const [alertNotificationsEnabled, setAlertNotificationsEnabled] = useState<boolean>(true);
  const [reminderNotificationsEnabled, setReminderNotificationsEnabled] = useState<boolean>(true);
  const [rssPollIntervalHours, setRssPollIntervalHours] = useState<number>(6);
  const [waybackEnabled, setWaybackEnabled] = useState<boolean>(true);
  const [stalenessEnabled, setStalenessEnabled] = useState<boolean>(true);
  const [stalenessThreshold, setStalenessThreshold] = useState<number>(90);
  const [stalenessThresholdInput, setStalenessThresholdInput] = useState<string>('90');
  const [calendarRegenConfirm, setCalendarRegenConfirm] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [exportConfirm, setExportConfirm] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [panicWipeConfirm, setPanicWipeConfirm] = useState(false);
  const [panicWipeInput, setPanicWipeInput] = useState('');
  const [panicWiping, setPanicWiping] = useState(false);
  const [screenshotFolderBytes, setScreenshotFolderBytes] = useState<number>(0);

  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupDestPath, setAutoBackupDestPath] = useState<string | null>(null);
  const [autoBackupMaxCount, setAutoBackupMaxCount] = useState(10);
  const [autoBackupMaxCountInput, setAutoBackupMaxCountInput] = useState('10');
  const [autoBackupRunning, setAutoBackupRunning] = useState(false);
  const [autoBackupResult, setAutoBackupResult] = useState<string | null>(null);

  const countryOptions = useMemo(() => {
    const names = new Intl.DisplayNames([navigator.language], { type: 'region' });
    return getCountries()
      .map((code) => ({
        code,
        name: names.of(code) ?? code,
        calling: getCountryCallingCode(code),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
      setEmail(user.email);
      setPhoneCountry(user.phone_country ?? 'CA');
      setOutreachRemindersEnabled(user.outreach_reminders_enabled !== 0);
      setOutreachRequireInteraction(user.outreach_require_interaction !== 0);
      setAlertNotificationsEnabled(user.alert_notifications_enabled !== 0);
      setReminderNotificationsEnabled(user.reminder_notifications_enabled !== 0);
      setStalenessEnabled(user.staleness_enabled !== 0);
      setStalenessThreshold(user.staleness_threshold_days ?? 90);
      setStalenessThresholdInput(String(user.staleness_threshold_days ?? 90));
      setRssPollIntervalHours(user.rss_poll_interval_hours ?? 6);
      setWaybackEnabled(user.wayback_enabled !== 0);
    }
    window.sourcerer.getIdleTimeout().then(setIdleTimeout);
    window.sourcerer.getCalendarUrl().then(setCalendarUrl);
    window.sourcerer.getScreenshotFolderSize().then(setScreenshotFolderBytes);
    window.sourcerer.getAutoBackupSettings().then(({ enabled, destPath, maxCount }) => {
      setAutoBackupEnabled(enabled);
      setAutoBackupDestPath(destPath);
      setAutoBackupMaxCount(maxCount);
      setAutoBackupMaxCountInput(String(maxCount));
    });
  }, [user?.id]);

  async function handleProfileSave() {
    if (!firstName.trim() || !email.trim()) return;
    setProfileSaving(true);
    try {
      const updated = await window.sourcerer.updateUser({ firstName, lastName, email });
      onUserUpdated(updated);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 12) {
      setPasswordResult({ ok: false, msg: 'New password must be at least 12 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordResult({ ok: false, msg: 'New passwords do not match.' });
      return;
    }
    setPasswordSaving(true);
    setPasswordResult(null);
    try {
      const result = await window.sourcerer.changePassword(currentPassword, newPassword);
      if (result.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordResult({ ok: true, msg: 'Password updated successfully.' });
      } else {
        setPasswordResult({ ok: false, msg: result.error ?? 'Failed to change password.' });
      }
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleExportBackup() {
    if (!exportPassword) return;
    setBackingUp(true);
    setBackupError(null);
    const result = await window.sourcerer.exportBackup(exportPassword);
    setBackingUp(false);
    if (result.success) {
      setExportConfirm(false);
      setExportPassword('');
    } else if (result.error) {
      setBackupError(result.error);
    }
  }

  async function handleRestoreBackup() {
    if (!restorePassword) return;
    setRestoringBackup(true);
    setRestoreError(null);
    const result = await window.sourcerer.restoreBackup(restorePassword);
    setRestoringBackup(false);
    if (result.canceled) {
      setRestoreConfirm(false);
      setRestorePassword('');
      return;
    }
    if (!result.success) {
      setRestoreError(result.error ?? 'Restore failed.');
    }
  }

  async function handlePanicWipe() {
    if (panicWipeInput !== 'WIPE') return;
    setPanicWiping(true);
    await window.sourcerer.panicWipe();
  }

  async function handleRegenerateToken() {
    const updated = await window.sourcerer.regenerateCalendarToken();
    onUserUpdated(updated);
    const url = await window.sourcerer.getCalendarUrl();
    setCalendarUrl(url);
    setCalendarRegenConfirm(false);
  }

  async function handleTimeoutChange(seconds: number) {
    setIdleTimeout(seconds);
    await window.sourcerer.setIdleTimeout(seconds);
  }

  async function handleStalenessToggle(enabled: boolean) {
    setStalenessEnabled(enabled);
    const updated = await window.sourcerer.setStalenessEnabled(enabled);
    onUserUpdated(updated);
  }

  async function handleStalenessThresholdBlur() {
    const days = parseInt(stalenessThresholdInput, 10);
    if (!isNaN(days) && days > 0 && days !== stalenessThreshold) {
      setStalenessThreshold(days);
      const updated = await window.sourcerer.setStalenessThreshold(days);
      onUserUpdated(updated);
    } else {
      setStalenessThresholdInput(String(stalenessThreshold));
    }
  }

  async function handleAlertNotificationsToggle(enabled: boolean) {
    setAlertNotificationsEnabled(enabled);
    const updated = await window.sourcerer.setAlertNotificationsEnabled(enabled);
    onUserUpdated(updated);
  }

  async function handleRssPollIntervalChange(hours: number) {
    setRssPollIntervalHours(hours);
    const updated = await window.sourcerer.setRssPollInterval(hours);
    onUserUpdated(updated);
  }

  async function handleWaybackToggle(enabled: boolean) {
    setWaybackEnabled(enabled);
    const updated = await window.sourcerer.setWaybackEnabled(enabled);
    onUserUpdated(updated);
  }

  async function handleReminderNotificationsToggle(enabled: boolean) {
    setReminderNotificationsEnabled(enabled);
    const updated = await window.sourcerer.setReminderNotificationsEnabled(enabled);
    onUserUpdated(updated);
  }

  async function handleOutreachToggle(enabled: boolean) {
    setOutreachRemindersEnabled(enabled);
    const updated = await window.sourcerer.setOutreachRemindersEnabled(enabled);
    onUserUpdated(updated);
  }

  async function handleOutreachRequireInteractionToggle(required: boolean) {
    setOutreachRequireInteraction(required);
    const updated = await window.sourcerer.setOutreachRequireInteraction(required);
    onUserUpdated(updated);
  }

  async function handlePhoneCountryChange(country: string) {
    setPhoneCountry(country);
    const updated = await window.sourcerer.setPhoneCountry(country);
    onUserUpdated(updated);
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
    setAutoBackupResult(result.success ? 'Backup saved.' : (result.error ?? 'Backup failed.'));
    setTimeout(() => setAutoBackupResult(null), 4000);
  }

  const profileDirty =
    user &&
    (firstName !== user.first_name || lastName !== user.last_name || email !== user.email);

  return (
    <div className="view">
      <div className="view-header">
        <p className="view-kicker">Settings</p>
        <h1 className="view-headline">Preferences</h1>
        <div className="view-rule-thick" />
        <div className="view-rule-thin" />
      </div>

      <div className="sv-body">
        {/* Profile */}
        <div className="sv-section">
          <div className="sv-section-title">Profile</div>
          <p className="sv-hint">Your name and email are attached to notes and interactions you log across projects.</p>
          <div className="sv-fields">
            <div className="sv-field">
              <label className="sv-label">First name</label>
              <input
                className="sv-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleProfileSave(); }}
              />
            </div>
            <div className="sv-field">
              <label className="sv-label">Last name</label>
              <input
                className="sv-input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleProfileSave(); }}
              />
            </div>
            <div className="sv-field sv-field--full">
              <label className="sv-label">Email</label>
              <input
                className="sv-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleProfileSave(); }}
              />
            </div>
          </div>
          <div className="sv-profile-actions">
            <button
              className="sv-save-btn"
              onClick={handleProfileSave}
              disabled={profileSaving || !profileDirty || !firstName.trim() || !email.trim()}
            >
              {profileSaved ? 'Saved!' : profileSaving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>

        {/* Security */}
        <div className="sv-section">
          <div className="sv-section-title">Security</div>
          <p className="sv-hint">
            Change your Sourcerer password. You'll need to enter your current password to confirm the change.
          </p>
          <div className="sv-fields">
            <div className="sv-field sv-field--full">
              <label className="sv-label">Current password</label>
              <input
                className="sv-input"
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordResult(null); }}
                autoComplete="current-password"
              />
            </div>
            <div className="sv-field">
              <label className="sv-label">New password</label>
              <input
                className="sv-input"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordResult(null); }}
                autoComplete="new-password"
              />
            </div>
            <div className="sv-field">
              <label className="sv-label">Confirm new password</label>
              <input
                className="sv-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordResult(null); }}
                autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }}
              />
            </div>
          </div>
          <p className="sv-hint sv-hint--small">
            Minimum 12 characters. Tip: a passphrase like "coral fence orbit lamp" is easier to remember and just as strong.
          </p>
          {passwordResult && (
            <p className={passwordResult.ok ? 'sv-success' : 'sv-error-inline'}>
              {passwordResult.msg}
            </p>
          )}
          <div className="sv-profile-actions">
            <button
              className="sv-save-btn"
              onClick={handleChangePassword}
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
            >
              {passwordSaving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </div>

        {/* Staleness */}
        <div className="sv-section">
          <div className="sv-section-title">Contact staleness</div>
          <p className="sv-hint">
            Contacts with no interaction or outreach logged within the threshold will show a subtle amber indicator in the contacts table.
          </p>
          <Toggle
            checked={stalenessEnabled}
            onChange={handleStalenessToggle}
            label="Enable staleness indicator"
          />
          {stalenessEnabled && (
            <div className="sv-field sv-staleness-threshold">
              <div className="sv-inline-field">
                <label className="sv-label sv-label--inline">Stale after</label>
                <input
                  type="number"
                  className="sv-input sv-threshold-input"
                  min={1}
                  value={stalenessThresholdInput}
                  onChange={(e) => setStalenessThresholdInput(e.target.value)}
                  onBlur={handleStalenessThresholdBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
                <span className="sv-inline-label">days without contact</span>
              </div>
            </div>
          )}
        </div>

        {/* Outreach reminders */}
        <div className="sv-section">
          <div className="sv-section-title">Outreach reminders</div>
          <p className="sv-hint">
            Get a native notification when a contact hasn't been contacted within their priority's reminder interval. Configure intervals per priority level above. Reminders can be disabled per-contact in the contact's project tab.
          </p>
          <Toggle
            checked={outreachRemindersEnabled}
            onChange={handleOutreachToggle}
            label="Enable outreach reminders"
          />
          <Toggle
            checked={outreachRequireInteraction}
            onChange={handleOutreachRequireInteractionToggle}
            label="Start clock after first interaction"
            hint="When on, outreach reminders won't appear until at least one interaction has been logged for a source. When off, the clock starts as soon as a priority is assigned."
          />
        </div>

        {/* Google Alerts */}
        <div className="sv-section">
          <div className="sv-section-title">Google alerts</div>
          <p className="sv-hint">
            Sourcerer polls RSS feeds for each contact's Google Alert. Control how often it checks.
          </p>
          <div className="sv-field">
            <label className="sv-label">Check every</label>
            <select
              className="sv-select"
              value={rssPollIntervalHours}
              onChange={(e) => handleRssPollIntervalChange(Number(e.target.value))}
            >
              <option value={1}>1 hour</option>
              <option value={3}>3 hours</option>
              <option value={6}>6 hours (default)</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
            </select>
          </div>
        </div>

        {/* Notifications */}
        <div className="sv-section">
          <div className="sv-section-title">Notifications</div>
          <p className="sv-hint">
            Control which events trigger OS-level notifications.
          </p>
          <Toggle
            checked={alertNotificationsEnabled}
            onChange={handleAlertNotificationsToggle}
            label="Alert mentions"
          />
          <Toggle
            checked={reminderNotificationsEnabled}
            onChange={handleReminderNotificationsToggle}
            label="Reminders"
          />
        </div>

        {/* Security */}
        <div className="sv-section">
          <div className="sv-section-title">Security</div>
          <p className="sv-hint">Sourcerer will lock itself and require your password after a period of inactivity.</p>
          <div className="sv-field">
            <label className="sv-label">Auto-lock after</label>
            <select
              className="sv-select"
              value={idleTimeout}
              onChange={(e) => handleTimeoutChange(Number(e.target.value))}
            >
              {TIMEOUT_OPTIONS.map((o) => (
                <option key={o.seconds} value={o.seconds}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Phone formatting */}
        <div className="sv-section">
          <div className="sv-section-title">Phone numbers</div>
          <p className="sv-hint">
            Numbers entered without a country code (e.g. 07911 123456) will be interpreted as belonging to this country and stored in E.164 format.
          </p>
          <div className="sv-field">
            <label className="sv-label">Default country</label>
            <select
              className="sv-select"
              value={phoneCountry}
              onChange={(e) => handlePhoneCountryChange(e.target.value)}
            >
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} (+{c.calling})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Website archiving */}
        <div className="sv-section">
          <div className="sv-section-title">Website archiving</div>
          <p className="sv-hint">
            When enabled, adding or updating a contact&apos;s website URL sends that URL to the
            Internet Archive (archive.org) as an outbound network request. This creates a public
            snapshot of the page but discloses the URL to a third party.
          </p>
          <Toggle
            checked={waybackEnabled}
            onChange={handleWaybackToggle}
            label="Submit URLs to the Wayback Machine"
          />
        </div>

        {/* Calendar */}
        <div className="sv-section">
          <div className="sv-section-title">Calendar subscription</div>
          <p className="sv-hint">
            Subscribe to this URL in any local calendar app (Apple Calendar, Outlook, Thunderbird, and others) to see your Sourcerer reminders. This link will only work on this machine while Sourcerer is running.
          </p>
          <div className="sv-calendar-url-row">
            <input
              className="sv-input sv-calendar-url"
              readOnly
              value={calendarUrl}
            />
            <button
              className="sv-copy-btn"
              onClick={() => {
                if (calendarUrl) navigator.clipboard.writeText(calendarUrl);
              }}
            >
              Copy
            </button>
          </div>
          {calendarRegenConfirm ? (
            <div className="sv-regen-confirm">
              <span>This invalidates your existing calendar subscription. Continue?</span>
              <button className="sv-save-btn" onClick={handleRegenerateToken}>Yes, regenerate</button>
              <button className="sv-cancel-small-btn" onClick={() => setCalendarRegenConfirm(false)}>Cancel</button>
            </div>
          ) : (
            <button className="sv-add-btn" onClick={() => setCalendarRegenConfirm(true)}>
              Regenerate token
            </button>
          )}
        </div>

        {/* Screenshots storage */}
        <div className="sv-section">
          <div className="sv-section-title">Screenshot storage</div>
          <p className="sv-hint">
            Encrypted screenshots are stored locally on this machine. The folder is separate from the database.
          </p>
          <div className="sv-storage-row">
            <span className="sv-storage-size">
              {screenshotFolderBytes >= 1024 * 1024 * 1024
                ? `${(screenshotFolderBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
                : screenshotFolderBytes >= 1024 * 1024
                ? `${(screenshotFolderBytes / (1024 * 1024)).toFixed(1)} MB`
                : `${(screenshotFolderBytes / 1024).toFixed(0)} KB`}
            </span>
            <button className="sv-add-btn" onClick={async () => { try { await window.sourcerer.openScreenshotFolder(); } catch (err) { console.error('Failed to open screenshot folder:', err); } }}>
              Open folder
            </button>
          </div>
          {screenshotFolderBytes >= 1024 * 1024 * 1024 && (
            <div className="sv-storage-warning">
              ⚠ Screenshot folder exceeds 1 GB. Open the folder to review and delete files manually.
            </div>
          )}
        </div>

        {/* Backup */}
        <div className="sv-section">
          <div className="sv-section-title">Backup</div>
          {!exportConfirm ? (
            <div className="sv-field">
              <div className="sv-backup-export-restore">
                <div className="sv-hint">
                  Save your encrypted database as a <code>.sourcerer-backup</code> file. The backup is encrypted with your master password — only someone with your password can restore it.
                </div>
                <button className="sv-save-btn" onClick={() => { setExportConfirm(true); setBackupError(null); setExportPassword(''); }}>
                  Export backup
                </button>
              </div>
            </div>
          ) : (
            <div className="sv-wipe-confirm">
              <p className="sv-wipe-warning">
                Enter your master password to encrypt the backup file.
              </p>
              <input
                className="sv-input"
                type="password"
                placeholder="Master password"
                value={exportPassword}
                onChange={(e) => { setExportPassword(e.target.value); setBackupError(null); }}
                autoComplete="current-password"
                disabled={backingUp}
              />
              <div className="sv-wipe-row">
                <button
                  className="sv-wipe-confirm-btn"
                  onClick={handleExportBackup}
                  disabled={backingUp || !exportPassword}
                >
                  {backingUp ? 'Exporting…' : 'Export backup'}
                </button>
                <button
                  className="sv-cancel-small-btn"
                  onClick={() => { setExportConfirm(false); setExportPassword(''); setBackupError(null); }}
                  disabled={backingUp}
                >
                  Cancel
                </button>
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
                <button
                  className="sv-save-btn"
                  onClick={() => { setRestoreConfirm(true); setRestoreError(null); setRestorePassword(''); }}
                >
                  Restore from backup
                </button>
                {restoreError && <div className="sv-error-inline">{restoreError}</div>}
              </div>
            </div>
          ) : (
            <div className="sv-wipe-confirm">
              <p className="sv-wipe-warning">
                Restoring a backup will permanently overwrite your current database and cannot be undone.
                Enter the master password used when the backup was created, then choose the file.
              </p>
              <input
                className="sv-input"
                type="password"
                placeholder="Backup password"
                value={restorePassword}
                onChange={(e) => { setRestorePassword(e.target.value); setRestoreError(null); }}
                autoComplete="current-password"
                disabled={restoringBackup}
              />
              <div className="sv-wipe-row">
                <button
                  className="sv-wipe-confirm-btn"
                  onClick={handleRestoreBackup}
                  disabled={restoringBackup || !restorePassword}
                >
                  {restoringBackup ? 'Restoring…' : 'Choose backup file…'}
                </button>
                <button
                  className="sv-cancel-small-btn"
                  onClick={() => { setRestoreConfirm(false); setRestorePassword(''); setRestoreError(null); }}
                  disabled={restoringBackup}
                >
                  Cancel
                </button>
              </div>
              {restoreError && <div className="sv-error-inline">{restoreError}</div>}
            </div>
          )}
        </div>

        {/* Automatic backups */}
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
              <button className="sv-save-btn" onClick={handleChooseBackupFolder}>
                Choose folder…
              </button>
            </div>
          </div>
          <Toggle
            checked={autoBackupEnabled}
            onChange={handleAutoBackupToggle}
            label="Enable automatic backups"
            hint={autoBackupDestPath ? undefined : 'Choose a backup folder first.'}
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
                disabled={!autoBackupDestPath}
              />
              <button
                className="sv-save-btn"
                onClick={handleRunAutoBackupNow}
                disabled={autoBackupRunning || !autoBackupDestPath || !autoBackupEnabled}
              >
                {autoBackupRunning ? 'Backing up…' : 'Back up now'}
              </button>
              {autoBackupResult && (
                <span className="sv-hint sv-hint--inline">{autoBackupResult}</span>
              )}
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="sv-section sv-danger-zone">
          <div className="sv-section-title sv-danger-title">Danger zone</div>
          <div className="sv-danger-inset">
          {!panicWipeConfirm ? (
            <div className="sv-field">
              <div>
                <div className="sv-hint">
                  Permanently deletes the database and encryption key. This cannot be undone.
                </div>
              </div>
              <button className="sv-wipe-btn" onClick={() => { setPanicWipeConfirm(true); setPanicWipeInput(''); }}>
                Wipe all data
              </button>
            </div>
          ) : (
            <div className="sv-wipe-confirm">
              <p className="sv-wipe-warning">
                All contacts, projects, and interaction history will be permanently destroyed and cannot be recovered.
                Type <strong>WIPE</strong> to confirm.
              </p>
              <div className="sv-wipe-row">
                <input
                  className="sv-input sv-wipe-input"
                  placeholder="Type WIPE"
                  value={panicWipeInput}
                  onChange={(e) => setPanicWipeInput(e.target.value)}
                  autoFocus
                />
                <button
                  className="sv-wipe-confirm-btn"
                  disabled={panicWipeInput !== 'WIPE' || panicWiping}
                  onClick={handlePanicWipe}
                >
                  {panicWiping ? 'Wiping…' : 'Destroy all data'}
                </button>
                <button
                  className="sv-cancel-small-btn"
                  onClick={() => { setPanicWipeConfirm(false); setPanicWipeInput(''); }}
                  disabled={panicWiping}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        <div className="sv-credit">
          Sourcerer is open source.{' '}
          <a href="https://github.com/tomcardoso/sourcerer" target="_blank" rel="noreferrer">
            github.com/tomcardoso/sourcerer
          </a>
        </div>

      </div>
    </div>
  );
}
