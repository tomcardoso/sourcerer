import { useState, useEffect } from 'react';
import type { ImportResult, Project } from '@shared/types';
import './ImportCsvModal.css';

interface Props {
  projects: Project[];
  preselectedProjectId?: string;
  onComplete: (result: ImportResult) => void;
  onClose: () => void;
}

export default function ImportCsvModal({ projects, preselectedProjectId, onComplete, onClose }: Props) {
  const [projectId, setProjectId] = useState(preselectedProjectId ?? '');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleImport() {
    setImporting(true);
    try {
      const result = await window.sourcerer.importCsv({ projectId: projectId || undefined });
      if (!result.cancelled) onComplete(result);
    } finally {
      setImporting(false);
    }
  }

  const showProjectSelect = projects.length > 0 && !preselectedProjectId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card icm-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Import contacts from CSV</h2>

        <p className="icm-intro">
          Import a spreadsheet of contacts. Your file must use the following column headers
          (extra columns are ignored):
        </p>

        <div className="icm-columns">
          <div className="icm-col-group">
            <div className="icm-col-label">Contact</div>
            <div className="icm-col-tags">
              {['Name', 'Organization', 'Title', 'Notes', 'Email', 'Phone',
                'LinkedIn', 'X', 'Website'].map((h) => (
                <span key={h} className="icm-tag">{h}</span>
              ))}
            </div>
          </div>
          <div className="icm-col-group">
            <div className="icm-col-label">Project membership (optional)</div>
            <div className="icm-col-tags">
              {['Theme', 'Status', 'Priority'].map((h) => (
                <span key={h} className="icm-tag">{h}</span>
              ))}
            </div>
          </div>
        </div>

        <p className="icm-collision-note">
          To include multiple emails, phone numbers, or websites for a contact, separate them
          with a semicolon in the cell (e.g. <code>alice@work.com; alice@home.com</code>).
          Contacts with a matching name or email are skipped. Phone numbers are normalised to
          international format on import.
        </p>

        <button
          className="icm-template-btn"
          onClick={() => window.sourcerer.downloadSampleCsv()}
        >
          ↓ Download blank template
        </button>

        {showProjectSelect && (
          <div className="icm-project-row">
            <label className="icm-label">Add imported contacts to a project</label>
            <select
              className="icm-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">No project — contacts only</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <button className="modal-btn-create" onClick={handleImport} disabled={importing}>
            {importing ? 'Importing…' : 'Choose file & import'}
          </button>
        </div>
      </div>
    </div>
  );
}
