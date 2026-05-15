import { useEffect, useState } from 'react';
import type { TimelineEntry } from '@shared/types';
import './ProjectTimeline.css';

interface Props {
  projectId: string;
  onSelectContact: (id: string) => void;
}

function dayKey(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (key === todayKey) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (key === yKey) return 'Yesterday';
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${d}, ${y}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}

export default function ProjectTimeline({ projectId, onSelectContact }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setEntries([]);
    setLoading(true);
    window.sourcerer.listProjectTimeline(projectId).then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, [projectId]);

  if (loading) {
    return <div className="ptl-empty">Loading…</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="ptl-empty">
        No interactions logged yet. Log interactions from each contact's Project tab.
      </div>
    );
  }

  // Group by calendar day (entries already sorted newest-first from IPC)
  const groups: Array<{ key: string; entries: TimelineEntry[] }> = [];
  for (const entry of entries) {
    const key = dayKey(entry.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, entries: [entry] });
    }
  }

  return (
    <div className="ptl-root">
      {groups.map((group) => (
        <div key={group.key} className="ptl-group">
          <div className="ptl-day-label">{fmtDayLabel(group.key)}</div>
          <div className="ptl-day-entries">
            {group.entries.map((entry) => (
              <div key={entry.id} className="ptl-entry">
                <div className="ptl-entry-meta">
                  <button
                    className="ptl-contact-name"
                    onClick={() => onSelectContact(entry.contact_id)}
                  >
                    {entry.contact_name}
                  </button>
                  {entry.contact_organization && (
                    <span className="ptl-contact-org">{entry.contact_organization}</span>
                  )}
                </div>
                <p className="ptl-entry-body">{entry.body}</p>
                <div className="ptl-entry-footer">
                  <span className="ptl-reporter">{entry.reporter_name}</span>
                  <span className="ptl-time">{fmtTime(entry.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
