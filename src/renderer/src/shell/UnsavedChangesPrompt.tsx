import { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { setUnsavedPresenter, type UnsavedRequest, type PendingEdit } from '../hooks/useUnsavedChanges';
import './UnsavedChangesPrompt.css';

/** Shows the save / discard / keep-editing question for `guardUnsaved()`. Mount once. */
export default function UnsavedChangesPrompt() {
  const [request, setRequest] = useState<UnsavedRequest | null>(null);
  const [pending, setPending] = useState<PendingEdit[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setUnsavedPresenter((req) => {
    setRequest(req);
    setPending(req.pending);
    setSaving(false);
    setFailed(false);
  }), []);

  if (!request) return null;
  const req = request;

  function finish(proceed: boolean) {
    setRequest(null);
    req.resolve(proceed);
  }

  async function handleSave() {
    setSaving(true);
    setFailed(false);
    const stillPending: PendingEdit[] = [];
    for (const p of pending) {
      let ok: boolean;
      try { ok = await p.save(); } catch { ok = false; }
      if (!ok) stillPending.push(p);
    }
    setSaving(false);
    if (stillPending.length === 0) { finish(true); return; }
    setPending(stillPending);
    setFailed(true);
  }

  return (
    <Modal title="Unsaved changes" onDismiss={() => finish(false)} className="unsaved-modal">
      <p className="modal-description unsaved-description">
        {failed
          ? 'These couldn’t be saved. Check that they’re complete (a log entry needs a date, a reminder needs a date and a note), or discard them.'
          : 'You haven’t saved these yet. Save them before you go on?'}
      </p>
      <ul className="unsaved-list">
        {pending.map((p, i) => <li key={i} className="unsaved-item">{p.label}</li>)}
      </ul>
      <div className="form-actions unsaved-actions">
        <Button variant="secondary" onClick={() => finish(false)} disabled={saving}>
          Keep editing
        </Button>
        <Button variant="danger-outline" onClick={() => finish(true)} disabled={saving}>
          Discard
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}
