import { useState } from 'react';
import type { SortDir } from '../views/ContactsTable';

export function useSortFilter<K extends string, F>(defaultFilters: F) {
  const [sort, setSort] = useState<{ key: K | null; dir: SortDir }>({ key: null, dir: 'asc' });
  const [filters, setFilters] = useState<F>(defaultFilters);

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

  function resetAll() {
    setSort({ key: null, dir: 'asc' });
    setFilters(defaultFilters);
  }

  return { sort, filters, setFilter, handleSort, resetAll };
}
