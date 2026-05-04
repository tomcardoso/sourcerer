import './View.css';

export default function AlertMentions() {
  return (
    <div className="view">
      <div className="view-header">
        <h1 className="view-title">Alert Mentions</h1>
      </div>
      <div className="view-empty">
        <div className="view-empty-icon">◉</div>
        <div className="view-empty-label">No alert mentions yet</div>
        <div className="view-empty-hint">
          Add a Google Alerts RSS URL to a contact to start tracking mentions.
        </div>
      </div>
    </div>
  );
}
