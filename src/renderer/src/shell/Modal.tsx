import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './Modal.css';

const CLOSE_MS = 120;

interface Props {
  title: string;
  onDismiss: () => void;
  className?: string;
  children: ReactNode;
}

export default function Modal({ title, onDismiss, className, children }: Props) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  const dismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = setTimeout(() => onDismissRef.current(), CLOSE_MS);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  return (
    <div
      className={`modal-overlay${closing ? ' modal-overlay--closing' : ''}`}
      onClick={dismiss}
    >
      <div
        className={`modal-card${closing ? ' modal-card--closing' : ''}${className ? ` ${className}` : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
