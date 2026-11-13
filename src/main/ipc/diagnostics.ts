import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { gatherReport, renderReport, reportFileName } from '../diagnostics/report';
import type { DiagnosticsReport, SaveDiagnosticsResult } from '@shared/types';

// The text last shown to the person. Saving writes exactly this, so what is
// saved is always what they read — the renderer never supplies the content.
let shownReport: string | null = null;
// Set when the menu item is chosen with no window open (macOS keeps the app
// and its menu running after the last window closes). The new window's
// renderer takes it on mount via diagnostics:take-pending.
let pendingOpen = false;

/** Help > Export Diagnostics Report… — works on the lock screen and when unlocked.
 *  `createWindow` opens a window when none is open. */
export function openDiagnosticsDialog(createWindow: () => void): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('diagnostics:open');
    return;
  }
  pendingOpen = true;
  createWindow();
}

export function registerDiagnosticsHandlers(): void {
  ipcMain.handle('diagnostics:take-pending', (): boolean => {
    const pending = pendingOpen;
    pendingOpen = false;
    return pending;
  });

  ipcMain.handle('diagnostics:build', async (): Promise<DiagnosticsReport> => {
    shownReport = renderReport(await gatherReport());
    return { text: shownReport };
  });

  ipcMain.handle('diagnostics:save', async (event): Promise<SaveDiagnosticsResult> => {
    if (shownReport === null) return { saved: false, error: 'Build the report before saving it.' };
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Save diagnostics report',
      defaultPath: path.join(app.getPath('downloads'), reportFileName()),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (canceled || !filePath) return { saved: false };
    try {
      await fs.writeFile(filePath, shownReport, 'utf8');
      return { saved: true };
    } catch {
      return { saved: false, error: 'The report could not be saved there. Try another folder.' };
    }
  });
}
