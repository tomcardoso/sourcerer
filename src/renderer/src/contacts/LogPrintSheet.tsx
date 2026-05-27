import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { InteractionLogEntry } from '@shared/types';
import { fmtDateFull } from '../utils/fmtDate';
import './LogPrintSheet.css';

interface Props {
  title: string;
  entries: InteractionLogEntry[];
  getSubtitle?: (entry: InteractionLogEntry) => string | null | undefined;
}

export default function LogPrintSheet({ title, entries, getSubtitle }: Props) {
  const printedAt = useMemo(() => new Date(), []);

  return createPortal(
    <div className="lps-root">
      <header className="lps-header">
        <h1 className="lps-title">{title}</h1>
      </header>

      <div className="lps-body">
        {entries.length === 0 ? (
          <p className="lps-empty">No entries.</p>
        ) : (
          [...entries].reverse().map((e) => {
            const subtitle = getSubtitle?.(e);
            return (
              <div key={e.id} className="lps-entry">
                <div className="lps-meta">
                  <span className="lps-date">{fmtDateFull(e.created_at)}</span>
                  <span className="lps-reporter">{e.reporter_name}</span>
                  {subtitle && <span className="lps-subtitle">{subtitle}</span>}
                </div>
                <div className="lps-body-text">{e.body}</div>
              </div>
            );
          })
        )}
      </div>

      <footer className="lps-footer">
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
