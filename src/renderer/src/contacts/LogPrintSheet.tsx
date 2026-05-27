import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { InteractionLogEntry } from '@shared/types';
import { toDayKey, fmtDayLabel, fmtTime } from '../utils/fmtDate';
import '../views/Timeline.css';

interface Props {
  title: string;
  entries: InteractionLogEntry[];
  getSubtitle?: (entry: InteractionLogEntry) => string | null | undefined;
}

export default function LogPrintSheet({ title, entries, getSubtitle }: Props) {
  const printedAt = useMemo(() => new Date(), []);

  const groups = useMemo(() => {
    const reversed = [...entries].reverse();
    const map = new Map<string, InteractionLogEntry[]>();
    for (const e of reversed) {
      const key = toDayKey(e.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([key, dayEntries]) => ({ key, entries: dayEntries }));
  }, [entries]);

  return createPortal(
    <div className="ptl-ps-root">
      <header className="ptl-ps-header">
        <h1 className="ptl-ps-title">{title}</h1>
        <div className="ptl-ps-subtitle">Interaction Log</div>
      </header>

      <div>
        {groups.length === 0 ? (
          <p className="ptl-ps-body-text">No entries.</p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="ptl-ps-group">
              <div className="ptl-ps-day">{fmtDayLabel(group.key)}</div>
              {group.entries.map((e) => {
                const subtitle = getSubtitle?.(e);
                return (
                  <div key={e.id} className="ptl-ps-entry">
                    {subtitle && <div className="ptl-ps-badge-row">{subtitle}</div>}
                    <p className="ptl-ps-body-text">{e.body}</p>
                    <div className="ptl-ps-footer">
                      <span className="ptl-ps-reporter">{e.reporter_name}</span>
                      <span className="ptl-ps-time">{fmtTime(e.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <footer className="ptl-ps-page-footer">
        <span>Printed from Sourcerer</span>
        <span>
          {printedAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          {' · '}
          {printedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </span>
      </footer>
    </div>,
    document.body,
  );
}
