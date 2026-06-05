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
      const DROPDOWN_WIDTH = 200;
      const margin = 8;
      const left = Math.max(0, Math.min(rect.left, window.innerWidth - DROPDOWN_WIDTH - margin));
      setDropdownPos({ top: rect.bottom + 4, left });
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
          aria-label={filterActive ? `${label}: filter on` : `Filter ${label}`}
          aria-pressed={filterActive ?? false}
        >
          {filterActive ? '●' : '▾'}
        </button>
      )}
      {filterOpen &&
        filterContent &&
        createPortal(
          <>
            <div className="col-filter-overlay" aria-hidden="true" onClick={() => onFilterToggle?.()} />
            <div
              className="col-filter-dropdown"
              style={{ '--dropdown-top': `${dropdownPos.top}px`, '--dropdown-left': `${dropdownPos.left}px` } as React.CSSProperties}
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
        <button className="col-filter-clear" onClick={() => onChange('')} aria-label="Clear filter">
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

const MULTISELECT_SEARCH_THRESHOLD = 10;
const MULTISELECT_MAX_VISIBLE = 50;

export function MultiSelectFilter({
  options,
  selected,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState('');

  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  }

  const showSearch = options.length > MULTISELECT_SEARCH_THRESHOLD;
  const q = search.trim().toLowerCase();

  const selectedSet = new Set(selected);
  const filtered = (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options)
    .slice(0, MULTISELECT_MAX_VISIBLE);

  const checkedFirst = [
    ...filtered.filter((o) => selectedSet.has(o.value)),
    ...filtered.filter((o) => !selectedSet.has(o.value)),
  ];

  return (
    <div className="col-filter-multiselect">
      {selected.length > 0 && (
        <button className="col-filter-clear-all" onClick={() => onChange([])}>
          Clear all
        </button>
      )}
      {showSearch && (
        <div className="col-filter-search-wrap">
          <input
            className="col-filter-search"
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      )}
      {checkedFirst.map((opt) => (
        <label key={opt.value} className="col-filter-option">
          <input
            type="checkbox"
            checked={selectedSet.has(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          {opt.label || '—'}
        </label>
      ))}
    </div>
  );
}
