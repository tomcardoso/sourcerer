import { useEffect, useState } from 'react';
import type { InteractionLogEntry, Reminder } from '@shared/types';
import { linkifyText } from '../utils/linkify';
import Modal from '../shell/Modal';
import Button from '../shell/Button';
import LogPrintSheet from './LogPrintSheet';
import { CalendarPicker } from '../views/CalendarPicker';
import { toDayKey } from '../utils/fmtDate';
import './ContactDetail.css';

export function sortReminders(a: Reminder, b: Reminder): number {
  return b.is_auto_outreach - a.is_auto_outreach || a.due_date - b.due_date;
}

export function fmtReminderDate(ts: number, overdue: boolean, now: number): string {
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

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function fmtLogDate(ts: number): string {
  const ms = ts * 1000;
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const tomorrowStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (ms >= todayStart && ms < tomorrowStart) return 'today';
  if (ms >= yesterdayStart && ms < todayStart) return 'yesterday';
  const d = new Date(ms);
  const diffDays = Math.round((todayStart - startOfDay(d)) / 86400000);
  if (diffDays < 7) return `${diffDays} days ago`;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const thisYear = new Date().getFullYear();
  if (d.getFullYear() !== thisYear) return `${mm}.${dd}.${String(d.getFullYear()).slice(2)}`;
  return `${mm}.${dd}`;
}

export function LogRow({
  entry,
  subtitle,
  onDelete,
  onEdit,
}: {
  entry: InteractionLogEntry;
  subtitle?: string | null;
  onDelete?: (id: string) => Promise<void> | void;
  onEdit?: (id: string, body: string, createdAt: number) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(entry.body);
  const [editDate, setEditDate] = useState(() => toDayKey(entry.created_at));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const today = toDayKey(Math.floor(Date.now() / 1000));

  async function handleConfirmDelete() {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      await onDelete(entry.id);
    } catch {
      setDeleteError(true);
      setDeleting(false);
    }
  }

  function startEditing() {
    setEditBody(entry.body);
    setEditDate(toDayKey(entry.created_at));
    setSaveError(false);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!onEdit || !editBody.trim() || !editDate) return;
    setSaving(true);
    setSaveError(false);
    try {
      const [y, m, d] = editDate.split('-').map(Number);
      const createdAt = Math.floor(new Date(y, m - 1, d, 12, 0, 0).getTime() / 1000);
      await onEdit(entry.id, editBody.trim(), createdAt);
      setEditing(false);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="pt-log-compose">
        <div className="pt-log-date-row">
          <CalendarPicker label="Select date" value={editDate} onChange={setEditDate} showYear maxDate={today} />
        </div>
        <textarea
          className="pt-log-input"
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          rows={3}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editBody.trim() && editDate && !saving) handleSaveEdit();
          }}
        />
        {saveError && <p className="pt-log-row-error">Failed to save changes. Try again.</p>}
        <div className="pt-reminder-form-actions">
          <button className="pt-log-submit" onClick={handleSaveEdit} disabled={!editBody.trim() || !editDate || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="pt-reminder-cancel" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-log-row">
      <div className="pt-log-row-date">{fmtLogDate(entry.created_at)}</div>
      <div className="pt-log-row-content">
        <p className="pt-log-row-body">{linkifyText(entry.body)}</p>
        <div className="pt-log-row-footer">
          <span className="pt-log-row-reporter">{entry.reporter_name}</span>
          {subtitle && <span className="pt-log-row-project-badge">{subtitle}</span>}
        </div>
        {deleteError && <p className="pt-log-row-error">Failed to delete. Try again.</p>}
      </div>
      {(onEdit || onDelete) && (
        <div className="pt-log-row-actions">
          {confirming ? (
            <>
              <button className="pt-log-row-confirm-yes" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                className="pt-log-row-confirm-no"
                onClick={() => { setConfirming(false); setDeleteError(false); }}
                disabled={deleting}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {onEdit && (
                <button className="pt-log-row-edit" onClick={startEditing} title="Edit entry" aria-label="Edit entry">
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  className="pt-log-row-delete"
                  onClick={() => { setConfirming(true); setDeleteError(false); }}
                  title="Delete entry"
                  aria-label="Delete entry"
                >
                  ×
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function LogAllModal({
  title,
  entries,
  getSubtitle,
  onDelete,
  onEdit,
  onClose,
}: {
  title: string;
  entries: InteractionLogEntry[];
  getSubtitle?: (entry: InteractionLogEntry) => string | null | undefined;
  onDelete?: (id: string) => Promise<void> | void;
  onEdit?: (id: string, body: string, createdAt: number) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const id = requestAnimationFrame(() => { window.print(); });
    const onAfterPrint = () => setPrinting(false);
    window.addEventListener('afterprint', onAfterPrint, { once: true });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [printing]);

  const reversed = [...entries].reverse();
  const visible = query
    ? reversed.filter((e) => e.body.toLowerCase().includes(query.toLowerCase()))
    : reversed;

  return (
    <Modal title={title} onDismiss={onClose} className="pt-log-modal">
      {entries.length > 0 && (
        <div className="pt-log-modal-search">
          <input
            className="pt-log-search-input"
            type="text"
            placeholder="Search entries…"
            aria-label="Search log entries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button className="pt-log-search-clear" aria-label="Clear search" onClick={() => setQuery('')}>×</button>
          )}
        </div>
      )}
      <div className="pt-log-modal-body">
        {visible.length === 0
          ? <p className="pt-reminders-empty">{query ? 'No entries match.' : 'No entries yet.'}</p>
          : visible.map((e) => <LogRow key={e.id} entry={e} subtitle={getSubtitle?.(e)} onDelete={onDelete} onEdit={onEdit} />)
        }
      </div>
      {query && entries.length > 0 && (
        <div className="pt-log-modal-footer">
          {visible.length} of {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </div>
      )}
      <div className="modal-actions">
        <Button variant="secondary" onClick={() => setPrinting(true)}>Print</Button>
        <Button onClick={onClose}>Close</Button>
      </div>
      {printing && <LogPrintSheet title={title} entries={entries} getSubtitle={getSubtitle} />}
    </Modal>
  );
}
