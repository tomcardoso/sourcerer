import { useEffect } from 'react';
import type { ImportResult } from '@shared/types';
import './ImportResultModal.css';

interface Props {
  result: ImportResult;
  onClose: () => void;
}

export default function ImportResultModal({ result, onClose }: Props) {
  const nameCollisions = result.skipped.filter((s) => s.reason === 'name');
  const emailCollisions = result.skipped.filter((s) => s.reason === 'email');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card import-result-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Import complete</h2>

        <div className="ir-summary">
          <span className="ir-count">{result.imported}</span>
          <span className="ir-label">
            {result.imported === 1 ? 'contact imported' : 'contacts imported'}
          </span>
        </div>

        {result.skipped.length > 0 && (
          <div className="ir-skipped-section">
            <div className="ir-collision-label">Result</div>
            <p className="ir-skipped-intro">
              {result.skipped.length} {result.skipped.length === 1 ? 'row was' : 'rows were'} skipped
              due to existing contacts with the same name or email:
            </p>

            {nameCollisions.length > 0 && (
              <div className="ir-collision-group">
                <div className="ir-collision-label">Name collision{nameCollisions.length > 1 ? 's' : ''}</div>
                <ul className="ir-collision-list">
                  {nameCollisions.map((s) => (
                    <li key={s.name}>{s.name}</li>
                  ))}
                </ul>
              </div>
            )}

            {emailCollisions.length > 0 && (
              <div className="ir-collision-group">
                <div className="ir-collision-label">Email collision</div>
                <ul className="ir-collision-list">
                  {emailCollisions.map((s) => (
                    <li key={s.name}>{s.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-create" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
