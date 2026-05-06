import { useEffect, useRef, useState } from 'react';
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
}

function formatDate(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts * 1000).toISOString().split('T')[0];
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

function LogSection({ membership }: { membership: ContactProject }) {
  const [entries, setEntries] = useState<InteractionLogEntry[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEntries([]);
    setText('');
    window.sourcerer.listInteractionLog(membership.membership_id).then(setEntries);
  }, [membership.membership_id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  async function handleSubmit() {
    const body = text.trim();
    if (!body) return;
    setSubmitting(true);
    try {
      const entry = await window.sourcerer.addInteractionLogEntry(membership.membership_id, body);
      setEntries((prev) => [...prev, entry]);
      setText('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pt-section">
      <div className="pt-section-label">Interaction Log</div>
      {entries.length === 0 ? (
        <p className="pt-empty">No entries yet.</p>
      ) : (
        <div className="pt-log-list">
          {entries.map((e) => (
            <div key={e.id} className="pt-log-entry">
              <div className="pt-log-meta">
                <span className="pt-log-reporter">{e.reporter_name}</span>
                <span className="pt-log-time">{formatTimestamp(e.created_at)}</span>
              </div>
              <p className="pt-log-body">{e.body}</p>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
      <div className="pt-log-compose">
        <textarea
          className="pt-log-input"
          placeholder="Log an interaction…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <button
          className="pt-log-submit"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
        >
          Log
        </button>
      </div>
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
      <div className="pt-section-label">Message Scratchpad</div>
      {drafts.length === 0 && <p className="pt-empty">No drafts yet.</p>}
      {drafts.map((draft) => {
        const edit = getEdit(draft);
        const dirty =
          edit.label !== draft.label || edit.body !== draft.body;
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
      <button className="pt-new-draft-btn" onClick={handleNewDraft}>
        + New draft
      </button>
    </div>
  );
}

function RemindersSection({
  contactId,
  projectId,
}: {
  contactId: string;
  projectId: string;
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setReminders([]);
    window.sourcerer.listRemindersForContactProject(contactId, projectId).then(setReminders);
  }, [contactId, projectId]);

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

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="pt-section">
      <div className="pt-section-label">Reminders</div>
      {reminders.length === 0 && !adding && <p className="pt-empty">No reminders set.</p>}
      {reminders.map((r) => {
        const overdue = r.due_date < now;
        return (
          <div key={r.id} className={`pt-reminder${overdue ? ' pt-reminder-overdue' : ''}`}>
            <div className="pt-reminder-date">
              {new Date(r.due_date * 1000).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
              {overdue && <span className="pt-reminder-overdue-label"> · overdue</span>}
            </div>
            {r.note && <div className="pt-reminder-note">{r.note}</div>}
            <button
              className="pt-reminder-delete"
              onClick={() => handleDelete(r.id)}
              title="Remove reminder"
            >
              ×
            </button>
          </div>
        );
      })}
      {adding ? (
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
            <button className="pt-draft-delete" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="pt-new-draft-btn" onClick={() => setAdding(true)}>
          + Add reminder
        </button>
      )}
    </div>
  );
}

export default function ProjectTab({ contact, statusOptions, priorityOptions, onMembershipUpdated }: Props) {
  const [selectedId, setSelectedId] = useState<string>(() => contact.projects[0]?.id ?? '');

  const membership = contact.projects.find((p) => p.id === selectedId) ?? contact.projects[0];

  // Per-membership local overrides (optimistic updates for dropdowns/date)
  const [localStatus, setLocalStatus] = useState<string>(membership?.status ?? '');
  const [localPriority, setLocalPriority] = useState<string>(membership?.priority ?? '');
  const [localTheme, setLocalTheme] = useState<string>(membership?.theme ?? '');
  const [localDate, setLocalDate] = useState<string>(formatDate(membership?.first_outreach_at ?? null));
  const [localOutreachInterval, setLocalOutreachInterval] = useState<string>(
    membership?.outreach_interval_days != null ? String(membership.outreach_interval_days) : '',
  );
  const [localOutreachDisabled, setLocalOutreachDisabled] = useState<boolean>(
    membership?.outreach_reminders_disabled === 1,
  );

  useEffect(() => {
    if (!membership) return;
    setLocalStatus(membership.status ?? '');
    setLocalPriority(membership.priority ?? '');
    setLocalTheme(membership.theme ?? '');
    setLocalDate(formatDate(membership.first_outreach_at));
    setLocalOutreachInterval(
      membership.outreach_interval_days != null ? String(membership.outreach_interval_days) : '',
    );
    setLocalOutreachDisabled(membership.outreach_reminders_disabled === 1);
  }, [membership?.membership_id]);

  if (!membership) return null;

  function membershipUpdate(overrides: {
    status?: string;
    priority?: string;
    theme?: string;
    date?: string;
    outreachInterval?: string;
    outreachDisabled?: boolean;
  }) {
    const status = (overrides.status ?? localStatus) || null;
    const priority = (overrides.priority ?? localPriority) || null;
    const theme = (overrides.theme ?? localTheme) || null;
    const date = overrides.date ?? localDate;
    const intervalStr = overrides.outreachInterval !== undefined ? overrides.outreachInterval : localOutreachInterval;
    const disabled = overrides.outreachDisabled !== undefined ? overrides.outreachDisabled : localOutreachDisabled;
    const intervalDays = intervalStr.trim() !== '' ? Math.max(1, parseInt(intervalStr, 10)) : null;
    return window.sourcerer.updateMembership({
      membershipId: membership.membership_id,
      status,
      priority,
      theme,
      firstOutreachAt: date ? Math.floor(new Date(date).getTime() / 1000) : null,
      outreachIntervalDays: intervalDays,
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
    await membershipUpdate({ priority: value });
    onMembershipUpdated();
  }

  async function handleThemeBlur(value: string) {
    setLocalTheme(value);
    await membershipUpdate({ theme: value });
    onMembershipUpdated();
  }

  async function handleDateBlur(value: string) {
    setLocalDate(value);
    await membershipUpdate({ date: value });
    onMembershipUpdated();
  }

  async function handleOutreachIntervalBlur(value: string) {
    setLocalOutreachInterval(value);
    await membershipUpdate({ outreachInterval: value });
  }

  async function handleOutreachDisabledChange(disabled: boolean) {
    setLocalOutreachDisabled(disabled);
    await membershipUpdate({ outreachDisabled: disabled });
  }

  return (
    <div className="detail-body">
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
          <label className="pt-label">Reporter</label>
          <span className="pt-reporter">{membership.reporter_name}</span>
        </div>

        <div className="pt-field">
          <label className="pt-label">First Outreach</label>
          <input
            type="date"
            className="pt-date"
            value={localDate}
            onChange={(e) => setLocalDate(e.target.value)}
            onBlur={(e) => handleDateBlur(e.target.value)}
          />
        </div>

        <div className="pt-field pt-field--full">
          <label className="pt-label">Outreach reminder</label>
          <div className="pt-outreach-row">
            <input
              type="number"
              className="pt-outreach-interval"
              min={1}
              placeholder="days (from priority)"
              value={localOutreachInterval}
              onChange={(e) => setLocalOutreachInterval(e.target.value)}
              onBlur={(e) => handleOutreachIntervalBlur(e.target.value)}
              disabled={localOutreachDisabled}
            />
            <label className="pt-outreach-disable">
              <input
                type="checkbox"
                checked={localOutreachDisabled}
                onChange={(e) => handleOutreachDisabledChange(e.target.checked)}
              />
              Disable
            </label>
          </div>
        </div>
      </div>

      <RemindersSection contactId={contact.id} projectId={membership.id} />
      <LogSection membership={membership} />
      <ScratchpadSection membership={membership} contactId={contact.id} />
    </div>
  );
}
