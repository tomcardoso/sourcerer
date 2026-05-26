import { useEffect, useRef, useState } from 'react';
import type { ContactDetail, ContactListItem } from '@shared/types';
import Modal from '../shell/Modal';
import Button from '../shell/Button';
import { CalendarPicker } from '../views/CalendarPicker';
import { dateStrToUnix } from '../utils/fmtDate';
import './QuickLogModal.css';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function QuickReminderModal({ onClose, onSaved }: Props) {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContactName, setSelectedContactName] = useState('');
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.sourcerer.listContacts().then(setContacts);
  }, []);

  useEffect(() => {
    if (!selectedContactId) {
      setDetail(null);
      setSelectedProjectId(null);
      return;
    }
    window.sourcerer.getContact(selectedContactId).then((d) => {
      setDetail(d);
      const defaultProject = d.default_membership_id
        ? d.projects.find((p) => p.membership_id === d.default_membership_id)
        : null;
      setSelectedProjectId(defaultProject?.id ?? d.projects[0]?.id ?? null);
    });
  }, [selectedContactId]);

  const filtered = query
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()),
      )
    : contacts;

  function selectContact(c: ContactListItem) {
    setSelectedContactId(c.id);
    setSelectedContactName(c.name);
    setQuery('');
    setDropdownOpen(false);
  }

  function clearContact() {
    setSelectedContactId(null);
    setSelectedContactName('');
    setDetail(null);
    setSelectedProjectId(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleSave() {
    if (!selectedContactId || !date) return;
    setSaving(true);
    try {
      const ts = dateStrToUnix(date);
      await window.sourcerer.createReminder({
        contactId: selectedContactId,
        projectId: selectedProjectId ?? undefined,
        dueDate: ts,
        note: note.trim() || undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!selectedContactId && !!date && note.trim().length > 0 && !saving;

  return (
    <Modal title="Set reminder" onDismiss={onClose} className="quick-reminder-modal">
      <div className="qlm-field">
        <label className="qlm-label">Contact <span className="qlm-required">*</span></label>
        {selectedContactId ? (
          <div className="qlm-selected">
            <span className="qlm-selected-name">{selectedContactName}</span>
            <button type="button" className="qlm-clear-btn" onClick={clearContact} aria-label="Clear contact">×</button>
          </div>
        ) : (
          <div className="qlm-picker-wrap">
            <input
              ref={inputRef}
              className="qlm-picker-input"
              placeholder="Search contacts…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              autoFocus
            />
            {dropdownOpen && filtered.length > 0 && (
              <div className="qlm-dropdown">
                {filtered.slice(0, 10).map((c) => (
                  <div
                    key={c.id}
                    className="qlm-dropdown-option"
                    onMouseDown={(e) => { e.preventDefault(); selectContact(c); }}
                  >
                    {c.name}
                    {c.organization && <span className="qlm-dropdown-org">{c.organization}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {detail && detail.projects.length > 0 && (
        <div className="qlm-field">
          <label className="qlm-label">Project</label>
          <select
            className="qlm-select"
            value={selectedProjectId ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
          >
            <option value="">No project</option>
            {detail.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="qlm-field">
        <label className="qlm-label">Due date <span className="qlm-required">*</span></label>
        <div className="qlm-date-wrap">
          <CalendarPicker
            label="Pick date"
            value={date}
            onChange={setDate}
            showYear
          />
        </div>
      </div>

      <div className="qlm-field">
        <label className="qlm-label">Note <span className="qlm-required">*</span></label>
        <textarea
          className="qlm-textarea"
          placeholder="What do you want to be reminded about?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      </div>

      <div className="form-actions">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}
