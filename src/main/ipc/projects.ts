import { ipcMain, dialog, BrowserWindow } from 'electron';
import { randomBytes } from 'crypto';
import { unlinkSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database';
import { createSharedDb, openSharedDb, closeSharedDb, rekeySharedDb } from '../database/shared-db';
import { encodePayload, decodePayload } from '../sync/payload';
import { syncProject } from '../sync/engine';
import { broadcastRemindersChanged } from './reminders';
import type { Project, User, TimelineEntry, TimelineEntryProject } from '@shared/types';

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
        defaultPath: `${name.trim().replace(/[^a-z0-9]/gi, '-').toLowerCase()}.sourcerer`,
        filters: [{ name: 'Sourcerer Shared Project', extensions: ['sourcerer'] }],
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

      // True cross-DB atomicity is not possible with two separate SQLite files.
      // To minimise inconsistency we write to the shared DB first (harder to undo)
      // and to the local DB second.  If the local write fails we attempt a
      // compensating delete on the shared DB and re-throw (fixes #176).

      // 2. Create the shared DB file and write project metadata.
      // Guard shared-DB creation separately so a failure here also cleans up.
      let sharedDb: ReturnType<typeof createSharedDb>;
      try {
        sharedDb = createSharedDb(filePath, keyHex, id);
        sharedDb.prepare('INSERT INTO project_meta (name, description) VALUES (?, ?)').run(
          trimmedName,
          trimmedDesc,
        );
      } catch (sharedErr) {
        try { closeSharedDb(id); } catch { /* ignore */ }
        try { unlinkSync(filePath); } catch { /* ignore */ }
        throw sharedErr;
      }

      // 3. Create the local project record + reporter row in a single transaction.
      try {
        db.transaction(() => {
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
        })();
      } catch (localErr) {
        // Best-effort compensating action: evict the shared DB connection and
        // remove both the in-file record and the on-disk file so no handle or
        // orphaned file is left behind.
        try { sharedDb.prepare('DELETE FROM project_meta').run(); } catch { /* ignore */ }
        try { closeSharedDb(id); } catch { /* ignore */ }
        try { unlinkSync(filePath); } catch { /* ignore */ }
        throw localErr;
      }

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

      db.transaction(() => {
        db.prepare(
          `INSERT INTO projects (id, name, description, is_shared, shared_db_path, shared_db_key, created_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)`,
        ).run(id, projectName, projectDesc, localPath, keyBytes, now);

        db.prepare(
          'INSERT INTO project_reporters (id, project_id, name, email, is_self) VALUES (?, ?, ?, ?, 1)',
        ).run(
          uuidv4(),
          id,
          `${user.first_name} ${user.last_name}`.trim(),
          user.email,
        );
      })();

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
    'projects:convertToShared',
    async (
      event,
      projectId: string,
    ): Promise<{ project: Project; payload: string } | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const db = getDatabase();

      const project = db
        .prepare('SELECT * FROM projects WHERE id = ?')
        .get(projectId) as Project | undefined;
      if (!project || project.is_shared === 1) return null;

      const saveResult = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        title: 'Save shared project file',
        defaultPath: `${project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.sourcerer`,
        filters: [{ name: 'Sourcerer Shared Project', extensions: ['sourcerer'] }],
      });
      if (saveResult.canceled || !saveResult.filePath) return null;

      const filePath = saveResult.filePath;
      const keyBytes = randomBytes(32);
      const keyHex = keyBytes.toString('hex');
      const user = db.prepare('SELECT * FROM users WHERE id = 1').get() as User;

      // True cross-DB atomicity is not possible with two separate SQLite files.
      // Write to the shared DB first (harder to undo), then update the local DB.
      // If the local write fails, attempt a compensating delete on the shared DB
      // and re-throw (fixes #176).

      // Create shared DB and write project metadata.
      // Guard shared-DB creation separately so a failure here also cleans up.
      let sharedDb: ReturnType<typeof createSharedDb>;
      try {
        sharedDb = createSharedDb(filePath, keyHex, projectId);
        sharedDb.prepare('INSERT INTO project_meta (name, description) VALUES (?, ?)').run(
          project.name,
          project.description,
        );
      } catch (sharedErr) {
        try { closeSharedDb(projectId); } catch { /* ignore */ }
        try { unlinkSync(filePath); } catch { /* ignore */ }
        throw sharedErr;
      }

      try {
        db.transaction(() => {
          // Add self as a reporter (local projects don't have this row yet)
          db.prepare(
            'INSERT OR IGNORE INTO project_reporters (id, project_id, name, email, is_self) VALUES (?, ?, ?, ?, 1)',
          ).run(
            uuidv4(),
            projectId,
            `${user.first_name} ${user.last_name}`.trim(),
            user.email,
          );

          // Upgrade local project record to shared
          db.prepare(
            'UPDATE projects SET is_shared = 1, shared_db_path = ?, shared_db_key = ? WHERE id = ?',
          ).run(filePath, keyBytes, projectId);

          // Reset synced_at so all existing contacts/memberships are treated as
          // unsynced and get pushed to the new shared file on the first sync.
          const memberContactIds = (db
            .prepare('SELECT contact_id FROM project_memberships WHERE project_id = ?')
            .all(projectId) as { contact_id: string }[])
            .map((r) => r.contact_id);
          if (memberContactIds.length > 0) {
            const ph = memberContactIds.map(() => '?').join(',');
            db.prepare(`UPDATE contacts SET synced_at = NULL WHERE id IN (${ph})`).run(...memberContactIds);
          }
          db.prepare('UPDATE project_memberships SET synced_at = NULL WHERE project_id = ?').run(projectId);
        })();
      } catch (localErr) {
        // Best-effort compensating action: evict the shared DB connection and
        // remove both the in-file record and the on-disk file so no handle or
        // orphaned file is left behind.
        try { sharedDb.prepare('DELETE FROM project_meta').run(); } catch { /* ignore */ }
        try { closeSharedDb(projectId); } catch { /* ignore */ }
        try { unlinkSync(filePath); } catch { /* ignore */ }
        throw localErr;
      }

      // Push all existing local data to the shared file
      try {
        syncProject(db, sharedDb, projectId);
      } catch {
        // Non-fatal — data will sync on next poll
      }

      const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project;
      const payload = encodePayload(project.name, project.description, filePath, keyBytes);
      return { project: updated, payload };
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
        defaultPath: `${project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.sourcerer`,
        filters: [{ name: 'Sourcerer Shared Project', extensions: ['sourcerer'] }],
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

      // Update local project record and reset synced_at atomically.
      db.transaction(() => {
        db.prepare(
          'UPDATE projects SET shared_db_path = ?, shared_db_key = ? WHERE id = ?',
        ).run(filePath, keyBytes, projectId);

        const memberContactIds = (db
          .prepare('SELECT contact_id FROM project_memberships WHERE project_id = ?')
          .all(projectId) as { contact_id: string }[])
          .map((r) => r.contact_id);
        if (memberContactIds.length > 0) {
          const ph = memberContactIds.map(() => '?').join(',');
          db.prepare(`UPDATE contacts SET synced_at = NULL WHERE id IN (${ph})`).run(...memberContactIds);
        }
        db.prepare('UPDATE project_memberships SET synced_at = NULL WHERE project_id = ?').run(projectId);
      })();

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
    'projects:rotateSharedKey',
    (_, projectId: string): { payload: string } | null => {
      const db = getDatabase();
      const project = db
        .prepare('SELECT * FROM projects WHERE id = ?')
        .get(projectId) as (Project & { shared_db_key: Buffer | null }) | undefined;
      if (!project || !project.shared_db_path || !project.shared_db_key) return null;

      const oldKeyHex = project.shared_db_key.toString('hex');
      const newKeyBytes = randomBytes(32);
      const newKeyHex = newKeyBytes.toString('hex');

      // Rekey the shared file first; only update the local record after success.
      // This way a crash during rekey leaves local pointing at the still-valid
      // old key rather than a new key that doesn't match the file (fixes #178).
      rekeySharedDb(projectId, project.shared_db_path, oldKeyHex, newKeyHex);
      db.prepare('UPDATE projects SET shared_db_key = ? WHERE id = ?').run(newKeyBytes, projectId);

      const payload = encodePayload(
        project.name,
        project.description,
        project.shared_db_path,
        newKeyBytes,
      );
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

  ipcMain.handle(
    'projects:update',
    (_, { id, name, description }: { id: string; name: string; description: string | null }): Project => {
      const db = getDatabase();
      db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?')
        .run(name.trim(), description?.trim() || null, id);
      return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
    },
  );

  ipcMain.handle('projects:unshare', (_, id: string): Project => {
    closeSharedDb(id);
    const db = getDatabase();
    db.prepare(
      'UPDATE projects SET is_shared = 0, shared_db_path = NULL, shared_db_key = NULL, shared_pending_writes = 0 WHERE id = ?',
    ).run(id);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
  });

  ipcMain.handle('projects:archive', (_, id: string): void => {
    getDatabase().prepare('UPDATE projects SET is_archived = 1 WHERE id = ?').run(id);
    broadcastRemindersChanged();
  });

  ipcMain.handle('projects:unarchive', (_, id: string): void => {
    getDatabase().prepare('UPDATE projects SET is_archived = 0 WHERE id = ?').run(id);
    broadcastRemindersChanged();
  });

  ipcMain.handle('projects:delete', (_, id: string): void => {
    closeSharedDb(id);
    getDatabase().prepare('DELETE FROM projects WHERE id = ?').run(id);
  });

  ipcMain.handle('projects:list-reporters', (_, projectId: string): Array<{ email: string; name: string }> => {
    return getDatabase()
      .prepare('SELECT email, name FROM project_reporters WHERE project_id = ? ORDER BY is_self DESC, name ASC')
      .all(projectId) as Array<{ email: string; name: string }>;
  });

  ipcMain.handle('projects:list-timeline', (_, projectId: string): TimelineEntry[] => {
    const db = getDatabase();
    type BaseRow = Omit<TimelineEntry, 'projects'>;
    const entries = db.prepare(
      `SELECT ile.id, ile.body, ile.created_at, ile.reporter_name, ile.reporter_email,
              c.id AS contact_id, c.name AS contact_name, c.organization AS contact_organization
       FROM interaction_log_entries ile
       JOIN contacts c ON c.id = ile.contact_id
       JOIN interaction_projects ip ON ip.interaction_id = ile.id
       JOIN project_memberships pm ON pm.id = ip.membership_id
       WHERE pm.project_id = ?
       ORDER BY ile.created_at DESC`,
    ).all(projectId) as BaseRow[];
    return attachProjects(db, entries);
  });

  ipcMain.handle('contacts:list-timeline', (): TimelineEntry[] => {
    const db = getDatabase();
    type BaseRow = Omit<TimelineEntry, 'projects'>;
    const entries = db.prepare(
      `SELECT ile.id, ile.body, ile.created_at, ile.reporter_name, ile.reporter_email,
              c.id AS contact_id, c.name AS contact_name, c.organization AS contact_organization
       FROM interaction_log_entries ile
       JOIN contacts c ON c.id = ile.contact_id
       ORDER BY ile.created_at DESC`,
    ).all() as BaseRow[];
    return attachProjects(db, entries);
  });
}

function attachProjects(
  db: ReturnType<typeof getDatabase>,
  entries: Array<Omit<TimelineEntry, 'projects'>>,
): TimelineEntry[] {
  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.id);
  const ph = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT ip.interaction_id, p.id AS project_id, p.name AS project_name,
            ip.membership_id, pm.theme, pm.priority
     FROM interaction_projects ip
     JOIN project_memberships pm ON pm.id = ip.membership_id
     JOIN projects p ON p.id = pm.project_id
     WHERE ip.interaction_id IN (${ph})
     ORDER BY p.name ASC`,
  ).all(...ids) as Array<{ interaction_id: string } & TimelineEntryProject>;

  const projMap = new Map<string, TimelineEntryProject[]>();
  for (const r of rows) {
    const arr = projMap.get(r.interaction_id) ?? [];
    arr.push({ project_id: r.project_id, project_name: r.project_name, membership_id: r.membership_id, theme: r.theme, priority: r.priority });
    projMap.set(r.interaction_id, arr);
  }
  return entries.map((e) => ({ ...e, projects: projMap.get(e.id) ?? [] }));
}
