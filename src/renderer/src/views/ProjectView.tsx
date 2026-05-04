import type { Project } from '@shared/types';
import './View.css';

interface Props {
  project: Project | null;
}

export default function ProjectView({ project }: Props) {
  if (!project) {
    return (
      <div className="view">
        <div className="view-empty">
          <div className="view-empty-label">Project not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">{project.name}</h1>
          {project.description && (
            <p className="view-subtitle">{project.description}</p>
          )}
        </div>
      </div>
      <div className="view-empty">
        <div className="view-empty-icon">◎</div>
        <div className="view-empty-label">No contacts in this project yet</div>
        <div className="view-empty-hint">
          Add a contact to start tracking outreach for this investigation.
        </div>
      </div>
    </div>
  );
}
