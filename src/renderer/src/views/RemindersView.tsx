import { useCallback, useEffect, useState } from 'react';
import type { Reminder, User } from '@shared/types';
import { fmtDateFull } from '../utils/fmtDate';
import ContactDetail from '../contacts/ContactDetail';
import './View.css';
import './RemindersView.css';

function CalendarSetupModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card reminders-cal-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Add to calendar</h2>
        <p className="reminders-cal-modal-intro">
          Subscribe to this URL in your calendar app to see your Sourcerer reminders. This link will only work on devices where you are logged in to Sourcerer and have the app running.
        </p>

        <div className="reminders-cal-url-row">
          <p className="reminders-cal-setup-url">{url}</p>
          <button className="reminders-cal-copy-btn" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>

        <div className="reminders-cal-setup-body">
          <div className="reminders-cal-setup-item">
            <strong>Apple Calendar (Mac)</strong>
            <span>File → New Calendar Subscription → paste the URL → Subscribe</span>
          </div>
          <div className="reminders-cal-setup-item">
            <strong>Outlook (Windows)</strong>
            <span>Add Calendar → From Internet → paste the URL → Import</span>
          </div>
          <div className="reminders-cal-setup-item">
            <strong>Google Calendar</strong>
            <span>Settings → Other calendars → From URL → paste the URL → Add calendar</span>
          </div>
        </div>

        <p className="reminders-cal-setup-note">
          The feed is only available while Sourcerer is running. Existing calendar events are unaffected when the app is closed.
        </p>

        <div className="modal-actions">
          <button className="modal-btn-create" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

type TypeFilter = 'all' | 'outreach' | 'manual';

function fmtDueDate(ts: number): string {
  return fmtDateFull(ts);
}

function relDays(ts: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil((ts - now) / 86400);
}

interface Props {
  onCountChange?: (overdue: number) => void;
  user?: User | null;
}

export default function RemindersView({ onCountChange, user }: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [drawerClosing, setDrawerClosing] = useState(false);

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

  function openContact(contactId: string) {
    if (selectedContactId === contactId) {
      closeContact();
      return;
    }
    setSelectedContactId(contactId);
  }

  function closeContact() {
    setDrawerClosing(true);
    setTimeout(() => {
      setSelectedContactId(null);
      setDrawerClosing(false);
    }, 160);
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
    <>
    {calendarUrl && calendarModalOpen && (
      <CalendarSetupModal url={calendarUrl} onClose={() => setCalendarModalOpen(false)} />
    )}
    <div className="view">
      <div className="view-header">
        {hasAny && (
          <p className="view-kicker">
            {outreachCount > 0 && manualCount > 0
              ? `${outreachCount} outreach · ${manualCount} manual`
              : outreachCount > 0
                ? `${outreachCount} outreach reminder${outreachCount !== 1 ? 's' : ''}`
                : `${manualCount} reminder${manualCount !== 1 ? 's' : ''}`}
            {overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
          </p>
        )}
        <h1 className="view-headline">Reminders</h1>
        <p className="view-subtitle">Scheduled follow-ups and outreach nudges across all your projects.</p>
        <div className="view-rule-thick" />
        <div className="view-rule-thin" />
        <div className="project-meta-bar">
          <div className="project-meta-left">
            {([
              { key: 'all', label: 'All', count: allCount },
              { key: 'outreach', label: 'Outreach', count: outreachCount },
              { key: 'manual', label: 'Manual', count: manualCount },
            ] as { key: TypeFilter; label: string; count: number }[]).map(({ key, label, count }) => (
              <div key={key} className="project-meta-item project-meta-item--btn">
                <button
                  className={`project-meta-action-btn${typeFilter === key ? ' project-meta-action-btn--active' : ''}`}
                  onClick={() => setTypeFilter(key)}
                  disabled={count === 0 && key !== 'all'}
                                >
                  {label}<span className="project-meta-filter-count">{count}</span>
                </button>
              </div>
            ))}
            {calendarUrl && (
              <div className="project-meta-item">
                <button className="project-meta-action-btn" onClick={() => setCalendarModalOpen(true)}>Add to calendar</button>
              </div>
            )}
          </div>
        </div>
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
                    onContactClick={openContact}
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
                    <ReminderRow key={r.id} reminder={r} daysLabel={label} overdue={false} onDelete={handleDelete} onContactClick={openContact} />
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
      {selectedContactId && (
        <ContactDetail
          contactId={selectedContactId}
          onClose={closeContact}
          onDeleted={() => { closeContact(); refresh(); }}
          onUpdated={refresh}
          user={user}
          closing={drawerClosing}
        />
      )}
    </div>
    </>
  );
}

function ReminderRow({
  reminder,
  daysLabel,
  overdue,
  onDelete,
  onContactClick,
}: {
  reminder: Reminder;
  daysLabel: string;
  overdue: boolean;
  onDelete: (id: string) => void;
  onContactClick: (contactId: string) => void;
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
          <button className="reminders-item-contact-btn" onClick={() => onContactClick(reminder.contact_id)}>
            {reminder.contact_name}
          </button>
          {isAuto && <span className="reminders-item-badge reminders-item-badge-outreach">Outreach</span>}
          {!isAuto && <span className="reminders-item-badge reminders-item-badge-manual">Reminder</span>}
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
