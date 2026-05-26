import { useCallback, useEffect, useRef, useState } from 'react';
import type { SortDir } from '../views/ContactsTable';

export type SortState<K extends string> = { key: K | null; dir: SortDir };

export function useSortFilter<K extends string, F>(defaultFilters: F) {
  const [sort, setSort] = useState<{ key: K | null; dir: SortDir }>({ key: null, dir: 'asc' });
  const [filters, setFilters] = useState<F>(defaultFilters);
  const defaultFiltersRef = useRef(defaultFilters);
  useEffect(() => { defaultFiltersRef.current = defaultFilters; }, [defaultFilters]);

  function setFilter(key: string, value: unknown) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleSort(key: string) {
    setSort((prev) => {
      if (prev.key === key) {
        if (prev.dir === 'asc') return { key: key as K, dir: 'desc' };
        return { key: null, dir: 'asc' };
      }
      return { key: key as K, dir: 'asc' };
    });
  }

  const resetAll = useCallback(() => {
    setSort({ key: null, dir: 'asc' });
    setFilters(defaultFiltersRef.current);
  }, []);

  return { sort, filters, setFilter, handleSort, resetAll };
}
