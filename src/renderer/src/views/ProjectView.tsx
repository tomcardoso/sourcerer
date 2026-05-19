import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, ProjectContactRow, StatusOption, PriorityOption, ImportResult, User } from '@shared/types';
import { useClickOutside } from '../hooks/useClickOutside';
import ImportResultModal from './ImportResultModal';
import ContactDetail from '../contacts/ContactDetail';
import SetupPayloadModal from '../shell/SetupPayloadModal';
import Modal from '../shell/Modal';
import Button from '../shell/Button';
import ContactsTable, {
  type ProjectFilters as Filters,
  DEFAULT_PROJECT_FILTERS as DEFAULT_FILTERS,
  isProjectFilterActive as isFilterActive,
  type SortDir,
  buildOrderMap,
} from './ContactsTable';
import './View.css';
import './AllContacts.css';
import './ProjectView.css';

interface Props {
  project: Project | null;
  user: User | null;
  onProjectUpdated: (project: Project) => void;
  refreshTrigger?: number;
  openContactId?: string | null;
  onOpenContactIdConsumed?: () => void;
}

type SortKey =
  | 'name'
  | 'organization'
  | 'theme'
  | 'status'
  | 'priority'
  | 'reporter'
  | 'date_first_contacted'
  | 'date_last_contacted'
  | 'membership_created_at';

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

