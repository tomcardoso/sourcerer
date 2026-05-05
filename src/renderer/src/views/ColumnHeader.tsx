import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ColumnHeader.css';

export type SortDir = 'asc' | 'desc';

interface Props {
  label: string;
  sortDir?: SortDir | null;
  onSort?: () => void;
  filterable?: boolean;
  filterActive?: boolean;
  filterOpen?: boolean;
  onFilterToggle?: () => void;
  filterContent?: ReactNode;
}

export default function ColumnHeader({
  label,
  sortDir,
  onSort,
  filterable,
  filterActive,
  filterOpen,
  onFilterToggle,
  filterContent,
}: Props) {
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  function handleFilterClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!filterOpen && filterBtnRef.current) {
      const rect = filterBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    onFilterToggle?.();
  }

  return (
    <div className="col-header">
      {onSort ? (
        <button
          className={`col-sort-btn ${sortDir ? 'col-sort-active' : ''}`}
          onClick={onSort}
        >
          {label}
          {sortDir === 'asc' && <span className="col-sort-icon">↑</span>}
          {sortDir === 'desc' && <span className="col-sort-icon">↓</span>}
        </button>
      ) : (
        <span className="col-label">{label}</span>
      )}
      {filterable && (
        <button
          ref={filterBtnRef}
          className={`col-filter-btn ${filterActive ? 'col-filter-btn-on' : ''}`}
          onClick={handleFilterClick}
          title={filterActive ? `${label}: filter on` : `Filter ${label}`}
        >
          {filterActive ? '●' : '▾'}
        </button>
      )}
      {filterOpen &&
        filterContent &&
        createPortal(
          <>
            <div className="col-filter-overlay" onClick={() => onFilterToggle?.()} />
            <div
              className="col-filter-dropdown"
              style={{ top: dropdownPos.top, left: dropdownPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              {filterContent}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

// ─── Filter sub-components ────────────────────────────────────────────────────

export function TextFilter({
  value,
  onChange,
  placeholder = 'Contains…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="col-filter-text">
      <input
        autoFocus
        className="col-filter-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button className="col-filter-clear" onClick={() => onChange('')}>
          ×
        </button>
      )}
    </div>
  );
}

export function ToggleFilter({
  value,
  onChange,
  yesLabel = 'Yes',
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  yesLabel?: string;
}) {
  return (
    <div className="col-filter-toggle">
      {([null, true] as const).map((v) => (
        <button
          key={String(v)}
          className={`col-filter-pill ${value === v ? 'col-filter-pill-on' : ''}`}
          onClick={() => onChange(v)}
        >
          {v === null ? 'Any' : yesLabel}
        </button>
      ))}
    </div>
  );
}

export function PresetFilter({
  value,
  onChange,
  options,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Array<{ value: string | null; label: string }>;
}) {
  return (
    <div className="col-filter-presets">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={`col-filter-preset ${value === opt.value ? 'col-filter-preset-on' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function MultiSelectFilter({
  options,
  selected,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  }

  return (
    <div className="col-filter-multiselect">
      {selected.length > 0 && (
        <button className="col-filter-clear-all" onClick={() => onChange([])}>
          Clear all
        </button>
      )}
      {options.map((opt) => (
        <label key={opt.value} className="col-filter-option">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          {opt.label || '—'}
        </label>
      ))}
    </div>
  );
}
