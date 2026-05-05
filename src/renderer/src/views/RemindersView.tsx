import { useCallback, useEffect, useState } from 'react';
import type { Reminder } from '@shared/types';
import './View.css';
import './RemindersView.css';

function fmtDueDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function relDays(ts: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil((ts - now) / 86400);
}

export default function RemindersView() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const data = await window.sourcerer.listAllReminders();
    setReminders(data);
  }, []);

  useEffect(() => {
    refresh();
    window.sourcerer.getCalendarUrl().then(setCalendarUrl);
  }, [refresh]);

  async function handleDelete(id: string) {
    await window.sourcerer.deleteReminder(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleCopy() {
    if (!calendarUrl) return;
    await navigator.clipboard.writeText(calendarUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const now = Math.floor(Date.now() / 1000);
  const overdue = reminders.filter((r) => r.due_date < now);
  const upcoming = reminders.filter((r) => r.due_date >= now);

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Reminders</h1>
          {reminders.length > 0 && (
            <p className="view-subtitle">
              {reminders.length} reminder{reminders.length !== 1 ? 's' : ''}
              {overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}
            </p>
          )}
        </div>
        {calendarUrl && (
          <button className="reminders-ical-btn" onClick={handleCopy} title={calendarUrl}>
            {copied ? 'Copied!' : '📅 Copy iCal URL'}
          </button>
        )}
      </div>

      {reminders.length === 0 ? (
        <div className="view-empty">
          <div className="view-empty-icon">◷</div>
          <div className="view-empty-label">No reminders</div>
          <div className="view-empty-hint">
            Add reminders from the project tab in a contact's detail panel.
          </div>
        </div>
      ) : (
        <div className="reminders-body">
          {overdue.length > 0 && (
            <div className="reminders-group">
              <div className="reminders-group-label">Overdue</div>
              {overdue.map((r) => (
                <ReminderRow key={r.id} reminder={r} daysLabel={`${Math.abs(relDays(r.due_date))}d ago`} overdue onDelete={handleDelete} />
              ))}
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="reminders-group">
              {overdue.length > 0 && <div className="reminders-group-label">Upcoming</div>}
              {upcoming.map((r) => {
                const days = relDays(r.due_date);
                const label = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`;
                return (
                  <ReminderRow key={r.id} reminder={r} daysLabel={label} overdue={false} onDelete={handleDelete} />
                );
              })}
            </div>
          )}
        </div>
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
  return (
    <div className={`reminders-item${overdue ? ' reminders-item-overdue' : ''}`}>
      <div className="reminders-item-main">
        <div className="reminders-item-contact">{reminder.contact_name}</div>
        <div className="reminders-item-meta">
          <span className="reminders-item-project">{reminder.project_name}</span>
          {reminder.note && (
            <>
              <span className="reminders-item-sep">·</span>
              <span className="reminders-item-note">{reminder.note}</span>
            </>
          )}
        </div>
      </div>
      <div className="reminders-item-right">
        <div className="reminders-item-date">{fmtDueDate(reminder.due_date)}</div>
        <div className={`reminders-item-days${overdue ? ' reminders-item-days-overdue' : ''}`}>
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
