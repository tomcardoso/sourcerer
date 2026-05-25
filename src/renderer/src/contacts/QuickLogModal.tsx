import { useEffect, useRef, useState } from 'react';
import type { ContactDetail, ContactListItem } from '@shared/types';
import Modal from '../shell/Modal';
import Button from '../shell/Button';
import { CalendarPicker } from '../views/CalendarPicker';
import LogProjectPicker from './LogProjectPicker';
import './QuickLogModal.css';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function QuickLogModal({ onClose, onSaved }: Props) {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContactName, setSelectedContactName] = useState('');
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [membershipIds, setMembershipIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayISO());
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.sourcerer.listContacts().then(setContacts);
  }, []);

  useEffect(() => {
    if (!selectedContactId) {
      setDetail(null);
      setMembershipIds([]);
      return;
    }
    window.sourcerer.getContact(selectedContactId).then((d) => {
      setDetail(d);
      const def = d.default_membership_id
        ? d.projects.find((p) => p.membership_id === d.default_membership_id)
        : null;
      setMembershipIds(def ? [def.membership_id] : []);
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
    setMembershipIds([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleSave() {
    if (!selectedContactId || !body.trim() || !date) return;
    setSaving(true);
    try {
      const [y, m, d] = date.split('-').map(Number);
      const ts = Math.floor(new Date(y, m - 1, d, 12, 0, 0).getTime() / 1000);
      await window.sourcerer.addGlobalLogEntry(
        selectedContactId,
        body.trim(),
        ts,
        membershipIds.length > 0 ? membershipIds : undefined,
      );
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!selectedContactId && body.trim().length > 0 && !!date && !saving;

  return (
    <Modal title="Log interaction" onDismiss={onClose} className="quick-log-modal">
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
          <label className="qlm-label">Projects</label>
          <LogProjectPicker
            projects={detail.projects}
            selectedIds={membershipIds}
            onChange={setMembershipIds}
          />
        </div>
      )}

      <div className="qlm-field">
        <label className="qlm-label">Date</label>
        <div className="qlm-date-wrap">
          <CalendarPicker
            label="Pick date"
            value={date}
            onChange={setDate}
            showYear
            maxDate={todayISO()}
          />
        </div>
      </div>

      <div className="qlm-field">
        <label className="qlm-label">Note <span className="qlm-required">*</span></label>
        <textarea
          className="qlm-textarea"
          placeholder="What happened?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
        />
      </div>

      <div className="form-actions">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}
