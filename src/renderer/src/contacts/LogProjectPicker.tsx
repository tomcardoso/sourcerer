import { useRef, useState } from 'react';
import type { ContactProject } from '@shared/types';
import { useClickOutside } from '../hooks/useClickOutside';
import { useListboxKeyboard } from '../hooks/useListboxKeyboard';
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

  const selected = projects.filter((p) => selectedIds.includes(p.membership_id));
  const available = projects.filter(
    (p) => !selectedIds.includes(p.membership_id) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );

  function add(mid: string) {
    onChange([...selectedIds, mid]);
    setQuery('');
    listbox.resetActiveIndex();
  }

  function remove(mid: string) {
    onChange(selectedIds.filter((id) => id !== mid));
  }

  const listbox = useListboxKeyboard({
    isOpen: open,
    optionCount: available.length,
    onSelect: (i) => add(available[i].membership_id),
    onClose: () => { setOpen(false); setQuery(''); },
    onOpen: () => setOpen(true),
  });

  useClickOutside(containerRef, () => { setOpen(false); setQuery(''); }, { isOpen: open, escapeKey: false });

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
                aria-label={`Remove ${p.name}`}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); remove(p.membership_id); }}
              >×</button>
            )}
          </span>
        ))}
        <input
          className="lpp-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listbox.listboxId}
          aria-activedescendant={listbox.activeIndex >= 0 ? listbox.getOptionId(listbox.activeIndex) : undefined}
          placeholder={selected.length === 0 ? 'Add projects…' : ''}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && query === '' && selected.length > 0) {
              e.preventDefault();
              remove(selected[selected.length - 1].membership_id);
              return;
            }
            listbox.handleInputKeyDown(e);
          }}
        />
      </div>
      {open && available.length > 0 && (
        <div id={listbox.listboxId} className="lpp-dropdown" role="listbox">
          {available.map((p, i) => (
            <div
              key={p.membership_id}
              id={listbox.getOptionId(i)}
              role="option"
              aria-selected={listbox.activeIndex === i}
              className={`lpp-option${listbox.activeIndex === i ? ' lpp-option--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); add(p.membership_id); }}
              onMouseEnter={() => listbox.setActiveIndex(i)}
            >
              {p.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
