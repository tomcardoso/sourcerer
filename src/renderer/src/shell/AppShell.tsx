import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImportResult, Project, User } from '@shared/types';
import Sidebar from './Sidebar';
import SearchModal from './SearchModal';
import SetupPayloadModal from './SetupPayloadModal';
import AllContacts from '../views/AllContacts';
import ProjectView from '../views/ProjectView';
import ImportCsvModal from '../views/ImportCsvModal';
import ImportResultModal from '../views/ImportResultModal';
import AddContactModal from '../contacts/AddContactModal';
import ContactDetail from '../contacts/ContactDetail';
import QuickLogModal from '../contacts/QuickLogModal';
import QuickReminderModal from '../contacts/QuickReminderModal';
import AlertMentions from '../views/AlertMentions';
import RemindersView from '../views/RemindersView';
import SettingsView from '../views/SettingsView';
import Timeline from '../views/Timeline';
import './AppShell.css';

export type NavTarget =
  | { view: 'all-contacts' }
  | { view: 'alerts' }
  | { view: 'reminders' }
  | { view: 'all-timeline' }
  | { view: 'project'; projectId: string }
  | { view: 'timeline'; projectId: string }
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
  const [globalContactId, setGlobalContactId] = useState<string | null>(null);
  const [globalDrawerClosing, setGlobalDrawerClosing] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [showQuickReminder, setShowQuickReminder] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importRefreshTrigger, setImportRefreshTrigger] = useState(0);
  const [updateState, setUpdateState] = useState<'idle' | 'available' | 'downloading' | 'ready'>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updatePercent, setUpdatePercent] = useState<number | null>(null);
  // Keep a ref in sync so event listener callbacks can read the current state
  // without closing over a stale value.
  const updateStateRef = useRef<'idle' | 'available' | 'downloading' | 'ready'>('idle');
  updateStateRef.current = updateState;

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

  useEffect(() => {
    return window.sourcerer.onContactsChanged(() => {
      window.sourcerer.getContactCount().then(setTotalContacts);
      refreshOverdue();
    });
  }, [refreshOverdue]);

  useEffect(() => {
    const offAvailable = window.sourcerer.onUpdateAvailable(({ version }) => {
      setUpdateVersion(version);
      setUpdateState('available');
    });
    const offProgress = window.sourcerer.onUpdateDownloadProgress(({ percent }) => {
      setUpdatePercent(percent);
    });
    const offDownloaded = window.sourcerer.onUpdateDownloaded(({ version }) => {
      setUpdateVersion(version);
      setUpdateState('ready');
    });
    const offError = window.sourcerer.onUpdateError(({ message }) => {
      // update:error is only sent for download-phase failures (check errors are handled
      // by the main process directly). Revert to 'available' if we were downloading or
      // ready (a post-download verification error), then show a main-process dialog.
      if (updateStateRef.current === 'downloading' || updateStateRef.current === 'ready') {
        setUpdateState('available');
        window.sourcerer.showUpdateError(message);
      }
    });
    // Replay any update event that fired before AppShell mounted (e.g. the
    // 10 s auto-check completed while the user was still on the lock screen).
    window.sourcerer.getUpdateState().then((state) => {
      if (state?.event === 'available') {
        setUpdateVersion(state.version);
        setUpdateState('available');
      } else if (state?.event === 'downloading') {
        setUpdateVersion(state.version);
        setUpdatePercent(state.percent ?? null);
        setUpdateState('downloading');
      } else if (state?.event === 'downloaded') {
        setUpdateVersion(state.version);
        setUpdateState('ready');
      }
    }).catch(() => {});
    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  function openGlobalContact(id: string) {
    if (globalContactId === id) { closeGlobalContact(); return; }
    setGlobalContactId(id);
    // Signal any open sub-modals (e.g. LogAllModal in another ContactDetail) to close.
    window.dispatchEvent(new Event('sourcerer:global-nav'));
  }

  function closeGlobalContact() {
    setGlobalDrawerClosing(true);
    setTimeout(() => { setGlobalContactId(null); setGlobalDrawerClosing(false); }, 160);
  }

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

  function handleProjectArchived(id: string) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, is_archived: 1 as const } : p)));
  }

  function handleProjectUnarchived(id: string) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, is_archived: 0 as const } : p)));
  }

  function handleProjectDeleted(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setNav((current) => {
      if ((current.view === 'project' || current.view === 'timeline') && current.projectId === id) {
        return { view: 'all-contacts' };
      }
      return current;
    });
  }

  const activeProject =
    (nav.view === 'project' || nav.view === 'timeline') ? projects.find((p) => p.id === nav.projectId) ?? null : null;

  return (
    <div className="app-shell">
      <div className="app-titlebar">
        <div className="app-titlebar-left" />
        <div className="app-titlebar-right">
          {updateState === 'available' && (
            <button
              className="app-update-btn"
              onClick={async () => {
                setUpdatePercent(null);
                setUpdateState('downloading');
                try {
                  await window.sourcerer.downloadUpdate();
                } catch (err) {
                  setUpdatePercent(null);
                  setUpdateState('available');
                  const message = err instanceof Error ? err.message : String(err);
                  window.sourcerer.showUpdateError(message);
                }
              }}
            >
              Update available ({updateVersion})
            </button>
          )}
          {updateState === 'downloading' && (
            <span className="app-update-downloading" role="status" aria-live="polite" aria-atomic="true">
              Downloading update{updatePercent !== null ? ` ${updatePercent}%` : '\u2026'}
            </span>
          )}
          {updateState === 'ready' && (
            <button
              className="app-update-btn app-update-btn--ready"
              onClick={() => window.sourcerer.quitAndInstall()}
            >
              Restart to update ({updateVersion})
            </button>
          )}
          Sourcerer&nbsp;·&nbsp;Local vault&nbsp;·&nbsp;Encrypted
          <button className="app-titlebar-lock" onClick={() => window.sourcerer.lock()} aria-label="Lock Sourcerer">
            🔒
          </button>
        </div>
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
        onProjectArchived={handleProjectArchived}
        onProjectUnarchived={handleProjectUnarchived}
        onProjectDeleted={handleProjectDeleted}
        onAddContact={() => setShowAddContact(true)}
        onImportCsv={() => setShowImportCsv(true)}
        onQuickLog={() => setShowQuickLog(true)}
        onQuickReminder={() => setShowQuickReminder(true)}
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
        {nav.view === 'all-timeline' && (
          <Timeline user={user} />
        )}
        {nav.view === 'project' && (
          <ProjectView
            project={activeProject}
            user={user}
            onProjectUpdated={(updated) =>
              setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            }
            refreshTrigger={importRefreshTrigger}
            openContactId={openContactId}
            onOpenContactIdConsumed={() => setOpenContactId(null)}
          />
        )}
        {nav.view === 'timeline' && (activeProject ? (
          <Timeline
            projectId={activeProject.id}
            projectName={activeProject.name}
            user={user}
          />
        ) : (
          <Timeline user={user} />
        ))}
        {nav.view === 'settings' && <SettingsView user={user} onUserUpdated={setUser} />}
      </main>

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onNav={setNav}
          onOpenContact={openGlobalContact}
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
            setImportRefreshTrigger((n) => n + 1);
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

      {showQuickLog && (
        <QuickLogModal
          onClose={() => setShowQuickLog(false)}
          onSaved={() => {
            setShowQuickLog(false);
            setImportRefreshTrigger((n) => n + 1);
            refreshOverdue();
          }}
        />
      )}

      {showQuickReminder && (
        <QuickReminderModal
          onClose={() => setShowQuickReminder(false)}
          onSaved={() => {
            setShowQuickReminder(false);
            refreshOverdue();
          }}
        />
      )}
      {globalContactId && (
        <ContactDetail
          contactId={globalContactId}
          onClose={closeGlobalContact}
          onDeleted={closeGlobalContact}
          onUpdated={() => {}}
          user={user}
          closing={globalDrawerClosing}
        />
      )}
      </div>
    </div>
  );
}
