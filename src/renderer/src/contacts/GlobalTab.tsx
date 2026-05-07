import { useEffect, useState } from 'react';
import type { ContactDetail as ContactDetailType, ContactAlertRss, Project } from '@shared/types';
import './AddContactModal.css';
import './ContactDetail.css';

interface Props {
  contact: ContactDetailType;
  allProjects: Project[];
  onRefresh: () => void;
  onMembershipChanged: () => void;
  onDeleted: (id: string) => void;
}

const SOCIAL_TYPES = ['linkedin', 'x', 'instagram', 'facebook'] as const;
type SocialType = (typeof SOCIAL_TYPES)[number];

const SOCIAL_META: Record<SocialType, { label: string; placeholder: string }> = {
  linkedin:  { label: 'LinkedIn',    placeholder: 'https://linkedin.com/in/…' },
  x:         { label: 'X / Twitter', placeholder: 'https://x.com/…' },
  instagram: { label: 'Instagram',   placeholder: 'https://instagram.com/…' },
  facebook:  { label: 'Facebook',    placeholder: 'https://facebook.com/…' },
};

function DynamicList({
  values,
  placeholder,
  onChange,
  onBlurItem,
  warnings,
}: {
  values: string[];
  placeholder: string;
  onChange: (vals: string[]) => void;
  onBlurItem?: (value: string) => void;
  warnings?: Record<string, string>;
}) {
  return (
    <div>
      {values.map((v, i) => (
        <div key={i}>
          <div className="ac-dynamic-row">
            <input
              className="ac-input"
              value={v}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              onBlur={() => onBlurItem?.(v.trim())}
            />
            <button
              className="ac-remove"
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >×</button>
          </div>
          {v.trim() && warnings?.[v.trim()] && (
            <div className="ac-collision-warn">Already on: <strong>{warnings[v.trim()]}</strong></div>
          )}
        </div>
      ))}
      <button className="ac-add-row" type="button" onClick={() => onChange([...values, ''])}>
        + Add
      </button>
    </div>
  );
}

