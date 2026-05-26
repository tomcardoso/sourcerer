import { useEffect, useMemo, useRef, useState } from 'react';
import { getCountries, getCountryCallingCode } from 'libphonenumber-js';
import type { User } from '@shared/types';
import Button from '../shell/Button';
import Toggle from './SettingsToggle';
import ProfileSection from './ProfileSection';
import BackupSection from './BackupSection';
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

export default function SettingsView({ user, onUserUpdated }: Props) {
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

  const [screenshotFolderBytes, setScreenshotFolderBytes] = useState<number>(0);

  const [archiveAccessKey, setArchiveAccessKey] = useState('');
  const [archiveSecretKey, setArchiveSecretKey] = useState('');
  const [archiveKeysSaved, setArchiveKeysSaved] = useState(false);
  const archiveKeysSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [vaultPath, setVaultPath] = useState<string>('');
  const [movingVault, setMovingVault] = useState(false);
  const [moveVaultError, setMoveVaultError] = useState<string | null>(null);
  const [moveVaultSuccess, setMoveVaultSuccess] = useState(false);

  const [panicWipeConfirm, setPanicWipeConfirm] = useState(false);
  const [panicWipeInput, setPanicWipeInput] = useState('');
  const [panicWiping, setPanicWiping] = useState(false);

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
    window.sourcerer.getVaultPath().then(setVaultPath);
  }, [user?.id]);

  async function handleRegenerateToken() {
    const updated = await window.sourcerer.regenerateCalendarToken();
    onUserUpdated(updated);
    const url = await window.sourcerer.getCalendarUrl();
    setCalendarUrl(url);
    setCalendarRegenConfirm(false);
  }

  async function handleTimeoutChange(seconds: number) {
    const prev = idleTimeout;
    setIdleTimeout(seconds);
    try {
      await window.sourcerer.setIdleTimeout(seconds);
    } catch {
      setIdleTimeout(prev);
    }
  }

  async function handleStalenessToggle(enabled: boolean) {
    setStalenessEnabled(enabled);
    try {
      const updated = await window.sourcerer.setStalenessEnabled(enabled);
      onUserUpdated(updated);
    } catch {
      setStalenessEnabled(!enabled);
    }
  }

  async function handleStalenessThresholdBlur() {
    const days = parseInt(stalenessThresholdInput, 10);
    if (!isNaN(days) && days > 0 && days !== stalenessThreshold) {
      setStalenessThreshold(days);
      try {
        const updated = await window.sourcerer.setStalenessThreshold(days);
        onUserUpdated(updated);
      } catch {
        setStalenessThreshold(stalenessThreshold);
        setStalenessThresholdInput(String(stalenessThreshold));
      }
    } else {
      setStalenessThresholdInput(String(stalenessThreshold));
    }
  }

  async function handleAlertNotificationsToggle(enabled: boolean) {
    setAlertNotificationsEnabled(enabled);
    try {
      const updated = await window.sourcerer.setAlertNotificationsEnabled(enabled);
      onUserUpdated(updated);
    } catch {
      setAlertNotificationsEnabled(!enabled);
    }
  }

  async function handleRssPollIntervalChange(hours: number) {
    const prev = rssPollIntervalHours;
    setRssPollIntervalHours(hours);
    try {
      const updated = await window.sourcerer.setRssPollInterval(hours);
      onUserUpdated(updated);
    } catch {
      setRssPollIntervalHours(prev);
    }
  }

  async function handleWaybackToggle(enabled: boolean) {
    setWaybackEnabled(enabled);
    try {
      const updated = await window.sourcerer.setWaybackEnabled(enabled);
      onUserUpdated(updated);
    } catch {
      setWaybackEnabled(!enabled);
    }
  }

  async function handleArchiveKeysSave() {
    const updated = await window.sourcerer.setArchiveKeys(archiveAccessKey, archiveSecretKey);
    onUserUpdated(updated);
    setArchiveKeysSaved(true);
    if (archiveKeysSavedTimerRef.current) clearTimeout(archiveKeysSavedTimerRef.current);
    archiveKeysSavedTimerRef.current = setTimeout(() => setArchiveKeysSaved(false), 2000);
  }

  async function handleReminderNotificationsToggle(enabled: boolean) {
    setReminderNotificationsEnabled(enabled);
    try {
      const updated = await window.sourcerer.setReminderNotificationsEnabled(enabled);
      onUserUpdated(updated);
    } catch {
      setReminderNotificationsEnabled(!enabled);
    }
  }

  async function handleOutreachToggle(enabled: boolean) {
    setOutreachRemindersEnabled(enabled);
    try {
      const updated = await window.sourcerer.setOutreachRemindersEnabled(enabled);
      onUserUpdated(updated);
    } catch {
      setOutreachRemindersEnabled(!enabled);
    }
  }

  async function handleOutreachRequireInteractionToggle(required: boolean) {
    setOutreachRequireInteraction(required);
    try {
      const updated = await window.sourcerer.setOutreachRequireInteraction(required);
      onUserUpdated(updated);
    } catch {
      setOutreachRequireInteraction(!required);
    }
  }

  async function handlePhoneCountryChange(country: string) {
    const prev = phoneCountry;
    setPhoneCountry(country);
    try {
      const updated = await window.sourcerer.setPhoneCountry(country);
      onUserUpdated(updated);
    } catch {
      setPhoneCountry(prev);
    }
  }

  async function handleMoveVault() {
    setMovingVault(true);
    setMoveVaultError(null);
    setMoveVaultSuccess(false);
    const result = await window.sourcerer.moveVault();
    setMovingVault(false);
    if (result.success) {
      if (result.newPath) setVaultPath(result.newPath);
      setMoveVaultSuccess(true);
    } else if (result.error) {
      setMoveVaultError(result.error);
    }
  }

  async function handlePanicWipe() {
    if (panicWipeInput !== 'WIPE') return;
    setPanicWiping(true);
    try {
      await window.sourcerer.panicWipe();
    } finally {
      setPanicWiping(false);
    }
  }

  return (
    <div className="view">
      <div className="view-header">
        <p className="view-kicker">Settings</p>
        <h1 className="view-headline">Preferences</h1>
        <div className="view-rule-thick" />
        <div className="view-rule-thin" />
      </div>

      <div className="sv-body">
        <ProfileSection user={user} onUserUpdated={onUserUpdated} />

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

        {/* Auto-lock */}
        <div className="sv-section">
          <div className="sv-section-title">Auto-lock</div>
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
          <div className="sv-key-row">
            <div className="sv-field">
              <label className="sv-label">Archive.org access key</label>
              <input
                className="sv-input"
                type="password"
                value={archiveAccessKey}
                onChange={(e) => setArchiveAccessKey(e.target.value)}
                placeholder={user?.wayback_keys_configured !== 0 ? 'saved — enter to replace' : ''}
                autoComplete="new-password"
                disabled={!waybackEnabled}
              />
            </div>
            <div className="sv-field">
              <label className="sv-label">Archive.org secret key</label>
              <input
                className="sv-input"
                type="password"
                value={archiveSecretKey}
                onChange={(e) => setArchiveSecretKey(e.target.value)}
                placeholder={user?.wayback_keys_configured !== 0 ? 'saved — enter to replace' : ''}
                autoComplete="new-password"
                disabled={!waybackEnabled}
              />
            </div>
            <Button variant="accent" size="sm" onClick={handleArchiveKeysSave} disabled={!waybackEnabled || !archiveAccessKey.trim() || !archiveSecretKey.trim()}>
              Save keys
            </Button>
          </div>
          {archiveKeysSaved && (
            <p className="sv-success">Keys saved.</p>
          )}
          {!archiveKeysSaved && waybackEnabled && user?.wayback_keys_configured === 0 && (
            <p className="sv-error">No keys saved — archiving won&apos;t work until you add and save your keys.</p>
          )}
          <p className="sv-hint sv-hint--top">
            Required for Wayback Machine submissions. Get your keys at{' '}
            <a href="https://archive.org/account/s3.php" target="_blank" rel="noreferrer">
              archive.org/account/s3.php
            </a>
            . Keys are stored encrypted in your local database.
          </p>
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (calendarUrl) navigator.clipboard.writeText(calendarUrl);
              }}
            >
              Copy
            </Button>
          </div>
          {calendarRegenConfirm ? (
            <div className="sv-regen-confirm">
              <span>This invalidates your existing calendar subscription. Continue?</span>
              <Button variant="accent" size="sm" onClick={handleRegenerateToken}>Yes, regenerate</Button>
              <Button variant="secondary" size="sm" onClick={() => setCalendarRegenConfirm(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setCalendarRegenConfirm(true)}>
              Regenerate token
            </Button>
          )}
        </div>

        {/* Screenshots storage */}
        <div className="sv-section">
          <div className="sv-section-title">Screenshot storage</div>
          <p className="sv-hint">
            Encrypted screenshots are stored inside your vault bundle alongside the database.
          </p>
          <div className="sv-storage-row">
            <span className="sv-storage-size">
              {screenshotFolderBytes >= 1024 * 1024 * 1024
                ? `${(screenshotFolderBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
                : screenshotFolderBytes >= 1024 * 1024
                ? `${(screenshotFolderBytes / (1024 * 1024)).toFixed(1)} MB`
                : `${(screenshotFolderBytes / 1024).toFixed(0)} KB`}
            </span>
            <Button variant="ghost" onClick={async () => { try { await window.sourcerer.openScreenshotFolder(); } catch (err) { console.error('Failed to open screenshot folder:', err); } }}>
              Open folder
            </Button>
          </div>
          {screenshotFolderBytes >= 1024 * 1024 * 1024 && (
            <div className="sv-storage-warning">
              ⚠ Screenshot folder exceeds 1 GB. Open the folder to review and delete files manually.
            </div>
          )}
        </div>

        {/* Vault location */}
        <div className="sv-section">
          <div className="sv-section-title">Vault location</div>
          <p className="sv-hint">
            Your vault contains the encrypted database, salt file, and screenshots. You can move it
            to any folder — on an external drive or synced folder — to take it between machines.
            The app will lock after moving so you can unlock against the new location.
          </p>
          <div className="sv-field">
            <label className="sv-label">Current location</label>
            <div className="sv-row">
              <code className="sv-path-code">{vaultPath}</code>
              <Button variant="ghost" size="sm" onClick={() => window.sourcerer.revealVault()}>
                Show in folder
              </Button>
            </div>
            <div className="sv-field-action">
              <Button variant="accent" size="sm" onClick={handleMoveVault} disabled={movingVault}>
                {movingVault ? 'Moving…' : 'Move vault'}
              </Button>
            </div>
          </div>
          {moveVaultError && <div className="sv-error-inline sv-move-vault-msg">{moveVaultError}</div>}
          {moveVaultSuccess && <p className="sv-success sv-move-vault-msg">Vault moved. You&apos;ll be asked to unlock again.</p>}
        </div>

        <BackupSection />

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
              <Button variant="danger-outline" size="sm" onClick={() => { setPanicWipeConfirm(true); setPanicWipeInput(''); }}>
                Wipe all data
              </Button>
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
                <Button
                  variant="danger"
                  size="sm"
                  disabled={panicWipeInput !== 'WIPE' || panicWiping}
                  onClick={handlePanicWipe}
                >
                  {panicWiping ? 'Wiping…' : 'Destroy all data'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setPanicWipeConfirm(false); setPanicWipeInput(''); }}
                  disabled={panicWiping}
                >
                  Cancel
                </Button>
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
