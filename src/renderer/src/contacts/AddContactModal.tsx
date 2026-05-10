import { useState, useEffect, useRef, type FormEvent } from 'react';
import type { ContactListItem, CreateContactInput, Project } from '@shared/types';
import './AddContactModal.css';

interface Props {
  onCreated: (contact: ContactListItem) => void;
  onCancel: () => void;
}

const SOCIAL_TYPES = ['linkedin', 'x', 'instagram', 'facebook'] as const;
type SocialType = (typeof SOCIAL_TYPES)[number];

const SOCIAL_META: Record<SocialType, { label: string; placeholder: string }> = {
  linkedin:  { label: 'LinkedIn',   placeholder: 'https://linkedin.com/in/…' },
  x:         { label: 'X / Twitter', placeholder: 'https://x.com/…' },
  instagram: { label: 'Instagram',  placeholder: 'https://instagram.com/…' },
  facebook:  { label: 'Facebook',   placeholder: 'https://facebook.com/…' },
};

function DynamicList({
  label,
  values,
  placeholder,
  onChange,
  onBlurItem,
  warnings,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
  onBlurItem?: (value: string) => void;
  warnings?: Record<string, string>;
}) {
  return (
    <div className="ac-field">
      <label className="ac-label">{label}</label>
      {values.map((val, i) => (
        <div key={i}>
          <div className="ac-dynamic-row">
            <input
              className="ac-input"
              type="text"
              value={val}
              placeholder={placeholder}
              onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
              onBlur={() => onBlurItem?.(val.trim())}
            />
            {values.length > 1 && (
              <button
                type="button"
                className="ac-remove"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              >×</button>
            )}
          </div>
          {val.trim() && warnings?.[val.trim()] && (
            <div className="ac-collision-warn">Already on: <strong>{warnings[val.trim()]}</strong></div>
          )}
        </div>
      ))}
      <button type="button" className="ac-add-row" onClick={() => onChange([...values, ''])}>
        + Add {label.toLowerCase()}
      </button>
    </div>
  );
}

