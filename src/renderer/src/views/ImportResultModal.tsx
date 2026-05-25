import type { ImportResult } from '@shared/types';
import Modal from '../shell/Modal';
import Button from '../shell/Button';
import './ImportResultModal.css';

interface Props {
  result: ImportResult;
  onClose: () => void;
}

export default function ImportResultModal({ result, onClose }: Props) {
  const nameCollisions = result.skipped.filter((s) => s.reason === 'name');
  const emailCollisions = result.skipped.filter((s) => s.reason === 'email');

  return (
    <Modal title="Import complete" onDismiss={onClose} className="import-result-modal">
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

      <div className="form-actions">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
