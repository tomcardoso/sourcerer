import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import './DiagnosticsModal.css';

interface Props {
  onClose: () => void;
}

// Shows the whole diagnostics report before anything leaves the app. Save writes
// exactly the text shown here (the main process keeps it), and Copy puts the same
// text on the clipboard for pasting into an issue. Works locked or unlocked.
export default function DiagnosticsModal({ onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    window.sourcerer
      .buildDiagnosticsReport()
      .then((r) => { if (live) setText(r.text); })
      .catch(() => { if (live) setError('The report could not be built.'); });
    return () => {
      live = false;
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  function flash(message: string) {
    setStatus(message);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 2500);
  }

  function handleCopy() {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => flash('Copied.'),
      () => flash('Could not copy. Use Save instead.'),
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await window.sourcerer.saveDiagnosticsReport();
      if (result.error) setError(result.error);
      else if (result.saved) onClose();
    } catch {
      setError('The report could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Diagnostics report" onDismiss={onClose} className="diagnostics-modal">
      <p className="modal-description diagnostics-description">
        Facts about this copy of Sourcerer and its recent events, to attach to a report of a
        problem. It never holds your password, anything stored in your vault, file or folder
        names, or the text of error messages. This is the whole report: read it before you share it.
      </p>

      {error && <p className="diagnostics-error">{error}</p>}
      {!text && !error && <p className="diagnostics-loading">Building the report…</p>}
      {text && <pre className="diagnostics-text" tabIndex={0}>{text}</pre>}

      <div className="form-actions diagnostics-actions">
        {status && <span className="diagnostics-status" role="status">{status}</span>}
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={handleCopy} disabled={!text}>
          Copy
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!text || saving}>
          {saving ? 'Saving…' : 'Save…'}
        </Button>
      </div>
    </Modal>
  );
}
