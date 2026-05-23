import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

const CLOSE_MS = 120;

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

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
  const cardRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  // Save caller's focus, auto-focus first modal element, restore on unmount
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement;
    const first = cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
    first?.focus();
    return () => { prevFocusRef.current?.focus(); };
  }, []);

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

  function handleTabTrap(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !cardRef.current) return;
    const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  return createPortal(
    <div
      className={`modal-overlay${closing ? ' modal-overlay--closing' : ''}`}
      onClick={dismiss}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`modal-card${closing ? ' modal-card--closing' : ''}${className ? ` ${className}` : ''}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleTabTrap}
      >
        <h2 id={titleId} className="modal-title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
