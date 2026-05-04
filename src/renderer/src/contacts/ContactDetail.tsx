import { useEffect, useState } from 'react';
import type { ContactDetail as ContactDetailType, Project } from '@shared/types';
import './ContactDetail.css';

interface Props {
  contactId: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: () => void;
}

export default function ContactDetail({ contactId, onClose, onDeleted, onUpdated }: Props) {
  const [contact, setContact] = useState<ContactDetailType | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [addingToProject, setAddingToProject] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setContact(null);
    setConfirmDelete(false);
    window.sourceror.getContact(contactId).then(setContact);
    window.sourceror.listProjects().then(setAllProjects);
  }, [contactId]);

  async function handleAddToProject() {
    if (!addingToProject || !contact) return;
    await window.sourceror.addToProject(contact.id, addingToProject);
    const updated = await window.sourceror.getContact(contact.id);
    setContact(updated);
    setAddingToProject('');
    onUpdated();
  }

  async function handleRemoveFromProject(projectId: string) {
    if (!contact) return;
    await window.sourceror.removeFromProject(contact.id, projectId);
    const updated = await window.sourceror.getContact(contact.id);
    setContact(updated);
    onUpdated();
  }

  async function handleDelete() {
    if (!contact) return;
    await window.sourceror.deleteContact(contact.id);
    onDeleted(contact.id);
  }

  const linkedinLink = contact?.links.find((l) => l.type === 'linkedin');
  const otherLinks = contact?.links.filter((l) => l.type !== 'linkedin') ?? [];
  const contactProjectIds = new Set(contact?.projects.map((p) => p.id) ?? []);
  const availableProjects = allProjects.filter((p) => !contactProjectIds.has(p.id));

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-header-main">
          {contact ? (
            <>
              <h2 className="detail-name">{contact.name}</h2>
              {contact.organization && (
                <p className="detail-org">{contact.organization}</p>
              )}
            </>
          ) : (
            <div className="detail-loading">Loading…</div>
          )}
        </div>
        <button className="detail-close" onClick={onClose}>×</button>
      </div>

      {contact && (
        <div className="detail-body">
          {/* Emails */}
          {contact.emails.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Email</div>
              {contact.emails.map((e) => (
                <a key={e.id} href={`mailto:${e.email}`} className="detail-link">
                  {e.email}
                </a>
              ))}
            </div>
          )}

          {/* Phones */}
          {contact.phones.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Phone</div>
              {contact.phones.map((p) => (
                <span key={p.id} className="detail-value">{p.phone}</span>
              ))}
            </div>
          )}

          {/* LinkedIn */}
          {linkedinLink && (
            <div className="detail-section">
              <div className="detail-section-label">LinkedIn</div>
              <a
                href={linkedinLink.url}
                className="detail-link"
                onClick={(e) => { e.preventDefault(); /* shell.openExternal handled by main */ }}
              >
                {linkedinLink.url}
              </a>
            </div>
          )}

          {/* Other links */}
          {otherLinks.length > 0 && (
            <div className="detail-section">
              <div className="detail-section-label">Links</div>
              {otherLinks.map((l) => (
                <a key={l.id} href={l.url} className="detail-link">
                  {l.label || l.url}
                </a>
              ))}
            </div>
          )}

          {/* Notes */}
          {contact.notes && (
            <div className="detail-section">
              <div className="detail-section-label">Notes</div>
              <p className="detail-notes">{contact.notes}</p>
            </div>
          )}

          {/* Projects */}
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
                    >
                      ×
                    </button>
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
                  <button className="detail-add-btn" onClick={handleAddToProject}>
                    Add
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Danger zone */}
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
      )}
    </div>
  );
}
