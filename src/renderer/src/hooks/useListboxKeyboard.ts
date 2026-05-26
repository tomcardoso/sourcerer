import { useCallback, useEffect, useRef, useState } from 'react';

interface UseListboxKeyboardOptions {
  isOpen: boolean;
  optionCount: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  onOpen?: () => void;
}

interface UseListboxKeyboardResult {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  resetActiveIndex: () => void;
  handleInputKeyDown: (e: React.KeyboardEvent) => void;
  listboxId: string;
  getOptionId: (index: number) => string;
}

let idCounter = 0;

export function useListboxKeyboard({
  isOpen,
  optionCount,
  onSelect,
  onClose,
  onOpen,
}: UseListboxKeyboardOptions): UseListboxKeyboardResult {
  const [activeIndex, setActiveIndex] = useState(-1);
  const idRef = useRef(`listbox-${++idCounter}`);

  const resetActiveIndex = useCallback(() => setActiveIndex(-1), []);

  useEffect(() => {
    if (!isOpen) setActiveIndex(-1);
  }, [isOpen]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) {
          onOpen?.();
          setActiveIndex(0);
        } else {
          setActiveIndex((i) => (i + 1) % optionCount);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) {
          onOpen?.();
          setActiveIndex(optionCount - 1);
        } else {
          setActiveIndex((i) => (i <= 0 ? optionCount - 1 : i - 1));
        }
      } else if (e.key === 'Enter') {
        if (isOpen && activeIndex >= 0) {
          e.preventDefault();
          onSelect(activeIndex);
        }
      } else if (e.key === 'Escape') {
        if (isOpen) {
          e.preventDefault();
          onClose();
        }
      }
    },
    [isOpen, optionCount, activeIndex, onSelect, onClose, onOpen],
  );

  const getOptionId = useCallback(
    (index: number) => `${idRef.current}-option-${index}`,
    [],
  );

  return {
    activeIndex,
    setActiveIndex,
    resetActiveIndex,
    handleInputKeyDown,
    listboxId: idRef.current,
    getOptionId,
  };
}
