import { useState } from 'react';
import type { ImportResult, Project } from '@shared/types';
import Modal from '../shell/Modal';
import Button from '../shell/Button';
import './ImportCsvModal.css';

interface Props {
  projects: Project[];
  preselectedProjectId?: string;
  onComplete: (result: ImportResult) => void;
  onClose: () => void;
}

type Format = 'csv' | 'vcf';

export default function ImportCsvModal({ projects, preselectedProjectId, onComplete, onClose }: Props) {
  const [format, setFormat] = useState<Format>('csv');
  const [projectId, setProjectId] = useState(preselectedProjectId ?? '');
  const [importing, setImporting] = useState(false);

  async function handleImport() {
    setImporting(true);
    try {
      const data = { projectId: projectId || undefined };
      const result = format === 'vcf'
        ? await window.sourcerer.importVcf(data)
        : await window.sourcerer.importCsv(data);
      if (!result.cancelled) onComplete(result);
    } finally {
      setImporting(false);
    }
  }

  const showProjectSelect = projects.length > 0 && !preselectedProjectId;

  return (
    <Modal title="Import contacts" onDismiss={onClose} className="icm-card">
      <div className="icm-format-tabs">
          <button
            type="button"
            className={`icm-format-tab${format === 'csv' ? ' icm-format-tab--active' : ''}`}
            onClick={() => setFormat('csv')}
            disabled={importing}
          >
            CSV
          </button>
          <button
            type="button"
            className={`icm-format-tab${format === 'vcf' ? ' icm-format-tab--active' : ''}`}
            onClick={() => setFormat('vcf')}
            disabled={importing}
          >
            vCard (.vcf)
          </button>
        </div>

        {format === 'csv' ? (
          <>
            <p className="modal-description">
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

            <Button
              variant="secondary"
              onClick={() => window.sourcerer.downloadSampleCsv()}
            >
              ↓ Download blank template
            </Button>
          </>
        ) : (
          <>
            <p className="modal-description">
              Import contacts from a .vcf file exported by Apple Contacts, Google Contacts, or any
              standard address book. The following fields are imported:
            </p>

            <div className="icm-columns">
              <div className="icm-col-group">
                <div className="icm-col-tags">
                  {['Name (FN)', 'Organization (ORG)', 'Notes (NOTE)',
                    'Email (EMAIL)', 'Phone (TEL)', 'Website (URL)'].map((h) => (
                    <span key={h} className="icm-tag">{h}</span>
                  ))}
                </div>
              </div>
            </div>

            <p className="icm-collision-note">
              Multi-contact .vcf files are fully supported. Contacts with a matching name or email
              are skipped. Phone numbers are normalised to international format on import.
            </p>
          </>
        )}

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
        <Button variant="secondary" onClick={onClose} disabled={importing}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleImport} disabled={importing}>
          {importing ? 'Importing…' : 'Choose file & import'}
        </Button>
      </div>
    </Modal>
  );
}
