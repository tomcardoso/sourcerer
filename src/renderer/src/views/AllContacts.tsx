import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContactListItem, ImportResult, Project, User } from '@shared/types';
import AddContactModal from '../contacts/AddContactModal';
import ContactDetail from '../contacts/ContactDetail';
import ColumnHeader, { TextFilter, ToggleFilter, PresetFilter } from './ColumnHeader';
import ImportCsvModal from './ImportCsvModal';
import ImportResultModal from './ImportResultModal';
import './View.css';
import './AllContacts.css';

type SortKey = 'name' | 'organization' | 'date_first_contacted' | 'date_last_contacted';
type SortDir = 'asc' | 'desc';
type DatePreset = 'never' | 'contacted' | 'not_30' | 'not_90';

interface Filters {
  name: string;
  organization: string;
  notes: string;
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  dateLastContacted: DatePreset | null;
  project: string | null; // project ID, or '__none__' for contacts with no project
}

const DEFAULT_FILTERS: Filters = {
  name: '',
  organization: '',
  notes: '',
  hasEmail: null,
  hasPhone: null,
  dateLastContacted: null,
  project: null,
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
    f.project !== null
  );
}

interface Props {
  projects: Project[];
  user: User | null;
}

export default function AllContacts({ projects, user }: Props) {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkProjectMenuOpen, setBulkProjectMenuOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: 'asc' });
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const bulkProjectMenuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    window.sourcerer.listContacts().then(setContacts);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!bulkProjectMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (bulkProjectMenuRef.current && !bulkProjectMenuRef.current.contains(e.target as Node)) {
        setBulkProjectMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setBulkProjectMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [bulkProjectMenuOpen]);

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

  const now = Math.floor(Date.now() / 1000);
  let displayed = contacts;

  if (filters.name) {
    const q = filters.name.toLowerCase();
    displayed = displayed.filter((c) => c.name.toLowerCase().includes(q));
  }
  if (filters.organization) {
    const q = filters.organization.toLowerCase();
    displayed = displayed.filter((c) => (c.organization ?? '').toLowerCase().includes(q));
  }
  if (filters.notes) {
    const q = filters.notes.toLowerCase();
    displayed = displayed.filter((c) => (c.notes ?? '').toLowerCase().includes(q));
  }
  if (filters.hasEmail !== null) {
    displayed = displayed.filter((c) => (filters.hasEmail ? c.has_email === 1 : c.has_email === 0));
  }
  if (filters.hasPhone !== null) {
    displayed = displayed.filter((c) => (filters.hasPhone ? c.has_phone === 1 : c.has_phone === 0));
  }
  if (filters.dateLastContacted === 'never') {
    displayed = displayed.filter((c) => c.date_last_contacted === null);
  } else if (filters.dateLastContacted === 'contacted') {
    displayed = displayed.filter((c) => c.date_last_contacted !== null);
  } else if (filters.dateLastContacted === 'not_30') {
    displayed = displayed.filter(
      (c) => c.date_last_contacted === null || c.date_last_contacted < now - 30 * 86400,
    );
  } else if (filters.dateLastContacted === 'not_90') {
    displayed = displayed.filter(
      (c) => c.date_last_contacted === null || c.date_last_contacted < now - 90 * 86400,
    );
  }

  if (filters.project === '__none__') {
    displayed = displayed.filter((c) => c.projects.length === 0);
  } else if (filters.project !== null) {
    displayed = displayed.filter((c) => c.projects.some((p) => p.id === filters.project));
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

  // Bulk selection derived state
  const checkedCount = checkedIds.size;
  const allChecked = displayed.length > 0 && displayed.every((c) => checkedIds.has(c.id));
  const someChecked = !allChecked && displayed.some((c) => checkedIds.has(c.id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  function toggleCheck(id: string, e: React.MouseEvent) {
    e.stopPropagation();
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

  function handleImportComplete(result: ImportResult) {
    setShowImportModal(false);
    setImportResult(result);
    refresh();
  }

  function handleCreated(contact: ContactListItem) {
    setContacts((prev) =>
      [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setShowAdd(false);
    setDetailId(contact.id);
  }

  function handleDeleted(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setCheckedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setDetailId(null);
  }

  const sd = (key: SortKey) => (sort.key === key ? sort.dir : null);
  const anyFilter = isFilterActive(filters);

  const stalenessEnabled = user?.staleness_enabled !== 0;
  const stalenessThresholdSecs = (user?.staleness_threshold_days ?? 90) * 86400;
  function isStale(dateLastContacted: number | null): boolean {
    if (!stalenessEnabled) return false;
    return dateLastContacted === null || dateLastContacted < now - stalenessThresholdSecs;
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">All Contacts</h1>
          {contacts.length > 0 && (
            <p className="view-subtitle">
              {displayed.length !== contacts.length
                ? `${displayed.length} of ${contacts.length} contacts`
                : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          <button className="btn-secondary" onClick={() => setShowImportModal(true)}>
            Import CSV…
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + Add Contact
          </button>
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
              <button
                className="btn-secondary bulk-bar-btn"
                onClick={() => setBulkProjectMenuOpen((v) => !v)}
                disabled={bulkWorking}
              >
                Add to project…
              </button>
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
            <button
              className="bulk-delete-btn"
              onClick={() => setConfirmDelete(true)}
              disabled={bulkWorking}
            >
              Delete
            </button>
          )}
        </div>
      )}

      <div className="contacts-body">
        <div className="contacts-table-area">
          {contacts.length === 0 ? (
            <div className="view-empty">
              <div className="view-empty-icon">◎</div>
              <div className="view-empty-label">No contacts yet</div>
              <div className="view-empty-hint">Add your first contact to get started.</div>
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
                  <th>
                    <ColumnHeader
                      label="Projects"
                      filterable
                      filterActive={filters.project !== null}
                      filterOpen={openFilter === 'project'}
                      onFilterToggle={() => toggleFilter('project')}
                      filterContent={
                        <PresetFilter
                          value={filters.project}
                          onChange={(v) => setFilter('project', v)}
                          options={[
                            { value: null, label: 'All projects' },
                            { value: '__none__', label: 'No project' },
                            ...projects.map((p) => ({ value: p.id, label: p.name })),
                          ]}
                        />
                      }
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((c) => (
                  <tr
                    key={c.id}
                    className={[
                      detailId === c.id ? 'selected' : '',
                      checkedIds.has(c.id) ? 'checked' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setDetailId(c.id === detailId ? null : c.id)}
                  >
                    <td className="contact-check-cell" onClick={(e) => toggleCheck(c.id, e)}>
                      <input
                        type="checkbox"
                        checked={checkedIds.has(c.id)}
                        onChange={() => {}}
                      />
                    </td>
                    <td className="contact-name-cell">{c.name}</td>
                    <td className="contact-org-cell">{c.organization ?? '—'}</td>
                    <td className="contact-bool-cell">
                      {c.has_email ? (
                        <span className="contact-bool-yes">✓</span>
                      ) : (
                        <span className="contact-cell-muted">—</span>
                      )}
                    </td>
                    <td className="contact-bool-cell">
                      {c.has_phone ? (
                        <span className="contact-bool-yes">✓</span>
                      ) : (
                        <span className="contact-cell-muted">—</span>
                      )}
                    </td>
                    <td className="contact-bool-cell">
                      {c.notes ? (
                        <span className="contact-notes-icon">✎</span>
                      ) : (
                        <span className="contact-cell-muted">—</span>
                      )}
                    </td>
                    <td className="contact-date-cell">
                      {c.date_first_contacted === null ? (
                        <span className="contact-cell-muted">—</span>
                      ) : (
                        fmtDate(c.date_first_contacted)
                      )}
                    </td>
                    <td className={`contact-date-cell${isStale(c.date_last_contacted) ? ' contact-date-stale' : ''}`}>
                      {c.date_last_contacted === null ? (
                        <span className="contact-cell-muted">Never</span>
                      ) : (
                        fmtDate(c.date_last_contacted)
                      )}
                    </td>
                    <td className="contact-projects-cell">
                      {c.projects.length === 0 ? (
                        <span className="contact-no-projects">—</span>
                      ) : (
                        c.projects.map((p) => (
                          <span key={p.id} className="project-tag">
                            {p.name}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {detailId && checkedIds.size <= 1 && (
          <ContactDetail
            contactId={detailId}
            onClose={() => setDetailId(null)}
            onDeleted={handleDeleted}
            onUpdated={refresh}
          />
        )}
      </div>

      {showAdd && (
        <AddContactModal onCreated={handleCreated} onCancel={() => setShowAdd(false)} />
      )}

      {showImportModal && (
        <ImportCsvModal
          projects={projects}
          onComplete={handleImportComplete}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {importResult && (
        <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
      )}
    </div>
  );
}
