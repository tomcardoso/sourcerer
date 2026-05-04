import { useCallback, useEffect, useState } from 'react';
import type { ContactListItem } from '@shared/types';
import AddContactModal from '../contacts/AddContactModal';
import ContactDetail from '../contacts/ContactDetail';
import './View.css';
import './AllContacts.css';

export default function AllContacts() {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(() => {
    window.sourceror.listContacts().then(setContacts);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = search
    ? contacts.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.organization?.toLowerCase().includes(q) ?? false)
        );
      })
    : contacts;

  function handleCreated(contact: ContactListItem) {
    setContacts((prev) => [...prev, contact].sort((a, b) => a.name.localeCompare(b.name)));
    setShowAdd(false);
    setSelectedId(contact.id);
  }

  function handleDeleted(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelectedId(null);
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">All Contacts</h1>
          {contacts.length > 0 && (
            <p className="view-subtitle">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          + Add Contact
        </button>
      </div>

      <div className="contacts-body">
        <div className="contacts-table-area">
          {contacts.length === 0 ? (
            <div className="view-empty">
              <div className="view-empty-icon">◎</div>
              <div className="view-empty-label">No contacts yet</div>
              <div className="view-empty-hint">
                Add your first contact to get started.
              </div>
            </div>
          ) : (
            <>
              <div className="contacts-search-bar">
                <input
                  className="contacts-search"
                  type="text"
                  placeholder="Search contacts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {filtered.length === 0 ? (
                <div className="contacts-no-results">No contacts match "{search}"</div>
              ) : (
                <table className="contacts-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Organization</th>
                      <th>Projects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr
                        key={c.id}
                        className={selectedId === c.id ? 'selected' : ''}
                        onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                      >
                        <td className="contact-name-cell">{c.name}</td>
                        <td className="contact-org-cell">{c.organization ?? '—'}</td>
                        <td className="contact-projects-cell">
                          {c.projects.length === 0 ? (
                            <span className="contact-no-projects">—</span>
                          ) : (
                            c.projects.map((p) => (
                              <span key={p.id} className="project-tag">{p.name}</span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {selectedId && (
          <ContactDetail
            contactId={selectedId}
            onClose={() => setSelectedId(null)}
            onDeleted={handleDeleted}
            onUpdated={refresh}
          />
        )}
      </div>

      {showAdd && (
        <AddContactModal onCreated={handleCreated} onCancel={() => setShowAdd(false)} />
      )}
    </div>
  );
}
