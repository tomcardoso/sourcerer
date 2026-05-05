import { useEffect, useMemo, useState } from 'react';
import { getCountries, getCountryCallingCode } from 'libphonenumber-js';
import type { User, StatusOption, PriorityOption } from '@shared/types';
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

function OptionsSection({
  title,
  options,
  onAdd,
  onRename,
  onDelete,
  onMove,
}: {
  title: string;
  options: (StatusOption | PriorityOption)[];
  onAdd: (label: string) => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove: (id: string, direction: 'up' | 'down') => Promise<void>;
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
      <div className="view-section-title">{title}</div>
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
  const [phoneCountry, setPhoneCountry] = useState<string>('US');
  const [calendarRegenConfirm, setCalendarRegenConfirm] = useState(false);

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
      setPhoneCountry(user.phone_country ?? 'US');
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

  async function handleRegenerateToken() {
    const updated = await window.sourcerer.regenerateCalendarToken();
    onUserUpdated(updated);
    setCalendarRegenConfirm(false);
  }

  async function handleTimeoutChange(seconds: number) {
    setIdleTimeout(seconds);
    await window.sourcerer.setIdleTimeout(seconds);
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
          <div className="view-section-title">Profile</div>
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
          options={priorityOptions}
          onAdd={addPriority}
          onRename={renamePriority}
          onDelete={deletePriority}
          onMove={movePriority}
        />

        {/* Security */}
        <div className="sv-section">
          <div className="view-section-title">Security</div>
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
          <div className="view-section-title">Phone Numbers</div>
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
          <div className="view-section-title">Calendar Subscription</div>
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
              <button className="sv-delete-btn" onClick={handleRegenerateToken}>Yes, regenerate</button>
              <button className="sv-cancel-small-btn" onClick={() => setCalendarRegenConfirm(false)}>Cancel</button>
            </div>
          ) : (
            <button className="sv-add-btn" onClick={() => setCalendarRegenConfirm(true)}>
              Regenerate token
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
