import './View.css';

export default function AllContacts() {
  return (
    <div className="view">
      <div className="view-header">
        <h1 className="view-title">All Contacts</h1>
      </div>
      <div className="view-empty">
        <div className="view-empty-icon">◎</div>
        <div className="view-empty-label">No contacts yet</div>
        <div className="view-empty-hint">
          Add contacts here or through a project to get started.
        </div>
      </div>
    </div>
  );
}
