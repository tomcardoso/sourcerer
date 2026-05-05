import { ipcMain, dialog, BrowserWindow } from 'electron';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import { createSharedDb, openSharedDb, closeSharedDb } from '../database/shared-db';
import { encodePayload, decodePayload } from '../sync/payload';
import { syncProject } from '../sync/engine';
import type { Project, User } from '@shared/types';

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
    'projects:createShared',
    async (
      event,
      { name, description }: { name: string; description?: string },
    ): Promise<{ project: Project; payload: string } | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);

      // 1. Pick where to save the shared DB file
      const saveResult = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        title: 'Save shared project file',
        defaultPath: `${name.trim().replace(/[^a-z0-9]/gi, '-').toLowerCase()}-sourcerer.db`,
        filters: [{ name: 'Sourcerer Shared Project', extensions: ['db'] }],
      });
      if (saveResult.canceled || !saveResult.filePath) return null;

      const filePath = saveResult.filePath;
      const keyBytes = randomBytes(32);
      const keyHex = keyBytes.toString('hex');

      const db = getDatabase();
      const user = db.prepare('SELECT * FROM users WHERE id = 1').get() as User;
      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      const trimmedName = name.trim();
      const trimmedDesc = description?.trim() || null;

      // 2. Create the shared DB file and write project metadata
      const sharedDb = createSharedDb(filePath, keyHex, id);
      sharedDb.prepare('INSERT INTO project_meta (name, description) VALUES (?, ?)').run(
        trimmedName,
        trimmedDesc,
      );

      // 3. Create the local project record
      db.prepare(
        `INSERT INTO projects (id, name, description, is_shared, shared_db_path, shared_db_key, created_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
      ).run(id, trimmedName, trimmedDesc, filePath, keyBytes, now);

      // 4. Add self to project_reporters
      db.prepare(
        'INSERT INTO project_reporters (id, project_id, name, email, is_self) VALUES (?, ?, ?, ?, 1)',
      ).run(
        uuidv4(),
        id,
        `${user.first_name} ${user.last_name}`.trim(),
        user.email,
      );

      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
      const payload = encodePayload(trimmedName, trimmedDesc, filePath, keyBytes);

      return { project, payload };
    },
  );

  ipcMain.handle(
    'projects:joinShared',
    async (
      _event,
      { encodedPayload, localPath }: { encodedPayload: string; localPath: string },
    ): Promise<Project | null> => {
      const decoded = decodePayload(encodedPayload);
      const { keyHex } = decoded;
      const keyBytes = Buffer.from(keyHex, 'hex');

      const db = getDatabase();
      const user = db.prepare('SELECT * FROM users WHERE id = 1').get() as User;

      // Check if already joined (same key)
      const existing = db
        .prepare('SELECT id FROM projects WHERE shared_db_key = ?')
        .get(keyBytes) as { id: string } | undefined;
      if (existing) {
        // Update path in case it moved, re-sync
        db.prepare('UPDATE projects SET shared_db_path = ? WHERE id = ?').run(
          localPath,
          existing.id,
        );
        return db.prepare('SELECT * FROM projects WHERE id = ?').get(existing.id) as Project;
      }

      // Open and validate the shared DB
      const id = uuidv4();
      const sharedDb = openSharedDb(localPath, keyHex, id);

      // Read project metadata from shared file
      const meta = sharedDb.prepare('SELECT name, description FROM project_meta LIMIT 1').get() as
        | { name: string; description: string | null }
        | undefined;

      const projectName = meta?.name ?? decoded.name ?? 'Shared Project';
      const projectDesc = meta?.description ?? decoded.description ?? null;
      const now = Math.floor(Date.now() / 1000);

      db.prepare(
        `INSERT INTO projects (id, name, description, is_shared, shared_db_path, shared_db_key, created_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
      ).run(id, projectName, projectDesc, localPath, keyBytes, now);

      // Add self to project_reporters
      db.prepare(
        'INSERT INTO project_reporters (id, project_id, name, email, is_self) VALUES (?, ?, ?, ?, 1)',
      ).run(
        uuidv4(),
        id,
        `${user.first_name} ${user.last_name}`.trim(),
        user.email,
      );

      // Initial pull from shared
      try {
        syncProject(db, sharedDb, id);
      } catch {
        // Non-fatal — project is created, sync will retry
      }

      return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
    },
  );

  ipcMain.handle(
    'projects:getSetupPayload',
    (_event, projectId: string): string | null => {
      const db = getDatabase();
      const project = db
        .prepare('SELECT name, description, shared_db_path, shared_db_key FROM projects WHERE id = ?')
        .get(projectId) as {
        name: string;
        description: string | null;
        shared_db_path: string | null;
        shared_db_key: Buffer | null;
      } | undefined;

      if (!project?.shared_db_path || !project.shared_db_key) return null;
      return encodePayload(
        project.name,
        project.description,
        project.shared_db_path,
        project.shared_db_key,
      );
    },
  );

  ipcMain.handle(
    'projects:relocateShared',
    (_, { projectId, newPath }: { projectId: string; newPath: string }): void => {
      const db = getDatabase();
      db.prepare('UPDATE projects SET shared_db_path = ? WHERE id = ?').run(newPath, projectId);

      // Close cached connection so it re-opens at new path
      closeSharedDb(projectId);
    },
  );

  ipcMain.handle(
    'projects:regenerateShared',
    async (
      event,
      projectId: string,
    ): Promise<{ payload: string } | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const db = getDatabase();

      const project = db
        .prepare('SELECT * FROM projects WHERE id = ?')
        .get(projectId) as Project | undefined;
      if (!project) return null;

      const saveResult = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        title: 'Save regenerated shared project file',
        defaultPath: `${project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-sourcerer.db`,
        filters: [{ name: 'Sourcerer Shared Project', extensions: ['db'] }],
      });
      if (saveResult.canceled || !saveResult.filePath) return null;

      const filePath = saveResult.filePath;
      const keyBytes = randomBytes(32);
      const keyHex = keyBytes.toString('hex');

      // Close old shared connection
      closeSharedDb(projectId);

      // Create new shared DB and write project metadata
      const sharedDb = createSharedDb(filePath, keyHex, projectId);
      sharedDb.prepare('INSERT INTO project_meta (name, description) VALUES (?, ?)').run(
        project.name,
        project.description,
      );

      // Update local project record with new path and key
      db.prepare(
        'UPDATE projects SET shared_db_path = ?, shared_db_key = ? WHERE id = ?',
      ).run(filePath, keyBytes, projectId);

      // Push all local project data to the fresh shared file
      try {
        syncProject(db, sharedDb, projectId);
      } catch {
        // Non-fatal
      }

      const payload = encodePayload(project.name, project.description, filePath, keyBytes);
      return { payload };
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
    closeSharedDb(id);
    getDatabase().prepare('DELETE FROM projects WHERE id = ?').run(id);
  });
}
