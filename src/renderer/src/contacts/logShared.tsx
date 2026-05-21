import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InteractionLogEntry } from '@shared/types';
import './ContactDetail.css';

export function fmtLogDate(ts: number): string {
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

export function LogRow({ entry, subtitle, onDelete }: { entry: InteractionLogEntry; subtitle?: string | null; onDelete?: (id: string) => void }) {
  return (
    <div className="pt-log-row">
      <div className="pt-log-row-date">{fmtLogDate(entry.created_at)}</div>
      <div className="pt-log-row-content">
        <p className="pt-log-row-body">{entry.body}</p>
        <div className="pt-log-row-footer">
          <span className="pt-log-row-reporter">{entry.reporter_name}</span>
          {subtitle && <span className="pt-log-row-project-badge">{subtitle}</span>}
          {onDelete && (
            <button className="pt-log-row-delete" onClick={() => onDelete(entry.id)} title="Delete entry">×</button>
          )}
        </div>
      </div>
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reversed = [...entries].reverse();
  const visible = query
    ? reversed.filter((e) => e.body.toLowerCase().includes(query.toLowerCase()))
    : reversed;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="pt-log-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pt-log-modal-header">
          <span className="pt-reminders-label">{title}</span>
          <button className="detail-close" onClick={onClose}>×</button>
        </div>
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
      </div>
    </div>,
    document.body,
  );
}
