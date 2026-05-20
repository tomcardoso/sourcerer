import { useState, useCallback, useEffect, useMemo, useRef, type FormEvent } from 'react';
import type { ContactListItem, CreateContactInput, Project } from '@shared/types';
import { useClickOutside } from '../hooks/useClickOutside';
import Button from '../shell/Button';
import DynamicList from './DynamicList';
import { CalendarPicker } from '../views/CalendarPicker';
import {
  isValidEmail,
  isValidUrl,
  hasDisallowedPhoneChars,
  normalizePhoneForComparison,
  findDuplicates,
} from './contactValidation';
import '../shell/Modal.css';
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

import { HANDLE_TYPES, HANDLE_META } from './handleMeta';
import type { HandleType } from './handleMeta';

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddContactModal({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [title, setTitle] = useState('');
  const [dob, setDob] = useState('');
  const [emails, setEmails] = useState<Array<{ email: string; label: string }>>([{ email: '', label: '' }]);
  const [phones, setPhones] = useState<Array<{ phone: string; label: string }>>([{ phone: '', label: '' }]);
  const [websites, setWebsites] = useState<string[]>(['']);
  const [socials, setSocials] = useState<Record<SocialType, string[]>>({
    linkedin: [''], x: [], instagram: [], facebook: [],
  });
  const [handles, setHandles] = useState<Array<{ type: string; handle: string }>>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailCollisions, setEmailCollisions] = useState<Record<string, string>>({});
  const [phoneCollisions, setPhoneCollisions] = useState<Record<string, string>>({});
  const [emailFormatWarnings, setEmailFormatWarnings] = useState<Record<string, true>>({});
  const [phoneFormatWarnings, setPhoneFormatWarnings] = useState<Record<string, true>>({});
  const [urlFormatWarnings, setUrlFormatWarnings] = useState<Record<string, true>>({});

  // Computed within-form duplicate sets — derived from state, no extra state needed.
  const emailDuplicates = useMemo(
    () => findDuplicates(emails.map((e) => e.email.trim().toLowerCase())),
    [emails],
  );

  const phoneDuplicates = useMemo(
    () => findDuplicates(phones.map((p) => normalizePhoneForComparison(p.phone))),
    [phones],
  );

  const urlDuplicates = useMemo(
    () => findDuplicates([...websites, ...SOCIAL_TYPES.flatMap((t) => socials[t])].map((u) => u.trim())),
    [websites, socials],
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [projectQuery, setProjectQuery] = useState('');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
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

  const handleCloseProjectDropdown = useCallback(() => setProjectDropdownOpen(false), []);
  useClickOutside(projectWrapRef, handleCloseProjectDropdown, { escapeKey: false });

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
    const valid = isValidEmail(value);
    setEmailFormatWarnings((prev) => {
      const next = { ...prev };
      if (!valid) next[value] = true; else delete next[value];
      return next;
    });
    if (!valid) return;
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
    const [isValid, collision] = await Promise.all([
      window.sourcerer.validatePhone(value),
      window.sourcerer.checkCollision({ emails: [], phones: [value] }),
    ]);
    setPhoneFormatWarnings((prev) => {
      const next = { ...prev };
      if (!isValid) next[value] = true; else delete next[value];
      return next;
    });
    setPhoneCollisions((prev) => {
      const next = { ...prev };
      if (collision.phone[value]) next[value] = collision.phone[value];
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
    if (emailDuplicates.size > 0 || phoneDuplicates.size > 0 || urlDuplicates.size > 0) {
      formRef.current?.querySelector<HTMLElement>('.ac-collision-warn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);

    const links = [
      ...websites.filter((u) => u.trim()).map((url) => ({ type: 'website' as const, url })),
      ...SOCIAL_TYPES.flatMap((type) =>
        socials[type].filter((u) => u.trim()).map((url) => ({ type, url })),
      ),
    ];

    const data: CreateContactInput = {
      name: name.trim(),
      organization: org.trim() || undefined,
      title: title.trim() || undefined,
      dob: dob || undefined,
      notes: notes.trim() || undefined,
      emails: emails.filter((e) => e.email.trim()).map((e) => ({ email: e.email, label: e.label.trim() || undefined })),
      phones: phones.filter((p) => p.phone.trim()).map((p) => ({ phone: p.phone, label: p.label.trim() || undefined })),
      links,
      handles: handles.filter((h) => h.handle.trim() && h.type.trim()),
    };

    try {
      const contact = await window.sourcerer.createContact(data);
      await Promise.all([...selectedProjectIds].map((pid) => window.sourcerer.addToProject(contact.id, pid)));
      onCreated(contact);
    } catch (err) {
      console.error('Failed to create contact:', err);
      setSubmitError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
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

        <form ref={formRef} onSubmit={handleSubmit} className="ac-form">
          <div className="ac-field">
            <label htmlFor="ac-name" className="modal-label">
              Name <span className="modal-required">*</span>
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
            <label htmlFor="ac-org" className="modal-label">Organization</label>
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
            <label htmlFor="ac-title" className="modal-label">Title / Role</label>
            <input
              id="ac-title"
              className="ac-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Editor"
              disabled={submitting}
            />
          </div>

          <div className="ac-field">
            <label className="modal-label">Date of birth</label>
            <CalendarPicker
              label="Select date"
              value={dob}
              onChange={setDob}
              showYear
              maxDate={localToday()}
              ariaLabel="Date of birth"
            />
          </div>

          <div className="ac-field">
            <label className="modal-label">Email</label>
            {emails.map((entry, i) => (
              <div key={i}>
                <div className="ac-phone-row">
                  <input
                    className="ac-input"
                    type="email"
                    value={entry.email}
                    placeholder="email@example.com"
                    onChange={(e) => {
                      const prev = entry.email.trim();
                      setEmails(emails.map((em, j) => j === i ? { ...em, email: e.target.value } : em));
                      if (prev) {
                        setEmailFormatWarnings((w) => { if (!w[prev]) return w; const u = { ...w }; delete u[prev]; return u; });
                        setEmailCollisions((c) => { if (!c[prev]) return c; const u = { ...c }; delete u[prev]; return u; });
                      }
                    }}
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
                    ></button>
                  )}
                </div>
                {entry.email.trim() && emailFormatWarnings[entry.email.trim()] && (
                  <div className="ac-collision-warn">
                    ⚠ Invalid email address
                  </div>
                )}
                {entry.email.trim() && !emailFormatWarnings[entry.email.trim()] && emailDuplicates.has(entry.email.trim().toLowerCase()) && (
                  <div className="ac-collision-warn">⚠ Already added</div>
                )}
                {entry.email.trim() && !emailFormatWarnings[entry.email.trim()] && !emailDuplicates.has(entry.email.trim().toLowerCase()) && emailCollisions[entry.email.trim()] && (
                  <div className="ac-collision-warn">
                    Already on: <span>{emailCollisions[entry.email.trim()]}</span>
                  </div>
                )}
              </div>
            ))}
            <Button variant="ghost" type="button" onClick={() => setEmails([...emails, { email: '', label: '' }])}>
              + Add email
            </Button>
          </div>
          <div className="ac-field">
            <label className="modal-label">Phone</label>
            {phones.map((entry, i) => (
              <div key={i}>
                <div className="ac-phone-row">
                  <input
                    className="ac-input"
                    type="text"
                    value={entry.phone}
                    placeholder="+1 555 000 0000"
                    onChange={(e) => {
                      const prev = entry.phone.trim();
                      const newVal = e.target.value.trim();
                      setPhones(phones.map((p, j) => j === i ? { ...p, phone: e.target.value } : p));
                      if (prev && prev !== newVal) {
                        setPhoneFormatWarnings((w) => { if (!w[prev]) return w; const u = { ...w }; delete u[prev]; return u; });
                        setPhoneCollisions((c) => { if (!c[prev]) return c; const u = { ...c }; delete u[prev]; return u; });
                      }
                      if (newVal) {
                        setPhoneFormatWarnings((w) => {
                          const bad = hasDisallowedPhoneChars(newVal);
                          if (bad === !!w[newVal]) return w;
                          const u = { ...w };
                          if (bad) u[newVal] = true; else delete u[newVal];
                          return u;
                        });
                      }
                    }}
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
                    ></button>
                  )}
                </div>
                {entry.phone.trim() && phoneFormatWarnings[entry.phone.trim()] && (
                  <div className="ac-collision-warn">
                    {hasDisallowedPhoneChars(entry.phone.trim())
                      ? '⚠ Phone contains invalid characters'
                      : '⚠ Invalid phone number'}
                  </div>
                )}
                {entry.phone.trim() && !phoneFormatWarnings[entry.phone.trim()] && phoneDuplicates.has(normalizePhoneForComparison(entry.phone)) && (
                  <div className="ac-collision-warn">⚠ Already added</div>
                )}
                {entry.phone.trim() && !phoneFormatWarnings[entry.phone.trim()] && !phoneDuplicates.has(normalizePhoneForComparison(entry.phone)) && phoneCollisions[entry.phone.trim()] && (
                  <div className="ac-collision-warn">
                    Already on: <span>{phoneCollisions[entry.phone.trim()]}</span>
                  </div>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              type="button"
              onClick={() => setPhones([...phones, { phone: '', label: '' }])}
            >
              + Add phone
            </Button>
          </div>

          <div className="ac-field">
            <label className="modal-label">Messaging</label>
            {handles.map((entry, i) => (
              <div key={i} className="ac-phone-row">
                <select
                  className="ac-input ac-handle-type"
                  value={HANDLE_TYPES.includes(entry.type as HandleType) ? entry.type : 'other'}
                  onChange={(e) => setHandles(handles.map((h, j) => j === i ? { ...h, type: e.target.value } : h))}
                  disabled={submitting}
                >
                  {HANDLE_TYPES.map((t) => (
                    <option key={t} value={t}>{HANDLE_META[t].label}</option>
                  ))}
                </select>
                <input
                  className="ac-input"
                  type="text"
                  value={entry.handle}
                  placeholder={HANDLE_META[(HANDLE_TYPES.includes(entry.type as HandleType) ? entry.type : 'other') as HandleType].placeholder}
                  onChange={(e) => setHandles(handles.map((h, j) => j === i ? { ...h, handle: e.target.value } : h))}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="ac-remove"
                  onClick={() => setHandles(handles.filter((_, j) => j !== i))}
                ></button>
              </div>
            ))}
            <Button
              variant="ghost"
              type="button"
              onClick={() => setHandles([...handles, { type: 'signal', handle: '' }])}
            >
              + Add handle
            </Button>
          </div>

          <DynamicList
            label="Website"
            values={websites}
            placeholder="https://example.com"
            onChange={setWebsites}
            onChangeItem={(oldVal) => {
              if (!oldVal) return;
              setUrlFormatWarnings((w) => { if (!w[oldVal]) return w; const u = { ...w }; delete u[oldVal]; return u; });
            }}
            onBlurItem={(val) => {
              if (!val) return;
              setUrlFormatWarnings((prev) => {
                const next = { ...prev };
                if (!isValidUrl(val)) next[val] = true; else delete next[val];
                return next;
              });
            }}
            warnings={Object.fromEntries(
              websites.map((v) => v.trim()).filter(Boolean).flatMap((v) => {
                if (urlFormatWarnings[v]) return [[v, '⚠ Invalid URL']];
                if (urlDuplicates.has(v)) return [[v, '⚠ Already added']];
                return [];
              })
            )}
          />

          {SOCIAL_TYPES.map((type) => (
            <DynamicList
              key={type}
              label={SOCIAL_META[type].label}
              values={socials[type]}
              placeholder={SOCIAL_META[type].placeholder}
              onChange={(vals) => setSocial(type, vals)}
              onChangeItem={(oldVal) => {
                if (!oldVal) return;
                setUrlFormatWarnings((w) => { if (!w[oldVal]) return w; const u = { ...w }; delete u[oldVal]; return u; });
              }}
              onBlurItem={(val) => {
                if (!val) return;
                setUrlFormatWarnings((prev) => {
                  const next = { ...prev };
                  if (!isValidUrl(val)) next[val] = true; else delete next[val];
                  return next;
                });
              }}
              warnings={Object.fromEntries(
                socials[type].map((v) => v.trim()).filter(Boolean).flatMap((v) => {
                  if (urlFormatWarnings[v]) return [[v, '⚠ Invalid URL']];
                  if (urlDuplicates.has(v)) return [[v, '⚠ Already added']];
                  return [];
                })
              )}
            />
          ))}

          {projects.length > 0 && (
            <div className="ac-field">
              <label className="modal-label">Add to projects</label>
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
            <label htmlFor="ac-notes" className="modal-label">Notes</label>
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

          {submitError && <div className="ac-submit-error">{submitError}</div>}

          <div className="ac-actions">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim() || submitting || Object.keys(emailFormatWarnings).length > 0 || Object.keys(phoneFormatWarnings).length > 0 || Object.keys(urlFormatWarnings).length > 0}
              onClick={() => setSubmitError(null)}
            >
              {submitting ? 'Saving…' : 'Add contact'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
