import { useRef } from 'react';
import Button from '../shell/Button';

interface DynamicListProps {
  label?: string;
  values: string[];
  placeholder: string;
  onChange: (vals: string[]) => void;
  onChangeItem?: (oldVal: string, newVal: string) => void;
  onBlurItem?: (value: string) => void;
  warnings?: Record<string, string>;
  enableDragReorder?: boolean;
}

export function useDragReorder<T>(items: T[], onReorder: (next: T[]) => void) {
  const dragFromRef = useRef<number | null>(null);
  const dragAllowed = useRef(false);
  const getDragProps = (i: number) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      if (!dragAllowed.current) { e.preventDefault(); return; }
      dragFromRef.current = i;
    },
    onDragEnd: () => { dragAllowed.current = false; dragFromRef.current = null; },
    onDragOver: (e: React.DragEvent<HTMLElement>) => e.preventDefault(),
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      const from = dragFromRef.current;
      if (from === null || from === i) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      dragFromRef.current = null;
      onReorder(next);
    },
  });
  const handleProps = { onMouseDown: () => { dragAllowed.current = true; } };
  return { getDragProps, handleProps };
}

export default function DynamicList({
  label,
  values,
  placeholder,
  onChange,
  onChangeItem,
  onBlurItem,
  warnings,
  enableDragReorder = false,
}: DynamicListProps) {
  // Stable keys prevent React from reusing DOM nodes when items are removed or reordered,
  // which would reset cursor position and break IME composition.
  const keysRef = useRef<string[]>([]);
  while (keysRef.current.length < values.length) keysRef.current.push(crypto.randomUUID());

  function handleRemove(i: number) {
    keysRef.current.splice(i, 1);
    onChange(values.filter((_, j) => j !== i));
  }

  function handleAdd() {
    keysRef.current.push(crypto.randomUUID());
    onChange([...values, '']);
  }

  function handleReorder(next: string[]) {
    // Reorder keys to match the new value order.
    const newKeys = next.map((v) => {
      const origIdx = values.indexOf(v);
      return origIdx !== -1 ? keysRef.current[origIdx] : crypto.randomUUID();
    });
    keysRef.current = newKeys;
    onChange(next);
  }

  const { getDragProps, handleProps } = useDragReorder(values, handleReorder);
  const showRemove = enableDragReorder || values.length > 1;

  const rows = values.map((v, i) => (
    <div key={keysRef.current[i]} {...(enableDragReorder ? getDragProps(i) : {})}>
      <div className="ac-dynamic-row">
        {enableDragReorder && <span className="ac-drag-handle" {...handleProps}>⠿</span>}
        <input
          className="form-input"
          value={v}
          placeholder={placeholder}
          onChange={(e) => {
            onChangeItem?.(v.trim(), e.target.value.trim());
            const next = [...values];
            next[i] = e.target.value;
            onChange(next);
          }}
          onBlur={() => onBlurItem?.(v.trim())}
        />
        {showRemove && (
          <button
            className="ac-remove"
            type="button"
            onClick={() => handleRemove(i)}
          />
        )}
      </div>
      {v.trim() && warnings?.[v.trim()] && (
        <div className="ac-collision-warn">{warnings[v.trim()]}</div>
      )}
    </div>
  ));

  const addButton = (
    <Button variant="ghost" type="button" onClick={handleAdd}>
      + Add{label ? ` ${label.toLowerCase()}` : ''}
    </Button>
  );

  if (label) {
    return (
      <div className="form-field">
        <label className="form-label">{label}</label>
        {rows}
        {addButton}
      </div>
    );
  }

  return (
    <div>
      {rows}
      {addButton}
    </div>
  );
}
