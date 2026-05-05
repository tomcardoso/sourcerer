import { useEffect, useState } from 'react';
import type { Project, User } from '@shared/types';
import Sidebar from './Sidebar';
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

  useEffect(() => {
    window.sourcerer.getUser().then(setUser);
    window.sourcerer.listProjects().then(setProjects);
  }, []);

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [...prev, project]);
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
        onProjectCreated={handleProjectCreated}
        onProjectRenamed={handleProjectRenamed}
        onProjectDeleted={handleProjectDeleted}
      />
      <main className="app-content">
        {nav.view === 'all-contacts' && <AllContacts />}
        {nav.view === 'alerts' && <AlertMentions />}
        {nav.view === 'project' && <ProjectView project={activeProject} userEmail={user?.email ?? null} />}
        {nav.view === 'settings' && <SettingsView user={user} onUserUpdated={setUser} />}
      </main>
    </div>
  );
}
