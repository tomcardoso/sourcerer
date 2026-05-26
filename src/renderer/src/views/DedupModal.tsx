import { useState } from 'react';
import { useMutation } from '../hooks/useMutation';
import type { DedupContact, DuplicatePair } from '@shared/types';
import Button from '../shell/Button';
import Modal from '../shell/Modal';
import '../shell/Modal.css';
import './DedupModal.css';

interface Props {
  pairs: DuplicatePair[];
  onClose: () => void;
}

function reasonLabel(reason: DuplicatePair['reason']): string {
  if (reason === 'email') return 'shared email';
  if (reason === 'phone') return 'shared phone';
  return 'similar name';
}

function reasonDescription(reason: DuplicatePair['reason']): string {
  if (reason === 'email') return 'These contacts share at least one email address.';
  if (reason === 'phone') return 'These contacts share at least one phone number.';
  return 'These contacts have very similar names and may be the same person.';
}

function ContactCard({ contact, other }: { contact: DedupContact; other: DedupContact }) {
  const namesDiffer = contact.name !== other.name;
  const orgsDiffer = contact.organization !== other.organization;
  const notesDiffer = contact.notes !== other.notes;

  return (
    <div className="dedup-contact-card">
      <div className="dedup-field">
        <span className="dedup-field-label">Name</span>
        <span className={`dedup-field-value ${namesDiffer ? 'dedup-field-value--unique' : ''}`}>{contact.name}</span>
      </div>

      {(contact.organization || other.organization) && (
        <div className="dedup-field">
          <span className="dedup-field-label">Org</span>
          <span className={`dedup-field-value ${orgsDiffer ? 'dedup-field-value--unique' : ''}`}>{contact.organization || '—'}</span>
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
        <div className="dedup-field">
          <span className="dedup-field-label">Notes</span>
          <span className={`dedup-field-value dedup-notes ${notesDiffer ? 'dedup-field-value--unique' : ''}`}>{contact.notes || '—'}</span>
        </div>
      )}

      <div className="dedup-field dedup-field--projects">
        <span className="dedup-field-label">Projects</span>
        {(contact.projects ?? []).length === 0 ? (
          <span className="dedup-field-value dedup-field-value--empty">none</span>
        ) : (
          <div>
            {(contact.projects ?? []).map((p) => (
              <div key={p} className={`dedup-field-value ${!(other.projects ?? []).includes(p) ? 'dedup-field-value--unique' : ''}`}>{p}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DedupModal({ pairs: initialPairs, onClose }: Props) {
  const [pairs, setPairs] = useState(initialPairs);
  const [index, setIndex] = useState(0);
  function advance() {
    const newPairs = pairs.filter((_, i) => i !== index);
    setPairs(newPairs);
    if (index >= newPairs.length) {
      setIndex(Math.max(0, newPairs.length - 1));
    }
  }

  const { execute: doAction, isPending: working } = useMutation(async (
    winnerId: string | null,
    loserId: string | null,
    strategy: 'keep' | 'merge' | 'skip',
  ) => {
    if (strategy === 'skip') {
      const pair = pairs[0];
      if (pair) {
        await window.sourcerer.mergeContacts({ winnerId: pair.a.id, loserId: pair.b.id, strategy: 'skip' });
      }
    } else {
      await window.sourcerer.mergeContacts({ winnerId: winnerId!, loserId: loserId!, strategy });
    }
    advance();
  });

  function handleAction(
    winnerId: string | null,
    loserId: string | null,
    strategy: 'keep' | 'merge' | 'skip',
  ) {
    doAction(winnerId, loserId, strategy);
  }

  if (pairs.length === 0) {
    return (
      <Modal title="All done" onDismiss={onClose} className="dedup-modal">
        <p className="dedup-empty">No duplicate pairs to review.</p>
        <div className="form-actions">
          <Button variant="accent" onClick={onClose}>
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  const { a, b, reason } = pairs[index];

  return (
    <Modal title="Possible duplicate" onDismiss={onClose} className="dedup-modal">
      <div className="dedup-meta-row">
        <span className="dedup-reason">{reasonLabel(reason)}</span>
        <span className="dedup-progress">{index + 1} of {pairs.length}</span>
      </div>
      <p className="form-description dedup-reason-desc">{reasonDescription(reason)}</p>

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
        <Button
          variant="secondary"
          onClick={() => handleAction(null, null, 'skip')}
          disabled={working}
        >
          Skip
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleAction(a.id, b.id, 'keep')}
          disabled={working}
        >
          Keep left
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleAction(b.id, a.id, 'keep')}
          disabled={working}
        >
          Keep right
        </Button>
        <Button
          variant="accent"
          onClick={() => handleAction(a.id, b.id, 'merge')}
          disabled={working}
        >
          Merge both
        </Button>
      </div>
    </Modal>
  );
}
