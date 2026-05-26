import { useEffect, useState } from 'react';
import { useMutation } from '../hooks/useMutation';
import type { ContactListItem } from '@shared/types';
import Button from '../shell/Button';
import Modal from '../shell/Modal';
import './ScreenshotPickerModal.css';

interface Props {
  tempId: string;
  onClose: () => void;
}

export default function ScreenshotPickerModal({ tempId, onClose }: Props) {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    window.sourcerer.listContacts().then(setContacts);
  }, []);

  const filtered = query.trim()
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.organization ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : contacts;

  const { execute: handlePick, isPending: saving, error } = useMutation(async (contactId: string) => {
    const result = await window.sourcerer.assignScreenshot({ tempId, contactId });
    if (!result.success) throw new Error(result.error ?? 'Failed to save screenshot.');
    onClose();
  });

  return (
    <Modal title="Assign screenshot" onDismiss={onClose} className="spm-modal">
      <p className="form-description">
        Choose a contact to attach this screenshot to.
      </p>
      <input
        autoFocus
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
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
