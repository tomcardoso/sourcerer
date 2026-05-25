import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TimelineEntry, User } from '@shared/types';
import { useClickOutside } from '../hooks/useClickOutside';
import { CalendarPicker } from './CalendarPicker';
import Button from '../shell/Button';
import ContactDetail from '../contacts/ContactDetail';
import './View.css';
import './ColumnHeader.css';
import './Timeline.css';

interface Props {
  projectId?: string;
  projectName?: string;
  user?: User | null;
}

function dayKey(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (key === todayKey) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (key === yKey) return 'Yesterday';
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${d}, ${y}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

function TimelinePrintSheet({
  title,
  kicker,
  groups,
  isGlobal,
}: {
  title: string;
  kicker: string;
  groups: Array<{ key: string; entries: TimelineEntry[] }>;
  isGlobal: boolean;
}) {
  return createPortal(
    <div className="ptl-ps-root">
      <header className="ptl-ps-header">
        <div className="ptl-ps-meta">{kicker}</div>
        <h1 className="ptl-ps-title">{title}</h1>
        <div className="ptl-ps-subtitle">Timeline</div>
      </header>
      <div className="ptl-ps-body">
        {groups.map((group) => (
          <div key={group.key} className="ptl-ps-group">
            <div className="ptl-ps-day">{fmtDayLabel(group.key)}</div>
            {group.entries.map((entry) => (
              <div key={entry.id} className="ptl-ps-entry">
                <div className="ptl-ps-entry-meta">
                  <span className="ptl-ps-contact-name">{entry.contact_name}</span>
                  {entry.contact_organization && (
                    <span className="ptl-ps-badge">{entry.contact_organization}</span>
                  )}
                  {isGlobal && entry.projects.map((p) => (
                    <span key={p.project_id} className="ptl-ps-badge">{p.project_name}</span>
                  ))}
                  {entry.projects.map((p) => p.priority).filter(Boolean).slice(0, 1).map((priority) => (
                    <span key={priority} className="ptl-ps-badge">{priority}</span>
                  ))}
                </div>
                <p className="ptl-ps-body-text">{entry.body}</p>
                <div className="ptl-ps-footer">
                  <span className="ptl-ps-reporter">{entry.reporter_name}</span>
                  <span className="ptl-ps-time">{fmtTime(entry.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <footer className="ptl-ps-page-footer">
        <span>Printed from Sourcerer</span>
        <span>
          {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          {' · '}
          {new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </span>
      </footer>
    </div>,
    document.body,
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const close = () => { setOpen(false); setQuery(''); };
  useClickOutside(ref, close, { isOpen: open, escapeKey: false });

  const filtered = options.filter(
    (o) => !selected.includes(o) && o.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={ref} className="ptl-ms">
      <div className="ptl-ms-chips" onClick={() => setOpen(true)}>
        {selected.map((s) => (
          <span key={s} className="ptl-ms-chip">
            {s}
            <button
              className="ptl-ms-chip-remove"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange(selected.filter((x) => x !== s)); }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="ptl-ms-input"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && query === '' && selected.length > 0) {
              onChange(selected.slice(0, -1));
            }
          }}
          placeholder={selected.length === 0 ? placeholder : ''}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="ptl-ms-dropdown">
          {filtered.map((opt) => (
            <button
              key={opt}
              className="ptl-ms-option"
              onMouseDown={(e) => { e.preventDefault(); onChange([...selected, opt]); setQuery(''); }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Timeline({ projectId, projectName, user }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedReporters, setSelectedReporters] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const priorityRef = useRef<HTMLDivElement>(null);
  const [openTextFilter, setOpenTextFilter] = useState<'theme' | 'org' | 'notes' | null>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const orgRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const [themeFilter, setThemeFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [notesFilter, setNotesFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [drawerClosing, setDrawerClosing] = useState(false);

  function openContact(id: string) {
    if (selectedContactId === id) { closeContact(); return; }
    setSelectedContactId(id);
  }

  function closeContact() {
    setDrawerClosing(true);
    setTimeout(() => { setSelectedContactId(null); setDrawerClosing(false); }, 160);
  }

  const refreshEntries = useCallback(() => {
    const loadPromise = projectId
      ? window.sourcerer.listProjectTimeline(projectId)
      : window.sourcerer.listAllTimeline();
    loadPromise.then(setEntries).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    setEntries([]);
    setLoading(true);
    setSelectedReporters([]);
    setSelectedProjects([]);
    setSelectedPriorities([]);
    setThemeFilter('');
    setOrgFilter('');
    setNotesFilter('');
    setOpenTextFilter(null);
    setDateFrom('');
    setDateTo('');
    let cancelled = false;
    const loadPromise = projectId
      ? window.sourcerer.listProjectTimeline(projectId)
      : window.sourcerer.listAllTimeline();
    loadPromise.then((data) => {
      if (cancelled) return;
      setEntries(data);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  useClickOutside(priorityRef, () => setPriorityDropdownOpen(false), { isOpen: priorityDropdownOpen });
  useClickOutside(themeRef, () => setOpenTextFilter(null), { isOpen: openTextFilter === 'theme' });
  useClickOutside(orgRef, () => setOpenTextFilter(null), { isOpen: openTextFilter === 'org' });
  useClickOutside(notesRef, () => setOpenTextFilter(null), { isOpen: openTextFilter === 'notes' });

  const isGlobal = !projectId;
  const headingTitle = projectName ?? 'All Contacts';

  const reporterOptions = useMemo(
    () => [...new Set(entries.map((e) => e.reporter_name))].sort(),
    [entries],
  );
  const projectOptions = useMemo(
    () => [...new Set(entries.flatMap((e) => e.projects.map((p) => p.project_name)))].sort(),
    [entries],
  );
  const priorityOptions = useMemo(
    () => [...new Set(entries.flatMap((e) => e.projects.map((p) => p.priority).filter(Boolean) as string[]))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (selectedReporters.length > 0 && !selectedReporters.includes(e.reporter_name)) return false;
      if (selectedProjects.length > 0 && !e.projects.some((p) => selectedProjects.includes(p.project_name))) return false;
      if (selectedPriorities.length > 0 && !e.projects.some((p) => p.priority && selectedPriorities.includes(p.priority))) return false;
      if (themeFilter && !e.projects.some((p) => (p.theme ?? '').toLowerCase().includes(themeFilter.toLowerCase()))) return false;
      if (orgFilter && !(e.contact_organization ?? '').toLowerCase().includes(orgFilter.toLowerCase())) return false;
      if (notesFilter && !e.body.toLowerCase().includes(notesFilter.toLowerCase())) return false;
      if (dateFrom) {
        const [fy, fm, fd] = dateFrom.split('-').map(Number);
        const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime() / 1000;
        if (e.created_at < from) return false;
      }
      if (dateTo) {
        const [ty, tm, td] = dateTo.split('-').map(Number);
        const to = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime() / 1000;
        if (e.created_at > to) return false;
      }
      return true;
    });
  }, [entries, selectedReporters, selectedProjects, selectedPriorities, themeFilter, orgFilter, notesFilter, dateFrom, dateTo]);

  const groups = useMemo(() => {
    const g: Array<{ key: string; entries: TimelineEntry[] }> = [];
    for (const entry of filtered) {
      const key = dayKey(entry.created_at);
      const last = g[g.length - 1];
      if (last && last.key === key) last.entries.push(entry);
      else g.push({ key, entries: [entry] });
    }
    return g;
  }, [filtered]);

  const isFiltered =
    selectedReporters.length > 0 ||
    selectedProjects.length > 0 ||
    selectedPriorities.length > 0 ||
    themeFilter !== '' ||
    orgFilter !== '' ||
    notesFilter !== '' ||
    dateFrom !== '' ||
    dateTo !== '';

  // Show year suffix when dates span different years, or when a single date is in a prior year
  const thisYear = new Date().getFullYear();
  const showFromYear = !!(dateFrom && (
    (dateTo && dateFrom.slice(0, 4) !== dateTo.slice(0, 4)) ||
    Number(dateFrom.slice(0, 4)) < thisYear
  ));
  const showToYear = !!(dateTo && (
    (dateFrom && dateFrom.slice(0, 4) !== dateTo.slice(0, 4)) ||
    Number(dateTo.slice(0, 4)) < thisYear
  ));

  const kicker = isFiltered
    ? `${filtered.length} of ${entries.length} interaction${entries.length !== 1 ? 's' : ''}`
    : `${entries.length} interaction${entries.length !== 1 ? 's' : ''}`;

  const printSheet = groups.length > 0
    ? <TimelinePrintSheet title={headingTitle} kicker={kicker} groups={groups} isGlobal={isGlobal} />
    : null;

  if (loading) {
    return (
      <div className="view">
        <div className="ptl-empty">Loading…</div>
      </div>
    );
  }

  return (
    <>
      {printSheet}
      <div className="view">
        <div className="view-header">
          <p className="view-kicker">
            {isFiltered
              ? `${filtered.length} of ${entries.length} interaction${entries.length !== 1 ? 's' : ''}`
              : `${entries.length} interaction${entries.length !== 1 ? 's' : ''}`}
          </p>
          <div className="view-header-row">
            <h1 className="view-headline">{headingTitle}</h1>
            <Button variant="secondary" size="sm" onClick={() => window.print()} title="Print timeline">
              Print
            </Button>
          </div>
          <p className="view-subtitle">Timeline</p>
          <div className="view-rule-thick" />
          <div className="view-rule-thin" />

          {entries.length > 0 && (
            <div className="project-meta-bar ptl-meta-bar">
              <div className="project-meta-left">
                {/* Priority dropdown */}
                {priorityOptions.length > 0 && (
                  <div ref={priorityRef} className="project-meta-item ptl-priority-wrap">
                    <button
                      className={`project-meta-action-btn${selectedPriorities.length > 0 ? ' project-meta-action-btn--active' : ''}`}
                      onClick={() => setPriorityDropdownOpen((v) => !v)}
                    >
                      Priority{selectedPriorities.length > 0 && <span className="project-meta-filter-count">{selectedPriorities.length}</span>}
                    </button>
                    {priorityDropdownOpen && (
                      <div className="ptl-priority-dropdown col-filter-dropdown">
                        <div className="col-filter-multiselect">
                          {selectedPriorities.length > 0 && (
                            <button className="col-filter-clear-all" onClick={() => setSelectedPriorities([])}>
                              Clear all
                            </button>
                          )}
                          {priorityOptions.map((p) => (
                            <label key={p} className="col-filter-option">
                              <input
                                type="checkbox"
                                checked={selectedPriorities.includes(p)}
                                onChange={() => setSelectedPriorities((prev) => toggle(prev, p))}
                              />
                              {p}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Theme dropdown */}
                <div ref={themeRef} className="project-meta-item ptl-priority-wrap">
                  <button
                    className={`project-meta-action-btn${themeFilter ? ' project-meta-action-btn--active' : ''}`}
                    onClick={() => setOpenTextFilter(openTextFilter === 'theme' ? null : 'theme')}
                  >
                    Theme
                  </button>
                  {openTextFilter === 'theme' && (
                    <div className="ptl-priority-dropdown col-filter-dropdown">
                      <div className="col-filter-text">
                        <input
                          autoFocus
                          className="col-filter-input"
                          type="text"
                          value={themeFilter}
                          onChange={(e) => setThemeFilter(e.target.value)}
                          placeholder="Contains…"
                        />
                        {themeFilter && (
                          <button className="col-filter-clear" onClick={() => setThemeFilter('')}>×</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Org dropdown */}
                <div ref={orgRef} className="project-meta-item ptl-priority-wrap">
                  <button
                    className={`project-meta-action-btn${orgFilter ? ' project-meta-action-btn--active' : ''}`}
                    onClick={() => setOpenTextFilter(openTextFilter === 'org' ? null : 'org')}
                  >
                    Org
                  </button>
                  {openTextFilter === 'org' && (
                    <div className="ptl-priority-dropdown col-filter-dropdown">
                      <div className="col-filter-text">
                        <input
                          autoFocus
                          className="col-filter-input"
                          type="text"
                          value={orgFilter}
                          onChange={(e) => setOrgFilter(e.target.value)}
                          placeholder="Contains…"
                        />
                        {orgFilter && (
                          <button className="col-filter-clear" onClick={() => setOrgFilter('')}>×</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes text filter */}
                <div ref={notesRef} className="project-meta-item ptl-priority-wrap">
                  <button
                    className={`project-meta-action-btn${notesFilter ? ' project-meta-action-btn--active' : ''}`}
                    onClick={() => setOpenTextFilter(openTextFilter === 'notes' ? null : 'notes')}
                  >
                    Notes
                  </button>
                  {openTextFilter === 'notes' && (
                    <div className="ptl-priority-dropdown col-filter-dropdown">
                      <div className="col-filter-text">
                        <input
                          autoFocus
                          className="col-filter-input"
                          type="text"
                          value={notesFilter}
                          onChange={(e) => setNotesFilter(e.target.value)}
                          placeholder="Contains…"
                        />
                        {notesFilter && (
                          <button className="col-filter-clear" onClick={() => setNotesFilter('')}>×</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Multi-select: Projects (global) or Reporters (project) */}
                <div className="project-meta-item">
                  {isGlobal ? (
                    <MultiSelect
                      options={projectOptions}
                      selected={selectedProjects}
                      onChange={setSelectedProjects}
                      placeholder="Projects…"
                    />
                  ) : (
                    <MultiSelect
                      options={reporterOptions}
                      selected={selectedReporters}
                      onChange={setSelectedReporters}
                      placeholder="Reporters…"
                    />
                  )}
                </div>

                {/* Date range */}
                <span className="ptl-filter-sep" />
                <div className="ptl-date-pair">
                  <CalendarPicker label="From" value={dateFrom} onChange={setDateFrom} showYear={showFromYear} maxDate={new Date().toISOString().slice(0, 10)} />
                  <CalendarPicker label="To" value={dateTo} onChange={setDateTo} showYear={showToYear} maxDate={new Date().toISOString().slice(0, 10)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="view-empty">
            <div className="view-empty-label">No interactions logged yet</div>
            <div className="view-empty-hint">Log interactions from each contact's Project tab.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="ptl-empty">No entries match your filters.</div>
        ) : (
          <div className="ptl-root">
            {groups.map((group) => (
              <div key={group.key} className="ptl-group">
                <div className="ptl-day-label">{fmtDayLabel(group.key)}</div>
                <div className="ptl-day-entries">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="ptl-entry">
                      <div className="ptl-entry-meta">
                        <div className="ptl-contact-header">
                          <div className="ptl-contact-name-row">
                            <button
                              className="ptl-contact-name"
                              onClick={() => openContact(entry.contact_id)}
                            >
                              {entry.contact_name}
                            </button>
                            {isGlobal && entry.projects.map((p) => (
                              <span key={p.project_id} className="ptl-project-badge">{p.project_name}</span>
                            ))}
                            {entry.projects.map((p) => p.priority).filter(Boolean).slice(0, 1).map((priority) => (
                              <span key={priority} className="ptl-priority-badge">{priority}</span>
                            ))}
                          </div>
                          {entry.contact_organization && (
                            <span className="ptl-contact-org">{entry.contact_organization}</span>
                          )}
                        </div>
                      </div>
                      <p className="ptl-entry-body">{entry.body}</p>
                      <div className="ptl-entry-footer">
                        <span className="ptl-reporter">{entry.reporter_name}</span>
                        <span className="ptl-time">{fmtTime(entry.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {selectedContactId && (
          <ContactDetail
            contactId={selectedContactId}
            onClose={closeContact}
            onDeleted={closeContact}
            onUpdated={refreshEntries}
            user={user ?? null}
            closing={drawerClosing}
          />
        )}
      </div>
    </>
  );
}
