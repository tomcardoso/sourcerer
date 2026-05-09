import { useEffect, useRef, useState } from 'react';
import type { ContactListItem } from '@shared/types';

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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '24px 20px 16px',
          width: 360,
          maxHeight: 480,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Assign screenshot</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          Choose a contact to attach this screenshot to.
        </p>
        <input
          ref={inputRef}
          className="ac-input"
          placeholder="Search contacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 10 }}
          disabled={saving}
        />
        {error && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>
        )}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '12px 0' }}>
              No contacts found.
            </p>
          ) : (
            filtered.slice(0, 50).map((c) => (
              <button
                key={c.id}
                onClick={() => handlePick(c.id)}
                disabled={saving}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--color-text)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                {c.organization && (
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: 6, fontSize: 12 }}>
                    {c.organization}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="modal-btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
