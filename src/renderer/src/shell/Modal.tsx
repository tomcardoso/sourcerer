import { useEffect, type ReactNode } from 'react';
import './Modal.css';

interface Props {
  title: string;
  onDismiss: () => void;
  className?: string;
  children: ReactNode;
}

export default function Modal({ title, onDismiss, className, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div
        className={`modal-card${className ? ` ${className}` : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
