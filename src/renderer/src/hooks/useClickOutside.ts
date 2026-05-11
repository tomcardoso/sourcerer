import { type RefObject, useEffect } from 'react';

/**
 * Attach document-level mousedown (and optional Escape-key) listeners to
 * close a floating element when the user clicks outside it.
 *
 * @param ref       Ref attached to the floating element's root node.
 * @param onClose   Called when the user clicks outside or presses Escape.
 * @param isOpen    When provided, listeners are only attached while truthy.
 * @param escapeKey Whether to also close on Escape (default: true).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { isOpen = true, escapeKey = true }: { isOpen?: boolean; escapeKey?: boolean } = {},
): void {
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleMouseDown);
    if (escapeKey) document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      if (escapeKey) document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, onClose, isOpen, escapeKey]);
}
