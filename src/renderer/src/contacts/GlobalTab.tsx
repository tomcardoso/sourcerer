import { useState } from 'react';
import type { ContactDetail as ContactDetailType, Project } from '@shared/types';
import './AddContactModal.css';
import './ContactDetail.css';

interface Props {
  contact: ContactDetailType;
  allProjects: Project[];
  onRefresh: () => void;
  onMembershipChanged: () => void;
  onDeleted: (id: string) => void;
}

function DynamicList({
  values,
  placeholder,
  onChange,
}: {
  values: string[];
  placeholder: string;
  onChange: (vals: string[]) => void;
}) {
  return (
    <div>
      {values.map((v, i) => (
        <div key={i} className="ac-dynamic-row">
          <input
            className="ac-input"
            value={v}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            className="ac-remove"
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            ×
          </button>
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

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editOrg, setEditOrg] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editEmails, setEditEmails] = useState<string[]>([]);
  const [editPhones, setEditPhones] = useState<string[]>([]);
  const [editLinkedin, setEditLinkedin] = useState('');

  function startEdit() {
    setEditName(contact.name);
    setEditOrg(contact.organization ?? '');
    setEditNotes(contact.notes ?? '');
    setEditEmails(contact.emails.map((e) => e.email));
    setEditPhones(contact.phones.map((p) => p.phone));
    const li = contact.links.find((l) => l.type === 'linkedin');
    setEditLinkedin(li?.url ?? '');
    setEditing(true);
  }

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await window.sourceror.updateContact({
        id: contact.id,
        name: editName,
        organization: editOrg,
        notes: editNotes,
        emails: editEmails,
        phones: editPhones,
        linkedinUrl: editLinkedin,
      });
      onRefresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddToProject() {
    if (!addingToProject) return;
    await window.sourceror.addToProject(contact.id, addingToProject);
    setAddingToProject('');
    onMembershipChanged();
  }

  async function handleRemoveFromProject(projectId: string) {
    await window.sourceror.removeFromProject(contact.id, projectId);
    onMembershipChanged();
  }

  async function handleDelete() {
    await window.sourceror.deleteContact(contact.id);
    onDeleted(contact.id);
  }

  const linkedinLink = contact.links.find((l) => l.type === 'linkedin');
  const otherLinks = contact.links.filter((l) => l.type !== 'linkedin');
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
          <input
            className="ac-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="ac-field">
          <label className="ac-label">Organization</label>
          <input
            className="ac-input"
            value={editOrg}
            onChange={(e) => setEditOrg(e.target.value)}
          />
        </div>

        <div className="ac-field">
          <label className="ac-label">Email</label>
          <DynamicList values={editEmails} placeholder="email@example.com" onChange={setEditEmails} />
        </div>

        <div className="ac-field">
          <label className="ac-label">Phone</label>
          <DynamicList values={editPhones} placeholder="+1 555 000 0000" onChange={setEditPhones} />
        </div>

        <div className="ac-field">
          <label className="ac-label">LinkedIn URL</label>
          <input
            className="ac-input"
            value={editLinkedin}
            onChange={(e) => setEditLinkedin(e.target.value)}
            placeholder="https://linkedin.com/in/…"
          />
        </div>

        <div className="ac-field">
          <label className="ac-label">Notes</label>
          <textarea
            className="ac-textarea"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            rows={4}
          />
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

      {linkedinLink && (
        <div className="detail-section">
          <div className="detail-section-label">LinkedIn</div>
          <a href={linkedinLink.url} className="detail-link"
            onClick={(e) => e.preventDefault()}>
            {linkedinLink.url}
          </a>
        </div>
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
              <button className="detail-delete-confirm-btn" onClick={handleDelete}>
                Yes, delete
              </button>
              <button className="detail-cancel-btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
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
