import { useCallback, useEffect, useRef, useState } from 'react';
import type { SortDir } from '../views/ContactsTable';

export type SortState<K extends string> = { key: K | null; dir: SortDir };

const stateCache = new Map<string, { sort: SortState<string>; filters: unknown }>();

export function useSortFilter<K extends string, F>(defaultFilters: F, cacheKey?: string) {
  const cached = cacheKey ? stateCache.get(cacheKey) : undefined;

  const [sort, setSort] = useState<SortState<K>>((cached?.sort as SortState<K>) ?? { key: null, dir: 'asc' });
  const [filters, setFilters] = useState<F>((cached?.filters as F) ?? defaultFilters);
  const defaultFiltersRef = useRef(defaultFilters);
  useEffect(() => { defaultFiltersRef.current = defaultFilters; }, [defaultFilters]);

  const cacheKeyRef = useRef(cacheKey);
  useEffect(() => {
    if (cacheKeyRef.current) stateCache.set(cacheKeyRef.current, { sort, filters });
  }, [sort, filters]);

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
    if (cacheKeyRef.current) stateCache.delete(cacheKeyRef.current);
  }, []);

  return { sort, filters, setFilter, handleSort, resetAll };
}
