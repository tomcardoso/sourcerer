import { useCallback, useEffect, useState } from 'react';
import type { ContactDetail as ContactDetailType, Project, StatusOption, PriorityOption, User } from '@shared/types';
import GlobalTab from './GlobalTab';
import ProjectTab from './ProjectTab';
import '../views/View.css';
import './ContactDetail.css';

interface Props {
  contactId: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: () => void;
  user?: User | null;
  closing?: boolean;
}

type Tab = 'global' | 'project';

export default function ContactDetail({ contactId, onClose, onDeleted, onUpdated, user, closing }: Props) {
  const [contact, setContact] = useState<ContactDetailType | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<PriorityOption[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('global');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isEditing]);

  const reload = useCallback(() => {
    window.sourcerer.getContact(contactId).then(setContact);
  }, [contactId]);

  useEffect(() => {
    setContact(null);
    setActiveTab('global');
    reload();
    window.sourcerer.listProjects().then(setAllProjects);
    window.sourcerer.listStatusOptions().then(setStatusOptions);
    window.sourcerer.listPriorityOptions().then(setPriorityOptions);
  }, [contactId, reload]);

  const hasProjects = (contact?.projects.length ?? 0) > 0;

  useEffect(() => {
    if (!hasProjects && activeTab === 'project') setActiveTab('global');
  }, [hasProjects, activeTab]);

  function handleMembershipChanged() {
    reload();
    onUpdated();
  }

  return (
    <div className={`detail-panel${closing ? ' detail-panel--closing' : ''}`}>
      <div className="detail-header">
        <div className="detail-header-main">
          {contact ? (
            <>
              <div className="view-kicker">
                Hello world  ·
              </div>
              <h2 className="detail-name">{contact.name}</h2>
              {contact.organization && (
                <p className="detail-org">{contact.organization}</p>
              )}
            </>
          ) : (
            <div className="detail-loading">Loading…</div>
          )}
        </div>
        <button className="detail-close" onClick={onClose}>×</button>
      </div>
      <div className="view-rule-thick" />
      <div className="view-rule-thin" />

      {contact && (
        <>
          <div className="detail-tabs">
            <button
              className={`detail-tab${activeTab === 'global' ? ' detail-tab--active' : ''}`}
              onClick={() => setActiveTab('global')}
            >
              Global
            </button>
            {hasProjects && (
              <button
                className={`detail-tab${activeTab === 'project' ? ' detail-tab--active' : ''}`}
                onClick={() => setActiveTab('project')}
              >
                Project
              </button>
            )}
          </div>

          {activeTab === 'global' && (
            <GlobalTab
              contact={contact}
              allProjects={allProjects}
              onRefresh={reload}
              onMembershipChanged={handleMembershipChanged}
              onDeleted={onDeleted}
              onEditingChange={setIsEditing}
            />
          )}

          {activeTab === 'project' && hasProjects && (
            <ProjectTab
              contact={contact}
              statusOptions={statusOptions}
              priorityOptions={priorityOptions}
              onMembershipUpdated={handleMembershipChanged}
              currentUser={user ? { email: user.email, firstName: user.first_name, lastName: user.last_name } : null}
            />
          )}
        </>
      )}
    </div>
  );
}
