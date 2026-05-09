import { useCallback, useEffect, useState } from 'react';
import type { ContactDetail as ContactDetailType, Project, StatusOption, PriorityOption, User } from '@shared/types';
import GlobalTab from './GlobalTab';
import ProjectTab from './ProjectTab';
import './ContactDetail.css';

interface Props {
  contactId: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: () => void;
  user?: User | null;
}

type Tab = 'global' | 'project';

export default function ContactDetail({ contactId, onClose, onDeleted, onUpdated, user }: Props) {
  const [contact, setContact] = useState<ContactDetailType | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<PriorityOption[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('global');

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
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-header-main">
          {contact ? (
            <>
              <h2 className="detail-name">{contact.name}</h2>
              {contact.organization && (
                <p className="detail-org">{contact.organization}</p>
              )}
            </>
          ) : (
            <div className="detail-loading">Loading…</div>
          )}
        </div>
        {contact && (
          <button
            className="detail-vcard-btn"
            onClick={() => window.sourcerer.exportVCardContact(contact.id)}
            title="Export as vCard (.vcf)"
          >
            ↓ vCard
          </button>
        )}
        <button className="detail-close" onClick={onClose}>×</button>
      </div>

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
