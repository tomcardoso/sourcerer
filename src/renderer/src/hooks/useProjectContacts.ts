import { useMemo } from 'react';
import type { ProjectContactRow, StatusOption, PriorityOption } from '@shared/types';
import type { ProjectFilters as Filters } from '../views/ContactsTable';
import { buildOrderMap } from '../views/ContactsTable';
import type { SortState } from './useSortFilter';

type SortKey =
  | 'name'
  | 'organization'
  | 'theme'
  | 'status'
  | 'priority'
  | 'reporter'
  | 'date_first_contacted'
  | 'date_last_contacted'
  | 'membership_created_at';

export function useProjectContacts(
  rows: ProjectContactRow[],
  filters: Filters,
  sort: SortState<SortKey>,
  statusOptions: StatusOption[],
  priorityOptions: PriorityOption[],
): ProjectContactRow[] {
  return useMemo(() => {
    const statusOrderMap = buildOrderMap(statusOptions);
    const priorityOrderMap = buildOrderMap(priorityOptions);
    const now = Math.floor(Date.now() / 1000);
    let result = rows;

    if (filters.name) {
      const q = filters.name.toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (filters.organization) {
      const q = filters.organization.toLowerCase();
      result = result.filter((r) => (r.organization ?? '').toLowerCase().includes(q));
    }
    if (filters.theme) {
      const q = filters.theme.toLowerCase();
      result = result.filter((r) => (r.theme ?? '').toLowerCase().includes(q));
    }
    if (filters.notes) {
      const q = filters.notes.toLowerCase();
      result = result.filter((r) => (r.notes ?? '').toLowerCase().includes(q));
    }
    if (filters.email) {
      const q = filters.email.toLowerCase();
      result = result.filter((r) => (r.emails_raw ?? '').toLowerCase().includes(q));
    }
    if (filters.phone) {
      const q = filters.phone.toLowerCase();
      result = result.filter((r) => (r.phones_raw ?? '').toLowerCase().includes(q));
    }
    if (filters.hasEmail !== null) {
      result = result.filter((r) => (filters.hasEmail ? r.has_email === 1 : r.has_email === 0));
    }
    if (filters.hasPhone !== null) {
      result = result.filter((r) => (filters.hasPhone ? r.has_phone === 1 : r.has_phone === 0));
    }
    if (filters.dateLastContacted === 'never') {
      result = result.filter((r) => r.date_last_contacted === null);
    } else if (filters.dateLastContacted === 'contacted') {
      result = result.filter((r) => r.date_last_contacted !== null);
    } else if (filters.dateLastContacted === 'not_30') {
      result = result.filter(
        (r) => r.date_last_contacted === null || r.date_last_contacted < now - 30 * 86400,
      );
    } else if (filters.dateLastContacted === 'not_90') {
      result = result.filter(
        (r) => r.date_last_contacted === null || r.date_last_contacted < now - 90 * 86400,
      );
    }
    if (filters.dateAddedFrom) {
      const from = Math.floor(new Date(filters.dateAddedFrom).getTime() / 1000);
      result = result.filter((r) => r.membership_created_at >= from);
    }
    if (filters.dateAddedTo) {
      const to = Math.floor(new Date(filters.dateAddedTo).getTime() / 1000) + 86399;
      result = result.filter((r) => r.membership_created_at <= to);
    }
    if (filters.status.length > 0) {
      result = result.filter((r) => filters.status.includes(r.status ?? ''));
    }
    if (filters.priority.length > 0) {
      result = result.filter((r) => filters.priority.includes(r.priority ?? ''));
    }
    if (filters.reporter.length > 0) {
      result = result.filter((r) => filters.reporter.includes(r.reporter_name));
    }
    if (filters.tags.length > 0) {
      result = result.filter((r) => filters.tags.some((t) => r.tags.includes(t)));
    }

    if (sort.key) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sort.key === 'name') {
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        } else if (sort.key === 'organization') {
          cmp = (a.organization ?? '').localeCompare(b.organization ?? '', undefined, {
            sensitivity: 'base',
          });
        } else if (sort.key === 'theme') {
          cmp = (a.theme ?? '').localeCompare(b.theme ?? '', undefined, { sensitivity: 'base' });
        } else if (sort.key === 'status') {
          const si = (s: string | null) => statusOrderMap.get(s ?? '') ?? 9999;
          cmp = si(a.status) - si(b.status);
        } else if (sort.key === 'priority') {
          const pi = (p: string | null) => priorityOrderMap.get(p ?? '') ?? 9999;
          cmp = pi(a.priority) - pi(b.priority);
        } else if (sort.key === 'reporter') {
          cmp = a.reporter_name.localeCompare(b.reporter_name, undefined, { sensitivity: 'base' });
        } else if (sort.key === 'date_first_contacted') {
          if (a.date_first_contacted === null && b.date_first_contacted === null) cmp = 0;
          else if (a.date_first_contacted === null) cmp = 1;
          else if (b.date_first_contacted === null) cmp = -1;
          else cmp = a.date_first_contacted - b.date_first_contacted;
        } else if (sort.key === 'date_last_contacted') {
          if (a.date_last_contacted === null && b.date_last_contacted === null) cmp = 0;
          else if (a.date_last_contacted === null) cmp = 1;
          else if (b.date_last_contacted === null) cmp = -1;
          else cmp = a.date_last_contacted - b.date_last_contacted;
        } else if (sort.key === 'membership_created_at') {
          cmp = a.membership_created_at - b.membership_created_at;
        }
        return cmp * dir;
      });
    }

    return result;
  }, [rows, filters, sort, statusOptions, priorityOptions]);
}
