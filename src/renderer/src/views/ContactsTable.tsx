import { useEffect, type RefObject } from 'react';
import { fmtDate } from '../utils/fmtDate';
import type {
  ContactListItem,
  ProjectContactRow,
  Project,
  StatusOption,
  PriorityOption,
  User,
} from '@shared/types';
import ColumnHeader, { TextFilter, ToggleFilter, PresetFilter, MultiSelectFilter } from './ColumnHeader';
import { CalendarPicker } from './CalendarPicker';

// ─── Shared types ────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';
export type DatePreset = 'never' | 'contacted' | 'not_30' | 'not_90';

export interface AllContactsFilters {
  name: string;
  organization: string;
  notes: string;
  email: string;
  phone: string;
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  dateLastContacted: DatePreset | null;
  dateAddedFrom: string; // ISO date string YYYY-MM-DD
  dateAddedTo: string;   // ISO date string YYYY-MM-DD
  project: string | null;
}

export interface ProjectFilters {
  name: string;
  organization: string;
  theme: string;
  notes: string;
  email: string;
  phone: string;
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  dateLastContacted: DatePreset | null;
  dateAddedFrom: string;
  dateAddedTo: string;
  status: string[];
  priority: string[];
  reporter: string[];
}

export const DEFAULT_ALL_CONTACTS_FILTERS: AllContactsFilters = {
  name: '',
  organization: '',
  notes: '',
  email: '',
  phone: '',
  hasEmail: null,
  hasPhone: null,
  dateLastContacted: null,
  dateAddedFrom: '',
  dateAddedTo: '',
  project: null,
};

export const DEFAULT_PROJECT_FILTERS: ProjectFilters = {
  name: '',
  organization: '',
  theme: '',
  notes: '',
  email: '',
  phone: '',
  hasEmail: null,
  hasPhone: null,
  dateLastContacted: null,
  dateAddedFrom: '',
  dateAddedTo: '',
  status: [],
  priority: [],
  reporter: [],
};

export function isAllContactsFilterActive(f: AllContactsFilters): boolean {
  return (
    f.name !== '' ||
    f.organization !== '' ||
    f.notes !== '' ||
    f.email !== '' ||
    f.phone !== '' ||
    f.hasEmail !== null ||
    f.hasPhone !== null ||
    f.dateLastContacted !== null ||
    f.dateAddedFrom !== '' ||
    f.dateAddedTo !== '' ||
    f.project !== null
  );
}

export function isProjectFilterActive(f: ProjectFilters): boolean {
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
    f.dateAddedFrom !== '' ||
    f.dateAddedTo !== '' ||
    f.status.length > 0 ||
    f.priority.length > 0 ||
    f.reporter.length > 0
  );
}

// Build status/priority sort-order lookup maps from options arrays
export function buildOrderMap(options: Array<StatusOption | PriorityOption>): Map<string, number> {
  return new Map(options.map((o, i) => [o.label, i]));
}

// ─── Component props ─────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { value: null, label: 'Any time' },
  { value: 'contacted', label: 'Has been contacted' },
  { value: 'never', label: 'Never contacted' },
  { value: 'not_30', label: 'Not in 30 days' },
  { value: 'not_90', label: 'Not in 90 days' },
];

interface BaseTableProps {
  checkedIds: Set<string>;
  selectedId: string | null;
  onRowClick: (id: string) => void;
  onCheck: (id: string, e: React.MouseEvent) => void;
  onCheckAll: () => void;
  allChecked: boolean;
  selectAllRef: RefObject<HTMLInputElement>;
  sort: { key: string | null; dir: SortDir };
  onSort: (key: string) => void;
  openFilter: string | null;
  toggleFilter: (col: string) => void;
  setFilter: (key: string, value: unknown) => void;
  user: User | null;
  /** Total rows before filtering — used to distinguish "no data" from "no match" */
  totalCount: number;
}

interface AllContactsTableProps extends BaseTableProps {
  mode: 'all';
  rows: ContactListItem[];
  filters: AllContactsFilters;
  projects: Project[];
}

interface ProjectTableProps extends BaseTableProps {
  mode: 'project';
  rows: ProjectContactRow[];
  filters: ProjectFilters;
  /** Pre-computed from the unfiltered row set */
  statusFilterOptions: Array<{ value: string; label: string }>;
  priorityFilterOptions: Array<{ value: string; label: string }>;
  reporterOptions: Array<{ value: string; label: string }>;
  userEmail?: string;
}

