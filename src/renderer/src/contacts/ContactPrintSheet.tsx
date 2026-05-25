import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContactDetail, InteractionLogEntry } from '@shared/types';
import { fmtDateFull } from '../utils/fmtDate';
import './ContactPrintSheet.css';

interface ProjectLog {
  projectName: string;
  entries: InteractionLogEntry[];
}

interface Props {
  contact: ContactDetail;
  logs: ProjectLog[];
}

const SOCIAL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  x: 'X / Twitter',
  instagram: 'Instagram',
  facebook: 'Facebook',
  other: 'Other',
};

export default function ContactPrintSheet({ contact, logs }: Props) {
  const [printedAt, setPrintedAt] = useState<Date | null>(null);

  useEffect(() => {
    function onBeforePrint() { setPrintedAt(new Date()); }
    window.addEventListener('beforeprint', onBeforePrint);
    return () => window.removeEventListener('beforeprint', onBeforePrint);
  }, []);

  const websites = contact.links.filter((l) => l.type === 'website');
  const socials = contact.links.filter((l) => l.type !== 'website');

  return createPortal(
    <div className="cps-root">
      {/* ── Header ── */}
      <header className="cps-header">
        <div className="cps-meta">Added {fmtDateFull(contact.created_at)}</div>
        <h1 className="cps-name">{contact.name}</h1>
        {contact.organization && (
          <p className="cps-org">{contact.organization}</p>
        )}
      </header>

      <div className="cps-body">
        {/* ── Emails ── */}
        {contact.emails.length > 0 && (
          <section className="cps-section">
            <h2 className="cps-section-label">Email</h2>
            {contact.emails.map((e) => (
              <div key={e.id} className="cps-row">
                <span className="cps-value">{e.email}</span>
                {e.label && <span className="cps-label">{e.label}</span>}
              </div>
            ))}
          </section>
        )}

        {/* ── Phones ── */}
        {contact.phones.length > 0 && (
          <section className="cps-section">
            <h2 className="cps-section-label">Phone</h2>
            {contact.phones.map((p) => (
              <div key={p.id} className="cps-row">
                <span className="cps-value">{p.phone}</span>
                {p.label && <span className="cps-label">{p.label}</span>}
              </div>
            ))}
          </section>
        )}

        {/* ── Social links ── */}
        {socials.length > 0 && (
          <section className="cps-section">
            <h2 className="cps-section-label">Links</h2>
            {socials.map((l) => (
              <div key={l.id} className="cps-row">
                <span className="cps-link-type">
                  {l.type === 'other' && l.label ? l.label : SOCIAL_LABELS[l.type] ?? l.type}
                </span>
                <span className="cps-value">{l.url}</span>
              </div>
            ))}
          </section>
        )}

        {/* ── Websites ── */}
        {websites.length > 0 && (
          <section className="cps-section">
            <h2 className="cps-section-label">Website</h2>
            {websites.map((l) => (
              <div key={l.id} className="cps-row">
                <span className="cps-value">{l.url}</span>
                {l.wayback_url && (
                  <span className="cps-label">archived: {l.wayback_url}</span>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── Notes ── */}
        {contact.notes && (
          <section className="cps-section cps-section--notes">
            <h2 className="cps-section-label">Notes</h2>
            <p className="cps-notes">{contact.notes}</p>
          </section>
        )}

        {/* ── Projects ── */}
        {contact.projects.length > 0 && (
          <section className="cps-section">
            <h2 className="cps-section-label">Projects</h2>
            <table className="cps-projects-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Reporter</th>
                </tr>
              </thead>
              <tbody>
                {contact.projects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.status ?? '—'}</td>
                    <td>{p.priority ?? '—'}</td>
                    <td>{p.reporter_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── Interaction log ── */}
        {logs.some((l) => l.entries.length > 0) && (
          <section className="cps-section">
            <h2 className="cps-section-label">Interaction Log</h2>
            {logs
              .filter((l) => l.entries.length > 0)
              .map((l) => (
                <div key={l.projectName} className="cps-log-project">
                  {logs.filter((x) => x.entries.length > 0).length > 1 && (
                    <div className="cps-log-project-name">{l.projectName}</div>
                  )}
                  {l.entries.map((e) => (
                    <div key={e.id} className="cps-log-entry">
                      <div className="cps-log-meta">
                        <span className="cps-log-date">{fmtDateFull(e.created_at)}</span>
                        <span className="cps-log-reporter">{e.reporter_name}</span>
                      </div>
                      <div className="cps-log-body">{e.body}</div>
                    </div>
                  ))}
                </div>
              ))}
          </section>
        )}
      </div>

      <footer className="cps-footer">
        <span>Printed from Sourcerer</span>
        {printedAt && (
          <span>
            {printedAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            {' · '}
            {printedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </footer>
    </div>,
    document.body
  );
}
