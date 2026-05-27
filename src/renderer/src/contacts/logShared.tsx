import { useEffect, useState } from 'react';
import type { InteractionLogEntry, Reminder } from '@shared/types';
import { linkifyText } from '../utils/linkify';
import Modal from '../shell/Modal';
import Button from '../shell/Button';
import LogPrintSheet from './LogPrintSheet';
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

export function LogRow({ entry, subtitle, onDelete }: { entry: InteractionLogEntry; subtitle?: string | null; onDelete?: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="pt-log-row">
      <div className="pt-log-row-date">{fmtLogDate(entry.created_at)}</div>
      <div className="pt-log-row-content">
        <p className="pt-log-row-body">{linkifyText(entry.body)}</p>
        <div className="pt-log-row-footer">
          <span className="pt-log-row-reporter">{entry.reporter_name}</span>
          {subtitle && <span className="pt-log-row-project-badge">{subtitle}</span>}
        </div>
      </div>
      {onDelete && (
        <div className="pt-log-row-actions">
          {confirming ? (
            <>
              <button className="pt-log-row-confirm-yes" onClick={() => onDelete(entry.id)}>Delete</button>
              <button className="pt-log-row-confirm-no" onClick={() => setConfirming(false)}>Cancel</button>
            </>
          ) : (
            <button className="pt-log-row-delete" onClick={() => setConfirming(true)} title="Delete entry" aria-label="Delete entry">×</button>
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
  onClose,
}: {
  title: string;
  entries: InteractionLogEntry[];
  getSubtitle?: (entry: InteractionLogEntry) => string | null | undefined;
  onDelete?: (id: string) => void;
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
          : visible.map((e) => <LogRow key={e.id} entry={e} subtitle={getSubtitle?.(e)} onDelete={onDelete} />)
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
