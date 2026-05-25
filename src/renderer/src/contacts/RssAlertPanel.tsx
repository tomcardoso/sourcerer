import type { ContactAlertRss } from '@shared/types';
import Button from '../shell/Button';
import { isGoogleAlertUrl } from './contactValidation';
import './AddContactModal.css';
import './ContactDetail.css';

interface Props {
  editing: boolean;
  alertRssList: ContactAlertRss[];
  newRssUrl: string;
  onNewRssUrlChange: (v: string) => void;
  onAddRss: () => void;
  onRemoveRss: (id: string) => void;
}

export default function RssAlertPanel({
  editing,
  alertRssList,
  newRssUrl,
  onNewRssUrlChange,
  onAddRss,
  onRemoveRss,
}: Props) {
  if (editing) {
    return (
      <div className="form-field">
        <label className="form-label">Alert RSS Feeds</label>
        {alertRssList.map((feed) => (
          <div key={feed.id} className="ac-dynamic-row">
            <input className="form-input" value={feed.rss_url} readOnly title={feed.rss_url} />
            <button className="ac-remove" type="button" onClick={() => onRemoveRss(feed.id)}></button>
          </div>
        ))}
        <div>
          <input
            className="form-input"
            value={newRssUrl}
            onChange={(e) => onNewRssUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddRss(); } }}
            placeholder="https://news.google.com/rss/search?q=…"
          />
          {newRssUrl.trim() && !isGoogleAlertUrl(newRssUrl.trim()) && (
            <div className="ac-collision-warn">Must be a Google Alerts or Google News RSS URL</div>
          )}
          {newRssUrl.trim() && isGoogleAlertUrl(newRssUrl.trim()) && alertRssList.some((f) => f.rss_url === newRssUrl.trim()) && (
            <div className="ac-collision-warn">⚠ Already added</div>
          )}
        </div>
        <Button
          variant="ghost"
          type="button"
          onClick={onAddRss}
          disabled={!newRssUrl.trim() || !isGoogleAlertUrl(newRssUrl.trim()) || alertRssList.some((f) => f.rss_url === newRssUrl.trim())}
        >
          + Add
        </Button>
        <p className="form-field-hint">
          Paste a Google Alerts RSS URL to automatically track mentions.
          To get one: go to <strong>google.com/alerts</strong>, create an alert, click <strong>Show options</strong>, set Deliver to <strong>RSS feed</strong>, then create the alert and copy the feed URL.
        </p>
      </div>
    );
  }

  if (alertRssList.length === 0) return null;

  return (
    <div className="detail-section">
      <div className="detail-section-label">Alert RSS</div>
      {alertRssList.map((feed) => (
        <div key={feed.id} className="detail-rss-feed">
          <a
            href={feed.rss_url}
            className="detail-link detail-rss-url"
            onClick={(e) => { e.preventDefault(); window.open(feed.rss_url); }}
            title={feed.rss_url}
          >
            {feed.rss_url.length > 60 ? feed.rss_url.slice(0, 60) + '…' : feed.rss_url}
          </a>
          {feed.is_invalid === 1 && (
            <span className="detail-rss-invalid" title="Feed could not be fetched"> ⚠</span>
          )}
          {feed.last_polled_at && (
            <span className="detail-rss-polled">
              Last polled {new Date(feed.last_polled_at * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
