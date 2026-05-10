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

function groupByContact(items: ContactAlertMention[]): Map<string, ContactAlertMention[]> {
  const map = new Map<string, ContactAlertMention[]>();
  for (const m of items) {
    if (!map.has(m.contact_name)) map.set(m.contact_name, []);
    map.get(m.contact_name)!.push(m);
  }
  return map;
}

interface Props {
  onUnseenCountChange: (n: number) => void;
}

export default function AlertMentions({ onUnseenCountChange }: Props) {
  const [mentions, setMentions] = useState<ContactAlertMention[]>([]);
  const [polling, setPolling] = useState(false);
  const [unreadOpen, setUnreadOpen] = useState(true);
  const [readOpen, setReadOpen] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(async () => {
    const data = await window.sourcerer.listMentions();
    setMentions(data);
    onUnseenCountChange(data.filter((m) => m.seen === 0).length);
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

  async function handleClearAll() {
    await window.sourcerer.clearAllMentions();
    setMentions([]);
    onUnseenCountChange(0);
    setConfirmClear(false);
  }

  async function handlePollNow() {
    setPolling(true);
    await window.sourcerer.pollAlertsNow();
    await refresh();
    setPolling(false);
  }

  function handleMarkOneSeen(id: string) {
    window.sourcerer.markMentionSeen(id);
    setMentions((prev) => prev.map((m) => (m.id === id ? { ...m, seen: 1 } : m)));
    onUnseenCountChange(mentions.filter((m) => m.seen === 0 && m.id !== id).length);
  }

  const unread = mentions.filter((m) => m.seen === 0);
  const read = mentions.filter((m) => m.seen === 1);
  const unseenCount = unread.length;

  return (
    <div className="view">
      <div className="view-header">
        <div>
          {mentions.length > 0 && (
            <p className="view-kicker">
              {mentions.length} article{mentions.length !== 1 ? 's' : ''}
              {unseenCount > 0 ? ` · ${unseenCount} unread` : ''}
            </p>
          )}
          <h1 className="view-headline">Mentions</h1>
        </div>
        <div className="alerts-header-actions">
          {unseenCount > 0 && (
            <button className="alerts-action-btn" onClick={handleMarkAllSeen}>
              Mark all read
            </button>
          )}
          {!confirmClear && mentions.length > 0 && (
            <button className="alerts-action-btn" onClick={() => setConfirmClear(true)}>
              Clear all…
            </button>
          )}
          {confirmClear && (
            <span className="alerts-clear-confirm">
              <span className="alerts-clear-confirm-text">Clear all mentions?</span>
              <button className="alerts-clear-confirm-yes" onClick={handleClearAll}>Clear</button>
              <button className="alerts-clear-confirm-no" onClick={() => setConfirmClear(false)}>Cancel</button>
            </span>
          )}
          <button
            className="alerts-action-btn"
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
          {unread.length > 0 && (
            <div className="alerts-section">
              <button
                className="alerts-section-header"
                onClick={() => setUnreadOpen((v) => !v)}
              >
                <span className={`alerts-chevron${unreadOpen ? ' alerts-chevron-open' : ''}`}>›</span>
                <span className="alerts-section-title">Unread</span>
                <span className="alerts-section-count">{unread.length}</span>
              </button>
              {unreadOpen && (
                <MentionGroups
                  groups={groupByContact(unread)}
                  onMarkSeen={handleMarkOneSeen}
                />
              )}
            </div>
          )}

          {read.length > 0 && (
            <div className="alerts-section">
              <button
                className="alerts-section-header"
                onClick={() => setReadOpen((v) => !v)}
              >
                <span className={`alerts-chevron${readOpen ? ' alerts-chevron-open' : ''}`}>›</span>
                <span className="alerts-section-title">Read</span>
                <span className="alerts-section-count">{read.length}</span>
              </button>
              {readOpen && (
                <MentionGroups
                  groups={groupByContact(read)}
                  onMarkSeen={handleMarkOneSeen}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MentionGroups({
  groups,
  onMarkSeen,
}: {
  groups: Map<string, ContactAlertMention[]>;
  onMarkSeen: (id: string) => void;
}) {
  return (
    <>
      {[...groups.entries()].map(([contactName, items]) => (
        <div key={contactName} className="alerts-contact-group">
          <div className="alerts-contact-name">{contactName}</div>
          {items.map((m) => (
            <div
              key={m.id}
              className={`alerts-item${m.seen === 0 ? ' alerts-item-unread' : ''}`}
            >
              <div className="alerts-item-main">
                <a
                  href={m.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="alerts-headline"
                  onClick={() => {
                    if (m.seen === 0) onMarkSeen(m.id);
                  }}
                >
                  {m.headline}
                </a>
                <div className="alerts-meta">
                  <span className="alerts-source">{hostname(m.source_url)}</span>
                  <span className="alerts-date">{fmtDate(m.published_at, m.fetched_at)}</span>
                </div>
              </div>
              {m.seen === 0 && <div className="alerts-unread-dot" />}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
