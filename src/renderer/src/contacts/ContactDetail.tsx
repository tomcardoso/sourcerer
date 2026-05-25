import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContactDetail as ContactDetailType, InteractionLogEntry, Project, StatusOption, PriorityOption, User } from '@shared/types';
import { fmtDateFull } from '../utils/fmtDate';
import GlobalTab from './GlobalTab';
import ProjectTab from './ProjectTab';
import ContactPrintSheet from './ContactPrintSheet';
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [contact, setContact] = useState<ContactDetailType | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<PriorityOption[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('global');
  const [isEditing, setIsEditing] = useState(false);
  const [interactionCount, setInteractionCount] = useState<number | null>(null);
  const [printLogs, setPrintLogs] = useState<Array<{ projectName: string; entries: InteractionLogEntry[] }>>([]);

  // Keep stable refs so the event listener never needs to re-register
  const onCloseRef = useRef(onClose);
  const isEditingRef = useRef(isEditing);
  const contactIdRef = useRef(contactId);
  onCloseRef.current = onClose;
  isEditingRef.current = isEditing;
  contactIdRef.current = contactId;

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, [contactId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.defaultPrevented lets inner overlays (screenshot viewer, log modal)
      // signal that they already handled this Escape, so we don't close the drawer too.
      if (e.key === 'Escape' && !isEditingRef.current && !e.defaultPrevented) {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // stable — only registers once per mount

  const reload = useCallback(() => {
    const id = contactIdRef.current;
    window.sourcerer.getContact(id).then((c) => {
      if (contactIdRef.current === id) setContact(c);
    });
    window.sourcerer.getContactInteractionCount(id).then((n) => {
      if (contactIdRef.current === id) setInteractionCount(n);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setContact(null);
    setActiveTab('global');
    setInteractionCount(null);
    setPrintLogs([]);
    window.sourcerer.getContact(contactId).then((c) => { if (!cancelled) setContact(c); });
    window.sourcerer.listProjects().then((p) => { if (!cancelled) setAllProjects(p); });
    window.sourcerer.listStatusOptions().then((s) => { if (!cancelled) setStatusOptions(s); });
    window.sourcerer.listPriorityOptions().then((p) => { if (!cancelled) setPriorityOptions(p); });
    window.sourcerer.getContactInteractionCount(contactId).then((c) => { if (!cancelled) setInteractionCount(c); });
    return () => { cancelled = true; };
  }, [contactId]);

  const hasProjects = (contact?.projects.length ?? 0) > 0;

  useEffect(() => {
    if (!hasProjects && activeTab === 'project') setActiveTab('global');
  }, [hasProjects, activeTab]);

  useEffect(() => {
    return window.sourcerer.onWaybackUpdated((updatedId) => {
      if (updatedId === contactIdRef.current) reload();
    });
  }, [reload]);

  useEffect(() => {
    return window.sourcerer.onContactsChanged(reload);
  }, [reload]);

  useEffect(() => {
    if (!contact) return;
    let cancelled = false;
    function handleBeforePrint() {
      Promise.all(
        contact!.projects.map((p) =>
          window.sourcerer.listInteractionLog(p.membership_id).then((entries) => ({
            projectName: p.name,
            entries,
          }))
        )
      ).then((logs) => {
        if (!cancelled) setPrintLogs(logs);
      });
    }
    window.addEventListener('beforeprint', handleBeforePrint);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, [contact]);

  function handleMembershipChanged() {
    reload();
    onUpdated();
  }

  return (
    <div ref={panelRef} tabIndex={-1} className={`detail-panel${closing ? ' detail-panel--closing' : ''}`}>
      <div className="detail-header">
        <div className="detail-header-main">
          {contact ? (
            <>
              <div className="view-kicker">
                Added {fmtDateFull(contact.created_at)}
                {interactionCount !== null && interactionCount > 0
                  ? ` · ${interactionCount} interaction${interactionCount !== 1 ? 's' : ''}`
                  : ''}
              </div>
              <h2 className="detail-name">{contact.name}</h2>
              {(contact.organization || contact.title) && (
                <p className="detail-org">
                  {[contact.organization, contact.title].filter(Boolean).join(' · ')}
                </p>
              )}
            </>
          ) : (
            <div className="detail-loading">Loading…</div>
          )}
        </div>
        <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
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
              user={user}
            />
          )}

          {activeTab === 'project' && hasProjects && (
            <ProjectTab
              contact={contact}
              statusOptions={statusOptions}
              priorityOptions={priorityOptions}
              onMembershipUpdated={handleMembershipChanged}
              currentUser={user ? { email: user.email, firstName: user.first_name, lastName: user.last_name, outreachRemindersEnabled: user.outreach_reminders_enabled !== 0 } : null}
            />
          )}

          {/* Rendered always when contact is loaded, visible only on print */}
          <ContactPrintSheet contact={contact} logs={printLogs} />
        </>
      )}
    </div>
  );
}
