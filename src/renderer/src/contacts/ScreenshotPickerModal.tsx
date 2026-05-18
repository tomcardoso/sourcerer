import { useEffect, useRef, useState } from 'react';
import type { ContactListItem } from '@shared/types';
import Button from '../shell/Button';
import './ScreenshotPickerModal.css';

interface Props {
  tempId: string;
  onClose: () => void;
}

export default function ScreenshotPickerModal({ tempId, onClose }: Props) {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.sourcerer.listContacts().then(setContacts);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const filtered = query.trim()
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.organization ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : contacts;

  async function handlePick(contactId: string) {
    setSaving(true);
    setError(null);
    const result = await window.sourcerer.assignScreenshot({ tempId, contactId });
    setSaving(false);
    if (result.success) {
      onClose();
    } else {
      setError(result.error ?? 'Failed to save screenshot.');
    }
  }

  return (
    <div className="spm-overlay">
      <div className="spm-card">
        <h3 className="spm-title">Assign screenshot</h3>
        <p className="spm-subtitle">
          Choose a contact to attach this screenshot to.
        </p>
        <input
          ref={inputRef}
          className="spm-search"
          placeholder="Search contacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={saving}
        />
        {error && <p className="spm-error">{error}</p>}
        <div className="spm-list">
          {filtered.length === 0 ? (
            <p className="spm-empty">No contacts found.</p>
          ) : (
            filtered.slice(0, 50).map((c) => (
              <button
                key={c.id}
                className="spm-contact-btn"
                onClick={() => handlePick(c.id)}
                disabled={saving}
              >
                <span className="spm-contact-name">{c.name}</span>
                {c.organization && (
                  <span className="spm-contact-org">{c.organization}</span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="spm-footer">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
