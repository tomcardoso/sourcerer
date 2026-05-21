import { useRef, useState } from 'react';
import type { ContactProject } from '@shared/types';
import { useClickOutside } from '../hooks/useClickOutside';
import './LogProjectPicker.css';

interface Props {
  projects: ContactProject[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  lockedIds?: string[];
}

export default function LogProjectPicker({ projects, selectedIds, onChange, lockedIds = [] }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => { setOpen(false); setQuery(''); }, { isOpen: open, escapeKey: false });

  const selected = projects.filter((p) => selectedIds.includes(p.membership_id));
  const available = projects.filter(
    (p) => !selectedIds.includes(p.membership_id) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );

  function add(mid: string) {
    onChange([...selectedIds, mid]);
    setQuery('');
  }

  function remove(mid: string) {
    onChange(selectedIds.filter((id) => id !== mid));
  }

  return (
    <div className="lpp-root" ref={containerRef}>
      <div className="lpp-field" onClick={() => setOpen(true)}>
        {selected.map((p) => (
          <span key={p.membership_id} className="lpp-tag">
            {p.name}
            {!lockedIds.includes(p.membership_id) && (
              <button
                type="button"
                className="lpp-tag-remove"
                onMouseDown={(e) => { e.stopPropagation(); remove(p.membership_id); }}
              >×</button>
            )}
          </span>
        ))}
        <input
          className="lpp-input"
          placeholder={selected.length === 0 ? 'Add projects…' : ''}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && available.length > 0 && (
        <div className="lpp-dropdown">
          {available.map((p) => (
            <div
              key={p.membership_id}
              className="lpp-option"
              onMouseDown={(e) => { e.preventDefault(); add(p.membership_id); }}
            >
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
