import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContactAlertMention } from '@shared/types';
import { fmtDateRelative as fmtDate } from '../utils/fmtDate';
import './View.css';
import './AlertMentions.css';

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function fmtRelative(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
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
  const [feedCount, setFeedCount] = useState(0);
  const [polling, setPolling] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [unreadOpen, setUnreadOpen] = useState(true);
  const [readOpen, setReadOpen] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const pollStartedAt = useRef<number>(0);

  const refresh = useCallback(async () => {
    const data = await window.sourcerer.listMentions();
    setMentions(data);
    window.sourcerer.getFeedCount().then(setFeedCount);
    window.sourcerer.getLastFetched().then((ts) => setLastFetchedAt(ts ? ts * 1000 : null));
  }, []);

  useEffect(() => {
    onUnseenCountChange(mentions.filter((m) => m.seen === 0).length);
  }, [mentions, onUnseenCountChange]);

  useEffect(() => {
    refresh();
    return window.sourcerer.onMentionsUpdated(refresh);
  }, [refresh]);

  async function handleMarkAllSeen() {
    await window.sourcerer.markAllMentionsSeen();
    setMentions((prev) => prev.map((m) => ({ ...m, seen: 1 })));
  }

  async function handleClearAll() {
    await window.sourcerer.clearAllMentions();
    setMentions([]);
    setConfirmClear(false);
  }

  async function handlePollNow() {
    pollStartedAt.current = Date.now();
    setPolling(true);
    await window.sourcerer.pollAlertsNow();
    await refresh();
    const elapsed = Date.now() - pollStartedAt.current;
    const remaining = Math.max(0, 800 - elapsed);
    setTimeout(() => setPolling(false), remaining);
  }

  function handleMarkOneSeen(id: string) {
    window.sourcerer.markMentionSeen(id);
    setMentions((prev) => prev.map((m) => (m.id === id ? { ...m, seen: 1 as const } : m)));
  }

  function handleDismiss(id: string) {
    setMentions((prev) => prev.filter((m) => m.id !== id));
    window.sourcerer.dismissMention(id).catch(() => {});
  }

  const unread = mentions.filter((m) => m.seen === 0);
  const read = mentions.filter((m) => m.seen === 1);
  const unseenCount = unread.length;

  return (
    <div className="view">
      <div className="view-header">
        {(feedCount > 0 || mentions.length > 0) && (
          <p className="view-kicker">
            {feedCount > 0 ? `${feedCount} Google alert${feedCount !== 1 ? 's' : ''}` : ''}
            {mentions.length > 0 ? ` · ${mentions.length} hit${mentions.length !== 1 ? 's' : ''}` : ''}
            {unseenCount > 0 ? ` · ${unseenCount} unread` : ''}
          </p>
        )}
        <h1 className="view-headline">Mentions</h1>
        <p className="view-subtitle">Web hits from Google Alerts, grouped by contact. Add alert feeds from a contact’s detail panel.</p>
        <div className="view-rule-thick" />
        <div className="view-rule-thin" />
        <div className="project-meta-bar">
          <div className="project-meta-left">
            {lastFetchedAt && (
              <div className="project-meta-item project-meta-item--field">
                <span className="project-meta-label">Last fetch</span>
                <span className="project-meta-value">{fmtRelative(lastFetchedAt)}</span>
              </div>
            )}
            {unseenCount > 0 && (
              <div className="project-meta-item">
                <button className="project-meta-action-btn" onClick={handleMarkAllSeen}>Mark all read</button>
              </div>
            )}
            {!confirmClear && mentions.length > 0 && (
              <div className="project-meta-item">
                <button className="project-meta-action-btn" onClick={() => setConfirmClear(true)}>Clear all</button>
              </div>
            )}
            {confirmClear && (
              <div className="project-meta-item">
                <span className="inline-confirm">
                  <span>Clear all mentions?</span>
                  <button className="inline-confirm-yes" onClick={handleClearAll}>Clear</button>
                  <button className="inline-confirm-no" onClick={() => setConfirmClear(false)}>Cancel</button>
                </span>
              </div>
            )}
            <div className="project-meta-item">
              <button
                className={`project-meta-action-btn${polling ? ' project-meta-action-btn--syncing' : ''}`}
                onClick={handlePollNow}
                disabled={polling}
                title="Fetch latest articles from all RSS feeds"
              >
                {polling ? 'Fetching…' : '↻ Fetch now'}
              </button>
            </div>
          </div>
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
                  onDismiss={handleDismiss}
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
                  onDismiss={handleDismiss}
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
  onDismiss,
}: {
  groups: Map<string, ContactAlertMention[]>;
  onMarkSeen: (id: string) => void;
  onDismiss: (id: string) => void;
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
              <div className="alerts-item-actions">
                <button
                  className="alerts-dismiss-btn"
                  onClick={() => onDismiss(m.id)}
                  title="Dismiss permanently"
                >×</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