export default function AddContactModal({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [emails, setEmails] = useState<Array<{ email: string; label: string }>>([{ email: '', label: '' }]);
  const [phones, setPhones] = useState<Array<{ phone: string; label: string }>>([{ phone: '', label: '' }]);
  const [websites, setWebsites] = useState<string[]>(['']);
  const [socials, setSocials] = useState<Record<SocialType, string[]>>({
    linkedin: [''], x: [], instagram: [], facebook: [],
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailCollisions, setEmailCollisions] = useState<Record<string, string>>({});
  const [phoneCollisions, setPhoneCollisions] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [projectQuery, setProjectQuery] = useState('');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const projectWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  useEffect(() => {
    window.sourcerer.listProjects().then(setProjects);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (projectWrapRef.current && !projectWrapRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProjects = projects.filter(
    (p) => !selectedProjectIds.has(p.id) && p.name.toLowerCase().includes(projectQuery.toLowerCase()),
  );

  function selectProject(id: string) {
    setSelectedProjectIds((prev) => new Set([...prev, id]));
    setProjectQuery('');
    projectInputRef.current?.focus();
  }

  function removeProject(id: string) {
    setSelectedProjectIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  async function checkEmailBlur(value: string) {
    if (!value) return;
    const result = await window.sourcerer.checkCollision({ emails: [value], phones: [] });
    setEmailCollisions((prev) => {
      const next = { ...prev };
      if (result.email[value]) next[value] = result.email[value];
      else delete next[value];
      return next;
    });
  }

  async function checkPhoneBlur(value: string) {
    if (!value) return;
    const result = await window.sourcerer.checkCollision({ emails: [], phones: [value] });
    setPhoneCollisions((prev) => {
      const next = { ...prev };
      if (result.phone[value]) next[value] = result.phone[value];
      else delete next[value];
      return next;
    });
  }

  function setSocial(type: SocialType, values: string[]) {
    setSocials((prev) => ({ ...prev, [type]: values }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    const links = [
      ...websites.filter((u) => u.trim()).map((url) => ({ type: 'website', url })),
      ...SOCIAL_TYPES.flatMap((type) =>
        socials[type].filter((u) => u.trim()).map((url) => ({ type, url })),
      ),
    ];

    const data: CreateContactInput = {
      name: name.trim(),
      organization: org.trim() || undefined,
      notes: notes.trim() || undefined,
      emails: emails.filter((e) => e.email.trim()).map((e) => ({ email: e.email, label: e.label.trim() || undefined })),
      phones: phones.filter((p) => p.phone.trim()).map((p) => ({ phone: p.phone, label: p.label.trim() || undefined })),
      links,
    };

    const contact = await window.sourcerer.createContact(data);
    await Promise.all([...selectedProjectIds].map((pid) => window.sourcerer.addToProject(contact.id, pid)));
    onCreated(contact);
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="ac-card">
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

          <div className="ac-field">
            <label className="ac-label">Email</label>
            {emails.map((entry, i) => (
              <div key={i}>
                <div className="ac-phone-row">
                  <input
                    className="ac-input"
                    type="email"
                    value={entry.email}
                    placeholder="email@example.com"
                    onChange={(e) => setEmails(emails.map((em, j) => j === i ? { ...em, email: e.target.value } : em))}
                    onBlur={() => checkEmailBlur(entry.email.trim())}
                    disabled={submitting}
                  />
                  <input
                    className="ac-input"
                    type="text"
                    value={entry.label}
                    placeholder="label"
                    onChange={(e) => setEmails(emails.map((em, j) => j === i ? { ...em, label: e.target.value } : em))}
                    disabled={submitting}
                  />
                  {emails.length > 1 && (
                    <button
                      type="button"
                      className="ac-remove"
                      onClick={() => setEmails(emails.filter((_, j) => j !== i))}
                    >×</button>
                  )}
                </div>
                {entry.email.trim() && emailCollisions[entry.email.trim()] && (
                  <div className="ac-collision-warn">
                    Already on: <strong>{emailCollisions[entry.email.trim()]}</strong>
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="ac-add-row" onClick={() => setEmails([...emails, { email: '', label: '' }])}>
              + Add email
            </button>
          </div>
          <div className="ac-field">
            <label className="ac-label">Phone</label>
            {phones.map((entry, i) => (
              <div key={i}>
                <div className="ac-phone-row">
                  <input
                    className="ac-input"
                    type="text"
                    value={entry.phone}
                    placeholder="+1 555 000 0000"
                    onChange={(e) => setPhones(phones.map((p, j) => j === i ? { ...p, phone: e.target.value } : p))}
                    onBlur={() => checkPhoneBlur(entry.phone.trim())}
                    disabled={submitting}
                  />
                  <input
                    className="ac-input"
                    type="text"
                    value={entry.label}
                    placeholder="label"
                    onChange={(e) => setPhones(phones.map((p, j) => j === i ? { ...p, label: e.target.value } : p))}
                    disabled={submitting}
                  />
                  {phones.length > 1 && (
                    <button
                      type="button"
                      className="ac-remove"
                      onClick={() => setPhones(phones.filter((_, j) => j !== i))}
                    >×</button>
                  )}
                </div>
                {entry.phone.trim() && phoneCollisions[entry.phone.trim()] && (
                  <div className="ac-collision-warn">
                    Already on: <strong>{phoneCollisions[entry.phone.trim()]}</strong>
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              className="ac-add-row"
              onClick={() => setPhones([...phones, { phone: '', label: '' }])}
            >
              + Add phone
            </button>
          </div>

          <DynamicList
            label="Website"
            values={websites}
            placeholder="https://example.com"
            onChange={setWebsites}
          />

          {SOCIAL_TYPES.map((type) => (
            <DynamicList
              key={type}
              label={SOCIAL_META[type].label}
              values={socials[type]}
              placeholder={SOCIAL_META[type].placeholder}
              onChange={(vals) => setSocial(type, vals)}
            />
          ))}

          {projects.length > 0 && (
            <div className="ac-field">
              <label className="ac-label">Add to projects</label>
              <div className="ac-project-select" ref={projectWrapRef}>
                <div className="ac-project-chips">
                  {[...selectedProjectIds].map((id) => {
                    const p = projects.find((p) => p.id === id);
                    if (!p) return null;
                    return (
                      <span key={id} className="ac-project-chip">
                        {p.name}
                        <button
                          type="button"
                          className="ac-project-chip-remove"
                          onClick={() => removeProject(id)}
                          disabled={submitting}
                        >×</button>
                      </span>
                    );
                  })}
                  <input
                    ref={projectInputRef}
                    className="ac-project-search"
                    type="text"
                    value={projectQuery}
                    onChange={(e) => { setProjectQuery(e.target.value); setProjectDropdownOpen(true); }}
                    onFocus={() => setProjectDropdownOpen(true)}
                    placeholder={selectedProjectIds.size === 0 ? 'Search projects…' : ''}
                    disabled={submitting}
                  />
                </div>
                {projectDropdownOpen && filteredProjects.length > 0 && (
                  <div className="ac-project-dropdown">
                    {filteredProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="ac-project-option"
                        onMouseDown={(e) => { e.preventDefault(); selectProject(p.id); }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

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
