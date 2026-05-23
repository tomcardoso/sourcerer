import { useEffect, useState } from 'react';
import type { ContactDetail as ContactDetailType, Reminder } from '@shared/types';
import Button from '../shell/Button';
import { CalendarPicker } from '../views/CalendarPicker';
import './ContactDetail.css';

export default function GlobalRemindersSection({ contact }: { contact: ContactDetailType }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [completing, setCompleting] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addingSaving, setAddingSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState('');
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setReminders([]);
    setCompleting(new Set());
    setEditingId(null);
    window.sourcerer.listRemindersForContact(contact.id).then((loaded) => {
      if (!cancelled) {
        setReminders(loaded);
        setCompleting(new Set(loaded.filter((r) => r.completed_at !== null).map((r) => r.id)));
      }
    });
    return () => { cancelled = true; };
  }, [contact.id]);

  function sortReminders(a: Reminder, b: Reminder) {
    return b.is_auto_outreach - a.is_auto_outreach || a.due_date - b.due_date;
  }

  function handleStartAdd() {
    const defaultProject = contact.default_membership_id
      ? contact.projects.find((p) => p.membership_id === contact.default_membership_id)
      : null;
    setSelectedProjectId(defaultProject?.id ?? null);
    setDueDate('');
    setNote('');
    setAdding(true);
    setEditingId(null);
  }

  async function handleAdd() {
    if (!dueDate || !note.trim() || addingSaving) return;
    setAddingSaving(true);
    try {
      const ts = Math.floor(new Date(`${dueDate}T09:00:00`).getTime() / 1000);
      const r = await window.sourcerer.createReminder({
        contactId: contact.id,
        projectId: selectedProjectId ?? undefined,
        dueDate: ts,
        note: note.trim(),
      });
      setReminders((prev) => [...prev, r].sort(sortReminders));
      setAdding(false);
    } finally {
      setAddingSaving(false);
    }
  }

  function handleStartEdit(r: Reminder) {
    const d = new Date(r.due_date * 1000);
    setEditDueDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
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
    } catch { /* leave edit form open */ }
  }

  async function handleComplete(id: string) {
    setCompleting((prev) => new Set(prev).add(id));
    try { await window.sourcerer.completeReminder(id); }
    catch { setCompleting((prev) => { const n = new Set(prev); n.delete(id); return n; }); }
  }

  async function handleUncomplete(id: string) {
    setCompleting((prev) => { const n = new Set(prev); n.delete(id); return n; });
    try { await window.sourcerer.uncompleteReminder(id); }
    catch { setCompleting((prev) => new Set(prev).add(id)); }
  }

  async function handleDelete(id: string) {
    try { await window.sourcerer.deleteReminder(id); }
    catch { return; }
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

  const manualReminders = reminders.filter((r) => r.is_auto_outreach === 0);

  return (
    <div className="pt-section">
      <div className="pt-reminders-header">
        <span className="pt-reminders-label">Reminders</span>
        <Button variant="ghost" onClick={() => { if (adding) { setAdding(false); } else { handleStartAdd(); } setEditingId(null); }}>
          {adding ? '× CANCEL' : '+ ADD'}
        </Button>
      </div>
      {manualReminders.length === 0 && !adding && (
        <p className="pt-reminders-empty">No reminders set.</p>
      )}
      {manualReminders.map((r) => {
        const overdue = r.completed_at === null && r.due_date < now;
        const done = completing.has(r.id);
        if (editingId === r.id) {
          return (
            <div key={r.id} className="pt-reminder-form">
              <CalendarPicker label="Due date" value={editDueDate} onChange={setEditDueDate} showYear />
              <input className="pt-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Note" />
              <div className="pt-reminder-form-actions">
                <button className="pt-log-submit" onClick={() => handleSaveEdit(r.id)} disabled={!editDueDate || !editNote.trim()}>Save</button>
                <button className="pt-reminder-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                <button className="pt-reminder-delete-btn" onClick={() => handleDelete(r.id)}>Delete</button>
              </div>
            </div>
          );
        }
        return (
          <div key={r.id} className={`pt-reminder-row${overdue ? ' pt-reminder-row--overdue' : ''}${done ? ' pt-reminder-row--completing' : ''}`}>
            <div className={`pt-reminder-row-date${overdue && !done ? ' pt-reminder-row-date--overdue' : ''}`}>
              {fmtReminderDate(r.due_date, overdue)}
            </div>
            <div className="pt-reminder-row-body">
              <span>{r.note || ''}</span>
              {r.project_name && <span className="pt-log-row-project-badge">{r.project_name}</span>}
            </div>
            {!done && (
              <button className="pt-reminder-edit-btn" onClick={() => handleStartEdit(r)} title="Edit">Edit</button>
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
          <CalendarPicker label="Due date" value={dueDate} onChange={setDueDate} showYear />
          <input className="pt-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
          {contact.projects.length > 0 && (
            <select
              className="pt-select"
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
            >
              <option value="">No project</option>
              {contact.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <div className="pt-reminder-form-actions">
            <button className="pt-log-submit" onClick={handleAdd} disabled={!dueDate || !note.trim() || addingSaving}>Add</button>
            <button className="pt-reminder-cancel" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
