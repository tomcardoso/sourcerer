import { ipcMain, dialog, BrowserWindow } from 'electron';
import { getDatabase } from '../database';
import { syncOne, pollAll } from '../sync/poller';
import { decodePayload } from '../sync/payload';

export function registerSyncHandlers(): void {
  // Manually trigger a sync for a specific project
  ipcMain.handle('sync:trigger', (_, projectId: string) => {
    const localDb = getDatabase();
    const project = localDb
      .prepare('SELECT shared_db_path, shared_db_key FROM projects WHERE id = ?')
      .get(projectId) as { shared_db_path: string | null; shared_db_key: Buffer | null } | undefined;

    if (!project?.shared_db_path || !project.shared_db_key) {
      return { success: false, error: 'Project is not a shared project.' };
    }

    return syncOne(projectId, project.shared_db_path, project.shared_db_key);
  });

  // Trigger a sync for all shared projects
  ipcMain.handle('sync:poll-all', () => {
    pollAll();
  });

  // Show a file open dialog for the user to locate a shared DB file
  ipcMain.handle(
    'sync:open-file-dialog',
    async (event, options?: { defaultPath?: string }): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        title: 'Locate shared project file',
        defaultPath: options?.defaultPath,
        filters: [{ name: 'Sourcerer Shared Project', extensions: ['db'] }],
        properties: ['openFile'],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
  );

  // Decode a setup payload — lets the renderer show a preview before joining
  ipcMain.handle('sync:decode-payload', (_, encoded: string) => {
    try {
      const decoded = decodePayload(encoded);
      return { success: true, ...decoded };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
