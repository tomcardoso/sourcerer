import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, ProjectContactRow, StatusOption, PriorityOption } from '@shared/types';
import ContactDetail from '../contacts/ContactDetail';
import ColumnHeader, {
  TextFilter,
  ToggleFilter,
  PresetFilter,
  MultiSelectFilter,
} from './ColumnHeader';
import './View.css';
import './AllContacts.css';
import './ProjectView.css';

interface Props {
  project: Project | null;
  userEmail: string | null;
  onProjectUpdated: (project: Project) => void;
}

type SortKey =
  | 'name'
  | 'organization'
  | 'status'
  | 'priority'
  | 'reporter'
  | 'date_last_contacted';
type SortDir = 'asc' | 'desc';
type DatePreset = 'never' | 'contacted' | 'not_30' | 'not_90';

interface Filters {
  name: string;
  organization: string;
  notes: string;
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  dateLastContacted: DatePreset | null;
  status: string[];
  priority: string[];
  reporter: string[];
}

const DEFAULT_FILTERS: Filters = {
  name: '',
  organization: '',
  notes: '',
  hasEmail: null,
  hasPhone: null,
  dateLastContacted: null,
  status: [],
  priority: [],
  reporter: [],
};

function fmtDate(ts: number | null): string {
  if (ts === null) return 'Never';
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isFilterActive(f: Filters): boolean {
  return (
    f.name !== '' ||
    f.organization !== '' ||
    f.notes !== '' ||
    f.hasEmail !== null ||
    f.hasPhone !== null ||
    f.dateLastContacted !== null ||
    f.status.length > 0 ||
    f.priority.length > 0 ||
    f.reporter.length > 0
  );
}

export default function ProjectView({ project, userEmail, onProjectUpdated }: Props) {
  const [rows, setRows] = useState<ProjectContactRow[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<PriorityOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [fileUnreachable, setFileUnreachable] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: 'asc' });
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    if (!project) return;
    window.sourcerer.listContactsForProject(project.id).then(setRows);
  }, [project]);

  useEffect(() => {
    setSelectedId(null);
    setRows([]);
    setSort({ key: null, dir: 'asc' });
    setFilters(DEFAULT_FILTERS);
    setOpenFilter(null);
    setSyncError(null);
    setFileUnreachable(false);
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.sourcerer.listStatusOptions().then(setStatusOptions);
    window.sourcerer.listPriorityOptions().then(setPriorityOptions);
  }, []);

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
    const projects = await window.sourcerer.listProjects();
    const updated = projects.find((p) => p.id === project.id);
    if (updated) onProjectUpdated(updated);
    alert(
      'Shared file regenerated. Share the new setup link with your collaborators.\n\nSetup link:\n' +
        result.payload,
    );
  }

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFilter(col: string) {
    setOpenFilter((prev) => (prev === col ? null : col));
  }

  function handleSort(key: SortKey) {
    setSort((prev) => {
      if (prev.key === key) {
        if (prev.dir === 'asc') return { key, dir: 'desc' };
        return { key: null, dir: 'asc' };
      }
      return { key, dir: 'asc' };
    });
  }

  // Build sort-order lookup maps for status/priority
  const statusOrderMap = new Map<string, number>(
    statusOptions.map((o, i) => [o.label, i]),
  );
  const priorityOrderMap = new Map<string, number>(
    priorityOptions.map((o, i) => [o.label, i]),
  );

  const now = Math.floor(Date.now() / 1000);
  let displayed = rows;

  if (filters.name) {
    const q = filters.name.toLowerCase();
    displayed = displayed.filter((r) => r.name.toLowerCase().includes(q));
  }
  if (filters.organization) {
    const q = filters.organization.toLowerCase();
    displayed = displayed.filter((r) => (r.organization ?? '').toLowerCase().includes(q));
  }
  if (filters.notes) {
    const q = filters.notes.toLowerCase();
    displayed = displayed.filter((r) => (r.notes ?? '').toLowerCase().includes(q));
  }
  if (filters.hasEmail !== null) {
    displayed = displayed.filter((r) => (filters.hasEmail ? r.has_email === 1 : r.has_email === 0));
  }
  if (filters.hasPhone !== null) {
    displayed = displayed.filter((r) => (filters.hasPhone ? r.has_phone === 1 : r.has_phone === 0));
  }
  if (filters.dateLastContacted === 'never') {
    displayed = displayed.filter((r) => r.date_last_contacted === null);
  } else if (filters.dateLastContacted === 'contacted') {
    displayed = displayed.filter((r) => r.date_last_contacted !== null);
  } else if (filters.dateLastContacted === 'not_30') {
    displayed = displayed.filter(
      (r) => r.date_last_contacted === null || r.date_last_contacted < now - 30 * 86400,
    );
  } else if (filters.dateLastContacted === 'not_90') {
    displayed = displayed.filter(
      (r) => r.date_last_contacted === null || r.date_last_contacted < now - 90 * 86400,
    );
  }
  if (filters.status.length > 0) {
    displayed = displayed.filter((r) => filters.status.includes(r.status ?? ''));
  }
  if (filters.priority.length > 0) {
    displayed = displayed.filter((r) => filters.priority.includes(r.priority ?? ''));
  }
  if (filters.reporter.length > 0) {
    displayed = displayed.filter((r) => filters.reporter.includes(r.reporter_name));
  }

  if (sort.key) {
    const dir = sort.dir === 'asc' ? 1 : -1;
    displayed = [...displayed].sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      } else if (sort.key === 'organization') {
        cmp = (a.organization ?? '').localeCompare(b.organization ?? '', undefined, {
          sensitivity: 'base',
        });
      } else if (sort.key === 'status') {
        const si = (s: string | null) => statusOrderMap.get(s ?? '') ?? 9999;
        cmp = si(a.status) - si(b.status);
      } else if (sort.key === 'priority') {
        const pi = (p: string | null) => priorityOrderMap.get(p ?? '') ?? 9999;
        cmp = pi(a.priority) - pi(b.priority);
      } else if (sort.key === 'reporter') {
        cmp = a.reporter_name.localeCompare(b.reporter_name, undefined, { sensitivity: 'base' });
      } else if (sort.key === 'date_last_contacted') {
        if (a.date_last_contacted === null && b.date_last_contacted === null) cmp = 0;
        else if (a.date_last_contacted === null) cmp = 1;
        else if (b.date_last_contacted === null) cmp = -1;
        else cmp = a.date_last_contacted - b.date_last_contacted;
      }
      return cmp * dir;
    });
  }

  // Build unique reporter options from loaded rows
  const reporterOptions = [
    ...new Map(rows.map((r) => [r.reporter_name, { value: r.reporter_name, label: r.reporter_name }])).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));

  // Build status/priority options including "—" for null if any row has null
  const hasNullStatus = rows.some((r) => r.status === null);
  const statusFilterOptions = [
    ...statusOptions.map((o) => ({ value: o.label, label: o.label })),
    ...(hasNullStatus ? [{ value: '', label: '—' }] : []),
  ];
  const hasNullPriority = rows.some((r) => r.priority === null);
  const priorityFilterOptions = [
    ...priorityOptions.map((o) => ({ value: o.label, label: o.label })),
    ...(hasNullPriority ? [{ value: '', label: '—' }] : []),
  ];

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
  const anyFilter = isFilterActive(filters);
  const sd = (key: SortKey) => (sort.key === key ? sort.dir : null);

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
            {displayed.length !== rows.length
              ? `${displayed.length} of ${rows.length}`
              : `${rows.length} contact${rows.length !== 1 ? 's' : ''}`}
          </span>
          {anyFilter && (
            <button
              className="clear-filters-btn"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setOpenFilter(null);
              }}
            >
              Clear filters
            </button>
          )}
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

      {syncError && !fileUnreachable && (
        <div className="sync-error-banner">Sync error: {syncError}</div>
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
          ) : displayed.length === 0 ? (
            <div className="contacts-no-results">No contacts match the current filters.</div>
          ) : (
            <table className="contacts-table">
              <thead>
                <tr>
                  <th>
                    <ColumnHeader
                      label="Name"
                      sortDir={sd('name')}
                      onSort={() => handleSort('name')}
                      filterable
                      filterActive={!!filters.name}
                      filterOpen={openFilter === 'name'}
                      onFilterToggle={() => toggleFilter('name')}
                      filterContent={
                        <TextFilter value={filters.name} onChange={(v) => setFilter('name', v)} />
                      }
                    />
                  </th>
                  <th>
                    <ColumnHeader
                      label="Organization"
                      sortDir={sd('organization')}
                      onSort={() => handleSort('organization')}
                      filterable
                      filterActive={!!filters.organization}
                      filterOpen={openFilter === 'organization'}
                      onFilterToggle={() => toggleFilter('organization')}
                      filterContent={
                        <TextFilter
                          value={filters.organization}
                          onChange={(v) => setFilter('organization', v)}
                        />
                      }
                    />
                  </th>
                  <th>
                    <span className="col-label">Theme</span>
                  </th>
                  <th>
                    <ColumnHeader
                      label="Status"
                      sortDir={sd('status')}
                      onSort={() => handleSort('status')}
                      filterable
                      filterActive={filters.status.length > 0}
                      filterOpen={openFilter === 'status'}
                      onFilterToggle={() => toggleFilter('status')}
                      filterContent={
                        <MultiSelectFilter
                          options={statusFilterOptions}
                          selected={filters.status}
                          onChange={(v) => setFilter('status', v)}
                        />
                      }
                    />
                  </th>
                  <th>
                    <ColumnHeader
                      label="Priority"
                      sortDir={sd('priority')}
                      onSort={() => handleSort('priority')}
                      filterable
                      filterActive={filters.priority.length > 0}
                      filterOpen={openFilter === 'priority'}
                      onFilterToggle={() => toggleFilter('priority')}
                      filterContent={
                        <MultiSelectFilter
                          options={priorityFilterOptions}
                          selected={filters.priority}
                          onChange={(v) => setFilter('priority', v)}
                        />
                      }
                    />
                  </th>
                  <th>
                    <ColumnHeader
                      label="Reporter"
                      sortDir={sd('reporter')}
                      onSort={() => handleSort('reporter')}
                      filterable={reporterOptions.length > 1}
                      filterActive={filters.reporter.length > 0}
                      filterOpen={openFilter === 'reporter'}
                      onFilterToggle={() => toggleFilter('reporter')}
                      filterContent={
                        <MultiSelectFilter
                          options={reporterOptions}
                          selected={filters.reporter}
                          onChange={(v) => setFilter('reporter', v)}
                        />
                      }
                    />
                  </th>
                  <th className="col-compact">
                    <ColumnHeader
                      label="Email"
                      filterable
                      filterActive={filters.hasEmail !== null}
                      filterOpen={openFilter === 'email'}
                      onFilterToggle={() => toggleFilter('email')}
                      filterContent={
                        <ToggleFilter
                          value={filters.hasEmail}
                          onChange={(v) => setFilter('hasEmail', v)}
                          yesLabel="Has email"
                        />
                      }
                    />
                  </th>
                  <th className="col-compact">
                    <ColumnHeader
                      label="Phone"
                      filterable
                      filterActive={filters.hasPhone !== null}
                      filterOpen={openFilter === 'phone'}
                      onFilterToggle={() => toggleFilter('phone')}
                      filterContent={
                        <ToggleFilter
                          value={filters.hasPhone}
                          onChange={(v) => setFilter('hasPhone', v)}
                          yesLabel="Has phone"
                        />
                      }
                    />
                  </th>
                  <th className="col-compact">
                    <ColumnHeader
                      label="Notes"
                      filterable
                      filterActive={!!filters.notes}
                      filterOpen={openFilter === 'notes'}
                      onFilterToggle={() => toggleFilter('notes')}
                      filterContent={
                        <TextFilter
                          value={filters.notes}
                          onChange={(v) => setFilter('notes', v)}
                          placeholder="Keyword in notes…"
                        />
                      }
                    />
                  </th>
                  <th>
                    <ColumnHeader
                      label="Last Contacted"
                      sortDir={sd('date_last_contacted')}
                      onSort={() => handleSort('date_last_contacted')}
                      filterable
                      filterActive={filters.dateLastContacted !== null}
                      filterOpen={openFilter === 'date'}
                      onFilterToggle={() => toggleFilter('date')}
                      filterContent={
                        <PresetFilter
                          value={filters.dateLastContacted}
                          onChange={(v) =>
                            setFilter('dateLastContacted', v as Filters['dateLastContacted'])
                          }
                          options={[
                            { value: null, label: 'Any time' },
                            { value: 'contacted', label: 'Has been contacted' },
                            { value: 'never', label: 'Never contacted' },
                            { value: 'not_30', label: 'Not in 30 days' },
                            { value: 'not_90', label: 'Not in 90 days' },
                          ]}
                        />
                      }
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => {
                  const isMe = userEmail && r.reporter_email === userEmail;
                  return (
                    <tr
                      key={r.id}
                      className={[
                        selectedId === r.id ? 'selected' : '',
                        isMe ? 'row-mine' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                    >
                      <td className="contact-name-cell">{r.name}</td>
                      <td className="contact-org-cell">{r.organization ?? '—'}</td>
                      <td className="contact-org-cell">
                        {r.theme ?? <span className="contact-cell-muted">—</span>}
                      </td>
                      <td>{r.status ?? <span className="contact-cell-muted">—</span>}</td>
                      <td>{r.priority ?? <span className="contact-cell-muted">—</span>}</td>
                      <td className="contact-org-cell">{r.reporter_name}</td>
                      <td className="contact-bool-cell">
                        {r.has_email ? (
                          <span className="contact-bool-yes">✓</span>
                        ) : (
                          <span className="contact-cell-muted">—</span>
                        )}
                      </td>
                      <td className="contact-bool-cell">
                        {r.has_phone ? (
                          <span className="contact-bool-yes">✓</span>
                        ) : (
                          <span className="contact-cell-muted">—</span>
                        )}
                      </td>
                      <td className="contact-bool-cell">
                        {r.notes ? (
                          <span className="contact-notes-icon">✎</span>
                        ) : (
                          <span className="contact-cell-muted">—</span>
                        )}
                      </td>
                      <td className="contact-date-cell">
                        {r.date_last_contacted === null ? (
                          <span className="contact-cell-muted">Never</span>
                        ) : (
                          fmtDate(r.date_last_contacted)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
