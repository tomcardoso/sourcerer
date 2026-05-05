import { useCallback, useEffect, useState } from 'react';
import type { Project, ProjectContactRow } from '@shared/types';
import ContactDetail from '../contacts/ContactDetail';
import './View.css';
import './AllContacts.css';
import './ProjectView.css';

interface Props {
  project: Project | null;
  userEmail: string | null;
}

export default function ProjectView({ project, userEmail }: Props) {
  const [rows, setRows] = useState<ProjectContactRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const refresh = useCallback(() => {
    if (!project) return;
    window.sourcerer.listContactsForProject(project.id).then(setRows);
  }, [project]);

  useEffect(() => {
    setSelectedId(null);
    setRows([]);
    setSearch('');
    refresh();
  }, [refresh]);

  const filtered = search
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return r.name.toLowerCase().includes(q) || (r.organization?.toLowerCase().includes(q) ?? false);
      })
    : rows;

  if (!project) {
    return (
      <div className="view">
        <div className="view-empty">
          <div className="view-empty-label">Project not found</div>
        </div>
      </div>
    );
  }

  function handleDeleted(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">{project.name}</h1>
          {project.description && <p className="view-subtitle">{project.description}</p>}
        </div>
        <span className="project-contact-count">
          {rows.length} contact{rows.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="contacts-body">
        <div className="contacts-table-area">
          {rows.length === 0 ? (
            <div className="view-empty">
              <div className="view-empty-icon">◎</div>
              <div className="view-empty-label">No contacts in this project yet</div>
              <div className="view-empty-hint">
                Open a contact from All Contacts and add it to this project.
              </div>
            </div>
          ) : (
            <>
              <div className="contacts-search-bar">
                <input
                  className="contacts-search"
                  type="text"
                  placeholder="Search contacts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {filtered.length === 0 ? (
                <div className="contacts-no-results">No contacts match "{search}"</div>
              ) : (
                <table className="contacts-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Organization</th>
                      <th>Theme</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Reporter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const isMe = userEmail && r.reporter_email === userEmail;
                      return (
                        <tr
                          key={r.id}
                          className={[
                            selectedId === r.id ? 'selected' : '',
                            isMe ? 'row-mine' : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                        >
                          <td className="contact-name-cell">{r.name}</td>
                          <td className="contact-org-cell">{r.organization ?? '—'}</td>
                          <td className="contact-org-cell">{r.theme ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                          <td>{r.status ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                          <td>{r.priority ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</td>
                          <td className="contact-org-cell">{r.reporter_name}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {selectedId && (
          <ContactDetail
            contactId={selectedId}
            onClose={() => setSelectedId(null)}
            onDeleted={handleDeleted}
            onUpdated={refresh}
          />
        )}
      </div>
    </div>
  );
}
