import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, ProjectContactRow, StatusOption, PriorityOption, ImportResult, User } from '@shared/types';
import ImportCsvModal from './ImportCsvModal';
import ImportResultModal from './ImportResultModal';
import ContactDetail from '../contacts/ContactDetail';
import SetupPayloadModal from '../shell/SetupPayloadModal';
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
  user: User | null;
  onProjectUpdated: (project: Project) => void;
}

type SortKey =
  | 'name'
  | 'organization'
  | 'theme'
  | 'status'
  | 'priority'
  | 'reporter'
  | 'date_first_contacted'
  | 'date_last_contacted';
type SortDir = 'asc' | 'desc';
type DatePreset = 'never' | 'contacted' | 'not_30' | 'not_90';

interface Filters {
  name: string;
  organization: string;
  theme: string;
  notes: string;
  email: string;
  phone: string;
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
  theme: '',
  notes: '',
  email: '',
  phone: '',
  hasEmail: null,
  hasPhone: null,
  dateLastContacted: null,
  status: [],
  priority: [],
  reporter: [],
};

function fmtOpened(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function fmtRelative(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

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
    f.theme !== '' ||
    f.notes !== '' ||
    f.email !== '' ||
    f.phone !== '' ||
    f.hasEmail !== null ||
    f.hasPhone !== null ||
    f.dateLastContacted !== null ||
    f.status.length > 0 ||
    f.priority.length > 0 ||
    f.reporter.length > 0
  );
}

