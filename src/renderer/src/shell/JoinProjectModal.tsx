import { useState, useEffect, type FormEvent } from 'react';
import type { Project } from '@shared/types';
import './JoinProjectModal.css';

interface Props {
  onJoined: (project: Project) => void;
  onCancel: () => void;
}

export default function JoinProjectModal({ onJoined, onCancel }: Props) {
  const [payload, setPayload] = useState('');
  const [preview, setPreview] = useState<{ name: string; originalFilename: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function handlePayloadChange(value: string) {
    setPayload(value);
    setPreview(null);
    setPreviewError(null);
    setSelectedPath(null);
    const trimmed = value.trim();
    if (!trimmed) return;
    const result = await window.sourcerer.decodePayload(trimmed);
    if (result.success && result.name) {
      setPreview({ name: result.name, originalFilename: result.originalFilename ?? '' });
    } else if (!result.success) {
      setPreviewError(result.error ?? 'Invalid setup link.');
    }
  }

  async function handleLocate() {
    const path = await window.sourcerer.openFileDialog();
    if (path) setSelectedPath(path);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!payload.trim() || !selectedPath) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await window.sourcerer.joinSharedProject({
        encodedPayload: payload.trim(),
        localPath: selectedPath,
      });
      if (project) {
        onJoined(project);
      } else {
        setError('Could not join the project. The file may have moved or the link is invalid.');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const canLocate = !!preview && !previewError;
  const canJoin = canLocate && !!selectedPath && !submitting;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card join-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Join shared project</h2>

        <form onSubmit={handleSubmit}>
          <div className="modal-field">
            <label htmlFor="join-payload" className="modal-label">
              Setup link <span className="modal-required">*</span>
            </label>
            <textarea
              id="join-payload"
              className="join-payload-input"
              placeholder="Paste the setup link from your colleague…"
              value={payload}
              onChange={(e) => handlePayloadChange(e.target.value)}
              disabled={submitting}
              autoFocus
            />
            {previewError && <p className="join-payload-error">{previewError}</p>}
          </div>

          {preview && (
            <div className="join-preview">
              <div className="join-preview-row">
                <span className="join-preview-label">Project</span>
                <span className="join-preview-value">{preview.name}</span>
              </div>
              {preview.originalFilename && (
                <div className="join-preview-row">
                  <span className="join-preview-label">Filename</span>
                  <span className="join-preview-path">{preview.originalFilename}</span>
                </div>
              )}
            </div>
          )}

          {canLocate && (
            <div className="join-locate-row">
              <p className="join-locate-hint">
                {preview?.originalFilename
                  ? <>Locate the shared file (<code>{preview.originalFilename}</code>) on this machine. </>
                  : <>Locate the shared file on this machine. </>
                }
                It must live permanently in a synced folder (Dropbox, OneDrive, iCloud Drive) —
                sync breaks if it is moved.
              </p>
              <button type="button" className="join-locate-btn" onClick={handleLocate} disabled={submitting}>
                {selectedPath ? 'Change file…' : 'Locate shared file…'}
              </button>
              {selectedPath && (
                <p className="join-selected-path">{selectedPath}</p>
              )}
            </div>
          )}

          {error && <p className="join-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn-create" disabled={!canJoin}>
              {submitting ? 'Joining…' : 'Join project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
