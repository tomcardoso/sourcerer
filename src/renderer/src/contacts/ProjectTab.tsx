import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtDateFull } from '../utils/fmtDate';
import { useClickOutside } from '../hooks/useClickOutside';
import { CalendarPicker } from '../views/CalendarPicker';
import Button from '../shell/Button';
import { fmtLogDate, LogRow, LogAllModal } from './logShared';
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
  currentUser?: { email: string; firstName: string; lastName: string; outreachRemindersEnabled: boolean } | null;
}



const LOG_PREVIEW = 3;

// Labels from the default status seed. No UI exists yet to rename statuses, so
// these strings are stable in practice. If custom statuses land, this constant
// should move to a shared location or status_options should gain a system_key column.
const TRIGGER_STATUSES = ['Not yet contacted', 'Contacted, no reply'];

function LogSection({
  membership,
  membershipStatus,
  statusOptions,
  onStatusChange,
  onEntryAdded,
}: {
  membership: ContactProject;
  membershipStatus: string;
  statusOptions: StatusOption[];
  onStatusChange: (value: string) => Promise<void>;
  onEntryAdded?: () => void;
}) {
  const [entries, setEntries] = useState<InteractionLogEntry[]>([]);
  const [text, setText] = useState('');
  const [logDate, setLogDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showStatusPrompt, setShowStatusPrompt] = useState(false);
  const [promptStatus, setPromptStatus] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    setEntries([]);
    setText('');
    setLogDate('');
    setAdding(false);
    setShowStatusPrompt(false);
    window.sourcerer.listInteractionLog(membership.membership_id).then(setEntries);
  }, [membership.membership_id]);

  async function handleSubmit() {
    const body = text.trim();
    if (!body || !logDate) return;
    setSubmitting(true);
    try {
      const [y, m, d] = logDate.split('-').map(Number);
      const createdAt = Math.floor(new Date(y, m - 1, d, 12, 0, 0).getTime() / 1000);
      const entry = await window.sourcerer.addInteractionLogEntry(membership.membership_id, body, createdAt);
      setEntries((prev) => [...prev, entry].sort((a, b) => a.created_at - b.created_at));
      setText('');
      setLogDate('');
      setAdding(false);
      onEntryAdded?.();
      if (TRIGGER_STATUSES.includes(membershipStatus)) {
        const suggested =
          statusOptions.find((s) => s.label === 'In dialogue') ??
          statusOptions.find((s) => !TRIGGER_STATUSES.includes(s.label));
        if (suggested) {
          setPromptStatus(suggested.label);
          setShowStatusPrompt(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusUpdate() {
    setUpdatingStatus(true);
    try {
      await onStatusChange(promptStatus);
      setShowStatusPrompt(false);
    } catch {
      setShowStatusPrompt(false);
    } finally {
      setUpdatingStatus(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const preview = [...entries].reverse().slice(0, LOG_PREVIEW);

  return (
    <div className="pt-section">
      <div className="pt-reminders-header">
        <span className="pt-reminders-label">Interaction Log</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          {entries.length > 0 && (
            <Button variant="ghost" onClick={() => setShowAll(true)}>
              View all ({entries.length})
            </Button>
          )}
          <Button variant="ghost" onClick={() => {
            if (!adding) setLogDate(today);
            setAdding((v) => !v);
          }}>
            {adding ? '× Cancel' : '+ Add'}
          </Button>
        </div>
      </div>

      {entries.length === 0 && !adding && (
        <p className="pt-reminders-empty">No entries yet.</p>
      )}

      {preview.map((e) => <LogRow key={e.id} entry={e} />)}

      {showStatusPrompt && (
        <div className="pt-status-prompt">
          <span className="pt-status-prompt-label">Update status?</span>
          <select
            className="pt-status-prompt-select"
            value={promptStatus}
            onChange={(e) => setPromptStatus(e.target.value)}
          >
            {statusOptions
              .filter((s) => !TRIGGER_STATUSES.includes(s.label))
              .map((s) => (
                <option key={s.id} value={s.label}>{s.label}</option>
              ))}
          </select>
          <button
            className="pt-status-prompt-update"
            onClick={handleStatusUpdate}
            disabled={updatingStatus}
          >
            {updatingStatus ? 'Updating…' : 'Update'}
          </button>
          <button className="pt-status-prompt-dismiss" onClick={() => setShowStatusPrompt(false)}>
            Dismiss
          </button>
        </div>
      )}

      {adding && (
        <div className="pt-log-compose">
          <div className="pt-log-date-row">
            <label className="pt-log-date-label">Date</label>
            <CalendarPicker
              label="Select date"
              value={logDate}
              onChange={setLogDate}
              showYear
              maxDate={today}
            />
          </div>
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
            <button className="pt-log-submit" onClick={handleSubmit} disabled={!text.trim() || !logDate || submitting}>
              {submitting ? 'Saving…' : 'Log'}
            </button>
            <button className="pt-reminder-cancel" onClick={() => { setAdding(false); setText(''); setLogDate(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAll && <LogAllModal title="Interaction Log" entries={entries} onClose={() => setShowAll(false)} />}
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
        <Button variant="ghost" onClick={handleNewDraft}>
          + Add
        </Button>
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
  outreachEnabled,
  contactOutreachEnabled,
}: {
  contactId: string;
  projectId: string;
  refreshToken: number;
  outreachEnabled: boolean;
  contactOutreachEnabled: boolean;
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState('');
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    setReminders([]);
    setCompleting(new Set());
    setEditingId(null);
    window.sourcerer.listRemindersForContactProject(contactId, projectId).then((loaded) => {
      setReminders(loaded);
      setCompleting(new Set(loaded.filter((r) => r.completed_at !== null).map((r) => r.id)));
    });
  }, [contactId, projectId, refreshToken]);

  function sortReminders(a: Reminder, b: Reminder) {
    return b.is_auto_outreach - a.is_auto_outreach || a.due_date - b.due_date;
  }

  async function handleAdd() {
    if (!dueDate || !note.trim()) return;
    const ts = Math.floor(new Date(`${dueDate}T09:00:00`).getTime() / 1000);
    const r = await window.sourcerer.createReminder({
      contactId,
      projectId,
      dueDate: ts,
      note: note.trim(),
    });
    setReminders((prev) => [...prev, r].sort(sortReminders));
    setDueDate('');
    setNote('');
    setAdding(false);
  }

  function handleStartEdit(r: Reminder) {
    const d = new Date(r.due_date * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setEditDueDate(`${yyyy}-${mm}-${dd}`);
    setEditNote(r.note ?? '');
    setEditingId(r.id);
    setAdding(false);
  }

  async function handleSaveEdit(id: string) {
    if (!editDueDate || !editNote.trim()) return;
    const ts = Math.floor(new Date(`${editDueDate}T09:00:00`).getTime() / 1000);
    try {
      const updated = await window.sourcerer.updateReminder({ id, dueDate: ts, note: editNote.trim() });
      setReminders((prev) => prev.map((r) => (r.id === id ? updated : r)).sort(sortReminders));
      setEditingId(null);
    } catch {
      // leave edit form open so the user can retry
    }
  }

  async function handleComplete(id: string) {
    setCompleting((prev) => new Set(prev).add(id));
    try {
      await window.sourcerer.completeReminder(id);
    } catch {
      setCompleting((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function handleUncomplete(id: string) {
    setCompleting((prev) => { const next = new Set(prev); next.delete(id); return next; });
    try {
      await window.sourcerer.uncompleteReminder(id);
    } catch {
      setCompleting((prev) => new Set(prev).add(id));
    }
  }

  async function handleDelete(id: string) {
    try {
      await window.sourcerer.deleteReminder(id);
    } catch {
      return;
    }
    setReminders((prev) => prev.filter((r) => r.id !== id));
    setEditingId(null);
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
        <Button variant="ghost" onClick={() => { setAdding((v) => !v); setEditingId(null); }}>
          {adding ? '× CANCEL' : '+ ADD'}
        </Button>
      </div>
      {reminders.length === 0 && !adding && (
        <p className="pt-reminders-empty">No reminders set.</p>
      )}
      {reminders.map((r) => {
        const overdue = r.due_date < now;
        if (r.is_auto_outreach === 1) {
          // Only show the auto-outreach overdue notice when global and per-contact reminders are both on
          if (!outreachEnabled || !contactOutreachEnabled) return null;
          return (
            <div key={r.id} className="pt-reminder-row pt-reminder-row--auto">
              <div className="pt-reminder-row-date pt-reminder-row-date--overdue">Outreach overdue</div>
              <div className="pt-reminder-row-note pt-reminder-row-hint">Log an interaction to clear this.</div>
            </div>
          );
        }
        const done = completing.has(r.id);
        if (editingId === r.id) {
          return (
            <div key={r.id} className="pt-reminder-form">
              <CalendarPicker
                label="Due date"
                value={editDueDate}
                onChange={setEditDueDate}
                showYear
              />
              <input
                className="pt-input"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Note"
              />
              <div className="pt-reminder-form-actions">
                <button
                  className="pt-log-submit"
                  onClick={() => handleSaveEdit(r.id)}
                  disabled={!editDueDate || !editNote.trim()}
                >
                  Save
                </button>
                <button className="pt-reminder-cancel" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
                <button className="pt-reminder-delete-btn" onClick={() => handleDelete(r.id)}>
                  Delete
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={r.id} className={`pt-reminder-row${overdue ? ' pt-reminder-row--overdue' : ''}${done ? ' pt-reminder-row--completing' : ''}`}>
            <div className={`pt-reminder-row-date${overdue && !done ? ' pt-reminder-row-date--overdue' : ''}`}>
              {fmtReminderDate(r.due_date, overdue)}
            </div>
            <div className="pt-reminder-row-note">{r.note || ''}</div>
            {!done && (
              <button className="pt-reminder-edit-btn" onClick={() => handleStartEdit(r)} title="Edit">
                Edit
              </button>
            )}
            <input
              type="checkbox"
              className="pt-reminder-check"
              checked={done}
              onChange={() => { if (done) handleUncomplete(r.id); else handleComplete(r.id); }}
              title={done ? 'Mark incomplete' : 'Mark complete'}
            />
          </div>
        );
      })}
      {adding && (
        <div className="pt-reminder-form">
          <CalendarPicker
            label="Due date"
            value={dueDate}
            onChange={setDueDate}
            showYear
          />
          <input
            className="pt-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
          />
          <div className="pt-reminder-form-actions">
            <button className="pt-log-submit" onClick={handleAdd} disabled={!dueDate || !note.trim()}>
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
  const [localOutreachEnabled, setLocalOutreachEnabled] = useState<boolean>(
    membership?.outreach_reminders_enabled !== 0,
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
    setLocalOutreachEnabled(membership.outreach_reminders_enabled !== 0);
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

  const handleCloseReporterDropdown = useCallback(() => {
    setReporterDropdownOpen(false);
    setReporterQuery('');
  }, []);
  useClickOutside(reporterWrapRef, handleCloseReporterDropdown, {
    isOpen: reporterDropdownOpen,
    escapeKey: false,
  });

  if (!membership) return null;

  function membershipUpdate(overrides: {
    status?: string;
    priority?: string;
    theme?: string;
    outreachEnabled?: boolean;
  }) {
    const status = (overrides.status ?? localStatus) || null;
    const priority = (overrides.priority ?? localPriority) || null;
    const theme = (overrides.theme ?? localTheme) || null;
    const enabled = overrides.outreachEnabled !== undefined ? overrides.outreachEnabled : localOutreachEnabled;
    return window.sourcerer.updateMembership({
      membershipId: membership.membership_id,
      status,
      priority,
      theme,
      outreachRemindersEnabled: enabled ? 1 : 0,
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
      // Force toggle to ON (enabled) whenever priority has no interval
      setLocalOutreachEnabled(true);
      await membershipUpdate({ priority: value, outreachEnabled: true });
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

  async function handleOutreachEnabledChange(enabled: boolean) {
    setLocalOutreachEnabled(enabled);
    await membershipUpdate({ outreachEnabled: enabled });
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
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && reporterQuery === '' && localReporters.length > 0) {
                    removeReporter(localReporters[localReporters.length - 1].email);
                  }
                }}
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
            {fmtDateFull(membership.first_log_at ?? null)}
          </span>
        </div>

        <div className="pt-field">
          <label className="pt-label">Last contacted</label>
          <span className="pt-readonly-date">
            {fmtDateFull(membership.date_last_contacted ?? null)}
          </span>
        </div>

        <div className="pt-field">
          <label className="pt-label">Outreach reminder</label>
          <div className="pt-outreach-wrap">
            {(() => {
              const opt = localPriority ? priorityOptions.find((p) => p.label === localPriority) : undefined;
              const noReminders = !localPriority || !opt?.outreach_interval_days;
              const globallyDisabled = !(currentUser?.outreachRemindersEnabled ?? true);
              return (
              <div className={`pt-outreach-disable${noReminders || globallyDisabled ? ' pt-outreach-disable--no-priority' : ''}`}>
                <button
                  type="button"
                  className={`sv-toggle${!localOutreachEnabled ? ' sv-toggle--on' : ''}`}
                  onClick={() => handleOutreachEnabledChange(!localOutreachEnabled)}
                  aria-pressed={!localOutreachEnabled}
                  disabled={noReminders || globallyDisabled}
                >
                  <span className="sv-toggle-knob" />
                  <span className="sv-toggle-label">{!localOutreachEnabled ? 'ON' : 'OFF'}</span>
                </button>
                {globallyDisabled
                  ? <span className="sv-toggle-text pt-outreach-no-priority">Outreach reminders are off globally</span>
                  : noReminders
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

      <RemindersSection
        contactId={contact.id}
        projectId={membership.id}
        refreshToken={reminderRefresh}
        outreachEnabled={currentUser?.outreachRemindersEnabled ?? true}
        contactOutreachEnabled={localOutreachEnabled}
      />
      <LogSection
        membership={membership}
        membershipStatus={localStatus}
        statusOptions={statusOptions}
        onStatusChange={handleStatusChange}
        onEntryAdded={() => { onMembershipUpdated(); setReminderRefresh((t) => t + 1); }}
      />
      <ScratchpadSection membership={membership} contactId={contact.id} />
    </div>
  );
}
