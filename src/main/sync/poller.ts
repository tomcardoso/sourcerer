import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { getDatabase, isDatabaseOpen } from '../database';
import { openSharedDb, closeSharedDb } from '../database/shared-db';
import { syncProject } from './engine';
import { pollAllRss } from './rss-poller';
import { checkOutreachReminders } from './outreach-checker';
import { checkReminders } from './reminder-checker';

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let pollTimer: ReturnType<typeof setInterval> | null = null;
let rssPollIntervalMs = 6 * 60 * 60 * 1000; // default 6 hours
let lastRssPollAt = 0;
let isPolling = false;

export function setRssPollIntervalHours(hours: number): void {
  rssPollIntervalMs = Math.max(1, hours) * 60 * 60 * 1000;
}

export interface SyncStatusEvent {
  projectId: string;
  success: boolean;
  lastSyncAt: number;
  pendingWrites: number;
  error?: string;
}

export function startPoller(): void {
  if (pollTimer) return;
  // Load RSS interval from DB
  if (isDatabaseOpen()) {
    const row = getDatabase()
      .prepare('SELECT rss_poll_interval_hours FROM users WHERE id = 1')
      .get() as { rss_poll_interval_hours: number } | undefined;
    rssPollIntervalMs = Math.max(1, row?.rss_poll_interval_hours ?? 6) * 60 * 60 * 1000;
  }
  lastRssPollAt = 0; // ensure RSS runs on first tick
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
  if (isPolling) return;
  isPolling = true;

  let rssStarted = false;
  try {
    const localDb = getDatabase();
    const projects = localDb
      .prepare(`SELECT id, shared_db_path, shared_db_key FROM projects WHERE is_shared = 1`)
      .all() as { id: string; shared_db_path: string | null; shared_db_key: Buffer | null }[];

    for (const project of projects) {
      if (!project.shared_db_path || !project.shared_db_key) continue;
      syncOne(project.id, project.shared_db_path, project.shared_db_key);
    }

    checkOutreachReminders();
    checkReminders();

    const now = Date.now();
    if (now - lastRssPollAt >= rssPollIntervalMs) {
      lastRssPollAt = now;
      rssStarted = true;
      // Keep isPolling true until the async RSS fetch finishes so a slow fetch
      // cannot overlap with the next interval tick.
      pollAllRss().catch(() => {}).finally(() => { isPolling = false; });
    }
  } finally {
    if (!rssStarted) isPolling = false;
  }
}

export function syncOne(projectId: string, filePath: string, keyBytes: Buffer): SyncStatusEvent {
  const localDb = getDatabase();
  const keyHex = keyBytes.toString('hex');
  const now = Math.floor(Date.now() / 1000);

  let result: SyncStatusEvent;

  try {
    const sharedDb = openSharedDb(filePath, keyHex, projectId);
    const syncResult = syncProject(localDb, sharedDb, projectId);
    // Close after each sync so the file handle is released and Dropbox/OneDrive
    // can detect the change and upload it promptly.
    closeSharedDb(projectId);
    deleteConflictCopies(filePath).catch(() => {});

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

async function deleteConflictCopies(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (
        file !== path.basename(filePath) &&
        file.startsWith(base) &&
        file.endsWith(ext) &&
        /conflicted copy/i.test(file)
      ) {
        try { await fs.unlink(path.join(dir, file)); } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }
}

function emitSyncStatus(event: SyncStatusEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sync:status', event);
  }
}
