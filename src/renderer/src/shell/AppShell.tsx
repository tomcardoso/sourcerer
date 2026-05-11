import { useCallback, useEffect, useState } from 'react';
import type { ImportResult, Project, User } from '@shared/types';
import Sidebar from './Sidebar';
import SearchModal from './SearchModal';
import SetupPayloadModal from './SetupPayloadModal';
import AllContacts from '../views/AllContacts';
import ProjectView from '../views/ProjectView';
import ImportCsvModal from '../views/ImportCsvModal';
import ImportResultModal from '../views/ImportResultModal';
import AddContactModal from '../contacts/AddContactModal';
import AlertMentions from '../views/AlertMentions';
import RemindersView from '../views/RemindersView';
import SettingsView from '../views/SettingsView';
import './AppShell.css';

export type NavTarget =
  | { view: 'all-contacts' }
  | { view: 'alerts' }
  | { view: 'reminders' }
  | { view: 'project'; projectId: string }
  | { view: 'settings' };

export default function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [nav, setNav] = useState<NavTarget>({ view: 'all-contacts' });
  const [pendingPayload, setPendingPayload] = useState<{
    project: Project;
    payload: string;
  } | null>(null);
  const [unseenMentions, setUnseenMentions] = useState(0);
  const [overdueReminders, setOverdueReminders] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importRefreshTrigger, setImportRefreshTrigger] = useState(0);

  const refreshOverdue = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000);
    const all = await window.sourcerer.listAllReminders();
    setOverdueReminders(all.filter((r) => r.due_date < now).length);
  }, []);

  useEffect(() => {
    window.sourcerer.getUser().then(setUser);
    window.sourcerer.listProjects().then(setProjects);
    window.sourcerer.getUnseenMentionCount().then(setUnseenMentions);
    window.sourcerer.getContactCount().then(setTotalContacts);
    refreshOverdue();
  }, [refreshOverdue]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        document.body.classList.toggle('redacted');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Refresh unseen count when new mentions arrive
  useEffect(() => {
    return window.sourcerer.onMentionsUpdated(() => {
      window.sourcerer.getUnseenMentionCount().then(setUnseenMentions);
    });
  }, []);

  // Listen for sync status events and refresh the affected project
  useEffect(() => {
    return window.sourcerer.onSyncStatus(() => {
      window.sourcerer.listProjects().then(setProjects);
    });
  }, []);

  useEffect(() => {
    return window.sourcerer.onRemindersChanged(refreshOverdue);
  }, [refreshOverdue]);

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [...prev, project]);
    setNav({ view: 'project', projectId: project.id });
  }

  function handleProjectCreatedShared(project: Project, payload: string) {
    setProjects((prev) => [...prev, project]);
    setNav({ view: 'project', projectId: project.id });
    setPendingPayload({ project, payload });
  }

  function handleProjectJoined(project: Project) {
    setProjects((prev) => {
      if (prev.find((p) => p.id === project.id)) return prev;
      return [...prev, project];
    });
    setNav({ view: 'project', projectId: project.id });
  }

  function handleProjectRenamed(id: string, name: string) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function handleProjectDeleted(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setNav((current) => {
      if (current.view === 'project' && current.projectId === id) {
        return { view: 'all-contacts' };
      }
      return current;
    });
  }

  const activeProject =
    nav.view === 'project' ? projects.find((p) => p.id === nav.projectId) ?? null : null;

  return (
    <div className="app-shell">
      <div className="app-titlebar">
        <div className="app-titlebar-left" />
        <div className="app-titlebar-right">Sourcerer&nbsp;·&nbsp;Local vault&nbsp;·&nbsp;Encrypted</div>
      </div>
      <div className="app-body">
      <Sidebar
        user={user}
        projects={projects}
        nav={nav}
        onNav={setNav}
        unseenMentions={unseenMentions}
        overdueReminders={overdueReminders}
        totalContacts={totalContacts}
        onSearchOpen={() => setSearchOpen(true)}
        onProjectCreated={handleProjectCreated}
        onProjectCreatedShared={handleProjectCreatedShared}
        onProjectJoined={handleProjectJoined}
        onProjectRenamed={handleProjectRenamed}
        onProjectDeleted={handleProjectDeleted}
        onAddContact={() => setShowAddContact(true)}
        onImportCsv={() => setShowImportCsv(true)}
      />
      <main className="app-content">
        {nav.view === 'all-contacts' && (
          <AllContacts
            projects={projects}
            user={user}
            openContactId={openContactId}
            onOpenContactIdConsumed={() => setOpenContactId(null)}
            refreshTrigger={importRefreshTrigger}
          />
        )}
        {nav.view === 'alerts' && (
          <AlertMentions onUnseenCountChange={setUnseenMentions} />
        )}
        {nav.view === 'reminders' && <RemindersView onCountChange={setOverdueReminders} user={user} />}
        {nav.view === 'project' && (
          <ProjectView
            project={activeProject}
            user={user}
            onProjectUpdated={(updated) =>
              setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            }
            refreshTrigger={importRefreshTrigger}
          />
        )}
        {nav.view === 'settings' && <SettingsView user={user} onUserUpdated={setUser} />}
      </main>

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onNav={setNav}
          onOpenContact={(id) => setOpenContactId(id)}
        />
      )}

      {pendingPayload && (
        <SetupPayloadModal
          projectName={pendingPayload.project.name}
          payload={pendingPayload.payload}
          onDone={() => setPendingPayload(null)}
        />
      )}

      {showAddContact && (
        <AddContactModal
          onCreated={(contact) => {
            setShowAddContact(false);
            setNav({ view: 'all-contacts' });
            setOpenContactId(contact.id);
            window.sourcerer.getContactCount().then(setTotalContacts);
          }}
          onCancel={() => setShowAddContact(false)}
        />
      )}

      {showImportCsv && (
        <ImportCsvModal
          projects={projects}
          onComplete={(result) => {
            setShowImportCsv(false);
            setImportResult(result);
            setImportRefreshTrigger((n) => n + 1);
            window.sourcerer.getContactCount().then(setTotalContacts);
          }}
          onClose={() => setShowImportCsv(false)}
        />
      )}

      {importResult && (
        <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
      )}
      </div>
    </div>
  );
}
