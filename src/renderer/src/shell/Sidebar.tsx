import { useState, useRef, type KeyboardEvent } from 'react';
import type { Project, User } from '@shared/types';
import type { NavTarget } from './AppShell';
import NewProjectModal from './NewProjectModal';
import JoinProjectModal from './JoinProjectModal';
import './Sidebar.css';

interface Props {
  user: User | null;
  projects: Project[];
  nav: NavTarget;
  onNav: (nav: NavTarget) => void;
  unseenMentions: number;
  onProjectCreated: (project: Project) => void;
  onProjectCreatedShared: (project: Project, payload: string) => void;
  onProjectJoined: (project: Project) => void;
  onProjectRenamed: (id: string, name: string) => void;
  onProjectDeleted: (id: string) => void;
}

export default function Sidebar({
  user,
  projects,
  nav,
  onNav,
  unseenMentions,
  onProjectCreated,
  onProjectCreatedShared,
  onProjectJoined,
  onProjectRenamed,
  onProjectDeleted,
}: Props) {
  const [showNewProject, setShowNewProject] = useState(false);
  const [showJoinProject, setShowJoinProject] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  function startRename(project: Project) {
    setRenamingId(project.id);
    setRenameValue(project.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  async function commitRename(id: string) {
    const name = renameValue.trim();
    if (name && name !== projects.find((p) => p.id === id)?.name) {
      await window.sourcerer.renameProject(id, name);
      onProjectRenamed(id, name);
    }
    setRenamingId(null);
  }

  function handleRenameKey(e: KeyboardEvent<HTMLInputElement>, id: string) {
    if (e.key === 'Enter') commitRename(id);
    if (e.key === 'Escape') setRenamingId(null);
  }

  async function confirmDelete(id: string) {
    await window.sourcerer.deleteProject(id);
    onProjectDeleted(id);
    setDeletingId(null);
  }

  const isActive = (target: NavTarget): boolean => {
    if (target.view !== nav.view) return false;
    if (target.view === 'project' && nav.view === 'project') {
      return target.projectId === nav.projectId;
    }
    return true;
  };

  return (
    <>
      <aside className="sidebar">
        {/* App header */}
        <div className="sidebar-header">
          <span className="sidebar-logo">Sourcerer</span>
          {user && (
            <span className="sidebar-user">
              {user.first_name} {user.last_name}
            </span>
          )}
        </div>

        {/* Top-level nav */}
        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${isActive({ view: 'all-contacts' }) ? 'active' : ''}`}
            onClick={() => onNav({ view: 'all-contacts' })}
          >
            <span className="sidebar-nav-icon">◎</span>
            All Contacts
          </button>
          <button
            className={`sidebar-nav-item ${isActive({ view: 'alerts' }) ? 'active' : ''}`}
            onClick={() => onNav({ view: 'alerts' })}
          >
            <span className="sidebar-nav-icon">◉</span>
            Alert Mentions
            {unseenMentions > 0 && (
              <span className="sidebar-unseen-badge">
                {unseenMentions > 99 ? '99+' : unseenMentions}
              </span>
            )}
          </button>
        </nav>

        {/* Projects section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">Projects</div>

          {projects.length === 0 && (
            <p className="sidebar-empty">No projects yet.</p>
          )}

          <ul className="sidebar-project-list">
            {projects.map((project) => (
              <li key={project.id} className="sidebar-project-item">
                {renamingId === project.id ? (
                  <input
                    ref={renameInputRef}
                    className="sidebar-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(project.id)}
                    onKeyDown={(e) => handleRenameKey(e, project.id)}
                    autoFocus
                  />
                ) : deletingId === project.id ? (
                  <div className="sidebar-delete-confirm">
                    <span className="sidebar-delete-label">Delete "{project.name}"?</span>
                    <div className="sidebar-delete-actions">
                      <button
                        className="sidebar-delete-yes"
                        onClick={() => confirmDelete(project.id)}
                      >
                        Delete
                      </button>
                      <button
                        className="sidebar-delete-no"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className={`sidebar-project-btn ${isActive({ view: 'project', projectId: project.id }) ? 'active' : ''}`}
                    onClick={() => onNav({ view: 'project', projectId: project.id })}
                    onDoubleClick={() => startRename(project)}
                    title="Double-click to rename"
                  >
                    <span className="sidebar-project-name">
                      {project.is_shared === 1 && (
                        <span className="sidebar-project-shared-dot" title="Shared project" />
                      )}
                      {project.name}
                    </span>
                    <span
                      className="sidebar-project-delete"
                      role="button"
                      title="Delete project"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(project.id);
                      }}
                    >
                      ×
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="sidebar-project-actions">
            <button className="sidebar-new-project" onClick={() => setShowNewProject(true)}>
              + New project
            </button>
            <button className="sidebar-join-project" onClick={() => setShowJoinProject(true)}>
              Join project
            </button>
          </div>
        </div>

        {/* Settings at bottom */}
        <div className="sidebar-footer">
          <button
            className={`sidebar-nav-item ${isActive({ view: 'settings' }) ? 'active' : ''}`}
            onClick={() => onNav({ view: 'settings' })}
          >
            <span className="sidebar-nav-icon">⚙</span>
            Settings
          </button>
        </div>
      </aside>

      {showNewProject && (
        <NewProjectModal
          onCreated={(project) => {
            onProjectCreated(project);
            setShowNewProject(false);
          }}
          onCreatedShared={(project, payload) => {
            onProjectCreatedShared(project, payload);
            setShowNewProject(false);
          }}
          onCancel={() => setShowNewProject(false)}
        />
      )}

      {showJoinProject && (
        <JoinProjectModal
          onJoined={(project) => {
            onProjectJoined(project);
            setShowJoinProject(false);
          }}
          onCancel={() => setShowJoinProject(false)}
        />
      )}
    </>
  );
}
