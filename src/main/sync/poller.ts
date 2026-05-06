import { BrowserWindow } from 'electron';
import { getDatabase, isDatabaseOpen } from '../database';
import { openSharedDb, closeSharedDb } from '../database/shared-db';
import { syncProject } from './engine';
import { pollAllRss } from './rss-poller';
import { checkOutreachReminders } from './outreach-checker';

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let pollTimer: ReturnType<typeof setInterval> | null = null;

export interface SyncStatusEvent {
  projectId: string;
  success: boolean;
  lastSyncAt: number;
  pendingWrites: number;
  error?: string;
}

export function startPoller(): void {
  if (pollTimer) return;
  pollTimer = setInterval(pollAll, DEFAULT_INTERVAL_MS);
}

export function stopPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function pollAll(): void {
  if (!isDatabaseOpen()) return;

  const localDb = getDatabase();
  const projects = localDb
    .prepare(`SELECT id, shared_db_path, shared_db_key FROM projects WHERE is_shared = 1`)
    .all() as { id: string; shared_db_path: string | null; shared_db_key: Buffer | null }[];

  for (const project of projects) {
    if (!project.shared_db_path || !project.shared_db_key) continue;
    syncOne(project.id, project.shared_db_path, project.shared_db_key);
  }

  pollAllRss().catch(() => {});
  checkOutreachReminders();
}

export function syncOne(projectId: string, filePath: string, keyBytes: Buffer): SyncStatusEvent {
  const localDb = getDatabase();
  const keyHex = keyBytes.toString('hex');
  const now = Math.floor(Date.now() / 1000);

  let result: SyncStatusEvent;

  try {
    const sharedDb = openSharedDb(filePath, keyHex, projectId);
    const syncResult = syncProject(localDb, sharedDb, projectId);

    const project = localDb
      .prepare('SELECT shared_pending_writes FROM projects WHERE id = ?')
      .get(projectId) as { shared_pending_writes: number } | undefined;

    result = {
      projectId,
      success: syncResult.success,
      lastSyncAt: now,
      pendingWrites: project?.shared_pending_writes ?? 0,
      error: syncResult.error,
    };
  } catch (err) {
    try {
      localDb
        .prepare('UPDATE projects SET shared_pending_writes = 1 WHERE id = ?')
        .run(projectId);
    } catch {
      // ignore
    }
    // Close cached connection so next attempt re-opens fresh
    closeSharedDb(projectId);

    result = {
      projectId,
      success: false,
      lastSyncAt: now,
      pendingWrites: 1,
      error: String(err),
    };
  }

  emitSyncStatus(result);
  return result;
}

function emitSyncStatus(event: SyncStatusEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:status', event);
  }
}
