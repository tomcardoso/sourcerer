import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import type { Project } from '@shared/types';

export function registerProjectHandlers(): void {
  ipcMain.handle('projects:list', (): Project[] => {
    return getDatabase()
      .prepare('SELECT * FROM projects ORDER BY created_at ASC')
      .all() as Project[];
  });

  ipcMain.handle(
    'projects:create',
    (_, { name, description }: { name: string; description?: string }): Project => {
      const db = getDatabase();
      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        'INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      ).run(id, name.trim(), description?.trim() || null, now);
      return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
    },
  );

  ipcMain.handle(
    'projects:rename',
    (_, { id, name }: { id: string; name: string }): void => {
      getDatabase()
        .prepare('UPDATE projects SET name = ? WHERE id = ?')
        .run(name.trim(), id);
    },
  );

  ipcMain.handle('projects:delete', (_, id: string): void => {
    getDatabase().prepare('DELETE FROM projects WHERE id = ?').run(id);
  });
}
