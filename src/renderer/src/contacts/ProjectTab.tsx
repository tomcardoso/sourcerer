import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ContactDetail.css';
import type {
  ContactDetail as ContactDetailType,
  ContactProject,
  InteractionLogEntry,
  Reminder,
  ScratchpadDraft,
  StatusOption,
  PriorityOption,
} from '@shared/types';

interface Props {
  contact: ContactDetailType;
  statusOptions: StatusOption[];
  priorityOptions: PriorityOption[];
  onMembershipUpdated: () => void;
  currentUser?: { email: string; firstName: string; lastName: string } | null;
}


function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtLogDate(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 86400) return 'today';
  if (diff < 2 * 86400) return 'yesterday';
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} days ago`;
  const d = new Date(ts * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const thisYear = new Date().getFullYear();
  if (d.getFullYear() !== thisYear) return `${mm}.${dd}.${String(d.getFullYear()).slice(2)}`;
  return `${mm}.${dd}`;
}

function LogRow({ entry }: { entry: InteractionLogEntry }) {
  return (
    <div className="pt-log-row">
      <div className="pt-log-row-date">{fmtLogDate(entry.created_at)}</div>
      <div className="pt-log-row-content">
        <p className="pt-log-row-body">{entry.body}</p>
        <span className="pt-log-row-reporter">{entry.reporter_name}</span>
      </div>
    </div>
  );
}

function LogAllModal({ entries, onClose }: { entries: InteractionLogEntry[]; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="pt-log-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pt-log-modal-header">
          <span className="pt-reminders-label">Interaction Log</span>
          <button className="detail-close" onClick={onClose}>×</button>
        </div>
        <div className="pt-log-modal-body">
          {entries.length === 0
            ? <p className="pt-reminders-empty">No entries yet.</p>
            : [...entries].reverse().map((e) => <LogRow key={e.id} entry={e} />)
          }
        </div>
      </div>
    </div>,
    document.body,
  );
}

const LOG_PREVIEW = 3;

function LogSection({ membership, onEntryAdded }: { membership: ContactProject; onEntryAdded?: () => void }) {
  const [entries, setEntries] = useState<InteractionLogEntry[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setEntries([]);
    setText('');
    setAdding(false);
    window.sourcerer.listInteractionLog(membership.membership_id).then(setEntries);
  }, [membership.membership_id]);

  async function handleSubmit() {
    const body = text.trim();
    if (!body) return;
    setSubmitting(true);
    try {
      const entry = await window.sourcerer.addInteractionLogEntry(membership.membership_id, body);
      setEntries((prev) => [...prev, entry]);
      setText('');
      setAdding(false);
      onEntryAdded?.();
    } finally {
      setSubmitting(false);
    }
  }

  const preview = [...entries].reverse().slice(0, LOG_PREVIEW);

  return (
    <div className="pt-section">
      <div className="pt-reminders-header">
        <span className="pt-reminders-label">Interaction Log</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          {entries.length > 0 && (
            <button className="pt-reminder-add-btn" onClick={() => setShowAll(true)}>
              View all ({entries.length})
            </button>
          )}
          <button className="pt-reminder-add-btn" onClick={() => setAdding((v) => !v)}>
            {adding ? '× Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {entries.length === 0 && !adding && (
        <p className="pt-reminders-empty">No entries yet.</p>
      )}

      {preview.map((e) => <LogRow key={e.id} entry={e} />)}

      {adding && (
        <div className="pt-log-compose">
          <textarea
            className="pt-log-input"
            placeholder="Log an interaction…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
          />
          <div className="pt-reminder-form-actions">
            <button className="pt-log-submit" onClick={handleSubmit} disabled={!text.trim() || submitting}>
              {submitting ? 'Saving…' : 'Log'}
            </button>
            <button className="pt-reminder-cancel" onClick={() => { setAdding(false); setText(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAll && <LogAllModal entries={entries} onClose={() => setShowAll(false)} />}
    </div>
  );
}

function ScratchpadSection({
  membership,
  contactId,
}: {
  membership: ContactProject;
  contactId: string;
}) {
  const [drafts, setDrafts] = useState<ScratchpadDraft[]>([]);
  const [draftEdits, setDraftEdits] = useState<Record<string, { label: string; body: string }>>({});

  useEffect(() => {
    setDrafts([]);
    setDraftEdits({});
    window.sourcerer.listScratchpad(contactId, membership.id).then(setDrafts);
  }, [membership.id, contactId]);

  function getEdit(draft: ScratchpadDraft) {
    return draftEdits[draft.id] ?? { label: draft.label, body: draft.body };
  }

  function setEdit(id: string, patch: Partial<{ label: string; body: string }>) {
    const draft = drafts.find((d) => d.id === id)!;
    setDraftEdits((prev) => {
      const current = prev[id] ?? { label: draft.label, body: draft.body };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  async function handleSave(draft: ScratchpadDraft) {
    const edit = getEdit(draft);
    const saved = await window.sourcerer.saveScratchpad({
      id: draft.id,
      contactId,
      projectId: membership.id,
      label: edit.label,
      body: edit.body,
    });
    setDrafts((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
    setDraftEdits((prev) => {
      const next = { ...prev };
      delete next[draft.id];
      return next;
    });
  }

  async function handleNewDraft() {
    const draft = await window.sourcerer.saveScratchpad({
      contactId,
      projectId: membership.id,
      label: 'Draft',
      body: '',
    });
    setDrafts((prev) => [...prev, draft]);
  }

  async function handleDelete(id: string) {
    await window.sourcerer.deleteScratchpad(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="pt-section">
      <div className="pt-reminders-header">
        <span className="pt-reminders-label">Message Scratchpad</span>
        <button className="pt-reminder-add-btn" onClick={handleNewDraft}>
          + Add
        </button>
      </div>
      {drafts.length === 0 && <p className="pt-reminders-empty">No drafts yet.</p>}
      {drafts.map((draft) => {
        const edit = getEdit(draft);
        const dirty = edit.label !== draft.label || edit.body !== draft.body;
        return (
          <div key={draft.id} className="pt-draft">
            <div className="pt-draft-header">
              <input
                className="pt-draft-label"
                value={edit.label}
                onChange={(e) => setEdit(draft.id, { label: e.target.value })}
                placeholder="Draft label"
              />
              <button className="pt-draft-delete" onClick={() => handleDelete(draft.id)} title="Delete draft">
                ×
              </button>
            </div>
            <textarea
              className="pt-draft-body"
              value={edit.body}
              onChange={(e) => setEdit(draft.id, { body: e.target.value })}
              placeholder="Write your draft message here…"
              rows={5}
            />
            {dirty && (
              <button className="pt-draft-save" onClick={() => handleSave(draft)}>
                Save draft
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RemindersSection({
  contactId,
  projectId,
  refreshToken,
}: {
  contactId: string;
  projectId: string;
  refreshToken: number;
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setReminders([]);
    setCompleting(new Set());
    window.sourcerer.listRemindersForContactProject(contactId, projectId).then((loaded) => {
      setReminders(loaded);
      setCompleting(new Set(loaded.filter((r) => r.completed_at !== null).map((r) => r.id)));
    });
  }, [contactId, projectId, refreshToken]);

  async function handleAdd() {
    if (!dueDate) return;
    const ts = Math.floor(new Date(dueDate).getTime() / 1000);
    const r = await window.sourcerer.createReminder({
      contactId,
      projectId,
      dueDate: ts,
      note: note.trim() || undefined,
    });
    setReminders((prev) => [...prev, r].sort((a, b) => a.due_date - b.due_date));
    setDueDate('');
    setNote('');
    setAdding(false);
  }

  async function handleDelete(id: string) {
    await window.sourcerer.deleteReminder(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  function handleComplete(id: string) {
    setCompleting((prev) => new Set(prev).add(id));
    window.sourcerer.completeReminder(id);
  }

  const now = Math.floor(Date.now() / 1000);

  function fmtReminderDate(ts: number, overdue: boolean): string {
    const d = new Date(ts * 1000);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${mm}.${dd}`;
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dayName = days[d.getDay()];
    const diffDays = Math.ceil((ts - now) / 86400);
    if (overdue) return `WAS ${dayName} · ${dateStr}`;
    if (diffDays <= 7) return `${dayName} · ${dateStr}`;
    return dateStr;
  }

  return (
    <div className="pt-section">
      <div className="pt-reminders-header">
        <span className="pt-reminders-label">Reminders</span>
        <button className="pt-reminder-add-btn" onClick={() => setAdding((v) => !v)}>
          {adding ? '× CANCEL' : '+ ADD'}
        </button>
      </div>
      {reminders.length === 0 && !adding && (
        <p className="pt-reminders-empty">No reminders set.</p>
      )}
      {reminders.map((r) => {
        const overdue = r.due_date < now;
        if (r.is_auto_outreach === 1) {
          return (
            <div key={r.id} className="pt-reminder-row pt-reminder-row--auto">
              <div className="pt-reminder-row-date pt-reminder-row-date--overdue">Outreach overdue</div>
              <div className="pt-reminder-row-note">Log an interaction to clear this.</div>
            </div>
          );
        }
        const done = completing.has(r.id);
        return (
          <div key={r.id} className={`pt-reminder-row${overdue ? ' pt-reminder-row--overdue' : ''}${done ? ' pt-reminder-row--completing' : ''}`}>
            <div className={`pt-reminder-row-date${overdue && !done ? ' pt-reminder-row-date--overdue' : ''}`}>
              {fmtReminderDate(r.due_date, overdue)}
            </div>
            <div className="pt-reminder-row-note">{r.note || ''}</div>
            <input
              type="checkbox"
              className="pt-reminder-check"
              checked={done}
              onChange={() => { if (!done) handleComplete(r.id); }}
              title="Mark complete"
            />
          </div>
        );
      })}
      {adding && (
        <div className="pt-reminder-form">
          <input
            type="date"
            className="pt-date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            autoFocus
          />
          <input
            className="pt-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
          />
          <div className="pt-reminder-form-actions">
            <button className="pt-log-submit" onClick={handleAdd} disabled={!dueDate}>
              Add
            </button>
            <button className="pt-reminder-cancel" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectTab({ contact, statusOptions, priorityOptions, onMembershipUpdated, currentUser }: Props) {
  const [selectedId, setSelectedId] = useState<string>(() => contact.projects[0]?.id ?? '');
  const [reminderRefresh, setReminderRefresh] = useState(0);

  const membership = contact.projects.find((p) => p.id === selectedId) ?? contact.projects[0];

  // Per-membership local overrides (optimistic updates for dropdowns)
  const [localStatus, setLocalStatus] = useState<string>(membership?.status ?? '');
  const [localPriority, setLocalPriority] = useState<string>(membership?.priority ?? '');
  const [localTheme, setLocalTheme] = useState<string>(membership?.theme ?? '');
  const [localOutreachDisabled, setLocalOutreachDisabled] = useState<boolean>(
    membership?.outreach_reminders_disabled === 1,
  );
  const [localReporters, setLocalReporters] = useState<Array<{ email: string; name: string }>>(
    membership?.reporters ?? [],
  );
  const [projectReporters, setProjectReporters] = useState<Array<{ email: string; name: string }>>([]);
  const [reporterQuery, setReporterQuery] = useState('');
  const [reporterDropdownOpen, setReporterDropdownOpen] = useState(false);
  const reporterWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!membership) return;
    setLocalStatus(membership.status ?? '');
    setLocalPriority(membership.priority ?? '');
    setLocalTheme(membership.theme ?? '');
    setLocalOutreachDisabled(membership.outreach_reminders_disabled === 1);
    setLocalReporters(membership.reporters ?? []);
    setReporterQuery('');
    setReporterDropdownOpen(false);
  }, [membership?.membership_id]);

  useEffect(() => {
    if (!membership) return;
    window.sourcerer.listProjectReporters(membership.id).then((list) => {
      if (list.length === 0 && currentUser) {
        setProjectReporters([{ email: currentUser.email, name: `${currentUser.firstName} ${currentUser.lastName}`.trim() }]);
      } else {
        setProjectReporters(list);
      }
    });
  }, [membership?.id, currentUser]);

  useEffect(() => {
    if (!reporterDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (reporterWrapRef.current && !reporterWrapRef.current.contains(e.target as Node)) {
        setReporterDropdownOpen(false);
        setReporterQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [reporterDropdownOpen]);

  if (!membership) return null;

  function membershipUpdate(overrides: {
    status?: string;
    priority?: string;
    theme?: string;
    outreachDisabled?: boolean;
  }) {
    const status = (overrides.status ?? localStatus) || null;
    const priority = (overrides.priority ?? localPriority) || null;
    const theme = (overrides.theme ?? localTheme) || null;
    const disabled = overrides.outreachDisabled !== undefined ? overrides.outreachDisabled : localOutreachDisabled;
    return window.sourcerer.updateMembership({
      membershipId: membership.membership_id,
      status,
      priority,
      theme,
      outreachRemindersDisabled: disabled ? 1 : 0,
    });
  }

  async function handleStatusChange(value: string) {
    setLocalStatus(value);
    await membershipUpdate({ status: value });
    onMembershipUpdated();
  }

  async function handlePriorityChange(value: string) {
    setLocalPriority(value);
    const opt = priorityOptions.find((p) => p.label === value);
    const shouldDisable = !value || !opt?.outreach_interval_days;
    if (shouldDisable) {
      // Force toggle to OFF (visually reset) whenever priority has no interval
      setLocalOutreachDisabled(false);
      await membershipUpdate({ priority: value, outreachDisabled: false });
    } else {
      await membershipUpdate({ priority: value });
    }
    onMembershipUpdated();
    setReminderRefresh((t) => t + 1);
  }

  async function handleThemeBlur(value: string) {
    setLocalTheme(value);
    await membershipUpdate({ theme: value });
    onMembershipUpdated();
  }

  async function handleOutreachDisabledChange(disabled: boolean) {
    setLocalOutreachDisabled(disabled);
    await membershipUpdate({ outreachDisabled: disabled });
    onMembershipUpdated();
    setReminderRefresh((t) => t + 1);
  }

  async function addReporter(r: { email: string; name: string }) {
    const next = [...localReporters, r];
    setLocalReporters(next);
    setReporterQuery('');
    await window.sourcerer.setMembershipReporters(membership.membership_id, next);
    onMembershipUpdated();
  }

  async function removeReporter(email: string) {
    const next = localReporters.filter((r) => r.email !== email);
    setLocalReporters(next);
    await window.sourcerer.setMembershipReporters(membership.membership_id, next);
    onMembershipUpdated();
  }

  const filteredReporterOptions = projectReporters.filter(
    (r) =>
      !localReporters.some((lr) => lr.email === r.email) &&
      r.name.toLowerCase().includes(reporterQuery.toLowerCase()),
  );

  async function handleDismissConflict() {
    await window.sourcerer.updateMembership({
      membershipId: membership.membership_id,
      clearConflict: true,
    });
    onMembershipUpdated();
  }

  return (
    <div className="detail-body">
      {membership.reporter_conflict === 1 && (
        <div className="pt-conflict-banner">
          <div className="pt-conflict-banner-text">
            <strong>Assignment conflict:</strong> This source was recently assigned to a different reporter during sync.
            Currently assigned to <strong>{membership.reporter_name}</strong>. Review and reassign if needed.
          </div>
          <button className="pt-conflict-dismiss" onClick={handleDismissConflict} title="Dismiss">×</button>
        </div>
      )}

      {contact.projects.length > 1 && (
        <div className="pt-section">
          <div className="pt-section-label">Project</div>
          <select
            className="pt-project-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {contact.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {contact.projects.length === 1 && (
        <div className="pt-project-name-header">{membership.name}</div>
      )}

      <div className="pt-fields">
        <div className="pt-field">
          <label className="pt-label">Status</label>
          <select
            className="pt-select"
            value={localStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="">— none —</option>
            {statusOptions.map((s) => (
              <option key={s.id} value={s.label}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="pt-field">
          <label className="pt-label">Priority</label>
          <select
            className="pt-select"
            value={localPriority}
            onChange={(e) => handlePriorityChange(e.target.value)}
          >
            <option value="">— none —</option>
            {priorityOptions.map((p) => (
              <option key={p.id} value={p.label}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="pt-field">
          <label className="pt-label">Theme</label>
          <input
            className="pt-input"
            value={localTheme}
            onChange={(e) => setLocalTheme(e.target.value)}
            onBlur={(e) => handleThemeBlur(e.target.value)}
            placeholder="e.g. accounting issues, police investigation…"
          />
        </div>

        <div className="pt-field">
          <label className="pt-label">Reporters</label>
          <div className="pt-reporter-select" ref={reporterWrapRef}>
            <div className="pt-reporter-chips" onClick={() => setReporterDropdownOpen(true)}>
              {localReporters.map((r) => (
                <span key={r.email} className="pt-reporter-chip">
                  {r.name}
                  <button
                    className="pt-reporter-chip-remove"
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); removeReporter(r.email); }}
                  >×</button>
                </span>
              ))}
              <input
                className="pt-reporter-search"
                value={reporterQuery}
                onChange={(e) => { setReporterQuery(e.target.value); setReporterDropdownOpen(true); }}
                onFocus={() => setReporterDropdownOpen(true)}
                placeholder={localReporters.length === 0 ? 'Assign reporters…' : ''}
              />
            </div>
            {reporterDropdownOpen && filteredReporterOptions.length > 0 && (
              <div className="pt-reporter-dropdown">
                {filteredReporterOptions.map((r) => (
                  <button
                    key={r.email}
                    className="pt-reporter-option"
                    onMouseDown={(e) => { e.preventDefault(); addReporter(r); }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-field">
          <label className="pt-label">First outreach</label>
          <span className="pt-readonly-date">
            {membership.first_log_at
              ? new Date(membership.first_log_at * 1000).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
              : '—'}
          </span>
        </div>

        <div className="pt-field">
          <label className="pt-label">Last contacted</label>
          <span className="pt-readonly-date">
            {membership.date_last_contacted
              ? new Date(membership.date_last_contacted * 1000).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
              : '—'}
          </span>
        </div>

        <div className="pt-field">
          <label className="pt-label">Outreach reminder</label>
          <div className="pt-outreach-wrap">
            {(() => {
              const opt = localPriority ? priorityOptions.find((p) => p.label === localPriority) : undefined;
              const noReminders = !localPriority || !opt?.outreach_interval_days;
              return (
              <div className={`pt-outreach-disable${noReminders ? ' pt-outreach-disable--no-priority' : ''}`}>
                <button
                  type="button"
                  className={`sv-toggle${localOutreachDisabled ? ' sv-toggle--on' : ''}`}
                  onClick={() => handleOutreachDisabledChange(!localOutreachDisabled)}
                  aria-pressed={localOutreachDisabled}
                  disabled={noReminders}
                >
                  <span className="sv-toggle-knob" />
                  <span className="sv-toggle-label">{localOutreachDisabled ? 'ON' : 'OFF'}</span>
                </button>
                {noReminders
                  ? <span className="sv-toggle-text pt-outreach-no-priority">
                      {!localPriority ? 'Set a priority to enable' : 'No interval set for this priority'}
                    </span>
                  : opt && (() => {
                    const days = opt.outreach_interval_days as number;
                    let interval: string;
                    if (days % 30 === 0) interval = `every ${days / 30} month${days / 30 > 1 ? 's' : ''}`;
                    else if (days % 7 === 0) interval = `every ${days / 7} week${days / 7 > 1 ? 's' : ''}`;
                    else interval = `every ${days} day${days > 1 ? 's' : ''}`;
                    return <span className="sv-toggle-text">{localPriority} · {interval}</span>;
                  })()}
              </div>
              );
            })()}
          </div>
        </div>
      </div>

      <RemindersSection contactId={contact.id} projectId={membership.id} refreshToken={reminderRefresh} />
      <LogSection membership={membership} onEntryAdded={() => { onMembershipUpdated(); setReminderRefresh((t) => t + 1); }} />
      <ScratchpadSection membership={membership} contactId={contact.id} />
    </div>
  );
}
