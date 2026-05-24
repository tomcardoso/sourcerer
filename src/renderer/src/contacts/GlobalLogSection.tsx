import { useEffect, useRef, useState } from 'react';
import type { ContactDetail as ContactDetailType, ContactLogEntry } from '@shared/types';
import Button from '../shell/Button';
import { LogRow, LogAllModal } from './logShared';
import LogProjectPicker from './LogProjectPicker';
import { CalendarPicker } from '../views/CalendarPicker';
import './ContactDetail.css';

const LOG_PREVIEW = 3;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function GlobalLogSection({ contact, onUpdated }: { contact: ContactDetailType; onUpdated?: () => void }) {
  const [logEntries, setLogEntries] = useState<ContactLogEntry[]>([]);
  const [logAdding, setLogAdding] = useState(false);
  const [logText, setLogText] = useState('');
  const [logDate, setLogDate] = useState('');
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logShowAll, setLogShowAll] = useState(false);
  const [logSelectedMembershipIds, setLogSelectedMembershipIds] = useState<string[]>([]);
  const currentContactId = useRef(contact.id);

  // Close the modal when the user opens a contact in the global drawer while this
  // ContactDetail remains mounted in the background (the contact.id change effect
  // never fires in that scenario because this component's contact prop doesn't update).
  useEffect(() => {
    const close = () => setLogShowAll(false);
    window.addEventListener('sourcerer:global-nav', close);
    return () => window.removeEventListener('sourcerer:global-nav', close);
  }, []);

  useEffect(() => {
    currentContactId.current = contact.id;
    let cancelled = false;
    setLogEntries([]);
    setLogAdding(false);
    setLogText('');
    setLogDate('');
    setLogShowAll(false);
    setLogSelectedMembershipIds([]);
    window.sourcerer.listContactLog(contact.id).then((entries) => {
      if (!cancelled) setLogEntries(entries);
    });
    return () => { cancelled = true; };
  }, [contact.id]);

  async function handleLogDelete(id: string) {
    try {
      await window.sourcerer.deleteInteractionLogEntry(id);
      setLogEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { /* entry stays in list */ }
  }

  function cancelLog() {
    setLogAdding(false);
    setLogText('');
    setLogDate('');
    setLogSelectedMembershipIds([]);
  }

  async function handleLogSubmit() {
    const body = logText.trim();
    if (!body || !logDate) return;
    const submittingContactId = contact.id;
    setLogSubmitting(true);
    try {
      const [y, m, d] = logDate.split('-').map(Number);
      const createdAt = Math.floor(new Date(y, m - 1, d, 12, 0, 0).getTime() / 1000);
      const entry = await window.sourcerer.addGlobalLogEntry(contact.id, body, createdAt, logSelectedMembershipIds);
      if (currentContactId.current !== submittingContactId) return;
      setLogEntries((prev) => [...prev, entry].sort((a, b) => a.created_at - b.created_at));
      setLogText('');
      setLogDate('');
      setLogSelectedMembershipIds([]);
      setLogAdding(false);
      onUpdated?.();
    } finally {
      setLogSubmitting(false);
    }
  }

  return (
    <div className="pt-section">
      <div className="pt-reminders-header">
        <span className="pt-reminders-label">Interaction Log</span>
        <div className="pt-log-header-actions">
          {logEntries.length > 0 && (
            <Button variant="ghost" onClick={() => setLogShowAll(true)}>
              View all ({logEntries.length})
            </Button>
          )}
          {!logAdding && (
            <Button variant="ghost" onClick={() => {
              setLogDate(localToday());
              const effectiveDefault = contact.projects.find(
                (p) => p.membership_id === contact.default_membership_id,
              );
              setLogSelectedMembershipIds(effectiveDefault ? [effectiveDefault.membership_id] : []);
              setLogAdding(true);
            }}>
              + Add
            </Button>
          )}
        </div>
      </div>

      {logEntries.length === 0 && !logAdding && (
        <p className="pt-reminders-empty">No entries yet.</p>
      )}

      {[...logEntries].reverse().slice(0, LOG_PREVIEW).map((e) => (
        <LogRow key={e.id} entry={e} subtitle={e.project_name} onDelete={handleLogDelete} />
      ))}

      {logAdding && (
        <div className="pt-log-compose pt-log-compose--global">
          <div className="pt-log-date-row">
            <CalendarPicker
              label="Select date"
              value={logDate}
              onChange={setLogDate}
              showYear
              maxDate={localToday()}
            />
          </div>
          <textarea
            className="pt-log-input"
            placeholder="Log an interaction…"
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleLogSubmit();
            }}
          />
          {contact.projects.length > 0 && (
            <div className="pt-log-projects">
              <LogProjectPicker
                projects={contact.projects}
                selectedIds={logSelectedMembershipIds}
                onChange={setLogSelectedMembershipIds}
              />
            </div>
          )}
          <div className="pt-reminder-form-actions">
            <button
              className="pt-log-submit"
              onClick={handleLogSubmit}
              disabled={!logText.trim() || !logDate || logSubmitting}
            >
              {logSubmitting ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="pt-reminder-cancel" onClick={cancelLog}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {logShowAll && (
        <LogAllModal
          title={`Interaction Log — ${contact.name}`}
          entries={logEntries}
          getSubtitle={(e) => (e as ContactLogEntry).project_name}
          onDelete={handleLogDelete}
          onClose={() => setLogShowAll(false)}
        />
      )}
    </div>
  );
}
