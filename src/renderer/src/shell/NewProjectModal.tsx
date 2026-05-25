import { useState, type FormEvent } from 'react';
import type { Project } from '@shared/types';
import Modal from './Modal';
import Button from './Button';

interface Props {
  onCreated: (project: Project) => void;
  onCreatedShared: (project: Project, payload: string) => void;
  onCancel: () => void;
}

export default function NewProjectModal({ onCreated, onCreatedShared, onCancel }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    if (isShared) {
      const result = await window.sourcerer.createSharedProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (result) {
        onCreatedShared(result.project, result.payload);
      } else {
        // User cancelled save dialog
        setSubmitting(false);
      }
    } else {
      const project = await window.sourcerer.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onCreated(project);
    }
  }

  return (
    <Modal title="New Project" onDismiss={onCancel}>
      <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="proj-name" className="form-label">
              Project name <span className="form-required">*</span>
            </label>
            <input
              id="proj-name"
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maple Leaf Foods investigation"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label htmlFor="proj-desc" className="form-label">
              Description <span className="form-optional">(optional)</span>
            </label>
            <input
              id="proj-desc"
              className="form-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short slug line"
              disabled={submitting}
            />
          </div>

          <div className="form-field form-field-toggle">
            <label className="form-toggle-label">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                disabled={submitting}
              />
              <span>Shared project</span>
            </label>
            {isShared && (
              <p className="form-toggle-hint">
                You'll choose where to save the shared file. A setup link will be generated for
                collaborators.
              </p>
            )}
          </div>

          <div className="form-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim() || submitting}
            >
              {submitting ? 'Creating…' : 'Create project'}
            </Button>
          </div>
      </form>
    </Modal>
  );
}