export default function ProjectView({ project, user, onProjectUpdated, refreshTrigger, openContactId, onOpenContactIdConsumed }: Props) {
  const [rows, setRows] = useState<ProjectContactRow[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<PriorityOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showUnshareModal, setShowUnshareModal] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [fileUnreachable, setFileUnreachable] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: 'asc' });
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [regenPayload, setRegenPayload] = useState<{ projectName: string; payload: string } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [showEditProject, setShowEditProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const bulkActionsRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const syncStartedAt = useRef<number>(0);

  const handleCloseExportMenu = useCallback(() => setShowExportMenu(false), []);
  useClickOutside(exportMenuRef, handleCloseExportMenu, { isOpen: showExportMenu });
  const handleCloseBulkActions = useCallback(() => setShowBulkActions(false), []);
  useClickOutside(bulkActionsRef, handleCloseBulkActions, { isOpen: showBulkActions });

  const projectId = project?.id;
  const refresh = useCallback(() => {
    if (!projectId) return;
    window.sourcerer.listContactsForProject(projectId).then(setRows);
  }, [projectId]);

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
    setLastSyncedAt(project?.last_synced_at ? project.last_synced_at * 1000 : null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.sourcerer.listStatusOptions().then(setStatusOptions);
    window.sourcerer.listPriorityOptions().then(setPriorityOptions);
  }, []);

  // Open a contact navigated from the Timeline view
  useEffect(() => {
    if (openContactId) {
      setSelectedId(openContactId);
      onOpenContactIdConsumed?.();
    }
  }, [openContactId, onOpenContactIdConsumed]);

  useEffect(() => {
    if (refreshTrigger) refresh();
  }, [refreshTrigger, refresh]);

  useEffect(() => {
    return window.sourcerer.onContactsChanged(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!project?.is_shared) return;
    return window.sourcerer.onSyncStatus((event) => {
      if (event.projectId !== project.id) return;
      const elapsed = Date.now() - syncStartedAt.current;
      const remaining = Math.max(0, 800 - elapsed);
      setTimeout(() => setSyncing(false), remaining);
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
    syncStartedAt.current = Date.now();
    setSyncing(true);
    setSyncError(null);
    const result = await window.sourcerer.triggerSync(project.id);
    if (result && !result.success) {
      const msg = result.error ?? 'Unknown sync error';
      const isUnreachable =
        msg.includes('no such file') ||
        msg.includes('ENOENT') ||
        msg.includes('not a database') ||
        msg.includes('Cannot open');
      setFileUnreachable(isUnreachable);
      if (!isUnreachable) setSyncError(msg);
    }
  }

  function openEditProject() {
    if (!project) return;
    setEditName(project.name);
    setEditDescription(project.description ?? '');
    setShowEditProject(true);
  }

  useEffect(() => {
    if (!showEditProject) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowEditProject(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showEditProject]);

  async function handleEditProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !editName.trim()) return;
    setEditSubmitting(true);
    const updated = await window.sourcerer.updateProject(project.id, editName.trim(), editDescription.trim() || null);
    onProjectUpdated(updated);
    setShowEditProject(false);
    setEditSubmitting(false);
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
    await window.sourcerer.exportProject(project.id, mode, checkedIds.size > 0 ? [...checkedIds] : undefined);
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
      setShowUnshareModal(false);
      onProjectUpdated(updated);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to unshare project.');
      setShowUnshareModal(false);
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

  async function handleRotateKey() {
    if (!project) return;
    try {
      const result = await window.sourcerer.rotateSharedKey(project.id);
      if (!result) return;
      setRegenPayload({ projectName: project.name, payload: result.payload });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to rotate key.');
    } finally {
      setShowRotateModal(false);
    }
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

  async function handleBulkSetStatus(status: string | null) {
    if (!project) return;
    setBulkWorking(true);
    try {
      const membershipIds = rows.filter((r) => checkedIds.has(r.id)).map((r) => r.membership_id);
      await window.sourcerer.bulkUpdateMemberships({ membershipIds, status });
      setRows((prev) => prev.map((r) => checkedIds.has(r.id) ? { ...r, status } : r));
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkSetPriority(priority: string | null) {
    if (!project) return;
    setBulkWorking(true);
    try {
      const membershipIds = rows.filter((r) => checkedIds.has(r.id)).map((r) => r.membership_id);
      await window.sourcerer.bulkUpdateMemberships({ membershipIds, priority });
      setRows((prev) => prev.map((r) => checkedIds.has(r.id) ? { ...r, priority } : r));
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

  function setFilter(key: string, value: unknown) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFilter(col: string) {
    setOpenFilter((prev) => (prev === col ? null : col));
  }

  function handleSort(key: string) {
    setSort((prev) => {
      if (prev.key === key) {
        if (prev.dir === 'asc') return { key: key as SortKey, dir: 'desc' };
        return { key: null, dir: 'asc' };
      }
      return { key: key as SortKey, dir: 'asc' };
    });
  }

  // Build sort-order lookup maps for status/priority (used in sort logic below)
  const statusOrderMap = buildOrderMap(statusOptions);
  const priorityOrderMap = buildOrderMap(priorityOptions);

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
  if (filters.dateAddedFrom) {
    const from = Math.floor(new Date(filters.dateAddedFrom).getTime() / 1000);
    displayed = displayed.filter((r) => r.membership_created_at >= from);
  }
  if (filters.dateAddedTo) {
    const to = Math.floor(new Date(filters.dateAddedTo).getTime() / 1000) + 86399;
    displayed = displayed.filter((r) => r.membership_created_at <= to);
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
      } else if (sort.key === 'membership_created_at') {
        cmp = a.membership_created_at - b.membership_created_at;
      }
      return cmp * dir;
    });
  }

  const allChecked = displayed.length > 0 && displayed.every((r) => checkedIds.has(r.id));
  const someChecked = !allChecked && displayed.some((r) => checkedIds.has(r.id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  // Pre-compute filter options from the unfiltered row set (not displayed)
  const reporterOptions = [
    ...new Map(rows.map((r) => [r.reporter_name, { value: r.reporter_name, label: r.reporter_name }])).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));

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

  function closeDetail() {
    setDrawerClosing(true);
    setTimeout(() => {
      setSelectedId(null);
      setDrawerClosing(false);
    }, 160);
  }

  function handleDeleted(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setSelectedId(null);
  }

  const isPendingWrites = project.is_shared === 1 && project.shared_pending_writes === 1;
  const anyFilter = isFilterActive(filters);

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
                  : syncError
                    ? syncError
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
            <div className="project-meta-item project-meta-item--field">
              <span className="project-meta-label">Created</span>
              <span className="project-meta-value">{fmtOpened(project.created_at)}</span>
            </div>
            {project.is_shared === 1 && (
              <div className="project-meta-item project-meta-item--field">
                <span className="project-meta-label">Last sync</span>
                <span className="project-meta-value">
                  {lastSyncedAt ? fmtRelative(lastSyncedAt) : syncing ? 'syncing…' : '—'}
                </span>
              </div>
            )}
          {anyFilter && (
            <div className="project-meta-item">
              <button
                className="project-meta-action-btn project-meta-action-btn--active"
                onClick={() => { setFilters(DEFAULT_FILTERS); setOpenFilter(null); }}
              >
                Clear filters
              </button>
            </div>
          )}
          <div className="project-meta-item">
            <button className="project-meta-action-btn" onClick={openEditProject}>
              ✎ Edit
            </button>
          </div>
          <div className="project-meta-item export-menu-wrap" ref={exportMenuRef}>
            <button
              className="project-meta-action-btn"
              onClick={() => setShowExportMenu((v) => !v)}
              disabled={exporting || rows.length === 0}
            >
              {exporting ? 'Exporting…' : checkedIds.size > 0 ? `↓ Export selected (${checkedIds.size})` : '↓ Export'}
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
                  onClick={() => { setShowExportMenu(false); window.sourcerer.exportVCardProject(project.id, checkedIds.size > 0 ? [...checkedIds] : undefined); }}
                >
                  <span className="export-menu-label">Export as vCard</span>
                  <span className="export-menu-desc">All contacts as a .vcf file for address books</span>
                </button>
              </div>
            )}
          </div>
          {project.is_shared === 0 && (
            <div className="project-meta-item">
              <button className="project-meta-action-btn" onClick={handleConvertToShared}>
                + Share project
              </button>
            </div>
          )}
          {project.is_shared === 1 && (
            <div className="project-meta-item">
              <button
                className={`project-meta-action-btn${syncing ? ' project-meta-action-btn--syncing' : ''}`}
                onClick={handleSyncNow}
                disabled={syncing}
              >
                {syncing ? 'Syncing…' : '↻ Sync'}
              </button>
            </div>
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
            <Button variant="secondary" size="sm" onClick={handleRelocate}>
              Relocate file…
            </Button>
            {!confirmRegen ? (
              <Button variant="danger-outline" size="sm" onClick={() => setConfirmRegen(true)}>
                Regenerate from local data…
              </Button>
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
          <div className="bulk-bar-element">
            <span className="bulk-bar-count">{checkedCount} selected</span>
            <button
              className="bulk-bar-clear"
              onClick={() => { setCheckedIds(new Set()); setConfirmDelete(false); setConfirmRemove(false); }}
              title="Clear selection"
            >
              ×
            </button>
          </div>
          {confirmRemove ? (
            <div className="bulk-bar-element">
              <span className="bulk-delete-confirm-text">
                Remove {checkedCount} contact{checkedCount !== 1 ? 's' : ''} from this project?
              </span>
              <Button
                variant="danger"
                size="sm"
                onClick={handleBulkRemove}
                disabled={bulkWorking}
              >
                {bulkWorking ? 'Removing…' : 'Confirm remove'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmRemove(false)}
                disabled={bulkWorking}
              >
                Cancel
              </Button>
            </div>
          ) : confirmDelete ? (
            <div className="bulk-bar-element">
              <span className="bulk-delete-confirm-text">
                Permanently delete {checkedCount} contact{checkedCount !== 1 ? 's' : ''}?
              </span>
              <Button
                variant="danger"
                size="sm"
                onClick={handleBulkDelete}
                disabled={bulkWorking}
              >
                {bulkWorking ? 'Deleting…' : 'Confirm delete'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={bulkWorking}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              {statusOptions.length > 0 && (
                <div className="bulk-bar-element">
                  <label className="bulk-bar-label">Status</label>
                  <select
                    className="bulk-bar-select"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__clear__') { handleBulkSetStatus(null); return; }
                      const opt = statusOptions.find((o) => o.id === v);
                      if (opt) handleBulkSetStatus(opt.label);
                    }}
                    disabled={bulkWorking}
                  >
                    <option value="" disabled>Set status</option>
                    {statusOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                    <option value="__clear__">— clear —</option>
                  </select>
                </div>
              )}
              {priorityOptions.length > 0 && (
                <div className="bulk-bar-element">
                  <label className="bulk-bar-label">Priority</label>
                  <select
                    className="bulk-bar-select"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__clear__') { handleBulkSetPriority(null); return; }
                      const opt = priorityOptions.find((o) => o.id === v);
                      if (opt) handleBulkSetPriority(opt.label);
                    }}
                    disabled={bulkWorking}
                  >
                    <option value="" disabled>Set priority</option>
                    {priorityOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                    <option value="__clear__">— clear —</option>
                  </select>
                </div>
              )}
              <div className="bulk-bar-element bulk-actions-wrap" ref={bulkActionsRef} style={{ marginLeft: 'auto' }}>
                <button
                  className="bulk-actions-trigger"
                  onClick={() => setShowBulkActions((v) => !v)}
                  disabled={bulkWorking}
                >
                  Remove from…
                </button>
                {showBulkActions && (
                  <div className="bulk-actions-menu">
                    <button
                      className="bulk-actions-item bulk-actions-item--danger"
                      onClick={() => { setShowBulkActions(false); setConfirmRemove(true); }}
                    >
                      Project
                    </button>
                    <button
                      className="bulk-actions-item bulk-actions-item--danger"
                      onClick={() => { setShowBulkActions(false); setConfirmDelete(true); }}
                    >
                      Sourcerer
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="contacts-body">
        <div className="contacts-table-area">
          <ContactsTable
            mode="project"
            rows={displayed}
            totalCount={rows.length}
            filters={filters}
            setFilter={setFilter}
            sort={sort}
            onSort={handleSort}
            openFilter={openFilter}
            toggleFilter={toggleFilter}
            checkedIds={checkedIds}
            selectedId={selectedId}
            onRowClick={(id) => { if (id === selectedId) { closeDetail(); } else { setSelectedId(id); } }}
            onCheck={toggleCheck}
            onCheckAll={toggleAll}
            allChecked={allChecked}
            selectAllRef={selectAllRef}
            user={user}
            statusFilterOptions={statusFilterOptions}
            priorityFilterOptions={priorityFilterOptions}
            reporterOptions={reporterOptions}
            userEmail={user?.email}
          />
        </div>

        {selectedId && checkedIds.size <= 1 && (
          <ContactDetail
            contactId={selectedId}
            onClose={closeDetail}
            onDeleted={handleDeleted}
            onUpdated={refresh}
            user={user}
            closing={drawerClosing}
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

    {importResult && (
      <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
    )}

    {showUnshareModal && project && (
      <UnshareProjectModal
        projectName={project.name}
        onDismiss={() => setShowUnshareModal(false)}
        onConfirm={handleUnshare}
      />
    )}

    {showRotateModal && project && (
      <RotateKeyModal
        projectName={project.name}
        onDismiss={() => setShowRotateModal(false)}
        onConfirm={handleRotateKey}
      />
    )}

    {showEditProject && (
      <Modal title="Edit project" onDismiss={() => setShowEditProject(false)}>
        <form onSubmit={handleEditProjectSubmit}>
          <div className="modal-field">
            <label className="modal-label">Project name <span className="modal-required">*</span></label>
            <input
              className="modal-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              required
              disabled={editSubmitting}
            />
          </div>
          <div className="modal-field">
            <label className="modal-label">Description <span className="modal-optional">(optional)</span></label>
            <input
              className="modal-input"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Short slug line"
              disabled={editSubmitting}
            />
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setShowEditProject(false)} disabled={editSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={editSubmitting || !editName.trim()}>
              {editSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
        {project?.is_shared === 1 && (
          <div className="modal-danger-zone">
            <p className="modal-danger-zone-label">Danger zone</p>
            <div className="modal-danger-zone-actions">
              <Button variant="danger-outline" size="sm" onClick={() => { setShowEditProject(false); setShowUnshareModal(true); }}>
                Unshare project
              </Button>
              <Button variant="danger-outline" size="sm" onClick={() => { setShowEditProject(false); setShowRotateModal(true); }}>
                Rotate key…
              </Button>
            </div>
          </div>
        )}
      </Modal>
    )}
  </>
  );
}

function UnshareProjectModal({
  projectName,
  onDismiss,
  onConfirm,
}: {
  projectName: string;
  onDismiss: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [working, setWorking] = useState(false);

  async function handleConfirm() {
    setWorking(true);
    try { await onConfirm(); } finally { setWorking(false); }
  }

  return (
    <Modal title="Unshare project" onDismiss={onDismiss}>
      <p className="modal-description">
        <strong>{projectName}</strong> will be converted back to a local-only project. All
        collaborators will immediately lose access and the shared file will no longer be updated.
        Your local data is unaffected.
      </p>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onDismiss} disabled={working}>Cancel</Button>
        <Button variant="danger" onClick={handleConfirm} disabled={working}>
          {working ? 'Unsharing…' : 'Unshare project'}
        </Button>
      </div>
    </Modal>
  );
}

function RotateKeyModal({
  projectName,
  onDismiss,
  onConfirm,
}: {
  projectName: string;
  onDismiss: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [working, setWorking] = useState(false);

  async function handleConfirm() {
    setWorking(true);
    try { await onConfirm(); } finally { setWorking(false); }
  }

  return (
    <Modal title="Rotate encryption key" onDismiss={onDismiss}>
      <p className="modal-description">
        This will generate a new encryption key for <strong>{projectName}</strong>. All current
        collaborators will immediately lose access. You'll be shown a new share link to redistribute
        out-of-band.
      </p>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onDismiss} disabled={working}>Cancel</Button>
        <Button variant="danger" onClick={handleConfirm} disabled={working}>
          {working ? 'Rotating…' : 'Rotate key'}
        </Button>
      </div>
    </Modal>
  );
}
