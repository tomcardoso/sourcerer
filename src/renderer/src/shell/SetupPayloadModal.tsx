import { useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import './SetupPayloadModal.css';

interface Props {
  projectName: string;
  payload: string;
  onDone: () => void;
}

export default function SetupPayloadModal({ projectName, payload, onDone }: Props) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCopy() {
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Modal title={`Share “${projectName}”`} onDismiss={onDone} className="setup-payload-modal">
      <p className="form-description">
        Share the link below with your collaborators out-of-band (e.g., via Signal). They'll paste
        it into Sourcerer to join the project.
      </p>
      <p className="setup-payload-location-note">
        The shared file must remain in a synced folder (Dropbox, OneDrive, iCloud Drive)
        permanently — moving it will break sync for all collaborators.
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

      <div className="form-actions">
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
