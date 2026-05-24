import { ipcMain } from 'electron';
import Database from 'better-sqlite3-multiple-ciphers';
import { getDatabase } from '../database';
import type { SearchResult } from '@shared/types';

export function performSearch(query: string, db: Database.Database): SearchResult[] {
  if (!query.trim()) return [];
  const escaped = query.trim().replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  const contacts = db
    .prepare(
      `SELECT DISTINCT c.id, c.name, c.organization
       FROM contacts c
       LEFT JOIN contact_emails ce ON ce.contact_id = c.id
       LEFT JOIN contact_phones cp ON cp.contact_id = c.id
       WHERE c.name LIKE ? ESCAPE '\\' OR c.organization LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\'
          OR c.notes LIKE ? ESCAPE '\\' OR ce.email LIKE ? ESCAPE '\\' OR cp.phone LIKE ? ESCAPE '\\'
       ORDER BY c.name COLLATE NOCASE
       LIMIT 15`,
    )
    .all(pattern, pattern, pattern, pattern, pattern, pattern) as Array<{
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

  // Quote each whitespace-delimited token so FTS operators/punctuation in user
  // input are treated as literals, then append * for prefix matching.
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"*`)
    .join(' ');

  let logResults: Array<{
    entry_id: string;
    contact_id: string;
    contact_name: string;
    project_name: string;
    excerpt: string;
  }> = [];
  try {
    logResults = db
      .prepare(
        `SELECT e.id AS entry_id, c.id AS contact_id, c.name AS contact_name,
                (SELECT p.name FROM interaction_projects ip
                 JOIN project_memberships pm ON pm.id = ip.membership_id
                 JOIN projects p ON p.id = pm.project_id
                 WHERE ip.interaction_id = e.id
                 LIMIT 1) AS project_name,
                snippet(interaction_log_fts, 0, '[[', ']]', '...', 20) AS excerpt
         FROM interaction_log_fts fts
         JOIN interaction_log_entries e ON e.rowid = fts.rowid
         JOIN contacts c ON c.id = e.contact_id
         WHERE fts.body MATCH ?
         ORDER BY fts.rank, e.created_at DESC
         LIMIT 5`,
      )
      .all(ftsQuery) as typeof logResults;
  } catch (e) {
    // Only swallow FTS query syntax errors; rethrow anything else
    // (e.g. table corruption whose message might also contain "fts5:").
    if (e instanceof Error && /fts5: syntax error/i.test(e.message)) {
      // fall back to the LIKE results already computed above
    } else {
      throw e;
    }
  }

  return [
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
    ...logResults.map((l) => ({
      type: 'log' as const,
      id: l.entry_id,
      name: l.contact_name,
      subtitle: l.project_name,
      excerpt: l.excerpt,
      contactId: l.contact_id,
    })),
  ];
}

export function registerSearchHandlers(): void {
  ipcMain.handle('search:global', (_e, query: string): SearchResult[] =>
    performSearch(query, getDatabase()),
  );
}
