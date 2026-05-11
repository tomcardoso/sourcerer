import { ipcMain } from 'electron';
import { getDatabase } from '../database';
import type { SearchResult } from '@shared/types';

export function registerSearchHandlers(): void {
  ipcMain.handle('search:global', (_e, query: string): SearchResult[] => {
    if (!query.trim()) return [];
    const db = getDatabase();
    const escaped = query.trim().replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escaped}%`;

    const contacts = db
      .prepare(
        `SELECT DISTINCT c.id, c.name, c.organization
         FROM contacts c
         LEFT JOIN contact_emails ce ON ce.contact_id = c.id
         LEFT JOIN contact_phones cp ON cp.contact_id = c.id
         WHERE c.name LIKE ? ESCAPE '\\' OR c.organization LIKE ? ESCAPE '\\' OR c.notes LIKE ? ESCAPE '\\'
            OR ce.email LIKE ? ESCAPE '\\' OR cp.phone LIKE ? ESCAPE '\\'
         ORDER BY c.name COLLATE NOCASE
         LIMIT 15`,
      )
      .all(pattern, pattern, pattern, pattern, pattern) as Array<{
      id: string;
      name: string;
      organization: string | null;
    }>;

    const projects = db
      .prepare(
        `SELECT id, name FROM projects WHERE name LIKE ? ESCAPE '\\'
         ORDER BY name COLLATE NOCASE LIMIT 5`,
      )
      .all(pattern) as Array<{ id: string; name: string }>;

    const results: SearchResult[] = [
      ...contacts.map((c) => ({
        type: 'contact' as const,
        id: c.id,
        name: c.name,
        subtitle: c.organization,
      })),
      ...projects.map((p) => ({
        type: 'project' as const,
        id: p.id,
        name: p.name,
        subtitle: null,
      })),
    ];

    return results;
  });
}
