import { useEffect, useRef, useState } from 'react';
import './SetupPayloadModal.css';

interface Props {
  projectName: string;
  payload: string;
  onDone: () => void;
}

export default function SetupPayloadModal({ projectName, payload, onDone }: Props) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  function handleCopy() {
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="modal-overlay" onClick={onDone}>
      <div className="modal-card setup-payload-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Share “{projectName}”</h2>
        <p className="setup-payload-intro">
          Share the link below with your collaborators out-of-band (e.g., via Signal). They'll paste
          it into Sourcerer to join the project.
        </p>

        <div className="setup-payload-link-row">
          <textarea
            className="setup-payload-text"
            readOnly
            value={payload}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <button className="setup-payload-copy" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <p className="setup-payload-warning">
          This link contains the decryption key for the shared file. Only share it over a secure
          channel.
        </p>

        <div className="modal-actions">
          <button className="modal-btn-create" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
