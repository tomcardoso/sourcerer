import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, ProjectContactRow } from '@shared/types';
import ContactDetail from '../contacts/ContactDetail';
import './View.css';
import './AllContacts.css';
import './ProjectView.css';

interface Props {
  project: Project | null;
  userEmail: string | null;
  onProjectUpdated: (project: Project) => void;
}

export default function ProjectView({ project, userEmail, onProjectUpdated }: Props) {
  const [rows, setRows] = useState<ProjectContactRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [fileUnreachable, setFileUnreachable] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    if (!project) return;
    window.sourcerer.listContactsForProject(project.id).then(setRows);
  }, [project]);

  useEffect(() => {
    setSelectedId(null);
    setRows([]);
    setSearch('');
    setSyncError(null);
    setFileUnreachable(false);
    refresh();
  }, [refresh]);

  // Subscribe to sync status events for this project
  useEffect(() => {
    if (!project?.is_shared) return;
    return window.sourcerer.onSyncStatus((event) => {
      if (event.projectId !== project.id) return;
      setSyncing(false);
      if (!event.success) {
        const msg = event.error ?? 'Unknown sync error';
        const isUnreachable =
          msg.includes('no such file') ||
          msg.includes('ENOENT') ||
          msg.includes('not a database') ||
          msg.includes('Cannot open');
        setFileUnreachable(isUnreachable);
        if (!isUnreachable) setSyncError(msg);
      } else {
        setFileUnreachable(false);
        setSyncError(null);
        refresh();
      }
    });
  }, [project, refresh]);

  async function handleSyncNow() {
    if (!project) return;
    setSyncing(true);
    setSyncError(null);
    await window.sourcerer.triggerSync(project.id);
    // Result comes back via onSyncStatus listener
  }

  async function handleRelocate() {
    if (!project) return;
    const path = await window.sourcerer.openFileDialog();
    if (!path) return;
    await window.sourcerer.relocateSharedProject(project.id, path);
    setFileUnreachable(false);
    handleSyncNow();
  }

  async function handleExport(mode: 'full' | 'sanitized') {
    if (!project) return;
    setShowExportMenu(false);
    setExporting(true);
    await window.sourcerer.exportProject(project.id, mode);
    setExporting(false);
  }

  async function handleRegenerate() {
    if (!project) return;
    const confirmed = window.confirm(
      'This will recreate the shared file from your local data. ' +
        'Any changes made by collaborators that were not yet synced before the file was lost may not be included.\n\n' +
        'Continue?',
    );
    if (!confirmed) return;
    const result = await window.sourcerer.regenerateSharedProject(project.id);
    if (!result) return;
    setFileUnreachable(false);
    // Re-fetch the updated project record then show the new payload
    const projects = await window.sourcerer.listProjects();
    const updated = projects.find((p) => p.id === project.id);
    if (updated) onProjectUpdated(updated);
    // Show the new payload — we'd ideally trigger SetupPayloadModal here,
    // but for now just alert the user that the file was regenerated
    alert(
      'Shared file regenerated. Share the new setup link with your collaborators.\n\nSetup link:\n' +
        result.payload,
    );
  }

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

  const isPendingWrites = project.is_shared === 1 && project.shared_pending_writes === 1;

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">
            {project.name}
            {project.is_shared === 1 && (
              <span
                className={`sync-badge ${isPendingWrites ? 'sync-badge-pending' : syncing ? 'sync-badge-syncing' : 'sync-badge-ok'}`}
                title={
                  syncing
                    ? 'Syncing…'
                    : isPendingWrites
                      ? 'Pending sync — shared file unreachable'
                      : 'Synced'
                }
              />
            )}
          </h1>
          {project.description && <p className="view-subtitle">{project.description}</p>}
        </div>
        <div className="view-header-right">
          <span className="project-contact-count">
            {rows.length} contact{rows.length !== 1 ? 's' : ''}
          </span>
          <div className="export-menu-wrap" ref={exportMenuRef}>
            <button
              className="export-btn"
              onClick={() => setShowExportMenu((v) => !v)}
              disabled={exporting || rows.length === 0}
              title="Export contacts"
            >
              {exporting ? 'Exporting…' : '↓ Export'}
            </button>
            {showExportMenu && (
              <div className="export-menu">
                <button className="export-menu-item" onClick={() => handleExport('full')}>
                  <span className="export-menu-label">Full export</span>
                  <span className="export-menu-desc">All fields including notes and interaction log</span>
                </button>
                <button className="export-menu-item" onClick={() => handleExport('sanitized')}>
                  <span className="export-menu-label">Sanitized export</span>
                  <span className="export-menu-desc">Omits notes and interaction log</span>
                </button>
              </div>
            )}
          </div>
          {project.is_shared === 1 && (
            <button
              className="sync-now-btn"
              onClick={handleSyncNow}
              disabled={syncing}
              title="Sync now"
            >
              {syncing ? 'Syncing…' : '↻ Sync'}
            </button>
          )}
        </div>
      </div>

      {/* File unreachable recovery banner */}
      {fileUnreachable && (
        <div className="recovery-banner">
          <div className="recovery-banner-text">
            <strong>Shared file not found.</strong> The project file may have moved or been deleted.
          </div>
          <div className="recovery-banner-actions">
            <button className="recovery-btn" onClick={handleRelocate}>
              Relocate file…
            </button>
            <button className="recovery-btn recovery-btn-danger" onClick={handleRegenerate}>
              Regenerate from local data…
            </button>
          </div>
        </div>
      )}

      {/* Sync error (non-file-missing) */}
      {syncError && !fileUnreachable && (
        <div className="sync-error-banner">
          Sync error: {syncError}
        </div>
      )}

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
