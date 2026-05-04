import { useState, type FormEvent } from 'react';
import type { ContactListItem, CreateContactInput } from '@shared/types';
import './AddContactModal.css';

interface Props {
  onCreated: (contact: ContactListItem) => void;
  onCancel: () => void;
}

function DynamicList({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="ac-field">
      <label className="ac-label">{label}</label>
      {values.map((val, i) => (
        <div key={i} className="ac-dynamic-row">
          <input
            className="ac-input"
            type="text"
            value={val}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
          />
          {values.length > 1 && (
            <button
              type="button"
              className="ac-remove"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="ac-add-row"
        onClick={() => onChange([...values, ''])}
      >
        + Add {label.toLowerCase()}
      </button>
    </div>
  );
}

export default function AddContactModal({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [emails, setEmails] = useState<string[]>(['']);
  const [phones, setPhones] = useState<string[]>(['']);
  const [linkedin, setLinkedin] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const data: CreateContactInput = {
      name: name.trim(),
      organization: org.trim() || undefined,
      notes: notes.trim() || undefined,
      emails: emails.filter((e) => e.trim()),
      phones: phones.filter((p) => p.trim()),
      linkedinUrl: linkedin.trim() || undefined,
    };

    const contact = await window.sourceror.createContact(data);
    onCreated(contact);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="ac-card" onClick={(e) => e.stopPropagation()}>
        <div className="ac-header">
          <h2 className="ac-title">Add Contact</h2>
          <button className="ac-close" onClick={onCancel}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="ac-form">
          <div className="ac-field">
            <label htmlFor="ac-name" className="ac-label">
              Name <span className="ac-required">*</span>
            </label>
            <input
              id="ac-name"
              className="ac-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="ac-field">
            <label htmlFor="ac-org" className="ac-label">Organization</label>
            <input
              id="ac-org"
              className="ac-input"
              type="text"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="Employer or institution"
              disabled={submitting}
            />
          </div>

          <DynamicList label="Email" values={emails} placeholder="email@example.com" onChange={setEmails} />
          <DynamicList label="Phone" values={phones} placeholder="+1 555 000 0000" onChange={setPhones} />

          <div className="ac-field">
            <label htmlFor="ac-linkedin" className="ac-label">LinkedIn URL</label>
            <input
              id="ac-linkedin"
              className="ac-input"
              type="url"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://linkedin.com/in/..."
              disabled={submitting}
            />
          </div>

          <div className="ac-field">
            <label htmlFor="ac-notes" className="ac-label">Notes</label>
            <textarea
              id="ac-notes"
              className="ac-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferred contact method, topics they will or won't discuss, relationship history…"
              rows={4}
              disabled={submitting}
            />
          </div>

          <div className="ac-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="modal-btn-create"
              disabled={!name.trim() || submitting}
            >
              {submitting ? 'Saving…' : 'Add contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
