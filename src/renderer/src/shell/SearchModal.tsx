import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '@shared/types';
import type { NavTarget } from './AppShell';
import './SearchModal.css';

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
  const latestQueryRef = useRef('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSelectedIndex(0);
    latestQueryRef.current = query;
    if (!query.trim()) { setResults([]); return () => { cancelled = true; }; }
    window.sourcerer.searchGlobal(query).then((r) => {
      if (!cancelled && latestQueryRef.current === query) setResults(r);
    });
    return () => { cancelled = true; };
  }, [query]);

  function pick(result: SearchResult) {
    if (result.type === 'contact') {
      onOpenContact(result.id);
    } else if (result.type === 'project') {
      onNav({ view: 'project', projectId: result.id });
    } else {
      onOpenContact(result.contactId);
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
  const logs = results.filter((r) => r.type === 'log');

  return (
    <div className="search-overlay" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Search" className="search-card" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <input
            ref={inputRef}
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts and projects…"
            aria-label="Search contacts and projects"
          />
        </div>

        {results.length > 0 && (
          <div className="search-results">
            {contacts.length > 0 && (
              <>
                <div className="search-section-label">Contacts</div>
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
                <div className="search-section-label">Projects</div>
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
            {logs.length > 0 && (
              <>
                <div className="search-section-label">Log entries</div>
                {logs.map((r) => {
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
          <div className="search-empty">No results for "{query}"</div>
        )}

        {query.trim() === '' && (
          <div className="search-empty">Type to search contacts, projects and log entries</div>
        )}

        <div className="search-footer">
          <span className="search-hint">↑↓ navigate</span>
          <span className="search-hint">↵ open</span>
          <span className="search-hint">Esc close</span>
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
  const excerpt = result.type === 'log' ? result.excerpt.replace(/\[\[/g, '').replace(/\]\]/g, '') : null;

  return (
    <button
      type="button"
      className={`search-result-row${selected ? ' search-result-row--selected' : ''}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className="search-result-icon">
        {result.type === 'contact' ? '◎' : result.type === 'project' ? '◈' : '◷'}
      </span>
      <span className="search-result-body">
        <span className="search-result-name">{result.name}</span>
        {result.subtitle && (
          <span className="search-result-subtitle">{result.subtitle}</span>
        )}
        {excerpt && (
          <span className="search-result-excerpt">{excerpt}</span>
        )}
      </span>
    </button>
  );
}