type ContactsTableProps = AllContactsTableProps | ProjectTableProps;

// ─── Component ───────────────────────────────────────────────────────────────

export default function ContactsTable(props: ContactsTableProps) {
  const {
    mode,
    rows,
    checkedIds,
    selectedId,
    onRowClick,
    onCheck,
    onCheckAll,
    allChecked,
    selectAllRef,
    sort,
    onSort,
    openFilter,
    toggleFilter,
    setFilter,
    user,
    filters,
    totalCount,
  } = props;

  const isProject = mode === 'project';
  const pp = isProject ? (props as ProjectTableProps) : null;
  const ap = !isProject ? (props as AllContactsTableProps) : null;
  const pf = isProject ? (filters as ProjectFilters) : null;
  const af = !isProject ? (filters as AllContactsFilters) : null;

  useEffect(() => {
    if (!openFilter) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        toggleFilter(openFilter);
      }
    };
    window.addEventListener('keydown', onKey, true); // capture phase — fires before other handlers
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openFilter, toggleFilter]);

  const now = Math.floor(Date.now() / 1000);
  const todayISO = new Date().toISOString().slice(0, 10);
  const stalenessEnabled = user?.staleness_enabled !== 0;
  const stalenessThresholdSecs = (user?.staleness_threshold_days ?? 90) * 86400;
  function isStale(ts: number | null) {
    if (!stalenessEnabled) return false;
    return ts === null || ts < now - stalenessThresholdSecs;
  }

  const sd = (key: string) => (sort.key === key ? sort.dir : null);
  const colSpan = isProject ? 13 : 10;

  return (
    <table className="contacts-table">
      <thead>
        <tr>
          <th className="col-check">
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={allChecked}
              onChange={() => onCheckAll()}
            />
          </th>

          {/* ── Shared: Name ── */}
          <th>
            <ColumnHeader
              label="Name"
              sortDir={sd('name')}
              onSort={() => onSort('name')}
              filterable
              filterActive={!!filters.name}
              filterOpen={openFilter === 'name'}
              onFilterToggle={() => toggleFilter('name')}
              filterContent={
                <TextFilter value={filters.name} onChange={(v) => setFilter('name', v)} />
              }
            />
          </th>

          {/* ── Shared: Organization ── */}
          <th>
            <ColumnHeader
              label="Organization"
              sortDir={sd('organization')}
              onSort={() => onSort('organization')}
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

          {/* ── Project-only: Theme ── */}
          {isProject && (
            <th>
              <ColumnHeader
                label="Theme"
                sortDir={sd('theme')}
                onSort={() => onSort('theme')}
                filterable
                filterActive={!!(pf?.theme)}
                filterOpen={openFilter === 'theme'}
                onFilterToggle={() => toggleFilter('theme')}
                filterContent={
                  <TextFilter
                    value={pf?.theme ?? ''}
                    onChange={(v) => setFilter('theme', v)}
                    placeholder="Theme contains…"
                  />
                }
              />
            </th>
          )}

          {/* ── Project-only: Status ── */}
          {isProject && (
            <th>
              <ColumnHeader
                label="Status"
                sortDir={sd('status')}
                onSort={() => onSort('status')}
                filterable
                filterActive={(pf?.status.length ?? 0) > 0}
                filterOpen={openFilter === 'status'}
                onFilterToggle={() => toggleFilter('status')}
                filterContent={
                  <MultiSelectFilter
                    options={pp?.statusFilterOptions ?? []}
                    selected={pf?.status ?? []}
                    onChange={(v) => setFilter('status', v)}
                  />
                }
              />
            </th>
          )}

          {/* ── Project-only: Priority ── */}
          {isProject && (
            <th>
              <ColumnHeader
                label="Priority"
                sortDir={sd('priority')}
                onSort={() => onSort('priority')}
                filterable
                filterActive={(pf?.priority.length ?? 0) > 0}
                filterOpen={openFilter === 'priority'}
                onFilterToggle={() => toggleFilter('priority')}
                filterContent={
                  <MultiSelectFilter
                    options={pp?.priorityFilterOptions ?? []}
                    selected={pf?.priority ?? []}
                    onChange={(v) => setFilter('priority', v)}
                  />
                }
              />
            </th>
          )}

          {/* ── Project-only: Reporter ── */}
          {isProject && (
            <th>
              <ColumnHeader
                label="Reporter"
                sortDir={sd('reporter')}
                onSort={() => onSort('reporter')}
                filterable={!!(pp && pp.reporterOptions.length > 0)}
                filterActive={(pf?.reporter.length ?? 0) > 0}
                filterOpen={openFilter === 'reporter'}
                onFilterToggle={() => toggleFilter('reporter')}
                filterContent={
                  <MultiSelectFilter
                    options={pp?.reporterOptions ?? []}
                    selected={pf?.reporter ?? []}
                    onChange={(v) => setFilter('reporter', v)}
                  />
                }
              />
            </th>
          )}

          {/* ── Project-only: Date Added to project ── */}
          {isProject && (
            <th>
              <ColumnHeader
                label="Date Added"
                sortDir={sd('membership_created_at')}
                onSort={() => onSort('membership_created_at')}
                filterable
                filterActive={!!(pf?.dateAddedFrom || pf?.dateAddedTo)}
                filterOpen={openFilter === 'date_added'}
                onFilterToggle={() => toggleFilter('date_added')}
                filterContent={
                  <div className="date-filter-stack">
                    <label className="date-filter-label">From</label>
                    <CalendarPicker
                      label="Pick date"
                      ariaLabel="Date added from"
                      value={pf?.dateAddedFrom ?? ''}
                      onChange={(v) => setFilter('dateAddedFrom', v)}
                      showYear
                      maxDate={todayISO}
                    />
                    <label className="date-filter-label">To</label>
                    <CalendarPicker
                      label="Pick date"
                      ariaLabel="Date added to"
                      value={pf?.dateAddedTo ?? ''}
                      onChange={(v) => setFilter('dateAddedTo', v)}
                      showYear
                      maxDate={todayISO}
                    />
                  </div>
                }
              />
            </th>
          )}

          {/* ── Shared: Email ── */}
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

          {/* ── Shared: Phone ── */}
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

          {/* ── Shared: Notes ── */}
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

          {/* ── Shared: First Contacted ── */}
          <th>
            <ColumnHeader
              label="First Contacted"
              sortDir={sd('date_first_contacted')}
              onSort={() => onSort('date_first_contacted')}
            />
          </th>

          {/* ── Shared: Last Contacted ── */}
          <th>
            <ColumnHeader
              label="Last Contacted"
              sortDir={sd('date_last_contacted')}
              onSort={() => onSort('date_last_contacted')}
              filterable
              filterActive={filters.dateLastContacted !== null}
              filterOpen={openFilter === 'date'}
              onFilterToggle={() => toggleFilter('date')}
              filterContent={
                <PresetFilter
                  value={filters.dateLastContacted}
                  onChange={(v) => setFilter('dateLastContacted', v)}
                  options={DATE_PRESETS}
                />
              }
            />
          </th>

          {/* ── AllContacts-only: Date Added ── */}
          {!isProject && (
            <th>
              <ColumnHeader
                label="Date Added"
                sortDir={sd('created_at')}
                onSort={() => onSort('created_at')}
                filterable
                filterActive={!!(af?.dateAddedFrom || af?.dateAddedTo)}
                filterOpen={openFilter === 'date_added'}
                onFilterToggle={() => toggleFilter('date_added')}
                filterContent={
                  <div className="date-filter-stack">
                    <label className="date-filter-label">From</label>
                    <CalendarPicker
                      label="Pick date"
                      ariaLabel="Date added from"
                      value={af?.dateAddedFrom ?? ''}
                      onChange={(v) => setFilter('dateAddedFrom', v)}
                      showYear
                      maxDate={todayISO}
                    />
                    <label className="date-filter-label">To</label>
                    <CalendarPicker
                      label="Pick date"
                      ariaLabel="Date added to"
                      value={af?.dateAddedTo ?? ''}
                      onChange={(v) => setFilter('dateAddedTo', v)}
                      showYear
                      maxDate={todayISO}
                    />
                  </div>
                }
              />
            </th>
          )}

          {/* ── AllContacts-only: Projects ── */}
          {!isProject && (
            <th>
              <ColumnHeader
                label="Projects"
                filterable
                filterActive={af?.project !== null}
                filterOpen={openFilter === 'project'}
                onFilterToggle={() => toggleFilter('project')}
                filterContent={
                  <PresetFilter
                    value={af?.project ?? null}
                    onChange={(v) => setFilter('project', v)}
                    options={[
                      { value: null, label: 'All projects' },
                      { value: '__none__', label: 'No project' },
                      ...(ap?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []),
                    ]}
                  />
                }
              />
            </th>
          )}
        </tr>
      </thead>

      <tbody>
        {totalCount === 0 ? (
          <tr>
            <td colSpan={colSpan} className="contacts-no-results">
              {isProject
                ? 'No contacts in this project yet. Open a contact from All Contacts and add it to this project.'
                : 'No contacts yet. Add your first contact to get started.'}
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={colSpan} className="contacts-no-results">
              No contacts match the current filters.
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const pr = isProject ? (row as ProjectContactRow) : null;
            const ar = !isProject ? (row as ContactListItem) : null;
            const isMe =
              isProject && pp?.userEmail && (row as ProjectContactRow).reporter_email === pp.userEmail;
            return (
              <tr
                key={row.id}
                className={[
                  selectedId === row.id ? 'selected' : '',
                  checkedIds.has(row.id) ? 'checked' : '',
                  isMe ? 'row row-mine' : 'row',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onRowClick(row.id)}
              >
                <td className="contact-check-cell" onClick={(e) => onCheck(row.id, e)}>
                  <input type="checkbox" checked={checkedIds.has(row.id)} onChange={() => {}} />
                </td>

                <td className="contact-name-cell">{row.name}</td>
                <td className="contact-org-cell">{row.organization ?? '—'}</td>

                {/* Project-only cells */}
                {isProject && (
                  <td className="contact-org-cell">
                    {pr?.theme ?? <span className="contact-cell-muted">—</span>}
                  </td>
                )}
                {isProject && (
                  <td>{pr?.status ?? <span className="contact-cell-muted">—</span>}</td>
                )}
                {isProject && (
                  <td>{pr?.priority ?? <span className="contact-cell-muted">—</span>}</td>
                )}
                {isProject && (
                  <td className="contact-org-cell">{pr?.reporter_name}</td>
                )}

                {/* Project-only: Date Added */}
                {isProject && (
                  <td className="contact-date-cell">
                    {fmtDate((pr as ProjectContactRow).membership_created_at)}
                  </td>
                )}

                {/* Shared cells */}
                <td className="contact-bool-cell">
                  {row.has_email ? (
                    <span className="contact-bool-yes">✓</span>
                  ) : (
                    <span className="contact-cell-muted">—</span>
                  )}
                </td>
                <td className="contact-bool-cell">
                  {row.has_phone ? (
                    <span className="contact-bool-yes">✓</span>
                  ) : (
                    <span className="contact-cell-muted">—</span>
                  )}
                </td>
                <td className="contact-bool-cell">
                  {row.notes ? (
                    <span className="contact-notes-icon">✎</span>
                  ) : (
                    <span className="contact-cell-muted">—</span>
                  )}
                </td>
                <td className="contact-date-cell">
                  {row.date_first_contacted === null ? (
                    <span className="contact-cell-muted">—</span>
                  ) : (
                    fmtDate(row.date_first_contacted)
                  )}
                </td>
                <td
                  className={`contact-date-cell${isStale(row.date_last_contacted) ? ' contact-date-stale' : ''}`}
                >
                  {row.date_last_contacted === null ? (
                    <span className="contact-cell-muted">Never</span>
                  ) : (
                    fmtDate(row.date_last_contacted)
                  )}
                </td>

                {/* AllContacts-only: Date Added */}
                {!isProject && (
                  <td className="contact-date-cell">
                    {fmtDate((ar as ContactListItem).created_at)}
                  </td>
                )}

                {/* AllContacts-only: Projects */}
                {!isProject && (
                  <td className="contact-projects-cell">
                    {(ar?.projects.length ?? 0) === 0 ? (
                      <span className="contact-no-projects">—</span>
                    ) : (
                      ar?.projects.map((p) => (
                        <span key={p.id} className="project-tag">
                          {p.name}
                        </span>
                      ))
                    )}
                  </td>
                )}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
