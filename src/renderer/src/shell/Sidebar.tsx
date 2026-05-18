import { useState, useRef, type KeyboardEvent } from 'react';
import type { Project, User } from '@shared/types';
import type { NavTarget } from './AppShell';
import NewProjectModal from './NewProjectModal';
import JoinProjectModal from './JoinProjectModal';
import { WordmarkLogo } from '../components/WordmarkLogo';
import Button from './Button';
import './Sidebar.css';

const DOT_COLORS = ['#1a1815', '#e8a840', '#7a6f60', '#c87a1a', '#5b5750', '#b8a898'];

interface Props {
  user: User | null;
  projects: Project[];
  nav: NavTarget;
  onNav: (nav: NavTarget) => void;
  unseenMentions: number;
  overdueReminders: number;
  totalContacts: number;
  onSearchOpen: () => void;
  onProjectCreated: (project: Project) => void;
  onProjectCreatedShared: (project: Project, payload: string) => void;
  onProjectJoined: (project: Project) => void;
  onProjectRenamed: (id: string, name: string) => void;
  onProjectArchived: (id: string) => void;
  onProjectUnarchived: (id: string) => void;
  onProjectDeleted: (id: string) => void;
  onAddContact: () => void;
  onImportCsv: () => void;
}

export default function Sidebar({
  user,
  projects,
  nav,
  onNav,
  unseenMentions,
  overdueReminders,
  totalContacts,
  onSearchOpen,
  onProjectCreated,
  onProjectCreatedShared,
  onProjectJoined,
  onProjectRenamed,
  onProjectArchived,
  onProjectUnarchived,
  onProjectDeleted,
  onAddContact,
  onImportCsv,
}: Props) {
  const [showNewProject, setShowNewProject] = useState(false);
  const [showJoinProject, setShowJoinProject] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
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

  async function handleArchive(id: string) {
    await window.sourcerer.archiveProject(id);
    onProjectArchived(id);
  }

  async function handleUnarchive(id: string) {
    await window.sourcerer.unarchiveProject(id);
    onProjectUnarchived(id);
  }

  async function confirmDelete(id: string) {
    await window.sourcerer.deleteProject(id);
    onProjectDeleted(id);
    setDeletingId(null);
  }

  const isActive = (target: NavTarget): boolean => {
    if (target.view === 'project') {
      return (nav.view === 'project' || nav.view === 'timeline') && 'projectId' in nav && nav.projectId === target.projectId;
    }
    if (target.view === 'all-contacts') {
      return nav.view === 'all-contacts' || nav.view === 'all-timeline';
    }
    if (target.view !== nav.view) return false;
    return true;
  };

  const initials = user
    ? `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase()
    : '';

  return (
    <>
      <aside className="sidebar">

        {/* Wordmark header */}
        <div className="sidebar-header">
          <WordmarkLogo size={36} className="sidebar-logo" />
        </div>

        {/* Workspace nav */}
        <nav className="sidebar-nav">

          <div className="sidebar-action-btns">
            <Button variant="accent" size="sm" full onClick={onAddContact}>+ Add contact</Button>
            <Button variant="secondary" size="sm" full onClick={onImportCsv}>Import contacts</Button>
          </div>

          <div className="sidebar-section-label">Workspace</div>

          <button
            className={`sidebar-nav-item ${isActive({ view: 'all-contacts' }) ? 'active' : ''}`}
            onClick={() => onNav({ view: 'all-contacts' })}
          >
            <span className="sidebar-nav-indicator" />
            All contacts
            {totalContacts > 0 && (
              <span className="sidebar-contact-count">{totalContacts}</span>
            )}
          </button>
          {(nav.view === 'all-contacts' || nav.view === 'all-timeline') && (
            <button
              className={`sidebar-project-sub-btn${nav.view === 'all-timeline' ? ' active' : ''}`}
              onClick={() => onNav({ view: 'all-timeline' })}
            >
              Timeline
            </button>
          )}

          <button
            className={`sidebar-nav-item ${isActive({ view: 'reminders' }) ? 'active' : ''}`}
            onClick={() => onNav({ view: 'reminders' })}
          >
            <span className="sidebar-nav-indicator">
              {overdueReminders > 0 && <span className="sidebar-nav-dot" />}
            </span>
            Reminders
            {overdueReminders > 0 && (
              <span className="sidebar-overdue-label">
                {overdueReminders}&nbsp;Overdue
              </span>
            )}
          </button>

          <button
            className={`sidebar-nav-item ${isActive({ view: 'alerts' }) ? 'active' : ''}`}
            onClick={() => onNav({ view: 'alerts' })}
          >
            <span className="sidebar-nav-indicator">
              {unseenMentions > 0 && <span className="sidebar-nav-dot" />}
            </span>
            Mentions
            {unseenMentions > 0 && (
              <span className="sidebar-overdue-label">{unseenMentions > 99 ? '99+ hits' : `${unseenMentions} hits`}</span>
            )}
          </button>

          <button className="sidebar-nav-item sidebar-search-btn" onClick={onSearchOpen}>
            <span className="sidebar-nav-indicator" />
            Search
            <span className="sidebar-search-hint">
              {navigator.platform.startsWith('Mac') ? <><span>⌘</span>K</> : 'Ctrl+K'}
            </span>
          </button>

        </nav>

        {/* Projects */}
        <div className="sidebar-section">
          <div className="sidebar-section-header-row">
            <span className="sidebar-section-label">Projects</span>
            <button className="sidebar-header-add" onClick={() => setShowNewProject(true)} aria-label="New project">+</button>
          </div>

          {projects.length === 0 && (
            <p className="sidebar-empty">No projects yet.</p>
          )}

          <ul className="sidebar-project-list">
            {projects
              .filter((p) => showArchived || p.is_archived === 0)
              .map((project, idx) => (
              <li key={project.id} className={`sidebar-project-item${project.is_archived === 1 ? ' sidebar-project-item--archived' : ''}`}>
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
                      <button className="sidebar-delete-yes" onClick={() => confirmDelete(project.id)}>Delete</button>
                      <button className="sidebar-delete-no" onClick={() => setDeletingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                  <div className="sidebar-project-row">
                    <button
                      className={`sidebar-project-btn ${isActive({ view: 'project', projectId: project.id }) ? 'active' : ''}`}
                      onClick={() => onNav({ view: 'project', projectId: project.id })}
                      onDoubleClick={() => project.is_archived === 0 && startRename(project)}
                      title={project.is_archived === 0 ? 'Double-click to rename' : undefined}
                    >
                      <span
                        className="sidebar-project-dot"
                        style={{ background: DOT_COLORS[idx % DOT_COLORS.length] }}
                        aria-hidden="true"
                      />
                      <span className="sidebar-project-name">{project.name}</span>
                      {project.is_shared === 1 && (
                        <span className="sidebar-project-shared-dot" aria-label="Shared" role="img" />
                      )}
                    </button>
                    {project.is_archived === 1 ? (
                      <button
                        type="button"
                        className="sidebar-project-delete"
                        aria-label="Unarchive project"
                        title="Unarchive project"
                        onClick={() => handleUnarchive(project.id)}
                      >↩</button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="sidebar-project-archive"
                          aria-label="Archive project"
                          title="Archive project"
                          onClick={() => handleArchive(project.id)}
                        >⊘</button>
                        <button
                          type="button"
                          className="sidebar-project-delete"
                          aria-label="Delete project"
                          title="Delete project"
                          onClick={() => setDeletingId(project.id)}
                        >×</button>
                      </>
                    )}
                  </div>
                  {isActive({ view: 'project', projectId: project.id }) && (
                    <button
                      className={`sidebar-project-sub-btn${'projectId' in nav && nav.view === 'timeline' && nav.projectId === project.id ? ' active' : ''}`}
                      onClick={() => onNav({ view: 'timeline', projectId: project.id })}
                    >
                      Timeline
                    </button>
                  )}
                  </>
                )}
              </li>
            ))}
          </ul>

          {projects.some((p) => p.is_archived === 1) && (
            <button className="sidebar-show-archived-btn" onClick={() => setShowArchived((v) => !v)}>
              {showArchived
                ? 'Hide archived'
                : `Show archived (${projects.filter((p) => p.is_archived === 1).length})`}
            </button>
          )}

          <button className="sidebar-join-project" onClick={() => setShowJoinProject(true)}>
            + Join shared project
          </button>
        </div>

        {/* Settings / user footer */}
        {user && (
          <div className="sidebar-footer">
            <button
              className={`sidebar-user-card ${isActive({ view: 'settings' }) ? 'active' : ''}`}
              onClick={() => onNav({ view: 'settings' })}
              title="Settings"
            >
              <div className="sidebar-avatar">{initials}</div>
              <span className="sidebar-user-name">{user.first_name} {user.last_name}</span>
            </button>
          </div>
        )}
      </aside>

      {showNewProject && (
        <NewProjectModal
          onCreated={(project) => { onProjectCreated(project); setShowNewProject(false); }}
          onCreatedShared={(project, payload) => { onProjectCreatedShared(project, payload); setShowNewProject(false); }}
          onCancel={() => setShowNewProject(false)}
        />
      )}

      {showJoinProject && (
        <JoinProjectModal
          onJoined={(project) => { onProjectJoined(project); setShowJoinProject(false); }}
          onCancel={() => setShowJoinProject(false)}
        />
      )}
    </>
  );
}
