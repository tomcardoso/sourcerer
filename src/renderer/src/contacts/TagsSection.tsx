import { useEffect, useRef, useState } from 'react';
import './TagsSection.css';

interface Props {
  contactId: string;
  tags: string[];
  onChanged: () => void;
}

export default function TagsSection({ contactId, tags, onChanged }: Props) {
  const [input, setInput] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.sourcerer.listAllContactTags().then(setAllTags);
  }, [contactId]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [dropdownOpen]);

  const trimmed = input.trim().toLowerCase();
  const suggestions = allTags
    .filter((t) => !tags.includes(t) && (trimmed === '' || t.includes(trimmed)))
    .slice(0, 10);

  async function addTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || normalized.length > 50 || tags.includes(normalized)) return;
    await window.sourcerer.addContactTag(contactId, normalized);
    setInput('');
    setDropdownOpen(false);
    setAllTags((prev) => prev.includes(normalized) ? prev : [...prev, normalized].sort());
    onChanged();
  }

  async function removeTag(tag: string) {
    await window.sourcerer.removeContactTag(contactId, tag);
    onChanged();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setDropdownOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (trimmed) addTag(trimmed);
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="detail-section">
      <div className="detail-section-label">Tags</div>
      <div className="tags-editor" ref={containerRef}>
        <div className="tags-chips">
          {tags.map((t) => (
            <span key={t} className="tags-chip">
              {t}
              <button
                className="tags-chip-remove"
                onClick={() => removeTag(t)}
                aria-label={`Remove tag ${t}`}
              >×</button>
            </span>
          ))}
          <input
            ref={inputRef}
            className="tags-input"
            value={input}
            placeholder={tags.length === 0 ? 'Add a tag…' : ''}
            onChange={(e) => {
              setInput(e.target.value.replace(',', ''));
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            onKeyDown={handleKeyDown}
            maxLength={50}
          />
        </div>
        {dropdownOpen && suggestions.length > 0 && (
          <ul className="tags-dropdown">
            {suggestions.map((t) => (
              <li key={t}>
                <button
                  className="tags-dropdown-item"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    addTag(t);
                  }}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
