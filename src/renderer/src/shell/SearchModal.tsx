import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '@shared/types';
import type { NavTarget } from './AppShell';

interface Props {
  onClose: () => void;
  onNav: (nav: NavTarget) => void;
  onOpenContact: (id: string) => void;
}

export default function SearchModal({ onClose, onNav, onOpenContact }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
    if (!query.trim()) { setResults([]); return; }
    window.sourcerer.searchGlobal(query).then(setResults);
  }, [query]);

  function pick(result: SearchResult) {
    if (result.type === 'contact') {
      onNav({ view: 'all-contacts' });
      onOpenContact(result.id);
    } else {
      onNav({ view: 'project', projectId: result.id });
    }
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[selectedIndex]);
    }
  }

  const contacts = results.filter((r) => r.type === 'contact');
  const projects = results.filter((r) => r.type === 'project');

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '18vh', zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          width: 480,
          maxHeight: 440,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts and projects…"
            style={{
              width: '100%', background: 'none', border: 'none', outline: 'none',
              fontSize: 15, color: 'var(--color-text)',
            }}
          />
        </div>

        {results.length > 0 && (
          <div ref={listRef} style={{ overflowY: 'auto', padding: '6px 0' }}>
            {contacts.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', padding: '4px 14px 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Contacts
                </div>
                {contacts.map((r) => {
                  const idx = results.indexOf(r);
                  return (
                    <ResultRow
                      key={r.id}
                      result={r}
                      selected={idx === selectedIndex}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => pick(r)}
                    />
                  );
                })}
              </>
            )}
            {projects.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', padding: '8px 14px 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Projects
                </div>
                {projects.map((r) => {
                  const idx = results.indexOf(r);
                  return (
                    <ResultRow
                      key={r.id}
                      result={r}
                      selected={idx === selectedIndex}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => pick(r)}
                    />
                  );
                })}
              </>
            )}
          </div>
        )}

        {query.trim() !== '' && results.length === 0 && (
          <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
            No results for "{query}"
          </div>
        )}

        {query.trim() === '' && (
          <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Type to search contacts and projects
          </div>
        )}

        <div style={{ padding: '6px 14px', borderTop: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', gap: 12 }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ result, selected, onMouseEnter, onClick }: {
  result: SearchResult;
  selected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
        background: selected ? 'var(--color-hover)' : 'none',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', width: 14, flexShrink: 0 }}>
        {result.type === 'contact' ? '◎' : '◈'}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{result.name}</span>
      {result.subtitle && (
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{result.subtitle}</span>
      )}
    </div>
  );
}
