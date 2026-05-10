import { useEffect, useMemo, useState } from 'react';
import { getCountries, getCountryCallingCode } from 'libphonenumber-js';
import type { User, StatusOption, PriorityOption } from '@shared/types';
import './View.css';
import './SettingsView.css';

interface Props {
  user: User | null;
  onUserUpdated: (user: User) => void;
}


const INTERVAL_PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: 'Every 2 weeks', days: 14 },
  { label: 'Every 4 weeks', days: 28 },
  { label: 'Every 2 months', days: 60 },
  { label: 'No reminders', days: null as number | null },
];

const TIMEOUT_OPTIONS = [
  { label: '1 minute', seconds: 60 },
  { label: '5 minutes', seconds: 300 },
  { label: '15 minutes', seconds: 900 },
  { label: '30 minutes', seconds: 1800 },
  { label: '1 hour', seconds: 3600 },
  { label: 'Never', seconds: 0 },
];

function OptionsSection({
  title,
  description,
  options,
  onAdd,
  onRename,
  onDelete,
  onMove,
  showInterval,
  onSetInterval,
}: {
  title: string;
  description?: string;
  options: (StatusOption | PriorityOption)[];
  onAdd: (label: string) => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove: (id: string, direction: 'up' | 'down') => Promise<void>;
  showInterval?: boolean;
  onSetInterval?: (id: string, days: number | null) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  function getEditValue(opt: StatusOption | PriorityOption) {
    return editValues[opt.id] ?? opt.label;
  }

  async function handleBlur(opt: StatusOption | PriorityOption) {
    const val = (editValues[opt.id] ?? opt.label).trim();
    if (!val || val === opt.label) {
      setEditValues((prev) => { const n = { ...prev }; delete n[opt.id]; return n; });
      return;
    }
    await onRename(opt.id, val);
    setEditValues((prev) => { const n = { ...prev }; delete n[opt.id]; return n; });
  }

  async function handleAddConfirm() {
    const label = newLabel.trim();
    if (!label) { setAdding(false); setNewLabel(''); return; }
    await onAdd(label);
    setNewLabel('');
    setAdding(false);
  }

  return (
    <div className="sv-section">
      <div className="sv-section-title">{title}</div>
      {description && <p className="sv-hint">{description}</p>}
      <div className="sv-option-list">
        {deleteError && (
          <div className="sv-error">{deleteError}</div>
        )}
        {options.map((opt, i) => (
          <div key={opt.id} className="sv-option-row">
            <input
              className="sv-option-input"
              value={getEditValue(opt)}
              onChange={(e) => setEditValues((prev) => ({ ...prev, [opt.id]: e.target.value }))}
              onBlur={() => handleBlur(opt)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  setEditValues((prev) => { const n = { ...prev }; delete n[opt.id]; return n; });
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            {showInterval && onSetInterval && (
              <select
                className="sv-interval-select"
                title="Outreach reminder frequency"
                value={String((opt as PriorityOption).outreach_interval_days ?? '')}
                onChange={(e) => {
                  const val = e.target.value;
                  onSetInterval(opt.id, val === '' ? null : Number(val));
                }}
              >
                {INTERVAL_PRESETS.map((p) => (
                  <option key={p.days ?? 'none'} value={p.days ?? ''}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
            <button
              className="sv-move-btn"
              disabled={i === 0}
              onClick={() => onMove(opt.id, 'up')}
              title="Move up"
            >▲</button>
            <button
              className="sv-move-btn"
              disabled={i === options.length - 1}
              onClick={() => onMove(opt.id, 'down')}
              title="Move down"
            >▼</button>
            <button
              className="sv-delete-btn"
              onClick={async () => {
                try {
                  setDeleteError(null);
                  await onDelete(opt.id);
                } catch {
                  setDeleteError(`"${opt.label}" is in use and cannot be deleted.`);
                }
              }}
              title="Delete"
            >×</button>
          </div>
        ))}

        {adding ? (
          <div className="sv-option-row">
            <input
              className="sv-option-input"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              autoFocus
              placeholder="Label…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddConfirm();
                if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
              }}
            />
            <button className="sv-confirm-btn" onClick={handleAddConfirm}>Add</button>
            <button className="sv-cancel-small-btn" onClick={() => { setAdding(false); setNewLabel(''); }}>Cancel</button>
          </div>
        ) : (
          <button className="sv-add-btn" onClick={() => setAdding(true)}>+ Add</button>
        )}
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

  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<PriorityOption[]>([]);
  const [idleTimeout, setIdleTimeout] = useState<number>(900);
  const [phoneCountry, setPhoneCountry] = useState<string>('CA');
  const [outreachRemindersEnabled, setOutreachRemindersEnabled] = useState<boolean>(true);
  const [outreachRequireInteraction, setOutreachRequireInteraction] = useState<boolean>(true);
  const [alertNotificationsEnabled, setAlertNotificationsEnabled] = useState<boolean>(true);
  const [reminderNotificationsEnabled, setReminderNotificationsEnabled] = useState<boolean>(true);
  const [rssPollIntervalHours, setRssPollIntervalHours] = useState<number>(6);
  const [stalenessEnabled, setStalenessEnabled] = useState<boolean>(true);
  const [stalenessThreshold, setStalenessThreshold] = useState<number>(90);
  const [stalenessThresholdInput, setStalenessThresholdInput] = useState<string>('90');
  const [calendarRegenConfirm, setCalendarRegenConfirm] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
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
    }
    window.sourcerer.listStatusOptions().then(setStatusOptions);
    window.sourcerer.listPriorityOptions().then(setPriorityOptions);
    window.sourcerer.getIdleTimeout().then(setIdleTimeout);
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
    setBackingUp(true);
    setBackupError(null);
    const result = await window.sourcerer.exportBackup();
    setBackingUp(false);
    if (!result.success && result.error) setBackupError(result.error);
  }

  async function handleRestoreBackup() {
    setRestoringBackup(true);
    setRestoreError(null);
    const result = await window.sourcerer.restoreBackup();
    setRestoringBackup(false);
    if (result.canceled) {
      setRestoreConfirm(false);
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

  async function handlePriorityInterval(id: string, days: number | null) {
    await window.sourcerer.setPriorityInterval(id, days);
    setPriorityOptions(await window.sourcerer.listPriorityOptions());
  }

  async function handlePhoneCountryChange(country: string) {
    setPhoneCountry(country);
    const updated = await window.sourcerer.setPhoneCountry(country);
    onUserUpdated(updated);
  }

  // Status option handlers
  async function addStatus(label: string) {
    const opt = await window.sourcerer.createStatusOption(label);
    setStatusOptions((prev) => [...prev, opt]);
  }
  async function renameStatus(id: string, label: string) {
    await window.sourcerer.renameStatusOption(id, label);
    setStatusOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)));
  }
  async function deleteStatus(id: string) {
    await window.sourcerer.deleteStatusOption(id);
    setStatusOptions((prev) => prev.filter((o) => o.id !== id));
  }
  async function moveStatus(id: string, direction: 'up' | 'down') {
    await window.sourcerer.moveStatusOption(id, direction);
    setStatusOptions(await window.sourcerer.listStatusOptions());
  }

  // Priority option handlers
  async function addPriority(label: string) {
    const opt = await window.sourcerer.createPriorityOption(label);
    setPriorityOptions((prev) => [...prev, opt]);
  }
  async function renamePriority(id: string, label: string) {
    await window.sourcerer.renamePriorityOption(id, label);
    setPriorityOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)));
  }
  async function deletePriority(id: string) {
    await window.sourcerer.deletePriorityOption(id);
    setPriorityOptions((prev) => prev.filter((o) => o.id !== id));
  }
  async function movePriority(id: string, direction: 'up' | 'down') {
    await window.sourcerer.movePriorityOption(id, direction);
    setPriorityOptions(await window.sourcerer.listPriorityOptions());
  }

  const profileDirty =
    user &&
    (firstName !== user.first_name || lastName !== user.last_name || email !== user.email);

  return (
    <div className="view">
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
      </div>

      <div className="sv-body">
        {/* Profile */}
        <div className="sv-section">
          <div className="sv-section-title">Profile</div>
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

        {/* Status options */}
        <OptionsSection
          title="Source Statuses"
          options={statusOptions}
          onAdd={addStatus}
          onRename={renameStatus}
          onDelete={deleteStatus}
          onMove={moveStatus}
        />

        {/* Priority options */}
        <OptionsSection
          title="Priority Levels"
          description="Assign a priority level to each source within a project to signal how urgently you need to maintain the relationship. The reminder interval sets how often you want to be nudged to reach out to sources at that priority — leave it blank to suppress reminders for that level."
          options={priorityOptions}
          onAdd={addPriority}
          onRename={renamePriority}
          onDelete={deletePriority}
          onMove={movePriority}
          showInterval
          onSetInterval={handlePriorityInterval}
        />

        {/* Staleness */}
        <div className="sv-section">
          <div className="sv-section-title">Source Staleness</div>
          <p className="sv-hint">
            Contacts with no interaction or outreach logged within the threshold will show a subtle amber indicator in the contacts table.
          </p>
          <div className="sv-field sv-field-check">
            <input
              type="checkbox"
              checked={stalenessEnabled}
              onChange={(e) => handleStalenessToggle(e.target.checked)}
            />
            <label className="sv-label">Enable staleness indicator</label>
          </div>
          {stalenessEnabled && (
            <div className="sv-field sv-staleness-threshold">
              <label className="sv-label">Stale after</label>
              <div className="sv-inline-field">
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
          <div className="sv-section-title">Outreach Reminders</div>
          <p className="sv-hint">
            Get a native notification when a source hasn't been contacted within their priority's reminder interval. Configure intervals per priority level above. Reminders can be disabled per-source in the contact's project tab.
          </p>
          <div className="sv-field sv-field-check">
            <input
              type="checkbox"
              checked={outreachRemindersEnabled}
              onChange={(e) => handleOutreachToggle(e.target.checked)}
            />
            <label className="sv-label">Enable outreach reminders</label>
          </div>
          <div className="sv-field sv-field-check">
            <input
              type="checkbox"
              checked={outreachRequireInteraction}
              onChange={(e) => handleOutreachRequireInteractionToggle(e.target.checked)}
            />
            <div>
              <div className="sv-label">Start clock after first interaction</div>
              <div className="sv-hint sv-hint--inline">
                When on, outreach reminders won't appear until at least one interaction has been logged for a source. When off, the clock starts as soon as a priority is assigned.
              </div>
            </div>
          </div>
        </div>

        {/* Google Alerts */}
        <div className="sv-section">
          <div className="sv-section-title">Google Alerts</div>
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
          <div className="sv-field sv-field-check">
            <input
              type="checkbox"
              checked={alertNotificationsEnabled}
              onChange={(e) => handleAlertNotificationsToggle(e.target.checked)}
            />
            <label className="sv-label">Alert mentions</label>
          </div>
          <div className="sv-field sv-field-check">
            <input
              type="checkbox"
              checked={reminderNotificationsEnabled}
              onChange={(e) => handleReminderNotificationsToggle(e.target.checked)}
            />
            <label className="sv-label">Reminders</label>
          </div>
        </div>

        {/* Security */}
        <div className="sv-section">
          <div className="sv-section-title">Security</div>
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
          <div className="sv-section-title">Phone Numbers</div>
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

        {/* Calendar */}
        <div className="sv-section">
          <div className="sv-section-title">Calendar Subscription</div>
          <p className="sv-hint">
            Subscribe to this URL in Apple Calendar, Outlook, or Google Calendar to see your reminders.
          </p>
          <div className="sv-calendar-url-row">
            <input
              className="sv-input sv-calendar-url"
              readOnly
              value={user ? `http://127.0.0.1:27371/calendar/reminders.ics?token=${user.calendar_token}` : ''}
            />
            <button
              className="sv-copy-btn"
              onClick={() => {
                if (user) navigator.clipboard.writeText(`http://127.0.0.1:27371/calendar/reminders.ics?token=${user.calendar_token}`);
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

        {/* Backup */}
        <div className="sv-section">
          <div className="sv-section-title">Backup</div>
          <div className="sv-field">
            <div className="sv-backup-export-restore">
              <div className="sv-hint">
                Save your encrypted database and key file as a <code>.sourcerer-backup</code> file. Keep this somewhere safe — anyone with your master password can restore it.
              </div>
              <button className="sv-save-btn" onClick={handleExportBackup} disabled={backingUp}>
                {backingUp ? 'Exporting…' : 'Export backup…'}
              </button>
              {backupError && <div className="sv-error-inline">{backupError}</div>}
            </div>
          </div>
          {!restoreConfirm ? (
            <div className="sv-field">
              <div>
                <div className="sv-hint">
                  Restore a <code>.sourcerer-backup</code> file. Your current database will be permanently replaced.
                </div>
                <button
                  className="sv-save-btn"
                  onClick={() => { setRestoreConfirm(true); setRestoreError(null); }}
                >
                  Restore from backup…
                </button>
                {restoreError && <div className="sv-error-inline">{restoreError}</div>}
              </div>
            </div>
          ) : (
            <div className="sv-wipe-confirm">
              <p className="sv-wipe-warning">
                Restoring a backup will permanently overwrite your current database and cannot be undone.
                A file picker will open — choose your <code>.sourcerer-backup</code> file to proceed.
              </p>
              <div className="sv-wipe-row">
                <button
                  className="sv-wipe-confirm-btn"
                  onClick={handleRestoreBackup}
                  disabled={restoringBackup}
                >
                  {restoringBackup ? 'Restoring…' : 'Choose backup file…'}
                </button>
                <button
                  className="sv-cancel-small-btn"
                  onClick={() => { setRestoreConfirm(false); setRestoreError(null); }}
                  disabled={restoringBackup}
                >
                  Cancel
                </button>
              </div>
              {restoreError && <div className="sv-error-inline">{restoreError}</div>}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="sv-section sv-danger-zone">
          <div className="sv-section-title sv-danger-title">Danger Zone</div>
          {!panicWipeConfirm ? (
            <div className="sv-field">
              <div>
                <div className="sv-hint">
                  Permanently deletes the database and encryption key. This cannot be undone.
                </div>
              </div>
              <button className="sv-wipe-btn" onClick={() => { setPanicWipeConfirm(true); setPanicWipeInput(''); }}>
                Wipe all data…
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
