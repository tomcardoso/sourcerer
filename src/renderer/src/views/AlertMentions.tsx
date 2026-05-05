import { useCallback, useEffect, useState } from 'react';
import type { ContactAlertMention } from '@shared/types';
import './View.css';
import './AlertMentions.css';

function fmtDate(ts: number | null, fetched: number): string {
  const d = new Date((ts ?? fetched) * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface Props {
  onUnseenCountChange: (n: number) => void;
}

export default function AlertMentions({ onUnseenCountChange }: Props) {
  const [mentions, setMentions] = useState<ContactAlertMention[]>([]);
  const [polling, setPolling] = useState(false);

  const refresh = useCallback(async () => {
    const data = await window.sourcerer.listMentions();
    setMentions(data);
    const unseen = data.filter((m) => m.seen === 0).length;
    onUnseenCountChange(unseen);
  }, [onUnseenCountChange]);

  useEffect(() => {
    refresh();
    return window.sourcerer.onMentionsUpdated(refresh);
  }, [refresh]);

  async function handleMarkAllSeen() {
    await window.sourcerer.markAllMentionsSeen();
    setMentions((prev) => prev.map((m) => ({ ...m, seen: 1 })));
    onUnseenCountChange(0);
  }

  async function handlePollNow() {
    setPolling(true);
    await window.sourcerer.pollAlertsNow();
    await refresh();
    setPolling(false);
  }

  const unseenCount = mentions.filter((m) => m.seen === 0).length;

  // Group by contact name
  const byContact = new Map<string, ContactAlertMention[]>();
  for (const m of mentions) {
    if (!byContact.has(m.contact_name)) byContact.set(m.contact_name, []);
    byContact.get(m.contact_name)!.push(m);
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Alert Mentions</h1>
          {mentions.length > 0 && (
            <p className="view-subtitle">
              {mentions.length} article{mentions.length !== 1 ? 's' : ''}
              {unseenCount > 0 ? ` · ${unseenCount} unread` : ''}
            </p>
          )}
        </div>
        <div className="alerts-header-actions">
          {unseenCount > 0 && (
            <button className="alerts-mark-read-btn" onClick={handleMarkAllSeen}>
              Mark all read
            </button>
          )}
          <button
            className="alerts-poll-btn"
            onClick={handlePollNow}
            disabled={polling}
            title="Fetch latest articles from all RSS feeds"
          >
            {polling ? 'Fetching…' : '↻ Fetch now'}
          </button>
        </div>
      </div>

      {mentions.length === 0 ? (
        <div className="view-empty">
          <div className="view-empty-icon">◉</div>
          <div className="view-empty-label">No mentions yet</div>
          <div className="view-empty-hint">
            Add a Google Alerts RSS URL to a contact to start tracking mentions.
          </div>
        </div>
      ) : (
        <div className="alerts-body">
          {[...byContact.entries()].map(([contactName, items]) => (
            <div key={contactName} className="alerts-contact-group">
              <div className="alerts-contact-name">{contactName}</div>
              {items.map((m) => (
                <div
                  key={m.id}
                  className={`alerts-item ${m.seen === 0 ? 'alerts-item-unread' : ''}`}
                >
                  <div className="alerts-item-main">
                    <a
                      href={m.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="alerts-headline"
                    >
                      {m.headline}
                    </a>
                    <div className="alerts-meta">
                      <span className="alerts-source">{hostname(m.source_url)}</span>
                      <span className="alerts-date">
                        {fmtDate(m.published_at, m.fetched_at)}
                      </span>
                    </div>
                  </div>
                  {m.seen === 0 && <div className="alerts-unread-dot" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
