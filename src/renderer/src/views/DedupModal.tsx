import { useState, useEffect } from 'react';
import type { DedupContact, DuplicatePair } from '@shared/types';
import './DedupModal.css';
import '../contacts/AddContactModal.css';

interface Props {
  pairs: DuplicatePair[];
  onClose: () => void;
}

function reasonLabel(reason: DuplicatePair['reason']): string {
  if (reason === 'email') return 'shared email';
  if (reason === 'phone') return 'shared phone';
  return 'similar name';
}

function ContactCard({ contact, other }: { contact: DedupContact; other: DedupContact }) {
  const namesDiffer = contact.name !== other.name;
  const orgsDiffer = contact.organization !== other.organization;
  const notesDiffer = contact.notes !== other.notes;

  return (
    <div className="dedup-contact-card">
      <div className={`dedup-field ${namesDiffer ? 'dedup-field--diff' : ''}`}>
        <span className="dedup-field-label">Name</span>
        <span className="dedup-field-value">{contact.name}</span>
      </div>

      {(contact.organization || other.organization) && (
        <div className={`dedup-field ${orgsDiffer ? 'dedup-field--diff' : ''}`}>
          <span className="dedup-field-label">Org</span>
          <span className="dedup-field-value">{contact.organization || '—'}</span>
        </div>
      )}

      {contact.emails.length > 0 && (
        <div className="dedup-field">
          <span className="dedup-field-label">Email</span>
          <div>
            {contact.emails.map((e) => (
              <div
                key={e}
                className={`dedup-field-value ${!other.emails.includes(e) ? 'dedup-field-value--unique' : ''}`}
              >
                {e}
              </div>
            ))}
          </div>
        </div>
      )}

      {contact.phones.length > 0 && (
        <div className="dedup-field">
          <span className="dedup-field-label">Phone</span>
          <div>
            {contact.phones.map((p) => (
              <div
                key={p}
                className={`dedup-field-value ${!other.phones.includes(p) ? 'dedup-field-value--unique' : ''}`}
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {(contact.notes || other.notes) && (
        <div className={`dedup-field ${notesDiffer ? 'dedup-field--diff' : ''}`}>
          <span className="dedup-field-label">Notes</span>
          <span className="dedup-field-value dedup-notes">{contact.notes || '—'}</span>
        </div>
      )}

      <div className="dedup-field">
        <span className="dedup-field-label">Projects</span>
        <span className="dedup-field-value">{contact.projectCount}</span>
      </div>
    </div>
  );
}

export default function DedupModal({ pairs: initialPairs, onClose }: Props) {
  const [pairs, setPairs] = useState(initialPairs);
  const [index, setIndex] = useState(0);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function advance() {
    const newPairs = pairs.filter((_, i) => i !== index);
    setPairs(newPairs);
    if (index >= newPairs.length) {
      setIndex(Math.max(0, newPairs.length - 1));
    }
  }

  async function handleAction(
    winnerId: string | null,
    loserId: string | null,
    strategy: 'keep' | 'merge' | 'skip',
  ) {
    if (strategy === 'skip') {
      advance();
      return;
    }
    setWorking(true);
    try {
      await window.sourcerer.mergeContacts({ winnerId: winnerId!, loserId: loserId!, strategy });
      advance();
    } finally {
      setWorking(false);
    }
  }

  if (pairs.length === 0) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="dedup-card" onClick={(e) => e.stopPropagation()}>
          <div className="dedup-header">
            <span className="dedup-title">All done</span>
          </div>
          <p className="dedup-empty">No duplicate pairs to review.</p>
          <div className="dedup-actions">
            <button className="dedup-btn dedup-btn--primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { a, b, reason } = pairs[index];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="dedup-card" onClick={(e) => e.stopPropagation()}>
        <div className="dedup-header">
          <span className="dedup-title">Possible duplicate</span>
          <span className="dedup-reason">{reasonLabel(reason)}</span>
          <span className="dedup-progress">
            {index + 1} of {pairs.length}
          </span>
          <button className="ac-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="dedup-body">
          <div className="dedup-columns">
            <div>
              <div className="dedup-col-header">Contact A</div>
              <ContactCard contact={a} other={b} />
            </div>
            <div>
              <div className="dedup-col-header">Contact B</div>
              <ContactCard contact={b} other={a} />
            </div>
          </div>
        </div>

        <div className="dedup-actions">
          <button
            className="dedup-btn dedup-btn--secondary"
            onClick={() => handleAction(null, null, 'skip')}
            disabled={working}
          >
            Skip
          </button>
          <button
            className="dedup-btn dedup-btn--secondary"
            onClick={() => handleAction(a.id, b.id, 'keep')}
            disabled={working}
          >
            Keep left
          </button>
          <button
            className="dedup-btn dedup-btn--secondary"
            onClick={() => handleAction(b.id, a.id, 'keep')}
            disabled={working}
          >
            Keep right
          </button>
          <button
            className="dedup-btn dedup-btn--primary"
            onClick={() => handleAction(a.id, b.id, 'merge')}
            disabled={working}
          >
            Merge both
          </button>
        </div>
      </div>
    </div>
  );
}