export default function GlobalTab({ contact, allProjects, onRefresh, onMembershipChanged, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingToProject, setAddingToProject] = useState('');
  const [alertRss, setAlertRss] = useState<ContactAlertRss | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editOrg, setEditOrg] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editEmails, setEditEmails] = useState<string[]>([]);
  const [editPhones, setEditPhones] = useState<Array<{ phone: string; label: string }>>([]);
  const [editSocials, setEditSocials] = useState<Record<SocialType, string[]>>({
    linkedin: [], x: [], instagram: [], facebook: [],
  });
  const [editRssUrl, setEditRssUrl] = useState('');
  const [emailCollisions, setEmailCollisions] = useState<Record<string, string>>({});
  const [phoneCollisions, setPhoneCollisions] = useState<Record<string, string>>({});

  useEffect(() => {
    window.sourcerer.getAlertRss(contact.id).then(setAlertRss);
  }, [contact.id]);

  function startEdit() {
    setEditName(contact.name);
    setEditOrg(contact.organization ?? '');
    setEditNotes(contact.notes ?? '');
    setEditEmails(contact.emails.map((e) => e.email));
    setEditPhones(contact.phones.map((p) => ({ phone: p.phone, label: p.label ?? '' })));
    const socialsByType = Object.fromEntries(
      SOCIAL_TYPES.map((type) => [
        type,
        contact.links.filter((l) => l.type === type || (type === 'x' && l.type === 'twitter')).map((l) => l.url),
      ]),
    ) as Record<SocialType, string[]>;
    setEditSocials(socialsByType);
    setEditRssUrl(alertRss?.rss_url ?? '');
    setEmailCollisions({});
    setPhoneCollisions({});
    setEditing(true);
  }

  async function checkEmailBlur(value: string) {
    if (!value) return;
    const result = await window.sourcerer.checkCollision({ emails: [value], phones: [], excludeId: contact.id });
    setEmailCollisions((prev) => {
      const next = { ...prev };
      if (result.email[value]) next[value] = result.email[value]; else delete next[value];
      return next;
    });
  }

  async function checkPhoneBlur(value: string) {
    if (!value) return;
    const result = await window.sourcerer.checkCollision({ emails: [], phones: [value], excludeId: contact.id });
    setPhoneCollisions((prev) => {
      const next = { ...prev };
      if (result.phone[value]) next[value] = result.phone[value]; else delete next[value];
      return next;
    });
  }

  function setSocial(type: SocialType, values: string[]) {
    setEditSocials((prev) => ({ ...prev, [type]: values }));
  }

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const links = SOCIAL_TYPES.flatMap((type) =>
        editSocials[type].filter((u) => u.trim()).map((url) => ({ type, url })),
      );
      await window.sourcerer.updateContact({
        id: contact.id,
        name: editName,
        organization: editOrg,
        notes: editNotes,
        emails: editEmails,
        phones: editPhones.map((p) => ({ phone: p.phone, label: p.label.trim() || undefined })),
        links,
      });
      // Persist RSS URL change
      const trimmedRss = editRssUrl.trim();
      if (trimmedRss && trimmedRss !== alertRss?.rss_url) {
        await window.sourcerer.setAlertRss(contact.id, trimmedRss);
        const updated = await window.sourcerer.getAlertRss(contact.id);
        setAlertRss(updated);
      } else if (!trimmedRss && alertRss) {
        await window.sourcerer.clearAlertRss(contact.id);
        setAlertRss(null);
      }
      onRefresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddToProject() {
    if (!addingToProject) return;
    await window.sourcerer.addToProject(contact.id, addingToProject);
    setAddingToProject('');
    onMembershipChanged();
  }

  async function handleRemoveFromProject(projectId: string) {
    await window.sourcerer.removeFromProject(contact.id, projectId);
    onMembershipChanged();
  }

  async function handleDelete() {
    await window.sourcerer.deleteContact(contact.id);
    onDeleted(contact.id);
  }

  // View mode: group links by type
  const socialLinks = Object.fromEntries(
    SOCIAL_TYPES.map((type) => [type, contact.links.filter((l) => l.type === type)]),
  ) as Record<SocialType, typeof contact.links>;
  const knownTypes = new Set<string>(SOCIAL_TYPES);
  const otherLinks = contact.links.filter((l) => !knownTypes.has(l.type));
  const contactProjectIds = new Set(contact.projects.map((p) => p.id));
  const availableProjects = allProjects.filter((p) => !contactProjectIds.has(p.id));

  if (editing) {
    return (
      <div className="detail-body">
        <div className="detail-edit-actions-top">
          <button className="detail-save-btn" onClick={handleSave} disabled={saving || !editName.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="detail-cancel-btn" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        </div>

        <div className="ac-field">
          <label className="ac-label">Name <span className="ac-required">*</span></label>
          <input className="ac-input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
        </div>

        <div className="ac-field">
          <label className="ac-label">Organization</label>
          <input className="ac-input" value={editOrg} onChange={(e) => setEditOrg(e.target.value)} />
        </div>

        <div className="ac-field">
          <label className="ac-label">Email</label>
          <DynamicList
            values={editEmails}
            placeholder="email@example.com"
            onChange={setEditEmails}
            onBlurItem={checkEmailBlur}
            warnings={emailCollisions}
          />
        </div>

        <div className="ac-field">
          <label className="ac-label">Phone</label>
          {editPhones.map((entry, i) => (
            <div key={i}>
              <div className="ac-phone-row">
                <input
                  className="ac-input"
                  value={entry.phone}
                  placeholder="+1 555 000 0000"
                  onChange={(e) => {
                    const next = [...editPhones];
                    next[i] = { ...next[i], phone: e.target.value };
                    setEditPhones(next);
                  }}
                  onBlur={() => checkPhoneBlur(entry.phone.trim())}
                />
                <input
                  className="ac-input"
                  value={entry.label}
                  placeholder="label…"
                  onChange={(e) => {
                    const next = [...editPhones];
                    next[i] = { ...next[i], label: e.target.value };
                    setEditPhones(next);
                  }}
                />
                <button
                  className="ac-remove"
                  type="button"
                  onClick={() => setEditPhones(editPhones.filter((_, j) => j !== i))}
                >×</button>
              </div>
              {entry.phone.trim() && phoneCollisions[entry.phone.trim()] && (
                <div className="ac-collision-warn">
                  Already on: <strong>{phoneCollisions[entry.phone.trim()]}</strong>
                </div>
              )}
            </div>
          ))}
          <button
            className="ac-add-row"
            type="button"
            onClick={() => setEditPhones([...editPhones, { phone: '', label: '' }])}
          >
            + Add
          </button>
        </div>

        {SOCIAL_TYPES.map((type) => (
          <div key={type} className="ac-field">
            <label className="ac-label">{SOCIAL_META[type].label}</label>
            <DynamicList
              values={editSocials[type]}
              placeholder={SOCIAL_META[type].placeholder}
              onChange={(vals) => setSocial(type, vals)}
            />
          </div>
        ))}

        <div className="ac-field">
          <label className="ac-label">Notes</label>
          <textarea
            className="ac-textarea"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={4}
          />
        </div>

        <div className="ac-field">
          <label className="ac-label">Alert RSS URL</label>
          <input
            className="ac-input"
            type="url"
            value={editRssUrl}
            onChange={(e) => setEditRssUrl(e.target.value)}
            placeholder="https://news.google.com/rss/search?q=…"
          />
          <p className="ac-field-hint">Paste a Google Alerts or any RSS feed URL to track mentions of this contact.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-body">
      <div className="detail-edit-row">
        <button className="detail-edit-btn" onClick={startEdit}>Edit</button>
      </div>

      {contact.emails.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Email</div>
          {contact.emails.map((e) => (
            <a key={e.id} href={`mailto:${e.email}`} className="detail-link">{e.email}</a>
          ))}
        </div>
      )}

      {contact.phones.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Phone</div>
          {contact.phones.map((p) => (
            <span key={p.id} className="detail-value">{p.phone}</span>
          ))}
        </div>
      )}

      {SOCIAL_TYPES.map((type) =>
        socialLinks[type].length > 0 ? (
          <div key={type} className="detail-section">
            <div className="detail-section-label">{SOCIAL_META[type].label}</div>
            {socialLinks[type].map((l) => (
              <a key={l.id} href={l.url} className="detail-link" onClick={(e) => e.preventDefault()}>
                {l.url}
              </a>
            ))}
          </div>
        ) : null,
      )}

      {otherLinks.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Links</div>
          {otherLinks.map((l) => (
            <a key={l.id} href={l.url} className="detail-link">{l.label || l.url}</a>
          ))}
        </div>
      )}

      {contact.notes && (
        <div className="detail-section">
          <div className="detail-section-label">Notes</div>
          <p className="detail-notes">{contact.notes}</p>
        </div>
      )}

      {alertRss && (
        <div className="detail-section">
          <div className="detail-section-label">
            Alert RSS
            {alertRss.is_invalid === 1 && (
              <span className="detail-rss-invalid" title="Feed could not be fetched"> ⚠</span>
            )}
          </div>
          <a
            href={alertRss.rss_url}
            className="detail-link detail-rss-url"
            onClick={(e) => e.preventDefault()}
            title={alertRss.rss_url}
          >
            {alertRss.rss_url.length > 60
              ? alertRss.rss_url.slice(0, 60) + '…'
              : alertRss.rss_url}
          </a>
          {alertRss.last_polled_at && (
            <span className="detail-rss-polled">
              Last polled {new Date(alertRss.last_polled_at * 1000).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      <div className="detail-section">
        <div className="detail-section-label">Projects</div>
        {contact.projects.length === 0 ? (
          <p className="detail-empty-projects">Not added to any projects yet.</p>
        ) : (
          <ul className="detail-project-list">
            {contact.projects.map((p) => (
              <li key={p.id} className="detail-project-item">
                <span className="detail-project-name">{p.name}</span>
                {p.status && <span className="detail-project-status">{p.status}</span>}
                <button
                  className="detail-project-remove"
                  title="Remove from project"
                  onClick={() => handleRemoveFromProject(p.id)}
                >×</button>
              </li>
            ))}
          </ul>
        )}

        {availableProjects.length > 0 && (
          <div className="detail-add-project">
            <select
              className="detail-project-select"
              value={addingToProject}
              onChange={(e) => setAddingToProject(e.target.value)}
            >
              <option value="">Add to project…</option>
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {addingToProject && (
              <button className="detail-add-btn" onClick={handleAddToProject}>Add</button>
            )}
          </div>
        )}
      </div>

      <div className="detail-section detail-danger-zone">
        {confirmDelete ? (
          <div className="detail-confirm-delete">
            <p>Delete {contact.name}? This removes them from all projects and cannot be undone.</p>
            <div className="detail-confirm-actions">
              <button className="detail-delete-confirm-btn" onClick={handleDelete}>Yes, delete</button>
              <button className="detail-cancel-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="detail-delete-btn" onClick={() => setConfirmDelete(true)}>
            Delete contact
          </button>
        )}
      </div>
    </div>
  );
}
