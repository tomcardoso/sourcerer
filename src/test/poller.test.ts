import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from './vitest.setup';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '') },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  Notification: vi.fn(function (this: { show: ReturnType<typeof vi.fn> }) {
    this.show = vi.fn();
  }),
}));

vi.mock('../main/database', () => ({
  getDatabase: () => {
    throw new Error('not used by deleteConflictCopies tests');
  },
  isDatabaseOpen: () => false,
}));

import { deleteConflictCopies } from '../main/sync/poller';

// ---------------------------------------------------------------------------
// deleteConflictCopies (#436)
// ---------------------------------------------------------------------------

describe('deleteConflictCopies', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function insertPushedRow(db: ReturnType<typeof createTestDb>, projectId: string): void {
    db.prepare(
      'INSERT INTO sync_pushed (project_id, table_name, row_id, pushed_at) VALUES (?, ?, ?, ?)',
    ).run(projectId, 'contacts', uuidv4(), Math.floor(Date.now() / 1000));
  }

  it('clears sync_pushed for the project and deletes the conflict copy when one is found', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sourcerer-conflict-'));
    const filePath = join(dir, 'shared.db');
    const conflictPath = join(dir, 'shared (conflicted copy).db');
    writeFileSync(filePath, 'main');
    writeFileSync(conflictPath, 'conflict');

    const testDb = createTestDb();
    const projectId = uuidv4();
    const otherProjectId = uuidv4();
    insertPushedRow(testDb, projectId);
    insertPushedRow(testDb, otherProjectId);

    await deleteConflictCopies(testDb, projectId, filePath);

    expect(existsSync(conflictPath)).toBe(false);
    expect(existsSync(filePath)).toBe(true);

    const remaining = testDb.prepare('SELECT project_id FROM sync_pushed').all() as { project_id: string }[];
    expect(remaining.map((r) => r.project_id)).toEqual([otherProjectId]);
  });

  it('leaves sync_pushed untouched when no conflict copy is present', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sourcerer-conflict-'));
    const filePath = join(dir, 'shared.db');
    writeFileSync(filePath, 'main');

    const testDb = createTestDb();
    const projectId = uuidv4();
    insertPushedRow(testDb, projectId);

    await deleteConflictCopies(testDb, projectId, filePath);

    const remaining = testDb.prepare('SELECT project_id FROM sync_pushed').all() as { project_id: string }[];
    expect(remaining).toHaveLength(1);
  });
});
