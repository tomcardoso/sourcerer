import { useEffect, useState } from 'react';
import type { ContactDetail as ContactDetailType, ContactAlertRss, Project, User } from '@shared/types';
import Button from '../shell/Button';
import GlobalLogSection from './GlobalLogSection';
import GlobalRemindersSection from './GlobalRemindersSection';
import ContactEditForm, { SOCIAL_TYPES, SOCIAL_META, KNOWN_LINK_TYPES } from './ContactEditForm';
import { isGoogleAlertUrl } from './contactValidation';
import RssAlertPanel from './RssAlertPanel';
import ScreenshotPanel from './ScreenshotPanel';
import { linkifyText } from '../utils/linkify';
import { HANDLE_TYPES, HANDLE_META } from './handleMeta';
import type { HandleType } from './handleMeta';
import './AddContactModal.css';
import './ContactDetail.css';

interface Props {
  contact: ContactDetailType;
  allProjects: Project[];
  onRefresh: () => void;
  onMembershipChanged: () => void;
  onDeleted: (id: string) => void;
  onEditingChange?: (editing: boolean) => void;
  user?: User | null;
}

export default function GlobalTab({ contact, allProjects, onRefresh, onMembershipChanged, onDeleted, onEditingChange, user }: Props) {
  const [editing, setEditing] = useState(false);

  function setEditingAndNotify(value: boolean) {
    setEditing(value);
    onEditingChange?.(value);
  }

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingToProject, setAddingToProject] = useState('');
  const [confirmRemoveProjectId, setConfirmRemoveProjectId] = useState<string | null>(null);
  const [alertRssList, setAlertRssList] = useState<ContactAlertRss[]>([]);
  const [waybackStatus, setWaybackStatus] = useState<Map<string, 'pending' | 'failed'>>(new Map());
  const [newRssUrl, setNewRssUrl] = useState('');

  useEffect(() => {
    return window.sourcerer.onWaybackStatus(({ contactId, url, status }) => {
      if (contactId !== contact.id) return;
      setWaybackStatus((prev) => {
        const next = new Map(prev);
        if (status === 'pending') {
          next.set(url, 'pending');
        } else {
          next.set(url, 'failed');
        }
        return next;
      });
    });
  }, [contact.id]);

  useEffect(() => {
    const archivedUrls = new Set(contact.links.filter((l) => l.wayback_url).map((l) => l.url));
    if (archivedUrls.size === 0) return;
    setWaybackStatus((prev) => {
      if ([...archivedUrls].every((u) => !prev.has(u))) return prev;
      const next = new Map(prev);
      for (const url of archivedUrls) next.delete(url);
      return next;
    });
  }, [contact.links]);

  useEffect(() => {
    let cancelled = false;
    window.sourcerer.listAlertRss(contact.id).then((list) => {
      if (!cancelled) setAlertRssList(list);
    });
    return () => { cancelled = true; };
  }, [contact.id]);

  // Reset edit mode when contact changes
  useEffect(() => {
    setEditingAndNotify(false);
    setNewRssUrl('');
  }, [contact.id]);

  async function handleAddToProject() {
    if (!addingToProject) return;
    try {
      await window.sourcerer.addToProject(contact.id, addingToProject);
      setAddingToProject('');
      onMembershipChanged();
    } catch { /* leave form open for retry */ }
  }

  async function handleRemoveFromProject(projectId: string) {
    try {
      await window.sourcerer.removeFromProject(contact.id, projectId);
      onMembershipChanged();
      setConfirmRemoveProjectId(null);
    } catch { /* leave confirmation open so user can retry */ }
  }

  async function handleDelete() {
    try {
      await window.sourcerer.deleteContact(contact.id);
      onDeleted(contact.id);
    } catch { /* stay open */ }
  }

  async function handleAddRss() {
    const url = newRssUrl.trim();
    if (!url || !isGoogleAlertUrl(url)) return;
    if (alertRssList.some((f) => f.rss_url === url)) return;
    try {
      await window.sourcerer.addAlertRss(contact.id, url);
      const updated = await window.sourcerer.listAlertRss(contact.id);
      setNewRssUrl('');
      setAlertRssList(updated);
    } catch { /* leave URL for retry */ }
  }

  async function handleRemoveRss(id: string) {
    try {
      await window.sourcerer.removeAlertRss(id);
      setAlertRssList((prev) => prev.filter((f) => f.id !== id));
    } catch { /* item stays in list */ }
  }

  const socialLinks = Object.fromEntries(
    SOCIAL_TYPES.map((type) => [type, contact.links.filter((l) => l.type === type)]),
  ) as Record<typeof SOCIAL_TYPES[number], typeof contact.links>;
  const websiteLinks = contact.links.filter((l) => l.type === 'website');
  const otherLinks = contact.links.filter((l) => !KNOWN_LINK_TYPES.has(l.type));
  const contactProjectIds = new Set(contact.projects.map((p) => p.id));
  const availableProjects = allProjects.filter((p) => !contactProjectIds.has(p.id));

  if (editing) {
    return (
      <ContactEditForm
        contact={contact}
        user={user}
        alertRssList={alertRssList}
        newRssUrl={newRssUrl}
        onNewRssUrlChange={setNewRssUrl}
        onAddRss={handleAddRss}
        onRemoveRss={handleRemoveRss}
        onSaved={() => {
          window.sourcerer.listAlertRss(contact.id).then(setAlertRssList);
          onRefresh();
          setEditingAndNotify(false);
        }}
        onCancel={() => setEditingAndNotify(false)}
      />
    );
  }

  function formatDob(dob: string): string {
    const d = new Date(`${dob}T12:00:00`);
    if (isNaN(d.getTime())) return dob;
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  }

  return (
    <div className="detail-body">

      {contact.dob && (
        <div className="detail-section">
          <div className="detail-section-label">Date of birth</div>
          <span className="detail-value">{formatDob(contact.dob)}</span>
        </div>
      )}

      {contact.emails.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Email</div>
          {contact.emails.map((e) => (
            <span key={e.id} className="detail-value">
              <a href={`mailto:${e.email}`} className="detail-link" onClick={(ev) => { ev.preventDefault(); window.open(`mailto:${e.email}`); }}>{e.email}</a>
              {e.label && <span className="detail-phone-label">· {e.label}</span>}
            </span>
          ))}
        </div>
      )}

      {contact.phones.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Phone</div>
          {contact.phones.map((p) => (
            <span key={p.id} className="detail-value">
              {p.phone}
              {p.label && <span className="detail-phone-label">· {p.label}</span>}
            </span>
          ))}
        </div>
      )}

      {contact.handles.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Messaging</div>
          {contact.handles.map((h) => (
            <span key={h.id} className="detail-value">
              {h.handle}
              <span className="detail-phone-label">· {HANDLE_META[(HANDLE_TYPES.includes(h.type as HandleType) ? h.type : 'other') as HandleType].label}</span>
            </span>
          ))}
        </div>
      )}

      {SOCIAL_TYPES.map((type) =>
        socialLinks[type].length > 0 ? (
          <div key={type} className="detail-section">
            <div className="detail-section-label">{SOCIAL_META[type].label}</div>
            {socialLinks[type].map((l) => (
              <a key={l.id} href={l.url} className="detail-link" onClick={(e) => { e.preventDefault(); window.open(l.url); }}>
                {type === 'other' && l.label ? l.label : l.url}
              </a>
            ))}
          </div>
        ) : null,
      )}

      {websiteLinks.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Website</div>
          {websiteLinks.map((l) => (
            <div key={l.id} className="detail-website-row">
              <a href={l.url} className="detail-link" onClick={(e) => { e.preventDefault(); window.open(l.url); }}>{l.url}</a>
              {l.wayback_url && (
                <a href={l.wayback_url} className="detail-wayback-link" onClick={(e) => { e.preventDefault(); window.open(l.wayback_url!); }} title="Wayback Machine snapshot">
                  archived ↗
                </a>
              )}
              {!l.wayback_url && user?.wayback_enabled !== 0 && user?.wayback_keys_configured !== 0 && waybackStatus.get(l.url) === 'pending' && (
                <span className="detail-wayback-pending">archiving…</span>
              )}
              {!l.wayback_url && user?.wayback_enabled !== 0 && user?.wayback_keys_configured !== 0 && waybackStatus.get(l.url) === 'failed' && (
                <span className="detail-wayback-failed" title="Wayback Machine could not archive this URL">archive failed</span>
              )}
            </div>
          ))}
        </div>
      )}

      {otherLinks.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Links</div>
          {otherLinks.map((l) => (
            (l.url.startsWith('http://') || l.url.startsWith('https://'))
              ? <a key={l.id} href={l.url} className="detail-link" onClick={(e) => { e.preventDefault(); window.open(l.url, '_blank', 'noopener,noreferrer'); }}>{l.label || l.url}</a>
              : <span key={l.id} className="detail-value">{l.label || l.url}</span>
          ))}
        </div>
      )}

      {contact.notes && (
        <div className="detail-section">
          <div className="detail-section-label">Notes</div>
          <p className="detail-notes">{linkifyText(contact.notes ?? '')}</p>
        </div>
      )}

      <RssAlertPanel
        editing={false}
        alertRssList={alertRssList}
        newRssUrl={newRssUrl}
        onNewRssUrlChange={setNewRssUrl}
        onAddRss={handleAddRss}
        onRemoveRss={handleRemoveRss}
      />

      <GlobalLogSection contact={contact} onUpdated={onRefresh} />

      <GlobalRemindersSection contact={contact} />

      <div className="detail-section">
        <div className="detail-section-label">Projects</div>
        {contact.projects.length === 0 ? (
          <p className="detail-empty-projects">Not added to any projects yet.</p>
        ) : (
          <ul className="detail-project-list">
            {contact.projects.map((p) => {
              const isDefault = contact.default_membership_id === p.membership_id;
              return (
                <li key={p.id} className="detail-project-item">
                  <span className="detail-project-name">{p.name}</span>
                  {p.status && <span className="detail-project-status">{p.status}</span>}
                  {confirmRemoveProjectId === p.id ? (
                    <span className="detail-project-remove-confirm">
                      <button
                        className="detail-project-remove-yes"
                        onClick={() => handleRemoveFromProject(p.id)}
                      >Remove</button>
                      <button
                        className="detail-project-remove-no"
                        onClick={() => setConfirmRemoveProjectId(null)}
                      >Cancel</button>
                    </span>
                  ) : (
                    <>
                      <button
                        className={`detail-project-default${isDefault ? ' detail-project-default--active' : ''}`}
                        title={isDefault ? 'Clear default project' : 'Set as default project'}
                        onClick={async () => {
                          await window.sourcerer.setContactDefaultProject(contact.id, isDefault ? null : p.membership_id);
                          onRefresh();
                        }}
                      >{isDefault ? '★' : '☆'}</button>
                      <button
                        className="detail-project-remove"
                        title="Remove from project"
                        onClick={() => setConfirmRemoveProjectId(p.id)}
                      >×</button>
                    </>
                  )}
                </li>
              );
            })}
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
              <Button variant="primary" size="sm" onClick={handleAddToProject}>Add</Button>
            )}
          </div>
        )}
      </div>

      <ScreenshotPanel contactId={contact.id} />

      <div className="detail-section detail-danger-zone">
        {confirmDelete ? (
          <div className="detail-confirm-delete">
            <p>Delete {contact.name}? This removes them from all projects and cannot be undone.</p>
            <div className="detail-confirm-actions">
              <Button variant="danger" size="sm" onClick={handleDelete}>Yes, delete</Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="detail-bottom-actions">
            <div className="detail-bottom-left">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.print()}
                title="Print contact sheet"
              >
                Print
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.sourcerer.exportVCardContact(contact.id)}
                title="Export as vCard (.vcf)"
              >
                ↓ vCard
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditingAndNotify(true)}>Edit</Button>
            </div>
            <Button variant="danger-outline" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete contact
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
