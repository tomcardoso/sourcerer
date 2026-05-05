import { useEffect, useState } from 'react';
import type { Project, User } from '@shared/types';
import Sidebar from './Sidebar';
import SetupPayloadModal from './SetupPayloadModal';
import AllContacts from '../views/AllContacts';
import ProjectView from '../views/ProjectView';
import AlertMentions from '../views/AlertMentions';
import SettingsView from '../views/SettingsView';
import './AppShell.css';

export type NavTarget =
  | { view: 'all-contacts' }
  | { view: 'alerts' }
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

  useEffect(() => {
    window.sourcerer.getUser().then(setUser);
    window.sourcerer.listProjects().then(setProjects);
    window.sourcerer.getUnseenMentionCount().then(setUnseenMentions);
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
      <Sidebar
        user={user}
        projects={projects}
        nav={nav}
        onNav={setNav}
        unseenMentions={unseenMentions}
        onProjectCreated={handleProjectCreated}
        onProjectCreatedShared={handleProjectCreatedShared}
        onProjectJoined={handleProjectJoined}
        onProjectRenamed={handleProjectRenamed}
        onProjectDeleted={handleProjectDeleted}
      />
      <main className="app-content">
        {nav.view === 'all-contacts' && <AllContacts />}
        {nav.view === 'alerts' && (
          <AlertMentions onUnseenCountChange={setUnseenMentions} />
        )}
        {nav.view === 'project' && (
          <ProjectView
            project={activeProject}
            userEmail={user?.email ?? null}
            onProjectUpdated={(updated) =>
              setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            }
          />
        )}
        {nav.view === 'settings' && <SettingsView user={user} onUserUpdated={setUser} />}
      </main>

      {pendingPayload && (
        <SetupPayloadModal
          projectName={pendingPayload.project.name}
          payload={pendingPayload.payload}
          onDone={() => setPendingPayload(null)}
        />
      )}
    </div>
  );
}
