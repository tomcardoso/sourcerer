import { useCallback, useEffect, useState } from 'react';
import type { ContactListItem, ImportResult, Project } from '@shared/types';
import AddContactModal from '../contacts/AddContactModal';
import ContactDetail from '../contacts/ContactDetail';
import ColumnHeader, { TextFilter, ToggleFilter, PresetFilter } from './ColumnHeader';
import ImportResultModal from './ImportResultModal';
import './View.css';
import './AllContacts.css';

type SortKey = 'name' | 'organization' | 'date_last_contacted';
type SortDir = 'asc' | 'desc';
type DatePreset = 'never' | 'contacted' | 'not_30' | 'not_90';

interface Filters {
  name: string;
  organization: string;
  notes: string;
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  dateLastContacted: DatePreset | null;
}

const DEFAULT_FILTERS: Filters = {
  name: '',
  organization: '',
  notes: '',
  hasEmail: null,
  hasPhone: null,
  dateLastContacted: null,
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
    f.dateLastContacted !== null
  );
}

interface Props {
  projects: Project[];
}

export default function AllContacts({ projects }: Props) {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: 'asc' });
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProjectId, setImportProjectId] = useState<string>('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const refresh = useCallback(() => {
    window.sourcerer.listContacts().then(setContacts);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      } else if (sort.key === 'date_last_contacted') {
        if (a.date_last_contacted === null && b.date_last_contacted === null) cmp = 0;
        else if (a.date_last_contacted === null) cmp = 1;
        else if (b.date_last_contacted === null) cmp = -1;
        else cmp = a.date_last_contacted - b.date_last_contacted;
      }
      return cmp * dir;
    });
  }

  async function handleImport() {
    setImporting(true);
    try {
      const result = await window.sourcerer.importCsv({
        projectId: importProjectId || undefined,
      });
      if (!result.cancelled) {
        setImportResult(result);
        refresh();
      }
    } finally {
      setImporting(false);
    }
  }

  function handleCreated(contact: ContactListItem) {
    setContacts((prev) =>
      [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setShowAdd(false);
    setSelectedId(contact.id);
  }

  function handleDeleted(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelectedId(null);
  }

  const sd = (key: SortKey) => (sort.key === key ? sort.dir : null);
  const anyFilter = isFilterActive(filters);

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
          <div className="ac-import-row">
            {projects.length > 0 && (
              <select
                className="ac-import-project-select"
                value={importProjectId}
                onChange={(e) => setImportProjectId(e.target.value)}
                title="Optionally add imported contacts to a project"
              >
                <option value="">Contacts only</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <button className="btn-secondary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import CSV…'}
            </button>
            <button
              className="btn-link"
              onClick={() => window.sourcerer.downloadSampleCsv()}
              title="Download a blank CSV template"
            >
              ↓ template
            </button>
          </div>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + Add Contact
          </button>
        </div>
      </div>

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
                    <span className="col-label">Projects</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((c) => (
                  <tr
                    key={c.id}
                    className={selectedId === c.id ? 'selected' : ''}
                    onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                  >
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

        {selectedId && (
          <ContactDetail
            contactId={selectedId}
            onClose={() => setSelectedId(null)}
            onDeleted={handleDeleted}
            onUpdated={refresh}
          />
        )}
      </div>

      {showAdd && (
        <AddContactModal onCreated={handleCreated} onCancel={() => setShowAdd(false)} />
      )}

      {importResult && (
        <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
      )}
    </div>
  );
}