export default function ProjectView({ project, user, onProjectUpdated }: Props) {
  const [rows, setRows] = useState<ProjectContactRow[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<PriorityOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmUnshare, setConfirmUnshare] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [fileUnreachable, setFileUnreachable] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: 'asc' });
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [regenPayload, setRegenPayload] = useState<{ projectName: string; payload: string } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showExportMenu) return;
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowExportMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showExportMenu]);

  const refresh = useCallback(() => {
    if (!project) return;
    window.sourcerer.listContactsForProject(project.id).then(setRows);
  }, [project]);

  useEffect(() => {
    setSelectedId(null);
    setCheckedIds(new Set());
    setConfirmDelete(false);
    setConfirmRemove(false);
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
        setLastSyncedAt(Date.now());
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

  async function handleConvertToShared() {
    if (!project) return;
    const result = await window.sourcerer.convertProjectToShared(project.id);
    if (!result) return;
    onProjectUpdated(result.project);
    setRegenPayload({ projectName: result.project.name, payload: result.payload });
  }

  async function handleUnshare() {
    if (!project) return;
    try {
      const updated = await window.sourcerer.unshareProject(project.id);
      setConfirmUnshare(false);
      onProjectUpdated(updated);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to unshare project.');
      setConfirmUnshare(false);
    }
  }

  async function handleRegenerate() {
    if (!project) return;
    const result = await window.sourcerer.regenerateSharedProject(project.id);
    setConfirmRegen(false);
    if (!result) return;
    setFileUnreachable(false);
    const projects = await window.sourcerer.listProjects();
    const updated = projects.find((p) => p.id === project.id);
    if (updated) onProjectUpdated(updated);
    setRegenPayload({ projectName: project.name, payload: result.payload });
  }

  function handleImportComplete(result: ImportResult) {
    setShowImportModal(false);
    setImportResult(result);
    refresh();
  }

  // Bulk selection handlers (allChecked/someChecked are computed after displayed is built below)
  const checkedCount = checkedIds.size;

  function toggleCheck(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmDelete(false);
    setConfirmRemove(false);
  }

  function toggleAll() {
    if (someChecked || allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(displayed.map((r) => r.id)));
    }
    setConfirmDelete(false);
    setConfirmRemove(false);
  }

  async function handleBulkRemove() {
    if (!project) return;
    setBulkWorking(true);
    try {
      await Promise.all(
        [...checkedIds].map((id) => window.sourcerer.removeFromProject(id, project.id)),
      );
      const removed = checkedIds;
      setRows((prev) => prev.filter((r) => !removed.has(r.id)));
      if (selectedId && removed.has(selectedId)) setSelectedId(null);
      setCheckedIds(new Set());
      setConfirmRemove(false);
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkDelete() {
    setBulkWorking(true);
    try {
      await Promise.all([...checkedIds].map((id) => window.sourcerer.deleteContact(id)));
      const deleted = checkedIds;
      setRows((prev) => prev.filter((r) => !deleted.has(r.id)));
      if (selectedId && deleted.has(selectedId)) setSelectedId(null);
      setCheckedIds(new Set());
      setConfirmDelete(false);
    } finally {
      setBulkWorking(false);
    }
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
  if (filters.theme) {
    const q = filters.theme.toLowerCase();
    displayed = displayed.filter((r) => (r.theme ?? '').toLowerCase().includes(q));
  }
  if (filters.notes) {
    const q = filters.notes.toLowerCase();
    displayed = displayed.filter((r) => (r.notes ?? '').toLowerCase().includes(q));
  }
  if (filters.email) {
    const q = filters.email.toLowerCase();
    displayed = displayed.filter((r) => (r.emails_raw ?? '').toLowerCase().includes(q));
  }
  if (filters.phone) {
    const q = filters.phone.toLowerCase();
    displayed = displayed.filter((r) => (r.phones_raw ?? '').toLowerCase().includes(q));
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
      } else if (sort.key === 'theme') {
        cmp = (a.theme ?? '').localeCompare(b.theme ?? '', undefined, { sensitivity: 'base' });
      } else if (sort.key === 'status') {
        const si = (s: string | null) => statusOrderMap.get(s ?? '') ?? 9999;
        cmp = si(a.status) - si(b.status);
      } else if (sort.key === 'priority') {
        const pi = (p: string | null) => priorityOrderMap.get(p ?? '') ?? 9999;
        cmp = pi(a.priority) - pi(b.priority);
      } else if (sort.key === 'reporter') {
        cmp = a.reporter_name.localeCompare(b.reporter_name, undefined, { sensitivity: 'base' });
      } else if (sort.key === 'date_first_contacted') {
        if (a.date_first_contacted === null && b.date_first_contacted === null) cmp = 0;
        else if (a.date_first_contacted === null) cmp = 1;
        else if (b.date_first_contacted === null) cmp = -1;
        else cmp = a.date_first_contacted - b.date_first_contacted;
      } else if (sort.key === 'date_last_contacted') {
        if (a.date_last_contacted === null && b.date_last_contacted === null) cmp = 0;
        else if (a.date_last_contacted === null) cmp = 1;
        else if (b.date_last_contacted === null) cmp = -1;
        else cmp = a.date_last_contacted - b.date_last_contacted;
      }
      return cmp * dir;
    });
  }

  const allChecked = displayed.length > 0 && displayed.every((r) => checkedIds.has(r.id));
  const someChecked = !allChecked && displayed.some((r) => checkedIds.has(r.id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

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
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setSelectedId(null);
  }

  const isPendingWrites = project.is_shared === 1 && project.shared_pending_writes === 1;
  const anyFilter = isFilterActive(filters);
  const sd = (key: SortKey) => (sort.key === key ? sort.dir : null);

  const stalenessEnabled = user?.staleness_enabled !== 0;
  const stalenessThresholdSecs = (user?.staleness_threshold_days ?? 90) * 86400;
  function isStale(dateLastContacted: number | null): boolean {
    if (!stalenessEnabled) return false;
    return dateLastContacted === null || dateLastContacted < now - stalenessThresholdSecs;
  }

  return (
    <>
    <div className="view">
      <div className="view-header">
        <p className="view-kicker">
          {`Project · ${rows.length} contact${rows.length !== 1 ? 's' : ''}`}
        </p>
        <h1 className="view-headline">
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
        <div className="view-rule-thick" />
        <div className="view-rule-thin" />
        <div className="project-meta-bar">
          <div className="project-meta-left">
            <span className="project-meta-item">
              <span className="project-meta-label">Created</span>
              <span className="project-meta-value">{fmtOpened(project.created_at)}</span>
            </span>
            {project.is_shared === 1 && (
              <span className="project-meta-item">
                <span className="project-meta-label">Last sync</span>
                <span className="project-meta-value">
                  {lastSyncedAt ? fmtRelative(lastSyncedAt) : syncing ? 'syncing…' : '—'}
                </span>
              </span>
            )}
            {anyFilter && (
              <button
                className="project-meta-action-btn project-meta-action-btn--active"
                onClick={() => { setFilters(DEFAULT_FILTERS); setOpenFilter(null); }}
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="project-meta-right">
            {project.is_shared === 0 && (
              <button className="project-meta-action-btn" onClick={handleConvertToShared}>
                Share…
              </button>
            )}
            {project.is_shared === 1 && !confirmUnshare && (
              <button className="project-meta-action-btn" onClick={() => setConfirmUnshare(true)}>
                Unshare…
              </button>
            )}
            {confirmUnshare && (
              <span className="inline-confirm">
                Stop syncing?
                <button className="inline-confirm-yes" onClick={handleUnshare}>Yes</button>
                <button className="inline-confirm-no" onClick={() => setConfirmUnshare(false)}>Cancel</button>
              </span>
            )}
            <button className="project-meta-action-btn" onClick={() => setShowImportModal(true)}>
              Import CSV…
            </button>
            <div className="export-menu-wrap" ref={exportMenuRef}>
              <button
                className="project-meta-action-btn"
                onClick={() => setShowExportMenu((v) => !v)}
                disabled={exporting || rows.length === 0}
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
                  <button
                    className="export-menu-item"
                    onClick={() => { setShowExportMenu(false); window.sourcerer.exportVCardProject(project.id); }}
                  >
                    <span className="export-menu-label">Export as vCard</span>
                    <span className="export-menu-desc">All contacts as a .vcf file for address books</span>
                  </button>
                </div>
              )}
            </div>
            {project.is_shared === 1 && (
              <button
                className="project-meta-action-btn"
                onClick={handleSyncNow}
                disabled={syncing}
              >
                {syncing ? 'Syncing…' : '↻ Sync'}
              </button>
            )}
          </div>
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
            {!confirmRegen ? (
              <button className="recovery-btn recovery-btn-danger" onClick={() => setConfirmRegen(true)}>
                Regenerate from local data…
              </button>
            ) : (
              <span className="inline-confirm">
                Overwrites shared file with your local data. Continue?
                <button className="inline-confirm-yes" onClick={handleRegenerate}>Yes, regenerate</button>
                <button className="inline-confirm-no" onClick={() => setConfirmRegen(false)}>Cancel</button>
              </span>
            )}
          </div>
        </div>
      )}

      {syncError && !fileUnreachable && (
        <div className="sync-error-banner">Sync error: {syncError}</div>
      )}

      {checkedCount > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">{checkedCount} selected</span>
          <button
            className="bulk-bar-clear"
            onClick={() => { setCheckedIds(new Set()); setConfirmDelete(false); setConfirmRemove(false); }}
            title="Clear selection"
          >
            ×
          </button>

          {confirmRemove ? (
            <>
              <span className="bulk-delete-confirm-text">
                Remove {checkedCount} contact{checkedCount !== 1 ? 's' : ''} from this project?
              </span>
              <button
                className="bulk-delete-confirm-btn"
                onClick={handleBulkRemove}
                disabled={bulkWorking}
              >
                {bulkWorking ? 'Removing…' : 'Confirm remove'}
              </button>
              <button
                className="btn-secondary bulk-bar-btn"
                onClick={() => setConfirmRemove(false)}
                disabled={bulkWorking}
              >
                Cancel
              </button>
            </>
          ) : confirmDelete ? (
            <>
              <span className="bulk-delete-confirm-text">
                Permanently delete {checkedCount} contact{checkedCount !== 1 ? 's' : ''}?
              </span>
              <button
                className="bulk-delete-confirm-btn"
                onClick={handleBulkDelete}
                disabled={bulkWorking}
              >
                {bulkWorking ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                className="btn-secondary bulk-bar-btn"
                onClick={() => setConfirmDelete(false)}
                disabled={bulkWorking}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="bulk-delete-btn"
                style={{ marginLeft: 'auto' }}
                onClick={() => setConfirmRemove(true)}
                disabled={bulkWorking}
              >
                Remove from project
              </button>
              <button
                className="bulk-delete-btn"
                onClick={() => setConfirmDelete(true)}
                disabled={bulkWorking}
              >
                Delete from Sourcerer
              </button>
            </>
          )}
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
          ) : displayed.length === 0 ? (
            <div className="contacts-no-results">No contacts match the current filters.</div>
          ) : (
            <table className="contacts-table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      type="checkbox"
                      ref={selectAllRef}
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
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
                    <ColumnHeader
                      label="Theme"
                      sortDir={sd('theme')}
                      onSort={() => handleSort('theme')}
                      filterable
                      filterActive={!!filters.theme}
                      filterOpen={openFilter === 'theme'}
                      onFilterToggle={() => toggleFilter('theme')}
                      filterContent={
                        <TextFilter
                          value={filters.theme}
                          onChange={(v) => setFilter('theme', v)}
                          placeholder="Theme contains…"
                        />
                      }
                    />
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
                      filterable={reporterOptions.length > 0}
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
                      filterActive={!!filters.email || filters.hasEmail !== null}
                      filterOpen={openFilter === 'email'}
                      onFilterToggle={() => toggleFilter('email')}
                      filterContent={
                        <>
                          <TextFilter
                            value={filters.email}
                            onChange={(v) => setFilter('email', v)}
                            placeholder="Search email…"
                          />
                          <ToggleFilter
                            value={filters.hasEmail}
                            onChange={(v) => setFilter('hasEmail', v)}
                            yesLabel="Has email"
                          />
                        </>
                      }
                    />
                  </th>
                  <th className="col-compact">
                    <ColumnHeader
                      label="Phone"
                      filterable
                      filterActive={!!filters.phone || filters.hasPhone !== null}
                      filterOpen={openFilter === 'phone'}
                      onFilterToggle={() => toggleFilter('phone')}
                      filterContent={
                        <>
                          <TextFilter
                            value={filters.phone}
                            onChange={(v) => setFilter('phone', v)}
                            placeholder="Search phone…"
                          />
                          <ToggleFilter
                            value={filters.hasPhone}
                            onChange={(v) => setFilter('hasPhone', v)}
                            yesLabel="Has phone"
                          />
                        </>
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
                      label="First Contacted"
                      sortDir={sd('date_first_contacted')}
                      onSort={() => handleSort('date_first_contacted')}
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
                  const isMe = user?.email && r.reporter_email === user.email;
                  return (
                    <tr
                      key={r.id}
                      className={[
                        selectedId === r.id ? 'selected' : '',
                        checkedIds.has(r.id) ? 'checked' : '',
                        isMe ? 'row-mine' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                    >
                      <td className="contact-check-cell" onClick={(e) => toggleCheck(r.id, e)}>
                        <input
                          type="checkbox"
                          checked={checkedIds.has(r.id)}
                          onChange={() => {}}
                        />
                      </td>
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
                        {r.date_first_contacted === null ? (
                          <span className="contact-cell-muted">—</span>
                        ) : (
                          fmtDate(r.date_first_contacted)
                        )}
                      </td>
                      <td className={`contact-date-cell${isStale(r.date_last_contacted) ? ' contact-date-stale' : ''}`}>
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

        {selectedId && checkedIds.size <= 1 && (
          <ContactDetail
            contactId={selectedId}
            onClose={() => setSelectedId(null)}
            onDeleted={handleDeleted}
            onUpdated={refresh}
            user={user}
          />
        )}
      </div>
    </div>

    {regenPayload && (
      <SetupPayloadModal
        projectName={regenPayload.projectName}
        payload={regenPayload.payload}
        onDone={() => setRegenPayload(null)}
      />
    )}

    {showImportModal && project && (
      <ImportCsvModal
        projects={[]}
        preselectedProjectId={project.id}
        onComplete={handleImportComplete}
        onClose={() => setShowImportModal(false)}
      />
    )}

    {importResult && (
      <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
    )}
  </>
  );
}
