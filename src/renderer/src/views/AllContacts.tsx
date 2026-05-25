import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ContactListItem, DuplicatePair, Project, User } from '@shared/types';
import { useClickOutside } from '../hooks/useClickOutside';
import { useSortFilter } from '../hooks/useSortFilter';
import DedupModal from './DedupModal';
import ContactDetail from '../contacts/ContactDetail';
import Button from '../shell/Button';
import ContactsTable, {
  type AllContactsFilters as Filters,
  DEFAULT_ALL_CONTACTS_FILTERS as DEFAULT_FILTERS,
  isAllContactsFilterActive as isFilterActive,
} from './ContactsTable';
import './View.css';
import './AllContacts.css';

type SortKey = 'name' | 'organization' | 'date_first_contacted' | 'date_last_contacted' | 'created_at';

interface Props {
  projects: Project[];
  user: User | null;
  openContactId?: string | null;
  onOpenContactIdConsumed?: () => void;
  refreshTrigger?: number;
}

export default function AllContacts({ projects, user, openContactId, onOpenContactIdConsumed, refreshTrigger }: Props) {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const lastCheckedIdRef = useRef<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkProjectMenuOpen, setBulkProjectMenuOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const { sort, filters, setFilter, handleSort, resetAll: resetSortFilter } = useSortFilter<SortKey, Filters>(DEFAULT_FILTERS);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [dupCount, setDupCount] = useState(0);
  const [showDedup, setShowDedup] = useState(false);
  const [dupPairs, setDupPairs] = useState<DuplicatePair[]>([]);
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const bulkProjectMenuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    window.sourcerer.listContacts().then(setContacts);
  }, []);

  useEffect(() => {
    if (openContactId) {
      setDetailId(openContactId);
      onOpenContactIdConsumed?.();
    }
  }, [openContactId, onOpenContactIdConsumed]);

  useEffect(() => {
    if (refreshTrigger) refresh();
  }, [refreshTrigger, refresh]);

  useEffect(() => {
    refresh();
    return window.sourcerer.onContactsChanged(refresh);
  }, [refresh]);

  useEffect(() => {
    window.sourcerer.getDuplicatePairs().then((pairs) => {
      setDupPairs(pairs);
      setDupCount(pairs.length);
    });
  }, []);

  useEffect(() => {
    return window.sourcerer.onDuplicatePairsUpdated((count) => {
      setDupCount(count);
      window.sourcerer.getDuplicatePairs().then((pairs) => setDupPairs(pairs));
    });
  }, []);

  const handleCloseBulkProjectMenu = useCallback(() => setBulkProjectMenuOpen(false), []);
  const handleCloseExportMenu = useCallback(() => setShowExportMenu(false), []);
  useClickOutside(bulkProjectMenuRef, handleCloseBulkProjectMenu, { isOpen: bulkProjectMenuOpen });
  useClickOutside(exportMenuRef, handleCloseExportMenu, { isOpen: showExportMenu });

  async function handleExportAll() {
    setShowExportMenu(false);
    setExporting(true);
    await window.sourcerer.exportAllContacts(checkedIds.size > 0 ? [...checkedIds] : undefined);
    setExporting(false);
  }

  function toggleFilter(col: string) {
    setOpenFilter((prev) => (prev === col ? null : col));
  }

  const displayed = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    let result = contacts;

    if (filters.name) {
      const q = filters.name.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (filters.organization) {
      const q = filters.organization.toLowerCase();
      result = result.filter((c) => (c.organization ?? '').toLowerCase().includes(q));
    }
    if (filters.notes) {
      const q = filters.notes.toLowerCase();
      result = result.filter((c) => (c.notes ?? '').toLowerCase().includes(q));
    }
    if (filters.email) {
      const q = filters.email.toLowerCase();
      result = result.filter((c) => (c.emails_raw ?? '').toLowerCase().includes(q));
    }
    if (filters.phone) {
      const q = filters.phone.toLowerCase();
      result = result.filter((c) => (c.phones_raw ?? '').toLowerCase().includes(q));
    }
    if (filters.hasEmail !== null) {
      result = result.filter((c) => (filters.hasEmail ? c.has_email === 1 : c.has_email === 0));
    }
    if (filters.hasPhone !== null) {
      result = result.filter((c) => (filters.hasPhone ? c.has_phone === 1 : c.has_phone === 0));
    }
    if (filters.dateLastContacted === 'never') {
      result = result.filter((c) => c.date_last_contacted === null);
    } else if (filters.dateLastContacted === 'contacted') {
      result = result.filter((c) => c.date_last_contacted !== null);
    } else if (filters.dateLastContacted === 'not_30') {
      result = result.filter(
        (c) => c.date_last_contacted === null || c.date_last_contacted < now - 30 * 86400,
      );
    } else if (filters.dateLastContacted === 'not_90') {
      result = result.filter(
        (c) => c.date_last_contacted === null || c.date_last_contacted < now - 90 * 86400,
      );
    }

    if (filters.dateAddedFrom) {
      const from = Math.floor(new Date(filters.dateAddedFrom).getTime() / 1000);
      result = result.filter((c) => c.created_at >= from);
    }
    if (filters.dateAddedTo) {
      // include the full "to" day by adding 86399 seconds
      const to = Math.floor(new Date(filters.dateAddedTo).getTime() / 1000) + 86399;
      result = result.filter((c) => c.created_at <= to);
    }

    if (filters.project === '__none__') {
      result = result.filter((c) => c.projects.length === 0);
    } else if (filters.project !== null) {
      result = result.filter((c) => c.projects.some((p) => p.id === filters.project));
    }

    if (sort.key) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sort.key === 'name') {
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        } else if (sort.key === 'organization') {
          cmp = (a.organization ?? '').localeCompare(b.organization ?? '', undefined, {
            sensitivity: 'base',
          });
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
        } else if (sort.key === 'created_at') {
          cmp = a.created_at - b.created_at;
        }
        return cmp * dir;
      });
    }

    return result;
  }, [contacts, filters, sort]);

  // Bulk selection derived state
  const checkedCount = checkedIds.size;
  const allChecked = displayed.length > 0 && displayed.every((c) => checkedIds.has(c.id));
  const someChecked = !allChecked && displayed.some((c) => checkedIds.has(c.id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  function toggleCheck(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey && lastCheckedIdRef.current !== null) {
      const anchorIdx = displayed.findIndex((r) => r.id === lastCheckedIdRef.current);
      const targetIdx = displayed.findIndex((r) => r.id === id);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const [lo, hi] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        const rangeIds = displayed.slice(lo, hi + 1).map((r) => r.id);
        const removing = checkedIds.has(id);
        setCheckedIds((prev) => {
          const next = new Set(prev);
          if (removing) rangeIds.forEach((rid) => next.delete(rid));
          else rangeIds.forEach((rid) => next.add(rid));
          return next;
        });
        setConfirmDelete(false);
        return;
      }
    }
    lastCheckedIdRef.current = id;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmDelete(false);
  }

  function toggleAll() {
    if (someChecked || allChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(displayed.map((c) => c.id)));
    }
    setConfirmDelete(false);
  }

  async function handleBulkDelete() {
    setBulkWorking(true);
    try {
      await Promise.all([...checkedIds].map((id) => window.sourcerer.deleteContact(id)));
      const deleted = checkedIds;
      setContacts((prev) => prev.filter((c) => !deleted.has(c.id)));
      if (detailId && deleted.has(detailId)) setDetailId(null);
      setCheckedIds(new Set());
      setConfirmDelete(false);
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkAddToProject(projectId: string) {
    setBulkWorking(true);
    setBulkProjectMenuOpen(false);
    try {
      await Promise.all([...checkedIds].map((id) => window.sourcerer.addToProject(id, projectId)));
      refresh();
      setCheckedIds(new Set());
    } finally {
      setBulkWorking(false);
    }
  }

  function closeDetail() {
    setDrawerClosing(true);
    setTimeout(() => {
      setDetailId(null);
      setDrawerClosing(false);
    }, 160);
  }

  function handleDeleted(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setDetailId(null);
  }

  const anyFilter = isFilterActive(filters);

  return (
    <div className="view">
      <div className="view-header">
        <p className="view-kicker">
          Everyone{contacts.length > 0 && ` · ${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`}
        </p>
        <h1 className="view-headline">All contacts</h1>
        <p className="view-subtitle">Every contact across all projects, searchable and filterable.</p>
        <div className="view-rule-thick" />
        <div className="view-rule-thin" />
        <div className="project-meta-bar">
          <div className="project-meta-left">
            {dupCount > 0 && (
              <div className="project-meta-item">
                <button
                  className="project-meta-action-btn project-meta-action-btn--active"
                  onClick={async () => {
                    const pairs = await window.sourcerer.getDuplicatePairs();
                    setDupPairs(pairs);
                    setShowDedup(true);
                  }}
                >
                  ⚠ {dupCount} duplicate{dupCount !== 1 ? 's' : ''}
                </button>
              </div>
            )}
            {anyFilter && (
              <div className="project-meta-item">
                <button
                  className="project-meta-action-btn"
                  onClick={() => { resetSortFilter(); setOpenFilter(null); }}
                >
                  Clear filters
                </button>
              </div>
            )}
            <div className="project-meta-item export-menu-wrap" ref={exportMenuRef}>
              <button
                className="project-meta-action-btn"
                onClick={() => setShowExportMenu((v) => !v)}
                disabled={exporting || contacts.length === 0}
              >
                {exporting ? 'Exporting…' : checkedIds.size > 0 ? `↓ Export selected (${checkedIds.size})` : '↓ Export'}
              </button>
              {showExportMenu && (
                <div className="export-menu">
                  <button className="export-menu-item" onClick={handleExportAll}>
                    <span className="export-menu-label">Export as CSV / Excel</span>
                    <span className="export-menu-desc">Name, organization, emails, phones, notes</span>
                  </button>
                  <button
                    className="export-menu-item"
                    onClick={() => { setShowExportMenu(false); window.sourcerer.exportVCardAllContacts(checkedIds.size > 0 ? [...checkedIds] : undefined); }}
                  >
                    <span className="export-menu-label">Export as vCard</span>
                    <span className="export-menu-desc">All contacts as a .vcf file for address books</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {checkedCount > 0 && (
        <div className="bulk-bar">
          <span className="bulk-bar-count">{checkedCount} selected</span>
          <button
            className="bulk-bar-clear"
            onClick={() => { setCheckedIds(new Set()); setConfirmDelete(false); }}
            title="Clear selection"
          >
            ×
          </button>

          {projects.length > 0 && (
            <div className="bulk-project-wrap" ref={bulkProjectMenuRef}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBulkProjectMenuOpen((v) => !v)}
                disabled={bulkWorking}
              >
                Add to project
              </Button>
              {bulkProjectMenuOpen && (
                <div className="bulk-project-menu">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      className="bulk-project-item"
                      onClick={() => handleBulkAddToProject(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {confirmDelete ? (
            <>
              <span className="bulk-delete-confirm-text">
                Delete {checkedCount} contact{checkedCount !== 1 ? 's' : ''}?
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
            </>
          ) : (
            <Button
              variant="danger-outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={bulkWorking}
            >
              Delete
            </Button>
          )}
        </div>
      )}

      <div className={`contacts-body${detailId && checkedIds.size <= 1 ? ' contacts-body--detail-open' : ''}`}>
        <div className="contacts-table-area" ref={tableAreaRef}>
          <ContactsTable
            mode="all"
            rows={displayed}
            totalCount={contacts.length}
            filters={filters}
            setFilter={setFilter}
            sort={sort}
            onSort={handleSort}
            openFilter={openFilter}
            toggleFilter={toggleFilter}
            checkedIds={checkedIds}
            selectedId={detailId}
            onRowClick={(id) => { if (id === detailId) { closeDetail(); } else { setDetailId(id); } }}
            onCheck={toggleCheck}
            onCheckAll={toggleAll}
            allChecked={allChecked}
            selectAllRef={selectAllRef}
            user={user}
            projects={projects}
            virtualize
            scrollContainerRef={tableAreaRef}
          />
        </div>
      </div>

      {detailId && checkedIds.size <= 1 && (
        <ContactDetail
          contactId={detailId}
          onClose={closeDetail}
          onDeleted={handleDeleted}
          onUpdated={refresh}
          user={user}
          closing={drawerClosing}
        />
      )}

      {showDedup && (
        <DedupModal
          pairs={dupPairs}
          onClose={() => {
            setShowDedup(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
