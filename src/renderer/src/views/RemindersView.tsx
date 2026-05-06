import { useCallback, useEffect, useState } from 'react';
import type { Reminder } from '@shared/types';
import './View.css';
import './RemindersView.css';

type TypeFilter = 'all' | 'outreach' | 'manual';

function fmtDueDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function relDays(ts: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil((ts - now) / 86400);
}

interface Props {
  onCountChange?: (overdue: number) => void;
}

export default function RemindersView({ onCountChange }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [upcomingOpen, setUpcomingOpen] = useState(true);

  const refresh = useCallback(async () => {
    const data = await window.sourcerer.listAllReminders();
    setReminders(data);
    const now = Math.floor(Date.now() / 1000);
    onCountChange?.(data.filter((r) => r.due_date < now).length);
  }, [onCountChange]);

  useEffect(() => {
    refresh();
    window.sourcerer.getCalendarUrl().then(setCalendarUrl);
  }, [refresh]);

  async function handleDelete(id: string) {
    await window.sourcerer.deleteReminder(id);
    setReminders((prev) => {
      const next = prev.filter((r) => r.id !== id);
      const now = Math.floor(Date.now() / 1000);
      onCountChange?.(next.filter((r) => r.due_date < now).length);
      return next;
    });
  }

  async function handleCopy() {
    if (!calendarUrl) return;
    await navigator.clipboard.writeText(calendarUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const now = Math.floor(Date.now() / 1000);

  const filtered = reminders.filter((r) => {
    if (typeFilter === 'outreach') return r.is_auto_outreach === 1;
    if (typeFilter === 'manual') return r.is_auto_outreach === 0;
    return true;
  });

  const sortGroup = (list: Reminder[]) =>
    [...list].sort((a, b) => {
      if (a.is_auto_outreach !== b.is_auto_outreach) return b.is_auto_outreach - a.is_auto_outreach;
      return a.due_date - b.due_date;
    });

  const overdue = sortGroup(filtered.filter((r) => r.due_date < now));
  const upcoming = sortGroup(filtered.filter((r) => r.due_date >= now));

  // Counts for filter pills (always based on full unfiltered list)
  const allCount = reminders.length;
  const outreachCount = reminders.filter((r) => r.is_auto_outreach === 1).length;
  const manualCount = reminders.filter((r) => r.is_auto_outreach === 0).length;
  const overdueCount = reminders.filter((r) => r.due_date < now).length;

  const hasAny = reminders.length > 0;

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Reminders</h1>
          {hasAny && (
            <p className="view-subtitle">
              {outreachCount > 0 && manualCount > 0
                ? `${outreachCount} outreach · ${manualCount} manual`
                : outreachCount > 0
                  ? `${outreachCount} outreach reminder${outreachCount !== 1 ? 's' : ''}`
                  : `${manualCount} reminder${manualCount !== 1 ? 's' : ''}`}
              {overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
            </p>
          )}
        </div>
        {calendarUrl && (
          <button className="reminders-ical-btn" onClick={handleCopy} title={calendarUrl}>
            {copied ? 'Copied!' : '📅 Copy iCal URL'}
          </button>
        )}
      </div>

      {!hasAny ? (
        <div className="view-empty">
          <div className="view-empty-icon">◷</div>
          <div className="view-empty-label">No reminders</div>
          <div className="view-empty-hint">
            Add reminders from the project tab in a contact's detail panel.
          </div>
        </div>
      ) : (
        <>
          <div className="reminders-filter-bar">
            {([
              { key: 'all', label: 'All', count: allCount },
              { key: 'outreach', label: 'Outreach', count: outreachCount },
              { key: 'manual', label: 'Manual', count: manualCount },
            ] as { key: TypeFilter; label: string; count: number }[]).map(({ key, label, count }) => (
              <button
                key={key}
                className={`reminders-filter-pill${typeFilter === key ? ' reminders-filter-pill-active' : ''}`}
                onClick={() => setTypeFilter(key)}
                disabled={count === 0 && key !== 'all'}
              >
                {label}
                <span className="reminders-filter-count">{count}</span>
              </button>
            ))}
          </div>

          <div className="reminders-body">
            {overdue.length > 0 && (
              <div className="reminders-group">
                <button
                  className="reminders-group-header"
                  onClick={() => setOverdueOpen((v) => !v)}
                >
                  <span className={`reminders-chevron${overdueOpen ? ' reminders-chevron-open' : ''}`}>›</span>
                  <span className="reminders-group-title">Overdue</span>
                  <span className="reminders-group-count">{overdue.length}</span>
                </button>
                {overdueOpen && overdue.map((r) => (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    daysLabel={`${Math.abs(relDays(r.due_date))}d ago`}
                    overdue
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {upcoming.length > 0 && (
              <div className="reminders-group">
                <button
                  className="reminders-group-header"
                  onClick={() => setUpcomingOpen((v) => !v)}
                >
                  <span className={`reminders-chevron${upcomingOpen ? ' reminders-chevron-open' : ''}`}>›</span>
                  <span className="reminders-group-title">Upcoming</span>
                  <span className="reminders-group-count">{upcoming.length}</span>
                </button>
                {upcomingOpen && upcoming.map((r) => {
                  const days = relDays(r.due_date);
                  const label = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`;
                  return (
                    <ReminderRow key={r.id} reminder={r} daysLabel={label} overdue={false} onDelete={handleDelete} />
                  );
                })}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="reminders-filter-empty">
                No {typeFilter} reminders.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ReminderRow({
  reminder,
  daysLabel,
  overdue,
  onDelete,
}: {
  reminder: Reminder;
  daysLabel: string;
  overdue: boolean;
  onDelete: (id: string) => void;
}) {
  const isAuto = reminder.is_auto_outreach === 1;

  const rowClass = [
    'reminders-item',
    overdue ? (isAuto ? 'reminders-item-overdue-outreach' : 'reminders-item-overdue') : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass}>
      <div className="reminders-item-main">
        <div className="reminders-item-contact">
          {reminder.contact_name}
          {isAuto && <span className="reminders-item-badge reminders-item-badge-outreach">Outreach</span>}
        </div>
        <div className="reminders-item-meta">
          <span className="reminders-item-project">{reminder.project_name}</span>
          {!isAuto && reminder.note && (
            <>
              <span className="reminders-item-sep">·</span>
              <span className="reminders-item-note">{reminder.note}</span>
            </>
          )}
          {isAuto && (
            <>
              <span className="reminders-item-sep">·</span>
              <span className="reminders-item-auto-hint">Log an interaction to clear</span>
            </>
          )}
        </div>
      </div>
      <div className="reminders-item-right">
        {!isAuto && <div className="reminders-item-date">{fmtDueDate(reminder.due_date)}</div>}
        <div className={`reminders-item-days${overdue ? (isAuto ? ' reminders-item-days-outreach' : ' reminders-item-days-overdue') : ''}`}>
          {daysLabel}
        </div>
      </div>
      <button
        className="reminders-item-delete"
        onClick={() => onDelete(reminder.id)}
        title="Delete reminder"
      >
        ×
      </button>
    </div>
  );
}
